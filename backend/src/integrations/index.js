/**
 * Integration Orchestrator (Hardened)
 * 
 * Manages all external integrations as hooks that fire on booking events.
 * Enhanced with:
 * - Timeouts on all external calls (5s default, 10s for critical)
 * - Retry with exponential backoff
 * - Circuit breakers per integration
 * - SQS queue for non-critical notifications
 * 
 * 🔥 Fire Triangle: OXYGEN layer - connectivity and flow
 * 
 * @version 4.2.0
 */

import { isFeatureEnabled } from '../lib/config.js';
import { googleCalendarService } from './googleCalendar.js';
import { githubService } from './github.js';
import { slackService } from './slack.js';
import { sendEmail } from './email.js';
import { userService } from '../lib/database.js';
import { 
  resilientCall, 
  circuitBreakers, 
  asyncQueue,
  getCircuitBreakerStatus 
} from '../lib/resilience.js';

// =============================================================================
// Configuration
// =============================================================================

const INTEGRATION_TIMEOUT_MS = 5000;  // 5 seconds per integration call
const CRITICAL_TIMEOUT_MS = 10000;    // 10 seconds for critical ops (calendar)
const RETRY_ATTEMPTS = 2;             // Quick retries for hooks

// =============================================================================
// Resilient Integration Wrappers
// =============================================================================

const resilientGCal = async (operation, operationName) => {
  return resilientCall(operation, {
    circuitBreaker: circuitBreakers.googleCalendar,
    timeoutMs: CRITICAL_TIMEOUT_MS,
    retryAttempts: RETRY_ATTEMPTS,
    operationName: `GCal: ${operationName}`,
    critical: false
  });
};

const resilientGitHub = async (operation, operationName) => {
  return resilientCall(operation, {
    circuitBreaker: circuitBreakers.github,
    timeoutMs: INTEGRATION_TIMEOUT_MS,
    retryAttempts: RETRY_ATTEMPTS,
    operationName: `GitHub: ${operationName}`,
    critical: false
  });
};

const queueSlackNotification = async (taskName, payload) => {
  // Extract data-only payload (no functions)
  const { booking, approvedBy, rejectedBy, cancelledBy, reason } = payload;
  const dataPayload = { booking, approvedBy, rejectedBy, cancelledBy, reason };
  
  if (asyncQueue.isConfigured()) {
    return asyncQueue.enqueue(`slack.${taskName}`, dataPayload);
  }
  
  // Fallback: execute inline in dev (with resilience)
  console.warn(`⚠️ SQS not configured - executing Slack notification inline`);
  try {
    const result = await resilientCall(() => payload.execute(), {
      circuitBreaker: circuitBreakers.slack,
      timeoutMs: INTEGRATION_TIMEOUT_MS,
      retryAttempts: RETRY_ATTEMPTS,
      operationName: `Slack: ${taskName}`,
      critical: false
    });
    return { queued: false, fallback: true, result };
  } catch (error) {
    console.error(`❌ Slack fallback failed: ${error.message}`);
    return { queued: false, fallback: true, error: error.message };
  }
};

const queueEmailNotification = async (taskName, payload) => {
  // Extract data-only payload (no functions)
  const { to, templateData } = payload;
  const dataPayload = { to, templateData };
  
  if (asyncQueue.isConfigured()) {
    return asyncQueue.enqueue(`email.${taskName}`, dataPayload);
  }
  
  // Fallback: execute inline in dev (with resilience)
  console.warn(`⚠️ SQS not configured - executing Email notification inline`);
  try {
    const result = await resilientCall(() => payload.execute(), {
      circuitBreaker: circuitBreakers.email,
      timeoutMs: INTEGRATION_TIMEOUT_MS,
      retryAttempts: RETRY_ATTEMPTS,
      operationName: `Email: ${taskName}`,
      critical: false
    });
    return { queued: false, fallback: true, result };
  } catch (error) {
    console.error(`❌ Email fallback failed: ${error.message}`);
    return { queued: false, fallback: true, error: error.message };
  }
};

