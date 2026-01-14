/**
 * SDCoLab Scheduler - Booking Routes (Enhanced)
 * 
 * CRUD operations for tool bookings with:
 * - Idempotency on all mutating endpoints
 * - Optimistic concurrency (ETag/version) on updates
 * - Normalized API responses
 * - Soft-delete with undo support
 * - Clear conflict messaging with alternatives
 * 
 * 🔥 Fire Triangle: FUEL layer - resource scheduling
 * 
 * @version 4.2.0-rc69.5
 */

import { Router } from 'express';
import { config, getToolById, isFeatureEnabled } from '../lib/config.js';
import { bookingService, activityService } from '../lib/database.js';
import { authenticate, requireAdmin, requireToolAccess } from '../middleware/auth.js';
import { integrations } from '../integrations/index.js';
import { idempotency, idempotencyMiddleware } from '../lib/resilience.js';
import { 
  ErrorCodes, 
  ApiError, 
  asyncHandler, 
  sendSuccess, 
  sendError,
  generateETag,
  versionsMatch,
  bookingConflictError
} from '../lib/responses.js';
import { 
  cancelBooking, 
  undoCancelBooking, 
  ArchiveStatus,
  excludeArchivedFilter 
} from '../lib/archive.js';

const router = Router();

// =============================================================================
// Idempotency Key Generators
// =============================================================================

/**
 * Generate idempotency key for booking creation
 * Combines user + tool + date + time to prevent duplicate bookings
 */
const bookingIdempotencyKey = (req) => {
  const explicitKey = req.headers['x-idempotency-key'];
  if (explicitKey) {
    return `booking:${explicitKey}`;
  }
  
  const { tool, date, startTime, endTime } = req.body;
  if (tool && date && startTime && endTime && req.user?.email) {
    return `booking:${req.user.email}:${tool}:${date}:${startTime}:${endTime}`;
  }
  
  return null;
};

/**
 * Generate idempotency key for booking state changes
 */
const bookingActionKey = (action) => (req) => {
  const explicitKey = req.headers['x-idempotency-key'];
  if (explicitKey) {
    return `${action}:${explicitKey}`;
  }
  
  const bookingId = req.params.id;
  if (bookingId) {
    // Include timestamp segment to allow retry after some time
    return `${action}:${bookingId}:${Math.floor(Date.now() / 60000)}`; // 1-min window
  }
  
  return null;
};

// All booking routes require authentication
router.use(authenticate);

// =============================================================================
// GET Routes
// =============================================================================

/**
 * GET /api/bookings
 * Get bookings by date, status, or all (admin)
 */
router.get('/', asyncHandler(async (req, res) => {
  const { date, status, admin, includeArchived } = req.query;
  const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
  
  let bookings;
  
  if (admin === 'true' && isAdmin) {
    bookings = await bookingService.getAll({ 
      status: status !== 'all' ? status : null,
      includeArchived: includeArchived === 'true'
    });
  } else if (date) {
    bookings = await bookingService.getByDate(date);
    // Filter out archived unless requested
    if (includeArchived !== 'true') {
      bookings = bookings.filter(b => b.status !== ArchiveStatus.ARCHIVED);
    }
  } else if (isAdmin && status === 'pending') {
    bookings = await bookingService.getPending();
  } else {
    bookings = await bookingService.getByUser(req.user.email);
    if (includeArchived !== 'true') {
      bookings = bookings.filter(b => b.status !== ArchiveStatus.ARCHIVED);
    }
  }
  
  sendSuccess(res, { bookings, count: bookings.length });
}));

/**
 * GET /api/bookings/mine
 * Get current user's bookings
 */
router.get('/mine', asyncHandler(async (req, res) => {
  const { includeArchived } = req.query;
  let bookings = await bookingService.getByUser(req.user.email);
  
  if (includeArchived !== 'true') {
    bookings = bookings.filter(b => b.status !== ArchiveStatus.ARCHIVED);
  }
  
  sendSuccess(res, { bookings, count: bookings.length });
}));

