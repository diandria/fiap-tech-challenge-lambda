# The Learner Lab does not allow creating IAM roles: the function assumes LabRole.
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
  description   = "Issues the customer JWT from a CPF"
  role          = data.aws_iam_role.lab.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime

  filename = data.archive_file.auth.output_path

  # Required. Without it Terraform does not notice the code changed and the
  # deploy updates nothing, with the workflow still green.
  source_code_hash = data.archive_file.auth.output_base64sha256

  # Synchronous behind the API Gateway, which cuts off at 29s. Ten seconds leave
  # room for the lookup (3s) and the signing without holding the connection.
  timeout     = 10
  memory_size = 256

  # No vpc_config, a direct consequence of ADR-002: the function does not touch
  # the database, so a VPC placement would only add an ENI and cold start.

  environment {
    variables = {
      APP_BASE_URL   = local.app_base_url
      JWT_SECRET     = random_password.jwt_secret.result
      INTERNAL_TOKEN = random_password.internal_token.result

      # Semantic convention, with a distinct service.name per function.
      OTEL_SERVICE_NAME = "car-repair-shop-auth"
    }
  }
}

# Without a declared group, Lambda creates one with infinite retention, and
# logs nobody deletes become cost nobody notices.
resource "aws_cloudwatch_log_group" "auth" {
  name              = "/aws/lambda/${aws_lambda_function.auth.function_name}"
  retention_in_days = 1
}
