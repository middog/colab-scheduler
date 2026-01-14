# SDCoLab Tool Scheduler
## Project Transition Brief

**Document Version:** 1.0  
**Date:** January 2026  
**Classification:** Internal  
**Prepared For:** Project Management Review  

---

## 1. Executive Summary

The SDCoLab Tool Scheduler is a cloud-native booking management system designed for makerspace environments. The system enables members to request tool reservations, administrators to approve bookings, and optionally synchronizes with external systems (Google Calendar, GitHub, Slack).

| Metric | Value |
|--------|-------|
| Project Status | MVP Complete |
| Deployment Model | Serverless (AWS) |
| LOC (Backend) | ~2,500 |
| LOC (Frontend) | ~1,200 |
| LOC (Infrastructure) | ~400 |
| External Dependencies | 12 npm packages |
| Estimated Monthly Cost | $5-15 (low volume) |

**Key Deliverable:** Production-ready booking system with modular integration architecture allowing phased feature enablement.

---

## 2. Business Context

### 2.1 Client Organization
- **Organization:** SDCoLab (San Diego Collaborative Arts Project)
- **Type:** 501(c)(3) Nonprofit Makerspace
- **User Base:** ~200 active members
- **Facility:** Shared workshop with 7 bookable tool stations

### 2.2 Business Drivers
1. Replace manual booking process (spreadsheet/email)
2. Reduce scheduling conflicts for high-demand equipment
3. Maintain audit trail for safety compliance
4. Enable async governance via GitHub Issues workflow

### 2.3 Success Criteria
| Criteria | Target | Status |
|----------|--------|--------|
| Member self-service booking | 100% | ✅ Complete |
| Admin approval workflow | Required | ✅ Complete |
| Calendar integration | Optional | ✅ Complete |
| GitHub Issues sync | Optional | ✅ Complete |
| Mobile responsive UI | Required | ✅ Complete |
| Sub-second API response | <500ms | ✅ Complete |

---

## 3. Technical Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION TIER                          │
│                                                                     │
│   ┌─────────────────┐    ┌─────────────────┐                       │
│   │   Web Client    │    │  Mobile Client  │                       │
│   │  (React/Vite)   │    │   (Responsive)  │                       │
│   └────────┬────────┘    └────────┬────────┘                       │
│            │                      │                                 │
│            └──────────┬───────────┘                                 │
│                       ▼                                             │
│              ┌─────────────────┐                                    │
│              │   Amazon S3     │                                    │
│              │ (Static Hosting)│                                    │
│              └─────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           API TIER                                  │
│                                                                     │
│              ┌─────────────────┐                                    │
│              │  API Gateway    │                                    │
│              │    (HTTP)       │                                    │
│              └────────┬────────┘                                    │
│                       ▼                                             │
│              ┌─────────────────┐                                    │
│              │  AWS Lambda     │                                    │
│              │  (Node.js 20)   │                                    │
│              └────────┬────────┘                                    │
│                       │                                             │
│         ┌─────────────┼─────────────┐                              │
│         ▼             ▼             ▼                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                        │
│   │  Auth    │  │ Bookings │  │  Users   │                        │
│   │ Module   │  │  Module  │  │  Module  │                        │
│   └──────────┘  └──────────┘  └──────────┘                        │
│                       │                                             │
│              ┌────────┴────────┐                                    │
│              ▼                 ▼                                    │
│   ┌─────────────────┐  ┌─────────────────┐                        │
│   │  Integration    │  │   Integration   │                        │
│   │  Orchestrator   │  │    Adapters     │                        │
│   └─────────────────┘  └─────────────────┘                        │
│                              │                                      │
│              ┌───────────────┼───────────────┐                     │
│              ▼               ▼               ▼                     │
│        ┌──────────┐   ┌──────────┐   ┌──────────┐                 │
│        │  Google  │   │  GitHub  │   │  Slack   │                 │
│        │ Calendar │   │  Issues  │   │ Webhook  │                 │
│        └──────────┘   └──────────┘   └──────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          DATA TIER                                  │
│                                                                     │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│   │    Bookings     │  │     Users       │  │   Audit Log     │   │
│   │   (DynamoDB)    │  │   (DynamoDB)    │  │   (DynamoDB)    │   │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                     │
│   Indexes: date-index, user-index, status-index                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Frontend | React | 18.x | Industry standard, component reuse |
| Build Tool | Vite | 5.x | Fast builds, ESM native |
| Styling | Tailwind CSS | 3.x | Utility-first, rapid development |
| Backend Runtime | Node.js | 20.x LTS | Lambda native, async I/O |
| API Framework | Express.js | 4.x | Lightweight, middleware ecosystem |
| Database | DynamoDB | - | Serverless, pay-per-request |
| IaC | OpenTofu | 1.6.x | Terraform-compatible, open source |
| CI/CD | GitHub Actions | - | Native integration |

### 3.3 Module Dependency Map

