# SDCoLab Scheduler v4.1.0 - Deployment Guide

## Quick Start

### Standard Deployment (Recommended)

```bash
# Clone or extract the archive
cd colab-scheduler-4_1_0

# Deploy to AWS
./scripts/deploy.sh
```

The deploy script handles everything: backend build, infrastructure provisioning, and frontend deployment.

### Manual Deployment Steps

If you prefer manual control:

```bash
# 1. Backend
cd backend
npm install
npm run build

# 2. Infrastructure (requires Terraform/OpenTofu)
cd ../infrastructure
tofu init  # or: terraform init
tofu apply -var="environment=dev"

# 3. Frontend
cd ../frontend
npm install
VITE_API_URL="<your-api-url>/api" npm run build

# 4. Deploy frontend to your hosting (S3, Amplify, etc.)
```

---

## Prerequisites

### Required Tools

| Tool | Version | Check Command |
|------|---------|---------------|
| Node.js | >= 20.0.0 | `node --version` |
| npm | >= 10.0.0 | `npm --version` |
| AWS CLI | >= 2.0 | `aws --version` |
| Terraform/OpenTofu | >= 1.0 | `tofu --version` or `terraform --version` |
| jq | any | `jq --version` |
| zip | any | `zip --version` |

### AWS Permissions Required

The deploying IAM user/role needs permissions for:
- Lambda (create, update, invoke)
- API Gateway (create, update)
- DynamoDB (create tables, CRUD operations)
- S3 (create buckets, upload objects)
- IAM (create roles, attach policies)
- CloudWatch Logs (create log groups)
- Amplify (if using Amplify hosting)
- Route53 (if managing DNS)
- SES (if using email notifications)

---

## Deployment Script Options

### Environment Variables

```bash
# Hosting type (default: amplify for HTTPS)
HOSTING_TYPE=amplify ./scripts/deploy.sh   # HTTPS via Amplify
HOSTING_TYPE=s3 ./scripts/deploy.sh        # HTTP via S3 website

# DNS configuration
DNS_ZONE_NAME=yourdomain.com ./scripts/deploy.sh
DNS_SUBDOMAIN=scheduler ./scripts/deploy.sh
MANAGE_DNS=false ./scripts/deploy.sh       # Disable DNS management

# Orphan resource handling
ORPHAN_MODE=prompt ./scripts/deploy.sh     # Interactive (default)
ORPHAN_MODE=import ./scripts/deploy.sh     # Auto-import existing
ORPHAN_MODE=delete ./scripts/deploy.sh     # Delete and recreate (DATA LOSS!)
ORPHAN_MODE=skip ./scripts/deploy.sh       # Skip check

# Integration keys (optional)
ENABLE_GCAL=true \
GOOGLE_CLIENT_ID=xxx \
GOOGLE_CLIENT_SECRET=xxx \
./scripts/deploy.sh

ENABLE_SLACK=true \
SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx \
./scripts/deploy.sh
```

### Deploy to Different Environments

```bash
./scripts/deploy.sh dev      # Development
./scripts/deploy.sh staging  # Staging
./scripts/deploy.sh prod     # Production
```

---

## Validation Steps

### 1. Backend Health Check

```bash
# After deployment, test the API health endpoint
curl https://your-api-url/api/health

# Expected response:
{
  "status": "healthy",
  "service": "SDCoLab Scheduler API",
  "version": "4.1.0",
  "features": { ... }
}
```

### 2. New Feature Endpoints (v4.1.0)

```bash
# Waitlist API
curl -H "Authorization: Bearer $TOKEN" https://your-api-url/api/waitlist

# Recurring Bookings API
curl -H "Authorization: Bearer $TOKEN" https://your-api-url/api/recurring

# Analytics API (admin only)
curl -H "Authorization: Bearer $TOKEN" https://your-api-url/api/analytics/dashboard

# Recurring pattern templates
curl -H "Authorization: Bearer $TOKEN" https://your-api-url/api/recurring/patterns/templates
```

### 3. Frontend Verification

1. Open the deployed frontend URL
2. Log in with admin credentials
3. Verify these v4.1.0 features are accessible:
   - [ ] Admin Panel with enhanced approvals
   - [ ] Analytics Dashboard (admin nav)
   - [ ] My Bookings shows waitlist entries
   - [ ] Recurring bookings section visible

