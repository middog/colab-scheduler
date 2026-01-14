/**
 * SDCoLab Scheduler - Resource Validation Schemas
 * 
 * Zod schemas for resource/tool management endpoints.
 * 
 * @version 4.3.0
 */

import { z } from 'zod';

// =============================================================================
// Common schemas
// =============================================================================

export const resourceIdSchema = z.string()
  .min(1, 'Resource ID is required')
  .max(100)
  .regex(/^[a-z0-9-]+$/, 'Resource ID must be lowercase alphanumeric with hyphens');

export const categorySchema = z.enum([
  'fabrication', 'electronics', 'textiles', 'woodworking', 
  'metalworking', 'ceramics', 'general', 'other'
]);

// =============================================================================
// Request schemas
// =============================================================================

/**
 * POST /api/resources
 */
export const createResourceSchema = z.object({
  id: resourceIdSchema,
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional(),
  category: categorySchema.optional().default('general'),
  room: z.string().max(100).optional(),
  maxConcurrent: z.number().int().min(1).max(100).optional().default(1),
  requiresCert: z.boolean().optional().default(false),
  certificationId: z.string().max(100).optional(),
  bookingRules: z.object({
    minDuration: z.number().int().min(15).max(480).optional(), // minutes
    maxDuration: z.number().int().min(15).max(480).optional(),
    advanceBookingDays: z.number().int().min(0).max(365).optional(),
    requiresApproval: z.boolean().optional()
  }).optional(),
  availability: z.object({
    monday: z.object({ start: z.string(), end: z.string() }).optional(),
    tuesday: z.object({ start: z.string(), end: z.string() }).optional(),
    wednesday: z.object({ start: z.string(), end: z.string() }).optional(),
    thursday: z.object({ start: z.string(), end: z.string() }).optional(),
    friday: z.object({ start: z.string(), end: z.string() }).optional(),
    saturday: z.object({ start: z.string(), end: z.string() }).optional(),
    sunday: z.object({ start: z.string(), end: z.string() }).optional()
  }).optional(),
  imageUrl: z.string().url().optional(),
  manualUrl: z.string().url().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  status: z.enum(['active', 'maintenance', 'retired']).optional().default('active')
});

/**
 * PUT /api/resources/:id
 */
export const updateResourceSchema = createResourceSchema.partial().omit({ id: true });

/**
 * GET /api/resources query params
 */
export const listResourcesQuerySchema = z.object({
  category: categorySchema.optional(),
  room: z.string().max(100).optional(),
  status: z.enum(['active', 'maintenance', 'retired', 'all']).optional(),
  requiresCert: z.coerce.boolean().optional(),
  search: z.string().max(100).optional()
});

/**
 * Resource ID param
 */
export const resourceParamsSchema = z.object({
  id: resourceIdSchema
});

/**
 * GET /api/resources/:id/availability query params
 */
export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export default {
  resourceIdSchema,
  categorySchema,
  createResourceSchema,
  updateResourceSchema,
  listResourcesQuerySchema,
  resourceParamsSchema,
  availabilityQuerySchema
};
