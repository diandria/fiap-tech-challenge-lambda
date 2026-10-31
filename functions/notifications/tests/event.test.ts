import { parseEvent, ServiceOrderEvent } from '../src/event';

const valid: ServiceOrderEvent = {
  eventType: 'SERVICE_ORDER_STATUS_CHANGED',
  occurredAt: '2026-08-30T12:00:00Z',
  serviceOrder: { id: 'os-1', status: 'EM_EXECUCAO' },
  customer: { id: 'c1', name: 'Ana', email: 'ana@exemplo.com' },
};

const parse = (v: unknown) => parseEvent(typeof v === 'string' ? v : JSON.stringify(v));

describe('parseEvent', () => {
  it('should accept GIVEN a complete event WHEN parsing', () => {
    expect(parse(valid)).toEqual(valid);
  });

  // Returns null rather than throwing: a malformed event is a permanent error,
  // and the caller has to tell it apart from a transient failure.
  it.each([
    ['invalid json', 'not-json'],
    ['nulo', 'null'],
    ['tipo desconhecido', { ...valid, eventType: 'DESCONHECIDO' }],
    ['sem tipo', { ...valid, eventType: undefined }],
    ['ordem sem id', { ...valid, serviceOrder: { status: 'EM_EXECUCAO' } }],
    ['ordem sem status', { ...valid, serviceOrder: { id: 'os-1' } }],
    ['sem ordem', { ...valid, serviceOrder: undefined }],
    ['cliente sem email', { ...valid, customer: { id: 'c1', name: 'Ana', email: '' } }],
    ['cliente sem nome', { ...valid, customer: { id: 'c1', name: '', email: 'a@b.c' } }],
    ['sem cliente', { ...valid, customer: undefined }],
  ])('should reject GIVEN %s WHEN parsing', (_label, input) => {
    expect(parse(input)).toBeNull();
  });

  const paymentRequested = {
    ...valid,
    eventType: 'PAYMENT_REQUESTED',
    serviceOrder: { id: 'os-1', status: 'APPROVED', budgetTotal: 191 },
    payment: { checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1' },
  };

  it('should accept PAYMENT_REQUESTED with a checkout url GIVEN a complete event WHEN parsing', () => {
    expect(parse(paymentRequested)).toEqual(paymentRequested);
  });

  // The link goes straight into a message the customer clicks; anything but
  // https is either a mistake or an attempt to send them elsewhere.
  it.each([
    ['without payment', { ...paymentRequested, payment: undefined }],
    ['without checkout url', { ...paymentRequested, payment: {} }],
    ['with an http url', { ...paymentRequested, payment: { checkoutUrl: 'http://mp.test/checkout' } }],
    ['with a javascript url', { ...paymentRequested, payment: { checkoutUrl: 'javascript:alert(1)' } }],
    ['with a relative url', { ...paymentRequested, payment: { checkoutUrl: '/payments/mock/os-1' } }],
  ])('should reject PAYMENT_REQUESTED GIVEN an event %s WHEN parsing', (_label, input) => {
    expect(parse(input)).toBeNull();
  });
});
