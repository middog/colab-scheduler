# SDCoLab Scheduler Changelog

## Version 4.2.0-rc69.11 (January 2026)

### GitHub Issue Templates Integration 🐙

Major enhancement: GitHub-native issue management with dynamic YAML form rendering.

#### New Features

**GitHub Issue Templates**
- Created 4 comprehensive YAML issue templates in `.github/ISSUE_TEMPLATE/`:
  - 🐛 Bug Report (`bug_report.yml`) - Software/application issues
  - ✨ Feature Request (`feature_request.yml`) - New functionality suggestions
  - 🔧 Maintenance Request (`maintenance.yml`) - Equipment/facility issues
  - 🔑 Access Request (`access_request.yml`) - Certification/access needs
- Template chooser configuration (`config.yml`) with contact links
- Fire Triangle classification labels on all templates

**Backend: GitHub Integration Routes** (`backend/src/routes/github.js`)
- `GET /api/github/templates` - Fetch and parse YAML templates from repo
- `GET /api/github/issues` - Read issues from GitHub with DynamoDB caching
- `POST /api/github/issues` - Create issues in GitHub with write-through cache
- `POST /api/github/issues/:number/comments` - Add comments to issues
- `PATCH /api/github/issues/:number` - Update issue state/labels
- `GET /api/github/issues/:number/version` - Check for updates (conflict detection)
- `POST /api/github/issues/sync` - Force full refresh from GitHub
- `GET /api/github/status` - Check GitHub integration health
- `GET /api/github/templates/generate` - Generate YAML with current tools/rooms

**Frontend: Dynamic Form Rendering**
- `TemplateForm.jsx` - Renders YAML form fields with full fidelity:
  - Input, textarea, dropdown (single/multi), checkboxes, markdown
  - Form validation and error display
  - Issue body builder from form values
- `IssueDetail.jsx` - View issues with comments:
  - Draft comment persistence (auto-save to localStorage)
  - Optimistic conflict resolution (detects updates before submit)
  - Status management for admins/stewards
- `TemplateGenerator.jsx` - Admin tool to generate template YAML:
  - Generates maintenance/access templates with current tools/rooms
  - Copy to clipboard or download functionality
- `IssueDashboard.jsx` - Refactored for GitHub-native:
  - Template selector modal for issue creation
  - Filter by status, severity, Fire Triangle element
  - Sync status indicator with manual refresh
  - Direct links to GitHub issues

**GitHub Label Schema**
- Status labels: `status:new`, `status:triaged`, `status:in-progress`, `status:resolved`, `status:wont-fix`
- Severity labels: `severity:critical`, `severity:high`, `severity:medium`, `severity:low`
- Fire Triangle: `fire:fuel`, `fire:oxygen`, `fire:heat`
- Template tracking: `template:bug-report`, `template:maintenance`, etc.

**Architecture: GitHub Primary, DynamoDB Cache**
- Write path: User → API → GitHub → DynamoDB (cache update)
- Read path: User → API → DynamoDB (cache) → GitHub (if stale)
- Fallback: Serve cache with warning banner when GitHub unavailable
- Cache staleness threshold: 5 minutes

#### Files Changed
- **New:** `.github/ISSUE_TEMPLATE/*.yml` - 4 templates + config
- **New:** `backend/src/routes/github.js` - GitHub integration routes
- **New:** `frontend/src/components/TemplateForm.jsx` - Dynamic form renderer
- **New:** `frontend/src/components/IssueDetail.jsx` - Issue view with comments
- **New:** `frontend/src/components/TemplateGenerator.jsx` - Admin YAML generator
- **Modified:** `backend/src/index.js` - Added github routes
- **Modified:** `frontend/src/components/IssueDashboard.jsx` - Refactored for GitHub
- **Modified:** `frontend/src/components/AdminPanel.jsx` - Added template generator link
- **Modified:** `frontend/src/ColabScheduler.jsx` - Added template-generator view

---

## Version 4.2.0-rc69.11 (January 2026)

### OpenTofu/Terraform Provider Fix 🔧

Fixed AWS provider version constraint to ensure `nodejs24.x` Lambda runtime support.

#### Changes
- Updated `infrastructure/main.tf` provider constraint from `~> 6.21` to `>= 6.21.0`
- This ensures OpenTofu/Terraform pulls provider version 6.21.0+ which includes nodejs24.x validation

