/**
 * SDCoLab Scheduler - Analytics Service
 * 
 * Equipment usage analytics and reporting.
 * Tracks utilization rates, peak times, and user patterns.
 * 
 * 🔥 Fire Triangle: HEAT layer - data-driven insights
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const BOOKINGS_TABLE = config.aws.tables.bookings;

export const analyticsService = {
  /**
   * Get overall utilization statistics
   */
  async getUtilizationStats(startDate, endDate, resourceId = null) {
    // Get all bookings in date range
    const response = await docClient.send(new ScanCommand({
      TableName: BOOKINGS_TABLE,
      FilterExpression: resourceId 
        ? '#date BETWEEN :start AND :end AND #resourceId = :resourceId'
        : '#date BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#date': 'date',
        ...(resourceId && { '#resourceId': 'resourceId' })
      },
      ExpressionAttributeValues: {
        ':start': startDate,
        ':end': endDate,
        ...(resourceId && { ':resourceId': resourceId })
      }
    }));
    
    const bookings = response.Items || [];
    
    // Calculate statistics
    const stats = {
      totalBookings: bookings.length,
      approvedBookings: bookings.filter(b => b.status === 'approved').length,
      pendingBookings: bookings.filter(b => b.status === 'pending').length,
      rejectedBookings: bookings.filter(b => b.status === 'rejected').length,
      cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
      
      // Hours booked
      totalHoursBooked: 0,
      avgBookingDuration: 0,
      
      // By tool
      byTool: {},
      
      // By day of week
      byDayOfWeek: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      
      // By hour
      byHour: {},
      
      // Unique users
      uniqueUsers: new Set(),
      
      // Peak times
      peakDay: null,
      peakHour: null
    };
    
    for (const booking of bookings) {
      // Calculate duration
      if (booking.startTime && booking.endTime) {
        const [startH, startM] = booking.startTime.split(':').map(Number);
        const [endH, endM] = booking.endTime.split(':').map(Number);
        const duration = (endH * 60 + endM) - (startH * 60 + startM);
        stats.totalHoursBooked += duration / 60;
        
        // Track by hour
        for (let h = startH; h < endH; h++) {
          stats.byHour[h] = (stats.byHour[h] || 0) + 1;
        }
      }
      
      // By tool
      const toolId = booking.resourceId || booking.tool;
      const toolName = booking.resourceName || booking.toolName;
      if (toolId) {
        if (!stats.byTool[toolId]) {
          stats.byTool[toolId] = { name: toolName, count: 0, hours: 0 };
        }
        stats.byTool[toolId].count++;
        
        if (booking.startTime && booking.endTime) {
          const [startH, startM] = booking.startTime.split(':').map(Number);
          const [endH, endM] = booking.endTime.split(':').map(Number);
          stats.byTool[toolId].hours += ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
        }
      }
      
      // By day of week
      if (booking.date) {
        const dayOfWeek = new Date(booking.date).getDay();
        stats.byDayOfWeek[dayOfWeek]++;
      }
      
      // Unique users
      if (booking.userEmail) {
        stats.uniqueUsers.add(booking.userEmail);
      }
    }
    
    // Calculate averages
    if (stats.approvedBookings > 0) {
      stats.avgBookingDuration = stats.totalHoursBooked / stats.approvedBookings;
    }
    
    // Find peak day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const maxDay = Object.entries(stats.byDayOfWeek).reduce((a, b) => 
      (b[1] > (stats.byDayOfWeek[a[0]] || 0) ? b : a)
    );
    stats.peakDay = { day: dayNames[maxDay[0]], count: maxDay[1] };
    
    // Find peak hour
    if (Object.keys(stats.byHour).length > 0) {
      const maxHour = Object.entries(stats.byHour).reduce((a, b) => 
        (b[1] > a[1] ? b : a)
      );
      stats.peakHour = { hour: parseInt(maxHour[0]), count: maxHour[1] };
    }
    
    // Convert Set to count
    stats.uniqueUsersCount = stats.uniqueUsers.size;
    delete stats.uniqueUsers;
    
    // Convert byTool to array
    stats.toolRanking = Object.entries(stats.byTool)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.count - a.count);
    
    // Calculate utilization rate (assuming 12 hours/day available, 7 days)
    const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (24 * 60 * 60 * 1000)) + 1;
    const totalAvailableHours = days * 12 * config.tools.length;
    stats.utilizationRate = totalAvailableHours > 0 
      ? (stats.totalHoursBooked / totalAvailableHours * 100).toFixed(1) 
      : 0;
    
    return stats;
  },
  
  /**
   * Get heatmap data for bookings
   */
  async getHeatmapData(startDate, endDate, resourceId = null) {
    const response = await docClient.send(new ScanCommand({
      TableName: BOOKINGS_TABLE,
      FilterExpression: resourceId 
        ? '#date BETWEEN :start AND :end AND #resourceId = :resourceId AND #status = :approved'
        : '#date BETWEEN :start AND :end AND #status = :approved',
      ExpressionAttributeNames: {
        '#date': 'date',
        '#status': 'status',
        ...(resourceId && { '#resourceId': 'resourceId' })
      },
      ExpressionAttributeValues: {
        ':start': startDate,
        ':end': endDate,
        ':approved': 'approved',
        ...(resourceId && { ':resourceId': resourceId })
      }
    }));
    
    const bookings = response.Items || [];
    
    // Create heatmap: day of week (0-6) x hour (0-23)
    const heatmap = {};
    for (let day = 0; day < 7; day++) {
      heatmap[day] = {};
      for (let hour = 0; hour < 24; hour++) {
        heatmap[day][hour] = 0;
      }
    }
    
    for (const booking of bookings) {
      if (booking.date && booking.startTime && booking.endTime) {
        const dayOfWeek = new Date(booking.date).getDay();
        const [startH] = booking.startTime.split(':').map(Number);
        const [endH] = booking.endTime.split(':').map(Number);
        
        for (let h = startH; h < endH && h < 24; h++) {
          heatmap[dayOfWeek][h]++;
        }
      }
    }
    
    // Find max for normalization
    let maxValue = 0;
    for (const day of Object.values(heatmap)) {
      for (const count of Object.values(day)) {
        if (count > maxValue) maxValue = count;
      }
    }
    
    return {
      heatmap,
      maxValue,
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      hours: Array.from({ length: 24 }, (_, i) => i)
    };
  },
  
  /**
   * Get user activity statistics
   */
  async getUserStats(startDate, endDate, limit = 20) {
    const response = await docClient.send(new ScanCommand({
      TableName: BOOKINGS_TABLE,
      FilterExpression: '#date BETWEEN :start AND :end',
      ExpressionAttributeNames: { '#date': 'date' },
      ExpressionAttributeValues: {
        ':start': startDate,
        ':end': endDate
      }
    }));
    
    const bookings = response.Items || [];
    
    // Aggregate by user
    const userStats = {};
    
    for (const booking of bookings) {
      const email = booking.userEmail;
      if (!email) continue;
      
      if (!userStats[email]) {
        userStats[email] = {
          email,
          name: booking.userName,
          totalBookings: 0,
          approvedBookings: 0,
          rejectedBookings: 0,
          cancelledBookings: 0,
          totalHours: 0,
          tools: new Set()
        };
      }
      
      userStats[email].totalBookings++;
      
      if (booking.status === 'approved') {
        userStats[email].approvedBookings++;
        
        if (booking.startTime && booking.endTime) {
          const [startH, startM] = booking.startTime.split(':').map(Number);
          const [endH, endM] = booking.endTime.split(':').map(Number);
          userStats[email].totalHours += ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
        }
      } else if (booking.status === 'rejected') {
        userStats[email].rejectedBookings++;
      } else if (booking.status === 'cancelled') {
        userStats[email].cancelledBookings++;
      }
      
      if (booking.resourceId) {
        userStats[email].tools.add(booking.resourceId);
      }
    }
    
    // Convert and sort
    const topUsers = Object.values(userStats)
      .map(u => ({
        ...u,
        toolsUsed: u.tools.size,
        tools: undefined
      }))
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, limit);
    
    return {
      topUsers,
      totalUsers: Object.keys(userStats).length
    };
  },
  
  /**
   * Get tool-specific analytics
   */
  async getToolAnalytics(resourceId, startDate, endDate) {
    const response = await docClient.send(new ScanCommand({
      TableName: BOOKINGS_TABLE,
      FilterExpression: '#date BETWEEN :start AND :end AND #resourceId = :resourceId',
      ExpressionAttributeNames: {
        '#date': 'date',
        '#resourceId': 'resourceId'
      },
      ExpressionAttributeValues: {
        ':start': startDate,
        ':end': endDate,
        ':resourceId': resourceId
      }
    }));
    
    const bookings = response.Items || [];
    const tool = config.tools.find(t => t.id === resourceId);
    
    // Daily usage
    const dailyUsage = {};
    let current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      dailyUsage[dateStr] = { bookings: 0, hours: 0 };
      current.setDate(current.getDate() + 1);
    }
    
    for (const booking of bookings) {
      if (booking.status === 'approved' && dailyUsage[booking.date]) {
        dailyUsage[booking.date].bookings++;
        
        if (booking.startTime && booking.endTime) {
          const [startH, startM] = booking.startTime.split(':').map(Number);
          const [endH, endM] = booking.endTime.split(':').map(Number);
          dailyUsage[booking.date].hours += ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
        }
      }
    }
    
    // Calculate trends
    const dates = Object.keys(dailyUsage).sort();
    const usageArray = dates.map(d => dailyUsage[d].hours);
    
    // Simple trend calculation (comparing first half to second half)
    const midpoint = Math.floor(usageArray.length / 2);
    const firstHalf = usageArray.slice(0, midpoint);
    const secondHalf = usageArray.slice(midpoint);
    
    const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
    
    const trend = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg * 100).toFixed(1) : 0;
    
    return {
      resourceId,
      resourceName: tool?.name || resourceId,
      totalBookings: bookings.length,
      approvedBookings: bookings.filter(b => b.status === 'approved').length,
      totalHours: bookings
        .filter(b => b.status === 'approved')
        .reduce((sum, b) => {
          if (b.startTime && b.endTime) {
            const [startH, startM] = b.startTime.split(':').map(Number);
            const [endH, endM] = b.endTime.split(':').map(Number);
            return sum + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
          }
          return sum;
        }, 0),
      dailyUsage: Object.entries(dailyUsage).map(([date, data]) => ({
        date,
        ...data
      })),
      trend: parseFloat(trend),
      trendDirection: trend > 5 ? 'up' : trend < -5 ? 'down' : 'stable'
    };
  },
  
  /**
   * Get cancellation analytics
   */
  async getCancellationStats(startDate, endDate) {
    const response = await docClient.send(new ScanCommand({
      TableName: BOOKINGS_TABLE,
      FilterExpression: '#date BETWEEN :start AND :end',
      ExpressionAttributeNames: { '#date': 'date' },
      ExpressionAttributeValues: {
        ':start': startDate,
        ':end': endDate
      }
    }));
    
    const bookings = response.Items || [];
    
    const total = bookings.length;
    const cancelled = bookings.filter(b => b.status === 'cancelled');
    const rejected = bookings.filter(b => b.status === 'rejected');
    
    // Cancellation reasons (if tracked)
    const cancelReasons = {};
    for (const booking of cancelled) {
      const reason = booking.cancellationReason || 'Not specified';
      cancelReasons[reason] = (cancelReasons[reason] || 0) + 1;
    }
    
    // Rejection reasons
    const rejectReasons = {};
    for (const booking of rejected) {
      const reason = booking.rejectionReason || 'Not specified';
      rejectReasons[reason] = (rejectReasons[reason] || 0) + 1;
    }
    
    return {
      totalBookings: total,
      cancelledCount: cancelled.length,
      rejectedCount: rejected.length,
      cancellationRate: total > 0 ? (cancelled.length / total * 100).toFixed(1) : 0,
      rejectionRate: total > 0 ? (rejected.length / total * 100).toFixed(1) : 0,
      cancelReasons: Object.entries(cancelReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      rejectReasons: Object.entries(rejectReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
    };
  },
  
  /**
   * Generate summary report
   */
  async generateReport(startDate, endDate) {
    const [utilization, userStats, cancellation, heatmap] = await Promise.all([
      this.getUtilizationStats(startDate, endDate),
      this.getUserStats(startDate, endDate, 10),
      this.getCancellationStats(startDate, endDate),
      this.getHeatmapData(startDate, endDate)
    ]);
    
    return {
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      summary: {
        totalBookings: utilization.totalBookings,
        totalHoursBooked: utilization.totalHoursBooked.toFixed(1),
        uniqueUsers: utilization.uniqueUsersCount,
        utilizationRate: utilization.utilizationRate + '%',
        avgBookingDuration: utilization.avgBookingDuration.toFixed(1) + ' hours'
      },
      peakTimes: {
        day: utilization.peakDay,
        hour: utilization.peakHour
      },
      toolRanking: utilization.toolRanking.slice(0, 5),
      topUsers: userStats.topUsers.slice(0, 5),
      cancellation: {
        rate: cancellation.cancellationRate + '%',
        rejectionRate: cancellation.rejectionRate + '%'
      },
      heatmapSummary: {
        busiestDay: heatmap.days[Object.entries(heatmap.heatmap)
          .reduce((a, b) => {
            const aSum = Object.values(a[1]).reduce((x, y) => x + y, 0);
            const bSum = Object.values(b[1]).reduce((x, y) => x + y, 0);
            return bSum > aSum ? b : a;
          })[0]],
        busiestHour: Object.entries(
          Object.values(heatmap.heatmap).reduce((acc, day) => {
            Object.entries(day).forEach(([h, c]) => {
              acc[h] = (acc[h] || 0) + c;
            });
            return acc;
          }, {})
        ).reduce((a, b) => b[1] > a[1] ? b : a)[0] + ':00'
      }
    };
  }
};

export default analyticsService;
