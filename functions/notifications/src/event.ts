/**
 * Contrato do evento, conforme ADR-003.
 *
 * Declarado localmente de proposito: esta function nao importa codigo do
 * repositorio da aplicacao. O acoplamento entre os dois e o contrato escrito,
 * nao o codigo compartilhado -- sao repositorios com ciclo de vida proprio.
 */
export type EventType = 'SERVICE_ORDER_STATUS_CHANGED' | 'BUDGET_READY';

export interface ServiceOrderEvent {
  eventType: EventType;
  occurredAt: string;
  traceparent?: string;
  serviceOrder: {
    id: string;
    status: string;
    budgetTotal?: number;
  };
  customer: {
    id: string;
    name: string;
    email: string;
  };
}

const KNOWN_TYPES: readonly string[] = ['SERVICE_ORDER_STATUS_CHANGED', 'BUDGET_READY'];

/**
 * Valida a forma do evento antes de qualquer uso.
 *
 * Devolve null em vez de lancar: um evento malformado e erro permanente, e o
 * chamador precisa distinguir isso de falha transitoria para decidir se
 * relanca ou nao.
 */
export function parseEvent(raw: string): ServiceOrderEvent | null {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  const event = value as Partial<ServiceOrderEvent>;

  if (!event || typeof event !== 'object') return null;
  if (!KNOWN_TYPES.includes(event.eventType as string)) return null;
  if (!event.serviceOrder?.id || !event.serviceOrder?.status) return null;
  if (!event.customer?.email || !event.customer?.name) return null;

  return event as ServiceOrderEvent;
}
