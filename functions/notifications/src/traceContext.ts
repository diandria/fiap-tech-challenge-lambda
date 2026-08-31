/**
 * Contexto de rastreamento propagado pelo evento.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
}

// 00-<32 hex>-<16 hex>-<2 hex>, conforme W3C Trace Context.
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

// Ids so de zeros sao invalidos pela especificacao. Registra-los criaria um
// balde onde traces sem relacao nenhuma apareceriam juntos no Grafana.
const ALL_ZEROS = /^0+$/;

/**
 * Extrai trace e span do cabecalho `traceparent`.
 *
 * Devolve undefined em vez de lancar: a correlacao e util, mas nao e o
 * trabalho desta function. Um traceparent malformado nao pode impedir a
 * entrega de uma notificacao que, fora isso, esta perfeita.
 */
export function parseTraceparent(traceparent?: string): TraceContext | undefined {
  if (!traceparent) return undefined;

  const match = TRACEPARENT.exec(traceparent.toLowerCase());
  if (!match) return undefined;

  const [, traceId, spanId] = match;
  if (ALL_ZEROS.test(traceId) || ALL_ZEROS.test(spanId)) return undefined;

  return { traceId, spanId };
}
