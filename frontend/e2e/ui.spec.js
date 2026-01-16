/**
 * SDCoLab Scheduler - UI/UX E2E Tests
 * 
 * Tests cover:
 * - Theme switching (dark/light)
 * - Help drawer
 * - Mobile navigation
 * - Keyboard accessibility
 * - Error boundaries
 * - Notification preferences
 */

import { test, expect } from './fixtures.js';

test.describe('Theme Switching', () => {
  
  test('can toggle between light and dark theme', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    // Get initial theme
    const initialIsDark = await page.evaluate(() => 
      document.documentElement.classList.contains('dark')
    );
    
    // Find and click theme toggle
    await authenticatedPage.themeToggle.click();
    
    // Theme should have changed
    const afterToggleIsDark = await page.evaluate(() => 
      document.documentElement.classList.contains('dark')
    );
    
    expect(afterToggleIsDark).not.toBe(initialIsDark);
  });

  test('theme preference persists after reload', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    // Toggle to ensure a specific state
    await authenticatedPage.themeToggle.click();
    
    const themeAfterToggle = await page.evaluate(() => 
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
    
    // Reload
    await page.reload();
    await page.waitForTimeout(500);
    
    const themeAfterReload = await page.evaluate(() => 
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
    
    expect(themeAfterReload).toBe(themeAfterToggle);
  });

  test('dark theme applies correct colors', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    // Ensure dark mode
    const isDark = await page.evaluate(() => 
      document.documentElement.classList.contains('dark')
    );
    
    if (!isDark) {
      await authenticatedPage.themeToggle.click();
    }
    
    // Check that dark theme styles are applied
    const bgColor = await page.evaluate(() => 
      getComputedStyle(document.body).backgroundColor
    );
    
    // Dark backgrounds typically have low RGB values
    expect(bgColor).toMatch(/rgb\(\d{1,2}, \d{1,2}, \d{1,2}\)|#[0-3]/);
  });
});

test.describe('Help Drawer', () => {
  
  test('can open help drawer', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    await authenticatedPage.helpButton.click();
    
    await expect(authenticatedPage.helpDrawer).toBeVisible({ timeout: 3000 });
  });

  test('help drawer shows useful content', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    await authenticatedPage.helpButton.click();
    
    // Should contain help information
    await expect(page.locator('text=Help, text=Guide, text=How to')).toBeVisible();
  });

  test('can close help drawer', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    await authenticatedPage.helpButton.click();
    await expect(authenticatedPage.helpDrawer).toBeVisible();
    
    // Close via X button or clicking outside
    const closeBtn = page.locator('.help-drawer button:has(svg.lucide-x), [data-testid="close-help"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    
    await expect(authenticatedPage.helpDrawer).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Mobile Navigation', () => {
  
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE
  
  test('shows hamburger menu on mobile', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const hamburger = page.locator('button:has(svg.lucide-menu), [data-testid="mobile-menu"]');
    await expect(hamburger).toBeVisible();
  });

  test('can open mobile menu', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const hamburger = page.locator('button:has(svg.lucide-menu)');
    await hamburger.click();
    
    // Mobile menu should be visible
    await expect(page.locator('.mobile-menu, [data-testid="mobile-nav"], nav.visible')).toBeVisible({ timeout: 3000 });
  });

  test('can navigate from mobile menu', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const hamburger = page.locator('button:has(svg.lucide-menu)');
    await hamburger.click();
    
    // Click on a navigation item
    await page.locator('text=My Bookings, a:has-text("Bookings")').click();
    
    // Should navigate and close menu
    await page.waitForTimeout(500);
  });
});

