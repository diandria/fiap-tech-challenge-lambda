import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHandler } from '../src/handler';
import { CustomerLookup, LookupResult } from '../src/customerLookup';
import { JwtTokenIssuer } from '../src/tokenIssuer';

const APP_TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const CLIENT_TRACEPARENT = '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01';

const lookupReturning = (result: LookupResult): CustomerLookup => ({
  byCpf: jest.fn().mockResolvedValue(result),
});

const build = (lookup: CustomerLookup) => {
  const lines: string[] = [];
  const handler = createHandler({
    lookup,
    issuer: new JwtTokenIssuer({ secret: 'segredo-de-teste', expiresIn: '1h' }),
    log: (line) => lines.push(line),
  });
  const logged = () => JSON.parse(lines[0]) as Record<string, unknown>;

  return { handler, lines, logged };
};

const eventWith = (body: unknown, headers: Record<string, string> = {}): APIGatewayProxyEventV2 =>
  ({
    body: JSON.stringify(body),
    headers,
    requestContext: { requestId: 'req-1' },
  }) as unknown as APIGatewayProxyEventV2;

const active = { kind: 'found', customer: { id: 'c1', name: 'Ana', active: true } } as const;

describe('Auth handler structured log', () => {
  it('should log one line with the outcome and status GIVEN a token is issued WHEN invoked', async () => {
    const { handler, lines, logged } = build(lookupReturning(active));

    await handler(eventWith({ cpf: '12345678909' }));

    expect(lines).toHaveLength(1);
    expect(logged()).toMatchObject({
      level: 'info',
      service_name: 'car-repair-shop-auth',
      msg: 'autenticacao de cliente',
      route: 'POST /auth/cpf',
      outcome: 'issued',
      status_code: 200,
      request_id: 'req-1',
      customer_id: 'c1',
    });
  });

  // The application's trace id is the one its own log lines carry for this
  // lookup; using it here is what makes the two sides searchable together.
  it('should carry the application trace id GIVEN the lookup answered with traceparent WHEN invoked', async () => {
    const { handler, logged } = build(lookupReturning({ ...active, traceparent: APP_TRACEPARENT }));

    await handler(eventWith({ cpf: '12345678909' }));

    expect(logged()).toMatchObject({
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      span_id: '00f067aa0ba902b7',
    });
  });

  it('should prefer the application trace id GIVEN both the client and the application sent one WHEN invoked', async () => {
    const { handler, logged } = build(lookupReturning({ ...active, traceparent: APP_TRACEPARENT }));

    await handler(eventWith({ cpf: '12345678909' }, { traceparent: CLIENT_TRACEPARENT }));

    expect(logged().trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('should fall back to the client trace id GIVEN the application never answered WHEN invoked', async () => {
    const { handler, logged } = build(lookupReturning({ kind: 'unavailable' }));

    await handler(eventWith({ cpf: '12345678909' }, { traceparent: CLIENT_TRACEPARENT }));

    expect(logged()).toMatchObject({
      outcome: 'unavailable',
      status_code: 503,
      trace_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('should omit trace fields GIVEN no traceparent anywhere WHEN invoked', async () => {
    const { handler, logged } = build(lookupReturning(active));

    await handler(eventWith({ cpf: '12345678909' }));

    expect(logged()).not.toHaveProperty('trace_id');
    expect(logged()).not.toHaveProperty('span_id');
  });

  it('should never log the cpf GIVEN any outcome WHEN invoked', async () => {
    const { handler, lines } = build(lookupReturning(active));

    await handler(eventWith({ cpf: '123.456.789-09' }));

    expect(lines[0]).not.toContain('12345678909');
    expect(lines[0]).not.toContain('123.456.789-09');
  });

  it.each([
    ['invalid-cpf', { kind: 'invalid-cpf' } as LookupResult, 400],
    ['not-found', { kind: 'not-found' } as LookupResult, 401],
    ['inactive', { kind: 'found', customer: { id: 'c1', name: 'Ana', active: false } } as LookupResult, 403],
  ])('should log outcome %s GIVEN that lookup result WHEN invoked', async (outcome, result, statusCode) => {
    const { handler, lines, logged } = build(lookupReturning(result));

    await handler(eventWith({ cpf: '12345678909' }));

    expect(lines).toHaveLength(1);
    expect(logged()).toMatchObject({ outcome, status_code: statusCode });
  });

  it('should log outcome invalid-body GIVEN a malformed body WHEN invoked', async () => {
    const { handler, logged } = build(lookupReturning(active));

    await handler({ body: 'nao-e-json' } as APIGatewayProxyEventV2);

    expect(logged()).toMatchObject({ outcome: 'invalid-body', status_code: 400 });
    expect(logged()).not.toHaveProperty('request_id');
  });

  it('should log outcome missing-cpf GIVEN a body without cpf WHEN invoked', async () => {
    const { handler, logged } = build(lookupReturning(active));

    await handler(eventWith({}));

    expect(logged()).toMatchObject({ outcome: 'missing-cpf', status_code: 400 });
  });
});
