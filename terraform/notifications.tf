# Topic where the application publishes service order events. It is the
# asynchronous boundary of ADR-003: the application publishes and moves on.
#
# AVD-AWS-0136 asks for a customer-managed key instead of the AWS-managed one.
# Suppressed with reason: the managed key already encrypts at rest, and the
# policy and rotation a CMK adds have no use in an environment recreated every
# cycle, at USD 1/month plus one more resource to remember to destroy.
#trivy:ignore:AVD-AWS-0136
resource "aws_sns_topic" "service_order_events" {
  name = "car-repair-shop-service-order-events"

  # Encrypted at rest with the account-managed key. The event carries the
  # customer's name and e-mail, and the managed key costs nothing.
  kms_master_key_id = "alias/aws/sns"
}

# Without a dead-letter queue, an event that exhausts its retries disappears
# silently, and the reliable delivery ADR-003 rests on stops existing.
# Same reason as the topic for the managed key.
#trivy:ignore:AVD-AWS-0135
resource "aws_sqs_queue" "notifications_dlq" {
  name = "car-repair-shop-notifications-dlq"

  # A week is enough time for someone to notice and investigate.
  message_retention_seconds = 604800

  # The message landing here is the original event, with customer data.
  kms_master_key_id = "alias/aws/sqs"
}

data "archive_file" "notifications" {
  type        = "zip"
  source_file = "${path.module}/../functions/notifications/dist/index.js"
  output_path = "${path.module}/notifications.zip"
}

resource "aws_lambda_function" "notifications" {
  function_name = "car-repair-shop-notifications"
  description   = "Formats and delivers service order notifications"
  role          = data.aws_iam_role.lab.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime

  filename = data.archive_file.notifications.output_path

  # Without it Terraform does not notice the code changed and the deploy
  # updates nothing, with the workflow still green.
  source_code_hash = data.archive_file.notifications.output_base64sha256

  # Asynchronous: no connection is waiting, so the limit can be looser than the
  # synchronous function's.
  timeout     = 30
  memory_size = 256

  environment {
    variables = {
      OTEL_SERVICE_NAME = "car-repair-shop-notifications"
    }
  }
}

resource "aws_lambda_function_event_invoke_config" "notifications" {
  function_name = aws_lambda_function.notifications.function_name

  # Two attempts beyond the first. More only delays reaching the dead-letter
  # queue for an error that will not resolve itself.
  maximum_retry_attempts = 2

  destination_config {
    on_failure {
      destination = aws_sqs_queue.notifications_dlq.arn
    }
  }
}

resource "aws_sns_topic_subscription" "notifications" {
  topic_arn = aws_sns_topic.service_order_events.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.notifications.arn
}

# Without this permission the subscription exists and SNS can never invoke:
# a silent failure, because nothing on the topic shows the problem.
resource "aws_lambda_permission" "sns_invoke" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notifications.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.service_order_events.arn
}

resource "aws_cloudwatch_log_group" "notifications" {
  name              = "/aws/lambda/${aws_lambda_function.notifications.function_name}"
  retention_in_days = 1
}
