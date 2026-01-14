/**
 * SDCoLab Scheduler - Recurring Bookings Service
 * 
 * Supports recurring booking patterns (daily, weekly, monthly).
 * Generates individual booking instances from recurrence rules.
 * 
 * 🔥 Fire Triangle: FUEL layer - scheduled resource access
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
import { config } from './config.js';
import { activityService, bookingService } from './database.js';

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const RECURRING_TABLE = config.aws.tables.recurring || config.aws.tables.bookings;

/**
 * Parse RRULE-like recurrence pattern
 * Simplified version supporting: DAILY, WEEKLY, MONTHLY
 */
const parseRecurrence = (pattern) => {
  // Pattern format: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10" or "FREQ=DAILY;UNTIL=2026-03-01"
  const parts = pattern.split(';');
  const rule = {};
  
  for (const part of parts) {
    const [key, value] = part.split('=');
    switch (key) {
      case 'FREQ':
        rule.frequency = value.toLowerCase();
        break;
      case 'BYDAY':
        rule.byDay = value.split(',');
        break;
      case 'COUNT':
        rule.count = parseInt(value);
        break;
      case 'UNTIL':
        rule.until = value;
        break;
      case 'INTERVAL':
        rule.interval = parseInt(value);
        break;
    }
  }
  
  return rule;
};

/**
 * Generate dates from recurrence rule
 */
const generateDates = (startDate, rule, maxDates = 52) => {
  const dates = [];
  const start = new Date(startDate);
  const interval = rule.interval || 1;
  const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  
  let current = new Date(start);
  let count = 0;
  const maxCount = rule.count || maxDates;
  const until = rule.until ? new Date(rule.until) : new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000);
  
  while (count < maxCount && current <= until) {
    if (rule.frequency === 'daily') {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + interval);
      count++;
    } else if (rule.frequency === 'weekly') {
      if (rule.byDay && rule.byDay.length > 0) {
        // Specific days of week
        const targetDays = rule.byDay.map(d => dayMap[d]);
        const currentDay = current.getDay();
        
        if (targetDays.includes(currentDay)) {
          dates.push(current.toISOString().split('T')[0]);
          count++;
        }
        
        current.setDate(current.getDate() + 1);
        
        // If we've gone through a week, apply interval
        if (current.getDay() === start.getDay()) {
          current.setDate(current.getDate() + (interval - 1) * 7);
        }
      } else {
        // Same day each week
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + interval * 7);
        count++;
      }
    } else if (rule.frequency === 'monthly') {
      dates.push(current.toISOString().split('T')[0]);
      current.setMonth(current.getMonth() + interval);
      count++;
    }
  }
  
  return dates;
};

