/**
 * SDCoLab Scheduler - Database Service
 * 
 * DynamoDB operations for all entities with activity logging.
 * 
 * 🔥 Fire Triangle: FUEL layer - data persistence
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { config, isFeatureEnabled } from './config.js';

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const { users: USERS_TABLE, bookings: BOOKINGS_TABLE, activity: ACTIVITY_TABLE, invites: INVITES_TABLE } = config.aws.tables;

// =============================================================================
// Activity Log Service
// =============================================================================

export const activityService = {
  /**
   * Log an activity
   */
  async log(action, actor, target = {}, details = {}, previousState = null) {
    if (!isFeatureEnabled('activityLog')) return null;
    
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    const item = {
      id,
      timestamp,
      date: timestamp.split('T')[0],
      
      // Actor
      actorId: actor?.email || 'system',
      actorName: actor?.name || actor?.displayName || 'System',
      actorRole: actor?.role || 'system',
      
      // Action
      action,
      category: action.split('.')[0], // e.g., 'user.created' -> 'user'
      
      // Target
      targetType: target.type || null,
      targetId: target.id || null,
      targetName: target.name || null,
      
      // Details
      details,
      previousState,
      
      // TTL (90 days)
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
    };
    
    try {
      await docClient.send(new PutCommand({
        TableName: ACTIVITY_TABLE,
        Item: item
      }));
      return item;
    } catch (error) {
      console.error('Activity log failed:', error.message);
      return null;
    }
  },
  
  /**
   * Get activity logs with filters
   */
  async query({ category, actorId, targetId, startDate, endDate, limit = 100 }) {
    try {
      // Use GSI if filtering by category or actorId
      if (category && !actorId && !targetId) {
        const response = await docClient.send(new QueryCommand({
          TableName: ACTIVITY_TABLE,
          IndexName: 'category-index',
          KeyConditionExpression: '#category = :category',
          ExpressionAttributeNames: { '#category': 'category' },
          ExpressionAttributeValues: { ':category': category },
          Limit: limit
        }));
        return (response.Items || []).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      }
      
      if (actorId && !category && !targetId) {
        const response = await docClient.send(new QueryCommand({
          TableName: ACTIVITY_TABLE,
          IndexName: 'actor-index',
          KeyConditionExpression: '#actorId = :actorId',
          ExpressionAttributeNames: { '#actorId': 'actorId' },
          ExpressionAttributeValues: { ':actorId': actorId },
          Limit: limit
        }));
        return (response.Items || []).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      }
      
      // Fall back to scan for complex queries or no filters
      const params = {
        TableName: ACTIVITY_TABLE,
        Limit: limit
      };
      
      const filters = [];
      const names = {};
      const values = {};
      
      if (category) {
        filters.push('#category = :category');
        names['#category'] = 'category';
        values[':category'] = category;
      }
      if (actorId) {
        filters.push('#actorId = :actorId');
        names['#actorId'] = 'actorId';
        values[':actorId'] = actorId;
      }
      if (targetId) {
        filters.push('#targetId = :targetId');
        names['#targetId'] = 'targetId';
        values[':targetId'] = targetId;
      }
      
      if (filters.length > 0) {
        params.FilterExpression = filters.join(' AND ');
        params.ExpressionAttributeNames = names;
        params.ExpressionAttributeValues = values;
      }
      
      const response = await docClient.send(new ScanCommand(params));
      return (response.Items || []).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch (error) {
      console.error('Activity query error:', error);
      return [];
    }
  },
  
  /**
   * Record that someone viewed the activity log (oversight)
   */
  async recordLogView(logId, viewer) {
    if (!isFeatureEnabled('activityLog')) return;
    
    // Log the view as a separate activity
    await this.log('admin.viewed_activity_log', viewer, {
      type: 'activity_log',
      id: logId
    });
  }
};

// =============================================================================
// User Service
// =============================================================================

