/**
 * SDCoLab Scheduler - Authentication Setup
 * 
 * This setup file runs before tests to establish authenticated sessions.
 * It stores auth state that can be reused across test files.
 */

import { test as setup } from '@playwright/test';
import { TEST_USERS, SchedulerPage } from './fixtures.js';
import path from 'path';

const authFile = path.join(import.meta.dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Skip if no test credentials configured
  if (!TEST_USERS.member.email || TEST_USERS.member.email.includes('test.local')) {
    console.log('⚠️  Using default test credentials. Set E2E_MEMBER_EMAIL and E2E_MEMBER_PASSWORD for real auth.');
    
    // For local development, we might want to create a mock auth state
    // or skip auth setup entirely if using a test backend
    return;
  }

  const schedulerPage = new SchedulerPage(page);
  
  await schedulerPage.goto();
  await schedulerPage.login(TEST_USERS.member.email, TEST_USERS.member.password);
  
  // Save auth state
  await page.context().storageState({ path: authFile });
});

setup('authenticate admin', async ({ page }) => {
  if (!TEST_USERS.admin.email || TEST_USERS.admin.email.includes('test.local')) {
    console.log('⚠️  Using default admin test credentials.');
    return;
  }

  const schedulerPage = new SchedulerPage(page);
  
  await schedulerPage.goto();
  await schedulerPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
  
  // Save admin auth state
  await page.context().storageState({ path: path.join(import.meta.dirname, '../.auth/admin.json') });
});
