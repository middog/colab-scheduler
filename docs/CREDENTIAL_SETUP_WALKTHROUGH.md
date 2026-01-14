# 🔐 Credential Setup Walkthrough

**For SDCoLab Scheduler v3.8+**  
*A step-by-step guide to generating and securing all integration credentials*

---

## Overview: What You'll Set Up

| Priority | Credential | What It Does | Time |
|----------|-----------|--------------|------|
| **Required** | JWT_SECRET | Signs auth tokens | 1 min |
| **Required** | SCHEDULER_API_KEY | Authorizes automated jobs | 1 min |
| Optional | Google OAuth | "Login with Google" | 10 min |
| Optional | Google Calendar | Sync bookings to calendar | 15-30 min |
| Optional | GitHub Token | Create issues for bookings | 5 min |
| Optional | Slack Webhook | Post notifications | 5 min |
| Optional | AWS SES | Send emails | 10-30 min |

---

## 🛡️ Security First: Where Secrets Live

**The Golden Rule**: Secrets should exist in exactly ONE place—your secrets manager or environment variables. Never in code, never in git.

### For Development
```bash
# Create local .env (gitignored)
cp backend/.env.example backend/.env
# Edit and add your secrets
```

### For Production (AWS Lambda)
Your secrets flow through Terraform variables → Lambda environment:

```bash
# Option A: Environment variables (recommended)
export TF_VAR_jwt_secret="your-secret-here"
export TF_VAR_github_token="ghp_xxx"
export TF_VAR_slack_webhook_url="https://hooks.slack.com/..."

# Option B: tfvars file (gitignored)
# Edit infrastructure/terraform.tfvars
```