#### Version Consistency
- Unified version string to `4.2.0-rc69.11` across all files:
  - `README.md`
  - `backend/package.json`
  - `frontend/package.json`
  - `frontend/src/ColabScheduler.jsx` (footer)
  - `backend/src/index.js` (console logs)
  - `scripts/deploy.sh`
  - `scripts/destroy.sh`
  - `docs/API.md`

#### Deployment Note
Before deploying, clear cached providers:
```bash
cd infrastructure
rm -rf .terraform/providers
tofu init -upgrade
```

---

## Version 4.2.0-rc69.9 (January 2026)

### Syntax Error Fixes (Comprehensive) 🐛

Fixed all remaining missing closing braces in object literals across backend route files. These were introduced during bulk API response standardization but not properly saved to the deployment package.

#### Fixed Files
| File | Lines Fixed |
|------|-------------|
| `auth.js` | 124, 261, 271, 426, 449, 484, 672, 678, 757 |
| `users.js` | 236, 281, 304, 333 |
| `notifications.js` | 113, 247, 319, 444 |
| `certifications.js` | 218, 457 |
| `waitlist.js` | 184, 268 |
| `recurring.js` | 171, 188 |

#### Pattern Fixed
```javascript
// Before (broken)
sendSuccess(res, { message: 'User deleted');

// After (fixed)  
sendSuccess(res, { message: 'User deleted' });
```

#### Verification
- All 37 backend JS files pass Node.js `--check` syntax validation
- Backend esbuild bundle compiles successfully
- Frontend Vite build completes without errors

---

## Version 4.2.0-rc69.8 (January 2026)

### Missing Room Update Endpoint 🧨

Added `PUT /resources/rooms/:id` endpoint - the frontend ResourceManagement component was calling this route but it didn't exist in the backend.

#### Added
- **`PUT /api/resources/rooms/:id`** - Update room properties
  - Accepts: `name`, `capacity`, `description`, `imageUrl`, `bookable`, `requiresApproval`, `allowedRoles`, `status`
  - Returns: `{ success: true, data: { room } }`
  - Requires: admin role
  - Logs activity: `resource.room_updated`

#### Route Inventory (rooms)
| Method | Path | Status |
|--------|------|--------|
| GET | `/api/resources/rooms` | ✅ |
| POST | `/api/resources/rooms` | ✅ |
| PUT | `/api/resources/rooms/:id` | ✅ **NEW** |

---

## Version 4.2.0-rc69.7 (January 2026)

### Syntax Error Fixes 🐛

Fixed malformed `sendError()` calls introduced during bulk sed replacements in rc69.3.

#### Errors Fixed
- **Pattern `' });` → `');`** - Missing closing parenthesis in ~60 sendError calls across:
  - `resources.js` (20 fixes)
  - `notifications.js` (14 fixes)
  - `public.js` (4 fixes)
  - `certifications.js` (12 fixes)
  - `waitlist.js` (6 fixes)
  - `recurring.js` (10 fixes)
  - `users.js` (1 fix)
- **`resources.js:820`** - Missing closing brace: `{ state: 'open')` → `{ state: 'open' })`

All backend routes now pass Node.js syntax checking.

---

## Version 4.2.0-rc69.6 (January 2026)

### API Client Consistency Cleanup

Final cleanup to ensure all frontend code uses a single contract path for API calls.

#### Changes
- **PublicToolsCatalog.jsx** - Now uses shared `api()` client instead of raw `fetch()`
  - Benefits: consistent error handling, base URL normalization, future auth/etag support
- **AnalyticsDashboard.jsx** - Export uses `getTokens().authToken` instead of `localStorage.getItem('token')`
  - Prevents issues if token storage/refresh evolves

#### Single Contract Rule
All API calls now follow this pattern:
- **JSON endpoints:** Use `import { api } from '../lib/api.js'`
- **File downloads:** Use raw `fetch()` with `getTokens().authToken` for auth header
- **No direct localStorage access** outside of `lib/api.js`

---

## Version 4.2.0-rc69.5 (January 2026)

### Main Application API Client Migration 🔥

The main `ColabScheduler.jsx` now uses the shared `api()` client from `lib/api.js`, completing the full frontend migration to standardized API handling.

#### What Changed

