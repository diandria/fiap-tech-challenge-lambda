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
  // O SNS pode entregar mais de um registro por invocacao. Tratar so o
  // primeiro e o erro classico aqui, e ele passa despercebido em teste com um
  // registro so.
  it('should deliver one message per record GIVEN three records WHEN invoked', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const handler = createHandler(channelThat(send));

    await handler(snsEvent([validEvent(), validEvent(), validEvent()]));

    expect(send).toHaveBeenCalledTimes(3);
  });

  // Erro permanente: relancar faria a Lambda reprocessar para sempre um evento
  // que nunca vai funcionar, ate cair na dead-letter. Gasto sem ganho.
  it('should not throw GIVEN a malformed payload WHEN invoked', async () => {
    const send = jest.fn();
    const handler = createHandler(channelThat(send));

    await expect(handler(snsEvent(['nao-e-json']))).resolves.toBeUndefined();
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

  // Erro transitorio: relancar para o retry do SNS agir.
  it('should propagate the error GIVEN the channel is unavailable WHEN invoked', async () => {
    const send = jest.fn().mockRejectedValue(new Error('SES fora'));
    const handler = createHandler(channelThat(send));

    await expect(handler(snsEvent([validEvent()]))).rejects.toThrow('SES fora');
  });

  // Um registro ruim no meio nao pode impedir os bons de serem entregues.
  it('should deliver the valid records GIVEN one malformed among them WHEN invoked', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const handler = createHandler(channelThat(send));

    await handler(snsEvent([validEvent(), 'nao-e-json', validEvent()]));

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
