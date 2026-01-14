# SDCoLab Scheduler - Integration Keys Setup Guide

**Version:** 3.9.0  
**Last Updated:** January 2025

This guide walks through generating all API keys and credentials needed to enable the scheduler's integrations.

---

## Quick Reference

| Integration | Required Keys | Setup Time |
|-------------|--------------|------------|
| JWT (Required) | `JWT_SECRET` | 1 min |
| Scheduler Jobs | `SCHEDULER_API_KEY` | 1 min |
| Google OAuth | Client ID + Secret | 10 min |
| Google Calendar | Service Account or Workload Identity | 15-30 min |
| GitHub Issues | Personal Access Token | 5 min |
| GitHub Discussions | PAT + Repo feature enabled | 5 min |
| GitHub Projects | PAT + Project ID | 10 min |
| Slack | Webhook URL | 5 min |
| Email (SES) | Verified domain/email | 10-30 min |

---

## 1. Core Secrets (Required)

### JWT_SECRET

Used to sign authentication tokens. Must be a long, random string.

```bash
# Generate a secure secret (pick one method):

# OpenSSL
openssl rand -base64 48

# Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# /dev/urandom
head -c 48 /dev/urandom | base64
```

**Example output:** `K7xB2mN9pQrS4tVwY1zA3cE5fG8hJ0kL...`

Set in `.env`:
```
JWT_SECRET=your-generated-secret-here
```

### SCHEDULER_API_KEY

Used by EventBridge/cron to trigger automated jobs (reminders, cert warnings).

```bash
# Generate another random key
openssl rand -hex 32
```

Set in `.env`:
```
SCHEDULER_API_KEY=your-generated-key-here
```

---

## 2. Google OAuth (Login with Google)

Enable users to sign in with their Google accounts.

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your **Project ID**

### Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services → OAuth consent screen**
2. Choose **External** (unless you have Google Workspace)
3. Fill in required fields:
   - App name: `SDCoLab Scheduler`
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
5. Add test users (while in testing mode)

### Step 3: Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `SDCoLab Scheduler`
5. Add Authorized JavaScript origins:
   ```
   http://localhost:5173
   https://scheduler.sdcolab.org
   ```
6. Add Authorized redirect URIs:
   ```
   http://localhost:3001/api/auth/google/callback
   https://api.scheduler.sdcolab.org/api/auth/google/callback
   ```
7. Click **Create**
8. Copy **Client ID** and **Client Secret**

### Set in `.env`:
```
ENABLE_AUTH_GOOGLE=true
GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_CALLBACK_URL=/api/auth/google/callback
```

---

## 3. Google Calendar Integration

Two authentication methods are available:

### Option A: Service Account Key (Simpler)

Best for: Development, single-org deployments

#### Step 1: Create Service Account

