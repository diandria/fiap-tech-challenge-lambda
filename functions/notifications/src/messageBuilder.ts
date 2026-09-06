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

export function buildMessage(event: ServiceOrderEvent): Message {
  const content =
    event.eventType === 'BUDGET_READY' ? budgetMessage(event) : statusMessage(event);

  return { to: event.customer.email, ...content };
}
