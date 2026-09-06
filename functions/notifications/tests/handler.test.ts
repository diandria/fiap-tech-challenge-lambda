import { SNSEvent } from 'aws-lambda';
import { createHandler, DeliveryChannel } from '../src/handler';
import { ServiceOrderEvent } from '../src/event';

const validEvent = (): ServiceOrderEvent => ({
  eventType: 'SERVICE_ORDER_STATUS_CHANGED',
  occurredAt: '2026-08-30T12:00:00Z',
  serviceOrder: { id: 'os-1', status: 'EM_EXECUCAO' },
  customer: { id: 'c1', name: 'Ana', email: 'ana@exemplo.com' },
});

const snsEvent = (messages: unknown[]): SNSEvent =>
  ({
    Records: messages.map((m) => ({
      Sns: { Message: typeof m === 'string' ? m : JSON.stringify(m) },
    })),
  }) as SNSEvent;

const channelThat = (send: jest.Mock): DeliveryChannel => ({ send });

describe('Notifications handler', () => {
  // SNS can deliver more than one record per invocation. Handling only the
  // first is the classic mistake, and a single-record test never catches it.
  it('should deliver one message per record GIVEN three records WHEN invoked', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const handler = createHandler(channelThat(send));

    await handler(snsEvent([validEvent(), validEvent(), validEvent()]));

    expect(send).toHaveBeenCalledTimes(3);
  });

  // Permanent error: rethrowing would reprocess forever an event that can
  // never succeed, until it reaches the dead-letter queue.
  it('should not throw GIVEN a malformed payload WHEN invoked', async () => {
    const send = jest.fn();
    const handler = createHandler(channelThat(send));

    await expect(handler(snsEvent(['not-json']))).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('should not throw GIVEN an unknown eventType WHEN invoked', async () => {
    const send = jest.fn();
    const handler = createHandler(channelThat(send));

    await expect(
      handler(snsEvent([{ ...validEvent(), eventType: 'DESCONHECIDO' }])),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('should not throw GIVEN an event without customer email WHEN invoked', async () => {
    const send = jest.fn();
    const handler = createHandler(channelThat(send));
    const semEmail = { ...validEvent(), customer: { id: 'c1', name: 'Ana', email: '' } };

    await expect(handler(snsEvent([semEmail]))).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  // Transient error: rethrow so the SNS retry applies.
  it('should propagate the error GIVEN the channel is unavailable WHEN invoked', async () => {
    const send = jest.fn().mockRejectedValue(new Error('SES down'));
    const handler = createHandler(channelThat(send));

    await expect(handler(snsEvent([validEvent()]))).rejects.toThrow('SES down');
  });

  // A bad record in the middle must not stop the good ones being delivered.
  it('should deliver the valid records GIVEN one malformed among them WHEN invoked', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const handler = createHandler(channelThat(send));

    await handler(snsEvent([validEvent(), 'not-json', validEvent()]));

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('should accept a budget ready event GIVEN the other known type WHEN invoked', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const handler = createHandler(channelThat(send));
    const orcamento: ServiceOrderEvent = {
      ...validEvent(),
      eventType: 'BUDGET_READY',
      serviceOrder: { id: 'os-1', status: 'AGUARDANDO_APROVACAO', budgetTotal: 1250.5 },
    };

    await handler(snsEvent([orcamento]));

    expect(send).toHaveBeenCalledTimes(1);
  });
});
