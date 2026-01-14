#!/bin/bash

# =============================================================================
# 🔥 SDCoLab Scheduler Deployment Script v4.2.0-rc69.12
# 
# A simplified, robust deployment script with:
# - Terraform plugin caching in ~/.terraform.d
# - Comprehensive resource detection and import
# - Converge-to-spec infrastructure management
# - Duplicate API Gateway detection and cleanup
# - Environment-aware API domain naming (e.g., api.dev.sdcolab.mid.dog)
# 
# Usage:
#   ./deploy.sh                    # Interactive deployment
#   DRY_RUN=true ./deploy.sh       # Preview only (no changes)
#   AUTO_APPROVE=true ./deploy.sh  # Skip confirmations
#   SKIP_INTERACTIVE=true ./deploy.sh  # Use defaults
# =============================================================================

VERSION="4.2.0-rc69.12"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
ENV=${ENV:-dev}
AWS_REGION=${AWS_REGION:-us-west-2}
HOSTING_TYPE=${HOSTING_TYPE:-amplify}
DNS_ZONE_NAME=${DNS_ZONE_NAME:-mid.dog}
DNS_SUBDOMAIN=${DNS_SUBDOMAIN:-sdcolab}
AUTO_APPROVE=${AUTO_APPROVE:-false}
DRY_RUN=${DRY_RUN:-false}
SKIP_INTERACTIVE=${SKIP_INTERACTIVE:-false}
SKIP_IMPORT=${SKIP_IMPORT:-false}

# Feature flags
ENABLE_RELIABILITY=${ENABLE_RELIABILITY:-true}
ENABLE_GITHUB=${ENABLE_GITHUB:-false}
ENABLE_GCAL=${ENABLE_GCAL:-false}
ENABLE_SLACK=${ENABLE_SLACK:-false}
ENABLE_EMAIL=${ENABLE_EMAIL:-false}

# GitHub settings (from env or interactive)
GITHUB_ORG=${GITHUB_ORG:-middog}
GITHUB_REPO=${GITHUB_REPO:-sdcap-governance}
# GITHUB_TOKEN should be set via environment variable

