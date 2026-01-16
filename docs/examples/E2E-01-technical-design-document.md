# Technical Design Document: E2E Testing Framework for SDCoLab Scheduler

> **Status**: ✅ Approved
> **Author**: Claude (AI Assistant)
> **Created**: 2025-01-15
> **Last Updated**: 2025-01-15

---

## 1. Overview

### 1.1 Problem Statement

SDCoLab Scheduler has grown to 3400+ LOC in its main component (`ColabScheduler.jsx`) with no automated end-to-end tests. This creates several problems:

1. **Regression Risk**: Changes can break existing functionality without detection
2. **Confidence Gap**: Developers hesitate to refactor without test coverage
3. **Manual QA Burden**: Every release requires extensive manual testing
4. **Integration Blindness**: Component interactions are untested

### 1.2 Proposed Solution

Implement a comprehensive E2E testing framework using Playwright that covers all critical user journeys including authentication, booking flows, admin operations, and UI interactions.

### 1.3 Goals & Non-Goals

**Goals:**
- Automated testing of all critical user paths
- Cross-browser compatibility verification (Chrome, Firefox, Safari)
- Mobile viewport testing
- Reusable test fixtures and page objects
- CI/CD integration capability

**Non-Goals:**
- Unit testing (separate initiative)
- Visual regression testing (future enhancement)
- Performance benchmarking (separate tooling)
- Refactoring ColabScheduler.jsx (separate initiative)

### 1.4 Success Metrics

| Metric | Current State | Target | Measurement Method |
|--------|---------------|--------|-------------------|
| Critical path coverage | 0% | 100% | Test count/path count |
| Test execution time | N/A | < 5 min | CI timing |
| Flaky test rate | N/A | < 2% | CI failure analysis |
| Browser coverage | 0 | 5 browsers/viewports | Playwright projects |

---

## 2. Background & Context

### 2.1 Current State

The frontend currently has:
- No testing framework installed
- No test files
- 3400+ LOC monolithic component
- 19 sub-components in `/components`
- Multiple views: schedule, mybookings, admin, users, activity, certifications, resources, issues, template-generator, tool-config, integrations

### 2.2 Prior Art

- Playwright is the industry standard for E2E testing (recommended by React team)
- Page Object Model pattern used by Selenium best practices
- Fixture-based test setup common in enterprise testing

### 2.3 Dependencies

| Dependency | Type | Status | Owner |
|------------|------|--------|-------|
| Backend API | Hard | Active | Backend team |
| Test Environment | Hard | Needed | DevOps |
| Test User Accounts | Hard | Needed | Admin |

---

## 3. System Design

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         E2E Test Suite                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Auth Tests  │  │Booking Tests│  │ Admin Tests │  ...        │
│  │auth.spec.js │  │bookings.spec│  │admin.spec.js│             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │      fixtures.js      │                          │
│              │  - Page Objects       │                          │
│              │  - Test Helpers       │                          │
│              │  - Test Users         │                          │
│              └───────────────────────┘                          │
│                          │                                      │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │  playwright.config.js │                          │
│              │  - Browser configs    │                          │
│              │  - Reporter setup     │                          │
│              │  - Server config      │                          │
│              └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SDCoLab Scheduler App                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   ColabScheduler.jsx                     │   │
│  │  (Views: schedule, mybookings, admin, users, etc.)      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │AdminPanel│ │MyBookings│ │IssueDash │ │   ...    │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Breakdown

#### Component A: Test Configuration (`playwright.config.js`)
- **Responsibility**: Configure test execution environment
- **Inputs**: Environment variables, CLI args
- **Outputs**: Test configuration object
- **Key Settings**: Browser projects, reporters, web server

#### Component B: Test Fixtures (`fixtures.js`)
- **Responsibility**: Provide reusable test utilities
- **Inputs**: Playwright page object
- **Outputs**: Extended test function, page objects
- **Key Features**: SchedulerPage POM, AdminPage POM, auth helpers

#### Component C: Test Specs (`*.spec.js`)
- **Responsibility**: Define and execute test scenarios
- **Inputs**: Fixtures, page objects
- **Outputs**: Test results, screenshots, traces

### 3.3 File Structure

