# Sprint Planning: E2E Testing Framework Implementation

> **Status**: ✅ Complete

---

## Sprint Info

| Field | Value |
|-------|-------|
| **Sprint** | E2E-Sprint-1 |
| **Dates** | 2025-01-15 (single session) |
| **Goal** | Implement comprehensive E2E testing framework |
| **Parent Docs** | TDD, Design Review, Subsystem Plan |

---

## 1. Sprint Scope

### 1.1 In Scope for This Sprint
- Playwright configuration setup
- Page Object Model implementation
- Authentication test suite
- Booking flow test suite
- Admin functionality test suite
- UI/UX test suite
- Package.json updates

### 1.2 Explicitly Out of Scope
- Unit tests (separate initiative)
- Visual regression tests (future sprint)
- CI/CD pipeline setup (ops team)
- Application code changes (no data-testid additions)

---

## 2. Task Breakdown

### TASK-001: Create Playwright Configuration

**Type**: Setup
**Points**: 2
**Assignee**: AI Agent
**Priority**: P0

#### Context
Playwright requires a configuration file to define browsers, reporters, and test settings.

#### Acceptance Criteria
- [x] File created at `frontend/playwright.config.js`
- [x] Configures 5 browser targets (Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari)
- [x] Sets up HTML and JSON reporters
- [x] Configures development server auto-start
- [x] Sets up screenshot and video capture on failure

#### Technical Details
- **Files to create**: `frontend/playwright.config.js`
- **Dependencies**: None

#### Implementation Hints
- Use ES module format (`export default defineConfig`)
- Reference Playwright docs for device presets
- Set reasonable timeouts (10s for assertions)

#### Definition of Done
- [x] Config file created
- [x] Valid JavaScript syntax
- [x] All browser projects defined

---

### TASK-002: Create Test Fixtures and Page Objects

**Type**: Feature
**Points**: 5
**Assignee**: AI Agent
**Priority**: P0

#### Context
Page Object Model reduces test duplication and improves maintainability.

#### Acceptance Criteria
- [x] `fixtures.js` exports TEST_USERS configuration
- [x] SchedulerPage class with selectors and methods
- [x] AdminPage class extending SchedulerPage
- [x] Extended Playwright test fixture
- [x] Helper utility functions

#### Technical Details
- **Files to create**: `frontend/e2e/fixtures.js`
- **Dependencies**: TASK-001

#### Implementation Hints
- Use environment variables for credentials
- Implement flexible selectors with fallbacks
- Follow Playwright fixture extension pattern:
  ```javascript
  export const test = base.extend({
    schedulerPage: async ({ page }, use) => {
      await use(new SchedulerPage(page));
    },
  });
  ```

#### Definition of Done
- [x] All exports defined
- [x] SchedulerPage covers main app actions
- [x] AdminPage covers admin-specific actions
- [x] Utilities return correct data types

---

### TASK-003: Create Authentication Setup

**Type**: Feature
**Points**: 2
**Assignee**: AI Agent
**Priority**: P0

#### Context
Authentication state can be saved and reused to speed up tests.

#### Acceptance Criteria
- [x] `auth.setup.js` saves authenticated state
- [x] Handles missing credentials gracefully
- [x] Creates separate state for admin and member

#### Technical Details
- **Files to create**: `frontend/e2e/auth.setup.js`
- **Dependencies**: TASK-002

#### Implementation Hints
- Use `page.context().storageState({ path })` to save
- Check for default credentials and warn
- Save to `.auth/` directory

#### Definition of Done
- [x] Setup file created
- [x] Auth state saved correctly
- [x] Graceful handling of missing creds

---

### TASK-004: Create Authentication Test Suite

**Type**: Test
**Points**: 3
**Assignee**: AI Agent
**Priority**: P0

#### Context
Authentication is the critical path for all other functionality.

#### Acceptance Criteria
- [x] Tests for login form display
- [x] Tests for OAuth button visibility
- [x] Tests for invalid credentials handling
- [x] Tests for successful login (all roles)
- [x] Tests for session persistence
- [x] Tests for logout flow
- [x] Tests for authorization (role-based access)
- [x] Tests for OAuth error callbacks