### What NOT To Do ❌
- Commit `.env` files
- Commit `terraform.tfvars` with real secrets
- Put secrets in `terraform.tfvars.sdcolab` (that's for non-secret config)
- Share secrets over Slack/Discord/email
- Use the same secrets for dev and prod

---

## Step 1: Core Secrets (Required)

These two secrets are mandatory for the app to run.

### 1.1 Generate JWT_SECRET

This signs all authentication tokens. Must be random, at least 48 characters.

```bash
# Pick one method:

# OpenSSL (most common)
openssl rand -base64 48

# Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# macOS/Linux
head -c 48 /dev/urandom | base64
```

**Example output**: `K7xB2mN9pQrS4tVwY1zA3cE5fG8hJ0kLmO2pR5sT8uW4xA7zB9cD3eF6`

**Save it**:
```bash
# Development
echo 'JWT_SECRET=K7xB2mN9pQrS4tVwY1zA...' >> backend/.env

# Production
export TF_VAR_jwt_secret='K7xB2mN9pQrS4tVwY1zA...'
```

### 1.2 Generate SCHEDULER_API_KEY

This authorizes EventBridge to trigger reminder/warning jobs.

```bash
openssl rand -hex 32
```

**Example output**: `a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890`

**Save it**:
```bash
# Development
echo 'SCHEDULER_API_KEY=a1b2c3d4e5f6...' >> backend/.env

# Production
export TF_VAR_scheduler_api_key='a1b2c3d4e5f6...'
```

---

## Step 2: Google OAuth (Login with Google)

Lets users sign in with their Google accounts instead of email/password.

### 2.1 Create or Select a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Note your **Project ID** (e.g., `sdcolab-scheduler`)

### 2.2 Configure OAuth Consent Screen

1. **APIs & Services → OAuth consent screen**
2. User Type: **External** (unless you have Google Workspace for internal only)
3. Fill in required info:
   - App name: `SDCoLab Scheduler`
   - Support email: your email
   - Developer contact: your email
4. **Scopes**: Add these three:
   - `openid`
   - `email`
   - `profile`
5. **Test users**: Add yourself while in testing mode
6. Click through to finish

### 2.3 Create OAuth Client Credentials

1. **APIs & Services → Credentials**
2. **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `SDCoLab Scheduler`
5. **Authorized JavaScript origins** (add both):
   ```
   http://localhost:5173
   https://scheduler.sdcolab.org
   ```
6. **Authorized redirect URIs** (add both):
   ```
   http://localhost:3001/api/auth/google/callback
   https://api.scheduler.sdcolab.org/api/auth/google/callback
   ```
7. Click **Create**
8. **Copy** the Client ID and Client Secret immediately

### 2.4 Save Credentials

```bash
# Development (.env)
ENABLE_AUTH_GOOGLE=true
GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_CALLBACK_URL=/api/auth/google/callback

# Production (terraform)
export TF_VAR_enable_auth_google=true
export TF_VAR_google_client_id='123456789-xxxxx.apps.googleusercontent.com'
export TF_VAR_google_client_secret='GOCSPX-xxxxxxxxxxxxxxxx'
```

### 2.5 Common Issues

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Callback URL doesn't exactly match—check trailing slashes |
| `access_denied` | User not in test users list (while in testing mode) |

---

## Step 3: Google Calendar Integration

Syncs bookings to a shared Google Calendar. Two auth methods available.

### Choose Your Method

| Method | Best For | Pros | Cons |
|--------|----------|------|------|
| **Service Account Key** | Dev, quick setup | Simple, works everywhere | Key file to secure |
| **Workload Identity** | Production on AWS | No keys to manage | More setup |

### Option A: Service Account Key (Simpler)

#### 3A.1 Create Service Account

```bash
# In Cloud Console: IAM & Admin → Service Accounts → Create
# Or via CLI:
gcloud iam service-accounts create scheduler-sa \
  --display-name="SDCoLab Scheduler"
```

#### 3A.2 Create and Download Key

1. Click the service account → **Keys** tab
2. **Add Key → Create new key → JSON**
3. Download the file (e.g., `key.json`)

#### 3A.3 Extract Values from Key

Open `key.json` and grab:
- `project_id`
- `client_email`
- `private_key`

#### 3A.4 Share Calendar with Service Account

1. Open [calendar.google.com](https://calendar.google.com)
2. Create or find your booking calendar
3. **Settings (⚙️) → Share with specific people**
4. Add the `client_email` from your key
5. Permission: **Make changes to events**
6. Copy the **Calendar ID** from "Integrate calendar" section

#### 3A.5 Save Credentials

```bash
# Development (.env)
ENABLE_GCAL=true
GCAL_AUTH_METHOD=service_account_key
GOOGLE_PROJECT_ID=sdcolab-scheduler
GOOGLE_CLIENT_EMAIL=scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
GCAL_PRIMARY_CALENDAR_ID=abc123@group.calendar.google.com
```

**⚠️ Delete the key.json file after extracting values!**

### Option B: Workload Identity Federation (Production)

No keys to manage—AWS Lambda assumes an identity that GCP trusts.

#### 3B.1 Get Your IDs

```bash
# AWS Account ID
aws sts get-caller-identity --query Account --output text
# Example: 123456789012

# GCP Project Number (not ID!)
gcloud projects describe sdcolab-scheduler --format='value(projectNumber)'
# Example: 987654321098
```

#### 3B.2 Create Workload Identity Pool

```bash
gcloud iam workload-identity-pools create "sdcolab-aws-pool" \
  --location="global" \
  --display-name="SDCoLab AWS Pool"
```

#### 3B.3 Create AWS Provider

```bash
gcloud iam workload-identity-pools providers create-aws "aws-lambda" \
  --location="global" \
  --workload-identity-pool="sdcolab-aws-pool" \
  --account-id="YOUR_AWS_ACCOUNT_ID"
```

#### 3B.4 Bind Service Account

```bash
gcloud iam service-accounts add-iam-policy-binding \
  scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/sdcolab-aws-pool/attribute.aws_account/YOUR_AWS_ACCOUNT_ID"
```

#### 3B.5 Save Configuration

```bash
# Production (terraform.tfvars)
enable_gcal = true
gcal_auth_method = "workload_identity"
gcal_project_number = "987654321098"
gcal_pool_id = "sdcolab-aws-pool"
gcal_provider_id = "aws-lambda"
gcal_service_account_email = "scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com"
gcal_primary_calendar_id = "abc123@group.calendar.google.com"
```

---

## Step 4: GitHub Issues Integration

Creates GitHub issues for booking requests and admin notifications.

### 4.1 Create Fine-Grained Token (Recommended)

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. **Fine-grained tokens → Generate new token**
3. Token name: `SDCoLab Scheduler`
4. Expiration: 90 days or custom
5. **Repository access**: Only select repositories → choose `middog/sdcap-governance`
6. **Permissions**:
   - Issues: **Read and write**
   - Metadata: **Read-only** (auto-selected)
7. **Generate token**
8. **Copy immediately**—you won't see it again!

### 4.2 Save Token

```bash
# Development (.env)
ENABLE_GITHUB=true
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxx
GITHUB_ORG=middog
GITHUB_REPO=sdcap-governance

# Production
export TF_VAR_enable_github=true
export TF_VAR_github_token='github_pat_xxxxxxxxxxxxxxxxxx'
```

### 4.3 Token Rotation

Set a calendar reminder to rotate before expiration. When you rotate:
1. Create new token
2. Update in Terraform/env
3. Deploy
4. Delete old token

---

## Step 5: Slack Notifications

Posts booking notifications to a Slack channel.

### 5.1 Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. **Create New App → From scratch**
3. App Name: `SDCoLab Scheduler`
4. Workspace: Select yours
5. **Create App**

### 5.2 Enable Incoming Webhooks

1. **Incoming Webhooks** in sidebar
2. Toggle **ON**
3. **Add New Webhook to Workspace**
4. Select channel: `#colab-bookings`
5. **Allow**
6. Copy the **Webhook URL**

### 5.3 Test It

```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"🔧 SDCoLab Scheduler connected!"}' \
  'https://hooks.slack.com/services/T.../B.../XXX'
```

### 5.4 Save Webhook URL

```bash
# Development (.env)
ENABLE_SLACK=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../XXX
SLACK_CHANNEL=#colab-bookings

# Production
export TF_VAR_enable_slack=true
export TF_VAR_slack_webhook_url='https://hooks.slack.com/services/T.../B.../XXX'
```

---

## Step 6: Email via AWS SES

Send booking confirmations, reminders, and notifications.

### 6.1 Verify Sender Identity

**For Testing (Sandbox Mode)**:
1. Go to [SES Console → Verified identities](https://console.aws.amazon.com/ses/)
2. **Create identity → Email address**
3. Enter: `noreply@sdcolab.org`
4. Click verification link in email

**For Production (Domain Verification)**:
1. **Create identity → Domain**
2. Enter: `sdcolab.org`
3. Add these DNS records:
   - 3 DKIM CNAME records
   - SPF TXT record
   - Optional: DMARC TXT record
4. Wait for verification (up to 72 hours)

### 6.2 Request Production Access

SES sandbox only sends to verified emails. For production:

1. **Account dashboard → Request production access**
2. Fill form:
   - Mail type: **Transactional**
   - Website: `https://scheduler.sdcolab.org`
   - Use case: "Booking confirmations and reminders for makerspace scheduling"
3. Wait 24-48 hours for approval

### 6.3 IAM Permissions

Your Lambda role (created by Terraform) already includes SES permissions.

### 6.4 Save Configuration

```bash
# Development (.env)
ENABLE_EMAIL=true
SES_FROM_EMAIL=noreply@sdcolab.org
SES_REPLY_TO=info@sdcolab.org

# Production (terraform.tfvars)
enable_email = true
```

---

## Quick Reference: Complete .env Example

```bash
# Core (REQUIRED)
NODE_ENV=development
PORT=3001
BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your-generated-secret-at-least-48-chars
SCHEDULER_API_KEY=your-generated-hex-key

# Auth
ENABLE_AUTH_EMAIL=true
ENABLE_AUTH_GOOGLE=true
GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx

# Integrations (all optional)
ENABLE_GCAL=true
GCAL_AUTH_METHOD=service_account_key
GOOGLE_PROJECT_ID=sdcolab-scheduler
GOOGLE_CLIENT_EMAIL=scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GCAL_PRIMARY_CALENDAR_ID=abc123@group.calendar.google.com

ENABLE_GITHUB=true
GITHUB_TOKEN=github_pat_xxxx
GITHUB_ORG=middog
GITHUB_REPO=sdcap-governance

ENABLE_SLACK=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../XXX

ENABLE_EMAIL=true
SES_FROM_EMAIL=noreply@sdcolab.org
```

---

## 🔒 Security Checklist

### Before First Deploy
- [ ] `.env` is in `.gitignore`
- [ ] `terraform.tfvars` is in `.gitignore`
- [ ] JWT_SECRET is unique and random (48+ chars)
- [ ] No secrets in `terraform.tfvars.sdcolab` (that's committed)

### Token Scopes (Principle of Least Privilege)
- [ ] GitHub token: Only Issues + Metadata on specific repo
- [ ] Google OAuth: Only `openid`, `email`, `profile`
- [ ] GCal service account: Only Calendar API access
- [ ] SES: Only `ses:SendEmail`, `ses:SendRawEmail`

### Ongoing Maintenance
- [ ] Rotate JWT_SECRET quarterly or after team changes
- [ ] Rotate GitHub token before expiration (set reminder)
- [ ] Review OAuth consent screen test users
- [ ] Monitor for unusual API activity (CloudWatch, GCP logging)

### Environment Isolation
- [ ] Dev secrets ≠ Prod secrets (completely separate)
- [ ] Separate Google Cloud projects per environment (ideal)
- [ ] Separate GitHub tokens per environment

---

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| `redirect_uri_mismatch` | OAuth callback URL doesn't match | Check exact URL including trailing slash |
| `invalid_grant` | Token expired or revoked | Regenerate and redeploy |
| `Calendar not found` | Calendar ID wrong or not shared | Verify Calendar ID and sharing permissions |
| `Bad credentials` (GitHub) | Token expired or wrong scope | Generate new token with correct permissions |
| `Email address not verified` | SES sandbox mode | Request production access or verify recipient |
| `Access Denied` (AWS) | IAM permissions | Check Lambda role has required policies |

---

## Fire Triangle Context 🔥

These credentials power the **FUEL layer** (infrastructure) that supports the **OXYGEN layer** (SDCAP governance) and **HEAT layer** (community engagement).

Following Burning Man principles:
- **Radical Self-Reliance**: We own our infrastructure and credentials
- **Decommodification**: Using open-source tools, not vendor lock-in
- **Civic Responsibility**: Securing community data properly

---

*Part of the [SDCoLab Scheduler](/) project*