```
frontend/
├── e2e/
│   ├── fixtures.js        # Page objects & helpers
│   ├── auth.setup.js      # Auth state setup
│   ├── auth.spec.js       # Authentication tests
│   ├── bookings.spec.js   # Booking flow tests
│   ├── admin.spec.js      # Admin functionality tests
│   └── ui.spec.js         # UI/UX tests
├── playwright.config.js   # Playwright configuration
└── package.json           # Updated with test scripts
```

### 3.4 Test Categories

| Category | File | Coverage |
|----------|------|----------|
| Authentication | auth.spec.js | Login, logout, OAuth, session |
| Bookings | bookings.spec.js | Schedule, create, modify, cancel |
| Admin | admin.spec.js | User mgmt, approvals, activity log |
| UI/UX | ui.spec.js | Theme, help, mobile, accessibility |

---

## 4. Technical Decisions

### 4.1 Key Design Decisions

#### Decision 1: Playwright over Cypress

- **Context**: Need to choose E2E testing framework
- **Options Considered**:
  - Playwright: Multi-browser, auto-wait, parallel, modern API
  - Cypress: Good DX, but single tab, limited browser support
  - Selenium: Industry standard but verbose, slower
- **Decision**: Playwright
- **Consequences**: Need Node 18+, learning curve for team

#### Decision 2: Page Object Model Pattern

- **Context**: How to structure test code
- **Options Considered**:
  - Raw selectors: Simple but brittle
  - Page Objects: Reusable, maintainable
  - Component Objects: Very granular
- **Decision**: Page Object Model with component-level objects
- **Consequences**: More initial setup, better long-term maintenance

### 4.2 Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Test Framework | Playwright | Best multi-browser support, modern API |
| Assertion Library | Playwright built-in | Consistent, auto-retry |
| Reporter | HTML + JSON | Visual debugging + CI integration |

---

## 5. Implementation Plan

### 5.1 Phases

#### Phase 1: Foundation (2-3 hours)
- [x] Install Playwright
- [x] Create configuration
- [x] Set up fixtures and page objects
- [x] Create auth setup

#### Phase 2: Core Tests (3-4 hours)
- [x] Authentication tests
- [x] Booking flow tests
- [x] Admin functionality tests

#### Phase 3: Polish (1-2 hours)
- [x] UI/UX tests
- [x] Mobile viewport tests
- [x] Package.json scripts

### 5.2 Migration Strategy

N/A - New implementation, no migration needed.

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Flaky tests due to async | Medium | High | Use Playwright auto-wait, explicit waits |
| Test data contamination | Medium | Medium | Unique test data per run, cleanup |
| CI environment differences | Low | High | Docker-based CI, consistent environment |
| Selector fragility | Medium | Medium | Prefer data-testid, semantic selectors |

---

## 7. Security & Privacy

### 7.1 Security Considerations
- Test credentials stored in environment variables, not code
- Auth tokens not logged
- Test environment isolated from production

### 7.2 Privacy Considerations
- No production user data in tests
- Test users are synthetic
- Screenshots may contain test data (configure appropriately)

---

## 8. Observability

### 8.1 Test Reporting
- HTML report for visual debugging
- JSON report for CI integration
- Screenshots on failure
- Video on retry

### 8.2 CI Integration
- Exit codes for pass/fail
- Artifact upload for reports
- Parallel execution support

---

## 9. Testing Strategy

### 9.1 Test Coverage Plan

| Test Type | Count | Focus Areas |
|-----------|-------|-------------|
| Auth Tests | 12 | Login, logout, OAuth, sessions |
| Booking Tests | 15 | Schedule, CRUD, conflicts |
| Admin Tests | 18 | Users, approvals, activity |
| UI Tests | 12 | Theme, help, mobile, a11y |

### 9.2 Critical Paths Covered

1. User login → View schedule → Create booking → Confirm
2. Admin login → View pending → Approve booking
3. Admin login → User management → Create user → Invite
4. Any user → Theme toggle → Help drawer → Navigation

---

## 10. Open Questions

- [x] **Q1**: Should we use real backend or mock?
  - _Decision_: Real backend in test environment
  
- [x] **Q2**: How to handle OAuth providers in tests?
  - _Decision_: Focus on email/password, mock OAuth where needed

---

## 11. References

- [Playwright Documentation](https://playwright.dev/)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
- [Reddit Post: FAANG AI Coding Workflow](uploaded image)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-15 | Claude | Initial implementation |
