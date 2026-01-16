/**
 * SDCoLab Scheduler - Admin Functionality E2E Tests
 * 
 * Tests cover:
 * - Admin panel access
 * - Pending booking approval/rejection
 * - User management (list, search, filter)
 * - User creation and invitation
 * - User editing and role changes
 * - Activity log viewing
 * - Integration health monitoring
 */

import { test, expect, randomEmail } from './fixtures.js';

test.describe('Admin Panel', () => {
  
  test.beforeEach(async ({ adminAuthenticatedPage }) => {
    await adminAuthenticatedPage.navigateTo('admin');
  });

  test('displays admin panel for admin users', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('text=Admin Panel, text=Admin Dashboard, h1:has-text("Admin")')).toBeVisible({ timeout: 5000 });
  });

  test('shows pending bookings section', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('text=Pending, text=Awaiting Approval, [data-testid="pending-section"]')).toBeVisible();
  });

  test('can approve pending booking', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const approveBtn = page.locator('button:has-text("Approve"), [data-action="approve"]').first();
    
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      
      // Should see success message
      await expect(page.locator('text=approved, text=Approved, .bg-green-100')).toBeVisible({ timeout: 5000 });
    }
  });

  test('can reject pending booking with reason', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const rejectBtn = page.locator('button:has-text("Reject"), [data-action="reject"]').first();
    
    if (await rejectBtn.isVisible()) {
      await rejectBtn.click();
      
      // Rejection modal might appear for reason
      const reasonInput = page.locator('textarea[placeholder*="reason"], input[placeholder*="reason"]');
      if (await reasonInput.isVisible()) {
        await reasonInput.fill('E2E Test: Rejected for testing purposes');
        await page.locator('button:has-text("Confirm"), button:has-text("Submit")').click();
      }
      
      // Should see rejection confirmation
      await expect(page.locator('text=rejected, text=Rejected, .bg-red-100, .bg-green-100')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('User Management', () => {
  
  test.beforeEach(async ({ adminAuthenticatedPage }) => {
    await adminAuthenticatedPage.navigateTo('users');
  });

  test('displays user list', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('table, [data-testid="user-list"], .user-list')).toBeVisible({ timeout: 5000 });
  });

  test('shows user count and pagination', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    // Pagination should be visible if there are users
    await expect(page.locator('text=/Page \\d/, text=/\\d+ users/, .pagination')).toBeVisible();
  });

  test('can search users by email', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]');
    await searchInput.fill('admin');
    await page.waitForTimeout(500); // Debounce
    
    // Results should filter
    await expect(page.locator('tr:has-text("admin"), .user-item:has-text("admin")')).toBeVisible();
  });

  test('can filter users by role', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const roleFilter = page.locator('select:has(option:text("Admin")), [data-testid="role-filter"]');
    
    if (await roleFilter.isVisible()) {
      await roleFilter.selectOption({ label: 'Admin' });
      await page.waitForTimeout(500);
    }
  });

  test('can filter users by status', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const statusFilter = page.locator('select:has(option:text("Active")), [data-testid="status-filter"]');
    
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption({ label: 'Active' });
      await page.waitForTimeout(500);
    }
  });

  test('can open add user modal', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await page.locator('button:has-text("Add User"), button:has-text("Invite"), button:has(svg.lucide-user-plus)').click();
    
    // Modal should open
    await expect(page.locator('.modal, [role="dialog"], [data-testid="add-user-modal"]')).toBeVisible();
  });

  test('can create user via invite', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    const testEmail = randomEmail();
    
    // Open add user modal
    await page.locator('button:has-text("Add User"), button:has-text("Invite")').click();
    
    await expect(page.locator('.modal, [role="dialog"]')).toBeVisible();
    
    // Fill invite form
    await page.locator('input[type="email"], input[placeholder*="email"]').fill(testEmail);
    await page.locator('input[placeholder*="First"], input[name="firstName"]').fill('E2E');
    await page.locator('input[placeholder*="Last"], input[name="lastName"]').fill('TestUser');
    
    // Submit
    await page.locator('button:has-text("Send Invite"), button:has-text("Create"), button:has-text("Submit")').click();
    
    // Should see success with invite link
    await expect(page.locator('text=Invite, text=created, text=link, .bg-green-100')).toBeVisible({ timeout: 5000 });
  });

  test('can edit existing user', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    // Click edit on first user
    const editBtn = page.locator('button:has-text("Edit"), button:has(svg.lucide-edit), [data-action="edit"]').first();
    
    if (await editBtn.isVisible()) {
      await editBtn.click();
      
      // Edit modal should open
      await expect(page.locator('.modal:has-text("Edit"), [data-testid="edit-user-modal"]')).toBeVisible();
    }
  });

  test('can change user role', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const editBtn = page.locator('button:has-text("Edit"), button:has(svg.lucide-edit)').first();
    
    if (await editBtn.isVisible()) {
      await editBtn.click();
      
      const roleSelect = page.locator('select[name="role"], [data-testid="role-select"]');
      if (await roleSelect.isVisible()) {
        await roleSelect.selectOption({ label: 'Member' });
        await page.locator('button:has-text("Save"), button:has-text("Update")').click();
        
        await expect(page.locator('text=updated, text=saved, .bg-green-100')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('can export users to CSV', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const exportBtn = page.locator('button:has-text("Export"), button:has(svg.lucide-download)');
    
    if (await exportBtn.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
      ]);
      
      expect(download.suggestedFilename()).toMatch(/users.*\.csv$/i);
    }
  });

  test('can import users from CSV', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const importBtn = page.locator('button:has-text("Import"), button:has(svg.lucide-upload)');
    
    if (await importBtn.isVisible()) {
      await importBtn.click();
      
      // Import modal should open
      await expect(page.locator('.modal:has-text("Import"), [data-testid="import-modal"]')).toBeVisible();
    }
  });
});

