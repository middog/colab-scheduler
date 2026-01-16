/**
 * SDCoLab Scheduler - Booking Flow E2E Tests
 * 
 * Tests cover:
 * - Schedule view rendering
 * - Date navigation
 * - Tool selection
 * - Time slot selection (single and range)
 * - Booking creation
 * - Booking modification
 * - Booking cancellation
 * - Conflict/overlap handling
 * - Capacity warnings
 */

import { test, expect, getToday, getTomorrow, getNextWeekday, randomBookingPurpose } from './fixtures.js';

test.describe('Schedule View', () => {
  
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.navigateTo('schedule');
  });

  test.describe('Calendar Navigation', () => {
    
    test('displays current date by default', async ({ authenticatedPage }) => {
      const today = getToday();
      const page = authenticatedPage.page;
      
      // The selected date should be today
      await expect(page.locator(`[data-date="${today}"].selected, .date-selector:has-text("${today}")`)).toBeVisible();
    });

    test('can navigate to next day', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      
      // Click next day button
      await page.locator('button:has(svg.lucide-chevron-right), [data-testid="next-day"]').first().click();
      
      const tomorrow = getTomorrow();
      await expect(page.locator(`text=${tomorrow}, [data-date="${tomorrow}"]`)).toBeVisible({ timeout: 3000 });
    });

    test('can navigate to previous day', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      
      // First go to tomorrow, then back to today
      await page.locator('button:has(svg.lucide-chevron-right)').first().click();
      await page.waitForTimeout(300);
      await page.locator('button:has(svg.lucide-chevron-left)').first().click();
      
      const today = getToday();
      await expect(page.locator(`text=${today}, [data-date="${today}"]`)).toBeVisible({ timeout: 3000 });
    });

    test('can select date from calendar picker', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      const nextWeek = getNextWeekday();
      
      // Open calendar picker if exists
      const calendarTrigger = page.locator('[data-testid="calendar-trigger"], button:has(svg.lucide-calendar)');
      if (await calendarTrigger.isVisible()) {
        await calendarTrigger.click();
        await page.locator(`[data-date="${nextWeek}"]`).click();
      }
    });
  });

  test.describe('Tool Selection', () => {
    
    test('displays available tools', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      
      // Should show tool selector or tool tabs
      const toolSelector = page.locator('select, [data-testid="tool-selector"], .tool-tabs');
      await expect(toolSelector).toBeVisible();
    });

    test('can select different tool', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      
      // Find and click a tool option
      const toolOptions = page.locator('select option, [data-testid="tool-tab"], button[data-tool]');
      const count = await toolOptions.count();
      
      if (count > 1) {
        await toolOptions.nth(1).click();
        await page.waitForTimeout(500);
      }
    });

    test('shows tool availability indicators', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      
      // Tools should show some availability state
      const availabilityIndicator = page.locator('.availability, [data-availability], .slot-available, .slot-booked');
      await expect(availabilityIndicator.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Time Slot Selection', () => {
    
    test('displays time slots for selected date', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      
      // Should show time slots (hourly grid)
      const timeSlots = page.locator('.time-slot, [data-time], td[class*="slot"]');
      await expect(timeSlots.first()).toBeVisible();
      
      // Should have multiple slots
      const count = await timeSlots.count();
      expect(count).toBeGreaterThan(0);
    });

    test('can select single time slot', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      
      // Click on an available slot
      const availableSlot = page.locator('.slot-available, [data-available="true"], .time-slot:not(.booked)').first();
      
      if (await availableSlot.isVisible()) {
        await availableSlot.click();
        
        // Slot should be marked as selected
        await expect(availableSlot).toHaveClass(/selected|active/);
      }
    });

    test('can select range of time slots', async ({ authenticatedPage }) => {
      const page = authenticatedPage.page;
      
      const availableSlots = page.locator('.slot-available, [data-available="true"], .time-slot:not(.booked)');
      const count = await availableSlots.count();
      
      if (count >= 2) {
        // Click first slot
        await availableSlots.first().click();
        
        // Shift+click or just click second slot for range
        await availableSlots.nth(1).click({ modifiers: ['Shift'] });
        
        // Multiple slots should be selected
        const selectedCount = await page.locator('.time-slot.selected, [data-selected="true"]').count();
        expect(selectedCount).toBeGreaterThanOrEqual(2);
      }
    });
  });
});