const resilientEmail = async (operation, operationName, critical = false) => {
  return resilientCall(operation, {
    circuitBreaker: circuitBreakers.email,
    timeoutMs: INTEGRATION_TIMEOUT_MS,
    retryAttempts: critical ? 3 : RETRY_ATTEMPTS,
    operationName: `Email: ${operationName}`,
    critical
  });
};

// =============================================================================
// Hook Runner
// =============================================================================

const runHooks = async (hookName, ...args) => {
  const results = {};
  const startTime = Date.now();
  
  console.log(`🪝 Running hooks: ${hookName}`);
  
  const hooks = getHooksFor(hookName);
  
  if (hooks.length === 0) {
    console.log(`   (no hooks registered)`);
    return results;
  }
  
  const settledResults = await Promise.allSettled(
    hooks.map(async ({ name, fn }) => {
      const hookStart = Date.now();
      try {
        const result = await fn(...args);
        const duration = Date.now() - hookStart;
        console.log(`  ✅ ${name} (${duration}ms)`);
        return { name, result, duration };
      } catch (error) {
        const duration = Date.now() - hookStart;
        console.error(`  ❌ ${name} (${duration}ms): ${error.message}`);
        return { name, error: error.message, duration };
      }
    })
  );
  
  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      const { name, result, error } = settled.value;
      results[name] = error ? { error } : result;
    }
  }
  
  const totalDuration = Date.now() - startTime;
  console.log(`🪝 Hooks completed: ${hookName} (${totalDuration}ms)`);
  
  return results;
};

// =============================================================================
// Hook Definitions
// =============================================================================

