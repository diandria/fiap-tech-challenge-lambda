terraform {
  backend "s3" {
    bucket = "fiap-tech-challenge-tfstate-108337503570"
    key    = "lambda/terraform.tfstate"
    region = "us-east-1"

    encrypt = true

    # Trava nativa do S3. O dynamodb_table foi deprecado pelo Terraform;
    # mesma decisao dos outros repositorios de infraestrutura.
    use_lockfile = true
  }
}