1. In Google Cloud Console, go to **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Name: `sdcolab-scheduler`
4. Grant role: **No role needed** (we'll share calendars directly)
5. Click **Done**

#### Step 2: Create Key

1. Click on the service account you created
2. Go to **Keys** tab
3. Click **Add Key → Create new key**
4. Choose **JSON**
5. Download the key file

#### Step 3: Extract Values

Open the JSON file and extract:

```json
{
  "project_id": "your-project-id",
  "client_email": "sdcolab-scheduler@your-project.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\n..."
}
```

#### Step 4: Share Calendar with Service Account

1. Open [Google Calendar](https://calendar.google.com)
2. Find your calendar → Settings (⚙️)
3. Under **Share with specific people**, add the service account email
4. Give permission: **Make changes to events**
5. Copy the **Calendar ID** (looks like `abc123@group.calendar.google.com`)

#### Set in `.env`:
```
ENABLE_GCAL=true
GCAL_AUTH_METHOD=service_account_key
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_CLIENT_EMAIL=sdcolab-scheduler@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
GCAL_PRIMARY_CALENDAR_ID=abc123@group.calendar.google.com
```

> ⚠️ **Note:** The private key must be on one line with `\n` escapes, or wrapped in quotes.

### Option B: Workload Identity Federation (Production)

Best for: AWS Lambda deployments, no stored credentials

See [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md) for detailed Workload Identity configuration.

---

## 4. GitHub Integration (Issues, Discussions, Projects)

Creates GitHub issues for booking/maintenance requests, discussions for policy/feedback, and optionally tracks items on project boards.

### 🔥 Fire Triangle Alignment

| Content Type | GitHub Feature | Fire Element |
|-------------|----------------|--------------|
| Tool bookings | Issue | 🟡 FUEL |
| Maintenance requests | Issue | 🟡 FUEL |
| Policy questions | Discussion | 🔵 OXYGEN |
| Feedback/ideas | Discussion | 🔴 HEAT |
| Vision proposals | Discussion | 🔴 HEAT |

### Step 1: Create Personal Access Token

**Option A: Fine-Grained Token (Recommended)**

1. Go to [GitHub Settings → Developer settings → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **Generate new token**
3. Token name: `SDCoLab Scheduler`
4. Expiration: 90 days or custom
5. **Repository access**: Only select repositories → choose your repo
6. **Permissions**:
   - Issues: **Read and write**
   - Discussions: **Read and write** (if using Discussions)
   - Metadata: **Read-only** (required)
   - Projects: **Read and write** (if using Projects)
7. Generate and copy immediately

**Option B: Classic Token**

1. Go to [GitHub Settings → Developer settings → Personal access tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Note: `SDCoLab Scheduler`
4. Select scopes:
   - `repo` (for private repos) or `public_repo` (for public)
   - `write:discussion` (if using Discussions)
   - `project` (if using org-level Projects)
5. Generate and copy immediately

### Step 2: Enable Repo Features

**For Discussions:**
1. Go to your repo → Settings → General
2. Scroll to "Features"
3. Check **Discussions**
4. Configure discussion categories (Ideas, Q&A, General, etc.)

**For Projects:**
1. Go to your org → Projects → New project
2. Create a board (Table, Board, or Roadmap view)
3. Get the Project ID (see below)

### Step 3: Get Project ID (if using Projects)

```bash
# Using GitHub CLI
gh project list --owner middog --format json

# Or via GraphQL API
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -X POST https://api.github.com/graphql \
  -d '{"query":"{ organization(login: \"middog\") { projectsV2(first: 10) { nodes { id title } } } }"}'
```

The ID looks like: `PVT_kwDOxxxxxx`

### Set in `.env`:
```bash
# Basic (Issues only)
ENABLE_GITHUB=true
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=middog
GITHUB_REPO=sdcap-governance

# Enable Discussions (optional)
ENABLE_GITHUB_DISCUSSIONS=true

# Enable Projects (optional)
GITHUB_PROJECT_ID=PVT_kwDOxxxxxx

# Custom category mapping (optional)
# GITHUB_CATEGORY_POLICY=general
# GITHUB_CATEGORY_FEEDBACK=ideas
```

### What Gets Created Where

With full integration enabled:

| User Action | Creates |
|-------------|---------|
| Book a tool | Issue with `fire:fuel` label |
| Report maintenance | Issue with `fire:fuel` + `maintenance` labels |
| Submit feedback | Discussion in "Ideas" category |
| Ask policy question | Discussion in "General" category |
| Propose vision | Discussion in "Ideas" category |

All items automatically include Fire Triangle metadata and can be added to a Project board for visual tracking.

---

## 5. Slack Integration

Posts notifications to a Slack channel.

### Step 1: Create Slack App (Incoming Webhook)

1. Go to [Slack API: Your Apps](https://api.slack.com/apps)
2. Click **Create New App → From scratch**
3. App Name: `SDCoLab Scheduler`
4. Pick your workspace
5. Click **Create App**

### Step 2: Enable Incoming Webhooks

1. In the app settings, go to **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks** to ON
3. Click **Add New Webhook to Workspace**
4. Select channel: `#colab-bookings` (or your preferred channel)
5. Click **Allow**
6. Copy the **Webhook URL**

The URL looks like:
```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

### Set in `.env`:
```
ENABLE_SLACK=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../XXX...
SLACK_CHANNEL=#colab-bookings
```

### Test the Webhook:
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"🔧 SDCoLab Scheduler connected!"}' \
  YOUR_WEBHOOK_URL
```

---

## 6. Email (AWS SES)

Send booking confirmations, reminders, and notifications.

### Step 1: Verify Sender Identity

**Option A: Verify Email Address** (Quick, sandbox only)

1. Go to [AWS SES Console](https://console.aws.amazon.com/ses/)
2. Navigate to **Verified identities**
3. Click **Create identity**
4. Choose **Email address**
5. Enter: `noreply@sdcolab.org`
6. Click verification link sent to that email

**Option B: Verify Domain** (Production)

1. In SES Console → **Verified identities**
2. Click **Create identity**
3. Choose **Domain**
4. Enter: `sdcolab.org`
5. Add the provided DNS records:
   - DKIM (3 CNAME records)
   - SPF (TXT record)
   - Optional: DMARC (TXT record)
6. Wait for verification (can take up to 72 hours)

### Step 2: Request Production Access

SES starts in sandbox mode (can only send to verified emails).

1. Go to **Account dashboard**
2. Click **Request production access**
3. Fill out the form:
   - Mail type: Transactional
   - Website URL: your scheduler URL
   - Use case: Booking confirmations, reminders
4. Wait for approval (usually 24-48 hours)

### Step 3: Configure IAM Permissions

Your Lambda execution role needs SES permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

### Set in `.env`:
```
ENABLE_EMAIL=true
SES_FROM_EMAIL=noreply@sdcolab.org
SES_REPLY_TO=info@sdcolab.org
```

### Alternative: SMTP Provider

If not using AWS SES:

```
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
```

---

## 7. Complete Example `.env`

```bash
# Core
NODE_ENV=production
BASE_URL=https://api.scheduler.sdcolab.org
FRONTEND_URL=https://scheduler.sdcolab.org
ALLOWED_ORIGINS=https://scheduler.sdcolab.org

# Secrets
JWT_SECRET=K7xB2mN9pQrS4tVwY1zA3cE5fG8hJ0kL...
SCHEDULER_API_KEY=a1b2c3d4e5f6...

# AWS (set by Lambda environment)
AWS_REGION=us-west-2

# Auth
ENABLE_AUTH_EMAIL=true
ENABLE_AUTH_GOOGLE=true
GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx

# Integrations
ENABLE_GCAL=true
GCAL_AUTH_METHOD=service_account_key
GOOGLE_PROJECT_ID=sdcolab-scheduler
GOOGLE_CLIENT_EMAIL=scheduler@sdcolab-scheduler.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GCAL_PRIMARY_CALENDAR_ID=abc123@group.calendar.google.com

ENABLE_GITHUB=true
GITHUB_TOKEN=ghp_xxxx
GITHUB_ORG=middog
GITHUB_REPO=sdcap-governance
ENABLE_GITHUB_DISCUSSIONS=true
GITHUB_PROJECT_ID=PVT_kwDOxxxx

ENABLE_SLACK=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../XXX

ENABLE_EMAIL=true
SES_FROM_EMAIL=noreply@sdcolab.org
```

---

## Troubleshooting

### Google OAuth: "redirect_uri_mismatch"
- Ensure callback URL exactly matches what's in Google Console
- Check for trailing slashes
- Verify you're using the correct environment (dev vs prod)

### Google Calendar: "insufficient permissions"
- Verify calendar is shared with service account email
- Check service account has "Make changes to events" permission
- Ensure correct Calendar ID (not just "primary" unless using user's default)

### GitHub: "Bad credentials"
- Token may have expired
- Check token has required scopes
- Verify token is for correct account/org

### Slack: "invalid_payload"
- Webhook URL may be revoked
- Check JSON formatting in request
- Verify app is still installed in workspace

### SES: "Email address not verified"
- Still in sandbox mode — request production access
- Or verify recipient email addresses for testing

---

## Security Notes

1. **Never commit `.env` files** — use `.env.example` as template
2. **Rotate secrets regularly** — especially after team changes
3. **Use environment-specific keys** — don't share between dev/staging/prod
4. **Limit token scopes** — only grant permissions actually needed
5. **Monitor usage** — set up alerts for unusual API activity
