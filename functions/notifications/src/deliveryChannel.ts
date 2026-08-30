import { DeliveryChannel } from './handler';
import { ServiceOrderEvent } from './event';
import { buildMessage } from './messageBuilder';
import { parseTraceparent } from './traceContext';

/**
 * Entrega a notificacao como log estruturado.
 *
 * Nenhum e-mail e enviado, e isso e deliberado: o ambiente e de demonstracao,
 * e nao ha destinatario real para receber mensagem da oficina. Publicar num
 * topico com assinatura de e-mail entregaria correio a uma pessoa de verdade,
 * o que nao se quer aqui.
 *
 * O log sai em JSON e cai no Loki pelo Promtail (M5.T7), entao a notificacao e
 * pesquisavel no Grafana -- o que basta para demonstrar que a function
 * formatou e entregou.
 *
 * Trocar por um canal real (SES, SNS com assinatura, webhook) e implementar
 * esta mesma interface. O messageBuilder nao muda.
 *
 * O log carrega `trace_id` e `span_id` quando o evento traz `traceparent`. Sao
 * eles que ligam esta entrega a requisicao que a originou, do outro lado da
 * fronteira assincrona: sem isso, o rastro morre no SNS e a function aparece
 * no Grafana como um evento sem causa.
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
        // Omitidos quando nao ha traceparent, em vez de nulos: campo ausente
        // e mais honesto que campo vazio, e o Loki nao indexa o que nao veio.
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
