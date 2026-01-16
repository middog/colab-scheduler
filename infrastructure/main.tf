# =============================================================================
# SDCoLab Scheduler - Infrastructure
# 
# OpenTofu/Terraform configuration for serverless deployment
# 
# 🔥 Fire Triangle: FUEL layer - cloud infrastructure
# =============================================================================

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.21.0"  # Required for nodejs24.x Lambda runtime support (added in 6.21.0)
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      project           = "sdcolab-scheduler"
      environment       = var.environment
      "sdcolab-managed" = "true"
      managed-by        = "terraform"
    }
  }
}

# Required for CloudFront ACM certificates (must be us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  
  default_tags {
    tags = {
      project           = "sdcolab-scheduler"
      environment       = var.environment
      "sdcolab-managed" = "true"
      managed-by        = "terraform"
    }
  }
}

# =============================================================================
# Variables
# =============================================================================

variable "aws_region"   { default = "us-west-2" }
variable "environment"  { default = "dev" }
variable "project_name" { default = "colab-scheduler" }

# Custom domain (computed from dns.tf or override)
# When using dns.tf, this is automatically set to dns_subdomain.dns_zone_name
variable "domain_name"      { default = "" }
variable "certificate_arn"  { default = "" }

# Hosting option: "amplify" (HTTPS, recommended) or "s3" (HTTP only, no verification needed)
variable "hosting_type" { default = "amplify" }

# CloudFront (only used if hosting_type="s3" and you want HTTPS)
variable "enable_cloudfront" { default = false }

# Scheduler API key for automated jobs (reminders, cert warnings)
variable "scheduler_api_key" {
  description = "API key for scheduled Lambda invocations (reminders, cert warnings)"
  default     = ""
  sensitive   = true
}

# Feature flags
variable "enable_gcal"      { default = false }
variable "enable_github"    { default = false }
variable "enable_slack"     { default = false }
variable "enable_email"     { default = false }
variable "enable_audit_log" { default = true }

# Auth providers
variable "enable_auth_email"     { default = true }
variable "enable_auth_google"    { default = false }
variable "enable_auth_microsoft" { default = false }
variable "enable_auth_github"    { default = false }
variable "enable_auth_oidc"      { default = false }

# Google OAuth
variable "google_client_id"     { default = "" }
variable "google_client_secret" {
  default   = ""
  sensitive = true
}

# Microsoft OAuth  
variable "microsoft_client_id"     { default = "" }
variable "microsoft_client_secret" {
  default   = ""
  sensitive = true
}
variable "microsoft_tenant_id" { default = "common" }

# GitHub OAuth
variable "github_oauth_client_id"     { default = "" }
variable "github_oauth_client_secret" {
  default   = ""
  sensitive = true
}

# Google Calendar
variable "gcal_auth_method"           { default = "workload_identity" }
variable "gcal_project_number"        { default = "" }
variable "gcal_pool_id"               { default = "sdcolab-aws-pool" }
variable "gcal_provider_id"           { default = "aws-lambda" }
variable "gcal_service_account_email" { default = "" }
variable "gcal_client_email"          { default = "" }
variable "gcal_private_key" {
  default   = ""
  sensitive = true
}
variable "gcal_primary_calendar_id" { default = "primary" }

# GitHub Integration
variable "github_token" {
  default   = ""
  sensitive = true
}
variable "github_org"  { default = "middog" }
variable "github_repo" { default = "sdcap-governance" }
variable "enable_github_discussions" { 
  description = "Enable GitHub Discussions sync for governance/feedback"
  default     = false 
}

# Slack
variable "slack_webhook_url" {
  default   = ""
  sensitive = true
}
variable "slack_channel" { default = "#colab-bookings" }

# v4.2.0 Reliability Features
variable "enable_reliability_infrastructure" {
  description = "Enable DynamoDB idempotency/ratelimit tables and SQS queue"
  default     = true
}

# JWT
variable "jwt_secret" {
  description = "JWT signing secret - REQUIRED for production environments"
  default     = ""
  sensitive   = true
}

# =============================================================================
# Production Validations
# =============================================================================

