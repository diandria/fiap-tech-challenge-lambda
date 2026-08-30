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

  // Devolve null em vez de lancar: evento malformado e erro permanente, e quem
  // chama precisa distinguir isso de falha transitoria para decidir se relanca.
  it.each([
    ['json invalido', 'nao-e-json'],
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
});
