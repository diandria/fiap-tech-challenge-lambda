import { ServiceOrderEvent } from './event';

/**
 * Formata a mensagem que chega ao cliente.
 *
 * Logica pura, separada do canal de entrega de proposito: e o que torna a
 * formatacao testavel sem dublê de AWS, e permite trocar de canal sem tocar
 * neste arquivo.
 *
 * Esta formatacao e a razao de a function existir. Assinar o topico de eventos
 * direto com um e-mail entregaria o JSON cru ao cliente.
 */
export interface Message {
  to: string;
  subject: string;
  body: string;
}

/** Quem le a mensagem e o cliente da oficina, entao moeda em formato brasileiro. */
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

  // Evento sem valor nao deveria acontecer, mas imprimir "undefined" ou "NaN"
  // para o cliente e pior que omitir a linha.
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
