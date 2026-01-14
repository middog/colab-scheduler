/**
 * SDCoLab Scheduler - Notifications Routes
 * 
 * User notification preferences and reminder system:
 * - Booking reminders (configurable timing)
 * - Certification expiry warnings
 * - System announcements
 * - User preference management
 * 
 * 🔥 Fire Triangle: OXYGEN layer - communication flow
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config, isFeatureEnabled } from '../lib/config.js';
import { userService, activityService, bookingService } from '../lib/database.js';
import { ErrorCodes, sendSuccess, sendError } from '../lib/responses.js';
import { authenticate, requireAdmin, requireSchedulerKeyOrAdmin } from '../middleware/auth.js';
import { sendEmail } from '../integrations/email.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const router = Router();

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const NOTIFICATIONS_TABLE = config.aws.tables.notifications || config.aws.tables.activity || 'colab-scheduler-notifications';

// =============================================================================
// User Notification Preferences
// =============================================================================

/**
 * GET /api/notifications/preferences
 * Get current user's notification preferences
 */
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const user = await userService.get(req.user.email);
    
    // Default preferences if not set
    const defaults = {
      email: {
        enabled: true,
        bookingReminders: true,
        bookingReminderTiming: 24, // hours before
        certExpiryWarnings: true,
        certExpiryTiming: 30, // days before
        weeklyDigest: false,
        announcements: true
      },
      sms: {
        enabled: false,
        bookingReminders: false,
        bookingReminderTiming: 2, // hours before
        urgentOnly: true
      },
      push: {
        enabled: false,
        bookingReminders: false,
        announcements: true
      },
      inApp: {
        enabled: true,
        showBadges: true
      }
    };
    
    const preferences = {
      ...defaults,
      ...(user?.preferences?.notifications || {})
    };
    
    sendSuccess(res, { preferences });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get preferences');
  }
});

/**
 * PUT /api/notifications/preferences
 * Update notification preferences
 */
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { email, sms, push, inApp } = req.body;
    
    const user = await userService.get(req.user.email);
    const currentPrefs = user?.preferences || {};
    
    const updatedPrefs = {
      ...currentPrefs,
      notifications: {
        ...currentPrefs.notifications,
        ...(email && { email }),
        ...(sms && { sms }),
        ...(push && { push }),
        ...(inApp && { inApp })
      }
    };
    
    await userService.update(req.user.email, { preferences: updatedPrefs }, req.user);
    
    await activityService.log('user.updated_notification_prefs', req.user, {
      type: 'user',
      id: req.user.email
    }, { channels: Object.keys(req.body) });
    
    sendSuccess(res, { preferences: updatedPrefs.notifications, message: 'Preferences updated' });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update preferences');
  }
});

// =============================================================================
// Notification History
// =============================================================================