# Fail deployment if production environment is missing required secrets
locals {
  is_production = var.environment == "prod" || var.environment == "production"
  
  # Validation checks
  jwt_secret_check = local.is_production && var.jwt_secret == "" ? tobool("ERROR: jwt_secret is required for production. Set TF_VAR_jwt_secret or pass -var='jwt_secret=...'") : true
  domain_check = local.is_production && var.domain_name == "" && !var.manage_dns ? tobool("ERROR: domain_name or manage_dns is required for production (no CORS wildcard)") : true
}

locals {
  prefix = "${var.project_name}-${var.environment}"
  
  # Use provided secret or generate one (with warning for prod)
  jwt_secret = var.jwt_secret != "" ? var.jwt_secret : "sdcolab-${var.environment}-${random_string.jwt_secret.result}"
  scheduler_api_key = var.scheduler_api_key != "" ? var.scheduler_api_key : "scheduler-${var.environment}-${random_string.scheduler_key.result}"
  
  # Compute the effective domain name
  # Priority: explicit domain_name > dns.tf full_domain (environment-aware) > empty
  # Note: local.full_domain from dns.tf already includes environment prefix for non-prod
  effective_domain = var.domain_name != "" ? var.domain_name : (
    var.manage_dns && var.dns_subdomain != "" 
    ? local.full_domain  # Uses environment-aware domain from dns.tf
    : (var.manage_dns ? var.dns_zone_name : "")
  )
  
  # Compute effective certificate ARN
  # Priority: explicit certificate_arn > dns.tf managed cert > empty
  effective_cert_arn = var.certificate_arn != "" ? var.certificate_arn : (
    var.hosting_type == "s3" && var.enable_cloudfront && var.manage_dns 
    ? try(aws_acm_certificate.frontend[0].arn, "") 
    : ""
  )
  
  # CORS: Never use wildcard in production
  cors_origins = local.effective_domain != "" ? ["https://${local.effective_domain}"] : (
    local.is_production ? ["https://placeholder.invalid"] : ["*"]
  )
}

resource "random_string" "jwt_secret" {
  length  = 32
  special = false
}

resource "random_string" "scheduler_key" {
  length  = 32
  special = false
}

# =============================================================================
# DynamoDB Tables
# =============================================================================

resource "aws_dynamodb_table" "bookings" {
  name         = "${local.prefix}-bookings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  attribute {
    name = "userEmail"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }
  
  # Multi-tenant support: organization ID
  attribute {
    name = "orgId"
    type = "S"
  }
  
  # Composite key for availability search: date#resourceId
  attribute {
    name = "dateResourceKey"
    type = "S"
  }

  global_secondary_index {
    name            = "date-index"
    hash_key        = "date"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "user-index"
    hash_key        = "userEmail"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }
  
  # Multi-tenant index: query all bookings for an organization
  global_secondary_index {
    name            = "org-date-index"
    hash_key        = "orgId"
    range_key       = "date"
    projection_type = "ALL"
  }
  
  # Availability search: query by date+resource for conflict detection
  global_secondary_index {
    name            = "dateResource-index"
    hash_key        = "dateResourceKey"
    projection_type = "ALL"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    FireElement = "FUEL"
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "${local.prefix}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "role"
    type = "S"
  }
  
  # Multi-tenant support
  attribute {
    name = "orgId"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "role-index"
    hash_key        = "role"
    projection_type = "ALL"
  }
  
  # Multi-tenant: query users by organization
  global_secondary_index {
    name            = "org-index"
    hash_key        = "orgId"
    projection_type = "ALL"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    FireElement = "HEAT"
  }
}

resource "aws_dynamodb_table" "activity" {
  name         = "${local.prefix}-activity"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "actorId"
    type = "S"
  }

  attribute {
    name = "category"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  global_secondary_index {
    name            = "actor-index"
    hash_key        = "actorId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "category-index"
    hash_key        = "category"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "date-index"
    hash_key        = "date"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    FireElement = "OXYGEN"
  }
}

resource "aws_dynamodb_table" "invites" {
  name         = "${local.prefix}-invites"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    FireElement = "HEAT"
  }
}

