# 🔥 SDCoLab Scheduler

**Version 4.2.0-rc69.11**

A production-ready makerspace tool and room booking system for the San Diego Collaborative Arts Project (SDCAP) community.

Built on the **Fire Triangle** model: **FUEL** (infrastructure) + **OXYGEN** (governance) + **HEAT** (community).

## Features

### Core Booking System
- **Tool & Room Reservations** with conflict detection
- **Multi-day & Recurring Bookings** support
- **Waitlist Management** with automatic notifications
- **Certification Tracking** for tool access control

### Authentication & Security
- **Multi-provider Auth**: Email/password, Google, Microsoft, GitHub OAuth
- **Server-side Session Management** with refresh token rotation
- **Role-based Access Control**: member, certified, steward, admin, superadmin
- **Invite-based Registration** or open self-registration

### Production-Ready Infrastructure
- **Idempotent API Endpoints** - safe retries, no duplicate bookings
- **Optimistic Concurrency Control** - ETag/version conflict detection
- **Soft-Delete with Undo** - 10-second recovery window for destructive actions
- **Standardized API Responses** - consistent error shapes with request tracking
- **Rate Limiting** - per-user and per-IP protection
- **Circuit Breakers** - graceful degradation for external services

### Admin Tools
- **Audit Log** - full activity trail with filtering and export
- **Analytics Dashboard** - utilization metrics and reporting
- **Bulk Operations** - mass approve/reject bookings
- **Resource Management** - dynamic tool/room configuration
- **Issue Tracking** - maintenance and problem reporting

### Integrations (Optional)
- **Google Calendar** - automatic event creation for approved bookings
- **Slack** - notifications for bookings and approvals
- **GitHub** - issue sync for maintenance, discussions for feedback
- **Email (AWS SES)** - transactional emails and reminders

---

## Quick Start

### Prerequisites

- Node.js 24+
- AWS CLI configured with credentials
- OpenTofu or Terraform 1.0+

### Deploy

```bash
cd colab-scheduler

# Deploy with HTTPS (default - uses AWS Amplify)
./scripts/deploy.sh

# Output includes:
# - Frontend URL (HTTPS)
# - API URL
# - Demo credentials (admin@colab.org / demodemo)
```

### Custom Domain

```bash
# Default: sdcolab.mid.dog
./scripts/deploy.sh

# Custom subdomain
DNS_SUBDOMAIN=scheduler ./scripts/deploy.sh  # → scheduler.mid.dog

# Different zone
DNS_ZONE_NAME=example.com DNS_SUBDOMAIN=tools ./scripts/deploy.sh
```

### Destroy

```bash
./scripts/destroy.sh
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Route 53 (DNS)                              │
│                      sdcolab.mid.dog                                │
└───────────────┬─────────────────────────────────┬───────────────────┘
                │                                 │
┌───────────────▼───────────────┐   ┌─────────────▼─────────────────┐
│      CloudFront / Amplify     │   │       API Gateway (HTTP)      │
│        (HTTPS Frontend)       │   │     api.sdcolab.mid.dog       │
└───────────────┬───────────────┘   └─────────────┬─────────────────┘
                │                                 │
┌───────────────▼───────────────┐   ┌─────────────▼─────────────────┐
│          S3 Bucket            │   │      Lambda Function          │
│       (React SPA Build)       │   │      (Express.js API)         │
└───────────────────────────────┘   └─────────────┬─────────────────┘
                                                  │
┌─────────────────────────────────────────────────▼─────────────────────┐
│                            DynamoDB                                   │
│  ┌────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌───────┐ ┌───────┐ │
│  │ Users  │ │Bookings │ │ Activity │ │Sessions │ │ Certs │ │Invites│ │
│  └────────┘ └─────────┘ └──────────┘ └─────────┘ └───────┘ └───────┘ │
│  ┌───────────┐ ┌───────────┐ ┌────────────┐ ┌───────────────┐        │
│  │ Resources │ │ Waitlist  │ │ Idempotency│ │  Rate Limits  │        │
│  └───────────┘ └───────────┘ └────────────┘ └───────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌─────────┐    ┌───────────┐    ┌─────────┐
              │   SES   │    │   Slack   │    │ Google  │
              │ (Email) │    │ (Notify)  │    │Calendar │
              └─────────┘    └───────────┘    └─────────┘
```