**ColabScheduler.jsx**
- ✅ Removed local `api()` function (79 lines) - was using legacy `data.code` instead of `data.error.code`
- ✅ Import shared `{ api, setTokens, getTokens }` from `lib/api.js`
- ✅ Session handling (TOKEN_EXPIRED, SESSION_COMPROMISED) now works with standardized error format
- ✅ All `token={authToken}` props updated to `token={getTokens().authToken}`

**PublicToolsCatalog.jsx**
- ✅ Fixed response parsing for standardized format

#### Migration Summary
All frontend code now uses the shared API client:
- `ColabScheduler.jsx` - Main app ✅
- `PublicToolsCatalog.jsx` - Public page ✅
- 10 admin components - All migrated in rc69.4 ✅

---

## Version 4.2.0-rc69.4 (January 2026)

### Frontend Components - Unified API Client Migration 🔥

All UI components now use the shared `api()` client from `lib/api.js` which auto-unwraps standardized `{ success, data }` responses. This eliminates the silent data parsing failures where components showed empty tables/stats.

#### Components Updated
- ✅ `AdminPanel.jsx` - Removed local `api()` helper, uses shared client
- ✅ `NotificationPreferences.jsx` - Uses shared `api()` for preferences load/save
- ✅ `WaitlistPanel.jsx` - Both main panel and WaitlistButton use shared client
- ✅ `AnalyticsDashboard.jsx` - Uses shared `api()` for all analytics endpoints
- ✅ `RecurringBookings.jsx` - Main component and CreateRecurringModal migrated
- ✅ `CertificationManagement.jsx` - All cert type and grant operations use shared client
- ✅ `IssueDashboard.jsx` - Issue loading and resolution use shared client
- ✅ `ResourceManagement.jsx` - Tool/room CRUD operations use shared client
- ✅ `AuditLog.jsx` - Activity log fetching uses shared client
- ✅ `MultiSelectCalendar.jsx` - Batch booking operations use shared client

---

## Version 4.2.0-rc69.3 (January 2026)

### Standardized API Response Format - Complete Backend Migration

#### 🐛 Legacy Auth Response Formats
- **Updated:** `/auth/register` now uses standardized `{ success, data }` format
- **Updated:** `/auth/login` now uses standardized response format
- **Updated:** `/auth/refresh` now uses standardized response format
- **Impact:** Frontend error handling works consistently across all auth flows

### Documentation (rc69.2)

#### 📄 API Documentation Sync
- **Updated:** `docs/API.md` now documents standardized response format
- **Added:** Common error codes reference table
- **Added:** Table of contents for new endpoints (waitlist, recurring, analytics)

---

## Version 4.2.0-rc69.1 (January 2026)

### Bug Fixes (rc69.1)

#### 🐛 API Response Format Mismatch (Critical)
- **Fixed:** Frontend was accessing `response.bookings` instead of `response.data.bookings`
- **Impact:** Booking data wasn't loading correctly, causing slot status issues
- **Solution:** API wrapper now auto-unwraps standardized `{ success, data }` responses
- **Backward compatible:** Preserves `_meta` with success/message/timestamp on unwrapped data

### New Features

#### 🎯 Enhanced Range Selection
- Clear visual indicator when in range selection mode
- Animated pulsing highlight on range start slot
- All slots between start and end now highlighted in orange preview
- Click same slot again to cancel range selection
- Added "Range preview" to legend

#### 📅 Calendar Date Hover Preview
- Mini calendar view with day-by-day navigation
- Green/yellow dots indicate days with approved/pending bookings
- Hover over any date to see:
  - Number of approved bookings
  - Number of pending bookings
  - List of tools booked that day
- Selected date shows booking count badge

#### 📊 Enhanced Slot Booking Display
- Show `X/Y` badge on all slots with concurrent bookings (including pending)
- Added "P" indicator for single-slot tools with pending requests
- Better color coding: yellow for pending-only, purple for has-approved
- Improved tooltip with breakdown of approved vs pending

---

## Version 4.2.0-rc69 (January 2026)

### Release Candidate 69 - Production-Ready Enhancements 🚀

This release implements comprehensive improvements for production readiness including safe-by-default write paths, normalized API responses, and enhanced user experience.

---

### 🚀 Node.js 24 Migration

Upgraded from Node.js 20 to Node.js 24 LTS (supported until April 2028).

#### Changes Made
- `backend/package.json`: Updated esbuild targets from `node20` to `node24`
- `backend/package.json`: Updated engines from `>=20.0.0` to `>=24.0.0`
- `infrastructure/main.tf`: Updated Lambda runtime from `nodejs20.x` to `nodejs24.x`

