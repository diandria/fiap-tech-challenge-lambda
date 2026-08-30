import { buildMessage } from '../src/messageBuilder';
import { ServiceOrderEvent } from '../src/event';

const base: ServiceOrderEvent = {
  eventType: 'SERVICE_ORDER_STATUS_CHANGED',
  occurredAt: '2026-08-30T12:00:00Z',
  serviceOrder: { id: 'os-1', status: 'AGUARDANDO_APROVACAO' },
  customer: { id: 'c1', name: 'Ana', email: 'ana@exemplo.com' },
};

describe('buildMessage', () => {
  it('should address the customer GIVEN any event WHEN building', () => {
    const msg = buildMessage(base);

    expect(msg.to).toBe('ana@exemplo.com');
    expect(msg.body).toContain('Ana');
  });

  it('should build a status message GIVEN a status changed event WHEN building', () => {
    const msg = buildMessage(base);

    expect(msg.subject).toContain('atualizada');
    expect(msg.body).toContain('AGUARDANDO_APROVACAO');
    expect(msg.body).toContain('os-1');
  });

  it('should build a budget message with the formatted amount GIVEN a budget ready event', () => {
    const msg = buildMessage({
      ...base,
      eventType: 'BUDGET_READY',
      serviceOrder: { id: 'os-1', status: 'AGUARDANDO_APROVACAO', budgetTotal: 1234.5 },
    });

    expect(msg.subject).toContain('orçamento');
    // Formato brasileiro: quem le a mensagem e o cliente da oficina.
    expect(msg.body).toContain('1.234,50');
  });

  // Templates distintos por tipo, como o INotificationService da aplicacao ja
  // estabelece com dois metodos: os dois eventos tem proposito diferente.
  it('should use different subjects GIVEN the two event types WHEN building', () => {
    const status = buildMessage(base);
    const budget = buildMessage({
      ...base,
      eventType: 'BUDGET_READY',
      serviceOrder: { id: 'os-1', status: 'AGUARDANDO_APROVACAO', budgetTotal: 10 },
    });

    expect(status.subject).not.toBe(budget.subject);
  });

  it('should survive a budget event without amount GIVEN incomplete data WHEN building', () => {
    const msg = buildMessage({ ...base, eventType: 'BUDGET_READY' });

    expect(msg.body).toBeTruthy();
    expect(msg.body).not.toContain('undefined');
    expect(msg.body).not.toContain('NaN');
  });

  it('should not leak internal identifiers beyond the order id GIVEN any event', () => {
    const msg = buildMessage(base);

    // O id do cliente e interno; nao ha razao para ele aparecer na mensagem.
    expect(msg.body).not.toContain('c1');
  });
});
