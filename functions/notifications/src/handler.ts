import { SNSEvent } from 'aws-lambda';
import { parseEvent, ServiceOrderEvent } from './event';

/**
 * Entrega notificacoes a partir de eventos do SNS.
 *
 * A decisao de design desta function e a distincao entre dois tipos de erro:
 *
 *   permanente  (payload malformado, tipo desconhecido, evento incompleto)
 *               -> registra e segue. Relancar faria a Lambda reprocessar para
 *                  sempre um evento que nunca vai funcionar, ate cair na
 *                  dead-letter: gasto sem ganho.
 *
 *   transitorio (canal de entrega fora do ar)
 *               -> relanca, para o retry do SNS agir.
 *
 * Confundir os dois custa caro nos dois sentidos: relancar erro permanente
 * queima invocacao, e engolir erro transitorio perde a notificacao em silencio.
 */
export interface DeliveryChannel {
  send(event: ServiceOrderEvent): Promise<void>;
}

export function createHandler(channel: DeliveryChannel) {
  return async function handler(event: SNSEvent): Promise<void> {
    // Records no plural nao e detalhe: o SNS pode entregar mais de um registro
    // por invocacao, e tratar so o primeiro perde os demais em silencio.
    const parsed = event.Records.map((record) => {
      const result = parseEvent(record.Sns.Message);

      if (!result) {
        // Erro permanente. Fica registrado para investigacao, sem relancar.
        console.warn(
          JSON.stringify({
            level: 'warn',
            msg: 'evento descartado: payload invalido ou tipo desconhecido',
            service_name: 'car-repair-shop-notifications',
          }),
        );
      }

      return result;
    }).filter((e): e is ServiceOrderEvent => e !== null);

    // Um registro ruim no meio nao impede os bons de serem entregues, mas uma
    // falha de canal precisa chegar ao SNS para ele reentregar.
    for (const item of parsed) {
      await channel.send(item);
    }
  };
}
