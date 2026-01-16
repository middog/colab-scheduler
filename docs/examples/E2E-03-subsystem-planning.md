# Subsystem Planning: E2E Test Fixtures & Page Objects

> **Status**: ✅ Complete
> **Parent TDD**: [E2E-01-technical-design-document.md](./E2E-01-technical-design-document.md)

---

## Document Info

| Field | Value |
|-------|-------|
| **Parent TDD** | E2E Testing Framework |
| **Design Review** | E2E-02-design-review.md |
| **Subsystem Name** | Test Fixtures & Page Objects |
| **Owner** | Claude |
| **Target Milestone** | v4.2.0-rc69 |

---

## 1. Subsystem Overview

### 1.1 Purpose

This subsystem provides reusable testing infrastructure:
- Page Object Model classes for UI interaction
- Test user configuration
- Extended Playwright fixtures
- Helper utilities for common operations

### 1.2 Boundaries

- **Inputs from**: Test spec files (*.spec.js)
- **Outputs to**: Playwright test runner
- **Does NOT handle**: Test assertions, specific test scenarios

### 1.3 Success Criteria

| Criteria | Measurement |
|----------|-------------|
| All page objects support key actions | Coverage of main app views |
| Fixtures reduce test boilerplate | LOC comparison |
| Helpers work across all tests | No duplicate utility code |

---

## 2. Detailed Design

### 2.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      fixtures.js                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   TEST_USERS                         │   │
│  │  { admin, superadmin, member }                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 SchedulerPage (POM)                  │   │
│  │  - Selectors for common elements                    │   │
│  │  - Navigation methods                               │   │
│  │  - Booking methods                                  │   │
│  │  - Auth methods                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  AdminPage (POM)                     │   │
│  │  extends SchedulerPage                              │   │
│  │  - User management selectors                        │   │
│  │  - Admin-specific methods                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Extended Test Fixture                   │   │
│  │  - schedulerPage fixture                            │   │
│  │  - adminPage fixture                                │   │
│  │  - authenticatedPage fixture                        │   │
│  │  - adminAuthenticatedPage fixture                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Helper Utilities                      │   │
│  │  - getToday(), getTomorrow()                        │   │
│  │  - randomEmail(), randomBookingPurpose()            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Module Specifications

#### Module: TEST_USERS

**Purpose**: Configuration for test user credentials

**Interface**:
```javascript
export const TEST_USERS = {
  admin: {
    email: string,     // From E2E_ADMIN_EMAIL env var
    password: string,  // From E2E_ADMIN_PASSWORD env var
    role: 'admin'
  },
  superadmin: {
    email: string,
    password: string,
    role: 'superadmin'
  },
  member: {
    email: string,
    password: string,
    role: 'member'
  }
};
```

**Environment Variables**:
- `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`
- `E2E_SUPERADMIN_EMAIL` / `E2E_SUPERADMIN_PASSWORD`
- `E2E_MEMBER_EMAIL` / `E2E_MEMBER_PASSWORD`

#### Module: SchedulerPage

**Purpose**: Page Object Model for main application

**Public Interface**:
```javascript
class SchedulerPage {
  constructor(page: Page);
  
  // Navigation
  async goto(): Promise<void>;
  async navigateTo(view: string): Promise<void>;
  
  // Authentication
  async login(email: string, password: string): Promise<void>;
  async loginAs(userType: 'admin' | 'member' | 'superadmin'): Promise<void>;
  async logout(): Promise<void>;
  
  // Schedule Operations
  async selectDate(date: string): Promise<void>;
  async selectTool(toolName: string): Promise<void>;
  async selectTimeSlot(time: string): Promise<void>;
  async createBooking(options: BookingOptions): Promise<void>;
  
  // UI Operations
  async toggleTheme(): Promise<void>;
  async expectMessage(type: 'success' | 'error', text?: string): Promise<void>;
  
  // Selectors (Locators)
  loginForm: Locator;
  emailInput: Locator;
  passwordInput: Locator;
  loginButton: Locator;
  navSchedule: Locator;
  navMyBookings: Locator;
  // ... more selectors
}
```

#### Module: AdminPage

**Purpose**: Extended Page Object for admin functionality

**Inheritance**: `AdminPage extends SchedulerPage`