# Slack settings
SLACK_CHANNEL=${SLACK_CHANNEL:-#colab-bookings}
# SLACK_WEBHOOK_URL should be set via environment variable

# Google Calendar settings
GCAL_AUTH_METHOD=${GCAL_AUTH_METHOD:-workload_identity}
GCAL_PRIMARY_CALENDAR_ID=${GCAL_PRIMARY_CALENDAR_ID:-primary}
# Other GCAL_* variables should be set via environment

# Scheduler settings
ENABLE_SCHEDULED_REMINDERS=${ENABLE_SCHEDULED_REMINDERS:-true}

# Terraform plugin cache directory
export TF_PLUGIN_CACHE_DIR="${TF_PLUGIN_CACHE_DIR:-$HOME/.terraform.d/plugin-cache}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# =============================================================================
# Output Helpers
# =============================================================================
log()     { echo -e "$1"; }
step()    { echo -e "${GREEN}▶${NC} $1"; }
substep() { echo -e "  ${CYAN}→${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
error()   { echo -e "${RED}❌ $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
section() { echo ""; echo -e "${BLUE}━━━ ${BOLD}$1${NC} ${BLUE}━━━${NC}"; }

die() { error "$1"; exit 1; }

confirm() {
  [ "$AUTO_APPROVE" = "true" ] && return 0
  local prompt="$1" default="${2:-N}"
  if [ "$default" = "Y" ]; then
    read -p "$prompt [Y/n]: " r
    [[ "$r" =~ ^[Nn] ]] && return 1 || return 0
  else
    read -p "$prompt [y/N]: " r
    [[ "$r" =~ ^[Yy] ]] && return 0 || return 1
  fi
}

# =============================================================================
# Banner
# =============================================================================
print_banner() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  ${BOLD}🔥 SDCoLab Scheduler${NC} v${VERSION}                                ${CYAN}║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
  [ "$DRY_RUN" = "true" ] && echo -e "${YELLOW}🔍 DRY RUN MODE - no changes will be made${NC}"
}

# =============================================================================
# Prerequisites
# =============================================================================
check_prerequisites() {
  section "Prerequisites"
  
  local missing=()
  
  if command -v aws &>/dev/null; then
    substep "AWS CLI: ✓"
  else
    missing+=("aws-cli")
  fi
  
  if command -v tofu &>/dev/null; then
    TF_CMD="tofu"
    substep "OpenTofu: ✓"
  elif command -v terraform &>/dev/null; then
    TF_CMD="terraform"
    substep "Terraform: ✓"
  else
    missing+=("terraform/tofu")
  fi
  
  if command -v node &>/dev/null; then
    substep "Node.js: ✓"
  else
    missing+=("nodejs")
  fi
  
  if command -v jq &>/dev/null; then
    substep "jq: ✓"
  else
    missing+=("jq")
  fi
  
  # Check AWS credentials with timeout
  if timeout 15 aws sts get-caller-identity &>/dev/null; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
    AWS_REGION=$(aws configure get region 2>/dev/null || echo "us-west-2")
    substep "AWS: $AWS_ACCOUNT ($AWS_REGION)"
  else
    die "AWS credentials not configured or timed out"
  fi
  
  if [ ${#missing[@]} -gt 0 ]; then
    die "Missing prerequisites: ${missing[*]}"
  fi
  
  # Setup terraform plugin cache
  if [ ! -d "$TF_PLUGIN_CACHE_DIR" ]; then
    substep "Creating plugin cache: $TF_PLUGIN_CACHE_DIR"
    mkdir -p "$TF_PLUGIN_CACHE_DIR"
  else
    substep "Plugin cache: $TF_PLUGIN_CACHE_DIR ✓"
  fi
  
  success "All prerequisites met"
}

# =============================================================================
# Interactive Configuration
# =============================================================================
interactive_config() {
  [ "$SKIP_INTERACTIVE" = "true" ] && return 0
  [ ! -t 0 ] && return 0  # Not a terminal
  
  section "Configuration"
  
  # 1. Environment
  echo -e "\n${BOLD}1. Environment${NC}"
  read -p "   [1] dev [2] staging [3] production (current: $ENV): " choice
  case "$choice" in
    1) ENV="dev";;
    2) ENV="staging";;
    3) ENV="production";;
  esac
  
  # 2. AWS Region
  echo -e "\n${BOLD}2. AWS Region${NC}"
  read -p "   Region [$AWS_REGION]: " region_input
  AWS_REGION=${region_input:-$AWS_REGION}
  
  # 3. Reliability Infrastructure
  echo -e "\n${BOLD}3. Reliability Infrastructure${NC}"
  if confirm "   Enable? (idempotency, rate limiting, SQS)" "Y"; then
    ENABLE_RELIABILITY=true
  else
    ENABLE_RELIABILITY=false
  fi
  
  # 4. GitHub Integration
  echo -e "\n${BOLD}4. GitHub Integration${NC}"
  if confirm "   Enable GitHub issues sync?"; then
    ENABLE_GITHUB=true
    read -p "   Organization [$GITHUB_ORG]: " org
    GITHUB_ORG=${org:-$GITHUB_ORG}
    read -p "   Repository [$GITHUB_REPO]: " repo
    GITHUB_REPO=${repo:-$GITHUB_REPO}
    
    # Prompt for token if not set
    if [ -z "$GITHUB_TOKEN" ]; then
      echo -e "   ${YELLOW}GitHub token not set in environment${NC}"
      echo -n "   Enter GitHub token (or leave blank to skip): "
      # Use -r to handle backslashes, timeout to prevent hanging
      if read -r -t 120 token_input 2>/dev/null; then
        if [ -n "$token_input" ]; then
          GITHUB_TOKEN="$token_input"
          substep "GitHub token: set ✓"
        else
          warn "   GitHub token not provided - integration will be limited"
        fi
      else
        warn "   Token input timed out or failed - set GITHUB_TOKEN env var instead"
      fi
    else
      substep "GitHub token: configured ✓"
    fi
  else
    ENABLE_GITHUB=false
  fi
  
  # 5. Google Calendar
  echo -e "\n${BOLD}5. Google Calendar${NC}"
  if confirm "   Enable calendar sync?"; then
    ENABLE_GCAL=true
    read -p "   Auth method [${GCAL_AUTH_METHOD}] (workload_identity/service_account): " gcal_auth
    GCAL_AUTH_METHOD=${gcal_auth:-$GCAL_AUTH_METHOD}
    read -p "   Primary calendar ID [${GCAL_PRIMARY_CALENDAR_ID}]: " gcal_cal
    GCAL_PRIMARY_CALENDAR_ID=${gcal_cal:-$GCAL_PRIMARY_CALENDAR_ID}
    
    if [ "$GCAL_AUTH_METHOD" = "workload_identity" ]; then
      read -p "   GCP Project Number: " gcal_proj
      GCAL_PROJECT_NUMBER="$gcal_proj"
      read -p "   Service Account Email: " gcal_sa
      GCAL_SERVICE_ACCOUNT_EMAIL="$gcal_sa"
    fi
  else
    ENABLE_GCAL=false
  fi
  
  # 6. Slack
  echo -e "\n${BOLD}6. Slack${NC}"
  if confirm "   Enable Slack notifications?"; then
    ENABLE_SLACK=true
    read -p "   Channel [${SLACK_CHANNEL}]: " channel
    SLACK_CHANNEL=${channel:-$SLACK_CHANNEL}
    
    if [ -z "$SLACK_WEBHOOK_URL" ]; then
      read -p "   Webhook URL (or leave blank): " webhook
      SLACK_WEBHOOK_URL="$webhook"
    else
      substep "Slack webhook: configured ✓"
    fi
  else
    ENABLE_SLACK=false
  fi
  
  # 7. Domain Configuration
  echo -e "\n${BOLD}7. Domain${NC}: ${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
  if confirm "   Change domain settings?"; then
    read -p "   Zone [${DNS_ZONE_NAME}]: " zone
    DNS_ZONE_NAME=${zone:-$DNS_ZONE_NAME}
    read -p "   Subdomain [${DNS_SUBDOMAIN}]: " subdomain
    DNS_SUBDOMAIN=${subdomain:-$DNS_SUBDOMAIN}
  fi
  
  # 8. Hosting Type
  echo -e "\n${BOLD}8. Hosting Type${NC}: ${HOSTING_TYPE}"
  if confirm "   Change hosting type?"; then
    read -p "   [1] amplify [2] s3 [3] cloudfront (current: $HOSTING_TYPE): " hosting_choice
    case "$hosting_choice" in
      1) HOSTING_TYPE="amplify";;
      2) HOSTING_TYPE="s3";;
      3) HOSTING_TYPE="cloudfront";;
    esac
  fi
  
  # Compute actual domain names based on environment
  local display_domain display_api_domain
  if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
    display_domain="${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
    display_api_domain="api.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
  else
    display_domain="${ENV}.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
    display_api_domain="api.${ENV}.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
  fi
  
  # Summary
  section "Configuration Summary"
  echo "   Environment:    $ENV"
  echo "   AWS Region:     $AWS_REGION"
  echo "   Frontend:       ${display_domain}"
  echo "   API:            ${display_api_domain}"
  echo "   Hosting:        $HOSTING_TYPE"
  echo "   Reliability:    $ENABLE_RELIABILITY"
  echo "   GitHub:         $ENABLE_GITHUB $([ "$ENABLE_GITHUB" = "true" ] && echo "($GITHUB_ORG/$GITHUB_REPO)")"
  [ "$ENABLE_GITHUB" = "true" ] && echo "   GitHub Token:   $([ -n "$GITHUB_TOKEN" ] && echo "configured (${#GITHUB_TOKEN} chars)" || echo "NOT SET")"
  echo "   GCal:           $ENABLE_GCAL $([ "$ENABLE_GCAL" = "true" ] && echo "($GCAL_AUTH_METHOD)")"
  echo "   Slack:          $ENABLE_SLACK $([ "$ENABLE_SLACK" = "true" ] && echo "($SLACK_CHANNEL)")"
  echo ""
  
  confirm "   Proceed with deployment?" "Y" || exit 0
}

# =============================================================================
# Terraform Setup with Plugin Caching
# =============================================================================
setup_terraform() {
  step "Setting up Terraform..."
  cd "$PROJECT_DIR/infrastructure"
  
  # Ensure plugin cache is configured
  export TF_PLUGIN_CACHE_DIR="$TF_PLUGIN_CACHE_DIR"
  
  # Initialize if needed or if .terraform is missing
  if [ ! -d ".terraform" ] || [ ! -f ".terraform.lock.hcl" ]; then
    substep "Running terraform init (using cache: $TF_PLUGIN_CACHE_DIR)..."
    if ! $TF_CMD init -upgrade 2>&1; then
      die "Terraform init failed"
    fi
  else
    substep "Terraform already initialized"
    # Still run init to ensure providers are current
    $TF_CMD init -upgrade >/dev/null 2>&1 || true
  fi
  
  success "Terraform ready"
}

# =============================================================================
# Build Terraform Variables
# =============================================================================
build_tfvars() {
  TFVARS_ARGS=""
  
  # Core settings
  TFVARS_ARGS="$TFVARS_ARGS -var=aws_region=${AWS_REGION}"
  TFVARS_ARGS="$TFVARS_ARGS -var=environment=${ENV}"
  TFVARS_ARGS="$TFVARS_ARGS -var=hosting_type=${HOSTING_TYPE}"
  
  # DNS settings
  TFVARS_ARGS="$TFVARS_ARGS -var=manage_dns=true"
  TFVARS_ARGS="$TFVARS_ARGS -var=dns_zone_name=${DNS_ZONE_NAME}"
  TFVARS_ARGS="$TFVARS_ARGS -var=dns_subdomain=${DNS_SUBDOMAIN}"
  TFVARS_ARGS="$TFVARS_ARGS -var=enable_api_custom_domain=true"
  
  # Reliability infrastructure
  TFVARS_ARGS="$TFVARS_ARGS -var=enable_reliability_infrastructure=${ENABLE_RELIABILITY}"
  
  # GitHub integration
  TFVARS_ARGS="$TFVARS_ARGS -var=enable_github=${ENABLE_GITHUB}"
  if [ "$ENABLE_GITHUB" = "true" ]; then
    TFVARS_ARGS="$TFVARS_ARGS -var=github_org=${GITHUB_ORG}"
    TFVARS_ARGS="$TFVARS_ARGS -var=github_repo=${GITHUB_REPO}"
    [ -n "$GITHUB_TOKEN" ] && TFVARS_ARGS="$TFVARS_ARGS -var=github_token=${GITHUB_TOKEN}"
  fi
  
  # Google Calendar integration
  TFVARS_ARGS="$TFVARS_ARGS -var=enable_gcal=${ENABLE_GCAL}"
  if [ "$ENABLE_GCAL" = "true" ]; then
    TFVARS_ARGS="$TFVARS_ARGS -var=gcal_auth_method=${GCAL_AUTH_METHOD}"
    TFVARS_ARGS="$TFVARS_ARGS -var=gcal_primary_calendar_id=${GCAL_PRIMARY_CALENDAR_ID}"
    [ -n "$GCAL_PROJECT_NUMBER" ] && TFVARS_ARGS="$TFVARS_ARGS -var=gcal_project_number=${GCAL_PROJECT_NUMBER}"
    [ -n "$GCAL_SERVICE_ACCOUNT_EMAIL" ] && TFVARS_ARGS="$TFVARS_ARGS -var=gcal_service_account_email=${GCAL_SERVICE_ACCOUNT_EMAIL}"
    [ -n "$GCAL_POOL_ID" ] && TFVARS_ARGS="$TFVARS_ARGS -var=gcal_pool_id=${GCAL_POOL_ID}"
    [ -n "$GCAL_PROVIDER_ID" ] && TFVARS_ARGS="$TFVARS_ARGS -var=gcal_provider_id=${GCAL_PROVIDER_ID}"
    [ -n "$GCAL_CLIENT_EMAIL" ] && TFVARS_ARGS="$TFVARS_ARGS -var=gcal_client_email=${GCAL_CLIENT_EMAIL}"
    [ -n "$GCAL_PRIVATE_KEY" ] && TFVARS_ARGS="$TFVARS_ARGS -var=gcal_private_key=${GCAL_PRIVATE_KEY}"
  fi
  
  # Slack integration
  TFVARS_ARGS="$TFVARS_ARGS -var=enable_slack=${ENABLE_SLACK}"
  if [ "$ENABLE_SLACK" = "true" ]; then
    [ -n "$SLACK_WEBHOOK_URL" ] && TFVARS_ARGS="$TFVARS_ARGS -var=slack_webhook_url=${SLACK_WEBHOOK_URL}"
    [ -n "$SLACK_CHANNEL" ] && TFVARS_ARGS="$TFVARS_ARGS -var=slack_channel=${SLACK_CHANNEL}"
  fi
  
  # Email integration (if configured via env)
  [ "$ENABLE_EMAIL" = "true" ] && TFVARS_ARGS="$TFVARS_ARGS -var=enable_email=true"
  
  # Scheduler settings
  TFVARS_ARGS="$TFVARS_ARGS -var=enable_scheduled_reminders=${ENABLE_SCHEDULED_REMINDERS}"
  
  # JWT secret (use existing or let terraform generate)
  [ -n "$JWT_SECRET" ] && TFVARS_ARGS="$TFVARS_ARGS -var=jwt_secret=${JWT_SECRET}"
  
  # CloudFront (if using that hosting type)
  [ "$HOSTING_TYPE" = "cloudfront" ] && TFVARS_ARGS="$TFVARS_ARGS -var=enable_cloudfront=true"
  
  # Certificate ARN (if provided)
  [ -n "$CERTIFICATE_ARN" ] && TFVARS_ARGS="$TFVARS_ARGS -var=certificate_arn=${CERTIFICATE_ARN}"
}

# =============================================================================
# Comprehensive Resource Detection
# =============================================================================
check_existing_resources() {
  section "Checking Existing AWS Resources"
  
  cd "$PROJECT_DIR/infrastructure"
  build_tfvars
  
  local prefix="colab-scheduler-${ENV}"
  
  # Arrays to track found resources
  declare -a FOUND_TABLES=()
  declare -a FOUND_LAMBDAS=()
  declare -a FOUND_APIS=()
  declare -a FOUND_SQS=()
  declare -a FOUND_AMPLIFY=()
  declare -a FOUND_AMPLIFY_BRANCHES=()
  declare -a FOUND_AMPLIFY_DOMAINS=()
  declare -a FOUND_S3=()
  declare -a FOUND_CLOUDFRONT=()
  declare -a FOUND_IAM_ROLES=()
  declare -a FOUND_EVENTBRIDGE=()
  declare -a FOUND_ROUTE53=()
  
  # Track duplicate APIs for cleanup
  declare -a DUPLICATE_APIS=()
  
  # ─────────────────────────────────────────────────────────────────────────
  # Check Terraform State
  # ─────────────────────────────────────────────────────────────────────────
  step "Querying Terraform state..."
  local state_resources=""
  local state_count=0
  
  state_resources=$($TF_CMD state list 2>/dev/null) && {
    state_count=$(echo "$state_resources" | grep -c . 2>/dev/null || echo "0")
    substep "State contains $state_count resources"
  } || {
    substep "No existing state found (fresh deployment)"
  }
  
  # ─────────────────────────────────────────────────────────────────────────
  # DynamoDB Tables
  # ─────────────────────────────────────────────────────────────────────────
  step "Checking DynamoDB tables..."
  
  local expected_tables=(
    "${prefix}-bookings"
    "${prefix}-users"
    "${prefix}-activity"
    "${prefix}-invites"
    "${prefix}-certifications"
    "${prefix}-sessions"
  )
  
  # Add reliability tables if enabled
  if [ "$ENABLE_RELIABILITY" = "true" ]; then
    expected_tables+=(
      "${prefix}-idempotency"
      "${prefix}-ratelimit"
    )
  fi
  
  for table in "${expected_tables[@]}"; do
    if timeout 10 aws dynamodb describe-table --table-name "$table" --region "$AWS_REGION" &>/dev/null; then
      FOUND_TABLES+=("$table")
      substep "Found: $table ✓"
    else
      substep "Missing: $table"
    fi
  done
  
  # ─────────────────────────────────────────────────────────────────────────
  # Lambda Functions
  # ─────────────────────────────────────────────────────────────────────────
  step "Checking Lambda functions..."
  
  local expected_lambdas=(
    "${prefix}-api"
  )
  
  if [ "$ENABLE_RELIABILITY" = "true" ]; then
    expected_lambdas+=("${prefix}-worker")
  fi
  
  for fn in "${expected_lambdas[@]}"; do
    if timeout 10 aws lambda get-function --function-name "$fn" --region "$AWS_REGION" &>/dev/null; then
      FOUND_LAMBDAS+=("$fn")
      substep "Found: $fn ✓"
    else
      substep "Missing: $fn"
    fi
  done
  
  # ─────────────────────────────────────────────────────────────────────────
  # IAM Roles
  # ─────────────────────────────────────────────────────────────────────────
  step "Checking IAM roles..."
  
  local expected_roles=(
    "${prefix}-lambda-role"
  )
  
  if [ "$ENABLE_RELIABILITY" = "true" ]; then
    expected_roles+=("${prefix}-worker-role")
  fi
  
  for role in "${expected_roles[@]}"; do
    if timeout 10 aws iam get-role --role-name "$role" --region "$AWS_REGION" &>/dev/null; then
      FOUND_IAM_ROLES+=("$role")
      substep "Found: $role ✓"
    else
      substep "Missing: $role"
    fi
  done
  
  # ─────────────────────────────────────────────────────────────────────────
  # API Gateway - Comprehensive duplicate detection
  # ─────────────────────────────────────────────────────────────────────────
  step "Checking API Gateway (with duplicate detection)..."
  
  local api_name="${prefix}-api"
  
  # Get ALL APIs that match our naming pattern
  local all_apis=""
  all_apis=$(aws apigatewayv2 get-apis --region "$AWS_REGION" \
    --query "Items[?contains(Name, 'colab-scheduler') && contains(Name, 'api')].{Name:Name,Id:ApiId,Created:CreatedDate}" \
    --output json 2>/dev/null) || all_apis="[]"
  
  # Count APIs matching exact name pattern
  local matching_count=0
  local api_id=""
  local api_ids_json=""
  
  api_ids_json=$(echo "$all_apis" | jq -r "[.[] | select(.Name == \"${api_name}\")] | sort_by(.Created)")
  matching_count=$(echo "$api_ids_json" | jq 'length')
  
  if [ "$matching_count" -gt 1 ]; then
    warn "Found $matching_count duplicate API Gateways named '${api_name}'!"
    substep "Duplicate APIs detected - will keep oldest, remove newer ones"
    
    # Get the oldest API (first in sorted list) - this is the one to keep
    api_id=$(echo "$api_ids_json" | jq -r '.[0].Id')
    local oldest_created=$(echo "$api_ids_json" | jq -r '.[0].Created')
    substep "Keeping oldest: $api_id (created: $oldest_created)"
    
    # Get IDs of duplicates to remove (all but the first/oldest)
    local duplicate_ids=""
    duplicate_ids=$(echo "$api_ids_json" | jq -r '.[1:] | .[].Id')
    
    for dup_id in $duplicate_ids; do
      local dup_created=$(echo "$api_ids_json" | jq -r ".[] | select(.Id == \"$dup_id\") | .Created")
      DUPLICATE_APIS+=("$dup_id")
      substep "  Duplicate to remove: $dup_id (created: $dup_created)"
    done
    
    FOUND_APIS+=("$api_name:$api_id")
    
  elif [ "$matching_count" -eq 1 ]; then
    api_id=$(echo "$api_ids_json" | jq -r '.[0].Id')
    FOUND_APIS+=("$api_name:$api_id")
    substep "Found: $api_name ($api_id) ✓"
    
  else
    substep "Missing: $api_name"
  fi
  
  # Also check for any stale APIs from other environments
  local other_env_apis=""
  other_env_apis=$(echo "$all_apis" | jq -r "[.[] | select(.Name != \"${api_name}\" and (.Name | contains(\"colab-scheduler\")))]")
  local other_count=$(echo "$other_env_apis" | jq 'length')
  
  if [ "$other_count" -gt 0 ]; then
    substep "Note: Found $other_count API Gateway(s) for other environments"
    echo "$other_env_apis" | jq -r '.[] | "    - \(.Name) (\(.Id))"'
  fi
  
  # Export duplicates for cleanup
  export DUPLICATE_APIS
  
  # ─────────────────────────────────────────────────────────────────────────
  # SQS Queues (if reliability enabled)
  # ─────────────────────────────────────────────────────────────────────────
  if [ "$ENABLE_RELIABILITY" = "true" ]; then
    step "Checking SQS queues..."
    
    local expected_queues=(
      "${prefix}-integrations"
      "${prefix}-integrations-dlq"
    )
    
    for queue in "${expected_queues[@]}"; do
      local queue_url=""
      queue_url=$(aws sqs get-queue-url --queue-name "$queue" --region "$AWS_REGION" --output text 2>/dev/null) || true
      if [ -n "$queue_url" ] && [ "$queue_url" != "None" ]; then
        FOUND_SQS+=("$queue:$queue_url")
        substep "Found: $queue ✓"
      else
        substep "Missing: $queue"
      fi
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # EventBridge Rules
  # ─────────────────────────────────────────────────────────────────────────
  step "Checking EventBridge rules..."
  
  local expected_rules=(
    "${prefix}-booking-reminders"
    "${prefix}-cert-warnings"
  )
  
  for rule in "${expected_rules[@]}"; do
    if timeout 10 aws events describe-rule --name "$rule" --region "$AWS_REGION" &>/dev/null; then
      FOUND_EVENTBRIDGE+=("$rule")
      substep "Found: $rule ✓"
    else
      substep "Missing: $rule"
    fi
  done
  
  # ─────────────────────────────────────────────────────────────────────────
  # Amplify App (if using amplify hosting)
  # ─────────────────────────────────────────────────────────────────────────
  if [ "$HOSTING_TYPE" = "amplify" ]; then
    step "Checking Amplify app..."
    
    local app_name="${prefix}-frontend"
    local app_id=""
    app_id=$(aws amplify list-apps --region "$AWS_REGION" \
      --query "apps[?name=='${app_name}'].appId" --output text 2>/dev/null) || true
    
    if [ -n "$app_id" ] && [ "$app_id" != "None" ]; then
      FOUND_AMPLIFY+=("$app_name:$app_id")
      substep "Found: $app_name ($app_id) ✓"
      
      # Check for branch
      local branch_name="main"
      if aws amplify get-branch --app-id "$app_id" --branch-name "$branch_name" --region "$AWS_REGION" &>/dev/null; then
        FOUND_AMPLIFY_BRANCHES+=("$app_id:$branch_name")
        substep "Found branch: $branch_name ✓"
      fi
      
      # Check for domain association
      local domain="${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
      local domain_status=""
      domain_status=$(aws amplify get-domain-association --app-id "$app_id" --domain-name "$domain" \
        --region "$AWS_REGION" --query "domainAssociation.domainStatus" --output text 2>/dev/null) || true
      if [ -n "$domain_status" ] && [ "$domain_status" != "None" ]; then
        FOUND_AMPLIFY_DOMAINS+=("$app_id:$domain")
        substep "Found domain: $domain ($domain_status) ✓"
      fi
    else
      substep "Missing: $app_name"
    fi
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # S3 Buckets (for S3/CloudFront hosting)
  # ─────────────────────────────────────────────────────────────────────────
  if [ "$HOSTING_TYPE" = "s3" ] || [ "$HOSTING_TYPE" = "cloudfront" ]; then
    step "Checking S3 buckets..."
    
    local bucket_name="${prefix}-frontend-${AWS_ACCOUNT}"
    if aws s3api head-bucket --bucket "$bucket_name" --region "$AWS_REGION" 2>/dev/null; then
      FOUND_S3+=("$bucket_name")
      substep "Found: $bucket_name ✓"
    else
      substep "Missing: $bucket_name"
    fi
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # CloudFront Distribution
  # ─────────────────────────────────────────────────────────────────────────
  if [ "$HOSTING_TYPE" = "cloudfront" ]; then
    step "Checking CloudFront distributions..."
    
    local dist_comment="${prefix}-frontend"
    local dist_id=""
    dist_id=$(aws cloudfront list-distributions \
      --query "DistributionList.Items[?Comment=='${dist_comment}'].Id" --output text 2>/dev/null) || true
    
    if [ -n "$dist_id" ] && [ "$dist_id" != "None" ]; then
      FOUND_CLOUDFRONT+=("$dist_comment:$dist_id")
      substep "Found: $dist_comment ($dist_id) ✓"
    else
      substep "Missing: $dist_comment"
    fi
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # CloudWatch Alarms
  # ─────────────────────────────────────────────────────────────────────────
  step "Checking CloudWatch alarms..."
  
  local expected_alarms=(
    "${prefix}-dlq-messages"
    "${prefix}-worker-errors"
    "${prefix}-api-errors"
  )
  
  local found_alarms=0
  for alarm in "${expected_alarms[@]}"; do
    if timeout 10 aws cloudwatch describe-alarms --alarm-names "$alarm" --region "$AWS_REGION" \
      --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null | grep -q "$alarm"; then
      ((found_alarms++))
    fi
  done
  substep "Found $found_alarms/${#expected_alarms[@]} CloudWatch alarms"
  
  # ─────────────────────────────────────────────────────────────────────────
  # Route53 Records
  # ─────────────────────────────────────────────────────────────────────────
  step "Checking Route53 records..."
  
  # Get hosted zone ID
  local zone_id=""
  zone_id=$(aws route53 list-hosted-zones-by-name --dns-name "${DNS_ZONE_NAME}" \
    --query "HostedZones[?Name=='${DNS_ZONE_NAME}.'].Id" --output text 2>/dev/null | sed 's|/hostedzone/||') || true
  
  if [ -n "$zone_id" ] && [ "$zone_id" != "None" ]; then
    substep "Zone ID: $zone_id"
    
    # Check frontend CNAME
    local frontend_record="${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
    if aws route53 list-resource-record-sets --hosted-zone-id "$zone_id" \
      --query "ResourceRecordSets[?Name=='${frontend_record}.']" --output text 2>/dev/null | grep -q "$frontend_record"; then
      FOUND_ROUTE53+=("frontend_cname:${zone_id}:${frontend_record}")
      substep "Found: ${frontend_record} ✓"
    fi
    
    # Check API cert validation records (environment-aware domain)
    local api_domain_for_env
    if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
      api_domain_for_env="api.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
    else
      api_domain_for_env="api.${ENV}.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
    fi
    local cert_records=$(aws route53 list-resource-record-sets --hosted-zone-id "$zone_id" \
      --query "ResourceRecordSets[?contains(Name, '_') && contains(Name, '${api_domain_for_env}')].Name" --output text 2>/dev/null) || true
    if [ -n "$cert_records" ]; then
      for rec in $cert_records; do
        local clean_rec=$(echo "$rec" | sed 's/\.$//')
        FOUND_ROUTE53+=("api_cert:${zone_id}:${clean_rec}")
        substep "Found cert validation: ${clean_rec} ✓"
      done
    fi
  else
    substep "Zone ${DNS_ZONE_NAME} not found or not accessible"
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Summary
  # ─────────────────────────────────────────────────────────────────────────
  echo ""
  substep "Summary: ${#FOUND_TABLES[@]} tables, ${#FOUND_LAMBDAS[@]} lambdas, ${#FOUND_APIS[@]} APIs, ${#FOUND_IAM_ROLES[@]} roles"
  
  # Export for import function
  export FOUND_TABLES FOUND_LAMBDAS FOUND_APIS FOUND_SQS FOUND_AMPLIFY FOUND_AMPLIFY_BRANCHES FOUND_AMPLIFY_DOMAINS FOUND_S3 FOUND_CLOUDFRONT FOUND_IAM_ROLES FOUND_EVENTBRIDGE FOUND_ROUTE53
  
  success "Resource check complete"
}

# =============================================================================
# Cleanup Duplicate API Gateways
# =============================================================================
cleanup_duplicate_apis() {
  [ ${#DUPLICATE_APIS[@]} -eq 0 ] && return 0
  [ "$DRY_RUN" = "true" ] && return 0
  
  section "Cleaning Up Duplicate API Gateways"
  
  warn "Found ${#DUPLICATE_APIS[@]} duplicate API Gateway(s) to remove"
  
  if ! confirm "   Remove duplicate API Gateways?" "Y"; then
    warn "Skipping duplicate cleanup - manual cleanup may be required"
    return 0
  fi
  
  for api_id in "${DUPLICATE_APIS[@]}"; do
    step "Removing duplicate API: $api_id"
    
    # First, delete any API mappings
    local mappings=""
    mappings=$(aws apigatewayv2 get-api-mappings --domain-name "*" --region "$AWS_REGION" \
      --query "Items[?ApiId=='${api_id}'].{DomainName:DomainName,MappingId:ApiMappingId}" \
      --output json 2>/dev/null) || mappings="[]"
    
    # Note: Getting all mappings requires listing domain names first
    # For safety, we'll just try to delete the API and let it fail if there are mappings
    
    # Delete stages
    local stages=""
    stages=$(aws apigatewayv2 get-stages --api-id "$api_id" --region "$AWS_REGION" \
      --query "Items[].StageName" --output text 2>/dev/null) || stages=""
    
    for stage in $stages; do
      if [ -n "$stage" ] && [ "$stage" != "None" ]; then
        substep "Deleting stage: $stage"
        aws apigatewayv2 delete-stage --api-id "$api_id" --stage-name "$stage" \
          --region "$AWS_REGION" 2>/dev/null || warn "  Failed to delete stage $stage"
      fi
    done
    
    # Delete routes
    local routes=""
    routes=$(aws apigatewayv2 get-routes --api-id "$api_id" --region "$AWS_REGION" \
      --query "Items[].RouteId" --output text 2>/dev/null) || routes=""
    
    for route in $routes; do
      if [ -n "$route" ] && [ "$route" != "None" ]; then
        substep "Deleting route: $route"
        aws apigatewayv2 delete-route --api-id "$api_id" --route-id "$route" \
          --region "$AWS_REGION" 2>/dev/null || warn "  Failed to delete route $route"
      fi
    done
    
    # Delete integrations
    local integrations=""
    integrations=$(aws apigatewayv2 get-integrations --api-id "$api_id" --region "$AWS_REGION" \
      --query "Items[].IntegrationId" --output text 2>/dev/null) || integrations=""
    
    for integration in $integrations; do
      if [ -n "$integration" ] && [ "$integration" != "None" ]; then
        substep "Deleting integration: $integration"
        aws apigatewayv2 delete-integration --api-id "$api_id" --integration-id "$integration" \
          --region "$AWS_REGION" 2>/dev/null || warn "  Failed to delete integration $integration"
      fi
    done
    
    # Now delete the API
    substep "Deleting API Gateway: $api_id"
    if aws apigatewayv2 delete-api --api-id "$api_id" --region "$AWS_REGION" 2>&1; then
      success "  Deleted duplicate API: $api_id"
    else
      warn "  Failed to delete API $api_id - may have active resources"
      substep "  Manual cleanup may be required: aws apigatewayv2 delete-api --api-id $api_id"
    fi
  done
  
  success "Duplicate cleanup complete"
}

# =============================================================================
# Import Existing Resources into Terraform State
# =============================================================================
import_existing_resources() {
  [ "$SKIP_IMPORT" = "true" ] && return 0
  [ "$DRY_RUN" = "true" ] && return 0
  
  section "Importing Existing Resources"
  
  cd "$PROJECT_DIR/infrastructure"
  
  local imported=0
  local skipped=0
  local failed=0
  local prefix="colab-scheduler-${ENV}"
  
  # Helper function to check if resource is in state
  resource_in_state() {
    $TF_CMD state list 2>/dev/null | grep -q "^$1$"
  }
  
  # Helper function to import a resource with verbose error handling
  import_resource() {
    local tf_addr="$1"
    local aws_id="$2"
    local resource_name="$3"
    
    if resource_in_state "$tf_addr"; then
      substep "Already in state: $resource_name"
      ((skipped++))
      return 0
    fi
    
    substep "Importing: $resource_name → $tf_addr"
    
    # Capture both stdout and stderr
    local import_output=""
    local import_exit_code=0
    import_output=$($TF_CMD import $TFVARS_ARGS "$tf_addr" "$aws_id" 2>&1) || import_exit_code=$?
    
    if [ $import_exit_code -eq 0 ]; then
      ((imported++))
      substep "  ✓ Imported successfully"
      return 0
    else
      # Check if it's already imported (race condition)
      if echo "$import_output" | grep -q "Resource already managed"; then
        ((skipped++))
        substep "  → Already managed by terraform"
        return 0
      fi
      
      # Show the actual error
      warn "  ✗ Import failed: $(echo "$import_output" | tail -1)"
      ((failed++))
      return 1
    fi
  }
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import DynamoDB Tables
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_TABLES[@]} -gt 0 ]; then
    step "Importing DynamoDB tables..."
    
    declare -A table_mapping=(
      ["${prefix}-bookings"]="aws_dynamodb_table.bookings"
      ["${prefix}-users"]="aws_dynamodb_table.users"
      ["${prefix}-activity"]="aws_dynamodb_table.activity"
      ["${prefix}-invites"]="aws_dynamodb_table.invites"
      ["${prefix}-certifications"]="aws_dynamodb_table.certifications"
      ["${prefix}-sessions"]="aws_dynamodb_table.sessions"
      ["${prefix}-idempotency"]="aws_dynamodb_table.idempotency[0]"
      ["${prefix}-ratelimit"]="aws_dynamodb_table.ratelimit[0]"
    )
    
    for table in "${FOUND_TABLES[@]}"; do
      local tf_addr="${table_mapping[$table]}"
      if [ -n "$tf_addr" ]; then
        import_resource "$tf_addr" "$table" "$table"
      fi
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import IAM Roles
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_IAM_ROLES[@]} -gt 0 ]; then
    step "Importing IAM roles..."
    
    declare -A role_mapping=(
      ["${prefix}-lambda-role"]="aws_iam_role.lambda"
      ["${prefix}-worker-role"]="aws_iam_role.worker[0]"
    )
    
    for role in "${FOUND_IAM_ROLES[@]}"; do
      local tf_addr="${role_mapping[$role]}"
      if [ -n "$tf_addr" ]; then
        import_resource "$tf_addr" "$role" "$role"
      fi
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import Lambda Functions
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_LAMBDAS[@]} -gt 0 ]; then
    step "Importing Lambda functions..."
    
    declare -A lambda_mapping=(
      ["${prefix}-api"]="aws_lambda_function.api"
      ["${prefix}-worker"]="aws_lambda_function.worker[0]"
    )
    
    for fn in "${FOUND_LAMBDAS[@]}"; do
      local tf_addr="${lambda_mapping[$fn]}"
      if [ -n "$tf_addr" ]; then
        import_resource "$tf_addr" "$fn" "$fn"
      fi
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import API Gateway
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_APIS[@]} -gt 0 ]; then
    step "Importing API Gateway..."
    
    for api_entry in "${FOUND_APIS[@]}"; do
      local api_name="${api_entry%%:*}"
      local api_id="${api_entry##*:}"
      import_resource "aws_apigatewayv2_api.api" "$api_id" "$api_name"
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import SQS Queues
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_SQS[@]} -gt 0 ]; then
    step "Importing SQS queues..."
    
    for queue_entry in "${FOUND_SQS[@]}"; do
      local queue_name="${queue_entry%%:*}"
      local queue_url="${queue_entry##*:}"
      
      if [[ "$queue_name" == *"-dlq" ]]; then
        import_resource "aws_sqs_queue.integrations_dlq[0]" "$queue_url" "$queue_name"
      else
        import_resource "aws_sqs_queue.integrations[0]" "$queue_url" "$queue_name"
      fi
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import EventBridge Rules
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_EVENTBRIDGE[@]} -gt 0 ]; then
    step "Importing EventBridge rules..."
    
    declare -A eventbridge_mapping=(
      ["${prefix}-booking-reminders"]="aws_cloudwatch_event_rule.booking_reminders"
      ["${prefix}-cert-warnings"]="aws_cloudwatch_event_rule.cert_warnings"
    )
    
    for rule in "${FOUND_EVENTBRIDGE[@]}"; do
      local tf_addr="${eventbridge_mapping[$rule]}"
      if [ -n "$tf_addr" ]; then
        import_resource "$tf_addr" "$rule" "$rule"
      fi
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import Amplify App, Branch, and Domain Association
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_AMPLIFY[@]} -gt 0 ]; then
    step "Importing Amplify app..."
    
    for app_entry in "${FOUND_AMPLIFY[@]}"; do
      local app_name="${app_entry%%:*}"
      local app_id="${app_entry##*:}"
      import_resource "aws_amplify_app.frontend[0]" "$app_id" "$app_name"
    done
  fi
  
  if [ ${#FOUND_AMPLIFY_BRANCHES[@]} -gt 0 ]; then
    step "Importing Amplify branches..."
    
    for branch_entry in "${FOUND_AMPLIFY_BRANCHES[@]}"; do
      local app_id="${branch_entry%%:*}"
      local branch_name="${branch_entry##*:}"
      # Import format: app_id/branch_name
      import_resource "aws_amplify_branch.main[0]" "${app_id}/${branch_name}" "amplify-branch-${branch_name}"
    done
  fi
  
  if [ ${#FOUND_AMPLIFY_DOMAINS[@]} -gt 0 ]; then
    step "Importing Amplify domain associations..."
    
    for domain_entry in "${FOUND_AMPLIFY_DOMAINS[@]}"; do
      local app_id="${domain_entry%%:*}"
      local domain="${domain_entry##*:}"
      # Import format: app_id/domain_name
      import_resource "aws_amplify_domain_association.main[0]" "${app_id}/${domain}" "amplify-domain-${domain}"
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import S3 Bucket
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_S3[@]} -gt 0 ]; then
    step "Importing S3 buckets..."
    
    for bucket in "${FOUND_S3[@]}"; do
      import_resource "aws_s3_bucket.frontend[0]" "$bucket" "$bucket"
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import CloudFront Distribution
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_CLOUDFRONT[@]} -gt 0 ]; then
    step "Importing CloudFront distributions..."
    
    for dist_entry in "${FOUND_CLOUDFRONT[@]}"; do
      local dist_name="${dist_entry%%:*}"
      local dist_id="${dist_entry##*:}"
      import_resource "aws_cloudfront_distribution.frontend[0]" "$dist_id" "$dist_name"
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Import Route53 Records
  # ─────────────────────────────────────────────────────────────────────────
  if [ ${#FOUND_ROUTE53[@]} -gt 0 ]; then
    step "Importing Route53 records..."
    
    for record_entry in "${FOUND_ROUTE53[@]}"; do
      local record_type="${record_entry%%:*}"
      local remaining="${record_entry#*:}"
      local zone_id="${remaining%%:*}"
      local record_name="${remaining#*:}"
      
      case "$record_type" in
        frontend_cname)
          # Format: zone_id_record-name_CNAME
          import_resource "aws_route53_record.frontend_cname[0]" "${zone_id}_${record_name}_CNAME" "route53-${record_name}"
          ;;
        api_cert)
          # Certificate validation records are more complex
          # Format: zone_id_record-name_CNAME
          import_resource "aws_route53_record.api_cert_validation[\"api.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}\"]" "${zone_id}_${record_name}_CNAME" "route53-cert-${record_name}"
          ;;
      esac
    done
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Summary
  # ─────────────────────────────────────────────────────────────────────────
  echo ""
  if [ $imported -gt 0 ]; then
    success "Imported $imported resources ($skipped already in state, $failed failed)"
  else
    substep "No new resources to import ($skipped already in state)"
  fi
  
  if [ $failed -gt 0 ]; then
    warn "Some imports failed - terraform apply will create these resources"
  fi
}