#### Compatibility Notes
- ✅ Already using ESM (`"type": "module"`)
- ✅ Already using async/await handlers (callback deprecation doesn't affect us)
- ✅ Already using AWS SDK v3
- ✅ No CommonJS `require()` calls
- ✅ No `__dirname`/`__filename` usage

#### Node.js 24 Benefits
- **Undici 7**: Improved `fetch()` performance for AWS API calls
- **Explicit Resource Management**: `using`/`await using` for cleaner cleanup
- **V8 Updates**: General performance improvements
- **LTS Support**: Security patches until April 2028

---

### 🧨 Stability Deep-Dive (Critical Fixes)

#### Fix #1: Route/Persistence Layer Sync
- `bookingService.create()` now accepts ALL fields from route layer:
  - `status` (for auto-approval)
  - `approvedBy/approvedAt` (for auto-approved bookings)
  - `version` (for optimistic concurrency - always starts at 1)
  - Calendar integration fields
  - GitHub integration fields
- Conditional write (`ConditionExpression`) prevents TOCTOU race condition
- `bookingService.update()` now enforces version checking at DB level
- Auto-increments version on every update

#### Fix #2: Consistent API Response Contract
- All endpoints now return standardized shape:
  - Success: `{ success: true, data, message?, timestamp }`
  - Error: `{ success: false, error: { code, message, details?, requestId }, timestamp }`
- Resources routes migrated to new format
- No more mixed legacy `{ error: "..." }` responses

#### Fix #3: Global Error Handler Standardization  
- Global Express error handler now uses same format as `sendError()`
- Detects `ApiError` instances and serializes properly
- Handles `ConditionalCheckFailedException` as `VERSION_MISMATCH`
- Handles validation errors with field details
- 404 handler also uses standardized format

#### Fix #4: Request ID Consistency
- Standardized on `req.requestId` (not `req.id`)
- Standardized on `X-Request-Id` header (not `X-Request-ID`)
- Both maintained during transition for compatibility
- All error responses include consistent `requestId`

#### Fix #5: Resource Management Safety
- Removed risky table fallback (no more certifications table collision)
- `RESOURCES_TABLE` must be explicitly configured
- Added 60-second cache TTL for Lambda warm container safety
- Deduplication prevents multiple simultaneous cache refreshes
- `invalidateCache()` called after all write operations
- Stale cache returned on error rather than empty results

---

### 🧱 Baseline: Safe-by-Default Infrastructure

#### Idempotency on All Mutating Endpoints
- All POST/PUT/DELETE endpoints now support idempotency via `X-Idempotency-Key` header
- Auto-generated keys for booking creation (user:tool:date:time combination)
- Prevents duplicate bookings from double-clicks or network retries
- DynamoDB-backed idempotency store with 5-minute TTL

#### Optimistic Concurrency Control
- All entities now have `version` field for conflict detection
- `If-Match` header support (ETag) on update operations
- Clear error messages: "This was modified by another request. Please refresh."
- Automatic version increment on successful updates
- **NEW: DB-level conditional writes enforce version checking**

#### Normalized API Responses
- Consistent JSON structure: `{ success, data, message, timestamp }`
- Standardized error shape: `{ code, message, details, requestId }`
- No more 204 responses - always return JSON body
- Request tracking via `X-Request-Id` header
- **NEW: Global error handler uses same format**

#### Soft-Delete with Undo Support
- "Delete" now means archive (status=archived), not hard delete
- 10-second undo window for destructive actions
- `undoToken` returned in cancel responses
- `POST /bookings/:id/undo` endpoint for restoration
- Full audit trail of archive/restore operations

---

### 🅰️ Fast, Forgiving Flows

#### Optimistic UI Framework
- New `frontend/src/lib/api.js` with optimistic update utilities
- `createOptimisticUpdate()` helper for instant feedback
- Automatic rollback on API error
- `useApi` and `useFormValidation` React hooks

#### Field-Level Validation
- New `FormField` component with built-in validation display
- Validation before submit (not just on error)
- Individual field error messages (not generic toasts)
- Real-time validation on blur

#### Undo Toast Component
- Visual 10-second countdown for undoable actions
- Keyboard shortcut support (Ctrl+Z)
- Multiple concurrent undo toasts
- Smooth slide-up animation

---

### 🅱️ Calendar UX Improvements

#### Clear Conflict Messaging
- "This slot was taken 12 seconds ago" with timestamp
- Conflict details in error response
- Placeholder for nearest available alternatives

#### Why Can't I Book Explanations
- `CERTIFICATION_REQUIRED` - certification needed
- `MAINTENANCE_WINDOW` - equipment under maintenance
- `HOURS_CLOSED` - space is closed
- `ROLE_RESTRICTED` - role level required
- `BOOKING_LIMIT_EXCEEDED` - max bookings reached

---

### 🅲️ Notification Enhancements

#### Preference Center Ready
- Granular toggle infrastructure
- Email vs SMS vs push (future) separation
- Deep link support in notification payloads

---

### 🅳️ Admin Experience

#### Audit Log UI
- New `AuditLog` component for activity viewing
- Filter by category, user, date range
- Expandable details with JSON diff
- CSV export functionality
- Search across all log fields

#### Bulk Operations
- `POST /bookings/bulk/approve` - approve multiple bookings
- `POST /bookings/bulk/reject` - reject multiple bookings
- Partial success handling with detailed results

---

### New Files

#### Backend
- `backend/src/lib/responses.js` - Standardized API response utilities
- `backend/src/lib/archive.js` - Soft-delete and undo infrastructure
- `backend/src/routes/bookings.js` - Enhanced with all improvements

#### Frontend
- `frontend/src/lib/api.js` - API client with optimistic updates
- `frontend/src/components/UndoToast.jsx` - Undo toast with countdown
- `frontend/src/components/FormField.jsx` - Validated form inputs
- `frontend/src/components/AuditLog.jsx` - Admin audit log viewer

---

### Migration Notes

1. Database entities will gain `version` and `status` fields on next write
2. Existing "deleted" bookings remain as-is (consider migrating to `status=archived`)
3. Frontend should update to use new API response shape (`response.data`)
4. Consider enabling `X-Request-Id` logging in your observability stack

---

### Housekeeping
- Unified version to 4.2.0-rc69 across all package files, scripts, and UI
- Frontend and backend now share consistent versioning
- User-facing footer displays correct version
- Removed orphaned `Help.jsx` (duplicate of `HelpPage.jsx`)
- Regenerated package-lock.json files to sync with package.json

---

## Version 4.3.0 (January 2026)

### Major Security Hardening Release 🔐

This release implements comprehensive security improvements across authentication, session management, and input validation.

---

## Phase 1: Server-Side Session Management

### New: Sessions Table (DynamoDB)

**Table: `colab-scheduler-sessions`**
- Stores hashed refresh tokens server-side
- Enables token revocation (logout, admin revoke)
- Automatic TTL-based expiry
- GSI on userId for efficient session queries

### Refresh Token Rotation

**One-Time Use Tokens**
- Refresh tokens are random secrets (not JWTs)
- Only SHA-256 hashes stored in database
- Token rotates on every refresh (old token invalidated)
- Grace period handling for race conditions

**Replay Attack Detection**
- Reusing an old refresh token triggers immediate session revocation
- Alerts logged for security monitoring
- User forced to re-authenticate

### New API Endpoints

**Session Management**
- `GET /api/auth/sessions` - List all active sessions
- `DELETE /api/auth/sessions/:sessionId` - Revoke specific session
- `POST /api/auth/logout-all` - Revoke all sessions (optional: keep current)

---

## Phase 2: HttpOnly Cookie Authentication 🍪

### Cookie-Based Token Delivery

**Security Benefits**
- Refresh tokens no longer accessible via JavaScript (XSS protection)
- Secure flag enforces HTTPS in production
- SameSite=Strict prevents CSRF in production
- Separate cookie paths minimize token exposure

**Cookie Configuration**
- `colab_access` - Access token (path: /api)
- `colab_refresh` - Refresh token (path: /api/auth/refresh)
- `colab_session` - Session ID (path: /api/auth)

### Backwards Compatibility

- Server accepts both cookie-based and header-based auth
- Frontend sends both for transition period
- Cookies take precedence when present

### New Modules

- `backend/src/lib/cookies.js` - Secure cookie utilities
- `extractAuthMiddleware` - Extracts auth from cookies or headers

---

## Phase 3: Input Validation with Zod 📐

### Validation Middleware

**New: `backend/src/middleware/validate.js`**
- `validate({ body, query, params })` - Full request validation
- `validateBody(schema)` - Body-only validation
- `validateQuery(schema)` - Query params validation
- `validateParams(schema)` - URL params validation

### Schema Modules

| File | Coverage |
|------|----------|
| `schemas/auth.js` | register, login, refresh, password reset, sessions |
| `schemas/bookings.js` | create, update, approve, reject, cancel, list |
| `schemas/resources.js` | create, update, list, availability |
| `schemas/users.js` | update, roles, status, permissions, invite |
| `schemas/notifications.js` | preferences, announcements, reminders |

### Validation Features

- Type coercion for query parameters
- Email normalization (lowercase, trim)
- Password length enforcement (8-128 chars)
- Date format validation (YYYY-MM-DD)
- Time format validation (HH:MM)
- Structured error responses with field-level details

### Error Response Format

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "fields": {
    "email": ["Invalid email address"],
    "password": ["Password must be at least 8 characters"]
  }
}
```

---

## Infrastructure Updates

### New Dependencies

- `cookie-parser` ^1.4.6 - Cookie parsing middleware
- `zod` ^3.22.4 - Schema validation library

### Terraform Changes

- New `aws_dynamodb_table.sessions` resource
- Updated IAM permissions for sessions table
- New `SESSIONS_TABLE` Lambda environment variable

---

## Migration Notes

### For Existing Users

- **No forced re-login required** - Legacy JWT refresh tokens auto-migrate
- Existing localStorage tokens continue to work
- Sessions created automatically on first refresh

### For Developers

- API responses now include `sessionId` alongside tokens
- Validation errors return 400 with structured `fields` object
- Cookie-based auth requires `credentials: 'include'` in fetch

---

## Version 4.2.4 (January 2026)

### Security Hardening 🔐

This release addresses critical security vulnerabilities identified during audit.

#### Critical Fixes

**Authentication Bypass Fixed (CVE-INTERNAL-001)**
- `/api/notifications/send-reminders` no longer accepts any `Authorization` header
- New `requireSchedulerKeyOrAdmin` middleware validates scheduler API key OR admin JWT
- Proper authentication chain prevents unauthenticated access

**Secrets Fail-Fast in Production**
- `JWT_SECRET` and `SCHEDULER_API_KEY` are now REQUIRED in production
- Application exits with clear error if secrets missing in `NODE_ENV=production`
- Development-only defaults are clearly marked as insecure

#### High-Priority Fixes

**Password Reset Token Hashing**
- Reset tokens are now hashed (SHA-256) before database storage
- Prevents token theft if database is compromised
- Token comparison uses constant-time hash comparison

**OAuth Token Delivery (Fragment vs Query)**
- Tokens now delivered via URL fragment (`#token=...`) instead of query params
- Prevents token leakage via HTTP Referer headers
- Frontend updated to parse fragment parameters

