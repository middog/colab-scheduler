# SDCoLab Scheduler Changelog

## Version 4.2.0-rc69.15 (January 2026)

### 🔥 Fire Triangle Role System & Navigation Refactor

Major architectural update implementing community-aligned role naming and consolidated navigation.

---

### 🐛 Bug Fixes (Community Feedback)

#### Critical Issues Identified & Fixed

| Bug | Reporter | Root Cause | Fix |
|-----|----------|------------|-----|
| Bookings not persisting after confirmation | A-deli | Backend inline role checks using old names | Update to use `isTender()`/`isOperator()` |
| User approval not updating status | A-deli | Same as above - role check mismatch | Update approval endpoint role checks |
| Multi-Book tab causes blank page | A-deli | Component crash on missing data | Add null guards to MultiSelectCalendar |
| Pending bookings not loading for tenders | - | `loadPendingBookings()` checks old roles | Fixed internal role check |
| Tool certification check fails for tenders | - | `isCertified` check uses old role names | Updated to use `isTender()` |

#### Detailed Root Cause Analysis

**Bug 1 & 2: Role Check Mismatch**

The Fire Triangle role system introduced helper functions (`isTender()`, `isOperator()`) but several locations still used inline checks:

```javascript
// ❌ OLD (broken for 'tender' role users)
const isAdmin = ['admin', 'superadmin'].includes(req.user.role);

// ✅ NEW (works for all role variants)
const isAdmin = isTender(req.user);
```

**Files with old role checks fixed:**

| File | Line(s) | Check Type |
|------|---------|------------|
| `backend/src/routes/bookings.js` | 95, 291, 418, 510, 680 | `['admin', 'superadmin'].includes()` |
| `frontend/src/ColabScheduler.jsx` | 1591, 2486-2487 | `user.role === 'admin'` |

**Bug 3: Multi-Book Blank Page**

The `MultiSelectCalendar` component crashes when:
- `tools` prop is undefined/null
- `user` prop is missing expected fields
- API returns unexpected response shape

**Fix:** Added defensive checks:
```javascript
// Before
const filteredTools = tools.filter(t => t.status !== 'maintenance');

// After  
const filteredTools = (tools || []).filter(t => t?.status !== 'maintenance');
```

---

### ✨ Feature Requests (Community Feedback)

| Request | Source | Priority | Status |
|---------|--------|----------|--------|
| Show room capacity on Schedule > Tools view | A-deli | P2 | 📋 Backlog |
| Enable Google Calendar integration for testing | A-deli | P1 | 🔧 Config change |
| Enable Slack integration for testing | A-deli | P1 | 🔧 Config change |
| Tool-Room dependencies (booking tool auto-books room) | sasha r | P2 | 📋 Backlog |
| Individual tool instances (specific 3D printer) | sasha r | P2 | 📋 Backlog |
| Bookable rooms under Schedule (not just tools) | A-deli | P3 | 📋 Backlog |
| Full space/Mezzanine booking | A-deli | P3 | 📋 Backlog |

---

### 📝 Positive Feedback Noted

- ✅ Comprehensive yet simple interface
- ✅ Certification management with external training links (IDEA Lab guides, Markus 3D print PPT, Cameron CNC docs)
- ✅ CSV import/export for grant/project reporting

---

### 🔧 Role System Overhaul

**New Roles (Fire Triangle Aligned)**

| Old Role | New Role | Access Level |
|----------|----------|--------------|
| `member` | `participant` | Oxygen only |
| `admin` | `tender` | + Fuel & Heat (tool-scoped) |
| `superadmin` | `operator` | + System (full access) |

**Tool-Scoped Permissions for Tenders**
- New `toolGrants` field on user records
- Tenders manage only tools in their grants array
- Example: `toolGrants: ['laser', 'cnc']` limits management scope
- Legacy admins without `toolGrants` default to full access (`['*']`)
- Operators bypass all tool scoping

**Role Utilities Added**
```javascript
import { 
  normalizeRole,      // Maps legacy → Fire Triangle
  isOperator,         // Full system access?
  isTender,           // Tool management access?
  isParticipant,      // Basic access only?
  canManageTool,      // Can manage specific tool?
  getManagedTools,    // Which tools can user manage?
  getRoleDisplayName, // 'tender' → 'Tender'
  getRoleBadgeClasses // Role → CSS classes
} from './lib/permissions.js';
```

---

### 🧭 Navigation Consolidation

**Fire Triangle Navigation Groups**
```
🌬️ Oxygen (Everyone)     🪵 Fuel (Tenders+)      🔥 Heat (Tenders+)      ⚙️ System (Operators)
─────────────────────────────────────────────────────────────────────────────────────────────
Schedule                  Resources               People                  Integrations
My Bookings               Tool Config*            Issues                  Templates
My Certifications                                 Activity
```
*Tool Config: Operators only

**Grouped URL Hashes**
- Old: `#schedule`, `#users`, `#admin`
- New: `#oxygen/schedule`, `#heat/people`, `#system/integrations`
- Legacy routes auto-redirect to new structure

**Tender Filtered View**
- Default: See only tools in your `toolGrants`
- Toggle: "Show All" reveals full view (read-only for non-granted tools)
- Visual indicator for scope mode

---

### 🔬 Troubleshooting Guide

#### Issue: Bookings Show Confirmation but Don't Persist

**Symptoms:**
- User submits booking
- Success message appears
- Booking not visible in calendar or My Bookings

**Diagnostic Steps:**

1. **Check browser console for errors:**
   ```
   F12 → Console tab → Look for red errors
   ```

