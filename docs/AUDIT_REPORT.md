# SDCoLab Scheduler v3.5.0 - Pre-Production Audit Report

**Date:** January 2025  
**Auditor:** Claude (mid.dog technical review)  
**Domain Target:** `sdcolab.mid.dog`
**Status:** ✅ All P0 and P1 issues resolved

---

## Executive Summary

All critical (P0) and important (P1) issues have been resolved in v3.5.0. The system is now ready for production key integration.

---

## ✅ RESOLVED: P0 Critical Issues

### 1. ~~Certification Expiry Warnings - STUB ONLY~~ → FIXED

**Status:** ✅ Implemented in `backend/src/routes/notifications.js:320-420`

The certification expiry warning system now:
- Queries active certifications for all users
- Checks expiration dates against user-configured warning windows (default 30 days)
- Sends email notifications using the `announcement` template
- Creates in-app notifications for the UI
- Respects user notification preferences

---

### 2. ~~Email Integration Not in Hook System~~ → FIXED

**Status:** ✅ Implemented in `backend/src/integrations/index.js`

Email notifications are now wired up for:
- `booking.approved` → Sends approval email to user
- `booking.rejected` → Sends rejection email with reason
- `user.invited` → Sends invitation email
- `user.created` → Sends account creation email with temp password
- `password.reset_requested` → Sends password reset email

All email hooks respect user notification preferences.

---

### 3. ~~Scheduler API Key Not Configured~~ → FIXED (v3.4.0)

**Status:** ✅ Fixed in v3.4.0
- `SCHEDULER_API_KEY` added to Lambda environment variables
- Auto-generates secure key if not provided
- Used in `config.scheduler.apiKey` throughout the app

---

## ✅ RESOLVED: P1 Important Issues

### 4. ~~Password Reset Token Scan is Insecure/Inefficient~~ → FIXED

**Status:** ✅ Implemented in `backend/src/lib/database.js:495-515`

New `userService.getByResetToken(token)` method:
- Uses DynamoDB Scan with FilterExpression (not in-memory filtering)
- Checks both token match AND expiration in the query
- Limits to 1 result for efficiency
- Used in `auth.js` reset-password endpoint

---

### 5. ~~Missing Scheduled Lambda for Reminders~~ → FIXED

**Status:** ✅ Implemented in `infrastructure/main.tf:790-890`

Added EventBridge scheduled rules:
- **Booking reminders**: Daily at 9 AM UTC (configurable via `reminder_schedule`)
- **Cert warnings**: Weekly on Mondays at 9 AM UTC (configurable via `cert_warning_schedule`)
- Both can be disabled via `enable_scheduled_reminders = false`
- Includes proper Lambda permissions for EventBridge invocation

---

### 6. ~~CORS Hardcoded to Wildcard in API Gateway~~ → FIXED (v3.4.0)

**Status:** ✅ Fixed in v3.4.0
- CORS now uses `local.effective_domain` when configured
- Falls back to `*` only in development

---

### 7. ~~OAuth Account Linking Flow Incomplete~~ → FIXED

**Status:** ✅ Implemented in:
- `backend/src/lib/oauth.js` - Added `linkToEmail` support in state
- `backend/src/routes/auth.js` - Updated callback to handle linking flow

The linking flow now:
- Passes authenticated user's email in OAuth state
- Callback checks for `linkToEmail` to distinguish link vs. login
- Prevents linking if provider already used by another account
- Properly redirects to settings with success/error messages

---

## 🟢 Remaining Nice-to-Have (P2)

These items are documented but not blocking production:

| Issue | Status | Notes |
|-------|--------|-------|
| No dedicated resources table | Deferred | Works with certifications table fallback |
| SES domain not verified | Manual | Requires manual AWS console setup |
| Activity log TTL | Works | Uses default 90-day retention |
| Frontend URL hardcoding | Minor | Uses `process.env.FRONTEND_URL` |
| Rate limiting | Future | Consider WAF for production |

---

## v3.5.0 Changes Summary

### Backend (`backend/`)
- `src/integrations/index.js` - Email hooks wired up for all booking events
- `src/routes/notifications.js` - Full cert warning implementation
- `src/routes/auth.js` - OAuth linking flow + efficient token lookup
- `src/lib/database.js` - Added `getByResetToken()` method
- `src/lib/oauth.js` - Support for `linkToEmail` in OAuth state

### Infrastructure (`infrastructure/`)
- `main.tf` - Added EventBridge scheduled rules for reminders
- Variables: `enable_scheduled_reminders`, `reminder_schedule`, `cert_warning_schedule`

### Configuration
- Version bumped to 3.5.0

---

## Ready for Production

To deploy to `sdcolab.mid.dog`:

```bash
# Using default DNS settings (sdcolab.mid.dog)
./scripts/deploy.sh prod

# Or with explicit configuration
DNS_ZONE_NAME=mid.dog DNS_SUBDOMAIN=sdcolab ./scripts/deploy.sh prod
```

After deployment, enable integrations by setting environment variables or terraform vars:
- `enable_email = true` (requires SES domain verification)
- `enable_gcal = true` (requires Google Calendar setup)
- `enable_github = true` (requires GitHub token)
- `enable_slack = true` (requires Slack webhook)

---

*🔥 Fire Triangle: OXYGEN layer - all systems verified and flows connected.*
