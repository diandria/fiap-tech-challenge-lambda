import { HttpCustomerLookup } from '../src/customerLookup';

describe('HttpCustomerLookup', () => {
  const config = { baseUrl: 'http://app', internalToken: 'segredo', timeoutMs: 3000 };

  const fetchReturning = (response: unknown) => jest.fn().mockResolvedValue(response);

  it('should return found GIVEN the app responds 200 WHEN looking up', async () => {
    const fetchMock = fetchReturning({
      ok: true,
      status: 200,
      json: async () => ({ id: 'c1', name: 'Ana', active: true }),
    });
    const lookup = new HttpCustomerLookup(config, fetchMock);

    const result = await lookup.byCpf('12345678909');

    expect(result).toEqual({
      kind: 'found',
      customer: { id: 'c1', name: 'Ana', active: true },
    });
  });

  it('should send the internal token GIVEN any lookup WHEN calling the app', async () => {
    const fetchMock = fetchReturning({ ok: true, status: 200, json: async () => ({}) });
    const lookup = new HttpCustomerLookup(config, fetchMock);

    await lookup.byCpf('12345678909');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://app/auth/customers/lookup',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-token': 'segredo' }),
      }),
    );
  });

  it('should return invalid-cpf GIVEN the app responds 400 WHEN looking up', async () => {
    const lookup = new HttpCustomerLookup(config, fetchReturning({ ok: false, status: 400 }));

    expect(await lookup.byCpf('111')).toEqual({ kind: 'invalid-cpf' });
  });

  // 401 e 403 da aplicacao significam que a function nao se autenticou, nao que
  // o cliente nao existe. Tratar como not-found esconderia configuracao errada
  // do token interno atras de "cliente nao encontrado".
  it('should return unavailable GIVEN the app rejects the internal token WHEN looking up', async () => {
    const lookup = new HttpCustomerLookup(config, fetchReturning({ ok: false, status: 401 }));

    expect(await lookup.byCpf('12345678909')).toEqual({ kind: 'unavailable' });
  });

  it('should return not-found GIVEN the app responds 404 WHEN looking up', async () => {
    const lookup = new HttpCustomerLookup(config, fetchReturning({ ok: false, status: 404 }));

    expect(await lookup.byCpf('12345678909')).toEqual({ kind: 'not-found' });
  });

  it('should return unavailable GIVEN the app responds 500 WHEN looking up', async () => {
    const lookup = new HttpCustomerLookup(config, fetchReturning({ ok: false, status: 500 }));

    expect(await lookup.byCpf('12345678909')).toEqual({ kind: 'unavailable' });
  });

  it('should return unavailable GIVEN the request fails WHEN looking up', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('aborted'));
    const lookup = new HttpCustomerLookup(config, fetchMock);

    expect(await lookup.byCpf('12345678909')).toEqual({ kind: 'unavailable' });
  });

  it('should propagate the traceparent GIVEN one is provided WHEN calling the app', async () => {
    const fetchMock = fetchReturning({ ok: true, status: 200, json: async () => ({}) });
    const lookup = new HttpCustomerLookup(config, fetchMock);

    await lookup.byCpf('12345678909', '00-aaaa-bbbb-01');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ traceparent: '00-aaaa-bbbb-01' }),
      }),
    );
  });

  it('should not send a traceparent header GIVEN none is provided WHEN calling the app', async () => {
    const fetchMock = fetchReturning({ ok: true, status: 200, json: async () => ({}) });
    const lookup = new HttpCustomerLookup(config, fetchMock);

    await lookup.byCpf('12345678909');

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty('traceparent');
  });

  it('should abort GIVEN the app takes longer than the timeout WHEN looking up', async () => {
    const fetchMock = jest.fn(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise<{ ok: boolean; status: number }>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const lookup = new HttpCustomerLookup({ ...config, timeoutMs: 50 }, fetchMock);

    expect(await lookup.byCpf('12345678909')).toEqual({ kind: 'unavailable' });
  });
});