**Open Redirect Prevention**
- Redirect parameter validated before navigation
- Must start with `/`, cannot contain `://` or `\\`
- Prevents redirect-based phishing attacks

**User Enumeration Prevention**
- Login no longer reveals if OAuth-only accounts exist
- Generic "Invalid credentials" for all auth failures
- Password reset already used generic messaging

#### Hardening

**Security Headers**
- X-Frame-Options: DENY (clickjacking protection)
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin  
- Permissions-Policy: disables unused features
- HSTS in production

**CORS Tightening**
- Production requires explicit `ALLOWED_ORIGINS`
- Wildcard (`*`) only allowed in development
- Unknown origins rejected in production mode

### Build System Overhaul (Phase B)

**esbuild Deterministic Bundling**
- Replaced source-copy deployment with proper esbuild bundling
- Minified, tree-shaken bundles for both API and Worker Lambdas
- Source maps included for production debugging
- Consistent, reproducible builds across environments

**New Build Scripts**
- `npm run build` - Builds both API and Worker bundles
- `npm run build:api` - Builds only the API handler
- `npm run build:worker` - Builds only the SQS Worker handler  
- `npm run build:analyze` - Analyze bundle composition

### Deployment Guardrails

**Artifact Size Guards**
- Warning threshold at 5MB for Lambda zips (configurable via `LAMBDA_ZIP_WARN_SIZE`)
- Hard fail at 50MB (AWS Lambda limit, configurable via `LAMBDA_ZIP_FAIL_SIZE`)
- Per-bundle size warnings at 1MB (configurable via `BUNDLE_WARN_SIZE`)
- Actionable suggestions when thresholds exceeded