### 4. DynamoDB Tables

Verify these tables exist in AWS DynamoDB:
- `colab-scheduler-{env}-users`
- `colab-scheduler-{env}-bookings`
- `colab-scheduler-{env}-activity`
- `colab-scheduler-{env}-invites`
- `colab-scheduler-{env}-certifications`

---

## Deployment Script vs npm Scripts

### What deploy.sh Does

```
deploy.sh
├── Prerequisites check (node, npm, aws, terraform, jq, zip)
├── AWS credentials validation
├── Backend build (npm install + npm run build)
├── Infrastructure deploy (terraform apply)
│   ├── DynamoDB tables
│   ├── Lambda function
│   ├── API Gateway
│   ├── IAM roles
│   └── DNS records (optional)
├── Frontend build (npm install + npm run build with API URL)
├── Frontend deploy
│   ├── Amplify (if HOSTING_TYPE=amplify)
│   └── S3 (if HOSTING_TYPE=s3)
└── Verification and output
```

### Package.json Scripts

**Backend (backend/package.json):**
```json
{
  "scripts": {
    "start": "node src/index.js",           // Run locally
    "dev": "node --watch src/index.js",     // Dev with auto-reload
    "build": "esbuild ... --outfile=dist/index.js",  // Bundle for Lambda
    "test": "jest"                          // Run tests
  }
}
```

**Frontend (frontend/package.json):**
```json
{
  "scripts": {
    "dev": "vite",              // Local dev server
    "build": "vite build",      // Production build
    "preview": "vite preview"   // Preview production build
  }
}
```

### When to Use Which

| Scenario | Use |
|----------|-----|
| Full deployment to AWS | `./scripts/deploy.sh` |
| Local backend development | `cd backend && npm run dev` |
| Local frontend development | `cd frontend && npm run dev` |
| CI/CD pipeline | `./scripts/deploy.sh` (with env vars) |
| Testing backend only | `cd backend && npm test` |
| Building without deploy | `npm run build` in each directory |

---

## Troubleshooting

### Common Issues

**1. "Orphan resource found" error**
```bash
# Option 1: Import existing resources
ORPHAN_MODE=import ./scripts/deploy.sh

# Option 2: Start fresh (DELETES DATA)
ORPHAN_MODE=delete ./scripts/deploy.sh
```

**2. "Rate limited" during deploy**
The script has automatic retry with backoff. If it persists:
```bash
# Wait 5 minutes, then retry
sleep 300 && ./scripts/deploy.sh
```

**3. Frontend shows old version**
```bash
# Clear Amplify cache
aws amplify start-job --app-id $APP_ID --branch-name main --job-type RELEASE

# Or force rebuild
cd frontend && rm -rf dist node_modules && npm install && npm run build
```

**4. API returns 500 errors**
```bash
# Check Lambda logs
aws logs tail /aws/lambda/colab-scheduler-dev --follow

# Common causes:
# - Missing environment variables
# - DynamoDB table doesn't exist
# - IAM permissions insufficient
```

**5. CORS errors in browser**
Check that the API's CORS configuration includes your frontend URL.
Edit `backend/src/lib/config.js` if needed.

---

## Rollback

### Quick Rollback

```bash
# Restore previous Lambda version
aws lambda update-function-code \
  --function-name colab-scheduler-dev \
  --s3-bucket your-deployment-bucket \
  --s3-key previous-version.zip
```

### Full Rollback

```bash
# If using git
git checkout v4.0.0
./scripts/deploy.sh
```

---

## v4.1.0 New Features Summary

### Waitlist System
- Users can join waitlists for fully-booked slots
- Automatic position tracking
- Notification when spot opens
- Priority for certified users

### Recurring Bookings
- Support for daily, weekly, monthly patterns
- Pattern templates (MWF, TTh, weekdays, etc.)
- Pause/resume series
- Bulk cancellation

### Analytics Dashboard
- Tool utilization metrics
- Booking heatmaps (day × hour)
- Top users by hours
- Export to CSV

### Enhanced Admin Panel (from v4.0)
- Batch approve/reject
- Advanced filtering and pagination
- Resource visibility controls

---

## Support

- GitHub Issues: https://github.com/middog/colab-scheduler/issues
- Documentation: See `/docs` folder
- API Reference: See `/docs/API.md`
