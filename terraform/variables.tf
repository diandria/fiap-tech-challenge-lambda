variable "aws_region" {
  description = "AWS region. The Learner Lab only allows us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name, used in tags."
  type        = string
  default     = "production"
}

variable "app_base_url" {
  description = <<-TXT
    Application address, used for the customer lookup.

    Empty by default: the real value comes from the cluster repository's state
    and follows the gateway when it is recreated. Set it only to point
    somewhere else.
  TXT
  type        = string
  default     = null
}

variable "lambda_runtime" {
  description = <<-TXT
    Runtime for both functions.

    nodejs22.x, not nodejs20.x: AWS deprecated 20 on 2026-04-30, so it gets no
    security patches and new functions are blocked from 2027-02. Check the
    supported runtime table before changing this.
  TXT
  type        = string
  default     = "nodejs22.x"
}
