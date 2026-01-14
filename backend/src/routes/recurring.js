/**
 * SDCoLab Scheduler - Recurring Bookings Routes
 * 
 * API endpoints for recurring booking management.
 * 
 * 🔥 Fire Triangle: FUEL layer - scheduled access
 */

import { Router } from 'express';
import { ErrorCodes, sendSuccess, sendError } from '../lib/responses.js';
import { authenticate, requireAdmin, requireToolAccess } from '../middleware/auth.js';
import { recurringService } from '../lib/recurring.js';
import { getToolById } from '../lib/config.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/recurring
 * Get user's recurring series
 */
router.get('/', async (req, res) => {
  try {
    const series = await recurringService.getByUser(req.user.email);
    sendSuccess(res, { series });
  } catch (error) {
    console.error('Get recurring series error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get recurring series');
  }
});

/**
 * GET /api/recurring/:id
 * Get a specific recurring series with its bookings
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const series = await recurringService.get(id);
    
    if (!series) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Series not found');
    }
    
    // Check authorization
    if (series.userEmail !== req.user.email && !['admin', 'superadmin'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized');
    }
    
    const bookings = await recurringService.getSeriesBookings(id);
    
    sendSuccess(res, { series, bookings });
  } catch (error) {
    console.error('Get recurring series error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get series');
  }
});

/**
 * POST /api/recurring
 * Create a new recurring booking series
 */
router.post('/', async (req, res) => {
  try {
    const { 
      resourceId, 
      startDate, 
      startTime, 
      endTime, 
      purpose, 
      recurrence,
      requiresApproval 
    } = req.body;
    
    // Validate required fields
    if (!resourceId || !startDate || !startTime || !endTime || !purpose || !recurrence) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Validation error', { 
        error: 'Missing required fields: resourceId, startDate, startTime, endTime, purpose, recurrence' 
      });
    }
    
    // Validate resource exists and user has access
    const tool = getToolById(resourceId);
    if (!tool) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Invalid resource');
    }
    
    // Check certification
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const isCertified = isAdmin || req.user.permissions?.tools?.includes(resourceId);
    
    if (!isCertified && tool.requiresCert) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Certification required for this tool');
    }
    
    // Validate recurrence pattern
    const validPatterns = [
      /^FREQ=(DAILY|WEEKLY|MONTHLY)/,
    ];
    
    if (!validPatterns.some(p => p.test(recurrence))) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Validation error', { 
        error: 'Invalid recurrence pattern. Use format: FREQ=WEEKLY;BYDAY=MO,WE,FR or FREQ=DAILY;COUNT=10' 
      });
    }
    
    const result = await recurringService.create({
      resourceId,
      resourceName: tool.name,
      startDate,
      startTime,
      endTime,
      purpose,
      recurrence,
      requiresApproval: requiresApproval !== false
    }, req.user);
    
    sendSuccess(res, {
      series: result.series,
      createdBookings: result.bookings.length,
      pendingDates: result.pendingDates.length,
      message: `Created recurring series with ${result.bookings.length} initial bookings`
    });
  } catch (error) {
    console.error('Create recurring series error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, error.message || 'Failed to create recurring series');
  }
});

/**
 * DELETE /api/recurring/:id
 * Cancel a recurring series
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { futureOnly } = req.query;
    
    const result = await recurringService.cancelSeries(
      id, 
      req.user, 
      futureOnly !== 'false'
    );
    
    sendSuccess(res, {
      success: true,
      cancelledBookings: result.cancelledBookings,
      message: `Cancelled series and ${result.cancelledBookings} bookings`
    });
  } catch (error) {
    console.error('Cancel recurring series error:', error);
    const isAuthError = error.message.includes('Not authorized');
    sendError(res, isAuthError ? ErrorCodes.FORBIDDEN : ErrorCodes.INTERNAL_ERROR, 
      error.message || 'Failed to cancel series');
  }
});

/**
 * POST /api/recurring/:id/pause
 * Pause a recurring series
 */
router.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    
    await recurringService.pauseSeries(id, req.user);
    
    sendSuccess(res, { success: true, message: 'Series paused' });
  } catch (error) {
    console.error('Pause series error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, error.message || 'Failed to pause series');
  }
});

/**
 * POST /api/recurring/:id/resume
 * Resume a paused series
 */
router.post('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    
    await recurringService.resumeSeries(id, req.user);
    
    sendSuccess(res, { success: true, message: 'Series resumed' });
  } catch (error) {
    console.error('Resume series error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, error.message || 'Failed to resume series');
  }
});

/**
 * POST /api/recurring/generate (admin/cron)
 * Generate future instances for all active series
 */
router.post('/generate', requireAdmin, async (req, res) => {
  try {
    const result = await recurringService.generateFutureInstances();
    
    sendSuccess(res, {
      success: true,
      ...result,
      message: `Processed ${result.processedSeries} series, created ${result.createdInstances} instances`
    });
  } catch (error) {
    console.error('Generate instances error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to generate instances');
  }
});

/**
 * GET /api/recurring/patterns
 * Get common recurrence pattern templates
 */
router.get('/patterns/templates', (req, res) => {
  sendSuccess(res, {
    templates: [
      { 
        name: 'Every weekday', 
        pattern: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
        description: 'Monday through Friday'
      },
      { 
        name: 'Every Monday', 
        pattern: 'FREQ=WEEKLY;BYDAY=MO',
        description: 'Weekly on Monday'
      },
      { 
        name: 'Every Monday and Wednesday', 
        pattern: 'FREQ=WEEKLY;BYDAY=MO,WE',
        description: 'Twice weekly'
      },
      { 
        name: 'Daily', 
        pattern: 'FREQ=DAILY',
        description: 'Every day'
      },
      { 
        name: 'Every other week', 
        pattern: 'FREQ=WEEKLY;INTERVAL=2',
        description: 'Bi-weekly on same day'
      },
      { 
        name: 'Monthly', 
        pattern: 'FREQ=MONTHLY',
        description: 'Same day each month'
      },
      { 
        name: 'Weekends only', 
        pattern: 'FREQ=WEEKLY;BYDAY=SA,SU',
        description: 'Saturday and Sunday'
      },
      {
        name: 'MWF Schedule',
        pattern: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        description: 'Monday, Wednesday, Friday'
      },
      {
        name: 'TTh Schedule',
        pattern: 'FREQ=WEEKLY;BYDAY=TU,TH',
        description: 'Tuesday and Thursday'
      }
    ]
  });
});

export default router;