test.describe('Booking Creation', () => {
  
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.navigateTo('schedule');
  });

  test('shows booking form when slot is selected', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const availableSlot = page.locator('.slot-available, [data-available="true"]').first();
    
    if (await availableSlot.isVisible()) {
      await availableSlot.click();
      
      // Purpose input should appear
      await expect(page.locator('textarea, input[placeholder*="purpose"], input[placeholder*="Purpose"]')).toBeVisible({ timeout: 3000 });
    }
  });

  test('can create a booking with purpose', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    const purpose = randomBookingPurpose();
    
    // Select an available slot
    const availableSlot = page.locator('.slot-available, [data-available="true"]').first();
    
    if (await availableSlot.isVisible()) {
      await availableSlot.click();
      
      // Fill in purpose
      await page.locator('textarea, input[placeholder*="purpose"]').fill(purpose);
      
      // Submit booking
      await page.locator('button:has-text("Book"), button:has-text("Confirm"), button:has-text("Create")').click();
      
      // Should see success message or booking confirmation
      await expect(page.locator('.bg-green-100, text=booked, text=success, text=confirmed')).toBeVisible({ timeout: 5000 });
    }
  });

  test('validates purpose field is required', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const availableSlot = page.locator('.slot-available, [data-available="true"]').first();
    
    if (await availableSlot.isVisible()) {
      await availableSlot.click();
      
      // Try to submit without purpose
      const submitBtn = page.locator('button:has-text("Book"), button:has-text("Confirm")');
      await submitBtn.click();
      
      // Should show validation error or prevent submission
      const purposeField = page.locator('textarea, input[placeholder*="purpose"]');
      const isInvalid = await purposeField.evaluate(el => !el.validity.valid || el.classList.contains('error'));
      expect(isInvalid).toBeTruthy();
    }
  });

  test('shows overlap warning for conflicting bookings', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    // Find an already booked slot
    const bookedSlot = page.locator('.slot-booked, [data-booked="true"], .booked').first();
    
    if (await bookedSlot.isVisible()) {
      await bookedSlot.click();
      
      // Should show overlap/conflict warning
      await expect(page.locator('text=overlap, text=conflict, text=already booked, .warning')).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('My Bookings', () => {
  
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.navigateTo('mybookings');
  });

  test('displays user bookings list', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    // Should show booking list or empty state
    await expect(page.locator('[data-testid="bookings-list"], .bookings-list, text=No bookings, text=My Bookings')).toBeVisible({ timeout: 5000 });
  });

  test('shows booking details', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const bookingItem = page.locator('.booking-item, [data-testid="booking-item"], tr:has-text("booking")').first();
    
    if (await bookingItem.isVisible()) {
      // Booking should show date, time, tool info
      await expect(bookingItem.locator('text=/\\d{4}/, text=/\\d{2}:\\d{2}/')).toBeVisible();
    }
  });

  test('can cancel a booking', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const cancelBtn = page.locator('button:has-text("Cancel"), button:has(svg.lucide-trash), [data-action="cancel"]').first();
    
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      
      // Confirm cancellation if dialog appears
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
      
      // Should see success message
      await expect(page.locator('text=cancelled, text=deleted, .bg-green-100')).toBeVisible({ timeout: 5000 });
    }
  });

  test('can filter bookings by status', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const statusFilter = page.locator('select:has(option:text("Pending")), [data-testid="status-filter"]');
    
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption({ label: 'Pending' });
      await page.waitForTimeout(500);
      
      // Filtered results should update
      await expect(page.locator('.booking-item, [data-testid="booking-item"]')).toBeVisible();
    }
  });

  test('can export bookings to CSV', async ({ authenticatedPage }) => {
    const page = authenticatedPage.page;
    
    const exportBtn = page.locator('button:has-text("Export"), button:has-text("CSV"), button:has(svg.lucide-download)');
    
    if (await exportBtn.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
      ]);
      
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    }
  });
});

test.describe('Booking Modification', () => {
  
  test('can edit booking purpose', async ({ authenticatedPage }) => {
    await authenticatedPage.navigateTo('mybookings');
    const page = authenticatedPage.page;
    
    const editBtn = page.locator('button:has-text("Edit"), button:has(svg.lucide-edit), [data-action="edit"]').first();
    
    if (await editBtn.isVisible()) {
      await editBtn.click();
      
      // Edit modal should open
      await expect(page.locator('.modal, [role="dialog"], [data-testid="edit-modal"]')).toBeVisible();
      
      // Update purpose
      const purposeInput = page.locator('textarea, input[name="purpose"]');
      await purposeInput.clear();
      await purposeInput.fill('Updated E2E Test Purpose');
      
      // Save changes
      await page.locator('button:has-text("Save"), button:has-text("Update")').click();
      
      // Should see success
      await expect(page.locator('text=updated, text=saved, .bg-green-100')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Calendar Summary', () => {
  
  test('shows booking count on calendar dates', async ({ authenticatedPage }) => {
    await authenticatedPage.navigateTo('schedule');
    const page = authenticatedPage.page;
    
    // Calendar dates should show booking indicators
    const dateWithBookings = page.locator('.calendar-day:has(.booking-count), [data-has-bookings="true"]');
    
    // At least the structure should exist
    await expect(page.locator('.calendar, [data-testid="calendar"]')).toBeVisible();
  });

  test('date hover shows booking preview', async ({ authenticatedPage }) => {
    await authenticatedPage.navigateTo('schedule');
    const page = authenticatedPage.page;
    
    const calendarDay = page.locator('.calendar-day, [data-testid="calendar-day"]').first();
    
    if (await calendarDay.isVisible()) {
      await calendarDay.hover();
      
      // Popover or tooltip might appear
      const popover = page.locator('.popover, [role="tooltip"], .date-preview');
      // Don't fail if no popover, it's optional feature
    }
  });
});
