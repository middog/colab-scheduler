# 📅 Google Calendar Integration Setup

This guide covers setting up Google Calendar integration for the SDCoLab Scheduler.

**Important**: Calendar integration is completely optional! The scheduler works great without it.

---

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. Access to create a GCP project (personal or organization)
3. Google Workspace or personal Google account for calendars

---

## Step 1: Create GCP Project

```bash
# Create a new project
gcloud projects create sdcolab-scheduler --name="SDCoLab Scheduler"

# Set as current project
gcloud config set project sdcolab-scheduler

# Enable required APIs
gcloud services enable calendar-json.googleapis.com
gcloud services enable iamcredentials.googleapis.com
```

---

## Step 2: Create Service Account

```bash
# Create service account
gcloud iam service-accounts create scheduler-sa \
  --display-name="SDCoLab Scheduler Service Account"

# Get the email (you'll need this later)
gcloud iam service-accounts list
# Output: scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com
```

---

## Step 3: Choose Authentication Method

You have two options for authenticating. Choose based on your organization's policies.

### Option A: Workload Identity Federation (Recommended)

**Best for**: Organizations that block service account key creation, or anyone who wants better security.

**How it works**: AWS Lambda assumes an identity that GCP trusts, no keys needed.

```bash
# 1. Get your AWS Account ID
aws sts get-caller-identity --query Account --output text
# Output: 123456789012

# 2. Get your GCP Project Number (not ID!)
gcloud projects describe sdcolab-scheduler --format='value(projectNumber)'
# Output: 987654321098

# 3. Create Workload Identity Pool
gcloud iam workload-identity-pools create "aws-lambda-pool" \
  --location="global" \
  --display-name="AWS Lambda Pool" \
  --description="Allows AWS Lambda to authenticate to GCP"

# 4. Create AWS Provider in the pool
gcloud iam workload-identity-pools providers create-aws "aws-provider" \
  --location="global" \
  --workload-identity-pool="aws-lambda-pool" \
  --account-id="YOUR_AWS_ACCOUNT_ID" \
  --attribute-mapping="google.subject=assertion.arn,attribute.aws_account=assertion.account,attribute.aws_role=assertion.arn.extract('assumed-role/{role}/')"

# 5. Allow the pool to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding \
  scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/aws-lambda-pool/attribute.aws_account/YOUR_AWS_ACCOUNT_ID"
```

**Configure in terraform.tfvars**:
```hcl
enable_gcal = true
gcal_auth_method = "workload_identity"
gcal_project_number = "987654321098"  # Your GCP project NUMBER
gcal_pool_id = "aws-lambda-pool"
gcal_provider_id = "aws-provider"
gcal_service_account_email = "scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com"
```

---

### Option B: Service Account Key (Traditional)

**Best for**: Personal projects, quick setup, or when Workload Identity isn't available.

**Note**: Your organization might block key creation. If you see "PERMISSION_DENIED" when creating keys, use Option A instead.

```bash
# Create and download key
gcloud iam service-accounts keys create key.json \
  --iam-account=scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com

# View the key (you'll extract values from this)
cat key.json
```

**Extract these values from key.json**:
- `project_id`
- `private_key_id`
- `private_key`
- `client_email`
- `client_id`

**Configure in terraform.tfvars**:
```hcl
enable_gcal = true
gcal_auth_method = "service_account_key"
gcal_project_id = "sdcolab-scheduler"
gcal_client_email = "scheduler-sa@sdcolab-scheduler.iam.gserviceaccount.com"
gcal_private_key = <<-EOT
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqh...
-----END PRIVATE KEY-----
EOT
```

**Security**: Delete the key.json file after extracting values!

---

## Step 4: Create and Share Calendars

### Main Events Calendar

1. Go to [Google Calendar](https://calendar.google.com)
2. Click **+** next to "Other calendars" → **Create new calendar**
3. Name it: "SDCoLab Tool Bookings"
4. Create the calendar
5. Go to Settings → Share with specific people
6. Add your service account email with "Make changes to events" permission
7. Copy the Calendar ID from "Integrate calendar" section

### Resource Calendars (Optional)

If you want room reservations, create calendars for each room:

| Room | Calendar Name |
|------|---------------|
| Laser Lab | SDCoLab - Laser Lab |
| Sewing Room | SDCoLab - Sewing Room |
| Woodshop | SDCoLab - Woodshop |
| Electronics Lab | SDCoLab - Electronics Lab |
| 3D Printing Area | SDCoLab - 3D Printing |
| CNC Area | SDCoLab - CNC Area |

Share each with the service account.

**For Google Workspace Admins**: You can create proper resource calendars in Admin Console → Buildings and Resources. These show up as "busy" when booked.

---

## Step 5: Configure Calendar IDs

Add to terraform.tfvars:

```hcl
# Main calendar for all events
gcal_primary_calendar_id = "abc123xyz@group.calendar.google.com"

# Resource calendars (optional - for room reservations)
gcal_laser_lab_id = "laser123@group.calendar.google.com"
gcal_sewing_id = "sewing456@group.calendar.google.com"
gcal_woodshop_id = "wood789@group.calendar.google.com"
gcal_electronics_id = "electronics@group.calendar.google.com"
gcal_3d_printing_id = "printing@group.calendar.google.com"
gcal_cnc_id = "cnc@group.calendar.google.com"
```

---

## Step 6: Deploy and Test

```bash
# Deploy with calendar enabled
ENABLE_GCAL=true ./scripts/deploy.sh dev

# Check the health endpoint
curl https://YOUR_API_URL/api/health | jq '.integrations.googleCalendar'
# Should show: { "enabled": true, "initialized": true }
```

---

## Troubleshooting

### "PERMISSION_DENIED" when creating service account keys

Your organization has blocked key creation. Use Workload Identity Federation (Option A) instead.

### "Calendar not found" or "Forbidden" errors

1. Verify the calendar ID is correct (check Calendar Settings)
2. Ensure the service account has "Make changes to events" permission
3. Check the service account email is spelled correctly

### Events created but no room reservation

Resource calendars need to be:
1. Shared with the service account
2. Calendar ID added to the correct env var (e.g., `GCAL_LASER_LAB_ID`)

### Workload Identity "invalid_grant" errors

1. Verify AWS account ID matches what you configured
2. Check the Lambda execution role ARN
3. Ensure the workload identity pool binding is correct

---

## Running Without Calendar Integration

The scheduler works perfectly without Google Calendar! Bookings are stored in DynamoDB and the approval workflow still works—you just won't get calendar events.

To disable:
```hcl
enable_gcal = false
```

Or don't set any GCAL_ environment variables.

---

## Security Notes

1. **Never commit secrets** - terraform.tfvars is in .gitignore
2. **Use Workload Identity when possible** - no keys to manage or rotate
3. **Least privilege** - service account only needs Calendar API access
4. **Rotate keys regularly** - if using service account keys, rotate every 90 days

---

*🔥 Part of the SDCoLab Fire Triangle ecosystem*
