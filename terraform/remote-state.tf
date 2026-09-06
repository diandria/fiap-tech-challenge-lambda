# The gateway address changes every time it is recreated. A fixed value in
# tfvars diverges silently on the next recreation, and the function then queries
# an address that no longer exists. Reading it from the cluster repository's
# state keeps it current.
data "terraform_remote_state" "k8s" {
  backend = "s3"

  config = {
    bucket = "fiap-tech-challenge-tfstate-108337503570"
    key    = "infra-k8s/terraform.tfstate"
    region = "us-east-1"
  }
}

locals {
  # The variable still exists for pointing somewhere else, such as a local
  # environment; empty, it uses the real gateway.
  app_base_url = coalesce(var.app_base_url, data.terraform_remote_state.k8s.outputs.api_gateway_url)
}
