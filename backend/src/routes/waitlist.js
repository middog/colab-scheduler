/**
 * SDCoLab Scheduler - Waitlist Routes
 * 
 * API endpoints for waitlist management.
 * 
 * 🔥 Fire Triangle: OXYGEN layer - fair access
 */

import { Router } from 'express';
import { ErrorCodes, sendSuccess, sendError } from '../lib/responses.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { waitlistService } from '../lib/waitlist.js';
import { getToolById, isFeatureEnabled, config } from '../lib/config.js';
import { sendEmail } from '../integrations/email.js';
import { slackService } from '../integrations/slack.js';

const router = Router();

/**
 * Send waitlist notification to user via their preferred methods
 */
async function sendWaitlistNotification(entry) {
  const results = { email: null, slack: null };
  const notifyMethods = entry.notifyMethods || ['email'];
  
  const formatTime = (t) => {
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };
  
  // Email notification
  if (notifyMethods.includes('email') && isFeatureEnabled('email')) {
    try {
      results.email = await sendEmail(entry.userEmail, 'waitlistNotification', {
        userName: entry.userName || entry.userEmail.split('@')[0],
        resourceName: entry.resourceName,
        date: entry.date,
        startTime: formatTime(entry.startTime),
        endTime: formatTime(entry.endTime),
        bookingUrl: `${config.frontendUrl}?book=${entry.resourceId}&date=${entry.date}&start=${entry.startTime}`
      });
    } catch (err) {
      console.error('Waitlist email notification failed:', err);
      results.email = { success: false, error: err.message };
    }
  }
  
  // Slack notification (to channel, not direct to user)
  if (notifyMethods.includes('slack') && isFeatureEnabled('slack')) {
    try {
      await slackService.send({
        text: `🔔 Waitlist spot available for ${entry.resourceName}`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🔔 Waitlist Spot Available!', emoji: true }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Tool:*\n${entry.resourceName}` },
              { type: 'mrkdwn', text: `*Date:*\n${entry.date}` },
              { type: 'mrkdwn', text: `*Time:*\n${formatTime(entry.startTime)} - ${formatTime(entry.endTime)}` },
              { type: 'mrkdwn', text: `*Notified:*\n${entry.userName}` }
            ]
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Next person from waitlist has been notified.` }
            ]
          }
        ]
      });
      results.slack = { success: true };
    } catch (err) {
      console.error('Waitlist slack notification failed:', err);
      results.slack = { success: false, error: err.message };
    }
  }
  
  return results;
}

// All waitlist routes require authentication
router.use(authenticate);

/**
 * GET /api/waitlist
 * Get user's waitlist entries
 */
router.get('/', async (req, res) => {
  try {
    const entries = await waitlistService.getByUser(req.user.email);
    sendSuccess(res, { entries });
  } catch (error) {
    console.error('Get waitlist error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get waitlist entries');
  }
});

/**
 * GET /api/waitlist/slot/:resourceId/:date/:startTime
 * Get waitlist for a specific slot
 */
router.get('/slot/:resourceId/:date/:startTime', async (req, res) => {
  try {
    const { resourceId, date, startTime } = req.params;
    
    const entries = await waitlistService.getForSlot(resourceId, date, startTime);
    const userPosition = await waitlistService.getUserPosition(
      resourceId, date, startTime, req.user.email
    );
    
    sendSuccess(res, { 
      entries,
      count: entries.length,
      userPosition: userPosition?.position || null,
      userEntry: userPosition || null
    });
  } catch (error) {
    console.error('Get slot waitlist error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get waitlist');
  }
});

/**
 * POST /api/waitlist
 * Join a waitlist
 */
router.post('/', async (req, res) => {
  try {
    const { resourceId, date, startTime, endTime, notes, notifyMethods } = req.body;
    
    // Validate required fields
    if (!resourceId || !date || !startTime || !endTime) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Missing required fields: resourceId, date, startTime, endTime');
    }
    
    // Validate resource exists
    const tool = getToolById(resourceId);
    if (!tool) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Invalid resource');
    }
    
    // Determine priority (certified users get higher priority)
    const isCertified = req.user.permissions?.tools?.includes(resourceId) ||
                        ['admin', 'superadmin'].includes(req.user.role);
    
    const entry = await waitlistService.join({
      resourceId,
      resourceName: tool.name,
      date,
      startTime,
      endTime,
      notes,
      notifyMethods: notifyMethods || ['email'],
      priority: isCertified ? 'high' : 'normal'
    }, req.user);
    
    sendSuccess(res, { 
      entry,
      message: `You are #${entry.position} on the waitlist`
    });
  } catch (error) {
    console.error('Join waitlist error:', error);
    const isConflict = error.message.includes('already');
    sendError(res, isConflict ? ErrorCodes.CONFLICT : ErrorCodes.INTERNAL_ERROR, 
      error.message || 'Failed to join waitlist');
  }
});

