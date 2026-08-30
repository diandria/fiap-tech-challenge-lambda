# Topico onde a aplicacao publica eventos de ordem de servico. E a fronteira
# assincrona do ADR-003: a aplicacao publica e segue: nao espera a notificacao.
resource "aws_sns_topic" "service_order_events" {
  name = "car-repair-shop-service-order-events"
}

# Sem dead-letter, um evento que falha nas tentativas desaparece em silencio --
# e a entrega confiavel que justifica o ADR-003 deixa de existir.
resource "aws_sqs_queue" "notifications_dlq" {
  name = "car-repair-shop-notifications-dlq"

  # Uma semana e tempo suficiente para alguem notar e investigar.
  message_retention_seconds = 604800
}

data "archive_file" "notifications" {
  type        = "zip"
  source_file = "${path.module}/../functions/notifications/dist/index.js"
  output_path = "${path.module}/notifications.zip"
}

resource "aws_lambda_function" "notifications" {
  function_name = "car-repair-shop-notifications"
  description   = "Formata e entrega notificacoes de ordem de servico"
  role          = data.aws_iam_role.lab.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime

  filename = data.archive_file.notifications.output_path

  # Sem isto o Terraform nao percebe que o codigo mudou, e o deploy nao
  # atualiza nada -- com o workflow verde.
  source_code_hash = data.archive_file.notifications.output_base64sha256

  # Assincrona: nao ha conexao esperando do outro lado, entao o limite pode ser
  # mais folgado que o da function sincrona.
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

  # Duas tentativas alem da primeira. Mais que isso so atrasa a chegada na
  # dead-letter para erro que nao vai se resolver sozinho.
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

# Sem esta permissao a assinatura existe e o SNS nunca consegue invocar --
# falha silenciosa, porque nada no topico indica o problema.
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
