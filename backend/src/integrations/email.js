/**
 * SDCoLab Scheduler - Email Integration (AWS SES)
 * 
 * Sends transactional emails for:
 * - User invites
 * - Booking notifications
 * - Password resets
 * - Account status changes
 * 
 * 🔥 Fire Triangle: OXYGEN layer - communication infrastructure
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config, isFeatureEnabled } from '../lib/config.js';

const ses = new SESClient({ region: config.aws.region });

// =============================================================================
// Email Templates
// =============================================================================

const templates = {
  invite: ({ inviteUrl, inviterName, role, message, toolCount }) => ({
    subject: `🔥 You're invited to join SDCoLab!`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join SDCoLab</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔥</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to SDCoLab!</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; line-height: 1.6; color: #333;">
        <strong>${inviterName}</strong> has invited you to join the SDCoLab community as a <strong>${role}</strong>.
      </p>
      
      ${message ? `
      <div style="background: #fef3c7; border-left: 4px solid #f97316; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-style: italic; color: #92400e;">"${message}"</p>
      </div>
      ` : ''}
      
      ${toolCount > 0 ? `
      <p style="font-size: 14px; color: #666;">
        🔧 You've been pre-certified for <strong>${toolCount} tool${toolCount > 1 ? 's' : ''}</strong>!
      </p>
      ` : ''}
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: bold; font-size: 16px;">
          Accept Invitation
        </a>
      </div>
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        Or copy this link: <br>
        <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 11px;">${inviteUrl}</code>
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <div style="text-align: center;">
        <p style="font-size: 14px; color: #666; margin: 0;">
          <strong>🔥 The Fire Triangle</strong><br>
          <span style="color: #eab308;">FUEL</span> • <span style="color: #3b82f6;">OXYGEN</span> • <span style="color: #ef4444;">HEAT</span>
        </p>
        <p style="font-size: 12px; color: #999; margin-top: 8px;">
          SDCoLab - San Diego Collaborative Arts Project
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `,
    text: `
🔥 Welcome to SDCoLab!

${inviterName} has invited you to join the SDCoLab community as a ${role}.

${message ? `Message: "${message}"\n` : ''}
${toolCount > 0 ? `You've been pre-certified for ${toolCount} tool(s)!\n` : ''}

Accept your invitation: ${inviteUrl}

---
SDCoLab - San Diego Collaborative Arts Project
🔥 FUEL • OXYGEN • HEAT
    `
  }),

  userCreated: ({ displayName, email, tempPassword, loginUrl }) => ({
    subject: `🔥 Your SDCoLab account has been created`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔥</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">Account Created!</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; line-height: 1.6; color: #333;">
        Hi <strong>${displayName || 'there'}</strong>! An administrator has created an account for you at SDCoLab.
      </p>
      
      <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 0; font-size: 14px;"><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></p>
      </div>
      
      <p style="font-size: 14px; color: #dc2626; background: #fef2f2; padding: 12px; border-radius: 8px;">
        ⚠️ Please change your password after your first login!
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: bold; font-size: 16px;">
          Sign In Now
        </a>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        SDCoLab - San Diego Collaborative Arts Project
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
🔥 Your SDCoLab Account

Hi ${displayName || 'there'}! An administrator has created an account for you.

Email: ${email}
Temporary Password: ${tempPassword}

⚠️ Please change your password after your first login!

Sign in: ${loginUrl}

---
SDCoLab - San Diego Collaborative Arts Project
    `
  }),

  bookingApproved: ({ userName, toolName, date, startTime, endTime, calendarLink }) => ({
    subject: `✅ Booking Approved: ${toolName} on ${date}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">Booking Approved!</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; line-height: 1.6; color: #333;">
        Great news, <strong>${userName}</strong>! Your booking has been approved.
      </p>
      
      <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; font-size: 16px;"><strong>🔧 ${toolName}</strong></p>
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #666;">📅 ${date}</p>
        <p style="margin: 0; font-size: 14px; color: #666;">🕐 ${startTime} - ${endTime}</p>
      </div>
      
      ${calendarLink ? `
      <div style="text-align: center; margin: 24px 0;">
        <a href="${calendarLink}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: bold;">
          📅 Add to Calendar
        </a>
      </div>
      ` : ''}
      
      <p style="font-size: 14px; color: #666;">
        Remember to cancel if your plans change so others can use the slot!
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        🔥 SDCoLab - San Diego Collaborative Arts Project
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
✅ Booking Approved!

Great news, ${userName}! Your booking has been approved.

🔧 ${toolName}
📅 ${date}
🕐 ${startTime} - ${endTime}

${calendarLink ? `Add to Calendar: ${calendarLink}\n` : ''}

Remember to cancel if your plans change!

---
🔥 SDCoLab
    `
  }),

  bookingRejected: ({ userName, toolName, date, reason }) => ({
    subject: `❌ Booking Request Update: ${toolName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #6b7280; border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">Booking Update</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; line-height: 1.6; color: #333;">
        Hi <strong>${userName}</strong>, unfortunately your booking request could not be approved.
      </p>
      
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">
          <strong>${toolName}</strong> on ${date}
        </p>
        <p style="margin: 0; color: #991b1b;">
          <strong>Reason:</strong> ${reason || 'No reason provided'}
        </p>
      </div>
      
      <p style="font-size: 14px; color: #666;">
        Feel free to submit a new request for a different time, or reach out in #colab-space on Slack if you have questions.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        🔥 SDCoLab - San Diego Collaborative Arts Project
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
Booking Update

Hi ${userName}, unfortunately your booking request could not be approved.

${toolName} on ${date}
Reason: ${reason || 'No reason provided'}

Feel free to submit a new request or reach out on Slack.

---
🔥 SDCoLab
    `
  }),

  passwordReset: ({ resetUrl, displayName }) => ({
    subject: `🔐 Reset your SDCoLab password`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; line-height: 1.6; color: #333;">
        Hi <strong>${displayName || 'there'}</strong>, we received a request to reset your password.
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: bold; font-size: 16px;">
          Reset Password
        </a>
      </div>
      
      <p style="font-size: 14px; color: #666;">
        This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        🔥 SDCoLab - San Diego Collaborative Arts Project
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
Password Reset

Hi ${displayName || 'there'}, we received a request to reset your password.

Reset your password: ${resetUrl}

This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.

---
🔥 SDCoLab
    `
  }),

  bookingReminder: ({ userName, toolName, date, startTime, endTime, calendarLink }) => ({
    subject: `⏰ Reminder: ${toolName} booking tomorrow`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">Booking Reminder</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; line-height: 1.6; color: #333;">
        Hi <strong>${userName}</strong>, this is a friendly reminder about your upcoming booking!
      </p>
      
      <div style="background: #fef3c7; border: 2px solid #f97316; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold;">🔧 ${toolName}</p>
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #666;">📅 ${date}</p>
        <p style="margin: 0; font-size: 14px; color: #666;">🕐 ${startTime} - ${endTime}</p>
      </div>
      
      ${calendarLink ? `
      <div style="text-align: center; margin: 24px 0;">
        <a href="${calendarLink}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: bold;">
          📅 View in Calendar
        </a>
      </div>
      ` : ''}
      
      <p style="font-size: 14px; color: #666;">
        Can't make it? Please cancel your booking so others can use the slot.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        🔥 SDCoLab - San Diego Collaborative Arts Project<br>
        <a href="${process.env.FRONTEND_URL || 'https://scheduler.sdcolab.org'}/notifications/preferences" style="color: #999;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
⏰ Booking Reminder

Hi ${userName}, this is a friendly reminder about your upcoming booking!

🔧 ${toolName}
📅 ${date}
🕐 ${startTime} - ${endTime}

${calendarLink ? `View in Calendar: ${calendarLink}\n` : ''}

Can't make it? Please cancel your booking so others can use the slot.

---
🔥 SDCoLab
    `
  }),

  announcement: ({ userName, title, message }) => ({
    subject: `📢 SDCoLab: ${title}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">📢</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">${title}</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; line-height: 1.6; color: #333;">
        Hi <strong>${userName || 'there'}</strong>,
      </p>
      
      <div style="font-size: 16px; line-height: 1.8; color: #333; margin: 24px 0;">
        ${message.replace(/\n/g, '<br>')}
      </div>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        🔥 SDCoLab - San Diego Collaborative Arts Project
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
📢 ${title}

Hi ${userName || 'there'},

${message}

---
🔥 SDCoLab
    `
  }),

  waitlistNotification: ({ userName, resourceName, date, startTime, endTime, bookingUrl }) => ({
    subject: `🔔 Spot Available: ${resourceName} on ${date}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔔</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">A Spot Opened Up!</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; line-height: 1.6; color: #333;">
        Great news, <strong>${userName}</strong>! A spot has opened up for a tool you were waiting for.
      </p>
      
      <div style="background: #fef3c7; border: 2px solid #f97316; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold;">🔧 ${resourceName}</p>
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #666;">📅 ${date}</p>
        <p style="margin: 0; font-size: 14px; color: #666;">🕐 ${startTime} - ${endTime}</p>
      </div>
      
      <p style="font-size: 14px; color: #dc2626; background: #fef2f2; padding: 12px; border-radius: 8px;">
        ⚠️ <strong>Act fast!</strong> This spot may be taken by someone else if you don't book soon.
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${bookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: bold; font-size: 16px;">
          Book Now
        </a>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        You received this because you joined the waitlist for this time slot.<br>
        🔥 SDCoLab - San Diego Collaborative Arts Project
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
🔔 A Spot Opened Up!

Great news, ${userName}! A spot has opened up for a tool you were waiting for.

🔧 ${resourceName}
📅 ${date}
🕐 ${startTime} - ${endTime}

⚠️ Act fast! This spot may be taken by someone else if you don't book soon.

Book now: ${bookingUrl}

---
🔥 SDCoLab - San Diego Collaborative Arts Project
    `
  })
};

// =============================================================================
// Email Sending Functions
// =============================================================================

/**
 * Send an email via SES
 */