#### Technical Details
- **Files to create**: `frontend/e2e/auth.spec.js`
- **Dependencies**: TASK-002, TASK-003

#### Implementation Hints
- Group related tests with `describe` blocks
- Use `beforeEach` for common setup
- Test both happy path and error cases
- Use `test.describe` for logical grouping

#### Test Scenarios
| ID | Scenario | Expected |
|----|----------|----------|
| AUTH-01 | Unauthenticated user sees login form | Form visible |
| AUTH-02 | Invalid credentials show error | Error message visible |
| AUTH-03 | Valid login redirects to dashboard | Dashboard visible |
| AUTH-04 | Session persists on reload | Still logged in |
| AUTH-05 | Logout clears session | Login form visible |
| AUTH-06 | Member cannot access admin views | Admin content hidden |

#### Definition of Done
- [x] All test scenarios covered
- [x] Tests pass locally
- [x] Clear test names

---

### TASK-005: Create Booking Flow Test Suite

**Type**: Test
**Points**: 5
**Assignee**: AI Agent
**Priority**: P0

#### Context
Booking creation is the core value proposition of the application.

#### Acceptance Criteria
- [x] Tests for schedule view rendering
- [x] Tests for date navigation
- [x] Tests for tool selection
- [x] Tests for time slot selection (single and range)
- [x] Tests for booking creation
- [x] Tests for My Bookings view
- [x] Tests for booking cancellation
- [x] Tests for booking modification
- [x] Tests for calendar summary
- [x] Tests for overlap/conflict handling

#### Technical Details
- **Files to create**: `frontend/e2e/bookings.spec.js`
- **Dependencies**: TASK-002

#### Implementation Hints
- Use date helpers from fixtures
- Test conditional flows (if element visible)
- Handle dynamic content with proper waits

#### Test Scenarios
| ID | Scenario | Expected |
|----|----------|----------|
| BOOK-01 | Schedule shows today by default | Today's date visible |
| BOOK-02 | Can navigate to next day | Tomorrow visible |
| BOOK-03 | Can select time slot | Slot marked selected |
| BOOK-04 | Can create booking with purpose | Success message |
| BOOK-05 | Empty purpose shows validation | Error state |
| BOOK-06 | My Bookings shows user's bookings | List visible |
| BOOK-07 | Can cancel booking | Cancelled confirmation |

#### Definition of Done
- [x] All scenarios covered
- [x] Tests handle missing UI gracefully
- [x] Clear, descriptive test names

---

### TASK-006: Create Admin Functionality Test Suite

**Type**: Test
**Points**: 5
**Assignee**: AI Agent
**Priority**: P1

#### Context
Admin functionality is critical for makerspace operations.

#### Acceptance Criteria
- [x] Tests for admin panel access
- [x] Tests for pending booking approval/rejection
- [x] Tests for user management (list, search, filter)
- [x] Tests for user creation/invitation
- [x] Tests for user editing
- [x] Tests for activity log
- [x] Tests for certifications management
- [x] Tests for resource management
- [x] Tests for integration health
- [x] Tests for issue dashboard

#### Technical Details
- **Files to create**: `frontend/e2e/admin.spec.js`
- **Dependencies**: TASK-002

#### Implementation Hints
- Use AdminPage fixture for admin-specific selectors
- Test admin-only views are actually restricted
- Test CRUD operations where available

#### Definition of Done
- [x] All admin views covered
- [x] Tests use adminAuthenticatedPage fixture
- [x] Graceful handling of optional features

---

### TASK-007: Create UI/UX Test Suite

**Type**: Test
**Points**: 3
**Assignee**: AI Agent
**Priority**: P1

#### Context
UI consistency and accessibility affect user experience.

#### Acceptance Criteria
- [x] Tests for theme switching
- [x] Tests for theme persistence
- [x] Tests for help drawer
- [x] Tests for mobile navigation
- [x] Tests for keyboard accessibility
- [x] Tests for error boundaries
- [x] Tests for notification preferences
- [x] Tests for loading states
- [x] Basic performance checks

#### Technical Details
- **Files to create**: `frontend/e2e/ui.spec.js`
- **Dependencies**: TASK-002

