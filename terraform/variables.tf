variable "aws_region" {
  description = "Regiao AWS. O Learner Lab so libera us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Nome do ambiente, usado em tags."
  type        = string
  default     = "production"
}

variable "app_base_url" {
  description = "Endereco da aplicacao, para o lookup de cliente. Alcancavel pelo API Gateway."
  type        = string
}

variable "jwt_secret" {
  description = <<-TXT
    Segredo de assinatura do JWT.

    Precisa ser identico ao da aplicacao: ela valida com o mesmo segredo. Se
    divergir, o token e assinado com sucesso e recusado do outro lado, com erro
    que nao aponta para a causa.
  TXT
  type        = string
  sensitive   = true
}

variable "internal_token" {
  description = "Segredo que autentica a function no endpoint interno de lookup."
  type        = string
  sensitive   = true
}

variable "lambda_runtime" {
  description = <<-TXT
    Runtime das functions.

    nodejs22.x, e nao nodejs20.x: o 20 foi deprecado pela AWS em 30/abr/2026 --
    sem patches de seguranca, e criacao de novas functions bloqueada a partir
    de fev/2027. Conferir com a tabela de runtimes suportados antes de mudar.
  TXT
  type        = string
  default     = "nodejs22.x"
}
