import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CustomerLookup, HttpCustomerLookup } from './customerLookup';
import { JwtTokenIssuer } from './tokenIssuer';
import { logEvent, LogWriter, parseTraceparent } from './log';

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
  /** Defaults to the console; tests pass a capture. */
  log?: LogWriter;
}

/**
 * Why each request ended the way it did. It is a fixed vocabulary, not the
 * HTTP status, because 400 alone does not say whether the body was malformed
 * or the CPF failed its check digit, and that difference is what somebody
 * reading the log is after.
 */
type Outcome =
  | 'invalid-body'
  | 'missing-cpf'
  | 'invalid-cpf'
  | 'not-found'
  | 'inactive'
  | 'unavailable'
  | 'issued';

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
    const incoming = event.headers?.traceparent;

    // One line per request, whatever the outcome. Never the CPF: it is
    // personal data, and the application redacts it on its side for the same
    // reason. The customer id is enough to follow the case.
    const finish = (
      statusCode: number,
      body: unknown,
      outcome: Outcome,
      extra: { traceparent?: string; customerId?: string } = {},
    ): APIGatewayProxyResultV2 => {
      // The application's traceparent wins: it names the trace its own log
      // lines were written under. The client's only stands in when the
      // application never answered.
      const trace = parseTraceparent(extra.traceparent ?? incoming);

      logEvent(
        {
          msg: 'autenticacao de cliente',
          route: 'POST /auth/cpf',
          outcome,
          status_code: statusCode,
          ...(event.requestContext?.requestId && { request_id: event.requestContext.requestId }),
          ...(trace && { trace_id: trace.traceId, span_id: trace.spanId }),
          ...(extra.customerId && { customer_id: extra.customerId }),
        },
        deps.log,
      );

      return json(statusCode, body);
    };

    let cpf: unknown;

    // JSON.parse desprotegido derruba a function, e o API Gateway devolve 502.
    // 502 nao diz ao cliente que o problema e o corpo que ele mandou.
    try {
      cpf = (JSON.parse(event.body ?? '{}') as { cpf?: unknown }).cpf;
    } catch {
      return finish(400, { error: 'invalid request body' }, 'invalid-body');
    }

    if (typeof cpf !== 'string' || cpf.trim() === '') {
      return finish(400, { error: 'cpf is required' }, 'missing-cpf');
    }

    const result = await deps.lookup.byCpf(cpf.trim(), incoming);
    const trace = { traceparent: result.traceparent };

    // A uniao discriminada obriga a tratar os quatro casos: esquecer um seria
    // erro de compilacao, nao 500 em producao.
    switch (result.kind) {
      case 'invalid-cpf':
        return finish(400, { error: 'invalid cpf' }, 'invalid-cpf', trace);

      case 'not-found':
        return finish(401, { error: 'authentication failed' }, 'not-found', trace);

      case 'unavailable':
        return finish(503, { error: 'service unavailable' }, 'unavailable', trace);

      case 'found': {
        const customerId = result.customer.id;

        // Cliente inativo e recusado antes de assinar: emitir token para quem
        // nao pode usa-lo seria trabalho jogado fora, e um token valido
        // circulando sem necessidade.
        if (!result.customer.active) {
          return finish(403, { error: 'customer is inactive' }, 'inactive', { ...trace, customerId });
        }

        const { token, expiresIn } = deps.issuer.issue(
          { id: customerId, name: result.customer.name },
          cpf,
        );

        return finish(
          200,
          { token, expiresIn, customer: { id: customerId, name: result.customer.name } },
          'issued',
          { ...trace, customerId },
        );
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
