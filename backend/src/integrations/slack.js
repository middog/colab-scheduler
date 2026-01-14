/**
 * Slack Integration
 * 
 * Sends notifications to Slack for booking events.
 * 
 * 🔥 Fire Triangle: HEAT layer - community communication
 */

import { config, isFeatureEnabled, getToolById } from '../lib/config.js';

class SlackService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize Slack client
   */
  init() {
    if (!isFeatureEnabled('slack')) {
      console.log('💬 Slack integration disabled');
      return false;
    }

    if (!config.slack.webhookUrl) {
      console.error('❌ Slack webhook URL not configured');
      return false;
    }

    this.initialized = true;
    console.log('✅ Slack integration initialized');
    return true;
  }

  /**
   * Send message to Slack
   */
  async send(payload) {
    if (!this.initialized && !this.init()) {
      return false;
    }

    const message = {
      username: config.slack.username,
      icon_emoji: config.slack.iconEmoji,
      channel: config.slack.channel,
      ...payload
    };

    try {
      const response = await fetch(config.slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.status}`);
      }

      console.log('💬 Slack notification sent');
      return true;
    } catch (error) {
      console.error('❌ Slack notification failed:', error.message);
      return false;
    }
  }

  /**
   * Format time for display
   */
  formatTime(t) {
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  /**
   * Build booking summary block
   */
  bookingBlock(booking) {
    const tool = getToolById(booking.tool);
    return {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Tool:*\n🔧 ${booking.toolName}` },
        { type: 'mrkdwn', text: `*Room:*\n${tool?.room || 'TBD'}` },
        { type: 'mrkdwn', text: `*Requested By:*\n${booking.userName}` },
        { type: 'mrkdwn', text: `*Date:*\n${booking.date}` },
        { type: 'mrkdwn', text: `*Time:*\n${this.formatTime(booking.startTime)} - ${this.formatTime(booking.endTime)}` },
        { type: 'mrkdwn', text: `*Purpose:*\n${booking.purpose}` }
      ]
    };
  }

  /**
   * Notify new booking request
   */
  async notifyNewBooking(booking) {
    return this.send({
      text: `🆕 New booking request: ${booking.toolName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🆕 New Booking Request', emoji: true }
        },
        this.bookingBlock(booking),
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `📋 Booking ID: \`${booking.id}\` | 🔥 fire:fuel` }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '👀 Review in Scheduler', emoji: true },
              url: `${process.env.FRONTEND_URL || 'https://scheduler.sdcolab.org'}`,
              action_id: 'view_scheduler'
            }
          ]
        }
      ]
    });
  }

  /**
   * Notify booking approved
   */
  async notifyApproved(booking, approvedBy) {
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '✅ Booking Approved', emoji: true }
      },
      this.bookingBlock(booking),
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `✅ Approved by ${approvedBy}` }
        ]
      }
    ];

    // Add calendar link if available
    if (booking.calendarEventUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📅 View Calendar Event', emoji: true },
            url: booking.calendarEventUrl,
            action_id: 'view_calendar'
          }
        ]
      });
    }

    return this.send({
      text: `✅ Booking approved: ${booking.toolName} for ${booking.userName}`,
      blocks
    });
  }

  /**
   * Notify booking rejected
   */
  async notifyRejected(booking, rejectedBy, reason) {
    return this.send({
      text: `❌ Booking rejected: ${booking.toolName} for ${booking.userName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '❌ Booking Rejected', emoji: true }
        },
        this.bookingBlock(booking),
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Reason:* ${reason || 'No reason provided'}` }
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `❌ Rejected by ${rejectedBy}` }
          ]
        }
      ]
    });
  }

  /**
   * Notify booking cancelled
   */
  async notifyCancelled(booking, cancelledBy) {
    return this.send({
      text: `🗑️ Booking cancelled: ${booking.toolName} for ${booking.userName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🗑️ Booking Cancelled', emoji: true }
        },
        this.bookingBlock(booking),
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `🗑️ Cancelled by ${cancelledBy}` }
          ]
        }
      ]
    });
  }

  /**
   * Post daily summary
   */
  async postDailySummary(bookings, date) {
    const pending = bookings.filter(b => b.status === 'pending');
    const approved = bookings.filter(b => b.status === 'approved');

    const summary = approved.map(b => 
      `• *${this.formatTime(b.startTime)}* - ${b.toolName} (${b.userName})`
    ).join('\n');

    return this.send({
      text: `📅 Bookings for ${date}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📅 Bookings for ${date}`, emoji: true }
        },
        {
          type: 'section',
          text: { 
            type: 'mrkdwn', 
            text: approved.length > 0 
              ? `*Today's Schedule:*\n${summary}`
              : '_No approved bookings for today_'
          }
        },
        pending.length > 0 && {
          type: 'section',
          text: { 
            type: 'mrkdwn', 
            text: `⚠️ *${pending.length} pending request${pending.length > 1 ? 's' : ''}* need${pending.length === 1 ? 's' : ''} review`
          }
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `🔥 SDCoLab Scheduler | ${approved.length} approved | ${pending.length} pending` }
          ]
        }
      ].filter(Boolean)
    });
  }
}

// Export singleton
export const slackService = new SlackService();
export default slackService;