---

## API Overview

### Response Format

All endpoints return consistent JSON:

```json
// Success
{
  "success": true,
  "data": { ... },
  "message": "Optional message",
  "timestamp": "2026-01-13T00:00:00.000Z"
}

// Error
{
  "success": false,
  "error": {
    "code": "SLOT_TAKEN",
    "message": "This slot was taken 12 seconds ago",
    "details": { "takenAt": "...", "alternatives": [...] },
    "requestId": "uuid"
  },
  "timestamp": "2026-01-13T00:00:00.000Z"
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized for action |
| `NOT_FOUND` | 404 | Resource not found |
| `SLOT_TAKEN` | 409 | Booking slot unavailable |
| `VERSION_MISMATCH` | 409 | Concurrent edit conflict |
| `CERTIFICATION_REQUIRED` | 403 | Need tool certification |
| `MAINTENANCE_WINDOW` | 409 | Tool under maintenance |
| `BOOKING_LIMIT_EXCEEDED` | 403 | Max bookings reached |

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/bookings` | List bookings |
| `POST` | `/api/bookings` | Create booking (idempotent) |
| `PUT` | `/api/bookings/:id` | Update booking (optimistic locking) |
| `DELETE` | `/api/bookings/:id` | Cancel booking (soft delete + undo) |
| `POST` | `/api/bookings/:id/undo` | Restore cancelled booking |
| `POST` | `/api/bookings/bulk/approve` | Bulk approve (admin) |
| `GET` | `/api/resources/tools` | List tools |
| `GET` | `/api/users/activity` | Audit log (admin) |

### Headers

| Header | Purpose |
|--------|---------|
| `Authorization` | Bearer token |
| `X-Idempotency-Key` | Prevent duplicate requests |
| `If-Match` | Optimistic concurrency (ETag) |
| `X-Request-Id` | Request tracking |

---

## Project Structure

```
colab-scheduler/
├── backend/
│   └── src/
│       ├── index.js              # Express app entry point
│       ├── routes/
│       │   ├── auth.js           # Authentication & OAuth
│       │   ├── bookings.js       # Booking CRUD + bulk ops
│       │   ├── users.js          # User management + audit
│       │   ├── resources.js      # Tools & rooms management
│       │   ├── certifications.js # Certification tracking
│       │   ├── notifications.js  # Notification preferences
│       │   ├── waitlist.js       # Waitlist management
│       │   ├── recurring.js      # Recurring bookings
│       │   ├── analytics.js      # Usage analytics
│       │   └── public.js         # Public endpoints
│       ├── lib/
│       │   ├── database.js       # DynamoDB services
│       │   ├── responses.js      # Standardized API responses
│       │   ├── archive.js        # Soft-delete + undo
│       │   ├── resilience.js     # Idempotency, rate limiting
│       │   ├── sessions.js       # Server-side sessions
│       │   ├── config.js         # Configuration + feature flags
│       │   ├── waitlist.js       # Waitlist logic
│       │   └── recurring.js      # Recurring booking logic
│       ├── middleware/
│       │   ├── auth.js           # JWT + session validation
│       │   └── validate.js       # Request validation
│       ├── integrations/
│       │   ├── index.js          # Integration orchestrator
│       │   ├── googleCalendar.js # Google Calendar sync
│       │   ├── slack.js          # Slack notifications
│       │   ├── github.js         # GitHub issues/discussions
│       │   └── email.js          # AWS SES emails
│       └── schemas/              # Validation schemas
│
├── frontend/
│   └── src/
│       ├── main.jsx              # React entry + routing
│       ├── ColabScheduler.jsx    # Main application (3000+ lines)
│       ├── lib/
│       │   └── api.js            # API client + optimistic updates
│       ├── components/
│       │   ├── AdminPanel.jsx        # Admin dashboard
│       │   ├── AuditLog.jsx          # Activity log viewer
│       │   ├── AnalyticsDashboard.jsx
│       │   ├── CertificationManagement.jsx
│       │   ├── ResourceManagement.jsx
│       │   ├── MyBookingsPanel.jsx
│       │   ├── WaitlistPanel.jsx
│       │   ├── RecurringBookings.jsx
│       │   ├── IssueDashboard.jsx
│       │   ├── NotificationPreferences.jsx
│       │   ├── MultiSelectCalendar.jsx
│       │   ├── FormField.jsx         # Validated form inputs
│       │   ├── UndoToast.jsx         # Undo notifications
│       │   └── ErrorBoundary.jsx
│       └── pages/
│           ├── HelpPage.jsx          # Documentation
│           └── PublicToolsCatalog.jsx
│
├── infrastructure/
│   └── main.tf                   # Terraform/OpenTofu (1300+ lines)
│
├── scripts/
│   ├── deploy.sh                 # Full deployment automation
│   ├── destroy.sh                # Teardown with cleanup
│   ├── seed-demo-data.js         # Demo data seeding
│   └── env.sh.example            # Environment template
│
└── docs/
    ├── INTEGRATION_KEYS_SETUP.md
    └── ...
```