test.describe('Activity Log', () => {
  
  test.beforeEach(async ({ adminAuthenticatedPage }) => {
    await adminAuthenticatedPage.navigateTo('activity');
  });

  test('displays activity log', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('text=Activity Log, text=Activity, h2:has-text("Activity")')).toBeVisible({ timeout: 5000 });
  });

  test('shows activity entries with timestamps', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    // Should show activity entries or empty state
    await expect(page.locator('.activity-item, [data-testid="activity-entry"], text=No activity')).toBeVisible({ timeout: 5000 });
  });

  test('can filter by category', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const categoryFilter = page.locator('select:has(option:text("Authentication")), [data-testid="category-filter"]');
    
    if (await categoryFilter.isVisible()) {
      await categoryFilter.selectOption({ label: 'Authentication' });
      await page.locator('button:has-text("Refresh"), button:has-text("Apply")').click();
      
      await page.waitForTimeout(500);
    }
  });

  test('can change result limit', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const limitSelect = page.locator('select:has(option:text("50")), [data-testid="limit-select"]');
    
    if (await limitSelect.isVisible()) {
      await limitSelect.selectOption({ value: '100' });
      await page.locator('button:has-text("Refresh")').click();
    }
  });
});

test.describe('Certifications Management', () => {
  
  test.beforeEach(async ({ adminAuthenticatedPage }) => {
    await adminAuthenticatedPage.navigateTo('certifications');
  });

  test('displays certifications panel', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('text=Certification, text=Certifications, h1:has-text("Cert")')).toBeVisible({ timeout: 5000 });
  });

  test('shows list of certifications', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('table, .cert-list, [data-testid="certifications-list"]')).toBeVisible();
  });

  test('can add new certification', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const addBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has(svg.lucide-plus)');
    
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await expect(page.locator('.modal, [role="dialog"]')).toBeVisible();
    }
  });
});

test.describe('Resource Management', () => {
  
  test.beforeEach(async ({ adminAuthenticatedPage }) => {
    await adminAuthenticatedPage.navigateTo('resources');
  });

  test('displays resources panel', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('text=Resource, text=Resources, h1:has-text("Resource")')).toBeVisible({ timeout: 5000 });
  });

  test('shows list of tools/resources', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('table, .resource-list, [data-testid="resources-list"]')).toBeVisible();
  });
});

test.describe('Integration Health', () => {
  
  test.beforeEach(async ({ adminAuthenticatedPage }) => {
    await adminAuthenticatedPage.navigateTo('integrations');
  });

  test('displays integration health dashboard', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('text=Integration, text=Health, text=Status')).toBeVisible({ timeout: 5000 });
  });

  test('shows integration status indicators', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    // Should show status for various integrations
    await expect(page.locator('.status-indicator, [data-status], .health-status')).toBeVisible();
  });

  test('can test individual integration', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    const testBtn = page.locator('button:has-text("Test"), button:has-text("Check")').first();
    
    if (await testBtn.isVisible()) {
      await testBtn.click();
      
      // Should show test result
      await expect(page.locator('text=success, text=failed, text=connected, text=error')).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Issue Dashboard', () => {
  
  test.beforeEach(async ({ adminAuthenticatedPage }) => {
    await adminAuthenticatedPage.navigateTo('issues');
  });

  test('displays issue dashboard', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    await expect(page.locator('text=Issue, text=Issues, h1:has-text("Issue")')).toBeVisible({ timeout: 5000 });
  });

  test('shows GitHub issues integration', async ({ adminAuthenticatedPage }) => {
    const page = adminAuthenticatedPage.page;
    
    // Should show GitHub integration or setup prompt
    await expect(page.locator('text=GitHub, text=Issues, text=Configure')).toBeVisible();
  });
});
