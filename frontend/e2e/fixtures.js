/**
 * SDCoLab Scheduler - E2E Test Fixtures & Helpers
 * 
 * Provides reusable test utilities, page objects, and authentication helpers.
 */

import { test as base, expect } from '@playwright/test';

// ============================================================================
// Test User Credentials (for local/staging environments)
// Fire Triangle Roles: participant, tender, operator
// ============================================================================

export const TEST_USERS = {
  operator: {
    email: process.env.E2E_OPERATOR_EMAIL || process.env.E2E_SUPERADMIN_EMAIL || 'operator@test.local',
    password: process.env.E2E_OPERATOR_PASSWORD || process.env.E2E_SUPERADMIN_PASSWORD || 'TestOperator123!',
    role: 'operator',
  },
  tender: {
    email: process.env.E2E_TENDER_EMAIL || process.env.E2E_ADMIN_EMAIL || 'tender@test.local',
    password: process.env.E2E_TENDER_PASSWORD || process.env.E2E_ADMIN_PASSWORD || 'TestTender123!',
    role: 'tender',
  },
  participant: {
    email: process.env.E2E_PARTICIPANT_EMAIL || process.env.E2E_MEMBER_EMAIL || 'participant@test.local',
    password: process.env.E2E_PARTICIPANT_PASSWORD || process.env.E2E_MEMBER_PASSWORD || 'TestParticipant123!',
    role: 'participant',
  },
  // Legacy aliases for backward compatibility
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'tender@test.local',
    password: process.env.E2E_ADMIN_PASSWORD || 'TestTender123!',
    role: 'tender',
  },
  superadmin: {
    email: process.env.E2E_SUPERADMIN_EMAIL || 'operator@test.local',
    password: process.env.E2E_SUPERADMIN_PASSWORD || 'TestOperator123!',
    role: 'operator',
  },
  member: {
    email: process.env.E2E_MEMBER_EMAIL || 'participant@test.local',
    password: process.env.E2E_MEMBER_PASSWORD || 'TestParticipant123!',
    role: 'participant',
  },
};

// ============================================================================
// Page Object Models
// ============================================================================

export class SchedulerPage {
  constructor(page) {
    this.page = page;
    
    // Selectors
    this.loginForm = page.locator('form');
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.loginButton = page.locator('button:has-text("Sign In"), button:has-text("Login")');
    
    // Navigation - Fire Triangle groups
    this.navSchedule = page.locator('[data-testid="nav-schedule"], button:has-text("Schedule")');
    this.navMyBookings = page.locator('[data-testid="nav-mybookings"], button:has-text("My Bookings")');
    this.navPeople = page.locator('[data-testid="nav-people"], button:has-text("People")');
    this.navResources = page.locator('[data-testid="nav-resources"], button:has-text("Resources")');
    // Legacy aliases
    this.navAdmin = this.navPeople;
    this.navUsers = this.navPeople;
    
    // Schedule view elements
    this.calendarGrid = page.locator('[data-testid="calendar-grid"], .calendar-grid');
    this.dateSelector = page.locator('[data-testid="date-selector"], .date-selector');
    this.toolSelector = page.locator('[data-testid="tool-selector"], select:has-text("Tool")');
    this.timeSlots = page.locator('[data-testid="time-slot"], .time-slot');
    
    // Booking elements
    this.bookingModal = page.locator('[data-testid="booking-modal"], .booking-modal');
    this.purposeInput = page.locator('textarea[placeholder*="purpose"], input[placeholder*="purpose"]');
    this.confirmBookingBtn = page.locator('button:has-text("Confirm"), button:has-text("Book")');
    
    // Messages
    this.successMessage = page.locator('.bg-green-100, [data-testid="success-message"]');
    this.errorMessage = page.locator('.bg-red-100, [data-testid="error-message"]');
    
    // Theme toggle
    this.themeToggle = page.locator('[data-testid="theme-toggle"], button:has(svg.lucide-sun), button:has(svg.lucide-moon)');
    
    // Help drawer
    this.helpButton = page.locator('[data-testid="help-button"], button:has(svg.lucide-help-circle)');
    this.helpDrawer = page.locator('[data-testid="help-drawer"], .help-drawer');
  }

  async goto() {
    await this.page.goto('/');
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    // Wait for navigation or dashboard to appear
    await this.page.waitForSelector('[data-testid="user-menu"], .user-menu, button:has-text("Logout")', { timeout: 10000 });
  }

  async loginAs(userType) {
    const user = TEST_USERS[userType];
    if (!user) throw new Error(`Unknown user type: ${userType}`);
    await this.login(user.email, user.password);
  }

  async logout() {
    await this.page.locator('button:has-text("Logout"), button:has(svg.lucide-log-out)').click();
    await this.page.waitForSelector('input[type="email"]', { timeout: 5000 });
  }