#### Implementation Hints
- Use `test.use({ viewport })` for mobile tests
- Check localStorage for theme persistence
- Test Escape key closes modals
- Use route interception for loading state tests

#### Definition of Done
- [x] Theme tests pass
- [x] Mobile viewport tests work
- [x] Keyboard navigation tested

---

### TASK-008: Update Package.json

**Type**: Configuration
**Points**: 1
**Assignee**: AI Agent
**Priority**: P0

#### Context
Package.json needs test scripts for developer convenience.

#### Acceptance Criteria
- [x] Add Playwright as devDependency
- [x] Add test scripts:
  - `test` - Run all tests
  - `test:ui` - Interactive UI mode
  - `test:debug` - Debug mode
  - `test:headed` - Headed browser mode
  - `test:report` - View HTML report
  - Browser-specific scripts
  - Test-file-specific scripts

#### Technical Details
- **Files to modify**: `frontend/package.json`
- **Dependencies**: None

#### Implementation Hints
- Use `npx playwright` for commands
- Add `@playwright/test` ^1.40.0

#### Definition of Done
- [x] Valid JSON syntax
- [x] All scripts added
- [x] Playwright in devDependencies

---

## 3. Task Dependencies Graph

```
TASK-001 (Playwright Config)
    │
    └──▶ TASK-002 (Fixtures & Page Objects)
              │
              ├──▶ TASK-003 (Auth Setup)
              │         │
              │         └──▶ TASK-004 (Auth Tests)
              │
              ├──▶ TASK-005 (Booking Tests)
              │
              ├──▶ TASK-006 (Admin Tests)
              │
              └──▶ TASK-007 (UI Tests)

TASK-008 (Package.json) ─── No dependencies
```

---

## 4. Task Order (Recommended Sequence)

| Order | Task ID | Title | Est. Time |
|-------|---------|-------|-----------|
| 1 | TASK-001 | Playwright Config | 15 min |
| 2 | TASK-008 | Package.json | 5 min |
| 3 | TASK-002 | Fixtures & Page Objects | 45 min |
| 4 | TASK-003 | Auth Setup | 15 min |
| 5 | TASK-004 | Auth Tests | 30 min |
| 6 | TASK-005 | Booking Tests | 45 min |
| 7 | TASK-006 | Admin Tests | 45 min |
| 8 | TASK-007 | UI Tests | 30 min |

**Total Estimated Time**: ~4 hours

---

## 5. AI Agent Guidelines

### 5.1 Context Provided per Task

Each task includes:
- Exact file path to create/modify
- Dependencies on other tasks
- Code patterns to follow
- Expected output format

### 5.2 Success Criteria for AI

✅ Task is complete when:
- All acceptance criteria checked
- Code compiles/runs without errors
- Tests (if applicable) pass
- Definition of Done items complete

### 5.3 What NOT to Assume

- Don't assume previous task context is available
- Don't add features not in acceptance criteria
- Don't modify files not listed in Technical Details

---

## 6. Completion Summary

| Task | Status | Notes |
|------|--------|-------|
| TASK-001 | ✅ Done | playwright.config.js created |
| TASK-002 | ✅ Done | fixtures.js with full POM |
| TASK-003 | ✅ Done | auth.setup.js created |
| TASK-004 | ✅ Done | 12 auth tests |
| TASK-005 | ✅ Done | 15+ booking tests |
| TASK-006 | ✅ Done | 18+ admin tests |
| TASK-007 | ✅ Done | 12+ UI tests |
| TASK-008 | ✅ Done | 11 npm scripts added |

**Sprint Outcome**: All tasks completed successfully.

---

## 7. Files Created

```
frontend/
├── playwright.config.js          # TASK-001
├── package.json                   # TASK-008 (modified)
└── e2e/
    ├── fixtures.js               # TASK-002
    ├── auth.setup.js             # TASK-003
    ├── auth.spec.js              # TASK-004
    ├── bookings.spec.js          # TASK-005
    ├── admin.spec.js             # TASK-006
    └── ui.spec.js                # TASK-007
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-15 | Claude | Sprint planning |
| 1.1 | 2025-01-15 | Claude | Sprint complete |
