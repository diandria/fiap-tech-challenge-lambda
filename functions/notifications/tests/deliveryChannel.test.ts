import { LoggingDeliveryChannel } from '../src/deliveryChannel';
import { ServiceOrderEvent } from '../src/event';

const event: ServiceOrderEvent = {
  eventType: 'BUDGET_READY',
  occurredAt: '2026-08-30T12:00:00Z',
  serviceOrder: { id: 'os-1', status: 'AGUARDANDO_APROVACAO', budgetTotal: 1234.5 },
  customer: { id: 'c1', name: 'Ana', email: 'ana@exemplo.com' },
};

describe('LoggingDeliveryChannel', () => {
  const captureInfo = () => jest.spyOn(console, 'info').mockImplementation(() => undefined);

  it('should log the formatted message GIVEN an event WHEN sending', async () => {
    const spy = captureInfo();

    await new LoggingDeliveryChannel().send(event);

    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.to).toBe('ana@exemplo.com');
    expect(logged.subject).toContain('orçamento');
    expect(logged.body).toContain('1.234,50');
    spy.mockRestore();
  });

  // O log precisa ser JSON com os campos que o Promtail promove a label
  // (M5.T7), senao a notificacao nao fica pesquisavel no Grafana.
  it('should emit structured json GIVEN an event WHEN sending', async () => {
    const spy = captureInfo();

    await new LoggingDeliveryChannel().send(event);

    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.service_name).toBe('car-repair-shop-notifications');
    expect(logged.level).toBe('info');
    expect(logged.event_type).toBe('BUDGET_READY');
    expect(logged.service_order_id).toBe('os-1');
    spy.mockRestore();
  });
});
