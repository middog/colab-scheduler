# SDCoLab Scheduler - Requirements Validation Report

## Summary

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Admin auto-approval | ✅ **MET** | Implemented in bookings.js |
| 2 | Range selection highlight | ❌ **NOT MET** | Single-click selection only |
| 3 | Calendar hover preview | ❌ **NOT MET** | No hover state on dates |
| 4 | Concurrent booking support | ✅ **MET** | `maxConcurrent` per tool |
| 5 | Per-tool maintenance | ✅ **MET** | Individual tool status |
| 6 | Show max concurrent slots | ✅ **MET** | In UI and API |
| 7 | Show slots booked count | ⚠️ **PARTIAL** | API has it, UI incomplete |
| 8 | Multi-tool same-time warning | ✅ **MET** | `confirmOverlap` flow |
| 9 | User edit with re-approval | ✅ **MET** | Non-admin edits → pending |
| 10 | First/Last name in invite | ✅ **MET** | Both fields present |
| 11 | Certs in invite | ✅ **MET** | Tool certs selectable |
| **12** | **Pending not showing as full** | **🐛 BUG** | **API wrapper mismatch** |
| **13** | **Admin tool editing** | **✅ MET** | **Superadmin can edit all** |

---

## NEW: Additional Items Analysis

### 12. Pending requests showing as full 🐛 BUG CONFIRMED

**Problem:** User reports that pending bookings show slots as "full" in the timescale.

**Root Cause Found:** API response format mismatch!

The backend returns standardized responses:
```json
{ "success": true, "data": { "bookings": [...] }, "timestamp": "..." }
```

But the frontend expects legacy format:
```json
{ "bookings": [...] }
```

**Evidence:**
- `frontend/src/ColabScheduler.jsx` line 1518: `setBookings(dateData.bookings || []);`
- Should be: `setBookings(dateData.data?.bookings || []);`

**Impact:** 
- `bookings` is `undefined` because `dateData.bookings` doesn't exist
- `bookings.filter(...)` in `getSlotStatus()` fails or returns empty
- All slots may show as "available" OR the code may be using stale data

**Fix Required:**
1. Update `api.js` wrapper to auto-unwrap `data.data` for backward compatibility
2. OR update all frontend code to access `.data.` properly

**Recommendation:** Fix the api wrapper to unwrap - less invasive.

---

### 13. Allow admins to edit tool details ✅ MET

**Location:** `backend/src/routes/resources.js` lines 352-470

**Implementation:**
- `PUT /api/resources/tools/:id` endpoint exists
- **Regular admins** can edit: `status`, `maintenanceNotes`, `nextMaintenanceAt`, `lastMaintenanceAt`
- **Superadmins** can additionally edit: `maxConcurrent`, `description`, `requiresCert`

**For config-based tools:**
- Edits stored as "overrides" in database
- Original config preserved, override merged at runtime

**For dynamic (database) tools:**
- Full edit of all fields allowed

```javascript
// Regular admin allowed fields
const allowedConfigUpdates = ['status', 'maintenanceNotes', 'nextMaintenanceAt', 'lastMaintenanceAt'];

// Superadmin additional fields
if (isSuperAdmin) {
  allowedConfigUpdates.push('maxConcurrent', 'description', 'requiresCert');
}
```

**Verdict:** Already implemented with proper role-based restrictions.

---

## Detailed Analysis

### 1. Admin bookings/changes do not need approval ✅ MET

**Location:** `backend/src/routes/bookings.js` lines 416-438

```javascript
// Determine auto-approval
const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
const autoApprove = isAdmin;

// Create booking with version field
const booking = await bookingService.create({
  // ...fields...
  ...(autoApprove && {
    status: 'approved',
    approvedBy: req.user.email,
    approvedAt: new Date().toISOString(),
    autoApproved: true
  })
}, req.user);
```

**Verdict:** Admin and superadmin bookings are auto-approved on creation.

---

### 2. Non-adjacent time selection highlights range ❌ NOT MET

**Current Behavior:** Single-click selects individual time slots. There's no range selection or visual highlighting of slots between first and second click.

**What's Needed:**
- Track first click as "range start"
- On second click, if non-adjacent, highlight all slots between
- Show confirmation: "Book 3-hour block from 10:00-13:00?"
- Clear visual distinction between single slot vs range

**Route to Implementation:**
1. Add `rangeStart` state to booking flow
2. On time slot click:
   - If no `rangeStart`, set it
   - If `rangeStart` exists and clicked different slot, calculate range
