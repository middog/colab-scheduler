# 👩‍💼 SDCoLab Scheduler Admin Guide

**Version:** 3.2.0

This guide covers all administrative features in SDCoLab Scheduler.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [User Management](#user-management)
3. [Certification Management](#certification-management)
4. [Resource Management](#resource-management)
5. [Issue Dashboard](#issue-dashboard)
6. [Activity Logs](#activity-logs)
7. [Notifications & Announcements](#notifications--announcements)

---

## Getting Started

### Admin Navigation

When logged in as an admin, you'll see additional navigation tabs:

| Tab | Description |
|-----|-------------|
| **Admin** | Pending booking approvals |
| **Users** | User management and invites |
| **Certs** | Certification type and grant management |
| **Resources** | Tool and room management |
| **Issues** | Reported equipment issues |
| **Activity** | System-wide activity logs |

### Quick Actions

- **Bell icon** (🔔) - Notification preferences
- **Help icon** (❓) - Documentation
- **Theme toggle** - Light/dark mode

---

## User Management

### Viewing Users

Navigate to **Users** tab to see all users with:
- Search by name or email
- Filter by status (active, pending, suspended, deactivated)
- Filter by role (guest, member, certified, steward, admin)
- Pagination for large user bases

### Creating Users

**Method 1: Create User (Direct)**
1. Click **Create User** (green button)
2. Enter email, name, role, certifications
3. A temporary password is auto-generated
4. Welcome email with credentials is sent

**Method 2: Invite User**
1. Click **Invite** (orange button)
2. Enter email, select role and permissions
3. Add personalized message (optional)
4. Invitation email with signup link is sent

### User Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Awaiting admin approval |
| `active` | Full access |
| `suspended` | Temporarily restricted |
| `deactivated` | Account disabled (preserved for audit) |

### Editing Users

Click the edit icon on any user to:
- Change role
- Update certifications
- Modify status
- Add admin notes

### Bulk Operations

- **Import CSV**: Upload users in bulk
- **Export CSV**: Download user list for reporting

---

## Certification Management

Navigate to **Certs** tab.

### Creating Certification Types

1. Click **New Cert Type**
2. Configure:

| Field | Description |
|-------|-------------|
| **Name** | Display name (e.g., "Laser Cutter Safety") |
| **Description** | What the cert covers |
| **Category** | fabrication, electronics, textiles, woodworking, safety |
| **Level** | basic → advanced → instructor |
| **Expires After** | Months until renewal required (leave blank for no expiry) |
| **Prerequisites** | Other certs required first |
| **Grants Access To** | Tools automatically unlocked by this cert |
| **Who Can Grant** | admin, steward, instructor |
| **Training Required** | Whether training must be completed first |

### Granting Certifications

1. Click **Grant Cert**
2. Enter user email
3. Select certification type
4. Add notes (training date, instructor, etc.)
5. Optionally bypass prerequisites (admin only)

### Viewing Expiring Certs

Switch to **Expiring Soon** tab to see certifications expiring within:
- 7 days
- 14 days
- 30 days
- 60 days
- 90 days

Click **Renew** to grant a fresh certification.

### Best Practices

- Set up cert types BEFORE granting to users
- Use prerequisite chains for safety-critical equipment
- Configure expiry for certs requiring annual refreshers
- Enable "instructor" level for teaching-certified members

---

## Resource Management

Navigate to **Resources** tab.

### Managing Tools

**View all tools** including:
- Config-based (from `config.js`)
- Dynamic (created via admin UI)

**Create new tools:**
1. Click **New Tool**
2. Configure name, category, room, max concurrent users
3. Enable certification requirement if needed
4. Enable consumables tracking if applicable

**Edit tools** (dynamic only):
- Change settings
- Update descriptions

### Maintenance Mode

For any tool, click the wrench icon to:

**Start Maintenance:**
- Blocks tool from booking
- Shows "Under Maintenance" status
- Add notes about what's being fixed

**Complete Maintenance:**
- Returns tool to available
- Optionally schedule next maintenance date
- Records completion for audit

### Consumables Tracking

For tools with consumables (3D printers, laser cutters):
1. Click package icon
2. Adjust level slider (0-100%)
3. Add notes about restocking
4. Mark as "restocked" to log the date

### Managing Rooms

Create rooms with:
- Name and capacity
- Bookable or always-open designation
- Approval requirement toggle

---

## Issue Dashboard

Navigate to **Issues** tab.

### Viewing Issues

Filter by:
- **Status**: open, resolved, closed, all
- **Severity**: critical, high, medium, low
- **Search**: by title or resource name

Issues are sorted by severity (critical first).

### Reporting Issues

Anyone can report issues:
1. Click **Report Issue**
2. Select affected resource
3. Enter title and description
4. Set severity level

If GitHub integration is enabled, issues auto-create GitHub tickets!

### Resolving Issues

1. Click **Resolve** on an issue
2. Enter resolution notes (what was fixed)
3. Issue moves to resolved status

### Issue Lifecycle

```
open → resolved → closed
  ↓                  ↓
  └── closed ← ─ ─ ─ ┘
         ↓
       reopen
```

---

## Activity Logs

Navigate to **Activity** tab.

### Viewing Logs

Filter by:
- **Category**: auth, booking, admin, user, system
- **Limit**: 50, 100, 200, 500 entries

### Understanding Log Entries

**Color coding:**
- 🔴 **Red background**: Security events (failed logins, deactivations)
- 🟢 **Green background**: Success events (approvals, user creation)
- 🟠 **Orange background**: Important events (rejections, invites)

**Log entry anatomy:**
```
[Icon] [Action] by [Actor]
       Target: [What was affected]
       Details: [Additional info]
       [Timestamp]
```

### Transparency

When you view activity logs, that view is itself logged! This ensures complete accountability - no action goes untracked.

---

## Notifications & Announcements

### User Notification Preferences

Click the bell icon (🔔) to configure:

**Email Settings:**
- Booking reminders (timing: 1hr to 3 days before)
- Certification expiry warnings (timing: 1 week to 3 months)
- Weekly digest
- Announcements

**Push Notifications (Beta):**
- Booking reminders
- Announcements

### Sending Announcements

Admins can broadcast announcements:
1. Via API: `POST /notifications/announce`
2. Target specific roles or all users
3. Choose channels (in-app, email)

Example API call:
```bash
curl -X POST /api/notifications/announce \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Workshop This Saturday",
    "message": "Join us for our monthly open house!",
    "targetRoles": ["member", "certified"],
    "channels": ["inApp", "email"]
  }'
```

---

## Admin Best Practices

### Onboarding Flow

1. Create certification types for your tools
2. Invite new members (they register via link)
3. Approve pending registrations
4. Grant certifications after training
5. Users can now book certified tools

### Safety Protocol

1. Require certifications for dangerous equipment
2. Set up prerequisite chains (Basic → Advanced → Instructor)
3. Configure cert expiry for annual refreshers
4. Track maintenance schedules
5. Monitor issue dashboard regularly

### Governance

1. Use activity logs for accountability
2. Export user data for board reports
3. Track tool usage patterns
4. Monitor certification coverage

---

## Troubleshooting

### User Can't Book

1. Check user status (must be `active`)
2. Verify tool certifications
3. Check tool status (not in maintenance)

### Emails Not Sending

1. Verify `ENABLE_EMAIL=true`
2. Check SES sender verification
3. Verify Lambda has `ses:SendEmail` permission

### GitHub Issues Not Creating

1. Verify `ENABLE_GITHUB=true`
2. Check `GITHUB_TOKEN` is valid
3. Verify repository permissions

---

**🔥 Fire Triangle Reminder:**

- **FUEL** (Resources): Manage tools, rooms, consumables
- **OXYGEN** (Process): Manage users, certifications, approvals
- **HEAT** (Community): Engage via notifications, announcements

---

Need help? Contact your system administrator or check the [API Reference](API.md).
