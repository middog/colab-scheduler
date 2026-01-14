# 🔌 SDCoLab Scheduler API Reference

**Version:** 4.2.0-rc69.11  
**Base URL:** `https://YOUR_API_GATEWAY_URL/api`

All endpoints except `/health`, `/public/*`, and `/auth/providers` require a Bearer token.

---

## Standardized Response Format (v4.2.0+)

All API responses follow a standardized format:

### Success Response
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "message": "Optional success message",
  "timestamp": "2026-01-13T12:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { /* Optional additional context */ },
    "requestId": "uuid-for-tracking"
  },
  "timestamp": "2026-01-13T12:00:00.000Z"
}
```

### Common Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `BAD_REQUEST` | 400 | Invalid request parameters |
| `VALIDATION_ERROR` | 400 | Form validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `SLOT_TAKEN` | 409 | Booking slot unavailable |
| `VERSION_MISMATCH` | 409 | Optimistic concurrency failure |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Table of Contents

1. [Health & Config](#health--config)
2. [Public Endpoints](#public-endpoints)
3. [Authentication](#authentication)
4. [Bookings](#bookings)
5. [Users](#users)
6. [Certifications](#certifications)
7. [Resources](#resources)
8. [Notifications](#notifications)
9. [Waitlist](#waitlist)
10. [Recurring Bookings](#recurring-bookings)
11. [Analytics](#analytics)

---

## Health & Config

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "SDCoLab Scheduler API",
  "version": "4.2.0-rc69.11",
  "timestamp": "2026-01-13T12:00:00.000Z",
  "features": {
    "authEmail": true,
    "authGoogle": true,
    "googleCalendar": false
  }
}
```

### GET /config

Public configuration for frontend.

**Response:**
```json
{
  "features": {
    "selfRegistration": true,
    "darkMode": true,
    "certifications": true
  },
  "tools": [...],
  "rooms": [...]
}
```

---

## Public Endpoints

These endpoints do not require authentication.

### GET /public/tools

List all tools (public catalog).

**Query Parameters:**
- `category` (optional): Filter by category

**Response:**
```json
{
  "tools": [
    {
      "id": "laser",
      "name": "Laser Cutter",
      "category": "fabrication",
      "room": "laser-lab",
      "roomName": "Laser Lab",
      "maxConcurrent": 1,
      "requiresCert": true
    }
  ],
  "categories": ["fabrication", "electronics", "textiles"],
  "total": 7
}
```

### GET /public/tools/:id

Get tool details with availability.

**Response:**
```json
{
  "tool": {
    "id": "laser",
    "name": "Laser Cutter",
    "category": "fabrication",
    "roomName": "Laser Lab",
    "requiresCert": true
  },
  "availability": {
    "date": "2025-01-08",
    "currentBookings": 1,
    "slotsAvailable": 0,
    "bookedSlots": [
      { "startTime": "14:00", "endTime": "16:00" }
    ]
  }
}
```

### GET /public/rooms

List all rooms.

### GET /public/info

Organization information.

---

## Authentication

### GET /auth/providers

Get available authentication providers.

**Response:**
```json
{
  "providers": [
    { "id": "email", "name": "Email", "icon": "mail" },
    { "id": "google", "name": "Google", "icon": "chrome" }
  ]
}
```

### POST /auth/login

Authenticate and get JWT tokens.

**Request:**
```json
{
  "email": "user@colab.org",
  "password": "demo"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "email": "user@colab.org",
    "displayName": "John Maker",
    "role": "member",
    "permissions": {
      "tools": ["laser", "3dprinter"],
      "rooms": [],
      "capabilities": ["can_view_schedule", "can_book"]
    }
  }
}
```

### POST /auth/register

Register new account (if self-registration enabled).

### POST /auth/refresh

Refresh access token.

### POST /auth/forgot-password

Request password reset email.

### POST /auth/reset-password

Reset password with token.

---

## Bookings