  async navigateTo(view) {
    // Map legacy views to new Fire Triangle routes
    const routeMap = {
      schedule: { group: 'oxygen', view: 'schedule' },
      mybookings: { group: 'oxygen', view: 'bookings' },
      bookings: { group: 'oxygen', view: 'bookings' },
      certifications: { group: 'oxygen', view: 'certifications' },
      admin: { group: 'heat', view: 'people' },
      users: { group: 'heat', view: 'people' },
      people: { group: 'heat', view: 'people' },
      activity: { group: 'heat', view: 'activity' },
      issues: { group: 'heat', view: 'issues' },
      resources: { group: 'fuel', view: 'resources' },
      'tool-config': { group: 'fuel', view: 'tool-config' },
      integrations: { group: 'system', view: 'integrations' },
      templates: { group: 'system', view: 'templates' },
    };
    
    const route = routeMap[view];
    if (route) {
      await this.page.goto(`/#${route.group}/${route.view}`);
    } else {
      // Fallback to legacy hash navigation
      await this.page.goto(`/#${view}`);
    }
    await this.page.waitForTimeout(300); // Allow view transition
  }

  async selectDate(date) {
    // date format: YYYY-MM-DD
    await this.dateSelector.click();
    await this.page.locator(`[data-date="${date}"]`).click();
  }

  async selectTool(toolName) {
    await this.toolSelector.selectOption({ label: toolName });
  }

  async selectTimeSlot(time) {
    await this.page.locator(`[data-time="${time}"], .time-slot:has-text("${time}")`).click();
  }

  async createBooking(options = {}) {
    const { tool, date, time, purpose = 'E2E Test Booking' } = options;
    
    if (date) await this.selectDate(date);
    if (tool) await this.selectTool(tool);
    if (time) await this.selectTimeSlot(time);
    
    await this.purposeInput.fill(purpose);
    await this.confirmBookingBtn.click();
  }

  async expectMessage(type, textContains = null) {
    const selector = type === 'success' ? this.successMessage : this.errorMessage;
    await expect(selector).toBeVisible({ timeout: 5000 });
    if (textContains) {
      await expect(selector).toContainText(textContains);
    }
  }

  async toggleTheme() {
    const initialTheme = await this.page.evaluate(() => 
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
    await this.themeToggle.click();
    await this.page.waitForFunction(
      (initial) => document.documentElement.classList.contains('dark') !== (initial === 'dark'),
      initialTheme
    );
  }
}

// ============================================================================
// Admin Page Object
// ============================================================================

export class AdminPage extends SchedulerPage {
  constructor(page) {
    super(page);
    
    // User management
    this.userTable = page.locator('[data-testid="user-table"], table');
    this.addUserButton = page.locator('button:has-text("Add User"), button:has-text("Invite")');
    this.userSearchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]');
    this.userRows = page.locator('tbody tr, [data-testid="user-row"]');
    
    // Filters
    this.roleFilter = page.locator('select:has-text("Role"), [data-testid="role-filter"]');
    this.statusFilter = page.locator('select:has-text("Status"), [data-testid="status-filter"]');
    
    // User modals
    this.addUserModal = page.locator('[data-testid="add-user-modal"]');
    this.editUserModal = page.locator('[data-testid="edit-user-modal"]');
    
    // Pending approvals
    this.pendingBookings = page.locator('[data-testid="pending-bookings"]');
    this.approveButton = page.locator('button:has-text("Approve")');
    this.rejectButton = page.locator('button:has-text("Reject")');
  }

  async searchUsers(query) {
    await this.userSearchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce
  }

  async filterByRole(role) {
    await this.roleFilter.selectOption({ label: role });
    await this.page.waitForTimeout(300);
  }

  async filterByStatus(status) {
    await this.statusFilter.selectOption({ label: status });
    await this.page.waitForTimeout(300);
  }

  async getUserCount() {
    return await this.userRows.count();
  }

  async openUserEdit(email) {
    await this.page.locator(`tr:has-text("${email}") button:has-text("Edit")`).click();
    await expect(this.editUserModal).toBeVisible();
  }
}

// ============================================================================
// Extended Test Fixture
// ============================================================================

export const test = base.extend({
  schedulerPage: async ({ page }, use) => {
    const schedulerPage = new SchedulerPage(page);
    await use(schedulerPage);
  },
  
  adminPage: async ({ page }, use) => {
    const adminPage = new AdminPage(page);
    await use(adminPage);
  },
  
  authenticatedPage: async ({ page }, use) => {
    const schedulerPage = new SchedulerPage(page);
    await schedulerPage.goto();
    await schedulerPage.loginAs('member');
    await use(schedulerPage);
  },
  
  adminAuthenticatedPage: async ({ page }, use) => {
    const adminPage = new AdminPage(page);
    await adminPage.goto();
    await adminPage.loginAs('admin');
    await use(adminPage);
  },
});

export { expect } from '@playwright/test';

// ============================================================================
// Utility Functions
// ============================================================================

export function getToday() {
  return new Date().toISOString().split('T')[0];
}

export function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export function getNextWeekday() {
  const d = new Date();
  const day = d.getDay();
  const daysToAdd = day === 5 ? 3 : day === 6 ? 2 : 1;
  d.setDate(d.getDate() + daysToAdd);
  return d.toISOString().split('T')[0];
}

export function randomEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.test`;
}

export function randomBookingPurpose() {
  const purposes = [
    'E2E Test: Laser cutting project',
    'E2E Test: 3D printing prototype',
    'E2E Test: CNC milling test',
    'E2E Test: Electronics soldering',
    'E2E Test: Woodworking practice',
  ];
  return purposes[Math.floor(Math.random() * purposes.length)];
}
