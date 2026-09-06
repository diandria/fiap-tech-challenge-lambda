# Single source of truth for the two shared secrets.
#
# JWT_SECRET has to match the application's, which validates the token this
# function signs. Two copies would diverge, and the failure mode is bad: the
# token is signed successfully and rejected on the other side.
#
# Generated here and published to SSM, so the application reads the same
# parameter and nobody copies anything.
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
  description = "Signing secret for the customer JWT. Read by the function and the application."
  type        = "SecureString"
  value       = random_password.jwt_secret.result
}

resource "aws_ssm_parameter" "internal_token" {
  name        = "/car-repair-shop/auth/internal-token"
  description = "Secret that authenticates the function on the internal lookup endpoint."
  type        = "SecureString"
  value       = random_password.internal_token.result
}