All booking endpoints require authentication.

### GET /bookings

Get bookings by date or status.

**Query Parameters:**
- `date`: Filter by date (YYYY-MM-DD)
- `status`: Filter by status (pending, approved, rejected)

### GET /bookings/mine

Get current user's bookings.

### GET /bookings/pending

Get pending bookings (admin only).

### GET /bookings/:id

Get single booking.

### POST /bookings

Create new booking request.

**Request:**
```json
{
  "tool": "laser",
  "date": "2025-01-15",
  "startTime": "14:00",
  "endTime": "16:00",
  "purpose": "Cutting acrylic for art project"
}
```

### PUT /bookings/:id

Update booking.

### DELETE /bookings/:id

Cancel booking.

### POST /bookings/:id/approve

Approve booking (admin only).

### POST /bookings/:id/reject

Reject booking (admin only).

---

## Users

### GET /users

List users with pagination.

**Query Parameters:**
- `status`: active, pending, suspended, deactivated
- `role`: guest, member, certified, steward, admin
- `search`: Search by name or email
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20)

**Response:**
```json
{
  "users": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 45,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### POST /users

Create new user (admin only).

**Request:**
```json
{
  "email": "newuser@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "role": "member",
  "certifications": ["laser"]
}
```

**Response includes `tempPassword` and `emailSent` status.**

### POST /users/invites

Send email invite.

### GET /users/activity

Get activity logs (admin only).

---

## Certifications

### GET /certifications/types

List all certification types (public).

**Response:**
```json
{
  "certificationTypes": [
    {
      "id": "cert-laser-safety-123",
      "name": "Laser Cutter Safety",
      "description": "Basic laser safety certification",
      "category": "fabrication",
      "level": "basic",
      "requiresResources": ["laser"],
      "prerequisites": [],
      "expiryMonths": 12,
      "trainingRequired": true,
      "grantableBy": ["admin", "instructor"],
      "isActive": true
    }
  ]
}
```

### POST /certifications/types

Create certification type (admin only).

**Request:**
```json
{
  "name": "CNC Router Certification",
  "description": "Safety and operation training for CNC router",
  "category": "fabrication",
  "level": "advanced",
  "requiresResources": ["cnc"],
  "prerequisites": ["cert-woodshop-basic-123"],
  "expiryMonths": 24,
  "trainingRequired": true,
  "grantableBy": ["admin", "instructor"]
}
```

### PUT /certifications/types/:id

Update certification type (admin only).

### DELETE /certifications/types/:id

Deactivate certification type (admin only).

### GET /certifications/mine

Get current user's certifications.

**Response:**
```json
{
  "certifications": [...],
  "expiringSoon": [...],
  "expired": [...]
}
```

### GET /certifications/user/:email

Get user's certifications (admin/steward/self).

### POST /certifications/grant

Grant certification to user.

**Request:**
```json
{
  "userEmail": "user@example.com",
  "certTypeId": "cert-laser-safety-123",
  "notes": "Completed training session 2025-01-08",
  "bypassPrerequisites": false
}
```

### POST /certifications/revoke

Revoke certification (admin only).

**Request:**
```json
{
  "certificationId": "usercert-abc123",
  "reason": "Safety violation"
}
```

### GET /certifications/expiring

Get certifications expiring soon (admin/steward).

**Query Parameters:**
- `days`: Number of days to look ahead (default: 30)

---

## Resources

### GET /resources/tools

List all tools (config + dynamic).

**Response:**
```json
{
  "tools": [...],
  "categories": ["fabrication", "electronics"],
  "total": 10,
  "configTools": 7,
  "dynamicTools": 3
}
```

### POST /resources/tools

Create new tool (admin only).

**Request:**
```json
{
  "name": "Resin Printer",
  "category": "fabrication",
  "room": "3d-printing",
  "maxConcurrent": 2,
  "requiresCert": true,
  "description": "SLA resin 3D printer",
  "consumablesTracking": true
}
```

### PUT /resources/tools/:id

Update tool (admin only, dynamic tools only).

### POST /resources/tools/:id/maintenance

Start or complete maintenance.

**Request:**
```json
{
  "action": "start",
  "notes": "Replacing laser tube"
}
```

Or:
```json
{
  "action": "complete",
  "notes": "Laser tube replaced, calibrated",
  "nextMaintenanceAt": "2025-07-01T00:00:00Z"
}
```

### PUT /resources/tools/:id/consumables

Update consumables level.

**Request:**
```json
{
  "level": 75,
  "notes": "Added 2 spools of PLA",
  "restocked": true
}
```

### GET /resources/rooms

List all rooms.

### POST /resources/rooms

Create new room (admin only).

### POST /resources/issues

Report an issue.

**Request:**
```json
{
  "resourceId": "laser",
  "title": "Lens needs cleaning",
  "description": "Noticed some residue affecting cut quality",
  "severity": "medium"
}
```

**Response:**
```json
{
  "issue": {
    "id": "issue-abc123",
    "title": "Lens needs cleaning",
    "severity": "medium",
    "status": "open",
    "githubIssueNumber": 42,
    "githubIssueUrl": "https://github.com/middog/sdcap-governance/issues/42"
  },
  "message": "Issue reported and GitHub issue #42 created"
}
```

### GET /resources/issues

List issues (admin/steward).

**Query Parameters:**
- `status`: open, resolved, closed, all
- `resourceId`: Filter by resource

### PUT /resources/issues/:id

Update issue status.

**Request:**
```json
{
  "status": "resolved",
  "resolution": "Cleaned lens and recalibrated"
}
```

---

## Notifications

### GET /notifications/preferences

Get user's notification preferences.

**Response:**
```json
{
  "preferences": {
    "email": {
      "enabled": true,
      "bookingReminders": true,
      "bookingReminderTiming": 24,
      "certExpiryWarnings": true,
      "certExpiryTiming": 30,
      "weeklyDigest": false,
      "announcements": true
    },
    "sms": {...},
    "push": {...},
    "inApp": {...}
  }
}
```

### PUT /notifications/preferences

Update notification preferences.

### GET /notifications

Get user's notification history.

**Query Parameters:**
- `unreadOnly`: true/false
- `limit`: Max results (default: 50)

### PUT /notifications/:id/read

Mark notification as read.

### PUT /notifications/read-all

Mark all notifications as read.

### POST /notifications/send-reminders

Send booking reminders (scheduler/admin).

*Protected by API key or admin auth.*

### POST /notifications/announce

Send announcement to users (admin only).

**Request:**
```json
{
  "title": "Workshop This Saturday",
  "message": "Join us for our monthly open house...",
  "targetRoles": ["member", "certified"],
  "channels": ["inApp", "email"]
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

Common error codes:
- `TOKEN_EXPIRED` - JWT expired, use refresh token
- `UNAUTHORIZED` - Missing or invalid token
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request data

---

## Email Notifications

When `ENABLE_EMAIL=true`, the following emails are sent:

| Event | Recipient | Template |
|-------|-----------|----------|
| User invited | Invitee | `invite` |
| User created by admin | New user | `userCreated` |
| Booking approved | Booker | `bookingApproved` |
| Booking rejected | Booker | `bookingRejected` |
| Password reset | User | `passwordReset` |
| Booking reminder | Booker | `bookingReminder` |
| Announcement | Target users | `announcement` |

---

## Rate Limits

- Standard endpoints: 100 requests/minute
- Auth endpoints: 10 requests/minute
- File uploads: 10 MB max

---

**🔥 Fire Triangle API Structure:**
- **FUEL**: `/resources/*`, `/bookings/*` - Physical resources
- **OXYGEN**: `/certifications/*`, `/users/*`, `/auth/*` - Process & governance
- **HEAT**: `/public/*`, `/notifications/*` - Community engagement
