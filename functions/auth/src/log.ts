/**
 * Structured log for the function, in the same shape the notifications
 * function emits: one JSON line per event, with `service_name` and, when there
 * is one, the `trace_id` and `span_id` of the request that caused it.
 *
 * The line lands in CloudWatch and is what ties this function to the
 * application's log for the same authentication: the application answers the
 * lookup with a `traceparent` header, and the id in it is the same one its own
 * log lines carry. Without this line, the gateway -> function -> application
 * chain has a hole in the middle where the function should be.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
}

// 00-<32 hex>-<16 hex>-<2 hex>, per W3C Trace Context.
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

// All-zero ids are invalid by the specification. Logging them would create a
// bucket where unrelated traces show up together in Grafana.
const ALL_ZEROS = /^0+$/;

/**
 * Extracts trace and span ids from a `traceparent` header.
 *
 * Returns undefined instead of throwing: correlation is useful, but it is not
 * this function's job, and a malformed header must not turn a valid
 * authentication into a 500.
 */
export function parseTraceparent(traceparent?: string): TraceContext | undefined {
  if (!traceparent) return undefined;

  const match = TRACEPARENT.exec(traceparent.toLowerCase());
  if (!match) return undefined;

  const [, traceId, spanId] = match;
  if (ALL_ZEROS.test(traceId) || ALL_ZEROS.test(spanId)) return undefined;

  return { traceId, spanId };
}

/** Where the line goes. Injectable so tests can capture it without spying on the console. */
export type LogWriter = (line: string) => void;

export function logEvent(fields: Record<string, unknown>, write: LogWriter = console.info): void {
  write(
    JSON.stringify({
      level: 'info',
      service_name: 'car-repair-shop-auth',
      ...fields,
    }),
  );
}
