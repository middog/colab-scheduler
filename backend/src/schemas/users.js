/**
 * SDCoLab Scheduler - User Validation Schemas
 * 
 * Zod schemas for user management endpoints.
 * 
 * @version 4.3.0
 */

import { z } from 'zod';
import { emailSchema, nameSchema } from './auth.js';

// =============================================================================
// Common schemas
// =============================================================================

export const roleSchema = z.enum(['member', 'admin', 'superadmin']);

export const userStatusSchema = z.enum(['active', 'pending', 'suspended', 'deactivated']);

// =============================================================================
// Request schemas
// =============================================================================

/**
 * PUT /api/users/:email
 */
export const updateUserSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  displayName: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  bio: z.string().max(1000).optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    notifications: z.object({
      email: z.object({
        enabled: z.boolean().optional(),
        bookingReminders: z.boolean().optional(),
        bookingReminderTiming: z.number().int().min(1).max(168).optional(),
        certExpiryWarnings: z.boolean().optional(),
        announcements: z.boolean().optional()
      }).optional()
    }).optional()
  }).optional()
});

/**
 * PUT /api/users/:email/role (admin only)
 */
export const updateUserRoleSchema = z.object({
  role: roleSchema
});

/**
 * PUT /api/users/:email/status (admin only)
 */
export const updateUserStatusSchema = z.object({
  status: userStatusSchema,
  reason: z.string().max(500).optional()
});

/**
 * PUT /api/users/:email/permissions (admin only)
 */
export const updateUserPermissionsSchema = z.object({
  tools: z.array(z.string().max(100)).optional(),
  rooms: z.array(z.string().max(100)).optional(),
  capabilities: z.array(z.string().max(100)).optional()
});

/**
 * GET /api/users query params
 */
export const listUsersQuerySchema = z.object({
  status: userStatusSchema.optional(),
  role: roleSchema.optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

/**
 * User email param
 */
export const userParamsSchema = z.object({
  email: emailSchema
});

/**
 * POST /api/users/invite (admin only)
 */
export const inviteUserSchema = z.object({
  email: emailSchema,
  role: roleSchema.optional().default('member'),
  permissions: z.object({
    tools: z.array(z.string().max(100)).optional(),
    rooms: z.array(z.string().max(100)).optional()
  }).optional(),
  expiresInDays: z.number().int().min(1).max(30).optional().default(7),
  message: z.string().max(1000).optional()
});

export default {
  roleSchema,
  userStatusSchema,
  updateUserSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  updateUserPermissionsSchema,
  listUsersQuerySchema,
  userParamsSchema,
  inviteUserSchema
};
