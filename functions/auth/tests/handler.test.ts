import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHandler } from '../src/handler';
import { JwtTokenIssuer } from '../src/tokenIssuer';

// A validacao de payload acontece antes de qualquer dependencia ser usada, mas
// o handler exportado as constroi a partir do ambiente. Compor aqui mantem
// estes testes focados na fronteira, sem precisar de variavel de ambiente.
const handler = createHandler({
  lookup: { byCpf: jest.fn() },
  issuer: new JwtTokenIssuer({ secret: 'unused', expiresIn: '1h' }),
});

const eventWith = (body: unknown): APIGatewayProxyEventV2 =>
  ({ body: JSON.stringify(body) }) as APIGatewayProxyEventV2;

const parse = (res: unknown) => JSON.parse((res as { body: string }).body);
const status = (res: unknown) => (res as { statusCode: number }).statusCode;

describe('Auth handler payload validation', () => {
  it('should return 400 GIVEN a body without cpf WHEN invoked', async () => {
    const res = await handler(eventWith({}));

    expect(status(res)).toBe(400);
    expect(parse(res).error).toBe('cpf is required');
  });

  // A malformed body and a missing one look alike but are not: they arrive by
  // different paths, and an unguarded JSON.parse answers 502 instead of 400.
  it('should return 400 GIVEN a malformed body WHEN invoked', async () => {
    const res = await handler({ body: 'not-json' } as APIGatewayProxyEventV2);

    expect(status(res)).toBe(400);
    expect(parse(res).error).toBe('invalid request body');
  });

  it('should return 400 GIVEN no body at all WHEN invoked', async () => {
    const res = await handler({} as APIGatewayProxyEventV2);

    expect(status(res)).toBe(400);
    expect(parse(res).error).toBe('cpf is required');
  });

  it('should return 400 GIVEN a blank cpf WHEN invoked', async () => {
    const res = await handler(eventWith({ cpf: '   ' }));

    expect(status(res)).toBe(400);
    expect(parse(res).error).toBe('cpf is required');
  });

  it('should return json content type GIVEN any response WHEN invoked', async () => {
    const res = await handler(eventWith({}));

    expect((res as { headers: Record<string, string> }).headers['content-type']).toBe(
      'application/json',
    );
  });
});
