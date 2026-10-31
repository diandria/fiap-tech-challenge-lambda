import { ServiceOrderEvent } from './event';

/**
 * Formats the message the customer receives.
 *
 * Pure logic, kept apart from the delivery channel so formatting is testable
 * without an AWS double and the channel can change without touching this file.
 *
 * This formatting is why the function exists: subscribing an e-mail directly to
 * the topic would deliver raw JSON to the customer.
 */
export interface Message {
  to: string;
  subject: string;
  body: string;
}

/** The reader is the workshop's customer, so currency uses the Brazilian format. */
const asCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

function statusMessage(event: ServiceOrderEvent): Omit<Message, 'to'> {
  return {
    subject: `Sua ordem de serviço foi atualizada`,
    body: [
      `Olá, ${event.customer.name}.`,
      ``,
      `A ordem de serviço ${event.serviceOrder.id} mudou de situação.`,
      `Situação atual: ${event.serviceOrder.status}`,
      ``,
      `Equipe da oficina`,
    ].join('\n'),
  };
}

function budgetMessage(event: ServiceOrderEvent): Omit<Message, 'to'> {
  const total = event.serviceOrder.budgetTotal;

  // An event without a total should not happen, but printing "undefined" or
  // "NaN" to the customer is worse than omitting the line.
  const amountLine =
    typeof total === 'number' && Number.isFinite(total)
      ? `Valor total: ${asCurrency(total)}`
      : `O valor será informado pela oficina.`;

  return {
    subject: `O orçamento da sua ordem de serviço está pronto`,
    body: [
      `Olá, ${event.customer.name}.`,
      ``,
      `O orçamento da ordem de serviço ${event.serviceOrder.id} está pronto.`,
      amountLine,
      ``,
      `Acesse o sistema para aprovar ou recusar.`,
      ``,
      `Equipe da oficina`,
    ].join('\n'),
  };
}

function paymentMessage(event: ServiceOrderEvent): Omit<Message, 'to'> {
  const total = event.serviceOrder.budgetTotal;
  const amountLine =
    typeof total === 'number' && Number.isFinite(total) ? `Valor: ${asCurrency(total)}` : undefined;

  return {
    subject: `Link de pagamento da sua ordem de serviço`,
    body: [
      `Olá, ${event.customer.name}.`,
      ``,
      `O orçamento da ordem de serviço ${event.serviceOrder.id} foi aprovado.`,
      ...(amountLine ? [amountLine] : []),
      ``,
      `Para pagar, acesse: ${event.payment?.checkoutUrl}`,
      ``,
      `O serviço começa assim que o pagamento for confirmado.`,
      ``,
      `Equipe da oficina`,
    ].join('\n'),
  };
}

const BUILDERS: Record<ServiceOrderEvent['eventType'], (event: ServiceOrderEvent) => Omit<Message, 'to'>> = {
  SERVICE_ORDER_STATUS_CHANGED: statusMessage,
  BUDGET_READY: budgetMessage,
  PAYMENT_REQUESTED: paymentMessage,
};

export function buildMessage(event: ServiceOrderEvent): Message {
  return { to: event.customer.email, ...BUILDERS[event.eventType](event) };
}