/**
 * GET /api/bookings/pending
 * Get pending bookings (admin)
 */
router.get('/pending', requireAdmin, asyncHandler(async (req, res) => {
  const bookings = await bookingService.getPending();
  sendSuccess(res, { bookings, count: bookings.length });
}));

/**
 * GET /api/bookings/slots/:date/:tool
 * Get slot availability details with conflict explanations
 */
router.get('/slots/:date/:tool', asyncHandler(async (req, res) => {
  const { date, tool } = req.params;
  const toolConfig = getToolById(tool);
  
  if (!toolConfig) {
    return sendError(res, ErrorCodes.BAD_REQUEST, 'Invalid tool');
  }
  
  const bookings = await bookingService.getByDate(date);
  const toolBookings = bookings.filter(b => 
    (b.resourceId === tool || b.tool === tool) &&
    b.status !== 'rejected' && b.status !== ArchiveStatus.ARCHIVED
  );
  
  // Build slot info for each hour
  const slots = {};
  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
  
  for (const time of hours) {
    const slotBookings = toolBookings.filter(b => 
      time >= b.startTime && time < b.endTime
    );
    
    const approved = slotBookings.filter(b => b.status === 'approved');
    const pending = slotBookings.filter(b => b.status === 'pending');
    
    const maxConcurrent = toolConfig.maxConcurrent || 1;
    const available = maxConcurrent - approved.length;
    const isFull = available <= 0;
    
    // Determine why slot might be unavailable
    let unavailableReason = null;
    if (isFull) {
      const recentBooking = approved[approved.length - 1];
      const secondsAgo = recentBooking ? 
        Math.floor((Date.now() - new Date(recentBooking.updatedAt || recentBooking.createdAt).getTime()) / 1000) : 
        null;
      
      unavailableReason = {
        code: 'SLOT_TAKEN',
        message: secondsAgo && secondsAgo < 120 
          ? `This slot was taken ${secondsAgo} seconds ago`
          : 'This slot is fully booked',
        takenAt: recentBooking?.updatedAt || recentBooking?.createdAt
      };
    } else if (toolConfig.status === 'maintenance') {
      unavailableReason = {
        code: 'MAINTENANCE_WINDOW',
        message: 'Equipment is under maintenance',
        notes: toolConfig.maintenanceNotes
      };
    }
    
    slots[time] = {
      approved: approved.length,
      pending: pending.length,
      total: slotBookings.length,
      maxConcurrent,
      available,
      isFull,
      unavailableReason,
      bookings: slotBookings.map(b => ({
        id: b.id,
        userName: b.userName,
        status: b.status,
        purpose: b.purpose?.substring(0, 50),
        bookedAt: b.createdAt
      }))
    };
  }
  
  // Find nearest available alternatives if current view has no availability
  const alternatives = [];
  // TODO: Implement alternative slot finding
  
  sendSuccess(res, { 
    date,
    tool,
    toolName: toolConfig.name,
    maxConcurrent: toolConfig.maxConcurrent || 1,
    toolStatus: toolConfig.status || 'available',
    slots,
    alternatives
  });
}));

/**
 * GET /api/bookings/calendar/:year/:month
 * Get booking summary for calendar view
 */