export const sendEmail = async (to, template, data) => {
  if (!isFeatureEnabled('email')) {
    console.log(`📧 [Email disabled] Would send "${template}" to ${to}`);
    return { success: false, reason: 'email_disabled' };
  }

  const emailTemplate = templates[template];
  if (!emailTemplate) {
    console.error(`Unknown email template: ${template}`);
    return { success: false, reason: 'unknown_template' };
  }

  const { subject, html, text } = emailTemplate(data);

  const params = {
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to]
    },
    Message: {
      Body: {
        Html: { Charset: 'UTF-8', Data: html },
        Text: { Charset: 'UTF-8', Data: text }
      },
      Subject: { Charset: 'UTF-8', Data: subject }
    },
    Source: config.aws.ses.fromEmail,
    ReplyToAddresses: [config.aws.ses.replyToEmail]
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await ses.send(command);
    console.log(`📧 Email sent: ${template} to ${to} (MessageId: ${result.MessageId})`);
    return { success: true, messageId: result.MessageId };
  } catch (error) {
    console.error(`📧 Email failed: ${template} to ${to}`, error);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// Convenience Functions
// =============================================================================

export const sendInviteEmail = (email, data) => sendEmail(email, 'invite', data);
export const sendUserCreatedEmail = (email, data) => sendEmail(email, 'userCreated', data);
export const sendBookingApprovedEmail = (email, data) => sendEmail(email, 'bookingApproved', data);
export const sendBookingRejectedEmail = (email, data) => sendEmail(email, 'bookingRejected', data);
export const sendPasswordResetEmail = (email, data) => sendEmail(email, 'passwordReset', data);
export const sendWaitlistNotificationEmail = (email, data) => sendEmail(email, 'waitlistNotification', data);

export default {
  sendEmail,
  sendInviteEmail,
  sendUserCreatedEmail,
  sendBookingApprovedEmail,
  sendBookingRejectedEmail,
  sendPasswordResetEmail
};
