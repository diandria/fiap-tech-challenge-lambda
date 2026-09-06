/**
 * Consulta o cliente na aplicacao.
 *
 * Os quatro desfechos sao uniao discriminada, e nao excecoes, porque os quatro
 * sao esperados -- nenhum e excepcional. Com uniao, o compilador obriga quem
 * consome a tratar os quatro: esquecer um caso vira erro de compilacao, e nao
 * um 500 em producao.
 */
export type LookupResult = (
  | { kind: 'found'; customer: { id: string; name: string; active: boolean } }
  | { kind: 'invalid-cpf' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }
) & {
  /**
   * `traceparent` the application answered with, when the call reached it.
   * The trace id in it is the one the application's own log lines carry for
   * this lookup, which is what lets this function's log be correlated with
   * them. Absent when the application did not answer.
   */
  traceparent?: string;
};

export interface CustomerLookup {
  byCpf(cpf: string, traceparent?: string): Promise<LookupResult>;
}

export interface LookupConfig {
  baseUrl: string;
  internalToken: string;
  timeoutMs: number;
}

/** Assinatura minima de fetch que este client usa. */
type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<LookupResponse>;

/** The subset of the fetch Response this client reads. */
interface LookupResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  headers?: { get(name: string): string | null };
}

export class HttpCustomerLookup implements CustomerLookup {
  constructor(
    private readonly config: LookupConfig,
    private readonly fetchFn: FetchLike = globalThis.fetch as unknown as FetchLike,
  ) {}

  async byCpf(cpf: string, traceparent?: string): Promise<LookupResult> {
    // Sem limite de tempo, uma aplicacao lenta segura a function ate o timeout
    // dela -- e o cliente espera por um 502 que nao explica nada.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-internal-token': this.config.internalToken,
    };

    // Propaga o contexto de trace quando existe, para a requisicao aparecer no
    // mesmo trace da chamada que a originou.
    if (traceparent) headers.traceparent = traceparent;

    try {
      const response = await this.fetchFn(`${this.config.baseUrl}/auth/customers/lookup`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cpf }),
        signal: controller.signal,
      });

      return await this.translate(response);
    } catch {
      // Rede fora, DNS falhando, ou o limite de tempo estourando: do ponto de
      // vista de quem chama, sao o mesmo desfecho.
      return { kind: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }

  private async translate(response: LookupResponse): Promise<LookupResult> {
    // Any answer from the application carries its traceparent, error ones
    // included: a 404 is logged on that side too, under the same trace id.
    // Spread only when present, so a missing header is an absent field and not
    // a `traceparent: undefined` that every consumer would have to filter.
    const traceparent = response.headers?.get('traceparent') ?? undefined;
    const trace = traceparent ? { traceparent } : {};

    if (response.ok) {
      const body = (await response.json?.()) as
        | { id: string; name: string; active: boolean }
        | undefined;

      if (!body?.id) return { kind: 'unavailable', ...trace };
      return {
        kind: 'found',
        customer: { id: body.id, name: body.name, active: body.active },
        ...trace,
      };
    }

    switch (response.status) {
      case 400:
        return { kind: 'invalid-cpf', ...trace };
      case 404:
        return { kind: 'not-found', ...trace };
      // 401 e 403 significam que a *function* nao se autenticou, nao que o
      // cliente nao existe. Traduzir para not-found esconderia token interno
      // mal configurado atras de "cliente nao encontrado", e o sintoma
      // apontaria para o lugar errado.
      default:
        return { kind: 'unavailable', ...trace };
    }
  }
}