resource "aws_dynamodb_table" "certifications" {
  name         = "${local.prefix}-certifications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "recordType"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "recordType-index"
    hash_key        = "recordType"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    FireElement = "OXYGEN"
  }
}

# =============================================================================
# v4.2.0 Reliability Infrastructure
# =============================================================================

# Idempotency Table - prevents duplicate requests
resource "aws_dynamodb_table" "idempotency" {
  count        = var.enable_reliability_infrastructure ? 1 : 0
  name         = "${local.prefix}-idempotency"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idempotencyKey"

  attribute {
    name = "idempotencyKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Request deduplication"
  }
}

# Rate Limit Table - fallback rate limiting (primary should be API Gateway)
resource "aws_dynamodb_table" "ratelimit" {
  count        = var.enable_reliability_infrastructure ? 1 : 0
  name         = "${local.prefix}-ratelimit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "rateLimitKey"

  attribute {
    name = "rateLimitKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Rate limit counters"
  }
}

# =============================================================================
# v4.3.0 Sessions Table - Server-side refresh token storage
# =============================================================================

# Sessions Table - stores refresh tokens for revocation and rotation
resource "aws_dynamodb_table" "sessions" {
  name         = "${local.prefix}-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"

  attribute {
    name = "sessionId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  # GSI for listing/revoking all sessions for a user
  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  # TTL for automatic session expiry
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "User session management"
    FireElement = "OXYGEN"
  }
}

# SQS Queue - async notifications (Slack, non-critical emails)
resource "aws_sqs_queue" "integrations" {
  count                      = var.enable_reliability_infrastructure ? 1 : 0
  name                       = "${local.prefix}-integrations"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 86400  # 1 day
  receive_wait_time_seconds  = 20     # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.integrations_dlq[0].arn
    maxReceiveCount     = 3
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Async integration notifications"
  }
}

# Dead Letter Queue for failed notifications
resource "aws_sqs_queue" "integrations_dlq" {
  count                     = var.enable_reliability_infrastructure ? 1 : 0
  name                      = "${local.prefix}-integrations-dlq"
  message_retention_seconds = 1209600  # 14 days

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Failed notification messages"
  }
}