/**
 * DELETE /api/waitlist/:id
 * Leave a waitlist
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await waitlistService.leave(id, req.user);
    
    sendSuccess(res, { success: true, message: 'Removed from waitlist' });
  } catch (error) {
    console.error('Leave waitlist error:', error);
    const isAuthError = error.message.includes('Not authorized');
    sendError(res, isAuthError ? ErrorCodes.FORBIDDEN : ErrorCodes.INTERNAL_ERROR, 
      error.message || 'Failed to leave waitlist');
  }
});

/**
 * POST /api/waitlist/:id/convert
 * Convert waitlist entry to booking (when notified)
 */
router.post('/:id/convert', async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await waitlistService.get(id);
    
    if (!entry) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Waitlist entry not found');
    }
    
    if (entry.userEmail !== req.user.email) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized');
    }
    
    if (entry.status !== 'notified') {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Cannot convert - entry has not been notified or is no longer valid');
    }
    
    // Mark as converted
    const converted = await waitlistService.convertToBooking(id, req.user);
    
    sendSuccess(res, { 
      success: true,
      entry: converted,
      message: 'Waitlist entry ready for booking. Please create your booking now.',
      bookingData: {
        resourceId: converted.resourceId,
        date: converted.date,
        startTime: converted.startTime,
        endTime: converted.endTime
      }
    });
  } catch (error) {
    console.error('Convert waitlist error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, error.message || 'Failed to convert waitlist entry');
  }
});

/**
 * GET /api/waitlist/stats/:resourceId
 * Get waitlist statistics for a resource (admin only)
 */
router.get('/stats/:resourceId', requireAdmin, async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { startDate, endDate } = req.query;
    
    const stats = await waitlistService.getStats(resourceId, startDate, endDate);
    
    sendSuccess(res, { stats });
  } catch (error) {
    console.error('Get waitlist stats error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get waitlist statistics');
  }
});

/**
 * POST /api/waitlist/notify-next (admin)
 * Manually trigger notification for next person in line
 */
router.post('/notify-next', requireAdmin, async (req, res) => {
  try {
    const { resourceId, date, startTime } = req.body;
    
    if (!resourceId || !date || !startTime) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Missing required fields: resourceId, date, startTime');
    }
    
    const next = await waitlistService.notifyNext(resourceId, date, startTime);
    
    if (!next) {
      return sendSuccess(res, { success: false, message: 'No one on waitlist' });
    }
    
    // Send notifications based on user preferences
    const notificationResults = await sendWaitlistNotification(next);
    
    sendSuccess(res, { 
      success: true, 
      notified: {
        email: next.userEmail,
        name: next.userName,
        position: next.position
      },
      notifications: notificationResults,
      message: `Notified ${next.userName} (${next.userEmail})`
    });
  } catch (error) {
    console.error('Notify next error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to notify next person');
  }
});

/**
 * POST /api/waitlist/expire (admin/cron)
 * Clean up expired waitlist entries
 */
router.post('/expire', requireAdmin, async (req, res) => {
  try {
    const result = await waitlistService.expireOld();
    sendSuccess(res, { success: true, ...result });
  } catch (error) {
    console.error('Expire waitlist error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to expire old entries');
  }
});

// Export for use in other routes (e.g., booking cancellation)
export { sendWaitlistNotification };
export default router;
