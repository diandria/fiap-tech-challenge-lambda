# O Learner Lab nao permite criar role de IAM: a function assume a LabRole.
data "aws_iam_role" "lab" {
  name = "LabRole"
}

data "archive_file" "auth" {
  type        = "zip"
  source_file = "${path.module}/../functions/auth/dist/index.js"
  output_path = "${path.module}/auth.zip"
}

resource "aws_lambda_function" "auth" {
  function_name = "car-repair-shop-auth"
  description   = "Emite o JWT de cliente a partir do CPF"
  role          = data.aws_iam_role.lab.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime

  filename = data.archive_file.auth.output_path

  # Obrigatorio. Sem isto o Terraform nao percebe que o codigo mudou, e o
  # deploy nao atualiza nada -- com o workflow verde. E o pior tipo de falha:
  # silenciosa e com aparencia de sucesso.
  source_code_hash = data.archive_file.auth.output_base64sha256

  # Sincrona atras do API Gateway, que corta em 29s. Dez segundos deixam margem
  # para o lookup (3s) e a assinatura, sem prender a conexao ate o limite.
  timeout     = 10
  memory_size = 256

  # Sem vpc_config, e isso e consequencia direta do ADR-002: a function nao
  # toca o banco. Colocar a function na VPC so acrescentaria ENI e cold start.

  environment {
    variables = {
      APP_BASE_URL   = var.app_base_url
      JWT_SECRET     = random_password.jwt_secret.result
      INTERNAL_TOKEN = random_password.internal_token.result

      # Convencao semantica, com service.name distinto por function.
      OTEL_SERVICE_NAME = "car-repair-shop-auth"
    }
  }
}

# Sem grupo declarado, a Lambda cria um com retencao infinita -- e log que
# ninguem apaga vira custo que ninguem nota.
resource "aws_cloudwatch_log_group" "auth" {
  name              = "/aws/lambda/${aws_lambda_function.auth.function_name}"
  retention_in_days = 1
}
