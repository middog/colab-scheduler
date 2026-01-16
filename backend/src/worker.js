/**
 * SQS Worker Lambda
 * 
 * Processes queued tasks from the integrations queue (Slack, Email notifications).
 * Triggered by SQS event source mapping.
 * 
 * Task Types:
 * - slack.newBooking
 * - slack.approved
 * - slack.rejected
 * - slack.cancelled
 * - email.bookingApproved
 * - email.bookingRejected
 * 
 * @version 4.2.0-rc69.15
 */

import { slackService } from './integrations/slack.js';
import { sendEmail } from './integrations/email.js';

// =============================================================================
// Task Handlers
// =============================================================================

const taskHandlers = {
  // Slack notifications
  'slack.newBooking': async (payload) => {
    const { booking } = payload;
    return slackService.notifyNewBooking(booking);
  },
  
  'slack.approved': async (payload) => {
    const { booking, approvedBy } = payload;
    return slackService.notifyApproved(booking, approvedBy);
  },
  
  'slack.rejected': async (payload) => {
    const { booking, rejectedBy, reason } = payload;
    return slackService.notifyRejected(booking, rejectedBy, reason);
  },
  
  'slack.cancelled': async (payload) => {
    const { booking, cancelledBy } = payload;
    return slackService.notifyCancelled(booking, cancelledBy);
  },
  
  // Email notifications
  'email.bookingApproved': async (payload) => {
    const { to, templateData } = payload;
    return sendEmail(to, 'bookingApproved', templateData);
  },
  
  'email.bookingRejected': async (payload) => {
    const { to, templateData } = payload;
    return sendEmail(to, 'bookingRejected', templateData);
  }
};

// =============================================================================
// Message Processor
// =============================================================================

const processMessage = async (message) => {
  const body = JSON.parse(message.body);
  const { taskType, payload, traceId, enqueuedAt } = body;
  
  const handler = taskHandlers[taskType];
  
  if (!handler) {
    console.error(`❌ Unknown task type: ${taskType}`);
    // Don't throw - let message go to DLQ after retries
    return { success: false, error: 'Unknown task type' };
  }
  
  const startTime = Date.now();
  
  try {
    console.log(`📥 Processing: ${taskType} (trace: ${traceId})`);
    console.log(`   Queued at: ${enqueuedAt}, latency: ${startTime - new Date(enqueuedAt).getTime()}ms`);
    
    const result = await handler(payload);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Completed: ${taskType} in ${duration}ms`);
    
    return { success: true, result, duration };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Failed: ${taskType} in ${duration}ms - ${error.message}`);
    
    // Throw to trigger SQS retry
    throw error;
  }
};

// =============================================================================
// Lambda Handler
// =============================================================================

export const handler = async (event) => {
  console.log(`🔧 Worker invoked with ${event.Records.length} message(s)`);
  
  const results = {
    batchSize: event.Records.length,
    succeeded: 0,
    failed: 0,
    batchItemFailures: []
  };
  
  // Process messages in parallel (SQS Lambda handles batching)
  const promises = event.Records.map(async (record) => {
    try {
      await processMessage(record);
      results.succeeded++;
      return { messageId: record.messageId, success: true };
    } catch (error) {
      results.failed++;
      // Return messageId for partial batch failure
      results.batchItemFailures.push({
        itemIdentifier: record.messageId
      });
      return { messageId: record.messageId, success: false, error: error.message };
    }
  });
  
  await Promise.all(promises);
  
  console.log(`📊 Batch complete: ${results.succeeded} succeeded, ${results.failed} failed`);
  
  // Return partial batch failure response
  // This tells SQS which messages to retry
  if (results.batchItemFailures.length > 0) {
    return { batchItemFailures: results.batchItemFailures };
  }
  
  return { statusCode: 200, body: 'OK' };
};

export default { handler };
