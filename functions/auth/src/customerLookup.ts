/**
 * Looks the customer up in the application.
 *
 * The four outcomes are a discriminated union rather than exceptions: all four
 * are expected. The compiler then forces every one to be handled.
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

/** The minimal fetch signature this client uses. */
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
    // Without a deadline, a slow application holds the function until its own
    // timeout and the caller gets an unexplained 502.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-internal-token': this.config.internalToken,
    };

    // Propagates the trace context so this request joins the trace of the call
    // that originated it.
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
      // Network down, DNS failing or the deadline expiring are the same
      // outcome from the caller's point of view.
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
      // 401 and 403 mean the function failed to authenticate, not that the
      // customer is missing. Mapping them to not-found would hide a
      // misconfigured internal token behind the wrong symptom.
      default:
        return { kind: 'unavailable', ...trace };
    }
  }
}
