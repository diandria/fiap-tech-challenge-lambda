import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CustomerLookup, HttpCustomerLookup } from './customerLookup';
import { JwtTokenIssuer } from './tokenIssuer';

/**
 * Emite o JWT de cliente a partir do CPF.
 *
 *   200  { token, expiresIn, customer: { id, name } }
 *   400  corpo ausente, malformado, ou cpf ausente/invalido
 *   401  cliente nao encontrado
 *   403  cliente inativo
 *   503  falha ao consultar a aplicacao
 *
 * O 401 para cliente nao encontrado e deliberado. Devolver 404 transformaria
 * o endpoint num oraculo de enumeracao: daria para descobrir quem e cliente da
 * oficina testando CPFs. O 401 generico fecha essa porta, e o corpo tambem nao
 * diz o motivo.
 */
export interface HandlerDeps {
  lookup: CustomerLookup;
  issuer: JwtTokenIssuer;
}

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Recebe as dependencias por parametro para que os testes componham sem tocar
 * em rede nem em variavel de ambiente.
 */
export function createHandler(deps: HandlerDeps) {
  return async function handler(
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyResultV2> {
    let cpf: unknown;

    // JSON.parse desprotegido derruba a function, e o API Gateway devolve 502.
    // 502 nao diz ao cliente que o problema e o corpo que ele mandou.
    try {
      cpf = (JSON.parse(event.body ?? '{}') as { cpf?: unknown }).cpf;
    } catch {
      return json(400, { error: 'invalid request body' });
    }

    if (typeof cpf !== 'string' || cpf.trim() === '') {
      return json(400, { error: 'cpf is required' });
    }

    const traceparent = event.headers?.traceparent;
    const result = await deps.lookup.byCpf(cpf.trim(), traceparent);

    // A uniao discriminada obriga a tratar os quatro casos: esquecer um seria
    // erro de compilacao, nao 500 em producao.
    switch (result.kind) {
      case 'invalid-cpf':
        return json(400, { error: 'invalid cpf' });

      case 'not-found':
        return json(401, { error: 'authentication failed' });

      case 'unavailable':
        return json(503, { error: 'service unavailable' });

      case 'found': {
        // Cliente inativo e recusado antes de assinar: emitir token para quem
        // nao pode usa-lo seria trabalho jogado fora, e um token valido
        // circulando sem necessidade.
        if (!result.customer.active) {
          return json(403, { error: 'customer is inactive' });
        }

        const { token, expiresIn } = deps.issuer.issue(
          { id: result.customer.id, name: result.customer.name },
          cpf,
        );

        return json(200, {
          token,
          expiresIn,
          customer: { id: result.customer.id, name: result.customer.name },
        });
      }
    }
  };
}

/** Construida sob demanda: ler variavel de ambiente no carregamento do modulo
 *  quebraria os testes, que compoem as dependencias na mao. */
let cached: ReturnType<typeof createHandler> | undefined;

function fromEnvironment(): ReturnType<typeof createHandler> {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`missing environment variable: ${name}`);
    return value;
  };

  return createHandler({
    lookup: new HttpCustomerLookup({
      baseUrl: required('APP_BASE_URL'),
      internalToken: required('INTERNAL_TOKEN'),
      timeoutMs: Number(process.env.LOOKUP_TIMEOUT_MS ?? 3000),
    }),
    issuer: new JwtTokenIssuer({
      secret: required('JWT_SECRET'),
      expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    }),
  });
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  cached ??= fromEnvironment();
  return cached(event);
}
