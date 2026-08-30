# O endereco do gateway muda toda vez que ele e recriado. Manter o valor fixo
# no tfvars significa que ele diverge silenciosamente na proxima recriacao --
# e a function passa a consultar um endereco que nao existe mais.
#
# Lendo do estado do repositorio do cluster, o valor acompanha sozinho.
data "terraform_remote_state" "k8s" {
  backend = "s3"

  config = {
    bucket = "fiap-tech-challenge-tfstate-108337503570"
    key    = "infra-k8s/terraform.tfstate"
    region = "us-east-1"
  }
}

locals {
  # A variavel continua existindo para quem precisar apontar para outro lugar
  # (um ambiente local, por exemplo); vazia, usa o gateway de verdade.
  app_base_url = coalesce(var.app_base_url, data.terraform_remote_state.k8s.outputs.api_gateway_url)
}
