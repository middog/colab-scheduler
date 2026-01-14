# =============================================================================
# SDCoLab Scheduler - DNS Configuration
# 
# Manages Route53 records for custom domain deployment.
# Uses existing mid.dog zone in the AWS account.
#
# Frontend: sdcolab.mid.dog
# API:      api.sdcolab.mid.dog
# 
# 🔥 Fire Triangle: FUEL layer - infrastructure routing
# =============================================================================

# =============================================================================
# DNS Variables
# =============================================================================

variable "dns_zone_name" {
  description = "Parent DNS zone name (must exist in Route53)"
  default     = "mid.dog"
}

variable "dns_subdomain" {
  description = "Subdomain to create (e.g., 'sdcolab' creates sdcolab.mid.dog)"
  default     = "sdcolab"
}

variable "manage_dns" {
  description = "Whether to create/manage Route53 records"
  default     = true
}

variable "enable_api_custom_domain" {
  description = "Whether to create a custom domain for the API (api.subdomain.zone)"
  default     = true
}

# Computed full domain for use throughout the config
locals {
  # Full domain name: subdomain.zone (e.g., sdcolab.mid.dog)
  # For non-production environments, include env prefix: dev.sdcolab.mid.dog
  full_domain = var.dns_subdomain != "" ? (
    var.environment == "prod" || var.environment == "production" 
    ? "${var.dns_subdomain}.${var.dns_zone_name}"
    : "${var.environment}.${var.dns_subdomain}.${var.dns_zone_name}"
  ) : var.dns_zone_name
  
  # API domain: api.subdomain.zone (e.g., api.sdcolab.mid.dog)
  # For non-production environments, include env: api.dev.sdcolab.mid.dog
  api_domain = var.dns_subdomain != "" ? (
    var.environment == "prod" || var.environment == "production"
    ? "api.${var.dns_subdomain}.${var.dns_zone_name}"
    : "api.${var.environment}.${var.dns_subdomain}.${var.dns_zone_name}"
  ) : "api.${var.dns_zone_name}"
  
  # Whether DNS management is enabled (based only on variables, not computed values)
  dns_enabled = var.manage_dns && var.dns_subdomain != ""
  
  # Whether API custom domain is enabled
  api_domain_enabled = local.dns_enabled && var.enable_api_custom_domain
}

# =============================================================================
# Route53 Zone Data Source
# =============================================================================

# Look up zone based on variable only (not computed values)
data "aws_route53_zone" "main" {
  count = local.dns_enabled ? 1 : 0
  name  = "${var.dns_zone_name}."
}

# =============================================================================
# CNAME Record for Frontend
# =============================================================================

# Determine the target for the CNAME based on hosting type
# This local is computed at apply time, which is fine for resource creation
locals {
  # Target for CNAME record
  dns_target = (
    var.hosting_type == "amplify" 
    ? try("${aws_amplify_branch.main[0].branch_name}.${aws_amplify_app.frontend[0].default_domain}", "")
    : var.enable_cloudfront 
      ? try(aws_cloudfront_distribution.frontend[0].domain_name, "")
      : ""  # S3 website hosting doesn't support CNAME without CloudFront
  )
}

resource "aws_route53_record" "frontend_cname" {
  count   = local.dns_enabled && var.hosting_type == "amplify" ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = local.full_domain
  type    = "CNAME"
  ttl     = 300
  records = [local.dns_target]
}