3. Highlight all slots in range with distinct color
4. Show "Book range" vs "Book single slot" button
5. Allow cancel/clear of selection

**Estimated Effort:** 2-3 hours (frontend only)

---

### 3. Calendar date hover shows booking preview ❌ NOT MET

**Current Behavior:** Calendar view exists (`GET /api/bookings/calendar/:year/:month`) but dates don't show hover state with booking summary.

**What's Needed:**
- On date hover, show tooltip with:
  - Number of bookings (approved/pending)
  - Tools booked that day
  - Time slots filled
- Quick visual indicator (dot/badge) on dates with bookings

**Route to Implementation:**
1. Fetch calendar summary for visible month
2. Add `onMouseEnter`/`onMouseLeave` to date cells
3. Create `DateTooltip` component showing:
   ```
   Jan 15, 2026
   ┌──────────────────────┐
   │ 3 bookings           │
   │ • Laser (2)          │
   │ • 3D Printer (1)     │
   │ 10:00-12:00 busy     │
   │ 14:00-16:00 busy     │
   └──────────────────────┘
   ```
4. Add visual dots/badges to date cells

**Estimated Effort:** 3-4 hours (frontend + minor API enhancement)

---

### 4. Multiple concurrent bookings per tool ✅ MET

**Location:** `backend/src/lib/config.js` (tool definitions) + `backend/src/routes/bookings.js`

**Implementation:**
- Tools have `maxConcurrent` property (default: 1)
- Booking creation checks `conflictingBookings.length >= maxConcurrent`
- Only APPROVED bookings count toward limit

```javascript
const maxConcurrent = toolConfig.maxConcurrent || 1;
if (conflictingBookings.length >= maxConcurrent) {
  return sendError(res, ErrorCodes.SLOT_TAKEN, ...);
}
```

**Example Config:**
```javascript
{ id: '3dprinter', name: '3D Printer', maxConcurrent: 4 },
{ id: 'laser', name: 'Laser Cutter', maxConcurrent: 1 },
{ id: 'sewing', name: 'Sewing Machines', maxConcurrent: 6 }
```

---

### 5. Per-tool maintenance status ✅ MET

**Location:** `backend/src/routes/resources.js`

**Implementation:**
- Each tool has individual `status` field: `available`, `maintenance`, `disabled`
- `PUT /api/resources/tools/:id/status` updates individual tool
- `maintenanceNotes` and `nextMaintenanceAt` fields supported

```javascript
// Check tool status on booking
if (toolConfig.status === 'maintenance') {
  return sendError(res, ErrorCodes.MAINTENANCE_WINDOW, 'Tool is currently under maintenance', {
    tool: toolConfig.name,
    maintenanceNotes: toolConfig.maintenanceNotes,
    expectedBack: toolConfig.nextMaintenanceAt
  });
}
```

---

### 6. Show max concurrent slots ✅ MET

**Location:** `backend/src/routes/bookings.js` lines 202-232 (availability endpoint)

**API Response:**
```json
{
  "tool": "3dprinter",
  "maxConcurrent": 4,
  "slots": {
    "10:00": {
      "approved": 2,
      "pending": 1,
      "available": 2,
      "maxConcurrent": 4,
      "isFull": false
    }
  }
}
```

**Frontend:** `getSlotInfo()` function returns this data for UI rendering.

---

### 7. Show slots booked count per time ⚠️ PARTIAL

**Backend:** ✅ Complete - API returns `approved`, `pending`, `available` counts per slot

**Frontend:** ⚠️ Incomplete - Shows full/available but not "2/4 booked"

**What's Needed:**
- Update time slot rendering to show: `2/4` instead of just color
- Show breakdown on hover: "2 approved, 1 pending, 1 available"

**Route to Implementation:**
1. Modify time slot cell to show fraction: `{approved}/{maxConcurrent}`
2. Add tooltip showing breakdown
3. Color intensity based on fill percentage

**Estimated Effort:** 1-2 hours (frontend only)

---

### 8. Multi-tool same-time warning ✅ MET

**Location:** `backend/src/routes/bookings.js` lines 392-414