# =============================================================================
# Build Backend
# =============================================================================
build_backend() {
  section "Building Backend"
  
  cd "$PROJECT_DIR/backend"
  
  step "Installing dependencies..."
  npm ci --silent 2>/dev/null || npm install --silent || die "npm install failed"
  
  step "Cleaning old build artifacts..."
  rm -rf dist
  rm -f "$PROJECT_DIR/infrastructure/lambda.zip"
  mkdir -p dist
  
  step "Bundling with esbuild..."
  
  # Bundle main API
  if ! npx esbuild src/index.js \
    --bundle \
    --platform=node \
    --target=node20 \
    --outfile=dist/index.js \
    --external:@aws-sdk/* \
    --minify \
    --sourcemap 2>&1; then
    die "API bundle failed"
  fi
  
  substep "API bundle: dist/index.js ✓"
  
  # Bundle worker if reliability enabled
  if [ "$ENABLE_RELIABILITY" = "true" ]; then
    if ! npx esbuild src/worker.js \
      --bundle \
      --platform=node \
      --target=node20 \
      --outfile=dist/worker.js \
      --external:@aws-sdk/* \
      --minify \
      --sourcemap 2>&1; then
      die "Worker bundle failed"
    fi
    
    substep "Worker bundle: dist/worker.js ✓"
  fi
  
  # Note: Don't create lambda.zip here - Terraform's archive_file will do it
  # This ensures Terraform sees the hash change and updates the Lambda
  
  local js_count=$(ls -1 dist/*.js 2>/dev/null | wc -l)
  local total_size=$(du -sh dist/ 2>/dev/null | cut -f1)
  substep "Built $js_count bundle(s), total size: $total_size"
  
  cd "$PROJECT_DIR/backend"
  success "Backend built"
}

# =============================================================================
# Deploy Infrastructure
# =============================================================================
deploy_infrastructure() {
  section "Deploying Infrastructure"
  
  cd "$PROJECT_DIR/infrastructure"
  
  # Ensure plugin cache is used
  export TF_PLUGIN_CACHE_DIR="$TF_PLUGIN_CACHE_DIR"
  
  # Remove old lambda.zip to force Terraform to recreate it
  rm -f lambda.zip
  
  if [ "$DRY_RUN" = "true" ]; then
    step "Running terraform plan (dry-run)..."
    $TF_CMD plan $TFVARS_ARGS || warn "Plan had issues"
    return 0
  fi
  
  # ─────────────────────────────────────────────────────────────────────────
  # Pre-deploy validation: Check for potential API Gateway duplication
  # ─────────────────────────────────────────────────────────────────────────
  step "Validating API Gateway state..."
  local prefix="colab-scheduler-${ENV}"
  local api_name="${prefix}-api"
  
  # Check if API exists in AWS
  local aws_api_id=""
  aws_api_id=$(aws apigatewayv2 get-apis --region "$AWS_REGION" \
    --query "Items[?Name=='${api_name}'].ApiId" --output text 2>/dev/null | head -1) || aws_api_id=""
  
  # Check if API is in Terraform state
  local state_has_api=false
  if $TF_CMD state list 2>/dev/null | grep -q "aws_apigatewayv2_api.api"; then
    state_has_api=true
  fi
  
  if [ -n "$aws_api_id" ] && [ "$aws_api_id" != "None" ] && [ "$state_has_api" = "false" ]; then
    warn "API Gateway exists in AWS ($aws_api_id) but not in Terraform state!"
    substep "Attempting to import into state..."
    
    if $TF_CMD import $TFVARS_ARGS "aws_apigatewayv2_api.api" "$aws_api_id" 2>&1; then
      success "  API Gateway imported to prevent duplication"
    else
      warn "  Import failed - deployment may create a duplicate"
      if ! confirm "   Continue anyway?" "N"; then
        die "Deployment aborted to prevent API Gateway duplication"
      fi
    fi
  elif [ -n "$aws_api_id" ] && [ "$state_has_api" = "true" ]; then
    substep "API Gateway in sync: AWS ($aws_api_id) ↔ Terraform state ✓"
  else
    substep "No existing API Gateway found - will create new"
  fi
  
  # Show what will change
  step "Planning changes..."
  local plan_output=""
  plan_output=$($TF_CMD plan -detailed-exitcode $TFVARS_ARGS 2>&1) || true
  local plan_exit=$?
  
  if [ $plan_exit -eq 0 ]; then
    substep "No changes needed"
  elif [ $plan_exit -eq 2 ]; then
    # Changes to apply - show summary
    local add_count=$(echo "$plan_output" | grep -o "Plan: [0-9]* to add" | grep -o "[0-9]*" || echo "0")
    local change_count=$(echo "$plan_output" | grep -o "[0-9]* to change" | grep -o "[0-9]*" || echo "0")
    local destroy_count=$(echo "$plan_output" | grep -o "[0-9]* to destroy" | grep -o "[0-9]*" || echo "0")
    substep "Changes: +$add_count ~$change_count -$destroy_count"
    
    # Check if plan would CREATE a new API Gateway (potential duplication)
    if echo "$plan_output" | grep -q "aws_apigatewayv2_api.api will be created"; then
      if [ -n "$aws_api_id" ] && [ "$aws_api_id" != "None" ]; then
        error "DANGER: Terraform plans to create a new API Gateway but one already exists!"
        substep "Existing API ID: $aws_api_id"
        substep "This would create a duplicate. Please run:"
        substep "  terraform import aws_apigatewayv2_api.api $aws_api_id"
        die "Deployment aborted to prevent API Gateway duplication"
      fi
    fi
    
    # Check if Lambda will be updated
    if echo "$plan_output" | grep -q "aws_lambda_function"; then
      substep "Lambda function(s) will be updated ✓"
    fi
  else
    warn "Plan failed - will attempt apply anyway"
  fi
  
  step "Running terraform apply..."
  
  local max_attempts=3
  local attempt=1
  
  while [ $attempt -le $max_attempts ]; do
    substep "Attempt $attempt of $max_attempts"
    
    if $TF_CMD apply -auto-approve $TFVARS_ARGS 2>&1; then
      success "Infrastructure deployed"
      
      # Get outputs with explicit error handling
      step "Capturing deployment outputs..."
      
      API_URL=$($TF_CMD output -raw api_endpoint 2>/dev/null) || API_URL=""
      FRONTEND_URL=$($TF_CMD output -raw frontend_url 2>/dev/null) || FRONTEND_URL=""
      
      # Fallback to constructed URLs if outputs are empty
      if [ -z "$API_URL" ] || [ "$API_URL" = "" ]; then
        # Include environment in domain for non-production
        if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
          API_URL="https://api.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
        else
          API_URL="https://api.${ENV}.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
        fi
        warn "api_endpoint output empty, using: $API_URL"
      fi
      
      if [ -z "$FRONTEND_URL" ] || [ "$FRONTEND_URL" = "" ]; then
        # Include environment in domain for non-production
        if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
          FRONTEND_URL="https://${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
        else
          FRONTEND_URL="https://${ENV}.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
        fi
        warn "frontend_url output empty, using: $FRONTEND_URL"
      fi
      
      substep "API URL: $API_URL"
      substep "Frontend URL: $FRONTEND_URL"
      
      # Verify Lambda was updated by checking last modified time
      step "Verifying Lambda deployment..."
      local lambda_name="colab-scheduler-${ENV}-api"
      local lambda_modified=$(aws lambda get-function --function-name "$lambda_name" \
        --query "Configuration.LastModified" --output text --region "$AWS_REGION" 2>/dev/null) || lambda_modified=""
      
      if [ -n "$lambda_modified" ]; then
        substep "Lambda last modified: $lambda_modified"
      fi
      
      return 0
    fi
    
    if [ $attempt -lt $max_attempts ]; then
      warn "Apply failed, retrying in 5 seconds..."
      sleep 5
    fi
    
    attempt=$((attempt + 1))
  done
  
  die "Infrastructure deployment failed after $max_attempts attempts"
}

# =============================================================================
# Build Frontend
# =============================================================================
build_frontend() {
  section "Building Frontend"
  
  cd "$PROJECT_DIR/frontend"
  
  step "Installing dependencies..."
  npm ci --silent 2>/dev/null || npm install --silent || die "npm install failed"
  
  step "Building..."
  
  # Construct API URL - try multiple sources
  local api_url=""
  
  # First try terraform output
  if [ -n "$API_URL" ]; then
    api_url="$API_URL"
  else
    # Try to get it from terraform again
    cd "$PROJECT_DIR/infrastructure"
    api_url=$($TF_CMD output -raw api_endpoint 2>/dev/null) || api_url=""
    cd "$PROJECT_DIR/frontend"
  fi
  
  # If still empty, construct from DNS settings
  if [ -z "$api_url" ] || [ "$api_url" = "" ]; then
    # Include environment in domain for non-production
    if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
      api_url="https://api.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
    else
      api_url="https://api.${ENV}.${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
    fi
    warn "API URL not in terraform output, using: $api_url"
  fi
  
  # Ensure it ends with /api
  [[ "$api_url" != */api ]] && api_url="${api_url}/api"
  
  substep "API URL: $api_url"
  
  # Validate URL format
  if [[ ! "$api_url" =~ ^https?:// ]]; then
    die "Invalid API URL: $api_url"
  fi
  
  if ! VITE_API_URL="$api_url" npm run build 2>&1; then
    die "Frontend build failed"
  fi
  
  # Verify API URL is in the build
  if grep -q "${DNS_SUBDOMAIN}" dist/assets/*.js 2>/dev/null; then
    substep "Verified: API URL embedded in build ✓"
  else
    warn "Could not verify API URL in build output"
  fi
  
  success "Frontend built"
}

# =============================================================================
# Deploy Frontend
# =============================================================================
deploy_frontend() {
  section "Deploying Frontend"
  
  if [ "$DRY_RUN" = "true" ]; then
    substep "Would deploy frontend to Amplify"
    return 0
  fi
  
  cd "$PROJECT_DIR/infrastructure"
  
  local app_id=$($TF_CMD output -raw amplify_app_id 2>/dev/null) || app_id=""
  local branch=$($TF_CMD output -raw amplify_branch 2>/dev/null) || branch="main"
  
  if [ -z "$app_id" ]; then
    warn "No Amplify app ID found, skipping frontend deployment"
    return 0
  fi
  
  substep "App ID: $app_id, Branch: $branch"
  
  step "Creating deployment package..."
  cd "$PROJECT_DIR/frontend/dist"
  zip -rq /tmp/frontend.zip .
  local zip_size=$(stat -f%z /tmp/frontend.zip 2>/dev/null || stat -c%s /tmp/frontend.zip 2>/dev/null || echo "0")
  substep "Package size: $((zip_size / 1024))KB"
  
  step "Uploading to Amplify..."
  local deploy_result=""
  deploy_result=$(aws amplify create-deployment \
    --app-id "$app_id" \
    --branch-name "$branch" \
    --region "$AWS_REGION" \
    --output json 2>&1) || {
    warn "Failed to create Amplify deployment: $deploy_result"
    rm -f /tmp/frontend.zip
    return 1
  }
  
  local job_id=$(echo "$deploy_result" | jq -r '.jobId')
  local upload_url=$(echo "$deploy_result" | jq -r '.zipUploadUrl')
  
  if [ -z "$job_id" ] || [ "$job_id" = "null" ]; then
    warn "Failed to get job ID from Amplify"
    rm -f /tmp/frontend.zip
    return 1
  fi
  
  substep "Job ID: $job_id"
  
  # Upload the zip
  local upload_status=$(curl -s -w "%{http_code}" -o /dev/null -X PUT -T /tmp/frontend.zip -H "Content-Type: application/zip" "$upload_url")
  if [ "$upload_status" != "200" ]; then
    warn "Upload returned HTTP $upload_status"
  fi
  
  # Start the deployment
  aws amplify start-deployment \
    --app-id "$app_id" \
    --branch-name "$branch" \
    --job-id "$job_id" \
    --region "$AWS_REGION" >/dev/null 2>&1 || {
    warn "Failed to start deployment (may already be started)"
  }
  
  step "Waiting for deployment (timeout: 5 min)..."
  local i=0
  local max_wait=150  # 5 minutes (150 * 2 seconds)
  local last_status=""
  
  while [ $i -lt $max_wait ]; do
    local status=$(aws amplify get-job \
      --app-id "$app_id" \
      --branch-name "$branch" \
      --job-id "$job_id" \
      --region "$AWS_REGION" \
      --query 'job.summary.status' \
      --output text 2>/dev/null) || status="UNKNOWN"
    
    # Show status changes
    if [ "$status" != "$last_status" ]; then
      substep "Status: $status"
      last_status="$status"
    fi
    
    case "$status" in
      SUCCEED)
        success "Frontend deployed successfully"
        rm -f /tmp/frontend.zip
        return 0
        ;;
      FAILED|CANCELLED)
        error "Amplify deployment $status"
        # Try to get failure reason
        local reason=$(aws amplify get-job \
          --app-id "$app_id" \
          --branch-name "$branch" \
          --job-id "$job_id" \
          --region "$AWS_REGION" \
          --query 'job.summary.reason' \
          --output text 2>/dev/null) || reason=""
        [ -n "$reason" ] && [ "$reason" != "None" ] && substep "Reason: $reason"
        rm -f /tmp/frontend.zip
        return 1
        ;;
      PENDING|PROVISIONING|RUNNING|DEPLOYING)
        # Still in progress, show a dot every 10 seconds
        if [ $((i % 5)) -eq 0 ]; then
          printf "."
        fi
        ;;
      UNKNOWN|"")
        # API error, wait and retry
        ;;
    esac
    
    sleep 2
    i=$((i + 1))
  done
  
  echo ""  # New line after dots
  warn "Deployment timed out after 5 minutes"
  substep "Check status: aws amplify get-job --app-id $app_id --branch-name $branch --job-id $job_id"
  rm -f /tmp/frontend.zip
  
  # Don't fail the whole deploy for frontend timeout
  return 0
}

# =============================================================================
# Seed Demo Data
# =============================================================================
seed_demo_data() {
  section "Seeding Demo Data"
  
  if [ "$DRY_RUN" = "true" ]; then
    substep "Would seed demo data"
    return 0
  fi
  
  cd "$PROJECT_DIR/scripts"
  
  # Check if users table is empty
  step "Checking for existing users..."
  local user_count=$(aws dynamodb scan \
    --table-name "colab-scheduler-${ENV}-users" \
    --region "$AWS_REGION" \
    --select "COUNT" \
    --query "Count" \
    --output text 2>/dev/null) || user_count="0"
  
  if [ "$user_count" != "0" ] && [ -n "$user_count" ]; then
    substep "Found $user_count existing users, skipping seed"
    return 0
  fi
  
  step "Installing seed script dependencies..."
  npm install --silent 2>/dev/null || npm ci --silent
  
  step "Running seed script..."
  
  # Set environment variables for the seed script
  export AWS_REGION="$AWS_REGION"
  export USERS_TABLE="colab-scheduler-${ENV}-users"
  export BOOKINGS_TABLE="colab-scheduler-${ENV}-bookings"
  
  if node seed-demo-data.js 2>&1; then
    success "Demo data seeded"
  else
    warn "Seed script had issues (may be okay if data exists)"
  fi
}

# =============================================================================
# Verify Deployment
# =============================================================================
verify_deployment() {
  section "Verification"
  
  if [ "$DRY_RUN" = "true" ]; then
    substep "Skipping verification (dry-run)"
    return 0
  fi
  
  sleep 3
  
  # Check API health
  step "Checking API..."
  local health=""
  health=$(curl -s --max-time 10 "${API_URL}/api/health" 2>/dev/null) || health=""
  if echo "$health" | grep -q "healthy"; then
    success "API healthy"
  else
    warn "API health check inconclusive"
  fi
  
  # Check frontend
  step "Checking frontend..."
  local http_code=""
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL" 2>/dev/null) || http_code="000"
  if [ "$http_code" = "200" ]; then
    success "Frontend accessible"
  else
    warn "Frontend returned HTTP $http_code"
  fi
}

# =============================================================================
# Save Configuration for Future Runs
# =============================================================================
save_config() {
  local config_file="$PROJECT_DIR/scripts/env.sh"
  
  step "Saving configuration..."
  
  cat > "$config_file" << EOF
#!/bin/bash
# SDCoLab Scheduler Deployment Configuration
# Generated: $(date -Iseconds)
# 
# Source this file before running deploy.sh:
#   source ./env.sh && ./deploy.sh
# 
# Or set SKIP_INTERACTIVE=true to use these values directly:
#   source ./env.sh && SKIP_INTERACTIVE=true ./deploy.sh

# Core settings
export ENV="${ENV}"
export AWS_REGION="${AWS_REGION}"
export HOSTING_TYPE="${HOSTING_TYPE}"

# DNS settings
export DNS_ZONE_NAME="${DNS_ZONE_NAME}"
export DNS_SUBDOMAIN="${DNS_SUBDOMAIN}"

# Feature flags
export ENABLE_RELIABILITY="${ENABLE_RELIABILITY}"
export ENABLE_GITHUB="${ENABLE_GITHUB}"
export ENABLE_GCAL="${ENABLE_GCAL}"
export ENABLE_SLACK="${ENABLE_SLACK}"
export ENABLE_EMAIL="${ENABLE_EMAIL}"
export ENABLE_SCHEDULED_REMINDERS="${ENABLE_SCHEDULED_REMINDERS}"

# GitHub settings
export GITHUB_ORG="${GITHUB_ORG}"
export GITHUB_REPO="${GITHUB_REPO}"
# export GITHUB_TOKEN=""  # Set this manually - do not commit!

# Slack settings
export SLACK_CHANNEL="${SLACK_CHANNEL}"
# export SLACK_WEBHOOK_URL=""  # Set this manually - do not commit!

# Google Calendar settings
export GCAL_AUTH_METHOD="${GCAL_AUTH_METHOD}"
export GCAL_PRIMARY_CALENDAR_ID="${GCAL_PRIMARY_CALENDAR_ID}"
$([ -n "$GCAL_PROJECT_NUMBER" ] && echo "export GCAL_PROJECT_NUMBER=\"${GCAL_PROJECT_NUMBER}\"")
$([ -n "$GCAL_SERVICE_ACCOUNT_EMAIL" ] && echo "export GCAL_SERVICE_ACCOUNT_EMAIL=\"${GCAL_SERVICE_ACCOUNT_EMAIL}\"")

# Terraform settings
export TF_PLUGIN_CACHE_DIR="${TF_PLUGIN_CACHE_DIR}"
EOF
  
  chmod +x "$config_file"
  substep "Saved to: $config_file"
}

# =============================================================================
# Print Completion
# =============================================================================
print_completion() {
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}  ${BOLD}🎉 Deployment Complete!${NC}                                      ${GREEN}║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${BOLD}   URLs${NC}"
  echo "   Frontend: $FRONTEND_URL"
  echo "   API:      ${API_URL}/api"
  echo "   Health:   ${API_URL}/api/health"
  echo ""
  echo -e "${BOLD}   Demo Credentials${NC}"
  echo "     admin@colab.org  / demodemo  (Admin)"
  echo "     member@colab.org / demodemo  (Member)"
  echo ""
  echo -e "${BOLD}   Configuration${NC}"
  echo "     Environment:  $ENV"
  echo "     Region:       $AWS_REGION"
  echo "     GitHub:       $ENABLE_GITHUB $([ "$ENABLE_GITHUB" = "true" ] && echo "($GITHUB_ORG/$GITHUB_REPO)")"
  echo "     GCal:         $ENABLE_GCAL"
  echo "     Slack:        $ENABLE_SLACK"
  echo "     Plugin cache: $TF_PLUGIN_CACHE_DIR"
  echo ""
  echo -e "${BOLD}   Next Steps${NC}"
  echo "     • Configuration saved to: scripts/env.sh"
  echo "     • For future deploys: source ./env.sh && SKIP_INTERACTIVE=true ./deploy.sh"
  echo "     • View logs: aws logs tail /aws/lambda/colab-scheduler-${ENV}-api --follow"
  echo ""
}

# =============================================================================
# Main
# =============================================================================
main() {
  print_banner
  check_prerequisites
  interactive_config
  setup_terraform
  check_existing_resources
  cleanup_duplicate_apis
  import_existing_resources
  
  if [ "$DRY_RUN" = "true" ]; then
    deploy_infrastructure
    echo ""
    success "Dry run complete - no changes made"
    exit 0
  fi
  
  build_backend
  deploy_infrastructure
  build_frontend
  deploy_frontend
  seed_demo_data
  verify_deployment
  save_config
  print_completion
}

# Run main
main "$@"
