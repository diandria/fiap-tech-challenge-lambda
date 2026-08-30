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

describe('LoggingDeliveryChannel trace correlation', () => {
  const TRACE_ID = 'd8d88900a8ecafe2df23b9a725ddbb90';
  const SPAN_ID = '00f067aa0ba902b7';

  function loggedPayload(traceparent?: string): Record<string, unknown> {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      new LoggingDeliveryChannel().send({
        eventType: 'SERVICE_ORDER_STATUS_CHANGED',
        occurredAt: '2026-08-30T00:00:00.000Z',
        ...(traceparent !== undefined && { traceparent }),
        serviceOrder: { id: 'os-1', status: 'WAITING_APPROVAL' },
        customer: { id: 'c-1', name: 'Ana', email: 'ana@test.com' },
      });
      return JSON.parse(spy.mock.calls[0][0] as string);
    } finally {
      spy.mockRestore();
    }
  }

  // Sem isto o rastro morre no SNS: a entrega aparece no Grafana como um
  // evento sem causa, e nao da para ligar a notificacao a requisicao que a
  // originou.
  it('should log trace_id and span_id GIVEN the event carries a traceparent WHEN delivering', () => {
    const payload = loggedPayload(`00-${TRACE_ID}-${SPAN_ID}-01`);

    expect(payload.trace_id).toBe(TRACE_ID);
    expect(payload.span_id).toBe(SPAN_ID);
  });

  it('should omit the trace fields GIVEN no traceparent WHEN delivering', () => {
    const payload = loggedPayload(undefined);

    expect(payload).not.toHaveProperty('trace_id');
    expect(payload).not.toHaveProperty('span_id');
  });

  // Um traceparent quebrado nao pode impedir uma entrega que, fora isso, esta
  // perfeita: a correlacao e util, mas nao e o trabalho da function.
  it('should still deliver GIVEN a malformed traceparent WHEN delivering', () => {
    const payload = loggedPayload('lixo');

    expect(payload.msg).toBe('notificacao entregue');
    expect(payload).not.toHaveProperty('trace_id');
  });
});