**Enhanced Plan/Replacement Guardrails**
- Lists specific resources affected by destructive changes
- Shows exact Terraform addresses for affected DynamoDB tables, SQS queues, IAM roles
- Suggests `terraform state rm` workflow for re-import scenarios
- Clearer CI vs interactive mode behavior

### State Assertions (Phase C)

**Strong State Validation**
- Verifies core resources (users table, bookings table, lambda role) exist in state
- Validates reliability infrastructure when enabled (idempotency, ratelimit, SQS)
- Detects orphans that exist in AWS but weren't imported
- Interactive confirmation before proceeding with missing resources

**Structured Orphan Reporting**
- Detailed breakdown by action: Imported, Skipped, Deleted, Failed
- Shows reason for each action (ownership tag status, user choice, etc.)
- Tree-style visual output for scan results
- Summary statistics at end of detection phase

### Environment Variables

New optional configuration:
- `LAMBDA_ZIP_WARN_SIZE` - Warning threshold for Lambda zip (default: 5MB)
- `LAMBDA_ZIP_FAIL_SIZE` - Fail threshold for Lambda zip (default: 50MB)
- `BUNDLE_WARN_SIZE` - Warning threshold per bundle file (default: 1MB)

---

## Version 4.2.0 (January 2026)

### Reliability & Stability Hardening

