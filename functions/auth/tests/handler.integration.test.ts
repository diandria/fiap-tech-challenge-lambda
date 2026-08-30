import jwt from 'jsonwebtoken';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHandler } from '../src/handler';
import { CustomerLookup, LookupResult } from '../src/customerLookup';
import { JwtTokenIssuer } from '../src/tokenIssuer';

const SECRET = 'segredo-de-teste';

const lookupReturning = (result: LookupResult): CustomerLookup => ({
  byCpf: jest.fn().mockResolvedValue(result),
});

const eventWith = (body: unknown): APIGatewayProxyEventV2 =>
  ({ body: JSON.stringify(body) }) as APIGatewayProxyEventV2;

const status = (res: unknown) => (res as { statusCode: number }).statusCode;
const parse = (res: unknown) => JSON.parse((res as { body: string }).body);

const build = (lookup: CustomerLookup, issuer = new JwtTokenIssuer({ secret: SECRET, expiresIn: '1h' })) =>
  createHandler({ lookup, issuer });

describe('Auth handler end to end', () => {
  it('should return 200 with a verifiable token GIVEN an active customer WHEN invoked', async () => {
    const handler = build(
      lookupReturning({ kind: 'found', customer: { id: 'c1', name: 'Ana', active: true } }),
    );

    const res = await handler(eventWith({ cpf: '123.456.789-09' }));
    const body = parse(res);

    expect(status(res)).toBe(200);
    expect(body.customer).toEqual({ id: 'c1', name: 'Ana' });
    expect(body.expiresIn).toBe(3600);
    expect(() => jwt.verify(body.token, SECRET)).not.toThrow();
  });

  // Assinar antes de validar seria desperdicio e, pior, indicaria que a ordem
  // das checagens esta errada.
  it('should never call the issuer GIVEN an invalid cpf WHEN invoked', async () => {
    const issuer = new JwtTokenIssuer({ secret: SECRET, expiresIn: '1h' });
    const spy = jest.spyOn(issuer, 'issue');
    const handler = build(lookupReturning({ kind: 'invalid-cpf' }), issuer);

    const res = await handler(eventWith({ cpf: '111' }));

    expect(status(res)).toBe(400);
    expect(parse(res).error).toBe('invalid cpf');
    expect(spy).not.toHaveBeenCalled();
  });

  it('should return 401 without revealing the cause GIVEN an unknown customer WHEN invoked', async () => {
    const handler = build(lookupReturning({ kind: 'not-found' }));

    const res = await handler(eventWith({ cpf: '12345678909' }));
    const body = parse(res);

    expect(status(res)).toBe(401);
    expect(body.error).toBe('authentication failed');
    // O corpo nao pode dizer "nao encontrado": isso transformaria o endpoint
    // num oraculo de enumeracao de clientes.
    expect(JSON.stringify(body)).not.toMatch(/not.?found|nao.?encontrado/i);
  });

  it('should return 403 GIVEN an inactive customer WHEN invoked', async () => {
    const handler = build(
      lookupReturning({ kind: 'found', customer: { id: 'c1', name: 'Ana', active: false } }),
    );

    const res = await handler(eventWith({ cpf: '12345678909' }));

    expect(status(res)).toBe(403);
    expect(parse(res).error).toBe('customer is inactive');
  });

  it('should not issue a token GIVEN an inactive customer WHEN invoked', async () => {
    const issuer = new JwtTokenIssuer({ secret: SECRET, expiresIn: '1h' });
    const spy = jest.spyOn(issuer, 'issue');
    const handler = build(
      lookupReturning({ kind: 'found', customer: { id: 'c1', name: 'Ana', active: false } }),
      issuer,
    );

    await handler(eventWith({ cpf: '12345678909' }));

    expect(spy).not.toHaveBeenCalled();
  });

  it('should return 503 GIVEN the application is unavailable WHEN invoked', async () => {
    const handler = build(lookupReturning({ kind: 'unavailable' }));

    const res = await handler(eventWith({ cpf: '12345678909' }));

    expect(status(res)).toBe(503);
    expect(parse(res).error).toBe('service unavailable');
  });

  it('should return 400 without throwing GIVEN a malformed body WHEN invoked', async () => {
    const handler = build(lookupReturning({ kind: 'unavailable' }));

    const res = await handler({ body: 'nao-e-json' } as APIGatewayProxyEventV2);

    expect(status(res)).toBe(400);
  });

  it('should propagate the traceparent to the lookup GIVEN one arrives in the request', async () => {
    const lookup = lookupReturning({
      kind: 'found',
      customer: { id: 'c1', name: 'Ana', active: true },
    });
    const handler = build(lookup);

    await handler({
      body: JSON.stringify({ cpf: '12345678909' }),
      headers: { traceparent: '00-abc-def-01' },
    } as unknown as APIGatewayProxyEventV2);

    expect(lookup.byCpf).toHaveBeenCalledWith('12345678909', '00-abc-def-01');
  });
});