```
src/
├── index.js                 # Application entry point
│   ├── lib/config.js        # Configuration & feature flags
│   ├── routes/auth.js       # Authentication endpoints
│   ├── routes/bookings.js   # Booking CRUD + approval workflow
│   │   └── integrations/    # Hook orchestration
│   │       ├── index.js     # Event dispatcher
│   │       ├── googleCalendar.js
│   │       ├── github.js
│   │       └── slack.js
│   ├── routes/users.js      # User management (admin)
│   ├── middleware/auth.js   # JWT verification
│   └── lib/database.js      # DynamoDB operations
```

---

## 4. Feature Matrix

### 4.1 Core Features (Always Enabled)

| Feature | Description | API Endpoint |
|---------|-------------|--------------|
| User Authentication | JWT-based login/session | `POST /api/auth/login` |
| Booking Request | Members request time slots | `POST /api/bookings` |
| Booking Approval | Admin approves/rejects | `POST /api/bookings/:id/approve` |
| My Bookings | View personal bookings | `GET /api/bookings/mine` |
| User Management | Admin CRUD for members | `GET/POST/PUT/DELETE /api/users` |
| Audit Logging | All mutations logged | Internal |

### 4.2 Optional Integrations (Feature Flagged)

| Integration | Flag | Description | Dependency |
|-------------|------|-------------|------------|
| Google Calendar | `ENABLE_GCAL` | Sync approved bookings to calendar | Google Cloud Project |
| GitHub Issues | `ENABLE_GITHUB` | Create issues for booking requests | GitHub PAT |
| Slack Notifications | `ENABLE_SLACK` | Post to channel on events | Slack Webhook |

### 4.3 Feature Flag Configuration

```hcl
# infrastructure/terraform.tfvars
enable_gcal      = false  # Google Calendar sync
enable_github    = false  # GitHub Issues integration  
enable_slack     = false  # Slack notifications
enable_audit_log = true   # Audit trail (recommended)
```

---

## 5. Data Model

### 5.1 Entity Relationship

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    USER     │       │   BOOKING   │       │    TOOL     │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ email (PK)  │◄──────│ user (FK)   │       │ id          │
│ firstName   │       │ id (PK)     │───────│ name        │
│ lastName    │       │ tool (FK)   │       │ maxConcurrent│
│ role        │       │ date        │       │ room        │
│ toolsAllowed│       │ startTime   │       └─────────────┘
│ passwordHash│       │ endTime     │              ▲
└─────────────┘       │ purpose     │              │
                      │ status      │       (Static Config)
                      │ calendarId  │
                      │ githubIssue │
                      └─────────────┘
```

### 5.2 DynamoDB Table Schemas

**Bookings Table**
| Attribute | Type | Description |
|-----------|------|-------------|
| id | String (PK) | UUID |
| tool | String | Tool identifier |
| user | String | User email |
| date | String | ISO date (YYYY-MM-DD) |
| startTime | String | HH:MM format |
| endTime | String | HH:MM format |
| status | String | pending/approved/rejected |
| calendarEventId | String | Google Calendar event ID |
| githubIssueNumber | Number | GitHub issue number |

**GSI Indexes:** date-index, user-index, status-index

**Users Table**
| Attribute | Type | Description |
|-----------|------|-------------|
| email | String (PK) | User email |
| firstName | String | First name |
| lastName | String | Last name |
| role | String | member/admin |
| toolsAllowed | List | Authorized tool IDs |
| passwordHash | String | bcrypt hash |

---

## 6. Security Architecture

### 6.1 Authentication Flow

```
┌────────┐     ┌─────────┐     ┌────────┐     ┌──────────┐
│ Client │────▶│  Login  │────▶│  JWT   │────▶│ Protected│
│        │     │ Request │     │ Issued │     │   APIs   │
└────────┘     └─────────┘     └────────┘     └──────────┘
     │                              │               │
     │         ┌────────────────────┘               │
     │         ▼                                    │
     │    Authorization: Bearer <token>             │
     └──────────────────────────────────────────────┘
```

### 6.2 Security Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| Authentication | JWT (HS256, 24h expiry) | ✅ |
| Password Storage | bcrypt (10 rounds) | ✅ |
| Authorization | Role-based (member/admin) | ✅ |
| Tool Authorization | Per-user allowlist | ✅ |
| CORS | Configurable origins | ✅ |
| Secrets Management | Terraform sensitive vars | ✅ |
| API Gateway | AWS managed TLS | ✅ |

### 6.3 Sensitive Data Handling

| Data Element | Storage | Encryption |
|--------------|---------|------------|
| Passwords | DynamoDB | bcrypt hash |
| JWT Secret | Lambda env var | AWS KMS |
| API Keys | Terraform state | Sensitive flag |
| Calendar Credentials | Lambda env var | AWS KMS |

---

## 7. Deployment & Operations

### 7.1 Infrastructure Components

| Component | AWS Service | Pricing Model |
|-----------|-------------|---------------|
| API | API Gateway HTTP | Per-request |
| Compute | Lambda | Per-invocation |
| Database | DynamoDB | Pay-per-request |
| Static Hosting | S3 | Storage + transfer |

### 7.2 Deployment Pipeline

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Push   │───▶│  Test   │───▶│  Build  │───▶│ Deploy  │
│ to main │    │  Suite  │    │ Backend │    │   AWS   │
└─────────┘    └─────────┘    │Frontend │    └─────────┘
                              └─────────┘
```

