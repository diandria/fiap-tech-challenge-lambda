output "auth_lambda_arn" {
  description = "ARN of the authentication function."
  value       = aws_lambda_function.auth.arn
}

# Consumed by the cluster repository to create the API Gateway AWS_PROXY
# integration.
output "auth_lambda_invoke_arn" {
  description = "Invoke ARN, used by the API Gateway integration."
  value       = aws_lambda_function.auth.invoke_arn
}

output "auth_lambda_function_name" {
  description = "Function name, used by the gateway's aws_lambda_permission."
  value       = aws_lambda_function.auth.function_name
}

# Names, not values. The application reads these parameters to validate the
# token the function signs.
output "jwt_secret_parameter" {
  description = "Name of the SSM parameter holding the JWT secret. Not the secret."
  value       = aws_ssm_parameter.jwt_secret.name
}

output "internal_token_parameter" {
  description = "Name of the SSM parameter holding the internal token. Not the token."
  value       = aws_ssm_parameter.internal_token.name
}

# Consumed by the application to publish the events.
output "sns_topic_arn" {
  description = "Topic where the application publishes service order events."
  value       = aws_sns_topic.service_order_events.arn
}

output "notifications_dlq_url" {
  description = "Dead-letter queue for notifications that failed permanently."
  value       = aws_sqs_queue.notifications_dlq.url
}