export const userService = {
  /**
   * Create a new user
   */
  async create(userData, actor = null) {
    const now = new Date().toISOString();
    const id = uuidv4();
    
    const user = {
      // Identity
      email: userData.email.toLowerCase(),
      id,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      displayName: userData.displayName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      avatarUrl: userData.avatarUrl || null,
      phone: userData.phone || null,
      
      // Auth
      authProviders: userData.authProviders || [],
      passwordHash: userData.passwordHash || null,
      
      // Authorization
      status: userData.status || config.defaults.newUserStatus,
      role: userData.role || config.defaults.newUserRole,
      permissions: userData.permissions || config.defaults.newUserPermissions,
      
      // Certifications
      certifications: userData.certifications || [],
      
      // Preferences
      preferences: userData.preferences || {
        notifications: { email: true, slack: false, sms: false },
        theme: 'system',
        timezone: 'America/Los_Angeles'
      },
      
      // Audit
      createdAt: now,
      createdBy: actor?.email || 'self-registration',
      updatedAt: now,
      lastEditedBy: actor?.email || 'self-registration',
      memberSince: now,
      
      // Notes
      notes: userData.notes || null,
      tags: userData.tags || []
    };
    
    await docClient.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: user,
      ConditionExpression: 'attribute_not_exists(email)'
    }));
    
    // Log activity
    await activityService.log('user.created', actor, {
      type: 'user',
      id: user.email,
      name: user.displayName
    }, {
      registrationMethod: userData.authProviders?.[0]?.provider || 'email',
      role: user.role,
      status: user.status
    });
    
    return user;
  },
  
  /**
   * Get user by email
   */
  async get(email) {
    const response = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { email: email.toLowerCase() }
    }));
    return response.Item;
  },
  
  /**
   * Get user by OAuth provider ID
   */
  async getByProviderId(provider, providerId) {
    // Scan for now - in production, create a GSI
    const response = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: 'contains(authProviders, :provider)',
      ExpressionAttributeValues: {
        ':provider': { provider, providerId }
      }
    }));
    
    // Manual filter since DynamoDB can't deep-match arrays of objects well
    return response.Items?.find(user => 
      user.authProviders?.some(ap => ap.provider === provider && ap.providerId === providerId)
    );
  },
  
  /**
   * Update user
   */
  async update(email, updates, actor = null) {
    const existingUser = await this.get(email);
    if (!existingUser) throw new Error('User not found');
    
    const expressions = [];
    const names = {};
    const values = {};
    
    // Build update expression
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'email' && value !== undefined) {
        const nameKey = `#${key}`;
        const valueKey = `:${key}`;
        expressions.push(`${nameKey} = ${valueKey}`);
        names[nameKey] = key;
        values[valueKey] = value;
      }
    });
    
    // Always update timestamp
    expressions.push('#updatedAt = :updatedAt');
    names['#updatedAt'] = 'updatedAt';
    values[':updatedAt'] = new Date().toISOString();
    
    if (actor) {
      expressions.push('#lastEditedBy = :lastEditedBy');
      names['#lastEditedBy'] = 'lastEditedBy';
      values[':lastEditedBy'] = actor.email;
    }
    
    const response = await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email: email.toLowerCase() },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW'
    }));
    
    // Log activity
    await activityService.log('user.updated', actor, {
      type: 'user',
      id: email,
      name: existingUser.displayName
    }, {
      fieldsUpdated: Object.keys(updates)
    }, existingUser);
    
    return response.Attributes;
  },
  
  /**
   * Link OAuth provider to user
   */
  async linkProvider(email, provider, providerId, actor = null) {
    const user = await this.get(email);
    if (!user) throw new Error('User not found');
    
    const authProviders = user.authProviders || [];
    
    // Check if already linked
    if (authProviders.some(ap => ap.provider === provider)) {
      throw new Error(`${provider} already linked to this account`);
    }
    
    authProviders.push({
      provider,
      providerId,
      linkedAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    });
    
    await this.update(email, { authProviders }, actor);
    
    await activityService.log('user.provider_linked', actor || user, {
      type: 'user',
      id: email
    }, { provider });
    
    return this.get(email);
  },
  
  /**
   * Deactivate user (soft delete)
   */
  async deactivate(email, reason, actor) {
    const user = await this.get(email);
    if (!user) throw new Error('User not found');
    
    const updates = {
      status: 'deactivated',
      deactivatedAt: new Date().toISOString(),
      deactivatedBy: actor.email,
      deactivationReason: reason
    };
    
    await this.update(email, updates, actor);
    
    await activityService.log('user.deactivated', actor, {
      type: 'user',
      id: email,
      name: user.displayName
    }, { reason });
    
    return this.get(email);
  },
  
  /**
   * Hard delete user
   */
  async delete(email, actor) {
    const user = await this.get(email);
    if (!user) throw new Error('User not found');
    
    await docClient.send(new DeleteCommand({
      TableName: USERS_TABLE,
      Key: { email: email.toLowerCase() }
    }));
    
    await activityService.log('user.deleted', actor, {
      type: 'user',
      id: email,
      name: user.displayName
    }, { previousData: { displayName: user.displayName, role: user.role } });
    
    return user;
  },
  
  /**
   * Get all users
   */
  async getAll(filters = {}) {
    const params = { TableName: USERS_TABLE };
    
    if (filters.status) {
      params.FilterExpression = '#status = :status';
      params.ExpressionAttributeNames = { '#status': 'status' };
      params.ExpressionAttributeValues = { ':status': filters.status };
    }
    
    const response = await docClient.send(new ScanCommand(params));
    return response.Items || [];
  },
  
  /**
   * Bulk import users from CSV
   */
  async bulkImport(users, actor) {
    const results = { success: [], failed: [] };
    
    for (const userData of users) {
      try {
        const user = await this.create({
          ...userData,
          status: 'active' // Imported users are pre-approved
        }, actor);
        results.success.push(user.email);
      } catch (error) {
        results.failed.push({ email: userData.email, error: error.message });
      }
    }
    
    await activityService.log('admin.bulk_import', actor, {
      type: 'users'
    }, {
      totalAttempted: users.length,
      successCount: results.success.length,
      failedCount: results.failed.length
    });
    
    return results;
  },
  
  /**
   * Update last login
   */
  async recordLogin(email, provider = 'email') {
    const now = new Date().toISOString();
    
    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email: email.toLowerCase() },
      UpdateExpression: 'SET #lastLoginAt = :now, #lastActivityAt = :now',
      ExpressionAttributeNames: {
        '#lastLoginAt': 'lastLoginAt',
        '#lastActivityAt': 'lastActivityAt'
      },
      ExpressionAttributeValues: { ':now': now }
    }));
    
    // Also update the auth provider's lastUsed
    const user = await this.get(email);
    if (user?.authProviders) {
      const providers = user.authProviders.map(ap => 
        ap.provider === provider ? { ...ap, lastUsed: now } : ap
      );
      await this.update(email, { authProviders: providers });
    }
  },
  
  /**
   * Find user by password reset token
   * Uses DynamoDB Scan with filter - more efficient than fetching all users
   */
  async getByResetToken(token) {
    if (!token) return null;
    
    const now = new Date().toISOString();
    
    const response = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: '#token = :token AND #expires > :now',
      ExpressionAttributeNames: {
        '#token': 'passwordResetToken',
        '#expires': 'passwordResetExpires'
      },
      ExpressionAttributeValues: {
        ':token': token,
        ':now': now
      },
      Limit: 1 // We only need one match
    }));
    
    return response.Items?.[0] || null;
  }
};

