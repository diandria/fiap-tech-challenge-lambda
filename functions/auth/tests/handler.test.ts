import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../src/handler';

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

  // Corpo malformado e corpo ausente parecem o mesmo caso e nao sao: chegam por
  // caminhos diferentes no API Gateway, e um JSON.parse desprotegido derruba a
  // function com 502 em vez de responder 400.
  it('should return 400 GIVEN a malformed body WHEN invoked', async () => {
    const res = await handler({ body: 'nao-e-json' } as APIGatewayProxyEventV2);

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