const getHooksFor = (hookName) => {
  const hooks = [];
  
  switch (hookName) {
    case 'booking.created':
      if (isFeatureEnabled('github')) {
        hooks.push({
          name: 'github',
          fn: async (booking) => resilientGitHub(
            () => githubService.createBookingIssue(booking),
            'createBookingIssue'
          )
        });
      }
      if (isFeatureEnabled('slack')) {
        hooks.push({
          name: 'slack',
          fn: async (booking) => queueSlackNotification('newBooking', {
            booking,
            execute: () => slackService.notifyNewBooking(booking)
          })
        });
      }
      break;
      
    case 'booking.approved':
      if (isFeatureEnabled('googleCalendar')) {
        hooks.push({
          name: 'gcal',
          fn: async (booking) => resilientGCal(
            () => googleCalendarService.createBookingEvent(booking),
            'createBookingEvent'
          )
        });
      }
      if (isFeatureEnabled('github')) {
        hooks.push({
          name: 'github',
          fn: async (booking, approvedBy) => resilientGitHub(async () => {
            if (booking.githubIssueNumber) {
              await githubService.updateBookingIssue(booking.githubIssueNumber, booking);
              await githubService.addIssueComment(
                booking.githubIssueNumber, 
                githubService.comments.approved(booking, approvedBy)
              );
            }
            return { updated: true };
          }, 'approveBookingIssue')
        });
      }
      if (isFeatureEnabled('slack')) {
        hooks.push({
          name: 'slack',
          fn: async (booking, approvedBy) => queueSlackNotification('approved', {
            booking,
            approvedBy,
            execute: () => slackService.notifyApproved(booking, approvedBy)
          })
        });
      }
      if (isFeatureEnabled('email')) {
        hooks.push({
          name: 'email',
          fn: async (booking) => {
            const user = await userService.get(booking.userEmail);
            const prefs = user?.preferences?.notifications?.email;
            if (prefs?.enabled === false) {
              return { sent: false, reason: 'user_disabled_email' };
            }
            const templateData = {
              userName: user?.displayName || booking.userName || booking.userEmail.split('@')[0],
              toolName: booking.resourceName || booking.toolName,
              date: booking.date,
              startTime: booking.startTime,
              endTime: booking.endTime,
              calendarLink: booking.calendarEventUrl || null
            };
            return queueEmailNotification('bookingApproved', {
              to: booking.userEmail,
              templateData,
              execute: () => sendEmail(booking.userEmail, 'bookingApproved', templateData)
            });
          }
        });
      }
      break;
      
    case 'booking.rejected':
      if (isFeatureEnabled('github')) {
        hooks.push({
          name: 'github',
          fn: async (booking, rejectedBy, reason) => resilientGitHub(async () => {
            if (booking.githubIssueNumber) {
              await githubService.updateBookingIssue(booking.githubIssueNumber, booking);
              await githubService.addIssueComment(
                booking.githubIssueNumber,
                githubService.comments.rejected(booking, rejectedBy, reason)
              );
            }
            return { updated: true };
          }, 'rejectBookingIssue')
        });
      }
      if (isFeatureEnabled('slack')) {
        hooks.push({
          name: 'slack',
          fn: async (booking, rejectedBy, reason) => queueSlackNotification('rejected', {
            booking,
            execute: () => slackService.notifyRejected(booking, rejectedBy, reason)
          })
        });
      }
      if (isFeatureEnabled('email')) {
        hooks.push({
          name: 'email',
          fn: async (booking, rejectedBy, reason) => {
            const user = await userService.get(booking.userEmail);
            const prefs = user?.preferences?.notifications?.email;
            if (prefs?.enabled === false) {
              return { sent: false, reason: 'user_disabled_email' };
            }
            const templateData = {
              userName: user?.displayName || booking.userName || booking.userEmail.split('@')[0],
              toolName: booking.resourceName || booking.toolName,
              date: booking.date,
              startTime: booking.startTime,
              endTime: booking.endTime,
              reason: reason || 'No reason provided'
            };
            return queueEmailNotification('bookingRejected', {
              to: booking.userEmail,
              templateData,
              execute: () => sendEmail(booking.userEmail, 'bookingRejected', templateData)
            });
          }
        });
      }
      break;
      
    case 'booking.updated':
      if (isFeatureEnabled('googleCalendar')) {
        hooks.push({
          name: 'gcal',
          fn: async (booking) => {
            if (booking.calendarEventId) {
              return resilientGCal(
                () => googleCalendarService.updateBookingEvent(booking.calendarEventId, booking),
                'updateBookingEvent'
              );
            }
            return null;
          }
        });
      }
      if (isFeatureEnabled('github')) {
        hooks.push({
          name: 'github',
          fn: async (booking, updatedBy) => resilientGitHub(async () => {
            if (booking.githubIssueNumber) {
              await githubService.updateBookingIssue(booking.githubIssueNumber, booking);
              await githubService.addIssueComment(
                booking.githubIssueNumber,
                githubService.comments.updated(booking, updatedBy)
              );
            }
            return { updated: true };
          }, 'updateBookingIssue')
        });
      }
      break;
      
    case 'booking.cancelled':
      if (isFeatureEnabled('googleCalendar')) {
        hooks.push({
          name: 'gcal',
          fn: async (booking) => {
            if (booking.calendarEventId) {
              return resilientGCal(
                () => googleCalendarService.deleteBookingEvent(booking.calendarEventId),
                'deleteBookingEvent'
              );
            }
            return { skipped: true };
          }
        });
      }
      if (isFeatureEnabled('github')) {
        hooks.push({
          name: 'github',
          fn: async (booking, cancelledBy) => resilientGitHub(async () => {
            if (booking.githubIssueNumber) {
              await githubService.updateBookingIssue(booking.githubIssueNumber, { ...booking, status: 'cancelled' });
              await githubService.addIssueComment(
                booking.githubIssueNumber,
                githubService.comments.cancelled(booking, cancelledBy)
              );
            }
            return { updated: true };
          }, 'cancelBookingIssue')
        });
      }
      if (isFeatureEnabled('slack')) {
        hooks.push({
          name: 'slack',
          fn: async (booking, cancelledBy) => queueSlackNotification('cancelled', {
            booking,
            execute: () => slackService.notifyCancelled(booking, cancelledBy)
          })
        });
      }
      break;
      
    case 'user.invited':
      if (isFeatureEnabled('email')) {
        hooks.push({
          name: 'email',
          fn: async (invite, inviter) => resilientEmail(
            () => sendEmail(invite.email, 'invite', {
              inviteUrl: invite.inviteUrl,
              inviterName: inviter?.displayName || inviter?.email || 'An administrator',
              role: invite.role || 'member',
              message: invite.message || null,
              toolCount: invite.preCertifications?.length || 0
            }),
            'userInvite',
            true
          )
        });
      }
      break;
      
    case 'user.created':
      if (isFeatureEnabled('email')) {
        hooks.push({
          name: 'email',
          fn: async (user, tempPassword, loginUrl) => {
            if (tempPassword) {
              return resilientEmail(
                () => sendEmail(user.email, 'userCreated', {
                  displayName: user.displayName || user.firstName || user.email.split('@')[0],
                  email: user.email,
                  tempPassword,
                  loginUrl
                }),
                'userCreated',
                true
              );
            }
            return { skipped: true };
          }
        });
      }
      break;
      
    case 'password.reset_requested':
      if (isFeatureEnabled('email')) {
        hooks.push({
          name: 'email',
          fn: async (user, resetUrl) => resilientEmail(
            () => sendEmail(user.email, 'passwordReset', {
              displayName: user.displayName || user.firstName || user.email.split('@')[0],
              resetUrl
            }),
            'passwordReset',
            true
          )
        });
      }
      break;
  }
  
  return hooks;
};