export const recurringService = {
  /**
   * Create a recurring booking series
   */
  async create(recurringData, user) {
    const seriesId = uuidv4();
    const now = new Date().toISOString();
    
    // Parse and validate recurrence pattern
    const rule = parseRecurrence(recurringData.recurrence);
    if (!rule.frequency) {
      throw new Error('Invalid recurrence pattern');
    }
    
    // Generate dates for the series
    const dates = generateDates(recurringData.startDate, rule);
    
    if (dates.length === 0) {
      throw new Error('No valid dates generated from recurrence pattern');
    }
    
    // Create series record
    const series = {
      id: seriesId,
      recordType: 'recurring-series',
      resourceId: recurringData.resourceId,
      resourceName: recurringData.resourceName,
      userEmail: user.email,
      userName: user.displayName || user.name,
      userId: user.id,
      startTime: recurringData.startTime,
      endTime: recurringData.endTime,
      purpose: recurringData.purpose,
      recurrence: recurringData.recurrence,
      recurrenceRule: rule,
      startDate: recurringData.startDate,
      endDate: dates[dates.length - 1],
      totalInstances: dates.length,
      createdInstances: 0,
      status: 'active', // active, paused, cancelled
      requiresApproval: recurringData.requiresApproval !== false,
      createdAt: now,
      updatedAt: now,
      createdBy: user.email
    };
    
    await docClient.send(new PutCommand({
      TableName: RECURRING_TABLE,
      Item: series
    }));
    
    // Generate booking instances (up to configured weeks ahead)
    const weeksAhead = config.recurring?.generateWeeksAhead || 4;
    const generateUntil = new Date();
    generateUntil.setDate(generateUntil.getDate() + weeksAhead * 7);
    
    const instancesToCreate = dates.filter(d => new Date(d) <= generateUntil);
    const createdBookings = [];
    
    for (const date of instancesToCreate) {
      try {
        const booking = await bookingService.create({
          tool: recurringData.resourceId,
          toolName: recurringData.resourceName,
          resourceType: 'tool',
          resourceId: recurringData.resourceId,
          resourceName: recurringData.resourceName,
          date,
          startTime: recurringData.startTime,
          endTime: recurringData.endTime,
          purpose: recurringData.purpose,
          seriesId, // Link to series
          isRecurring: true
        }, user);
        
        createdBookings.push(booking);
      } catch (err) {
        console.warn(`Failed to create recurring instance for ${date}:`, err.message);
      }
    }
    
    // Update series with created count
    await docClient.send(new UpdateCommand({
      TableName: RECURRING_TABLE,
      Key: { id: seriesId },
      UpdateExpression: 'SET #createdInstances = :count, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#createdInstances': 'createdInstances',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':count': createdBookings.length,
        ':now': now
      }
    }));
    
    await activityService.log('recurring.created', user, {
      type: 'recurring',
      id: seriesId,
      name: `${recurringData.resourceName} - ${rule.frequency}`
    }, {
      totalInstances: dates.length,
      createdInstances: createdBookings.length,
      pattern: recurringData.recurrence
    });
    
    return {
      series: { ...series, createdInstances: createdBookings.length },
      bookings: createdBookings,
      pendingDates: dates.filter(d => !instancesToCreate.includes(d))
    };
  },
  
  /**
   * Get a recurring series
   */
  async get(seriesId) {
    const response = await docClient.send(new GetCommand({
      TableName: RECURRING_TABLE,
      Key: { id: seriesId }
    }));
    return response.Item;
  },
  
  /**
   * Get all recurring series for a user
   */
  async getByUser(userEmail) {
    const response = await docClient.send(new ScanCommand({
      TableName: RECURRING_TABLE,
      FilterExpression: '#userEmail = :email AND #recordType = :type',
      ExpressionAttributeNames: {
        '#userEmail': 'userEmail',
        '#recordType': 'recordType'
      },
      ExpressionAttributeValues: {
        ':email': userEmail,
        ':type': 'recurring-series'
      }
    }));
    
    return (response.Items || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  
  /**
   * Get bookings for a series
   */
  async getSeriesBookings(seriesId) {
    const response = await docClient.send(new ScanCommand({
      TableName: config.aws.tables.bookings,
      FilterExpression: '#seriesId = :seriesId',
      ExpressionAttributeNames: {
        '#seriesId': 'seriesId'
      },
      ExpressionAttributeValues: {
        ':seriesId': seriesId
      }
    }));
    
    return (response.Items || []).sort((a, b) => a.date.localeCompare(b.date));
  },
  
  /**
   * Cancel entire series
   */
  async cancelSeries(seriesId, user, cancelFutureOnly = true) {
    const series = await this.get(seriesId);
    
    if (!series) {
      throw new Error('Series not found');
    }
    
    if (series.userEmail !== user.email && !['admin', 'superadmin'].includes(user.role)) {
      throw new Error('Not authorized');
    }
    
    // Get all bookings in series
    const bookings = await this.getSeriesBookings(seriesId);
    const today = new Date().toISOString().split('T')[0];
    
    // Cancel bookings
    let cancelledCount = 0;
    for (const booking of bookings) {
      if (!cancelFutureOnly || booking.date >= today) {
        if (booking.status !== 'cancelled' && booking.status !== 'rejected') {
          await bookingService.update(booking.id, { status: 'cancelled' }, user);
          cancelledCount++;
        }
      }
    }
    
    // Update series status
    await docClient.send(new UpdateCommand({
      TableName: RECURRING_TABLE,
      Key: { id: seriesId },
      UpdateExpression: 'SET #status = :status, #cancelledAt = :now, #cancelledBy = :by, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#cancelledAt': 'cancelledAt',
        '#cancelledBy': 'cancelledBy',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':status': 'cancelled',
        ':now': new Date().toISOString(),
        ':by': user.email
      }
    }));
    
    await activityService.log('recurring.cancelled', user, {
      type: 'recurring',
      id: seriesId,
      name: series.resourceName
    }, {
      cancelledBookings: cancelledCount,
      futureOnly: cancelFutureOnly
    });
    
    return { 
      success: true, 
      cancelledBookings: cancelledCount 
    };
  },
  
  /**
   * Pause a series (stop generating new instances)
   */
  async pauseSeries(seriesId, user) {
    const series = await this.get(seriesId);
    
    if (!series) {
      throw new Error('Series not found');
    }
    
    if (series.userEmail !== user.email && !['admin', 'superadmin'].includes(user.role)) {
      throw new Error('Not authorized');
    }
    
    await docClient.send(new UpdateCommand({
      TableName: RECURRING_TABLE,
      Key: { id: seriesId },
      UpdateExpression: 'SET #status = :status, #pausedAt = :now, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#pausedAt': 'pausedAt',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':status': 'paused',
        ':now': new Date().toISOString()
      }
    }));
    
    return { success: true };
  },
  
  /**
   * Resume a paused series
   */
  async resumeSeries(seriesId, user) {
    const series = await this.get(seriesId);
    
    if (!series) {
      throw new Error('Series not found');
    }
    
    if (series.status !== 'paused') {
      throw new Error('Series is not paused');
    }
    
    if (series.userEmail !== user.email && !['admin', 'superadmin'].includes(user.role)) {
      throw new Error('Not authorized');
    }
    
    await docClient.send(new UpdateCommand({
      TableName: RECURRING_TABLE,
      Key: { id: seriesId },
      UpdateExpression: 'SET #status = :status, #resumedAt = :now, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#resumedAt': 'resumedAt',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':status': 'active',
        ':now': new Date().toISOString()
      }
    }));
    
    return { success: true };
  },
  
  /**
   * Generate future instances for active series (cron job)
   */
  async generateFutureInstances() {
    const response = await docClient.send(new ScanCommand({
      TableName: RECURRING_TABLE,
      FilterExpression: '#status = :status AND #recordType = :type',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#recordType': 'recordType'
      },
      ExpressionAttributeValues: {
        ':status': 'active',
        ':type': 'recurring-series'
      }
    }));
    
    const activeSeries = response.Items || [];
    const weeksAhead = config.recurring?.generateWeeksAhead || 4;
    const generateUntil = new Date();
    generateUntil.setDate(generateUntil.getDate() + weeksAhead * 7);
    
    let totalCreated = 0;
    
    for (const series of activeSeries) {
      const rule = series.recurrenceRule || parseRecurrence(series.recurrence);
      const dates = generateDates(series.startDate, rule);
      
      // Get existing bookings for this series
      const existingBookings = await this.getSeriesBookings(series.id);
      const existingDates = new Set(existingBookings.map(b => b.date));
      
      // Find dates that need to be created
      const today = new Date().toISOString().split('T')[0];
      const datesToCreate = dates.filter(d => 
        d >= today && 
        new Date(d) <= generateUntil && 
        !existingDates.has(d)
      );
      
      // Create missing instances
      for (const date of datesToCreate) {
        try {
          await bookingService.create({
            tool: series.resourceId,
            toolName: series.resourceName,
            resourceType: 'tool',
            resourceId: series.resourceId,
            resourceName: series.resourceName,
            date,
            startTime: series.startTime,
            endTime: series.endTime,
            purpose: series.purpose,
            seriesId: series.id,
            isRecurring: true
          }, { email: series.userEmail, displayName: series.userName, id: series.userId });
          
          totalCreated++;
        } catch (err) {
          console.warn(`Failed to generate instance for series ${series.id} on ${date}:`, err.message);
        }
      }
      
      // Update series count
      if (datesToCreate.length > 0) {
        await docClient.send(new UpdateCommand({
          TableName: RECURRING_TABLE,
          Key: { id: series.id },
          UpdateExpression: 'SET #createdInstances = #createdInstances + :count, #updatedAt = :now',
          ExpressionAttributeNames: {
            '#createdInstances': 'createdInstances',
            '#updatedAt': 'updatedAt'
          },
          ExpressionAttributeValues: {
            ':count': datesToCreate.length,
            ':now': new Date().toISOString()
          }
        }));
      }
    }
    
    return { 
      processedSeries: activeSeries.length,
      createdInstances: totalCreated 
    };
  }
};

export default recurringService;
