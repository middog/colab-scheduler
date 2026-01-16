/**
 * SDCoLab Scheduler - Notifications Validation Schemas
 * 
 * Zod schemas for notification endpoints.
 * 
 * @version 4.2.0-rc69.15
 */

import { z } from 'zod';

// =============================================================================
// Request schemas
// =============================================================================

/**
 * PUT /api/notifications/preferences
 */
export const updatePreferencesSchema = z.object({
  email: z.object({
    enabled: z.boolean().optional(),
    bookingReminders: z.boolean().optional(),
    bookingReminderTiming: z.number().int().min(1).max(168).optional(), // hours
    certExpiryWarnings: z.boolean().optional(),
    certExpiryTiming: z.number().int().min(1).max(90).optional(), // days
    weeklyDigest: z.boolean().optional(),
    announcements: z.boolean().optional()
  }).optional(),
  sms: z.object({
    enabled: z.boolean().optional(),
    bookingReminders: z.boolean().optional(),
    bookingReminderTiming: z.number().int().min(1).max(24).optional(),
    urgentOnly: z.boolean().optional()
  }).optional(),
  push: z.object({
    enabled: z.boolean().optional(),
    bookingReminders: z.boolean().optional(),
    announcements: z.boolean().optional()
  }).optional(),
  inApp: z.object({
    enabled: z.boolean().optional(),
    showBadges: z.boolean().optional()
  }).optional()
});

/**
 * GET /api/notifications query params
 */
export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

/**
 * POST /api/notifications/send-reminders
 */
export const sendRemindersSchema = z.object({
  type: z.enum(['booking', 'certification']).optional().default('booking')
});

/**
 * POST /api/notifications/announce
 */
export const announceSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  message: z.string().min(1, 'Message is required').max(5000),
  channels: z.array(z.enum(['email', 'inApp', 'slack'])).min(1).optional().default(['inApp']),
  targetRoles: z.array(z.enum(['member', 'admin', 'superadmin'])).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal')
});

/**
 * Notification ID param
 */
export const notificationParamsSchema = z.object({
  id: z.string().min(1).max(100)
});

/**
 * Integration param
 */
export const integrationParamsSchema = z.object({
  integration: z.enum(['email', 'slack', 'github', 'googleCalendar'])
});

export default {
  updatePreferencesSchema,
  listNotificationsQuerySchema,
  sendRemindersSchema,
  announceSchema,
  notificationParamsSchema,
  integrationParamsSchema
};