/**
 * GET /api/notifications
 * Get user's notifications
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { unreadOnly, limit = 50 } = req.query;
    
    let filterExpression = '#userId = :userId';
    const names = { '#userId': 'userId' };
    const values = { ':userId': req.user.email };
    
    if (unreadOnly === 'true') {
      filterExpression += ' AND #read = :read';
      names['#read'] = 'read';
      values[':read'] = false;
    }
    
    const response = await docClient.send(new ScanCommand({
      TableName: NOTIFICATIONS_TABLE,
      FilterExpression: filterExpression + ' AND #type = :type',
      ExpressionAttributeNames: { ...names, '#type': 'recordType' },
      ExpressionAttributeValues: { ...values, ':type': 'notification' },
      Limit: parseInt(limit)
    }));
    
    const notifications = (response.Items || [])
      .sort((a, b) => b.createdAt?.localeCompare(a.createdAt));
    
    const unreadCount = notifications.filter(n => !n.read).length;
    
    sendSuccess(res, { notifications, unreadCount, total: notifications.length });
  } catch (error) {
    console.error('Get notifications error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get notifications');
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark notification as read
 */
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    await docClient.send(new UpdateCommand({
      TableName: NOTIFICATIONS_TABLE,
      Key: { id },
      UpdateExpression: 'SET #read = :read, #readAt = :readAt',
      ExpressionAttributeNames: { '#read': 'read', '#readAt': 'readAt' },
      ExpressionAttributeValues: { ':read': true, ':readAt': new Date().toISOString() }
    }));
    
    sendSuccess(res, { success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to mark as read');
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', authenticate, async (req, res) => {
  try {
    const response = await docClient.send(new ScanCommand({
      TableName: NOTIFICATIONS_TABLE,
      FilterExpression: '#userId = :userId AND #read = :read AND #type = :type',
      ExpressionAttributeNames: { '#userId': 'userId', '#read': 'read', '#type': 'recordType' },
      ExpressionAttributeValues: { ':userId': req.user.email, ':read': false, ':type': 'notification' }
    }));
    
    const now = new Date().toISOString();
    
    for (const notification of (response.Items || [])) {
      await docClient.send(new UpdateCommand({
        TableName: NOTIFICATIONS_TABLE,
        Key: { id: notification.id },
        UpdateExpression: 'SET #read = :read, #readAt = :readAt',
        ExpressionAttributeNames: { '#read': 'read', '#readAt': 'readAt' },
        ExpressionAttributeValues: { ':read': true, ':readAt': now }
      }));
    }
    
    sendSuccess(res, { success: true, markedCount: response.Items?.length || 0 });
  } catch (error) {
    console.error('Mark all read error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to mark all as read');
  }
});

// =============================================================================
// Reminder System (called by scheduled Lambda or cron)
// =============================================================================

/**
 * POST /api/notifications/send-reminders
 * Send booking reminders (called by scheduler)
 * Protected by API key or admin auth
 */
router.post('/send-reminders', requireSchedulerKeyOrAdmin, async (req, res) => {
  try {
    const { type = 'booking' } = req.body;
    const results = { sent: [], skipped: [], failed: [] };
    
    if (type === 'booking') {
      // Get tomorrow's bookings
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const bookings = await bookingService.getByDate(tomorrowStr);
      const approvedBookings = bookings.filter(b => b.status === 'approved');
      
      for (const booking of approvedBookings) {
        try {
          const user = await userService.get(booking.userEmail);
          const prefs = user?.preferences?.notifications?.email;
          
          // Check if user wants reminders
          if (!prefs?.enabled || !prefs?.bookingReminders) {
            results.skipped.push({ bookingId: booking.id, reason: 'User disabled reminders' });
            continue;
          }
          
          // Send reminder email
          const emailResult = await sendEmail(booking.userEmail, 'bookingReminder', {
            userName: user?.displayName || booking.userName,
            toolName: booking.resourceName,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            calendarLink: booking.calendarEventUrl
          });
          
          if (emailResult.success) {
            results.sent.push({ bookingId: booking.id, userEmail: booking.userEmail });
            
            // Create in-app notification
            await docClient.send(new PutCommand({
              TableName: NOTIFICATIONS_TABLE,
              Item: {
                id: `notif-${uuidv4()}`,
                recordType: 'notification',
                userId: booking.userEmail,
                type: 'booking_reminder',
                title: 'Upcoming Booking',
                message: `Reminder: You have a ${booking.resourceName} booking tomorrow at ${booking.startTime}`,
                data: { bookingId: booking.id, resourceId: booking.resourceId },
                read: false,
                createdAt: new Date().toISOString()
              }
            }));
          } else {
            results.failed.push({ bookingId: booking.id, error: emailResult.error });
          }
        } catch (err) {
          results.failed.push({ bookingId: booking.id, error: err.message });
        }
      }
    }
    
    sendSuccess(res, {
      success: true,
      type,
      results,
      summary: {
        sent: results.sent.length,
        skipped: results.skipped.length,
        failed: results.failed.length
      }
    });
  } catch (error) {
    console.error('Send reminders error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to send reminders');
  }
});

