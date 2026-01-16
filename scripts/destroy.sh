#!/bin/bash
set -e

# =============================================================================
# 🔥 SDCoLab Scheduler Destroy Script v4.2.0-rc69.15
# 
# Safely tears down all AWS resources including v4.2.0 reliability infrastructure.
#
# Usage:
#   ./destroy.sh              # Interactive destroy (dev environment)
#   ./destroy.sh production   # Destroy production environment
#   FORCE=true ./destroy.sh   # Skip confirmations (CI/CD)
#   CLEAN_ORPHANS=true ./destroy.sh  # Also clean orphaned resources
# =============================================================================

VERSION="4.2.0-rc69.15"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV=${1:-dev}

DNS_ZONE_NAME=${DNS_ZONE_NAME:-mid.dog}
DNS_SUBDOMAIN=${DNS_SUBDOMAIN:-sdcolab}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_banner() {
  echo ""
  echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║${NC}  ${BOLD}⚠️  SDCoLab Scheduler DESTROY${NC}                                 ${RED}║${NC}"
  echo -e "${RED}║${NC}     v${VERSION} - Environment: ${ENV}                               ${RED}║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_step() { echo -e "${GREEN}▶${NC} $1"; }
print_substep() { echo -e "  ${CYAN}→${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }

# Determine terraform command
if command -v tofu &> /dev/null; then
  TF_CMD="tofu"
elif command -v terraform &> /dev/null; then
  TF_CMD="terraform"
else
  print_error "Neither terraform nor tofu found"
  exit 1
fi

# =============================================================================
# Pre-Cleanup Functions
# =============================================================================

cleanup_lambda_permissions() {
  local prefix="colab-scheduler-${ENV}"
  local lambda_name="${prefix}-api"
  local region=$(aws configure get region 2>/dev/null || echo "us-west-2")
  
  print_step "Cleaning Lambda permissions..."
  
  local policy_json=$(aws lambda get-policy --function-name "$lambda_name" --region "$region" 2>/dev/null || echo "")
  if [ -n "$policy_json" ]; then
    local sids=$(echo "$policy_json" | jq -r '.Policy | fromjson | .Statement[].Sid' 2>/dev/null || echo "")
    for sid in $sids; do
      [ -n "$sid" ] && aws lambda remove-permission --function-name "$lambda_name" --statement-id "$sid" --region "$region" 2>/dev/null || true
    done
  fi
  print_success "Lambda permissions cleaned"
}

cleanup_eventbridge() {
  local prefix="colab-scheduler-${ENV}"
  local region=$(aws configure get region 2>/dev/null || echo "us-west-2")
  
  print_step "Cleaning EventBridge rules..."
  
  local rules=$(aws events list-rules --name-prefix "$prefix" --region "$region" --query 'Rules[].Name' --output text 2>/dev/null || echo "")
  for rule in $rules; do
    if [ -n "$rule" ]; then
      local targets=$(aws events list-targets-by-rule --rule "$rule" --region "$region" --query 'Targets[].Id' --output text 2>/dev/null || echo "")
      [ -n "$targets" ] && aws events remove-targets --rule "$rule" --ids $targets --region "$region" 2>/dev/null || true
      aws events disable-rule --name "$rule" --region "$region" 2>/dev/null || true
    fi
  done
  print_success "EventBridge cleaned"
}

cleanup_api_gateway() {
  local prefix="colab-scheduler-${ENV}"
  local api_name="${prefix}-api"
  local region=$(aws configure get region 2>/dev/null || echo "us-west-2")
  
  print_step "Cleaning API Gateway..."
  
  local api_id=$(aws apigatewayv2 get-apis --region "$region" --query "Items[?Name=='$api_name'].ApiId" --output text 2>/dev/null || echo "")
  if [ -n "$api_id" ] && [ "$api_id" != "None" ]; then
    local stages=$(aws apigatewayv2 get-stages --api-id "$api_id" --region "$region" --query "Items[?StageName!='\$default'].StageName" --output text 2>/dev/null || echo "")
    for stage in $stages; do
      [ -n "$stage" ] && aws apigatewayv2 delete-stage --api-id "$api_id" --stage-name "$stage" --region "$region" 2>/dev/null || true
    done
  fi
  print_success "API Gateway pre-cleaned"
}

cleanup_amplify_domains() {
  local domain_name="${DNS_SUBDOMAIN}.${DNS_ZONE_NAME}"
  
  print_step "Cleaning Amplify domain associations..."
  
  local apps=$(aws amplify list-apps --query "apps[].appId" --output text 2>/dev/null || echo "")
  for app_id in $apps; do
    if [ -n "$app_id" ]; then
      aws amplify get-domain-association --app-id "$app_id" --domain-name "$domain_name" 2>/dev/null && \
        aws amplify delete-domain-association --app-id "$app_id" --domain-name "$domain_name" 2>/dev/null || true
    fi
  done
  print_success "Amplify domains cleaned"
}

cleanup_s3_bucket() {
  local bucket="$1"
  [ -z "$bucket" ] && return
  
  print_step "Emptying S3 bucket: $bucket"
  aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
  
  # Delete versions and markers
  aws s3api list-object-versions --bucket "$bucket" --query '[Versions,DeleteMarkers][]' --output json 2>/dev/null | \
    jq -r '.[] | select(. != null) | "\(.Key) \(.VersionId)"' 2>/dev/null | \
    while read key version; do
      [ -n "$key" ] && [ -n "$version" ] && aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version" 2>/dev/null || true
    done
  
  print_success "Bucket emptied"
}

cleanup_sqs_queues() {
  local prefix="colab-scheduler-${ENV}"
  local region=$(aws configure get region 2>/dev/null || echo "us-west-2")
  
  print_step "Cleaning SQS queues..."
  
  local queues=$(aws sqs list-queues --queue-name-prefix "$prefix" --region "$region" --query 'QueueUrls[]' --output text 2>/dev/null || echo "")
  for queue_url in $queues; do
    [ -n "$queue_url" ] && aws sqs purge-queue --queue-url "$queue_url" --region "$region" 2>/dev/null || true
  done
  print_success "SQS queues cleaned"
}

# =============================================================================
# Orphan Cleanup (resources not in terraform state)
# =============================================================================

cleanup_orphans() {
  local prefix="colab-scheduler-${ENV}"
  local region=$(aws configure get region 2>/dev/null || echo "us-west-2")
  
  echo ""
  print_step "Cleaning orphaned resources..."
  
  # Lambda
  local lambda_name="${prefix}-api"
  aws lambda get-function --function-name "$lambda_name" --region "$region" >/dev/null 2>&1 && \
    { print_substep "Deleting Lambda: $lambda_name"; aws lambda delete-function --function-name "$lambda_name" --region "$region" 2>/dev/null || true; }
  
  # Worker Lambda (v4.2.0)
  local worker_name="${prefix}-worker"
  aws lambda get-function --function-name "$worker_name" --region "$region" >/dev/null 2>&1 && \
    { print_substep "Deleting Worker Lambda: $worker_name"; aws lambda delete-function --function-name "$worker_name" --region "$region" 2>/dev/null || true; }
  
  # API Gateway
  local api_id=$(aws apigatewayv2 get-apis --region "$region" --query "Items[?Name=='${prefix}-api'].ApiId" --output text 2>/dev/null || echo "")
  [ -n "$api_id" ] && [ "$api_id" != "None" ] && \
    { print_substep "Deleting API Gateway: $api_id"; aws apigatewayv2 delete-api --api-id "$api_id" --region "$region" 2>/dev/null || true; }
  
  # Amplify
  local app_id=$(aws amplify list-apps --query "apps[?name=='${prefix}-frontend'].appId" --output text 2>/dev/null || echo "")
  [ -n "$app_id" ] && [ "$app_id" != "None" ] && \
    { print_substep "Deleting Amplify app: $app_id"; aws amplify delete-app --app-id "$app_id" 2>/dev/null || true; }
  
  # DynamoDB tables (including v4.2.0)
  for table in users bookings activity invites certifications idempotency ratelimit; do
    local table_name="${prefix}-${table}"
    aws dynamodb describe-table --table-name "$table_name" --region "$region" >/dev/null 2>&1 && \
      { print_substep "Deleting DynamoDB: $table_name"; aws dynamodb delete-table --table-name "$table_name" --region "$region" 2>/dev/null || true; }
  done
  
  # SQS queues (v4.2.0)
  for queue_name in "${prefix}-integrations" "${prefix}-integrations-dlq"; do
    local queue_url=$(aws sqs get-queue-url --queue-name "$queue_name" --region "$region" --query 'QueueUrl' --output text 2>/dev/null || echo "")
    [ -n "$queue_url" ] && [ "$queue_url" != "None" ] && \
      { print_substep "Deleting SQS: $queue_name"; aws sqs delete-queue --queue-url "$queue_url" --region "$region" 2>/dev/null || true; }
  done
  
  # IAM role
  local role_name="${prefix}-lambda-role"
  if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
    print_substep "Deleting IAM role: $role_name"
    # Detach policies
    aws iam list-attached-role-policies --role-name "$role_name" --query 'AttachedPolicies[].PolicyArn' --output text 2>/dev/null | \
      xargs -n1 aws iam detach-role-policy --role-name "$role_name" --policy-arn 2>/dev/null || true
    # Delete inline policies  
    aws iam list-role-policies --role-name "$role_name" --query 'PolicyNames[]' --output text 2>/dev/null | \
      xargs -n1 aws iam delete-role-policy --role-name "$role_name" --policy-name 2>/dev/null || true
    aws iam delete-role --role-name "$role_name" 2>/dev/null || true
  fi
  
  # Worker IAM role (v4.2.0)
  local worker_role_name="${prefix}-worker-role"
  if aws iam get-role --role-name "$worker_role_name" >/dev/null 2>&1; then
    print_substep "Deleting Worker IAM role: $worker_role_name"
    aws iam list-attached-role-policies --role-name "$worker_role_name" --query 'AttachedPolicies[].PolicyArn' --output text 2>/dev/null | \
      xargs -n1 aws iam detach-role-policy --role-name "$worker_role_name" --policy-arn 2>/dev/null || true
    aws iam list-role-policies --role-name "$worker_role_name" --query 'PolicyNames[]' --output text 2>/dev/null | \
      xargs -n1 aws iam delete-role-policy --role-name "$worker_role_name" --policy-name 2>/dev/null || true
    aws iam delete-role --role-name "$worker_role_name" 2>/dev/null || true
  fi
  
  # EventBridge
  local rules=$(aws events list-rules --name-prefix "$prefix" --region "$region" --query 'Rules[].Name' --output text 2>/dev/null || echo "")
  for rule in $rules; do
    if [ -n "$rule" ]; then
      print_substep "Deleting EventBridge: $rule"
      local targets=$(aws events list-targets-by-rule --rule "$rule" --region "$region" --query 'Targets[].Id' --output text 2>/dev/null || echo "")
      [ -n "$targets" ] && aws events remove-targets --rule "$rule" --ids $targets --region "$region" 2>/dev/null || true
      aws events delete-rule --name "$rule" --region "$region" 2>/dev/null || true
    fi
  done
  
  print_success "Orphan cleanup complete"
}

# =============================================================================
# Main Destroy Process
# =============================================================================

print_banner

echo "This will destroy ALL resources including:"
echo "  • Lambda function & API Gateway"
echo "  • DynamoDB tables (users, bookings, activity, invites, certifications)"
echo "  • v4.2.0 tables (idempotency, ratelimit)"
echo "  • SQS queues (integrations, integrations-dlq)"
echo "  • Amplify app OR S3 bucket"
echo "  • EventBridge rules"
echo "  • Route53 records"
echo ""
echo -e "${RED}⚠️  ALL DATA WILL BE PERMANENTLY DELETED${NC}"
echo ""

if [ "${FORCE}" != "true" ]; then
  read -p "Type 'destroy' to confirm: " confirm
  if [ "$confirm" != "destroy" ]; then
    echo "Aborted."
    exit 1
  fi
fi

cd "$PROJECT_DIR/infrastructure"

# Check for terraform state
if [ ! -f "terraform.tfstate" ] && [ ! -d ".terraform" ]; then
  echo ""
  print_warning "No Terraform state found."
  
  if [ "${CLEAN_ORPHANS}" = "true" ]; then
    cleanup_orphans
  else
    read -p "Check for and clean orphaned resources? (y/n): " clean
    [ "$clean" = "y" ] && cleanup_orphans
  fi
  
  echo ""
  print_success "Done."
  exit 0
fi

# Initialize if needed
[ ! -d ".terraform" ] && $TF_CMD init

# Get current state info
HOSTING_TYPE=$($TF_CMD output -raw hosting_type 2>/dev/null) || HOSTING_TYPE=""
BUCKET=$($TF_CMD output -raw frontend_bucket 2>/dev/null) || BUCKET=""

# Pre-cleanup
echo ""
cleanup_lambda_permissions
cleanup_eventbridge
cleanup_api_gateway
cleanup_amplify_domains
cleanup_sqs_queues

# S3 bucket cleanup
[ "$HOSTING_TYPE" = "s3" ] && [ -n "$BUCKET" ] && cleanup_s3_bucket "$BUCKET"

# Terraform destroy with retry
echo ""
print_step "Destroying infrastructure..."

destroy_with_retry() {
  for i in 1 2 3 4 5; do
    echo "   Attempt $i..."
    
    if $TF_CMD destroy -auto-approve 2>&1; then
      return 0
    fi
    
    print_warning "Error or rate limit. Waiting $((i * 15))s..."
    cleanup_lambda_permissions 2>/dev/null || true
    cleanup_eventbridge 2>/dev/null || true
    sleep $((i * 15))
  done
  return 1
}

if destroy_with_retry; then
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}  ${BOLD}✅ All resources destroyed${NC}                                    ${GREEN}║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
else
  echo ""
  print_error "Destroy may have partially failed."
  echo ""
  echo "Options:"
  echo "  1. Run again: ./destroy.sh $ENV"
  echo "  2. Clean orphans: CLEAN_ORPHANS=true ./destroy.sh $ENV"
  echo "  3. Manual cleanup via AWS Console"
  
  [ "${CLEAN_ORPHANS}" = "true" ] && cleanup_orphans
  exit 1
fi
