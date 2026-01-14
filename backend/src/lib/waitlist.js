/**
 * SDCoLab Scheduler - Waitlist Service
 * 
 * Manages waitlist functionality for fully-booked time slots.
 * Users can join waitlists and get notified when spots open.
 * 
 * 🔥 Fire Triangle: OXYGEN layer - fair access management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { activityService } from './database.js';

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

// Waitlist table (falls back to bookings table with recordType prefix)
const WAITLIST_TABLE = config.aws.tables.waitlist || config.aws.tables.bookings;

export const waitlistService = {
  /**
   * Join a waitlist for a specific tool/date/time slot
   */
  async join(waitlistData, user) {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    // Create composite key for the slot
    const slotKey = `${waitlistData.resourceId}#${waitlistData.date}#${waitlistData.startTime}`;
    
    // Check if user is already on this waitlist
    const existing = await this.getUserPosition(
      waitlistData.resourceId,
      waitlistData.date,
      waitlistData.startTime,
      user.email
    );
    
    if (existing) {
      throw new Error('You are already on this waitlist');
    }
    
    // Get current waitlist to determine position
    const currentWaitlist = await this.getForSlot(
      waitlistData.resourceId,
      waitlistData.date,
      waitlistData.startTime
    );
    
    const position = currentWaitlist.length + 1;
    
    const entry = {
      id,
      recordType: 'waitlist', // For shared table support
      slotKey,
      resourceId: waitlistData.resourceId,
      resourceName: waitlistData.resourceName,
      date: waitlistData.date,
      startTime: waitlistData.startTime,
      endTime: waitlistData.endTime,
      userEmail: user.email,
      userName: user.displayName || user.name,
      userId: user.id,
      position,
      status: 'waiting', // waiting, notified, expired, converted
      priority: waitlistData.priority || 'normal', // normal, high (for certified users)
      notifyMethods: waitlistData.notifyMethods || ['email'],
      notes: waitlistData.notes || null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      // GSI keys
      userDateKey: `${user.email}#${waitlistData.date}`,
      dateResourceKey: `${waitlistData.date}#${waitlistData.resourceId}`
    };
    
    await docClient.send(new PutCommand({
      TableName: WAITLIST_TABLE,
      Item: entry
    }));
    
    await activityService.log('waitlist.joined', user, {
      type: 'waitlist',
      id,
      name: `${waitlistData.resourceName} on ${waitlistData.date}`
    }, {
      position,
      slot: `${waitlistData.startTime}-${waitlistData.endTime}`
    });
    
    return entry;
  },
  
  /**
   * Leave a waitlist
   */
  async leave(id, user) {
    const entry = await this.get(id);
    
    if (!entry) {
      throw new Error('Waitlist entry not found');
    }
    
    if (entry.userEmail !== user.email && !['admin', 'superadmin'].includes(user.role)) {
      throw new Error('Not authorized');
    }
    
    await docClient.send(new DeleteCommand({
      TableName: WAITLIST_TABLE,
      Key: { id }
    }));
    
    // Reorder positions for remaining entries
    await this.reorderPositions(entry.resourceId, entry.date, entry.startTime);
    
    await activityService.log('waitlist.left', user, {
      type: 'waitlist',
      id,
      name: `${entry.resourceName} on ${entry.date}`
    });
    
    return { success: true };
  },
  
  /**
   * Get a single waitlist entry
   */
  async get(id) {
    const response = await docClient.send(new GetCommand({
      TableName: WAITLIST_TABLE,
      Key: { id }
    }));
    return response.Item;
  },
  
  /**
   * Get waitlist for a specific slot
   */
  async getForSlot(resourceId, date, startTime) {
    const slotKey = `${resourceId}#${date}#${startTime}`;
    
    const response = await docClient.send(new ScanCommand({
      TableName: WAITLIST_TABLE,
      FilterExpression: '#slotKey = :slotKey AND #status = :status AND #recordType = :recordType',
      ExpressionAttributeNames: {
        '#slotKey': 'slotKey',
        '#status': 'status',
        '#recordType': 'recordType'
      },
      ExpressionAttributeValues: {
        ':slotKey': slotKey,
        ':status': 'waiting',
        ':recordType': 'waitlist'
      }
    }));
    
    return (response.Items || []).sort((a, b) => a.position - b.position);
  },
  
  /**
   * Get all waitlist entries for a user
   */
  async getByUser(userEmail) {
    const response = await docClient.send(new ScanCommand({
      TableName: WAITLIST_TABLE,
      FilterExpression: '#userEmail = :userEmail AND #recordType = :recordType',
      ExpressionAttributeNames: {
        '#userEmail': 'userEmail',
        '#recordType': 'recordType'
      },
      ExpressionAttributeValues: {
        ':userEmail': userEmail,
        ':recordType': 'waitlist'
      }
    }));
    
    return (response.Items || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  
  /**
   * Get user's position in a specific waitlist
   */
  async getUserPosition(resourceId, date, startTime, userEmail) {
    const waitlist = await this.getForSlot(resourceId, date, startTime);
    return waitlist.find(e => e.userEmail === userEmail);
  },
  
  /**
   * Notify next person in waitlist when spot opens
   */
  async notifyNext(resourceId, date, startTime) {
    const waitlist = await this.getForSlot(resourceId, date, startTime);
    
    if (waitlist.length === 0) {
      return null;
    }
    
    const next = waitlist[0];
    
    // Update status to notified
    await docClient.send(new UpdateCommand({
      TableName: WAITLIST_TABLE,
      Key: { id: next.id },
      UpdateExpression: 'SET #status = :status, #notifiedAt = :notifiedAt, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#notifiedAt': 'notifiedAt',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':status': 'notified',
        ':notifiedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString()
      }
    }));
    
    return {
      ...next,
      status: 'notified'
    };
  },
  
  /**
   * Convert waitlist entry to booking
   */
  async convertToBooking(id, user) {
    const entry = await this.get(id);
    
    if (!entry) {
      throw new Error('Waitlist entry not found');
    }
    
    if (entry.status !== 'notified') {
      throw new Error('This waitlist entry has not been notified');
    }
    
    // Mark as converted
    await docClient.send(new UpdateCommand({
      TableName: WAITLIST_TABLE,
      Key: { id },
      UpdateExpression: 'SET #status = :status, #convertedAt = :convertedAt, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#convertedAt': 'convertedAt',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':status': 'converted',
        ':convertedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString()
      }
    }));
    
    // Reorder remaining positions
    await this.reorderPositions(entry.resourceId, entry.date, entry.startTime);
    
    return entry;
  },
  
  /**
   * Expire old waitlist entries
   */
  async expireOld() {
    const now = new Date().toISOString();
    
    const response = await docClient.send(new ScanCommand({
      TableName: WAITLIST_TABLE,
      FilterExpression: '#expiresAt < :now AND #status = :status AND #recordType = :recordType',
      ExpressionAttributeNames: {
        '#expiresAt': 'expiresAt',
        '#status': 'status',
        '#recordType': 'recordType'
      },
      ExpressionAttributeValues: {
        ':now': now,
        ':status': 'waiting',
        ':recordType': 'waitlist'
      }
    }));
    
    const expired = response.Items || [];
    
    for (const entry of expired) {
      await docClient.send(new UpdateCommand({
        TableName: WAITLIST_TABLE,
        Key: { id: entry.id },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':status': 'expired',
          ':updatedAt': now
        }
      }));
    }
    
    return { expired: expired.length };
  },
  
  /**
   * Reorder positions after someone leaves
   */
  async reorderPositions(resourceId, date, startTime) {
    const waitlist = await this.getForSlot(resourceId, date, startTime);
    
    for (let i = 0; i < waitlist.length; i++) {
      const entry = waitlist[i];
      if (entry.position !== i + 1) {
        await docClient.send(new UpdateCommand({
          TableName: WAITLIST_TABLE,
          Key: { id: entry.id },
          UpdateExpression: 'SET #position = :position, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#position': 'position',
            '#updatedAt': 'updatedAt'
          },
          ExpressionAttributeValues: {
            ':position': i + 1,
            ':updatedAt': new Date().toISOString()
          }
        }));
      }
    }
  },
  
  /**
   * Get waitlist statistics for a resource
   */
  async getStats(resourceId, startDate, endDate) {
    const response = await docClient.send(new ScanCommand({
      TableName: WAITLIST_TABLE,
      FilterExpression: '#resourceId = :resourceId AND #recordType = :recordType',
      ExpressionAttributeNames: {
        '#resourceId': 'resourceId',
        '#recordType': 'recordType'
      },
      ExpressionAttributeValues: {
        ':resourceId': resourceId,
        ':recordType': 'waitlist'
      }
    }));
    
    const entries = response.Items || [];
    
    return {
      total: entries.length,
      waiting: entries.filter(e => e.status === 'waiting').length,
      notified: entries.filter(e => e.status === 'notified').length,
      converted: entries.filter(e => e.status === 'converted').length,
      expired: entries.filter(e => e.status === 'expired').length,
      avgPosition: entries.length > 0 
        ? entries.reduce((sum, e) => sum + (e.position || 0), 0) / entries.length 
        : 0
    };
  }
};

export default waitlistService;