# =============================================================================
# Lambda Function
# =============================================================================

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "lambda" {
  name = "${local.prefix}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "${local.prefix}-lambda-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.bookings.arn,
          "${aws_dynamodb_table.bookings.arn}/index/*",
          aws_dynamodb_table.users.arn,
          "${aws_dynamodb_table.users.arn}/index/*",
          aws_dynamodb_table.activity.arn,
          "${aws_dynamodb_table.activity.arn}/index/*",
          aws_dynamodb_table.invites.arn,
          "${aws_dynamodb_table.invites.arn}/index/*",
          aws_dynamodb_table.certifications.arn,
          "${aws_dynamodb_table.certifications.arn}/index/*",
          # v4.3.0 Sessions table
          aws_dynamodb_table.sessions.arn,
          "${aws_dynamodb_table.sessions.arn}/index/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["sts:GetCallerIdentity"]
        Resource = "*"
      }
    ],
    # v4.2.0 Reliability infrastructure permissions
    var.enable_reliability_infrastructure ? [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.idempotency[0].arn,
          aws_dynamodb_table.ratelimit[0].arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.integrations[0].arn
        ]
      }
    ] : [])
  })
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/dist"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_lambda_function" "api" {
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  function_name    = "${local.prefix}-api"
  role            = aws_iam_role.lambda.arn
  handler         = "index.handler"
  runtime         = "nodejs24.x"
  timeout         = 30
  memory_size     = 512

  environment {
    variables = {
      NODE_ENV = var.environment
      # NOTE: Do NOT set AWS_REGION - it's a reserved Lambda variable
      
      # Tables
      USERS_TABLE    = aws_dynamodb_table.users.name
      BOOKINGS_TABLE = aws_dynamodb_table.bookings.name
      ACTIVITY_TABLE = aws_dynamodb_table.activity.name
      INVITES_TABLE  = aws_dynamodb_table.invites.name
      CERTS_TABLE    = aws_dynamodb_table.certifications.name
      SESSIONS_TABLE = aws_dynamodb_table.sessions.name
      
      # v4.2.0 Reliability tables
      IDEMPOTENCY_TABLE     = var.enable_reliability_infrastructure ? aws_dynamodb_table.idempotency[0].name : ""
      RATE_LIMIT_TABLE      = var.enable_reliability_infrastructure ? aws_dynamodb_table.ratelimit[0].name : ""
      INTEGRATION_QUEUE_URL = var.enable_reliability_infrastructure ? aws_sqs_queue.integrations[0].url : ""
      
      # Auth
      JWT_SECRET       = local.jwt_secret
      SCHEDULER_API_KEY = local.scheduler_api_key
      BASE_URL         = local.api_domain_enabled ? "https://${local.api_domain}" : "https://${aws_apigatewayv2_api.api.id}.execute-api.${var.aws_region}.amazonaws.com"
      FRONTEND_URL     = local.effective_domain != "" ? "https://${local.effective_domain}" : (var.hosting_type == "amplify" ? "https://main.${aws_amplify_app.frontend[0].default_domain}" : (var.enable_cloudfront ? "https://${aws_cloudfront_distribution.frontend[0].domain_name}" : "http://${aws_s3_bucket.frontend[0].bucket}.s3-website-${var.aws_region}.amazonaws.com"))
      ALLOWED_ORIGINS  = local.effective_domain != "" ? "https://${local.effective_domain}" : (local.is_production ? "https://placeholder.invalid" : "*")
      IS_PRODUCTION    = tostring(local.is_production)
      
      # Auth Providers
      ENABLE_AUTH_EMAIL     = tostring(var.enable_auth_email)
      ENABLE_AUTH_GOOGLE    = tostring(var.enable_auth_google)
      ENABLE_AUTH_MICROSOFT = tostring(var.enable_auth_microsoft)
      ENABLE_AUTH_GITHUB    = tostring(var.enable_auth_github)
      ENABLE_AUTH_OIDC      = tostring(var.enable_auth_oidc)
      
      GOOGLE_CLIENT_ID           = var.google_client_id
      GOOGLE_CLIENT_SECRET       = var.google_client_secret
      MICROSOFT_CLIENT_ID        = var.microsoft_client_id
      MICROSOFT_CLIENT_SECRET    = var.microsoft_client_secret
      MICROSOFT_TENANT_ID        = var.microsoft_tenant_id
      GITHUB_OAUTH_CLIENT_ID     = var.github_oauth_client_id
      GITHUB_OAUTH_CLIENT_SECRET = var.github_oauth_client_secret
      
      # Feature flags
      ENABLE_GCAL              = tostring(var.enable_gcal)
      ENABLE_GITHUB            = tostring(var.enable_github)
      ENABLE_SLACK             = tostring(var.enable_slack)
      ENABLE_EMAIL             = tostring(var.enable_email)
      ENABLE_ACTIVITY_LOG      = tostring(var.enable_audit_log)
      ENABLE_SELF_REGISTRATION = "true"
      ENABLE_CERTIFICATIONS    = "true"
      
      # Google Calendar
      GCAL_AUTH_METHOD           = var.gcal_auth_method
      GCAL_PROJECT_NUMBER        = var.gcal_project_number
      GCAL_POOL_ID               = var.gcal_pool_id
      GCAL_PROVIDER_ID           = var.gcal_provider_id
      GCAL_SERVICE_ACCOUNT_EMAIL = var.gcal_service_account_email
      GOOGLE_CLIENT_EMAIL        = var.gcal_client_email
      GOOGLE_PRIVATE_KEY         = var.gcal_private_key
      GCAL_PRIMARY_CALENDAR_ID   = var.gcal_primary_calendar_id
      
      # GitHub
      GITHUB_TOKEN = var.github_token
      GITHUB_ORG   = var.github_org
      GITHUB_REPO  = var.github_repo
      ENABLE_GITHUB_DISCUSSIONS = tostring(var.enable_github_discussions)
      
      # Slack
      SLACK_WEBHOOK_URL = var.slack_webhook_url
      SLACK_CHANNEL     = var.slack_channel
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# =============================================================================
# SQS Worker Lambda (processes queued notifications)
# =============================================================================

resource "aws_iam_role" "worker" {
  count = var.enable_reliability_infrastructure ? 1 : 0
  name  = "${local.prefix}-worker-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "worker" {
  count = var.enable_reliability_infrastructure ? 1 : 0
  name  = "${local.prefix}-worker-policy"
  role  = aws_iam_role.worker[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.integrations[0].arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "worker" {
  count            = var.enable_reliability_infrastructure ? 1 : 0
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  function_name    = "${local.prefix}-worker"
  role             = aws_iam_role.worker[0].arn
  handler          = "worker.handler"
  runtime          = "nodejs24.x"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      NODE_ENV = var.environment
      
      # Slack
      SLACK_WEBHOOK_URL = var.slack_webhook_url
      SLACK_CHANNEL     = var.slack_channel
      
      # Email
      ENABLE_EMAIL  = tostring(var.enable_email)
      SES_FROM_EMAIL = "noreply@${local.effective_domain != "" ? local.effective_domain : "sdcolab.org"}"
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Process async notifications"
  }
}

# SQS trigger for worker Lambda
resource "aws_lambda_event_source_mapping" "sqs_worker" {
  count            = var.enable_reliability_infrastructure ? 1 : 0
  event_source_arn = aws_sqs_queue.integrations[0].arn
  function_name    = aws_lambda_function.worker[0].arn
  batch_size       = 10
  
  # Enable partial batch failure reporting
  function_response_types = ["ReportBatchItemFailures"]
}

# =============================================================================
# API Gateway
# =============================================================================

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins     = local.cors_origins
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization", "X-Request-ID", "X-Idempotency-Key"]
    allow_credentials = true
    max_age           = 86400
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.api.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# =============================================================================
# Amplify Hosting (HTTPS automatically)
# =============================================================================

resource "aws_amplify_app" "frontend" {
  count = var.hosting_type == "amplify" ? 1 : 0
  name  = "${local.prefix}-frontend"

  # Manual deployment (we upload via CLI, not git)
  platform = "WEB"

  # SPA rewrite rule
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }

  # Environment variables available at build time (not needed for manual deploy)
  environment_variables = {
    VITE_API_URL = "${aws_apigatewayv2_api.api.api_endpoint}/api"
    VITE_CUSTOM_DOMAIN = local.effective_domain
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_amplify_branch" "main" {
  count       = var.hosting_type == "amplify" ? 1 : 0
  app_id      = aws_amplify_app.frontend[0].id
  branch_name = "main"

  # Enable auto-build if connected to git (we're doing manual deploys)
  enable_auto_build = false

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# =============================================================================
# S3 Frontend Hosting (HTTP or with CloudFront for HTTPS)
# =============================================================================

resource "aws_s3_bucket" "frontend" {
  count  = var.hosting_type == "s3" ? 1 : 0
  bucket = "${local.prefix}-frontend-${data.aws_caller_identity.current.account_id}"
}

# When using CloudFront: block all public access (CloudFront uses OAC)
resource "aws_s3_bucket_public_access_block" "frontend_private" {
  count  = var.hosting_type == "s3" && var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# When NOT using CloudFront: allow public access for website hosting
resource "aws_s3_bucket_public_access_block" "frontend_public" {
  count  = var.hosting_type == "s3" && !var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# S3 website configuration (only when not using CloudFront)
resource "aws_s3_bucket_website_configuration" "frontend" {
  count  = var.hosting_type == "s3" && !var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# Public bucket policy (only when not using CloudFront)
resource "aws_s3_bucket_policy" "frontend_public" {
  count      = var.hosting_type == "s3" && !var.enable_cloudfront ? 1 : 0
  bucket     = aws_s3_bucket.frontend[0].id
  depends_on = [aws_s3_bucket_public_access_block.frontend_public]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend[0].arn}/*"
    }]
  })
}

# =============================================================================
# CloudFront Distribution (HTTPS for S3) - Optional
# =============================================================================

resource "aws_cloudfront_origin_access_control" "frontend" {
  count                             = var.hosting_type == "s3" && var.enable_cloudfront ? 1 : 0
  name                              = "${local.prefix}-oac"
  description                       = "OAC for ${local.prefix} frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  count               = var.hosting_type == "s3" && var.enable_cloudfront ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  
  aliases = local.effective_domain != "" ? [local.effective_domain] : []

  origin {
    domain_name              = aws_s3_bucket.frontend[0].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id
    origin_id                = "S3-${aws_s3_bucket.frontend[0].id}"
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.frontend[0].id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA routing - serve index.html for all 404s
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.effective_cert_arn == ""
    acm_certificate_arn            = local.effective_cert_arn != "" ? local.effective_cert_arn : null
    ssl_support_method             = local.effective_cert_arn != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# CloudFront bucket policy (only when using CloudFront)
resource "aws_s3_bucket_policy" "frontend_cloudfront" {
  count  = var.hosting_type == "s3" && var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipal"
      Effect    = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend[0].arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend[0].arn
        }
      }
    }]
  })
}

# =============================================================================
# Scheduled Events (Reminders & Cert Warnings)
# =============================================================================

variable "enable_scheduled_reminders" {
  description = "Enable automated booking reminders and cert warnings"
  default     = true
}

variable "reminder_schedule" {
  description = "Cron schedule for booking reminders (default: 9 AM UTC daily)"
  default     = "cron(0 9 * * ? *)"
}

variable "cert_warning_schedule" {
  description = "Cron schedule for cert expiry warnings (default: 9 AM UTC on Mondays)"
  default     = "cron(0 9 ? * MON *)"
}

# Booking reminders - runs daily
resource "aws_cloudwatch_event_rule" "booking_reminders" {
  count               = var.enable_scheduled_reminders ? 1 : 0
  name                = "${local.prefix}-booking-reminders"
  description         = "Send booking reminders for tomorrow's bookings"
  schedule_expression = var.reminder_schedule

  tags = {
    Project     = var.project_name
    Environment = var.environment
    FireElement = "OXYGEN"
  }
}

resource "aws_cloudwatch_event_target" "booking_reminders" {
  count     = var.enable_scheduled_reminders ? 1 : 0
  rule      = aws_cloudwatch_event_rule.booking_reminders[0].name
  target_id = "SendBookingReminders"
  arn       = aws_lambda_function.api.arn

  input = jsonencode({
    resource                        = "/api/notifications/send-reminders"
    path                            = "/api/notifications/send-reminders"
    httpMethod                      = "POST"
    headers                         = { "x-api-key" = local.scheduler_api_key, "Content-Type" = "application/json" }
    body                            = "{\"type\":\"booking\"}"
    isBase64Encoded                 = false
    requestContext                  = { http = { method = "POST", path = "/api/notifications/send-reminders" } }
  })
}

resource "aws_lambda_permission" "allow_eventbridge_reminders" {
  count         = var.enable_scheduled_reminders ? 1 : 0
  statement_id  = "AllowEventBridgeBookingReminders"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.booking_reminders[0].arn
}

# Certification expiry warnings - runs weekly
resource "aws_cloudwatch_event_rule" "cert_warnings" {
  count               = var.enable_scheduled_reminders ? 1 : 0
  name                = "${local.prefix}-cert-warnings"
  description         = "Send certification expiry warnings"
  schedule_expression = var.cert_warning_schedule

  tags = {
    Project     = var.project_name
    Environment = var.environment
    FireElement = "OXYGEN"
  }
}

resource "aws_cloudwatch_event_target" "cert_warnings" {
  count     = var.enable_scheduled_reminders ? 1 : 0
  rule      = aws_cloudwatch_event_rule.cert_warnings[0].name
  target_id = "SendCertWarnings"
  arn       = aws_lambda_function.api.arn

  input = jsonencode({
    resource                        = "/api/notifications/send-cert-warnings"
    path                            = "/api/notifications/send-cert-warnings"
    httpMethod                      = "POST"
    headers                         = { "x-api-key" = local.scheduler_api_key, "Content-Type" = "application/json" }
    body                            = "{}"
    isBase64Encoded                 = false
    requestContext                  = { http = { method = "POST", path = "/api/notifications/send-cert-warnings" } }
  })
}

resource "aws_lambda_permission" "allow_eventbridge_cert_warnings" {
  count         = var.enable_scheduled_reminders ? 1 : 0
  statement_id  = "AllowEventBridgeCertWarnings"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cert_warnings[0].arn
}

# =============================================================================
# CloudWatch Alarms (Reliability Monitoring)
# =============================================================================

# Alarm for DLQ messages (failed notifications)
resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  count               = var.enable_reliability_infrastructure ? 1 : 0
  alarm_name          = "${local.prefix}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Notifications are failing and going to DLQ"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.integrations_dlq[0].name
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Alarm for worker Lambda errors
resource "aws_cloudwatch_metric_alarm" "worker_errors" {
  count               = var.enable_reliability_infrastructure ? 1 : 0
  alarm_name          = "${local.prefix}-worker-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Worker Lambda is experiencing errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.worker[0].function_name
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Alarm for API Lambda errors
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${local.prefix}-api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "API Lambda is experiencing elevated errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# =============================================================================
# Outputs
# =============================================================================

output "api_endpoint" {
  value       = local.api_domain_enabled ? "https://${local.api_domain}" : aws_apigatewayv2_api.api.api_endpoint
  description = "API endpoint URL (custom domain if enabled)"
}

output "api_endpoint_raw" {
  value       = aws_apigatewayv2_api.api.api_endpoint
  description = "Raw API Gateway endpoint URL (always available)"
}

output "hosting_type" {
  value       = var.hosting_type
  description = "Frontend hosting type (amplify or s3)"
}

output "amplify_app_id" {
  value       = var.hosting_type == "amplify" ? aws_amplify_app.frontend[0].id : ""
  description = "Amplify app ID (for deployments)"
}

output "amplify_branch" {
  value       = var.hosting_type == "amplify" ? aws_amplify_branch.main[0].branch_name : ""
  description = "Amplify branch name"
}

output "frontend_bucket" {
  value       = var.hosting_type == "s3" ? aws_s3_bucket.frontend[0].bucket : ""
  description = "Frontend S3 bucket name (empty if using Amplify)"
}

output "frontend_url" {
  value       = local.effective_domain != "" ? "https://${local.effective_domain}" : (var.hosting_type == "amplify" ? "https://${aws_amplify_branch.main[0].branch_name}.${aws_amplify_app.frontend[0].default_domain}" : (var.enable_cloudfront ? "https://${aws_cloudfront_distribution.frontend[0].domain_name}" : "http://${aws_s3_bucket.frontend[0].bucket}.s3-website-${var.aws_region}.amazonaws.com"))
  description = "Frontend URL"
}

output "cloudfront_distribution_id" {
  value       = var.hosting_type == "s3" && var.enable_cloudfront ? aws_cloudfront_distribution.frontend[0].id : ""
  description = "CloudFront distribution ID (empty if not using CloudFront)"
}

output "tables" {
  value = {
    users          = aws_dynamodb_table.users.name
    bookings       = aws_dynamodb_table.bookings.name
    activity       = aws_dynamodb_table.activity.name
    invites        = aws_dynamodb_table.invites.name
    certifications = aws_dynamodb_table.certifications.name
    sessions       = aws_dynamodb_table.sessions.name
    idempotency    = var.enable_reliability_infrastructure ? aws_dynamodb_table.idempotency[0].name : ""
    ratelimit      = var.enable_reliability_infrastructure ? aws_dynamodb_table.ratelimit[0].name : ""
  }
  description = "DynamoDB table names"
}

output "reliability_infrastructure" {
  value = {
    enabled           = var.enable_reliability_infrastructure
    idempotency_table = var.enable_reliability_infrastructure ? aws_dynamodb_table.idempotency[0].name : ""
    ratelimit_table   = var.enable_reliability_infrastructure ? aws_dynamodb_table.ratelimit[0].name : ""
    sqs_queue_url     = var.enable_reliability_infrastructure ? aws_sqs_queue.integrations[0].url : ""
    sqs_dlq_url       = var.enable_reliability_infrastructure ? aws_sqs_queue.integrations_dlq[0].url : ""
    worker_function   = var.enable_reliability_infrastructure ? aws_lambda_function.worker[0].function_name : ""
  }
  description = "v4.2.0 reliability infrastructure"
}
