/**
 * Trace context propagated through the event.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
}

// 00-<32 hex>-<16 hex>-<2 hex>, per W3C Trace Context.
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

// All-zero ids are invalid by the specification. Logging them would bucket
// unrelated traces together in Grafana.
const ALL_ZEROS = /^0+$/;

/**
 * Extracts trace and span ids from the `traceparent` header.
 *
 * Returns undefined rather than throwing: a malformed header must not stop an
 * otherwise valid notification from being delivered.
 */
export function parseTraceparent(traceparent?: string): TraceContext | undefined {
  if (!traceparent) return undefined;

  const match = TRACEPARENT.exec(traceparent.toLowerCase());
  if (!match) return undefined;

  const [, traceId, spanId] = match;
  if (ALL_ZEROS.test(traceId) || ALL_ZEROS.test(spanId)) return undefined;

  return { traceId, spanId };
}