// =============================================================================
// Integration Hooks API
// =============================================================================

export const integrations = {
  async onBookingCreated(booking) {
    const results = await runHooks('booking.created', booking);
    return {
      githubIssueNumber: results.github?.issueNumber || results.github?.number,
      githubIssueUrl: results.github?.issueUrl || results.github?.url
    };
  },
  
  async onBookingApproved(booking, approvedBy) {
    const results = await runHooks('booking.approved', booking, approvedBy);
    return {
      calendarEventId: results.gcal?.eventId,
      calendarEventUrl: results.gcal?.htmlLink,
      resourceCalendar: results.gcal?.resourceCalendar,
      emailSent: results.email?.success || false
    };
  },
  
  async onBookingRejected(booking, rejectedBy, reason) {
    const results = await runHooks('booking.rejected', booking, rejectedBy, reason);
    return { emailSent: results.email?.success || false };
  },
  
  async onBookingUpdated(booking, updatedBy) {
    const results = await runHooks('booking.updated', booking, updatedBy);
    return { calendarEventUrl: results.gcal?.htmlLink };
  },
  
  async onBookingCancelled(booking, cancelledBy) {
    return runHooks('booking.cancelled', booking, cancelledBy);
  },
  
  async onUserInvited(invite, inviter) {
    const results = await runHooks('user.invited', invite, inviter);
    return { emailSent: results.email?.success || false };
  },
  
  async onUserCreated(user, tempPassword, loginUrl) {
    const results = await runHooks('user.created', user, tempPassword, loginUrl);
    return { emailSent: results.email?.success || false };
  },
  
  async onPasswordResetRequested(user, resetUrl) {
    const results = await runHooks('password.reset_requested', user, resetUrl);
    return { emailSent: results.email?.success || false };
  },
  
  getStatus() {
    return {
      googleCalendar: {
        enabled: isFeatureEnabled('googleCalendar'),
        initialized: googleCalendarService.initialized,
        circuit: circuitBreakers.googleCalendar.getStatus()
      },
      github: {
        enabled: isFeatureEnabled('github'),
        initialized: githubService.initialized,
        circuit: circuitBreakers.github.getStatus()
      },
      slack: {
        enabled: isFeatureEnabled('slack'),
        initialized: slackService.initialized,
        circuit: circuitBreakers.slack.getStatus()
      },
      email: {
        enabled: isFeatureEnabled('email'),
        initialized: true,
        circuit: circuitBreakers.email.getStatus()
      }
    };
  },
  
  getCircuitStatus() {
    return getCircuitBreakerStatus();
  },
  
  resetCircuit(name) {
    if (circuitBreakers[name]) {
      circuitBreakers[name].reset();
      return true;
    }
    return false;
  }
};

export default integrations;
