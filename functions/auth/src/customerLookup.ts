/**
 * Consulta o cliente na aplicacao.
 *
 * Os quatro desfechos sao uniao discriminada, e nao excecoes, porque os quatro
 * sao esperados -- nenhum e excepcional. Com uniao, o compilador obriga quem
 * consome a tratar os quatro: esquecer um caso vira erro de compilacao, e nao
 * um 500 em producao.
 */
export type LookupResult =
  | { kind: 'found'; customer: { id: string; name: string; active: boolean } }
  | { kind: 'invalid-cpf' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

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
) => Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> }>;

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

  private async translate(response: {
    ok: boolean;
    status: number;
    json?: () => Promise<unknown>;
  }): Promise<LookupResult> {
    if (response.ok) {
      const body = (await response.json?.()) as
        | { id: string; name: string; active: boolean }
        | undefined;

      if (!body?.id) return { kind: 'unavailable' };
      return {
        kind: 'found',
        customer: { id: body.id, name: body.name, active: body.active },
      };
    }

    switch (response.status) {
      case 400:
        return { kind: 'invalid-cpf' };
      case 404:
        return { kind: 'not-found' };
      // 401 e 403 significam que a *function* nao se autenticou, nao que o
      // cliente nao existe. Traduzir para not-found esconderia token interno
      // mal configurado atras de "cliente nao encontrado", e o sintoma
      // apontaria para o lugar errado.
      default:
        return { kind: 'unavailable' };
    }
  }
}
