import { SNSEvent } from 'aws-lambda';
import { createHandler } from '../src/handler';
import { LoggingDeliveryChannel } from '../src/deliveryChannel';
import { ServiceOrderEvent } from '../src/event';

/**
 * Full composition: the handler plus the real logging channel. The other tests
 * exercise the pieces in isolation with doubles.
 */
const statusEvent = (): ServiceOrderEvent => ({
  eventType: 'SERVICE_ORDER_STATUS_CHANGED',
  occurredAt: '2026-08-30T12:00:00Z',
  serviceOrder: { id: 'os-1', status: 'EM_EXECUCAO' },
  customer: { id: 'c1', name: 'Ana', email: 'ana@exemplo.com' },
});

const budgetEvent = (): ServiceOrderEvent => ({
  ...statusEvent(),
  eventType: 'BUDGET_READY',
  serviceOrder: { id: 'os-2', status: 'AGUARDANDO_APROVACAO', budgetTotal: 899.9 },
});

const snsEvent = (messages: unknown[]): SNSEvent =>
  ({
    Records: messages.map((m) => ({
      Sns: { Message: typeof m === 'string' ? m : JSON.stringify(m) },
    })),
  }) as SNSEvent;

describe('Notifications function end to end', () => {
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    info.mockRestore();
    warn.mockRestore();
  });

  const run = (messages: unknown[]) =>
    createHandler(new LoggingDeliveryChannel())(snsEvent(messages));

  const delivered = () => info.mock.calls.map((c) => JSON.parse(c[0] as string));

  it('should deliver a readable status notification GIVEN a status event WHEN invoked', async () => {
    await run([statusEvent()]);

    const [msg] = delivered();
    expect(msg.to).toBe('ana@exemplo.com');
    expect(msg.subject).toContain('atualizada');
    expect(msg.body).toContain('EM_EXECUCAO');
  });

  it('should deliver a formatted amount GIVEN a budget event WHEN invoked', async () => {
    await run([budgetEvent()]);

    expect(delivered()[0].body).toContain('899,90');
  });

  it('should deliver every record GIVEN a batch WHEN invoked', async () => {
    await run([statusEvent(), budgetEvent(), statusEvent()]);

    expect(delivered()).toHaveLength(3);
  });

  it('should skip the bad record and deliver the rest GIVEN a mixed batch WHEN invoked', async () => {
    await run([statusEvent(), 'not-json', budgetEvent()]);

    expect(delivered()).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('should not deliver anything GIVEN only unknown event types WHEN invoked', async () => {
    await run([{ ...statusEvent(), eventType: 'DESCONHECIDO' }]);

    expect(delivered()).toHaveLength(0);
  });

  // A transient error has to reach SNS so the retry applies; a permanent one
  // must not. This pair defines the redelivery behaviour.
  it('should propagate the failure GIVEN the channel breaks WHEN invoked', async () => {
    const broken = { send: jest.fn().mockRejectedValue(new Error('channel down')) };

    await expect(createHandler(broken)(snsEvent([statusEvent()]))).rejects.toThrow('channel down');
  });

  it('should never throw GIVEN every record is permanently invalid WHEN invoked', async () => {
    await expect(run(['not-json', '{}', 'null'])).resolves.toBeUndefined();
  });
});

describe('Lambda entry point', () => {
  // Lambda looks for `handler` in the bundle. Without the export the function
  // deploys and fails on every invocation with Runtime.HandlerNotFound, which
  // no composition test catches.
  it('should export a handler GIVEN the module is loaded WHEN the runtime looks for it', async () => {
    const mod = await import('../src/handler');

    expect(typeof mod.handler).toBe('function');
  });

  it('should run without explicit dependencies GIVEN the exported handler WHEN invoked', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const { handler } = await import('../src/handler');

    await handler(snsEvent([statusEvent()]));

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
