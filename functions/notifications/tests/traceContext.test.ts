import { parseTraceparent } from '../src/traceContext';

const TRACE_ID = 'd8d88900a8ecafe2df23b9a725ddbb90';
const SPAN_ID = '00f067aa0ba902b7';

describe('parseTraceparent', () => {
  it('should extract trace and span GIVEN a valid traceparent WHEN parsing', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-01`)).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    });
  });

  it('should extract GIVEN the sampled flag is off WHEN parsing', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${SPAN_ID}-00`)?.traceId).toBe(TRACE_ID);
  });

  it('should return undefined GIVEN no traceparent WHEN parsing', () => {
    expect(parseTraceparent(undefined)).toBeUndefined();
  });

  // Um traceparent malformado nao pode derrubar a entrega da notificacao: a
  // correlacao e util, mas nao e o trabalho da function.
  it('should return undefined GIVEN a malformed traceparent WHEN parsing', () => {
    expect(parseTraceparent('lixo')).toBeUndefined();
    expect(parseTraceparent('00-curto-demais-01')).toBeUndefined();
    expect(parseTraceparent('')).toBeUndefined();
  });

  // Um trace_id so de zeros e invalido pela especificacao do W3C, e registra-lo
  // criaria um balde onde traces nao relacionados se juntariam.
  it('should return undefined GIVEN an all-zero trace id WHEN parsing', () => {
    expect(parseTraceparent(`00-${'0'.repeat(32)}-${SPAN_ID}-01`)).toBeUndefined();
  });

  it('should return undefined GIVEN an all-zero span id WHEN parsing', () => {
    expect(parseTraceparent(`00-${TRACE_ID}-${'0'.repeat(16)}-01`)).toBeUndefined();
  });

  it('should reject GIVEN non-hex characters WHEN parsing', () => {
    expect(parseTraceparent(`00-${'z'.repeat(32)}-${SPAN_ID}-01`)).toBeUndefined();
  });
});
