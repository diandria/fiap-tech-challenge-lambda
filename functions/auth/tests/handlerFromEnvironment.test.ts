import { APIGatewayProxyEventV2 } from 'aws-lambda';

/**
 * Cobre a construcao a partir do ambiente, que os outros testes evitam de
 * proposito ao compor as dependencias na mao.
 *
 * Each case reloads the module because the handler caches the built instance:
 * without a reset, the second test would reuse the first one's configuration.
 */
const loadHandler = async () => {
  jest.resetModules();
  return (await import('../src/handler')).handler;
};

const withEnv = (vars: Record<string, string | undefined>) => {
  const previous = { ...process.env };

  for (const [key, value] of Object.entries(vars)) {
    // Assigning undefined stores the string "undefined", which is truthy: the
    // key has to be deleted for the variable to be genuinely absent.
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
    INTERNAL_TOKEN: 'secret',
    JWT_SECRET: 'jwt-secreto',
  };

  it.each(['APP_BASE_URL', 'INTERNAL_TOKEN', 'JWT_SECRET'])(
    'should fail loudly GIVEN %s is missing WHEN invoked',
    async (missing) => {
      const restore = withEnv({ ...complete, [missing]: undefined });
      const handler = await loadHandler();

      // Failing at startup, naming the variable, beats a 500 that does not say
      // what is missing.
      await expect(handler(event)).rejects.toThrow(`missing environment variable: ${missing}`);

      restore();
    },
  );

  it('should build without throwing GIVEN every variable is present WHEN invoked', async () => {
    const restore = withEnv({ ...complete, LOOKUP_TIMEOUT_MS: '10' });
    const handler = await loadHandler();

    // With no application up the lookup fails and becomes 503, which proves the
    // construction worked and the request was attempted.
    const res = (await handler(event)) as { statusCode: number };

    expect(res.statusCode).toBe(503);
    restore();
  });
});
