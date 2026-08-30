output "auth_lambda_arn" {
  description = "ARN da function de autenticacao."
  value       = aws_lambda_function.auth.arn
}

# Consumido pelo repositorio do cluster (M5.T10) para criar a integracao
# AWS_PROXY do API Gateway.
output "auth_lambda_invoke_arn" {
  description = "ARN de invocacao, usado pela integracao do API Gateway."
  value       = aws_lambda_function.auth.invoke_arn
}

output "auth_lambda_function_name" {
  description = "Nome da function, usado pelo aws_lambda_permission do gateway."
  value       = aws_lambda_function.auth.function_name
}

# Nomes, e nao valores. A aplicacao (M8) le estes parametros para validar o
# token que a function assina.
output "jwt_secret_parameter" {
  description = "Nome do parametro SSM com o segredo do JWT. Nao e o segredo."
  value       = aws_ssm_parameter.jwt_secret.name
}

output "internal_token_parameter" {
  description = "Nome do parametro SSM com o token interno. Nao e o token."
  value       = aws_ssm_parameter.internal_token.name
}