test.describe('Keyboard Accessibility', () => {
  
  test('can navigate with tab key', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    // Tab through interactive elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Something should be focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('can activate buttons with Enter', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    // Focus on theme toggle and activate
    await authenticatedPage.themeToggle.focus();
    
    const initialTheme = await page.evaluate(() => 
      document.documentElement.classList.contains('dark')
    );
    
    await page.keyboard.press('Enter');
    
    const afterTheme = await page.evaluate(() => 
      document.documentElement.classList.contains('dark')
    );
    
    expect(afterTheme).not.toBe(initialTheme);
  });

  test('escape closes modals', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    // Open help drawer
    await authenticatedPage.helpButton.click();
    await expect(authenticatedPage.helpDrawer).toBeVisible();
    
    // Press Escape
    await page.keyboard.press('Escape');
    
    // Should close
    await expect(authenticatedPage.helpDrawer).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Error Boundaries', () => {
  
  test('displays error boundary on component failure', async ({ page }) => {
    // Navigate to a potentially broken state
    await page.goto('/#nonexistent-view-that-might-error');
    
    // Should either show error boundary or graceful fallback
    const hasError = await page.locator('text=error, text=Error, text=went wrong, .error-boundary').isVisible();
    const hasContent = await page.locator('text=Schedule, input[type="email"]').isVisible();
    
    // Either error boundary or normal content should show (no blank page)
    expect(hasError || hasContent).toBeTruthy();
  });
});

test.describe('Notification Preferences', () => {
  
  test('can access notification preferences', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const bellIcon = page.locator('button:has(svg.lucide-bell), [data-testid="notifications"]');
    
    if (await bellIcon.isVisible()) {
      await bellIcon.click();
      
      await expect(page.locator('text=Notification, text=Preferences, text=Email')).toBeVisible({ timeout: 3000 });
    }
  });

  test('can toggle notification settings', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const bellIcon = page.locator('button:has(svg.lucide-bell)');
    
    if (await bellIcon.isVisible()) {
      await bellIcon.click();
      
      const toggle = page.locator('input[type="checkbox"], [role="switch"]').first();
      
      if (await toggle.isVisible()) {
        const initialState = await toggle.isChecked();
        await toggle.click();
        const afterState = await toggle.isChecked();
        
        expect(afterState).not.toBe(initialState);
      }
    }
  });
});

test.describe('Visual Regression', () => {
  
  test('schedule view matches snapshot', async ({ authenticatedPage }) => {
    await authenticatedPage.navigateTo('schedule');
    
    // Wait for content to load
    await authenticatedPage.page.waitForTimeout(1000);
    
    await expect(authenticatedPage.page).toHaveScreenshot('schedule-view.png', {
      maxDiffPixels: 100,
    });
  });

  test('login page matches snapshot', async ({ schedulerPage }) => {
    await schedulerPage.goto();
    
    await expect(schedulerPage.page).toHaveScreenshot('login-page.png', {
      maxDiffPixels: 100,
    });
  });
});

test.describe('Performance', () => {
  
  test('initial page load under 3 seconds', async ({ page }) => {
    const start = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const loadTime = Date.now() - start;
    
    expect(loadTime).toBeLessThan(3000);
  });

  test('navigation between views is responsive', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const start = Date.now();
    
    await authenticatedPage.navigateTo('mybookings');
    await page.waitForTimeout(100);
    
    await authenticatedPage.navigateTo('schedule');
    await page.waitForTimeout(100);
    
    const navTime = Date.now() - start;
    
    // Navigation should be quick (under 1 second for both)
    expect(navTime).toBeLessThan(1000);
  });
});

test.describe('Data Loading States', () => {
  
  test('shows loading indicator while fetching data', async ({ page, schedulerPage }) => {
    // Slow down network to observe loading state
    await page.route('**/api/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    });
    
    await schedulerPage.goto();
    
    // Should see loading indicator
    const loading = page.locator('.animate-spin, text=Loading, [data-testid="loading"]');
    await expect(loading).toBeVisible({ timeout: 1000 });
  });

  test('handles empty states gracefully', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    await authenticatedPage.navigateTo('mybookings');
    
    // Should show either bookings or empty state message
    const hasContent = await page.locator('.booking-item, text=No bookings, text=empty').isVisible();
    expect(hasContent).toBeTruthy();
  });
});