2. **Check network tab for API response:**
   ```
   F12 → Network tab → Filter by "bookings"
   - Look for POST /api/bookings
   - Check response status (should be 200/201)
   - Check response body for error messages
   ```

3. **Check backend logs:**
   ```bash
   # If running locally
   npm run dev 2>&1 | grep -i error
   
   # If deployed to AWS
   aws logs tail /aws/lambda/colab-scheduler-api --follow
   ```

**Common Causes:**

| Cause | Solution |
|-------|----------|
| Role mismatch (fixed in rc15) | Update to rc15 |
| Database table not created | Run `tofu apply` or check DynamoDB console |
| Missing environment variables | Check `.env` has all required vars |
| CORS blocking request | Check API Gateway CORS config |
| Token expired | Log out and back in |

#### Issue: User Approval Not Working

**Symptoms:**
- Click "Approve" on pending user
- Success message appears
- User status still shows "pending"

**Diagnostic Steps:**

1. **Check API response:**
   ```
   Network tab → POST /api/users/{email}/approve
   Should return: { success: true, message: 'User approved' }
   ```

2. **Check if using old role system:**
   ```javascript
   // In browser console after login:
   const user = JSON.parse(localStorage.getItem('colab_user'));
   console.log('Role:', user.role);
   // If 'tender' or 'operator', you need rc15
   // If 'admin' or 'superadmin', rc14 should work
   ```

3. **Verify database update:**
   ```bash
   # AWS CLI
   aws dynamodb get-item \
     --table-name colab-scheduler-users \
     --key '{"email": {"S": "user@example.com"}}'
   ```

#### Issue: Multi-Book Page Goes Blank

**Symptoms:**
- Click "Multi-Book" button
- Entire page goes white/blank
- No error message visible

**Diagnostic Steps:**

1. **Check console for crash:**
   ```
   F12 → Console → Look for:
   - "Cannot read property 'X' of undefined"
   - "tools.filter is not a function"
   - React error boundary messages
   ```

2. **Check if tools loaded:**
   ```javascript
   // In console:
   console.log('Tools:', window.__TOOLS__ || 'not exposed');
   ```

**Common Causes:**

| Cause | Solution |
|-------|----------|
| `tools` prop is undefined | Check TOOLS constant is exported |
| API returns null instead of [] | Add `|| []` fallback |
| Component missing null check | Update MultiSelectCalendar |

#### Issue: Integration Not Working (Calendar/Slack)

**Symptoms:**
- Bookings created but not syncing to Google Calendar
- Slack notifications not sending

**Diagnostic Steps:**

1. **Check integration status:**
   ```
   Navigate to: #system/integrations
   Look for red/yellow status indicators
   ```

2. **Test integration:**
   ```
   Click "Test" button next to integration
   Check response message
   ```

3. **Verify credentials:**
   ```bash
   # Check environment variables are set
   echo $GOOGLE_CALENDAR_ID
   echo $SLACK_WEBHOOK_URL
   ```

**Enable Integrations for Testing:**

```bash
# In .env or Lambda environment:

# Google Calendar
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Slack
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
```

---

### 📋 Files Changed

**Backend - Bug Fixes:**
- `src/routes/bookings.js` - Updated 5 inline role checks to use `isTender()`
- `src/routes/users.js` - Role check consistency (middleware already correct)

**Backend - New/Modified:**
- `src/schemas/users.js` - New role enum, `toolGrants` schema
- `src/middleware/auth.js` - Fire Triangle role utilities, `requireOperator()`, `requireToolManagement()`

**Frontend - Bug Fixes:**
- `src/ColabScheduler.jsx` - Fixed `loadPendingBookings()` role check, `isCertified` check
- `src/components/MultiSelectCalendar.jsx` - Added null guards

**Frontend - New:**
- `src/lib/permissions.js` - Role utilities, nav groups, route parsing
- `src/components/FireTriangleNav.jsx` - Grouped navigation component

**Frontend - Modified:**
- `src/ColabScheduler.jsx` - Fire Triangle navigation, role-based views, grouped URL routing

**E2E Tests:**
- `e2e/fixtures.js` - Updated test users, navigation helpers

**Documentation:**
- `docs/templates/*.md` - 4 new FAANG methodology templates
- `docs/examples/*.md` - 4 filled examples

---

### 🔄 Migration Notes

**Backward Compatibility**
- Legacy role names normalize automatically
- Legacy routes redirect to new structure
- No database migration needed

**For Existing Deployments:**
1. Pull rc15 code
2. Rebuild frontend: `cd frontend && npm run build`
3. Redeploy backend: `./scripts/deploy.sh`
4. Clear browser cache / hard refresh

---

### 🎯 Next Steps (rc16)

1. ~~Debug booking persistence issue~~ ✅ Fixed
2. ~~Debug user approval state update~~ ✅ Fixed  
3. ~~Debug Multi-Book blank page crash~~ ✅ Fixed
4. **Enable** Google Calendar + Slack integrations in dev environment
5. **Implement** room capacity display on Schedule view
6. **Implement** tool-room booking dependencies

---

### 🙏 Contributors

- **A-deli** - Comprehensive testing feedback, bug reports
- **sasha r** - Feature requests (tool instances, room dependencies)
- **Diane** - Testing participation
- **Jolly Rancher** - Bug triage and validation

---

## Version 4.2.0-rc14 (January 2026)

### Version Unification Release

Consolidated all version strings to `4.2.0-rc14` across the codebase. No functional changes from rc69.13.

---

*For full changelog history, see previous entries below.*
