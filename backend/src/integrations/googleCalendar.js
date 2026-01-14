/**
 * Google Calendar Integration
 * 
 * Supports two authentication methods:
 * 1. Workload Identity Federation (recommended, no keys needed)
 * 2. Service Account Key (traditional, requires downloaded key)
 * 
 * 🔥 Fire Triangle: FUEL layer - physical resource scheduling
 */

import { google } from 'googleapis';
import { config, isFeatureEnabled } from '../lib/config.js';

// Event color: Tangerine (#6) - closest to SDCoLab flame orange
const EVENT_COLOR_ID = '6';

class GoogleCalendarService {
  constructor() {
    this.calendar = null;
    this.initialized = false;
    this.authMethod = config.gcal.authMethod;
  }

  /**
   * Initialize the Google Calendar API client
   * Uses either Workload Identity Federation or Service Account Key
   */
  async init() {
    if (!isFeatureEnabled('googleCalendar')) {
      console.log('📅 Google Calendar integration disabled');
      return false;
    }

    if (this.initialized) return true;

    try {
      let auth;

      if (this.authMethod === 'workload_identity') {
        auth = await this.initWorkloadIdentity();
      } else {
        auth = await this.initServiceAccountKey();
      }

      this.calendar = google.calendar({ version: 'v3', auth });
      this.initialized = true;
      console.log(`✅ Google Calendar initialized (${this.authMethod})`);
      return true;
    } catch (error) {
      console.error('❌ Google Calendar init failed:', error.message);
      return false;
    }
  }

  /**
   * Initialize using Workload Identity Federation
   * This allows AWS Lambda to authenticate to GCP without service account keys
   */
  async initWorkloadIdentity() {
    const { 
      projectNumber, 
      poolId, 
      providerId, 
      serviceAccountEmail 
    } = config.gcal;

    if (!projectNumber || !serviceAccountEmail) {
      throw new Error('Workload Identity requires projectNumber and serviceAccountEmail');
    }

    // Get AWS credentials from environment (Lambda provides these automatically)
    const awsRegion = process.env.AWS_REGION;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsSessionToken = process.env.AWS_SESSION_TOKEN;

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error('AWS credentials not available for Workload Identity Federation');
    }

    // Create signed AWS request for STS GetCallerIdentity
    // This is used as the subject token for GCP's STS
    const AWS4 = await import('aws4');
    
    const stsRequest = {
      host: `sts.${awsRegion}.amazonaws.com`,
      service: 'sts',
      region: awsRegion,
      method: 'POST',
      path: '/',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'Action=GetCallerIdentity&Version=2011-06-15'
    };

    AWS4.sign(stsRequest, {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      sessionToken: awsSessionToken
    });

    // Construct the subject token (serialized signed request)
    const subjectToken = JSON.stringify({
      url: `https://${stsRequest.host}${stsRequest.path}`,
      method: stsRequest.method,
      headers: Object.entries(stsRequest.headers).map(([key, value]) => ({ key, value }))
    });

    // Exchange for GCP token using STS
    const { ExternalAccountClient } = await import('google-auth-library');
    
    const clientConfig = {
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: 'urn:ietf:params:aws:token-type:aws4_request',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
      credential_source: {
        environment_id: 'aws1',
        region_url: 'http://169.254.169.254/latest/meta-data/placement/availability-zone',
        url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials',
        regional_cred_verification_url: 'https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15'
      }
    };

    const auth = new ExternalAccountClient(clientConfig);
    auth.scopes = ['https://www.googleapis.com/auth/calendar'];

