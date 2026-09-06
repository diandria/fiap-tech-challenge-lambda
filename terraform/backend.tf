terraform {
  backend "s3" {
    bucket = "fiap-tech-challenge-tfstate-108337503570"
    key    = "lambda/terraform.tfstate"
    region = "us-east-1"

    encrypt = true

    # Native S3 locking. dynamodb_table was deprecated by Terraform; same
    # decision as the other infrastructure repositories.
    use_lockfile = true
  }
}
