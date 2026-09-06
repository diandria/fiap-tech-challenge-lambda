import { SNSEvent } from 'aws-lambda';
import { parseEvent, ServiceOrderEvent } from './event';
import { LoggingDeliveryChannel } from './deliveryChannel';

/**
 * Delivers notifications from SNS events.
 *
 * The design decision here is the split between two kinds of error:
 *
 *   permanent   (malformed payload, unknown type, incomplete event)
 *               -> log and move on. Rethrowing would reprocess forever an
 *                  event that can never succeed.
 *
 *   transient   (delivery channel down)
 *               -> rethrow, so the SNS retry applies.
 *
 * Confusing the two costs both ways: rethrowing a permanent error burns
 * invocations, and swallowing a transient one loses the notification silently.
 */
export interface DeliveryChannel {
  send(event: ServiceOrderEvent): Promise<void>;
}

export function createHandler(channel: DeliveryChannel) {
  return async function handler(event: SNSEvent): Promise<void> {
    // Records is plural for a reason: SNS can deliver more than one record per
    // invocation, and handling only the first drops the rest silently.
    const parsed = event.Records.map((record) => {
      const result = parseEvent(record.Sns.Message);

      if (!result) {
        // Permanent error. Logged for investigation, not rethrown.
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

    // A bad record does not stop the good ones, but a channel failure has to
    // reach SNS so it redelivers.
    for (const item of parsed) {
      await channel.send(item);
    }
  };
}

/**
 * Entry point the Lambda runtime looks for.
 *
 * Without this export the function deploys fine and fails on every invocation
 * with "Runtime.HandlerNotFound", which no test catches because they all
 * compose through createHandler.
 */
export const handler = createHandler(new LoggingDeliveryChannel());