    return auth;
  }

  /**
   * Initialize using traditional Service Account Key
   */
  async initServiceAccountKey() {
    const { projectId, clientEmail, privateKey, privateKeyId, clientId } = config.gcal;

    if (!clientEmail || !privateKey) {
      throw new Error('Service account key requires clientEmail and privateKey');
    }

    const credentials = {
      type: 'service_account',
      project_id: projectId,
      private_key_id: privateKeyId,
      private_key: privateKey,
      client_email: clientEmail,
      client_id: clientId,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`
    };

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ]
    });

    return auth;
  }

  /**
   * Get resource calendar for a tool
   */
  getResourceCalendar(toolId) {
    const calendarId = config.gcal.resourceCalendars[toolId];
    if (!calendarId) {
      console.warn(`No resource calendar configured for tool: ${toolId}`);
      return null;
    }
    
    const tool = config.tools.find(t => t.id === toolId);
    return {
      calendarId,
      name: tool?.room || toolId
    };
  }

  /**
   * Create calendar event for approved booking
   */
  async createBookingEvent(booking) {
    if (!await this.init()) {
      return null;
    }

    const { id, tool, toolName, userName, userEmail, date, startTime, endTime, purpose } = booking;

    const resourceCalendar = this.getResourceCalendar(tool);
    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;

    const event = {
      summary: `🔧 ${toolName} - ${userName}`,
      description: [
        `**SDCoLab Tool Booking**`,
        ``,
        `**Member:** ${userName}`,
        `**Email:** ${userEmail}`,
        `**Tool:** ${toolName}`,
        `**Purpose:** ${purpose}`,
        ``,
        `---`,
        `Booking ID: ${id}`,
        `🔥 Managed by SDCoLab Scheduler`
      ].join('\n'),
      start: { dateTime: startDateTime, timeZone: 'America/Los_Angeles' },
      end: { dateTime: endDateTime, timeZone: 'America/Los_Angeles' },
      colorId: EVENT_COLOR_ID,
      attendees: resourceCalendar ? [{ email: resourceCalendar.calendarId, resource: true }] : [],
      extendedProperties: {
        private: {
          bookingId: id,
          tool: tool,
          userEmail: userEmail,
          managedBy: 'sdcolab-scheduler'
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 30 }
        ]
      }
    };

    try {
      const response = await this.calendar.events.insert({
        calendarId: config.gcal.primaryCalendarId,
        resource: event,
        sendUpdates: 'all'
      });

      console.log(`📅 Created event: ${response.data.id}`);
      
      return {
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
        resourceCalendar: resourceCalendar?.name
      };
    } catch (error) {
      console.error('❌ Create event failed:', error.message);
      throw error;
    }
  }

  /**
   * Update existing calendar event
   */
  async updateBookingEvent(eventId, booking) {
    if (!await this.init()) {
      return null;
    }

    const { id, tool, toolName, userName, userEmail, date, startTime, endTime, purpose } = booking;

    const resourceCalendar = this.getResourceCalendar(tool);
    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;

    const event = {
      summary: `🔧 ${toolName} - ${userName}`,
      description: [
        `**SDCoLab Tool Booking** (Updated)`,
        ``,
        `**Member:** ${userName}`,
        `**Email:** ${userEmail}`,
        `**Tool:** ${toolName}`,
        `**Purpose:** ${purpose}`,
        ``,
        `---`,
        `Booking ID: ${id}`,
        `🔥 Managed by SDCoLab Scheduler`
      ].join('\n'),
      start: { dateTime: startDateTime, timeZone: 'America/Los_Angeles' },
      end: { dateTime: endDateTime, timeZone: 'America/Los_Angeles' },
      colorId: EVENT_COLOR_ID,
      attendees: resourceCalendar ? [{ email: resourceCalendar.calendarId, resource: true }] : [],
      extendedProperties: {
        private: {
          bookingId: id,
          tool: tool,
          userEmail: userEmail,
          managedBy: 'sdcolab-scheduler',
          lastUpdated: new Date().toISOString()
        }
      }
    };

    try {
      const response = await this.calendar.events.update({
        calendarId: config.gcal.primaryCalendarId,
        eventId: eventId,
        resource: event,
        sendUpdates: 'all'
      });

      console.log(`📅 Updated event: ${response.data.id}`);
      
      return {
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
        resourceCalendar: resourceCalendar?.name
      };
    } catch (error) {
      console.error('❌ Update event failed:', error.message);
      throw error;
    }
  }

  /**
   * Delete calendar event
   */
  async deleteBookingEvent(eventId) {
    if (!await this.init()) {
      return true; // Silently succeed if not enabled
    }

    try {
      await this.calendar.events.delete({
        calendarId: config.gcal.primaryCalendarId,
        eventId: eventId,
        sendUpdates: 'all'
      });

      console.log(`🗑️ Deleted event: ${eventId}`);
      return true;
    } catch (error) {
      if (error.code === 404) {
        console.log(`ℹ️ Event already deleted: ${eventId}`);
        return true;
      }
      console.error('❌ Delete event failed:', error.message);
      throw error;
    }
  }
}

// Export singleton
export const googleCalendarService = new GoogleCalendarService();
export default googleCalendarService;
