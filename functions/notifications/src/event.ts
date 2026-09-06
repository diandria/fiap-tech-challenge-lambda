/**
 * The event contract, per ADR-003.
 *
 * Declared locally on purpose: this function imports no code from the
 * application repository. The coupling between them is the written contract.
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
 * Validates the event shape before any use.
 *
 * Returns null rather than throwing: a malformed event is a permanent error,
 * and the caller has to tell that apart from a transient failure.
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
