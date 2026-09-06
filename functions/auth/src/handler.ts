import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CustomerLookup, HttpCustomerLookup } from './customerLookup';
import { JwtTokenIssuer } from './tokenIssuer';
import { logEvent, LogWriter, parseTraceparent } from './log';

/**
 * Issues the customer JWT from a CPF.
 *
 *   200  { token, expiresIn, customer: { id, name } }
 *   400  missing or malformed body, or missing/invalid cpf
 *   401  customer not found
 *   403  customer inactive
 *   503  failed to reach the application
 *
 * An unknown customer gets 401, not 404: a 404 would turn the endpoint into an
 * enumeration oracle, revealing who is a customer by testing CPFs.
 */
export interface HandlerDeps {
  lookup: CustomerLookup;
  issuer: JwtTokenIssuer;
  /** Defaults to the console; tests pass a capture. */
  log?: LogWriter;
}

/**
 * Why the request ended the way it did. A fixed vocabulary rather than the
 * HTTP status: 400 alone does not separate a malformed body from a CPF that
 * failed its check digit.
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
 * Takes its dependencies as parameters so tests can compose without touching
 * the network or the environment.
 */
export function createHandler(deps: HandlerDeps) {
  return async function handler(
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyResultV2> {
    const incoming = event.headers?.traceparent;

    // One line per request, whatever the outcome. Never the CPF: the customer
    // id is enough to follow the case.
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

    // An unguarded JSON.parse crashes the function and the gateway answers
    // 502, which does not tell the caller the body was the problem.
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

    // The discriminated union forces all four cases to be handled: missing one
    // is a compile error, not a 500 in production.
    switch (result.kind) {
      case 'invalid-cpf':
        return finish(400, { error: 'invalid cpf' }, 'invalid-cpf', trace);

      case 'not-found':
        return finish(401, { error: 'authentication failed' }, 'not-found', trace);

      case 'unavailable':
        return finish(503, { error: 'service unavailable' }, 'unavailable', trace);

      case 'found': {
        const customerId = result.customer.id;

        // An inactive customer is refused before signing: issuing a token
        // nobody can use is wasted work and one more valid token in circulation.
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