This release focuses on production reliability for Lambda/serverless deployment.

#### Infrastructure Resilience

**DynamoDB-Backed Idempotency**
- Prevents duplicate bookings from client retries and network issues
- Automatic deduplication using user + tool + time slot
- Support for explicit `X-Idempotency-Key` header
- TTL-based automatic cleanup

**SQS Integration for Async Operations**
- Non-critical notifications (Slack, email) queued to SQS
- Dead letter queue support for failed notifications
- Graceful fallback when SQS not configured

**DynamoDB Rate Limiting (Fallback)**
- Defense-in-depth rate limiting
- Works alongside API Gateway throttling
- Per-IP and per-user rate limits

#### Integration Resilience

**Timeouts**
- 5-second timeout on all external API calls
- 10-second timeout for critical operations (Google Calendar)

**Retry with Exponential Backoff**
- 2-3 retries with jitter to prevent thundering herd
- Intelligent retry decisions (skip 4xx, retry 5xx/network errors)

**Circuit Breakers**
- Per-integration circuit breakers (Google Calendar, GitHub, Slack, Email)
- Automatic fail-fast when services degrade
- Self-healing with configurable reset times

#### Health & Monitoring

**New Endpoints**
- `GET /api/health` - Basic liveness check
- `GET /api/ready` - Integration readiness with circuit status
- `GET /api/health/deep` - Full diagnostic info

**Structured Logging**
- Request ID tracing through all operations
- JSON-formatted error logs
- Circuit breaker state change events

### Breaking Changes

None - backwards compatible with v4.1.x

### Required Infrastructure

New DynamoDB tables (optional but recommended):
- `colab-scheduler-idempotency` - Request deduplication
- `colab-scheduler-ratelimit` - Rate limit counters

New SQS queue (optional but recommended):
- `colab-scheduler-integrations` - Async notification queue

See `docs/STABILITY_GUIDE.md` for setup instructions.

### Environment Variables

New variables (all optional):
- `IDEMPOTENCY_TABLE` - DynamoDB table for idempotency
- `RATE_LIMIT_TABLE` - DynamoDB table for rate limiting  
- `INTEGRATION_QUEUE_URL` - SQS queue URL for async notifications

---

## Version 4.1.0 (January 2026)

### New Features

#### Enhanced My Bookings Panel
A comprehensive redesign of the personal bookings view:

**Multiple View Modes**
- **List View**: Traditional sortable list with bulk selection
- **Month Calendar**: Visual monthly calendar showing all bookings
- **Week View**: Detailed weekly breakdown with time slots

**Advanced Filtering & Search**
- Filter by status (approved, pending, rejected, cancelled)
- Filter by tool type
- Full-text search across tool names and purposes
- Configurable sort order (date, tool, status)

**Management Tools**
- Bulk selection and cancellation
- CSV export of booking data
- Statistics dashboard (total, upcoming, pending, past)
- Quick access to Multi-Book calendar

