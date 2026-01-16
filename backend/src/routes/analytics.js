/**
 * SDCoLab Scheduler - Analytics Routes
 * 
 * API endpoints for usage analytics and reporting.
 * 
 * 🔥 Fire Triangle: HEAT layer - insights
 * 
 * @version 4.2.0-rc69.15
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { analyticsService } from '../lib/analytics.js';
import { ErrorCodes, sendSuccess, sendError } from '../lib/responses.js';

const router = Router();

// All analytics routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/analytics/utilization
 * Get overall utilization statistics
 */
router.get('/utilization', async (req, res) => {
  try {
    const { startDate, endDate, resourceId } = req.query;
    
    // Default to last 30 days
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const stats = await analyticsService.getUtilizationStats(start, end, resourceId);
    
    sendSuccess(res, {
      period: { startDate: start, endDate: end },
      stats
    });
  } catch (error) {
    console.error('Get utilization stats error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get utilization statistics');
  }
});

/**
 * GET /api/analytics/heatmap
 * Get booking heatmap data (day x hour)
 */
router.get('/heatmap', async (req, res) => {
  try {
    const { startDate, endDate, resourceId } = req.query;
    
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const heatmap = await analyticsService.getHeatmapData(start, end, resourceId);
    
    sendSuccess(res, {
      period: { startDate: start, endDate: end },
      ...heatmap
    });
  } catch (error) {
    console.error('Get heatmap error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get heatmap data');
  }
});

/**
 * GET /api/analytics/users
 * Get user activity statistics
 */
router.get('/users', async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const stats = await analyticsService.getUserStats(start, end, parseInt(limit) || 20);
    
    sendSuccess(res, {
      period: { startDate: start, endDate: end },
      ...stats
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get user statistics');
  }
});

/**
 * GET /api/analytics/tool/:resourceId
 * Get analytics for a specific tool
 */
router.get('/tool/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { startDate, endDate } = req.query;
    
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const analytics = await analyticsService.getToolAnalytics(resourceId, start, end);
    
    sendSuccess(res, {
      period: { startDate: start, endDate: end },
      ...analytics
    });
  } catch (error) {
    console.error('Get tool analytics error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get tool analytics');
  }
});

/**
 * GET /api/analytics/cancellations
 * Get cancellation and rejection statistics
 */
router.get('/cancellations', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const stats = await analyticsService.getCancellationStats(start, end);
    
    sendSuccess(res, {
      period: { startDate: start, endDate: end },
      ...stats
    });
  } catch (error) {
    console.error('Get cancellation stats error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get cancellation statistics');
  }
});

/**
 * GET /api/analytics/report
 * Generate comprehensive analytics report
 */
router.get('/report', async (req, res) => {
  try {
    const { startDate, endDate, format } = req.query;
    
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const report = await analyticsService.generateReport(start, end);
    
    if (format === 'csv') {
      // Generate CSV format
      const csv = [
        'SDCoLab Scheduler Analytics Report',
        `Period: ${start} to ${end}`,
        `Generated: ${report.generatedAt}`,
        '',
        'SUMMARY',
        `Total Bookings,${report.summary.totalBookings}`,
        `Total Hours Booked,${report.summary.totalHoursBooked}`,
        `Unique Users,${report.summary.uniqueUsers}`,
        `Utilization Rate,${report.summary.utilizationRate}`,
        `Avg Booking Duration,${report.summary.avgBookingDuration}`,
        '',
        'TOP TOOLS',
        'Tool,Bookings,Hours',
        ...report.toolRanking.map(t => `${t.name},${t.count},${t.hours.toFixed(1)}`),
        '',
        'TOP USERS',
        'Name,Email,Bookings,Hours',
        ...report.topUsers.map(u => `${u.name},${u.email},${u.totalBookings},${u.totalHours.toFixed(1)}`)
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${start}-${end}.csv`);
      return res.send(csv);
    }
    
    sendSuccess(res, report);
  } catch (error) {
    console.error('Generate report error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to generate report');
  }
});

/**
 * GET /api/analytics/dashboard
 * Quick dashboard data (optimized for frequent polling)
 */
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get quick stats
    const weekStats = await analyticsService.getUtilizationStats(weekAgo, today);
    const monthStats = await analyticsService.getUtilizationStats(monthAgo, today);
    
    sendSuccess(res, {
      today: {
        date: today,
        bookings: weekStats.byDayOfWeek[new Date().getDay()] || 0
      },
      thisWeek: {
        totalBookings: weekStats.totalBookings,
        totalHours: Math.round(weekStats.totalHoursBooked),
        uniqueUsers: weekStats.uniqueUsersCount,
        utilizationRate: weekStats.utilizationRate
      },
      thisMonth: {
        totalBookings: monthStats.totalBookings,
        totalHours: Math.round(monthStats.totalHoursBooked),
        uniqueUsers: monthStats.uniqueUsersCount,
        utilizationRate: monthStats.utilizationRate
      },
      topTools: monthStats.toolRanking.slice(0, 3),
      peakTimes: {
        day: weekStats.peakDay,
        hour: weekStats.peakHour
      }
    });
  } catch (error) {
    console.error('Get dashboard data error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get dashboard data');
  }
});

export default router;
