/**
 * SDCoLab Scheduler - Auth Validation Schemas
 * 
 * Zod schemas for authentication endpoints.
 * 
 * @version 4.3.0
 */

import { z } from 'zod';

// =============================================================================
// Common schemas
// =============================================================================

export const emailSchema = z.string()
  .email('Invalid email address')
  .max(255, 'Email too long')
  .transform(val => val.toLowerCase().trim());

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long');

export const nameSchema = z.string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .transform(val => val.trim());

export const sessionIdSchema = z.string()
  .uuid('Invalid session ID');

// =============================================================================
// Request schemas
// =============================================================================

/**
 * POST /api/auth/register
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  displayName: z.string().max(200).optional(),
  inviteCode: z.string().max(100).optional()
});

/**
 * POST /api/auth/login
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128)
});

/**
 * POST /api/auth/refresh
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
  sessionId: sessionIdSchema.optional()
}).refine(
  data => data.refreshToken || data.sessionId,
  { message: 'Either refreshToken or sessionId is required' }
);

/**
 * POST /api/auth/forgot-password
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema
});

/**
 * POST /api/auth/reset-password
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema
});

/**
 * POST /api/auth/change-password
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  logoutOtherSessions: z.boolean().optional().default(false),
  currentSessionId: sessionIdSchema.optional()
});

/**
 * POST /api/auth/logout
 */
export const logoutSchema = z.object({
  sessionId: sessionIdSchema.optional()
});

/**
 * POST /api/auth/logout-all
 */
export const logoutAllSchema = z.object({
  keepCurrent: z.boolean().optional().default(false),
  currentSessionId: sessionIdSchema.optional()
});

/**
 * DELETE /api/auth/sessions/:sessionId
 */
export const sessionParamsSchema = z.object({
  sessionId: sessionIdSchema
});

export default {
  emailSchema,
  passwordSchema,
  nameSchema,
  sessionIdSchema,
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  logoutSchema,
  logoutAllSchema,
  sessionParamsSchema
};
