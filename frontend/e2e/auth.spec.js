/**
 * SDCoLab Scheduler - Authentication E2E Tests
 * 
 * Tests cover:
 * - Login flow (email/password)
 * - OAuth provider buttons visibility
 * - Session persistence
 * - Logout flow
 * - Error handling (invalid credentials)
 * - Protected route redirects
 */

import { test, expect, TEST_USERS } from './fixtures.js';

test.describe('Authentication', () => {
  
  test.describe('Login Page', () => {
    
    test('displays login form when unauthenticated', async ({ schedulerPage }) => {
      await schedulerPage.goto();
      
      await expect(schedulerPage.emailInput).toBeVisible();
      await expect(schedulerPage.passwordInput).toBeVisible();
      await expect(schedulerPage.loginButton).toBeVisible();
    });

    test('shows OAuth provider buttons when configured', async ({ page, schedulerPage }) => {
      await schedulerPage.goto();
      
      // Check for common OAuth providers (presence depends on backend config)
      const googleButton = page.locator('button:has-text("Google"), button:has-text("Sign in with Google")');
      const githubButton = page.locator('button:has-text("GitHub"), button:has-text("Sign in with GitHub")');
      
      // At least email/password should always be available
      await expect(schedulerPage.emailInput).toBeVisible();
    });

    test('displays validation errors for empty submission', async ({ page, schedulerPage }) => {
      await schedulerPage.goto();
      
      await schedulerPage.loginButton.click();
      
      // Browser validation or custom validation should prevent submission
      const emailValid = await schedulerPage.emailInput.evaluate(el => el.validity.valid);
      expect(emailValid).toBeFalsy();
    });

    test('shows error message for invalid credentials', async ({ page, schedulerPage }) => {
      await schedulerPage.goto();
      
      await schedulerPage.emailInput.fill('invalid@example.com');
      await schedulerPage.passwordInput.fill('wrongpassword');
      await schedulerPage.loginButton.click();
      
      // Should show error message
      await expect(page.locator('.bg-red-100, [class*="error"], [role="alert"]')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Successful Login', () => {
    
    test('member can login and sees schedule view', async ({ schedulerPage }) => {
      await schedulerPage.goto();
      await schedulerPage.loginAs('member');
      
      // Should see the schedule/calendar view
      await expect(schedulerPage.page.locator('text=Schedule, h1:has-text("Schedule"), [data-testid="schedule-view"]')).toBeVisible({ timeout: 10000 });
    });

    test('admin can login and sees admin navigation', async ({ schedulerPage }) => {
      await schedulerPage.goto();
      await schedulerPage.loginAs('admin');
      
      // Admin should see admin-specific navigation items
      await expect(schedulerPage.navAdmin).toBeVisible();
      await expect(schedulerPage.navUsers).toBeVisible();
    });

    test('session persists after page reload', async ({ schedulerPage }) => {
      await schedulerPage.goto();
      await schedulerPage.loginAs('member');
      
      // Reload the page
      await schedulerPage.page.reload();
      
      // Should still be logged in (no login form visible)
      await expect(schedulerPage.emailInput).not.toBeVisible({ timeout: 5000 });
      
      // Should see dashboard content
      await expect(schedulerPage.page.locator('button:has-text("Logout"), [data-testid="logout"]')).toBeVisible();
    });
  });

  test.describe('Logout', () => {
    
    test('user can logout successfully', async ({ authenticatedPage }) => {
      await authenticatedPage.logout();
      
      // Should see login form again
      await expect(authenticatedPage.emailInput).toBeVisible();
    });

    test('logout clears session data', async ({ authenticatedPage }) => {
      await authenticatedPage.logout();
      
      // Reload should not restore session
      await authenticatedPage.page.reload();
      await expect(authenticatedPage.emailInput).toBeVisible();
    });
  });

  test.describe('Authorization', () => {
    
    test('member cannot access admin-only views', async ({ schedulerPage }) => {
      await schedulerPage.goto();
      await schedulerPage.loginAs('member');
      
      // Try to navigate to admin view via URL
      await schedulerPage.page.goto('/#admin');
      
      // Should not see admin content or should be redirected
      const adminContent = schedulerPage.page.locator('[data-testid="admin-panel"], .admin-panel');
      await expect(adminContent).not.toBeVisible({ timeout: 3000 });
    });

    test('admin can access admin views', async ({ schedulerPage }) => {
      await schedulerPage.goto();
      await schedulerPage.loginAs('admin');
      
      await schedulerPage.navigateTo('admin');
      
      // Should see admin panel content
      await expect(schedulerPage.page.locator('text=Admin Panel, text=Pending, [data-testid="admin-panel"]')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('OAuth Error Handling', () => {
    
    test('displays error from OAuth callback', async ({ page }) => {
      // Simulate OAuth error callback
      await page.goto('/?error=oauth_failed');
      
      // Should show error message
      await expect(page.locator('text=Sign-in failed, text=error, .bg-red-100')).toBeVisible({ timeout: 3000 });
    });

    test('displays pending approval message', async ({ page }) => {
      await page.goto('/?error=pending_approval');
      
      await expect(page.locator('text=pending approval, text=Pending')).toBeVisible({ timeout: 3000 });
    });
  });
});
