# Fonte unica de verdade para os dois segredos compartilhados.
#
# O JWT_SECRET precisa ser identico ao da aplicacao: ela valida o token que
# esta function assina. Copiar o mesmo texto para dois lugares cria duas fontes
# de verdade, e o modo de falha e ruim -- o token e assinado com sucesso e
# recusado do outro lado, com erro que nao aponta para a causa.
#
# Gerando aqui e publicando no SSM, ninguem precisa copiar nada: a aplicacao
# (M8) le o mesmo parametro. Mesma solucao que o repositorio do banco usa para
# a senha do Postgres desde o M4.
resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "random_password" "internal_token" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "jwt_secret" {
  name        = "/car-repair-shop/auth/jwt-secret"
  description = "Segredo de assinatura do JWT de cliente. Lido pela function e pela aplicacao."
  type        = "SecureString"
  value       = random_password.jwt_secret.result
}

resource "aws_ssm_parameter" "internal_token" {
  name        = "/car-repair-shop/auth/internal-token"
  description = "Segredo que autentica a function no endpoint interno de lookup."
  type        = "SecureString"
  value       = random_password.internal_token.result
}