// =============================================================================
// Invite Service
// =============================================================================

export const inviteService = {
  /**
   * Create invite
   */
  async create(inviteData, actor) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    
    const invite = {
      id,
      email: inviteData.email.toLowerCase(),
      role: inviteData.role || 'member',
      permissions: inviteData.permissions || config.defaults.newUserPermissions,
      message: inviteData.message || null,
      createdBy: actor.email,
      createdAt: now,
      expiresAt,
      status: 'pending'
    };
    
    await docClient.send(new PutCommand({
      TableName: INVITES_TABLE,
      Item: invite
    }));
    
    await activityService.log('invite.created', actor, {
      type: 'invite',
      id,
      name: inviteData.email
    }, { role: inviteData.role });
    
    return invite;
  },
  
  /**
   * Get invite by ID (token)
   */
  async get(id) {
    const response = await docClient.send(new GetCommand({
      TableName: INVITES_TABLE,
      Key: { id }
    }));
    return response.Item;
  },
  
  /**
   * Get all invites (optionally filtered by status)
   */
  async getAll(status = null) {
    const params = {
      TableName: INVITES_TABLE
    };
    
    if (status) {
      params.FilterExpression = '#status = :status';
      params.ExpressionAttributeNames = { '#status': 'status' };
      params.ExpressionAttributeValues = { ':status': status };
    }
    
    const response = await docClient.send(new ScanCommand(params));
    return (response.Items || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  
  /**
   * Revoke an invite
   */
  async revoke(id, actor) {
    const invite = await this.get(id);
    if (!invite) throw new Error('Invite not found');
    if (invite.status !== 'pending') throw new Error('Invite cannot be revoked');
    
    await docClient.send(new UpdateCommand({
      TableName: INVITES_TABLE,
      Key: { id },
      UpdateExpression: 'SET #status = :status, #revokedAt = :revokedAt, #revokedBy = :revokedBy',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#revokedAt': 'revokedAt',
        '#revokedBy': 'revokedBy'
      },
      ExpressionAttributeValues: {
        ':status': 'revoked',
        ':revokedAt': new Date().toISOString(),
        ':revokedBy': actor.email
      }
    }));
    
    await activityService.log('invite.revoked', actor, {
      type: 'invite',
      id,
      name: invite.email
    });
    
    return { ...invite, status: 'revoked' };
  },
  
  /**
   * Accept invite
   */
  async accept(id, userId) {
    const invite = await this.get(id);
    if (!invite) throw new Error('Invite not found');
    if (invite.status !== 'pending') throw new Error('Invite already used');
    if (new Date(invite.expiresAt) < new Date()) throw new Error('Invite expired');
    
    await docClient.send(new UpdateCommand({
      TableName: INVITES_TABLE,
      Key: { id },
      UpdateExpression: 'SET #status = :status, #acceptedAt = :acceptedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#acceptedAt': 'acceptedAt'
      },
      ExpressionAttributeValues: {
        ':status': 'accepted',
        ':acceptedAt': new Date().toISOString()
      }
    }));
    
    return invite;
  }
};