# For CloudFront, use an alias record instead of CNAME (required for zone apex)
resource "aws_route53_record" "frontend_alias" {
  count   = local.dns_enabled && var.hosting_type == "s3" && var.enable_cloudfront ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = local.full_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend[0].domain_name
    zone_id                = aws_cloudfront_distribution.frontend[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# =============================================================================
# Amplify Custom Domain (when using Amplify hosting)
# =============================================================================

resource "aws_amplify_domain_association" "main" {
  count = var.hosting_type == "amplify" && local.dns_enabled ? 1 : 0
  
  app_id      = aws_amplify_app.frontend[0].id
  domain_name = local.full_domain
  
  # Wait for DNS record to be created first
  depends_on = [aws_route53_record.frontend_cname]

  sub_domain {
    branch_name = aws_amplify_branch.main[0].branch_name
    prefix      = ""
  }

  # Amplify handles SSL certificate automatically
  wait_for_verification = false
}

# =============================================================================
# ACM Certificate for CloudFront (when using S3 + CloudFront)
# =============================================================================

# Note: For CloudFront, certificate must be in us-east-1
# This is created only when using S3 + CloudFront with custom domain

resource "aws_acm_certificate" "frontend" {
  count    = var.hosting_type == "s3" && var.enable_cloudfront && local.dns_enabled ? 1 : 0
  provider = aws.us_east_1  # Must be us-east-1 for CloudFront
  
  domain_name       = local.full_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# DNS validation record for ACM certificate
resource "aws_route53_record" "cert_validation" {
  for_each = var.hosting_type == "s3" && var.enable_cloudfront && local.dns_enabled ? {
    for dvo in aws_acm_certificate.frontend[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

# Certificate validation
resource "aws_acm_certificate_validation" "frontend" {
  count    = var.hosting_type == "s3" && var.enable_cloudfront && local.dns_enabled ? 1 : 0
  provider = aws.us_east_1
  
  certificate_arn         = aws_acm_certificate.frontend[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# =============================================================================
# API Gateway Custom Domain (api.sdcolab.mid.dog)
# =============================================================================

# ACM Certificate for API (must be in same region as API Gateway)
resource "aws_acm_certificate" "api" {
  count             = local.api_domain_enabled ? 1 : 0
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "API Gateway"
  }
}

# DNS validation for API certificate
resource "aws_route53_record" "api_cert_validation" {
  for_each = local.api_domain_enabled ? {
    for dvo in aws_acm_certificate.api[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

# Wait for API certificate validation
resource "aws_acm_certificate_validation" "api" {
  count                   = local.api_domain_enabled ? 1 : 0
  certificate_arn         = aws_acm_certificate.api[0].arn
  validation_record_fqdns = [for record in aws_route53_record.api_cert_validation : record.fqdn]
}

# API Gateway custom domain name
resource "aws_apigatewayv2_domain_name" "api" {
  count       = local.api_domain_enabled ? 1 : 0
  domain_name = local.api_domain

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api[0].certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Map API Gateway to custom domain
resource "aws_apigatewayv2_api_mapping" "api" {
  count       = local.api_domain_enabled ? 1 : 0
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.api[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

# Route53 record for API custom domain
resource "aws_route53_record" "api" {
  count   = local.api_domain_enabled ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# =============================================================================
# Outputs
# =============================================================================

output "custom_domain" {
  value       = local.dns_enabled ? local.full_domain : ""
  description = "Custom domain name (if DNS management enabled)"
}

output "custom_domain_url" {
  value       = local.dns_enabled ? "https://${local.full_domain}" : ""
  description = "Full HTTPS URL for custom domain"
}

output "api_custom_domain" {
  value       = local.api_domain_enabled ? local.api_domain : ""
  description = "Custom domain for API (if enabled)"
}

output "api_custom_domain_url" {
  value       = local.api_domain_enabled ? "https://${local.api_domain}" : ""
  description = "Full HTTPS URL for API custom domain"
}

output "dns_zone_id" {
  value       = local.dns_enabled ? data.aws_route53_zone.main[0].zone_id : ""
  description = "Route53 zone ID"
}

output "dns_target" {
  value       = local.dns_target
  description = "Target hostname for CNAME record"
}

output "certificate_arn" {
  value       = var.hosting_type == "s3" && var.enable_cloudfront && local.dns_enabled ? aws_acm_certificate.frontend[0].arn : ""
  description = "ACM certificate ARN (for CloudFront)"
}

output "api_certificate_arn" {
  value       = local.api_domain_enabled ? aws_acm_certificate.api[0].arn : ""
  description = "ACM certificate ARN for API domain"
}