router.get('/calendar/:year/:month', asyncHandler(async (req, res) => {
  const { year, month } = req.params;
  
  // Get all bookings for the month
  const allBookings = [];
  for (let day = 1; day <= 31; day++) {
    const date = `${year}-${month.padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    try {
      const dayBookings = await bookingService.getByDate(date);
      allBookings.push(...dayBookings.filter(b => 
        b.status !== 'rejected' && b.status !== ArchiveStatus.ARCHIVED
      ));
    } catch {}
  }
  
  // Group by date
  const byDate = {};
  for (const booking of allBookings) {
    if (!byDate[booking.date]) {
      byDate[booking.date] = { approved: 0, pending: 0, tools: new Set() };
    }
    if (booking.status === 'approved') byDate[booking.date].approved++;
    if (booking.status === 'pending') byDate[booking.date].pending++;
    byDate[booking.date].tools.add(booking.resourceName || booking.toolName);
  }
  
  const calendar = {};
  for (const [date, data] of Object.entries(byDate)) {
    calendar[date] = {
      approved: data.approved,
      pending: data.pending,
      total: data.approved + data.pending,
      tools: Array.from(data.tools)
    };
  }
  
  sendSuccess(res, { year, month, calendar });
}));

/**
 * GET /api/bookings/:id
 * Get single booking with ETag support
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const booking = await bookingService.get(req.params.id);
  
  if (!booking) {
    return sendError(res, ErrorCodes.NOT_FOUND, 'Booking not found');
  }
  
  // Users can only see their own bookings (unless admin)
  const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
  if (!isAdmin && booking.userEmail !== req.user.email) {
    return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized to view this booking');
  }
  
  // Send with ETag for optimistic concurrency
  sendSuccess(res, { booking }, { etag: generateETag(booking) });
}));

// =============================================================================
// POST Routes (Create)
// =============================================================================

/**
 * POST /api/bookings
 * Create new booking request with full conflict detection
 * 
 * Idempotency: Prevents duplicate bookings from retries/double-clicks
 */
router.post('/', 
  requireToolAccess('tool'),
  idempotencyMiddleware({ keyGenerator: bookingIdempotencyKey }),
  asyncHandler(async (req, res) => {
    const { tool, date, startTime, endTime, purpose, projectName, confirmOverlap } = req.body;
    
    // Validate required fields
    const missingFields = [];
    if (!tool) missingFields.push('tool');
    if (!date) missingFields.push('date');
    if (!startTime) missingFields.push('startTime');
    if (!endTime) missingFields.push('endTime');
    if (!purpose) missingFields.push('purpose');
    
    if (missingFields.length > 0) {
      return sendError(res, ErrorCodes.VALIDATION_ERROR, 'Missing required fields', {
        fields: missingFields.reduce((acc, f) => ({ ...acc, [f]: 'This field is required' }), {})
      });
    }
    
    // Validate tool exists
    const toolConfig = getToolById(tool);
    if (!toolConfig) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Invalid tool', {
        field: 'tool',
        message: `Tool '${tool}' does not exist`
      });
    }
    
    // Check tool status
    if (toolConfig.status === 'maintenance') {
      return sendError(res, ErrorCodes.MAINTENANCE_WINDOW, 'Tool is currently under maintenance', {
        tool: toolConfig.name,
        maintenanceNotes: toolConfig.maintenanceNotes,
        expectedBack: toolConfig.nextMaintenanceAt
      });
    }
    
    if (toolConfig.status === 'disabled') {
      return sendError(res, ErrorCodes.RESOURCE_UNAVAILABLE, 'Tool is currently disabled', {
        tool: toolConfig.name
      });
    }
    
    // Get existing bookings
    const existingBookings = await bookingService.getByDate(date);
    
    // Check concurrent limit (only APPROVED count)
    const conflictingBookings = existingBookings.filter(b => 
      (b.resourceId === tool || b.tool === tool) &&
      b.status === 'approved' &&
      startTime < b.endTime &&
      endTime > b.startTime
    );
    
    const maxConcurrent = toolConfig.maxConcurrent || 1;
    if (conflictingBookings.length >= maxConcurrent) {
      // Find the most recent booking to give context
      const mostRecent = conflictingBookings.sort((a, b) => 
        new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
      )[0];
      
      const secondsAgo = mostRecent ? 
        Math.floor((Date.now() - new Date(mostRecent.updatedAt || mostRecent.createdAt).getTime()) / 1000) :
        null;
      
      // TODO: Find nearest available alternatives
      const alternatives = [];
      
      return sendError(res, ErrorCodes.SLOT_TAKEN, 
        secondsAgo && secondsAgo < 120 
          ? `This slot was taken ${secondsAgo} seconds ago` 
          : 'Time slot is fully booked',
        {
          maxConcurrent,
          currentBookings: conflictingBookings.length,
          takenAt: mostRecent?.updatedAt || mostRecent?.createdAt,
          alternatives
        }
      );
    }
    
    // Check user's overlapping bookings for OTHER tools
    const userOverlappingBookings = existingBookings.filter(b => 
      b.userEmail === req.user.email &&
      (b.resourceId !== tool && b.tool !== tool) &&
      b.status !== 'rejected' && b.status !== ArchiveStatus.ARCHIVED &&
      startTime < b.endTime &&
      endTime > b.startTime
    );
    
    if (userOverlappingBookings.length > 0 && !confirmOverlap) {
      return sendError(res, ErrorCodes.CONFLICT, 'OVERLAP_WARNING', {
        message: 'You have overlapping bookings for other tools at this time',
        overlappingBookings: userOverlappingBookings.map(b => ({
          id: b.id,
          tool: b.resourceName || b.toolName,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          status: b.status
        })),
        requiresConfirmation: true,
        confirmParam: 'confirmOverlap'
      });
    }
    
    // Determine auto-approval
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const autoApprove = isAdmin;
    
    // Create booking with version field
    const booking = await bookingService.create({
      tool,
      toolName: toolConfig.name,
      resourceType: 'tool',
      resourceId: tool,
      resourceName: toolConfig.name,
      date,
      startTime,
      endTime,
      purpose,
      projectName,
      version: 1, // Initial version for optimistic concurrency
      ...(autoApprove && {
        status: 'approved',
        approvedBy: req.user.email,
        approvedAt: new Date().toISOString(),
        autoApproved: true
      })
    }, req.user);
    
    // Fire integration hooks
    if (autoApprove) {
      const hookResults = await integrations.onBookingApproved(
        { ...booking, userEmail: booking.userEmail },
        req.user.email
      );
      
      if (hookResults.calendarEventId) {
        await bookingService.update(booking.id, {
          calendarEventId: hookResults.calendarEventId,
          calendarEventUrl: hookResults.calendarEventUrl,
          resourceCalendar: hookResults.resourceCalendar
        }, req.user);
        booking.calendarEventId = hookResults.calendarEventId;
        booking.calendarEventUrl = hookResults.calendarEventUrl;
      }
    } else {
      if (isFeatureEnabled('github') || isFeatureEnabled('slack')) {
        const hookResults = await integrations.onBookingCreated(booking);
        
        if (hookResults.githubIssueNumber) {
          await bookingService.update(booking.id, {
            githubIssueNumber: hookResults.githubIssueNumber,
            githubIssueUrl: hookResults.githubIssueUrl
          }, req.user);
          booking.githubIssueNumber = hookResults.githubIssueNumber;
          booking.githubIssueUrl = hookResults.githubIssueUrl;
        }
      }
    }
    
    sendSuccess(res, { 
      booking,
      autoApproved: autoApprove
    }, { 
      status: 201,
      message: autoApprove ? 'Booking approved automatically' : 'Booking request submitted for approval',
      etag: generateETag(booking)
    });
  })
);

// =============================================================================
// PUT Routes (Update with Optimistic Concurrency)
// =============================================================================

/**
 * PUT /api/bookings/:id
 * Update booking with optimistic concurrency control
 * 
 * Uses If-Match header or version field for conflict detection
 */
router.put('/:id', 
  idempotencyMiddleware({ keyGenerator: bookingActionKey('update') }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ifMatch = req.headers['if-match'];
    const booking = await bookingService.get(id);
    
    if (!booking) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Booking not found');
    }
    
    // Check authorization
    const isOwner = booking.userEmail === req.user.email;
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    
    if (!isOwner && !isAdmin) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized to edit this booking');
    }
    
    // Can't edit archived or cancelled bookings
    if ([ArchiveStatus.ARCHIVED, 'cancelled'].includes(booking.status)) {
      return sendError(res, ErrorCodes.ARCHIVED, 'Cannot edit archived or cancelled bookings');
    }
    
    if (booking.status === 'rejected') {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Cannot edit rejected bookings');
    }
    
    // Optimistic concurrency check
    if (ifMatch && !versionsMatch(booking, ifMatch)) {
      return sendError(res, ErrorCodes.VERSION_MISMATCH, 
        'Booking was modified by another request. Please refresh and try again.',
        {
          currentVersion: booking.version || booking.updatedAt,
          yourVersion: ifMatch
        }
      );
    }
    
    const { tool, date, startTime, endTime, purpose, confirmOverlap, version } = req.body;
    
    // Also check body version for non-header clients
    if (version !== undefined && booking.version !== undefined && version !== booking.version) {
      return sendError(res, ErrorCodes.VERSION_MISMATCH,
        'Booking was modified by another request. Please refresh and try again.',
        {
          currentVersion: booking.version,
          yourVersion: version
        }
      );
    }
    
    const toolConfig = tool ? getToolById(tool) : getToolById(booking.resourceId);
    
    // Build updates object
    const updates = {};
    
    if (tool && tool !== booking.resourceId) {
      updates.resourceId = tool;
      updates.resourceName = toolConfig?.name;
      updates.tool = tool;
      updates.toolName = toolConfig?.name;
    }
    if (date && date !== booking.date) updates.date = date;
    if (startTime && startTime !== booking.startTime) updates.startTime = startTime;
    if (endTime && endTime !== booking.endTime) updates.endTime = endTime;
    if (purpose && purpose !== booking.purpose) updates.purpose = purpose;
    
    // No changes
    if (Object.keys(updates).length === 0) {
      return sendSuccess(res, { booking, changed: false }, { 
        message: 'No changes made',
        etag: generateETag(booking)
      });
    }
    
    // Check conflicts for significant changes
    const effectiveDate = updates.date || booking.date;
    const effectiveStart = updates.startTime || booking.startTime;
    const effectiveEnd = updates.endTime || booking.endTime;
    const effectiveTool = updates.resourceId || booking.resourceId;
    
    if (updates.date || updates.startTime || updates.endTime || updates.resourceId) {
      const existingBookings = await bookingService.getByDate(effectiveDate);
      
      const conflictingBookings = existingBookings.filter(b => 
        b.id !== id &&
        (b.resourceId === effectiveTool || b.tool === effectiveTool) &&
        b.status === 'approved' &&
        effectiveStart < b.endTime &&
        effectiveEnd > b.startTime
      );
      
      const maxConcurrent = toolConfig?.maxConcurrent || 1;
      if (conflictingBookings.length >= maxConcurrent) {
        return sendError(res, ErrorCodes.SLOT_TAKEN, 'Time slot is fully booked', {
          maxConcurrent,
          existingBookings: conflictingBookings.length
        });
      }
      
      // Check overlaps
      const userOverlappingBookings = existingBookings.filter(b => 
        b.id !== id &&
        b.userEmail === req.user.email &&
        (b.resourceId !== effectiveTool && b.tool !== effectiveTool) &&
        b.status !== 'rejected' && b.status !== ArchiveStatus.ARCHIVED &&
        effectiveStart < b.endTime &&
        effectiveEnd > b.startTime
      );
      
      if (userOverlappingBookings.length > 0 && !confirmOverlap) {
        return sendError(res, ErrorCodes.CONFLICT, 'OVERLAP_WARNING', {
          message: 'You have overlapping bookings for other tools at this time',
          overlappingBookings: userOverlappingBookings.map(b => ({
            id: b.id,
            tool: b.resourceName || b.toolName,
            date: b.date,
            startTime: b.startTime,
            endTime: b.endTime,
            status: b.status
          })),
          requiresConfirmation: true
        });
      }
    }
    
    // Non-admin edit of approved booking resets to pending
    let statusChanged = false;
    if (!isAdmin && booking.status === 'approved' && 
        (updates.date || updates.startTime || updates.endTime || updates.resourceId)) {
      updates.status = 'pending';
      updates.approvedBy = null;
      updates.approvedAt = null;
      updates.editedFromApproved = true;
      updates.previousApprovedBy = booking.approvedBy;
      statusChanged = true;
      
      // Delete calendar event since it needs re-approval
      if (booking.calendarEventId && isFeatureEnabled('googleCalendar')) {
        await integrations.onBookingCancelled(booking, req.user.email);
        updates.calendarEventId = null;
        updates.calendarEventUrl = null;
      }
    }
    
    // Increment version
    updates.version = (booking.version || 0) + 1;
    
    const updatedBooking = await bookingService.update(id, updates, req.user);
    
    sendSuccess(res, { 
      booking: updatedBooking,
      changed: true,
      statusChanged
    }, { 
      message: statusChanged 
        ? 'Booking updated and resubmitted for approval' 
        : 'Booking updated successfully',
      etag: generateETag(updatedBooking)
    });
  })
);

// =============================================================================
// DELETE Routes (Soft Delete with Undo)
// =============================================================================

/**
 * DELETE /api/bookings/:id
 * Cancel booking (soft delete with undo support)
 */
router.delete('/:id', 
  idempotencyMiddleware({ keyGenerator: bookingActionKey('cancel') }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const booking = await bookingService.get(id);
    
    if (!booking) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Booking not found');
    }
    
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    if (!isAdmin && booking.userEmail !== req.user.email) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized to cancel this booking');
    }
    
    // Already cancelled
    if (booking.status === ArchiveStatus.ARCHIVED || booking.status === 'cancelled') {
      return sendError(res, ErrorCodes.ALREADY_CANCELLED, 'Booking is already cancelled');
    }
    
    // Fire cancellation hooks
    await integrations.onBookingCancelled(booking, req.user.email);
    
    // Soft delete with undo support
    const result = await cancelBooking(booking.id, req.user, { reason });
    
    // Notify waitlist if this was approved
    if (booking.status === 'approved') {
      try {
        const { waitlistService } = await import('../lib/waitlist.js');
        const next = await waitlistService.notifyNext(booking.tool, booking.date, booking.startTime);
        if (next) {
          const { sendWaitlistNotification } = await import('./waitlist.js');
          await sendWaitlistNotification(next);
        }
      } catch (waitlistErr) {
        console.error('Waitlist notification failed:', waitlistErr);
      }
    }
    
    sendSuccess(res, { 
      cancelled: true,
      booking: { id: booking.id, status: ArchiveStatus.ARCHIVED },
      undo: {
        available: true,
        token: result.undoToken,
        expiresAt: result.undoExpiresAt,
        windowSeconds: result.undoWindowSeconds
      }
    }, { message: 'Booking cancelled. You can undo this action for 10 seconds.' });
  })
);

/**
 * POST /api/bookings/:id/undo
 * Undo a booking cancellation within the undo window
 */
router.post('/:id/undo', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { undoToken } = req.body;
  
  if (!undoToken) {
    return sendError(res, ErrorCodes.BAD_REQUEST, 'Undo token is required');
  }
  
  const result = await undoCancelBooking(id, undoToken, req.user);
  
  if (!result.restored) {
    return sendError(res, ErrorCodes.BAD_REQUEST, 
      result.reason || 'Unable to undo cancellation. The undo window may have expired.'
    );
  }
  
  const booking = await bookingService.get(id);
  
  sendSuccess(res, { 
    restored: true,
    booking 
  }, { message: 'Booking restored successfully' });
}));

// =============================================================================
// Admin Approval Routes
// =============================================================================

/**
 * POST /api/bookings/:id/approve
 */
router.post('/:id/approve', 
  requireAdmin,
  idempotencyMiddleware({ keyGenerator: bookingActionKey('approve') }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const booking = await bookingService.get(id);
    
    if (!booking) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Booking not found');
    }
    
    if (booking.status !== 'pending') {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Booking is not pending', {
        currentStatus: booking.status
      });
    }
    
    const hookResults = await integrations.onBookingApproved(
      { ...booking, userEmail: booking.userEmail },
      req.user.email
    );
    
    const updates = {
      status: 'approved',
      approvedBy: req.user.email,
      approvedAt: new Date().toISOString(),
      version: (booking.version || 0) + 1,
      ...(hookResults.calendarEventId && {
        calendarEventId: hookResults.calendarEventId,
        calendarEventUrl: hookResults.calendarEventUrl,
        resourceCalendar: hookResults.resourceCalendar
      })
    };
    
    const updatedBooking = await bookingService.update(id, updates, req.user);
    
    sendSuccess(res, { 
      booking: updatedBooking, 
      calendarEvent: hookResults 
    }, { 
      message: 'Booking approved',
      etag: generateETag(updatedBooking)
    });
  })
);

/**
 * POST /api/bookings/:id/reject
 */
router.post('/:id/reject', 
  requireAdmin,
  idempotencyMiddleware({ keyGenerator: bookingActionKey('reject') }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    const booking = await bookingService.get(id);
    
    if (!booking) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Booking not found');
    }
    
    await integrations.onBookingRejected(booking, req.user.email, reason);
    
    if (booking.calendarEventId) {
      await integrations.onBookingCancelled(booking, req.user.email);
    }
    
    const updatedBooking = await bookingService.update(id, {
      status: 'rejected',
      rejectedBy: req.user.email,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason || 'Rejected by admin',
      calendarEventId: null,
      calendarEventUrl: null,
      version: (booking.version || 0) + 1
    }, req.user);
    
    sendSuccess(res, { booking: updatedBooking }, { 
      message: 'Booking rejected',
      etag: generateETag(updatedBooking)
    });
  })
);

// =============================================================================
// Bulk Operations (Admin)
// =============================================================================

/**
 * POST /api/bookings/bulk/approve
 * Approve multiple bookings at once
 */
router.post('/bulk/approve', requireAdmin, asyncHandler(async (req, res) => {
  const { ids } = req.body;
  
  if (!Array.isArray(ids) || ids.length === 0) {
    return sendError(res, ErrorCodes.VALIDATION_ERROR, 'No booking IDs provided');
  }
  
  const results = { approved: [], failed: [] };
  
  for (const id of ids) {
    try {
      const booking = await bookingService.get(id);
      if (!booking || booking.status !== 'pending') {
        results.failed.push({ id, reason: booking ? 'Not pending' : 'Not found' });
        continue;
      }
      
      const hookResults = await integrations.onBookingApproved(booking, req.user.email);
      
      await bookingService.update(id, {
        status: 'approved',
        approvedBy: req.user.email,
        approvedAt: new Date().toISOString(),
        version: (booking.version || 0) + 1,
        ...(hookResults.calendarEventId && {
          calendarEventId: hookResults.calendarEventId,
          calendarEventUrl: hookResults.calendarEventUrl
        })
      }, req.user);
      
      results.approved.push(id);
    } catch (err) {
      results.failed.push({ id, reason: err.message });
    }
  }
  
  sendSuccess(res, results, { 
    message: `Approved ${results.approved.length} of ${ids.length} bookings` 
  });
}));

/**
 * POST /api/bookings/bulk/reject
 * Reject multiple bookings at once
 */
router.post('/bulk/reject', requireAdmin, asyncHandler(async (req, res) => {
  const { ids, reason } = req.body;
  
  if (!Array.isArray(ids) || ids.length === 0) {
    return sendError(res, ErrorCodes.VALIDATION_ERROR, 'No booking IDs provided');
  }
  
  const results = { rejected: [], failed: [] };
  
  for (const id of ids) {
    try {
      const booking = await bookingService.get(id);
      if (!booking || !['pending', 'approved'].includes(booking.status)) {
        results.failed.push({ id, reason: booking ? 'Invalid status' : 'Not found' });
        continue;
      }
      
      await integrations.onBookingRejected(booking, req.user.email, reason);
      
      await bookingService.update(id, {
        status: 'rejected',
        rejectedBy: req.user.email,
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason || 'Bulk rejected by admin',
        version: (booking.version || 0) + 1
      }, req.user);
      
      results.rejected.push(id);
    } catch (err) {
      results.failed.push({ id, reason: err.message });
    }
  }
  
  sendSuccess(res, results, { 
    message: `Rejected ${results.rejected.length} of ${ids.length} bookings` 
  });
}));

export default router;