---

## Configuration

### Environment Variables

Copy `scripts/env.sh.example` and configure:

```bash
# Required in production
JWT_SECRET=your-secure-random-string
SCHEDULER_API_KEY=your-api-key

# Authentication providers
ENABLE_AUTH_GOOGLE=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

ENABLE_AUTH_MICROSOFT=true
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...

ENABLE_AUTH_GITHUB=true
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Integrations
ENABLE_GCAL=true
GCAL_SERVICE_ACCOUNT_EMAIL=...
GCAL_PRIVATE_KEY=...

ENABLE_SLACK=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

ENABLE_GITHUB=true
GITHUB_TOKEN=ghp_...
GITHUB_REPO=org/repo

ENABLE_EMAIL=true
SES_FROM_ADDRESS=noreply@yourdomain.com
```

### Feature Flags

All integrations are optional. The system works fully offline with just DynamoDB.

```javascript
// In config.js
isFeatureEnabled('googleCalendar')  // ENABLE_GCAL
isFeatureEnabled('slack')           // ENABLE_SLACK
isFeatureEnabled('github')          // ENABLE_GITHUB
isFeatureEnabled('email')           // ENABLE_EMAIL
isFeatureEnabled('activityLog')     // Always enabled
```

---

## Development

### Local Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
# API at http://localhost:3001
```

### Local Frontend

```bash
cd frontend
npm install
npm run dev
# App at http://localhost:5173
```

### Demo Credentials

After deployment or seeding demo data:
- **Email**: admin@colab.org
- **Password**: demodemo

---

## Fire Triangle Philosophy

The Fire Triangle represents the three essential elements for a thriving makerspace:

### 🟡 FUEL (Infrastructure)
- AWS resources, servers, databases
- Code, tools, equipment
- Physical space and materials

### 🔵 OXYGEN (Governance)  
- Policies and procedures
- Certifications and safety training
- Transparency and audit trails

### 🔴 HEAT (Community)
- People and relationships
- Engagement and participation
- Culture and shared values

**All three elements must be present for the fire to burn.**

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

### Recent: v4.2.0-rc69.11
- Idempotent API endpoints
- Optimistic concurrency control
- Soft-delete with 10-second undo
- Standardized API responses
- Audit log UI
- Bulk admin operations

---

## License

MIT - Built with 🔥 for the San Diego maker community

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```
        🔥
       /|\
      / | \
     /  |  \
    / HEAT  \
   /    |    \
  /_____|_____\
 /      |      \
/  FUEL | OXYGEN\
/________________\
```