**Improved Success Messages**
- Detailed confirmation showing tool name, date, and time
- Clear status indication (auto-approved vs. awaiting approval)

#### Interactive Deployment Wizard
The deploy script now includes an interactive configuration wizard:

**Environment Selection**
- Choose between dev, staging, and production environments
- Environment-appropriate security and logging settings

**GitHub Integration Setup**
- Configure organization and repository for issue sync
- Set up Personal Access Token
- Enable/disable GitHub Discussions sync
- Clear validation and feedback

**Integration Configuration**
- Google Calendar sync setup
- Slack notifications configuration
- OAuth provider selection (Google, GitHub)
- Domain and DNS configuration

**Non-Interactive Mode**
- Set `INTERACTIVE=false` for CI/CD pipelines
- All settings configurable via environment variables

### Bug Fixes
- Fixed circular JSON structure error when clicking submit buttons
- Fixed tools not showing in MultiSelectCalendar (status filter issue)
- Wrapped all onClick handlers to prevent event object passing

### Technical Changes

**New Component**
- `MyBookingsPanel.jsx` - Full-featured booking management interface

**Updated Files**
- `ColabScheduler.jsx` - Integrated new MyBookingsPanel
- `MultiSelectCalendar.jsx` - Enhanced success messages, fixed filters
- `deploy.sh` - Interactive configuration wizard
- `main.tf` - Added `enable_github_discussions` variable

**New Terraform Variables**
- `enable_github_discussions` - Enable GitHub Discussions sync

---

## Version 4.1.1 (January 2026)

### Bug Fixes
- Fixed "Converting circular structure to JSON" error on calendar submit
- Fixed tools not appearing in MultiSelectCalendar
- Changed onClick handlers from `onClick={handler}` to `onClick={() => handler()}`
- Changed tools filter from `status === 'available'` to `status !== 'maintenance'`

---

## Version 4.0.0 (January 2026)

### Major New Features

#### Enhanced Admin Panel
A completely redesigned admin experience with improved workflows and capabilities:

**Booking Approvals**
- Batch Approvals: Select multiple bookings and approve/reject in bulk
- Advanced Filtering: Filter by status, tool, date range, and search by user/purpose
- Smart Pagination: Configurable page sizes (10, 15, 25, 50 items per page)
- Sortable Columns: Click headers to sort by user, tool, date, etc.
- Quick Stats Dashboard: At-a-glance view of pending, today's, weekly, and rejected bookings
- Rejection Reasons: Add optional rejection reasons that get sent to users
- CSV Export: Export filtered booking data for reporting

**Resource Visibility Controls**
- Show/Hide Tools: Toggle visibility of tools from user-facing schedules
- Maintenance Indicators: Clear visual status for tools under maintenance
- Room and Category Info: See all tool details at a glance

**Class Request Management**
- Certification Requests: Review and approve training class requests
- Bulk Processing: Handle multiple requests efficiently
- Request History: Track approved and denied requests

**Admin Settings**
- Email Notifications: Control admin notification preferences
- Auto-Approval Rules: Configure automatic approval for certified users
- Booking Limits: Set default maximum booking durations and advance limits

### Backend Improvements

**New API Endpoints**
- GET /api/bookings?admin=true&status=all - Admin access to all bookings
- PUT /api/resources/tools/:id/visibility - Toggle tool visibility
- GET /api/certifications/requests - List certification requests

**Database Enhancements**
- bookingService.getAll() - Retrieve all bookings with optional status filter
- Improved query performance with proper indexing
- Activity logging for visibility changes

### Bug Fixes
- Fixed pagination reset when filter changes
- Improved error handling in bulk operations
- Better handling of concurrent booking limits

### Documentation Updates
- Updated ADMIN_GUIDE.md with new features
- Added API documentation for new endpoints
- Improved deployment verification steps

---

## Migration Notes

### Upgrading from v3.9.0 to v4.0.0

1. Database: No schema changes required
2. Environment Variables: No new required variables
3. Frontend: Rebuild required (npm run build)
4. Backend: Restart required for new API endpoints

---

## Previous Versions

### Version 3.9.0
- GitHub Integration for issue creation
- Email notification improvements
- Public tools catalog

### Version 3.8.0  
- Google Calendar sync
- Slack notifications
- Activity logging

### Version 3.7.0
- Certification management
- Resource management panel
- Issue dashboard
