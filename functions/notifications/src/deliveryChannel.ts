import { DeliveryChannel } from './handler';
import { ServiceOrderEvent } from './event';
import { buildMessage } from './messageBuilder';
import { parseTraceparent } from './traceContext';

/**
 * Delivers the notification as a structured log line.
 *
 * No e-mail is sent: this is a demonstration environment with no real
 * recipient. The line is JSON and reaches Loki through Promtail, so the
 * notification is searchable in Grafana. A real channel (SES, a webhook)
 * implements this same interface, and messageBuilder does not change.
 *
 * The line carries `trace_id` and `span_id` when the event brings a
 * `traceparent`, which is what links the delivery to the request that caused
 * it across the asynchronous boundary.
 */
export class LoggingDeliveryChannel implements DeliveryChannel {
  async send(event: ServiceOrderEvent): Promise<void> {
    const message = buildMessage(event);
    const trace = parseTraceparent(event.traceparent);

    console.info(
      JSON.stringify({
        level: 'info',
        msg: 'notificacao entregue',
        service_name: 'car-repair-shop-notifications',
        // Omitted rather than null when there is no traceparent: Loki does not
        // index a field that never arrived.
        ...(trace && { trace_id: trace.traceId, span_id: trace.spanId }),
        event_type: event.eventType,
        service_order_id: event.serviceOrder.id,
        to: message.to,
        subject: message.subject,
        body: message.body,
      }),
    );
  }
}
