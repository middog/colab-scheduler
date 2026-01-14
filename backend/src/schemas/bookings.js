/**
 * SDCoLab Scheduler - Booking Validation Schemas
 * 
 * Zod schemas for booking endpoints.
 * 
 * @version 4.3.0
 */

import { z } from 'zod';

// =============================================================================
// Common schemas
// =============================================================================

export const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const timeSchema = z.string()
  .regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format');

export const bookingIdSchema = z.string()
  .min(1, 'Booking ID is required')
  .max(100);

export const resourceIdSchema = z.string()
  .min(1, 'Resource ID is required')
  .max(100);

export const bookingStatusSchema = z.enum([
  'pending', 'approved', 'rejected', 'cancelled', 'completed'
]);

// =============================================================================
// Request schemas
// =============================================================================

/**
 * POST /api/bookings
 */
export const createBookingSchema = z.object({
  resourceId: resourceIdSchema,
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  purpose: z.string().max(500, 'Purpose too long').optional(),
  notes: z.string().max(2000, 'Notes too long').optional(),
  attendees: z.array(z.string().email()).max(20).optional()
}).refine(
  data => {
    // Validate end time is after start time
    if (data.startTime && data.endTime) {
      return data.endTime > data.startTime;
    }
    return true;
  },
  { message: 'End time must be after start time', path: ['endTime'] }
);

/**
 * PUT /api/bookings/:id
 */
export const updateBookingSchema = z.object({
  date: dateSchema.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  purpose: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  attendees: z.array(z.string().email()).max(20).optional()
});

/**
 * POST /api/bookings/:id/approve
 */
export const approveBookingSchema = z.object({
  notes: z.string().max(500).optional()
});

/**
 * POST /api/bookings/:id/reject
 */
export const rejectBookingSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500)
});

/**
 * POST /api/bookings/:id/cancel
 */
export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional()
});

/**
 * GET /api/bookings query params
 */
export const listBookingsQuerySchema = z.object({
  date: dateSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  resourceId: resourceIdSchema.optional(),
  status: bookingStatusSchema.optional(),
  userEmail: z.string().email().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

/**
 * Booking ID param
 */
export const bookingParamsSchema = z.object({
  id: bookingIdSchema
});

export default {
  dateSchema,
  timeSchema,
  bookingIdSchema,
  resourceIdSchema,
  bookingStatusSchema,
  createBookingSchema,
  updateBookingSchema,
  approveBookingSchema,
  rejectBookingSchema,
  cancelBookingSchema,
  listBookingsQuerySchema,
  bookingParamsSchema
};