/**
 * POST /api/notifications/send-cert-warnings
 * Send certification expiry warnings
 */
router.post('/send-cert-warnings', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== config.scheduler.apiKey) {
      return sendError(res, ErrorCodes.UNAUTHORIZED, 'Not authorized');
    }
    
    const results = { sent: [], skipped: [], failed: [] };
    const now = new Date();
    
    // Get all users
    const users = await userService.getAll({ status: 'active' });
    
    for (const user of users) {
      try {
        const prefs = user?.preferences?.notifications?.email;
        const warningDays = prefs?.certExpiryTiming || 30;
        
        // Skip if user has disabled cert warnings
        if (prefs?.enabled === false || prefs?.certExpiryWarnings === false) {
          continue;
        }
        
        // Query user's certifications
        const certResponse = await docClient.send(new ScanCommand({
          TableName: config.aws.tables.certifications,
          FilterExpression: '#userId = :userId AND #type = :type AND #status = :status',
          ExpressionAttributeNames: { 
            '#userId': 'userId', 
            '#type': 'recordType',
            '#status': 'status'
          },
          ExpressionAttributeValues: { 
            ':userId': user.email,
            ':type': 'certification',
            ':status': 'active'
          }
        }));
        
        const certs = certResponse.Items || [];
        
        // Find expiring certifications
        const expiringCerts = certs.filter(cert => {
          if (!cert.expiresAt) return false;
          const expiresAt = new Date(cert.expiresAt);
          const daysUntilExpiry = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
          return daysUntilExpiry > 0 && daysUntilExpiry <= warningDays;
        });
        
        if (expiringCerts.length === 0) {
          continue;
        }
        
        // Send warning email
        const certList = expiringCerts.map(c => {
          const daysLeft = Math.ceil((new Date(c.expiresAt) - now) / (1000 * 60 * 60 * 24));
          return `• ${c.toolName || c.toolId}: expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
        }).join('\n');
        
        const emailResult = await sendEmail(user.email, 'announcement', {
          userName: user.displayName || user.firstName || user.email.split('@')[0],
          title: '⚠️ Certification Expiry Warning',
          message: `The following certifications are expiring soon:\n\n${certList}\n\nPlease contact a steward to schedule recertification training.`
        });
        
        if (emailResult.success) {
          results.sent.push({ 
            userEmail: user.email, 
            certCount: expiringCerts.length,
            certs: expiringCerts.map(c => c.toolId)
          });
          
          // Create in-app notification
          await docClient.send(new PutCommand({
            TableName: NOTIFICATIONS_TABLE,
            Item: {
              id: `notif-${uuidv4()}`,
              recordType: 'notification',
              userId: user.email,
              type: 'cert_expiry_warning',
              title: 'Certification Expiring Soon',
              message: `You have ${expiringCerts.length} certification${expiringCerts.length > 1 ? 's' : ''} expiring within ${warningDays} days`,
              data: { certIds: expiringCerts.map(c => c.id) },
              read: false,
              createdAt: now.toISOString()
            }
          }));
        } else {
          results.failed.push({ userEmail: user.email, error: emailResult.error });
        }
      } catch (err) {
        results.failed.push({ userEmail: user.email, error: err.message });
      }
    }
    
    sendSuccess(res, {
      success: true,
      type: 'cert_warnings',
      results,
      summary: {
        usersChecked: users.length,
        sent: results.sent.length,
        skipped: results.skipped.length,
        failed: results.failed.length
      }
    });
  } catch (error) {
    console.error('Send cert warnings error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to send warnings');
  }
});

// =============================================================================
// Admin: Send Announcement
// =============================================================================

/**
 * POST /api/notifications/announce
 * Send announcement to all users or a group
 */
router.post('/announce', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, message, targetRoles, targetEmails, channels = ['inApp'] } = req.body;
    
    if (!title || !message) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'title and message are required');
    }
    
    // Get target users
    let users = [];
    if (targetEmails?.length > 0) {
      for (const email of targetEmails) {
        const user = await userService.get(email);
        if (user) users.push(user);
      }
    } else {
      const allUsers = await userService.getAll({ status: 'active' });
      if (targetRoles?.length > 0) {
        users = allUsers.filter(u => targetRoles.includes(u.role));
      } else {
        users = allUsers;
      }
    }
    
    const results = { inApp: 0, email: 0, failed: 0 };
    const now = new Date().toISOString();
    
    for (const user of users) {
      try {
        // In-app notification
        if (channels.includes('inApp')) {
          await docClient.send(new PutCommand({
            TableName: NOTIFICATIONS_TABLE,
            Item: {
              id: `notif-${uuidv4()}`,
              recordType: 'notification',
              userId: user.email,
              type: 'announcement',
              title,
              message,
              data: { announcedBy: req.user.email },
              read: false,
              createdAt: now
            }
          }));
          results.inApp++;
        }
        
        // Email
        if (channels.includes('email')) {
          const prefs = user.preferences?.notifications?.email;
          if (prefs?.enabled && prefs?.announcements) {
            await sendEmail(user.email, 'announcement', {
              userName: user.displayName,
              title,
              message
            });
            results.email++;
          }
        }
      } catch (err) {
        results.failed++;
        console.error(`Failed to notify ${user.email}:`, err);
      }
    }
    
    await activityService.log('admin.sent_announcement', req.user, {
      type: 'announcement',
      name: title
    }, { targetCount: users.length, channels, results });
    
    sendSuccess(res, {
      success: true,
      message: `Announcement sent to ${users.length} users`,
      results
    });
  } catch (error) {
    console.error('Send announcement error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to send announcement');
  }
});

// =============================================================================
// Integration Health Dashboard
// =============================================================================

// In-memory store for integration health (in production, use DynamoDB)
const integrationHealth = {
  email: { lastSuccess: null, lastFailure: null, failureCount: 0, status: 'unknown' },
  slack: { lastSuccess: null, lastFailure: null, failureCount: 0, status: 'unknown' },
  github: { lastSuccess: null, lastFailure: null, failureCount: 0, status: 'unknown' },
  googleCalendar: { lastSuccess: null, lastFailure: null, failureCount: 0, status: 'unknown' }
};

// Track integration success/failure (called from integration modules)
export const trackIntegrationHealth = (integration, success, error = null) => {
  if (!integrationHealth[integration]) return;
  
  const now = new Date().toISOString();
  if (success) {
    integrationHealth[integration].lastSuccess = now;
    integrationHealth[integration].failureCount = 0;
    integrationHealth[integration].status = 'healthy';
  } else {
    integrationHealth[integration].lastFailure = now;
    integrationHealth[integration].failureCount++;
    integrationHealth[integration].lastError = error?.message || 'Unknown error';
    integrationHealth[integration].status = integrationHealth[integration].failureCount >= 3 ? 'unhealthy' : 'degraded';
  }
};

/**
 * GET /api/notifications/integrations/health
 * Get integration health status for admin dashboard
 */
router.get('/integrations/health', authenticate, requireAdmin, async (req, res) => {
  try {
    // Check enabled integrations
    const integrations = {
      email: {
        enabled: isFeatureEnabled('email'),
        ...integrationHealth.email,
        config: {
          fromAddress: config.email?.fromAddress ? '✓ configured' : '✗ missing',
          sesRegion: config.email?.sesRegion || config.aws.region
        }
      },
      slack: {
        enabled: isFeatureEnabled('slack'),
        ...integrationHealth.slack,
        config: {
          webhookUrl: config.slack?.webhookUrl ? '✓ configured' : '✗ missing',
          channel: config.slack?.channel || '#general'
        }
      },
      github: {
        enabled: isFeatureEnabled('github'),
        ...integrationHealth.github,
        config: {
          token: config.github?.token ? '✓ configured' : '✗ missing',
          repo: config.github?.repo ? `${config.github.org}/${config.github.repo}` : '✗ missing'
        }
      },
      googleCalendar: {
        enabled: isFeatureEnabled('googleCalendar'),
        ...integrationHealth.googleCalendar,
        config: {
          authMethod: config.gcal?.authMethod || 'none',
          serviceAccount: config.gcal?.clientEmail ? '✓ configured' : '✗ missing',
          calendarId: config.gcal?.primaryCalendarId || 'primary'
        }
      }
    };
    
    // Check OAuth providers
    const authProviders = {
      google: {
        enabled: config.auth?.google?.enabled || false,
        clientId: config.auth?.google?.clientId ? '✓ configured' : '✗ missing'
      },
      microsoft: {
        enabled: config.auth?.microsoft?.enabled || false,
        clientId: config.auth?.microsoft?.clientId ? '✓ configured' : '✗ missing'
      },
      github: {
        enabled: config.auth?.github?.enabled || false,
        clientId: config.auth?.github?.clientId ? '✓ configured' : '✗ missing'
      }
    };
    
    // Scheduled jobs status
    const scheduledJobs = {
      bookingReminders: {
        enabled: true,
        schedule: 'Daily at 9 AM UTC',
        description: 'Sends booking reminders to users with upcoming bookings'
      },
      certExpiryWarnings: {
        enabled: true,
        schedule: 'Weekly on Mondays at 9 AM UTC',
        description: 'Warns users about expiring certifications'
      }
    };
    
    // Overall health
    const healthyCount = Object.values(integrations)
      .filter(i => i.enabled && i.status === 'healthy').length;
    const enabledCount = Object.values(integrations)
      .filter(i => i.enabled).length;
    
    const overallStatus = enabledCount === 0 ? 'no_integrations' :
      healthyCount === enabledCount ? 'healthy' :
      healthyCount > 0 ? 'degraded' : 'unhealthy';
    
    sendSuccess(res, {
      overallStatus,
      integrations,
      authProviders,
      scheduledJobs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get integration health error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get integration health');
  }
});

/**
 * POST /api/notifications/integrations/test/:integration
 * Test a specific integration
 */
router.post('/integrations/test/:integration', authenticate, requireAdmin, async (req, res) => {
  try {
    const { integration } = req.params;
    
    let result = { success: false, message: 'Unknown integration' };
    
    switch (integration) {
      case 'email':
        if (!isFeatureEnabled('email')) {
          result = { success: false, message: 'Email integration not enabled' };
        } else {
          try {
            await sendEmail({
              to: req.user.email,
              subject: '[SDCoLab] Integration Test',
              template: 'announcement',
              data: {
                title: 'Integration Test',
                message: 'This is a test email from the SDCoLab Scheduler integration health dashboard.',
                actionUrl: config.frontendUrl,
                actionText: 'Open Scheduler'
              }
            });
            result = { success: true, message: `Test email sent to ${req.user.email}` };
            trackIntegrationHealth('email', true);
          } catch (err) {
            result = { success: false, message: err.message };
            trackIntegrationHealth('email', false, err);
          }
        }
        break;
        
      case 'slack':
        if (!isFeatureEnabled('slack')) {
          result = { success: false, message: 'Slack integration not enabled' };
        } else {
          try {
            const { postSlackMessage } = await import('../integrations/slack.js');
            await postSlackMessage({
              text: '🔧 *Integration Test*\nThis is a test message from the SDCoLab Scheduler admin dashboard.'
            });
            result = { success: true, message: 'Test message posted to Slack' };
            trackIntegrationHealth('slack', true);
          } catch (err) {
            result = { success: false, message: err.message };
            trackIntegrationHealth('slack', false, err);
          }
        }
        break;
        
      default:
        result = { success: false, message: `Testing ${integration} not implemented` };
    }
    
    await activityService.log('admin.integration_test', req.user, {
      type: 'integration',
      id: integration,
      name: integration
    }, result);
    
    sendSuccess(res, result);
  } catch (error) {
    console.error('Test integration error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to test integration');
  }
});

export default router;
