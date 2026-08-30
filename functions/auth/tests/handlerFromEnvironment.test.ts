import { APIGatewayProxyEventV2 } from 'aws-lambda';

/**
 * Cobre a construcao a partir do ambiente, que os outros testes evitam de
 * proposito ao compor as dependencias na mao.
 *
 * Cada caso recarrega o modulo porque o handler guarda a instancia construida:
 * sem resetar, o segundo teste reaproveitaria a configuracao do primeiro.
 */
const loadHandler = async () => {
  jest.resetModules();
  return (await import('../src/handler')).handler;
};

const withEnv = (vars: Record<string, string | undefined>) => {
  const previous = { ...process.env };

  for (const [key, value] of Object.entries(vars)) {
    // Atribuir undefined grava a string "undefined", que e truthy: para a
    // variavel ficar realmente ausente e preciso apagar a chave.
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return () => {
    process.env = previous;
  };
};

const event = { body: JSON.stringify({ cpf: '12345678909' }) } as APIGatewayProxyEventV2;

describe('Auth handler built from the environment', () => {
  const complete = {
    APP_BASE_URL: 'http://app',
    INTERNAL_TOKEN: 'segredo',
    JWT_SECRET: 'jwt-secreto',
  };

  it.each(['APP_BASE_URL', 'INTERNAL_TOKEN', 'JWT_SECRET'])(
    'should fail loudly GIVEN %s is missing WHEN invoked',
    async (missing) => {
      const restore = withEnv({ ...complete, [missing]: undefined });
      const handler = await loadHandler();

      // Falhar no arranque, com o nome da variavel, e melhor que responder 500
      // sem dizer o que falta.
      await expect(handler(event)).rejects.toThrow(`missing environment variable: ${missing}`);

      restore();
    },
  );

  it('should build without throwing GIVEN every variable is present WHEN invoked', async () => {
    const restore = withEnv({ ...complete, LOOKUP_TIMEOUT_MS: '10' });
    const handler = await loadHandler();

    // Sem aplicacao no ar, o lookup falha e vira 503 -- o que prova que a
    // construcao funcionou e a requisicao chegou a ser tentada.
    const res = (await handler(event)) as { statusCode: number };

    expect(res.statusCode).toBe(503);
    restore();
  });
});