**Deployment Command:**
```bash
./scripts/deploy.sh [dev|staging|prod]
```

### 7.3 Environment Matrix

| Environment | AWS Account | Branch | Auto-Deploy |
|-------------|-------------|--------|-------------|
| dev | Development | feature/* | Manual |
| staging | Development | main | On merge |
| prod | Production | release/* | Manual |

### 7.4 Estimated AWS Costs

| Service | Dev (Monthly) | Prod (Monthly) |
|---------|---------------|----------------|
| Lambda | $0 (free tier) | $1-5 |
| API Gateway | $0 (free tier) | $1-3 |
| DynamoDB | $0 (free tier) | $2-5 |
| S3 | <$1 | <$1 |
| **Total** | **<$1** | **$5-15** |

---

## 8. Integration Specifications

### 8.1 Google Calendar Integration

**Authentication Methods:**

| Method | Use Case | Key Required |
|--------|----------|--------------|
| Workload Identity Federation | AWS Lambda → GCP | No |
| Service Account Key | Traditional | Yes |

**Event Lifecycle:**
```
Booking Approved → Create Calendar Event → Store Event ID
Booking Updated  → Update Calendar Event
Booking Deleted  → Delete Calendar Event
```

### 8.2 GitHub Issues Integration

**Issue Mapping:**
| Booking Event | GitHub Action |
|---------------|---------------|
| Created | Create issue with `booking:pending` label |
| Approved | Add comment, update label to `booking:approved` |
| Rejected | Add comment, close issue |
| Cancelled | Add comment, close issue |

**Labels Used:**
- `fire:fuel` - Physical resource classification
- `booking` - Issue type
- `booking:pending` / `booking:approved` - Status

### 8.3 Slack Integration

**Notification Events:**
| Event | Channel | Message |
|-------|---------|---------|
| New Booking | #colab-bookings | Request details + review link |
| Approved | #colab-bookings | Confirmation + calendar link |
| Rejected | #colab-bookings | Rejection notice |

---

## 9. Operational Runbook

### 9.1 Common Operations

**View Logs:**
```bash
aws logs tail /aws/lambda/colab-scheduler-dev-api --follow
```

**Check Health:**
```bash
curl https://<api-id>.execute-api.us-west-2.amazonaws.com/api/health
```

**Manual Seed Data:**
```bash
cd scripts && node seed-demo-data.js
```

### 9.2 Troubleshooting Guide

| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| 401 Unauthorized | Expired JWT | Re-login |
| 403 Forbidden | Missing tool auth | Admin: update user.toolsAllowed |
| 500 Internal Error | Lambda crash | Check CloudWatch logs |
| Calendar not syncing | Invalid credentials | Verify GCP service account |
| Slow response | Cold start | Enable provisioned concurrency |

### 9.3 Disaster Recovery

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Lambda failure | <1 min | 0 | Auto-recovery |
| DynamoDB issue | <1 min | 0 | Multi-AZ by default |
| Region outage | 4 hours | 0 | Redeploy to alternate region |
| Data corruption | 1 hour | 24 hours | Point-in-time recovery (prod) |

---

## 10. Known Limitations & Technical Debt

### 10.1 Current Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Single region | Latency for remote users | CloudFront CDN |
| No email notifications | Users must check app | Slack integration |
| Manual user provisioning | Admin overhead | SSO integration (future) |
| 24-hour JWT expiry | Re-login required | Refresh token (future) |

### 10.2 Technical Debt Register

| Item | Priority | Effort | Description |
|------|----------|--------|-------------|
| Test coverage | Medium | 2 days | Add unit/integration tests |
| Error handling | Low | 1 day | Standardize error responses |
| Rate limiting | Low | 0.5 days | Add API throttling |
| Monitoring | Medium | 1 day | CloudWatch dashboards |

---

## 11. Transition Checklist

### 11.1 Pre-Transition

- [ ] AWS account access provisioned
- [ ] GitHub repository access granted
- [ ] GCP project access (if calendar enabled)
- [ ] Documentation review completed
- [ ] Development environment setup verified

### 11.2 Knowledge Transfer Sessions

| Session | Duration | Attendees | Topics |
|---------|----------|-----------|--------|
| Architecture Overview | 2 hours | Dev Lead, Architects | System design, data flow |
| Codebase Walkthrough | 3 hours | Development Team | Module structure, patterns |
| Deployment Training | 2 hours | DevOps | IaC, CI/CD, monitoring |
| Operations Handoff | 1 hour | Support Team | Runbook, escalation |

### 11.3 Post-Transition Support

| Period | Support Level | Contact |
|--------|---------------|---------|
| Week 1-2 | On-call | Original developer |
| Week 3-4 | Business hours | Email support |
| Month 2+ | Documentation only | GitHub issues |

---

## 12. Appendices

### A. Repository Structure
```
colab-scheduler/
├── .github/workflows/     # CI/CD pipelines
├── backend/
│   ├── src/
│   │   ├── lib/           # Shared utilities
│   │   ├── integrations/  # External service adapters
│   │   ├── middleware