**Implementation:**
```javascript
// Check user's overlapping bookings for OTHER tools
const userOverlappingBookings = existingBookings.filter(b => 
  b.userEmail === req.user.email &&
  (b.resourceId !== tool && b.tool !== tool) && // Different tool
  b.status !== 'rejected' && b.status !== ArchiveStatus.ARCHIVED &&
  startTime < b.endTime && endTime > b.startTime // Overlapping time
);

if (userOverlappingBookings.length > 0 && !confirmOverlap) {
  return sendError(res, ErrorCodes.CONFLICT, 'OVERLAP_WARNING', {
    message: 'You have overlapping bookings for other tools at this time',
    overlappingBookings: userOverlappingBookings.map(b => ({
      id: b.id,
      tool: b.resourceName || b.toolName,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status
    })),
    requiresConfirmation: true,
    confirmParam: 'confirmOverlap'
  });
}
```

**Frontend:** `OverlapWarningModal` shows warning and requires confirmation.

---

### 9. User edit with re-approval ✅ MET

**Location:** `backend/src/routes/bookings.js` lines 620-637

**Implementation:**
```javascript
// Non-admin edit of approved booking resets to pending
let statusChanged = false;
if (!isAdmin && booking.status === 'approved' && 
    (updates.date || updates.startTime || updates.endTime || updates.resourceId)) {
  updates.status = 'pending';
  updates.approvedBy = null;
  updates.approvedAt = null;
  updates.editedFromApproved = true;
  updates.previousApprovedBy = booking.approvedBy;
  statusChanged = true;
  
  // Delete calendar event since it needs re-approval
  if (booking.calendarEventId && isFeatureEnabled('googleCalendar')) {
    await integrations.onBookingCancelled(booking, req.user.email);
    updates.calendarEventId = null;
  }
}
```

**Note:** Only substantive changes (date, time, tool) trigger re-approval. Purpose-only edits keep status.

---

### 10. First/Last name in invite modal ✅ MET

**Location:** `frontend/src/ColabScheduler.jsx` lines 361-376

**Implementation:**
```jsx
<div className="grid grid-cols-2 gap-3">
  <input
    type="text"
    placeholder="First Name"
    value={firstName}
    onChange={(e) => setFirstName(e.target.value)}
    className={`p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
  />
  <input
    type="text"
    placeholder="Last Name"
    value={lastName}
    onChange={(e) => setLastName(e.target.value)}
    className={`p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
  />
</div>
```

**Backend:** `POST /api/users/invites` accepts `firstName` and `lastName` fields.

---

### 11. Certifications in invite ✅ MET

**Location:** `frontend/src/ColabScheduler.jsx` lines 389-413

**Implementation:**
- Tool certification checkboxes in invite modal
- Selected tools sent as `certifications` array
- Backend stores with invite, applied on registration

```jsx
<div>
  <label className="block text-sm font-medium mb-2">Tool Certifications</label>
  <div className="grid grid-cols-2 gap-2">
    {availableTools.map(tool => (
      <label key={tool.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
        tools.includes(tool.id) 
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30' 
          : theme === 'dark' ? 'border-gray-600' : 'border-gray-200'
      }`}>
        <input type="checkbox" ... />
        <span className="text-sm">{tool.name}</span>
      </label>
    ))}
  </div>
</div>
```

---

## Invite vs Create User Clarification

**Question:** What's the distinction between invite and create user?

**Answer:** They serve different workflows:

| Aspect | Invite | Create Immediately |
|--------|--------|-------------------|
| **Password** | User sets their own via link | Admin gets temp password to share |
| **Activation** | Pending until user registers | Immediately active |
| **Email** | Invite link sent | Welcome email with temp password |
| **Use Case** | Normal onboarding | Emergency/in-person situations |

Both can pre-assign:
- Role (member, certified, steward, admin)
- Tool certifications
- First/Last name

---

## Implementation Roadmap for Missing Features

### Priority 1: Range Selection Highlight (2-3 hours)
1. Add `selectionStart` and `selectionEnd` state
2. Track first click as range start
3. On second non-adjacent click, set range end
4. Highlight all intermediate slots
5. Show duration and confirm dialog

### Priority 2: Slots Booked Count Display (1-2 hours)
1. Update time slot cell rendering
2. Show `approved/maxConcurrent` fraction
3. Add hover tooltip with breakdown
4. Gradient/intensity color based on fill %

### Priority 3: Calendar Date Hover Preview (3-4 hours)
1. Fetch calendar summary for visible month
2. Create `DateBookingTooltip` component
3. Add hover handlers to date cells
4. Show booking count and tool breakdown
5. Add visual badges to dates with bookings

**Total Estimated Effort:** 6-9 hours for all missing features