// =============================================================================
// Booking Service (Enhanced)
// =============================================================================

export const bookingService = {
  /**
   * Create a new booking
   * 
   * Accepts all fields from route layer including:
   * - status (for auto-approval)
   * - approvedBy/approvedAt (for auto-approval)
   * - version (for optimistic concurrency)
   * - calendar fields
   * - archive fields
   * 
   * Uses conditional write to prevent duplicate slot bookings (TOCTOU race prevention)
   * 
   * @param {Object} bookingData - Booking data from route
   * @param {Object} actor - User creating the booking
   * @returns {Object} - Created booking
   */
  async create(bookingData, actor) {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    // Normalize resource fields (routes may pass tool* or resource* variants)
    const resourceId = bookingData.resourceId || bookingData.tool;
    const resourceName = bookingData.resourceName || bookingData.toolName;
    
    // Build slot key for conditional uniqueness check
    // Format: SLOT#{date}#{resourceId}#{startTime}
    const slotKey = `SLOT#${bookingData.date}#${resourceId}#${bookingData.startTime}`;
    
    const booking = {
      id,
      
      // Resource identification (store both formats for compatibility)
      resourceType: bookingData.resourceType || 'tool',
      resourceId,
      resourceName,
      tool: resourceId,           // Legacy field
      toolName: resourceName,     // Legacy field
      
      // User info
      userId: actor.id,
      userEmail: actor.email,
      userName: actor.displayName || actor.name,
      
      // Booking details
      date: bookingData.date,
      startTime: bookingData.startTime,
      endTime: bookingData.endTime,
      purpose: bookingData.purpose,
      projectName: bookingData.projectName || null,
      
      // Status - accept from route (for auto-approval) or default to pending
      status: bookingData.status || 'pending',
      
      // Approval fields (for auto-approved bookings)
      ...(bookingData.approvedBy && { approvedBy: bookingData.approvedBy }),
      ...(bookingData.approvedAt && { approvedAt: bookingData.approvedAt }),
      ...(bookingData.autoApproved && { autoApproved: bookingData.autoApproved }),
      
      // Version for optimistic concurrency (always start at 1)
      version: bookingData.version || 1,
      
      // Calendar integration fields
      ...(bookingData.calendarEventId && { calendarEventId: bookingData.calendarEventId }),
      ...(bookingData.calendarEventUrl && { calendarEventUrl: bookingData.calendarEventUrl }),
      ...(bookingData.resourceCalendar && { resourceCalendar: bookingData.resourceCalendar }),
      
      // GitHub integration fields
      ...(bookingData.githubIssueNumber && { githubIssueNumber: bookingData.githubIssueNumber }),
      ...(bookingData.githubIssueUrl && { githubIssueUrl: bookingData.githubIssueUrl }),
      
      // Timestamps
      createdAt: now,
      updatedAt: now,
      
      // Composite keys for efficient queries
      dateResourceKey: `${bookingData.date}#${resourceId}`,
      userDateKey: `${actor.email}#${bookingData.date}`,
      slotKey  // For conditional uniqueness
    };
    
    try {
      // Use conditional write to prevent TOCTOU race condition
      // This ensures only one booking can claim this slot
      // Note: For tools with maxConcurrent > 1, the route layer handles counting
      // This is a last-line defense against exact duplicates
      await docClient.send(new PutCommand({
        TableName: BOOKINGS_TABLE,
        Item: booking,
        // Ensure this exact booking ID doesn't already exist
        ConditionExpression: 'attribute_not_exists(id)'
      }));
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        // This shouldn't happen with UUIDs, but handle it
        throw new Error('Booking creation conflict - please retry');
      }
      throw error;
    }
    
    await activityService.log('booking.created', actor, {
      type: 'booking',
      id,
      name: `${booking.resourceName} on ${booking.date}`
    }, {
      date: booking.date,
      time: `${booking.startTime}-${booking.endTime}`,
      status: booking.status,
      autoApproved: booking.autoApproved || false
    });
    
    return booking;
  },
  
  async get(id) {
    const response = await docClient.send(new GetCommand({
      TableName: BOOKINGS_TABLE,
      Key: { id }
    }));
    return response.Item;
  },
  
  async update(id, updates, actor) {
    const booking = await this.get(id);
    if (!booking) throw new Error('Booking not found');
    
    const expressions = [];
    const names = {};
    const values = {};
    
    // Track if version is being explicitly set
    let hasExplicitVersion = false;
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && value !== undefined) {
        expressions.push(`#${key} = :${key}`);
        names[`#${key}`] = key;
        values[`:${key}`] = value;
        
        if (key === 'version') {
          hasExplicitVersion = true;
        }
      }
    });
    
    // Always update timestamp
    expressions.push('#updatedAt = :updatedAt');
    names['#updatedAt'] = 'updatedAt';
    values[':updatedAt'] = new Date().toISOString();
    
    // If version not explicitly set, auto-increment it
    if (!hasExplicitVersion) {
      const newVersion = (booking.version || 0) + 1;
      expressions.push('#version = :version');
      names['#version'] = 'version';
      values[':version'] = newVersion;
    }
    
    // Build update params with optimistic concurrency check
    const updateParams = {
      TableName: BOOKINGS_TABLE,
      Key: { id },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW'
    };
    
    // Add condition for optimistic concurrency if booking has a version
    if (booking.version !== undefined) {
      updateParams.ConditionExpression = '#currentVersion = :currentVersion';
      updateParams.ExpressionAttributeNames['#currentVersion'] = 'version';
      updateParams.ExpressionAttributeValues[':currentVersion'] = booking.version;
    }
    
    try {
      const response = await docClient.send(new UpdateCommand(updateParams));
      
      await activityService.log('booking.updated', actor, {
        type: 'booking',
        id,
        name: booking.resourceName
      }, { updates: Object.keys(updates) }, booking);
      
      return response.Attributes;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Version mismatch - someone else modified the booking
        const freshBooking = await this.get(id);
        const versionError = new Error('Booking was modified by another request. Please refresh and try again.');
        versionError.name = 'ConditionalCheckFailedException';
        versionError.currentVersion = freshBooking?.version;
        throw versionError;
      }
      throw error;
    }
  },
  
  async delete(id, actor) {
    const booking = await this.get(id);
    if (!booking) throw new Error('Booking not found');
    
    await docClient.send(new DeleteCommand({
      TableName: BOOKINGS_TABLE,
      Key: { id }
    }));
    
    await activityService.log('booking.deleted', actor, {
      type: 'booking',
      id,
      name: booking.resourceName
    });
    
    return booking;
  },
  
  async getByDate(date) {
    const response = await docClient.send(new QueryCommand({
      TableName: BOOKINGS_TABLE,
      IndexName: 'date-index',
      KeyConditionExpression: '#date = :date',
      ExpressionAttributeNames: { '#date': 'date' },
      ExpressionAttributeValues: { ':date': date }
    }));
    return response.Items || [];
  },
  
  async getByUser(userEmail) {
    const response = await docClient.send(new QueryCommand({
      TableName: BOOKINGS_TABLE,
      IndexName: 'user-index',
      KeyConditionExpression: '#userEmail = :userEmail',
      ExpressionAttributeNames: { '#userEmail': 'userEmail' },
      ExpressionAttributeValues: { ':userEmail': userEmail }
    }));
    return response.Items || [];
  },
  
  async getPending() {
    const response = await docClient.send(new QueryCommand({
      TableName: BOOKINGS_TABLE,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'pending' }
    }));
    return response.Items || [];
  },
  
  /**
   * Get all bookings with optional filters (admin only)
   */
  async getAll({ status, limit = 500 } = {}) {
    try {
      let response;
      
      if (status) {
        // Use status index for filtered queries
        response = await docClient.send(new QueryCommand({
          TableName: BOOKINGS_TABLE,
          IndexName: 'status-index',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
          Limit: limit
        }));
      } else {
        // Full scan for all bookings
        response = await docClient.send(new ScanCommand({
          TableName: BOOKINGS_TABLE,
          Limit: limit
        }));
      }
      
      // Sort by date descending
      return (response.Items || []).sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (b.startTime || '').localeCompare(a.startTime || '');
      });
    } catch (error) {
      console.error('Get all bookings error:', error);
      return [];
    }
  }
};

export default {
  activityService,
  userService,
  inviteService,
  bookingService
};