**Additional Interface**:
```javascript
class AdminPage extends SchedulerPage {
  // User Management
  async searchUsers(query: string): Promise<void>;
  async filterByRole(role: string): Promise<void>;
  async filterByStatus(status: string): Promise<void>;
  async getUserCount(): Promise<number>;
  async openUserEdit(email: string): Promise<void>;
  
  // Selectors
  userTable: Locator;
  addUserButton: Locator;
  userSearchInput: Locator;
  roleFilter: Locator;
  statusFilter: Locator;
  pendingBookings: Locator;
  approveButton: Locator;
  rejectButton: Locator;
}
```

### 2.3 Selector Strategy

**Priority Order** (fallback chain):
1. `data-testid` attribute (most stable)
2. Accessible role/label (semantic)
3. Text content (`:has-text()`)
4. CSS class (least stable)

**Example**:
```javascript
// Flexible selector with fallbacks
this.navSchedule = page.locator(
  '[data-testid="nav-schedule"], button:has-text("Schedule")'
);
```

---

## 3. Edge Cases & Error Handling

### 3.1 Edge Cases

| Case | Scenario | Behavior |
|------|----------|----------|
| Element not found | Selector doesn't match | Playwright auto-waits, then fails |
| Auth state expired | Session times out | Re-authenticate via fixture |
| Network slow | API responses delayed | Use longer timeouts |
| Modal blocking | Unexpected modal | Click outside or Escape |

### 3.2 Error Recovery

```javascript
// Robust element interaction
async selectTimeSlot(time) {
  const slot = this.page.locator(`[data-time="${time}"], .time-slot:has-text("${time}")`);
  await expect(slot).toBeVisible({ timeout: 5000 });
  await slot.click();
}
```

---

## 4. Testing Specification

### 4.1 Fixtures Self-Testing

The fixtures are validated by using them in all test specs. If a fixture method fails, tests using it will fail.

### 4.2 Page Object Validation

Each page object method is implicitly tested by:
- `auth.spec.js` - Tests login/logout methods
- `bookings.spec.js` - Tests schedule/booking methods
- `admin.spec.js` - Tests AdminPage methods
- `ui.spec.js` - Tests UI helper methods

---

## 5. Implementation Checklist

### 5.1 Code Structure

- [x] Create `fixtures.js` with exports
- [x] Define TEST_USERS configuration
- [x] Implement SchedulerPage class
- [x] Implement AdminPage class
- [x] Create extended test fixture
- [x] Add helper utilities

### 5.2 Selector Coverage

| View | Selectors Defined |
|------|-------------------|
| Login | emailInput, passwordInput, loginButton |
| Schedule | calendarGrid, dateSelector, toolSelector, timeSlots |
| Booking | bookingModal, purposeInput, confirmBookingBtn |
| Navigation | navSchedule, navMyBookings, navAdmin, navUsers |
| UI | themeToggle, helpButton, helpDrawer |
| Admin | userTable, addUserButton, filters, modals |

### 5.3 Quality Checklist

- [x] No hardcoded credentials
- [x] Flexible selectors with fallbacks
- [x] Async/await throughout
- [x] Proper error messages
- [x] JSDoc comments

---

## 6. Dependencies

### 6.1 External Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @playwright/test | ^1.40.0 | Testing framework |

### 6.2 Internal Dependencies

| Dependency | Import Path | Usage |
|------------|-------------|-------|
| playwright/test | `@playwright/test` | Base test, expect |

---

## 7. API Reference

### 7.1 Exported Functions

```javascript
// Test users configuration
export const TEST_USERS = { ... };

// Page Object classes
export class SchedulerPage { ... }
export class AdminPage extends SchedulerPage { ... }

// Extended test fixture
export const test = base.extend({ ... });

// Re-export expect for convenience
export { expect } from '@playwright/test';

// Utility functions
export function getToday(): string;
export function getTomorrow(): string;
export function getNextWeekday(): string;
export function randomEmail(): string;
export function randomBookingPurpose(): string;
```

### 7.2 Usage Example

```javascript
import { test, expect, SchedulerPage, TEST_USERS } from './fixtures.js';

test('user can login', async ({ schedulerPage }) => {
  await schedulerPage.goto();
  await schedulerPage.loginAs('member');
  await expect(schedulerPage.page).toHaveURL(/schedule/);
});
```

---

## 8. Performance Notes

### 8.1 Fixture Overhead

| Fixture | Setup Time | Teardown |
|---------|------------|----------|
| schedulerPage | ~10ms | None |
| authenticatedPage | ~500ms | None |
| adminAuthenticatedPage | ~500ms | None |

### 8.2 Optimization

- Auth state is saved and reused across tests
- Page objects are instantiated once per test
- Selectors are defined once in constructor

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-15 | Claude | Initial implementation |
