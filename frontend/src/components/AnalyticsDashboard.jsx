import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart3, TrendingUp, TrendingDown, Minus, Users, Clock, 
  Calendar, Wrench, Download, RefreshCw, ChevronDown, Filter
} from 'lucide-react';
import { api, getTokens } from '../lib/api.js';

/**
 * Analytics Dashboard Component
 * 
 * Displays equipment usage analytics with charts and metrics.
 * 
 * 🔥 Fire Triangle: HEAT layer - data-driven insights
 * 
 * @version 4.2.0-rc69.6
 */

// Simple bar chart component
const BarChart = ({ data, maxValue, colorClass = 'bg-orange-500' }) => {
  if (!data || data.length === 0) return null;
  
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-24 text-sm text-gray-600 dark:text-gray-400 truncate">
            {item.label}
          </div>
          <div className="flex-1 h-6 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div 
              className={`h-full ${colorClass} transition-all duration-500`}
              style={{ width: `${maxValue > 0 ? (item.value / maxValue * 100) : 0}%` }}
            />
          </div>
          <div className="w-12 text-sm text-right font-medium">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
};

// Heatmap component
const Heatmap = ({ data, days, hours, maxValue }) => {
  if (!data) return null;
  
  const getColor = (value) => {
    if (value === 0) return 'bg-gray-100 dark:bg-gray-800';
    const intensity = Math.min(value / maxValue, 1);
    if (intensity < 0.25) return 'bg-orange-200 dark:bg-orange-900/30';
    if (intensity < 0.5) return 'bg-orange-300 dark:bg-orange-800/50';
    if (intensity < 0.75) return 'bg-orange-400 dark:bg-orange-700/70';
    return 'bg-orange-500 dark:bg-orange-600';
  };
  
  // Show hours 6am to 10pm
  const displayHours = hours?.filter(h => h >= 6 && h <= 22) || [];
  
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        {/* Hour labels */}
        <div className="flex ml-12 mb-1">
          {displayHours.map(h => (
            <div key={h} className="flex-1 text-xs text-center text-gray-500">
              {h}:00
            </div>
          ))}
        </div>
        
        {/* Grid */}
        {days?.map((day, dayIndex) => (
          <div key={day} className="flex items-center mb-1">
            <div className="w-12 text-xs text-gray-500">{day}</div>
            <div className="flex-1 flex gap-0.5">
              {displayHours.map(hour => (
                <div 
                  key={hour}
                  className={`flex-1 h-6 rounded ${getColor(data[dayIndex]?.[hour] || 0)}`}
                  title={`${day} ${hour}:00 - ${data[dayIndex]?.[hour] || 0} bookings`}
                />
              ))}
            </div>
          </div>
        ))}
        
        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-3 text-xs text-gray-500">
          <span>Less</span>
          <div className="flex gap-0.5">
            <div className="w-4 h-4 rounded bg-gray-100 dark:bg-gray-800" />
            <div className="w-4 h-4 rounded bg-orange-200 dark:bg-orange-900/30" />
            <div className="w-4 h-4 rounded bg-orange-300 dark:bg-orange-800/50" />
            <div className="w-4 h-4 rounded bg-orange-400 dark:bg-orange-700/70" />
            <div className="w-4 h-4 rounded bg-orange-500 dark:bg-orange-600" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
};

// Stat card component
const StatCard = ({ title, value, subtitle, icon: Icon, trend, trendValue }) => {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500';
  
  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600">
            <Icon size={20} />
          </div>
        )}
      </div>
      {trendValue && (
        <div className={`flex items-center gap-1 mt-2 text-sm ${trendColor}`}>
          <TrendIcon size={14} />
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
};

const AnalyticsDashboard = ({ token, theme }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  // Data state
  const [utilization, setUtilization] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  
  // Filters
  const [dateRange, setDateRange] = useState('30'); // days
  const [selectedTool, setSelectedTool] = useState('');
  
  const isDark = theme === 'dark';
  
  // api() from lib/api.js auto-unwraps standardized responses
  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      
      const params = `startDate=${startDate}&endDate=${endDate}${selectedTool ? `&resourceId=${selectedTool}` : ''}`;
      
      const [utilizationData, heatmapData, userData, dashboardData] = await Promise.all([
        api(`/analytics/utilization?${params}`),
        api(`/analytics/heatmap?${params}`),
        api(`/analytics/users?${params}&limit=10`),
        api('/analytics/dashboard')
      ]);
      
      // api() unwraps { success, data } -> data directly
      setUtilization(utilizationData.stats);
      setHeatmap(heatmapData);
      setUserStats(userData);
      setDashboard(dashboardData);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, selectedTool]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  const handleExport = async () => {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      
      // Use raw fetch for file download - api() wrapper is for JSON responses
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const res = await fetch(
        `${apiUrl}/analytics/report?startDate=${startDate}&endDate=${endDate}&format=csv`,
        { headers: { Authorization: `Bearer ${getTokens().authToken}` } }
      );
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${startDate}-${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-12">
        <BarChart3 size={48} className="mx-auto mb-4 text-gray-400" />
        <p className="text-gray-500">Failed to load analytics</p>
        <p className="text-sm text-gray-400 mt-1">{error}</p>
        <button 
          onClick={() => loadData()}
          className="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
        >
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="text-orange-500" /> Usage Analytics
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Equipment utilization and booking patterns
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className={`px-3 py-2 rounded-lg border ${
                isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
              }`}
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className={`px-3 py-2 rounded-lg border ${isDark ? 'border-gray-600' : 'border-gray-300'}`}
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
            
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2"
            >
              <Download size={18} /> Export
            </button>
          </div>
        </div>
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Bookings"
          value={utilization?.totalBookings || 0}
          subtitle={`${utilization?.approvedBookings || 0} approved`}
          icon={Calendar}
        />
        <StatCard
          title="Hours Booked"
          value={Math.round(utilization?.totalHoursBooked || 0)}
          subtitle={`~${(utilization?.avgBookingDuration || 0).toFixed(1)}h avg`}
          icon={Clock}
        />
        <StatCard
          title="Unique Users"
          value={utilization?.uniqueUsersCount || 0}
          icon={Users}
        />
        <StatCard
          title="Utilization"
          value={`${utilization?.utilizationRate || 0}%`}
          subtitle="of available capacity"
          icon={BarChart3}
          trend={parseFloat(utilization?.utilizationRate) > 50 ? 'up' : 'stable'}
        />
      </div>
      
      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Tool Ranking */}
        <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Wrench size={18} /> Tool Usage Ranking
          </h3>
          {utilization?.toolRanking?.length > 0 ? (
            <BarChart
              data={utilization.toolRanking.slice(0, 7).map(t => ({
                label: t.name,
                value: t.count
              }))}
              maxValue={Math.max(...utilization.toolRanking.map(t => t.count))}
            />
          ) : (
            <p className="text-gray-500 text-center py-8">No data available</p>
          )}
        </div>
        
        {/* Top Users */}
        <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Users size={18} /> Top Users (by hours)
          </h3>
          {userStats?.topUsers?.length > 0 ? (
            <BarChart
              data={userStats.topUsers.slice(0, 7).map(u => ({
                label: u.name || u.email.split('@')[0],
                value: Math.round(u.totalHours)
              }))}
              maxValue={Math.max(...userStats.topUsers.map(u => u.totalHours))}
              colorClass="bg-blue-500"
            />
          ) : (
            <p className="text-gray-500 text-center py-8">No data available</p>
          )}
        </div>
      </div>
      
      {/* Heatmap */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Calendar size={18} /> Booking Heatmap (Day × Hour)
        </h3>
        {heatmap ? (
          <Heatmap 
            data={heatmap.heatmap}
            days={heatmap.days}
            hours={heatmap.hours}
            maxValue={heatmap.maxValue}
          />
        ) : (
          <p className="text-gray-500 text-center py-8">No data available</p>
        )}
      </div>
      
      {/* Peak Times & Summary */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <h3 className="font-semibold mb-3">Peak Day</h3>
          <p className="text-3xl font-bold text-orange-500">
            {utilization?.peakDay?.day || '-'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {utilization?.peakDay?.count || 0} bookings
          </p>
        </div>
        
        <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <h3 className="font-semibold mb-3">Peak Hour</h3>
          <p className="text-3xl font-bold text-orange-500">
            {utilization?.peakHour?.hour !== undefined 
              ? `${utilization.peakHour.hour}:00` 
              : '-'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {utilization?.peakHour?.count || 0} bookings at this hour
          </p>
        </div>
        
        <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <h3 className="font-semibold mb-3">Booking Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Approved</span>
              <span className="font-medium text-green-600">{utilization?.approvedBookings || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Pending</span>
              <span className="font-medium text-yellow-600">{utilization?.pendingBookings || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rejected</span>
              <span className="font-medium text-red-600">{utilization?.rejectedBookings || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Cancelled</span>
              <span className="font-medium text-gray-600">{utilization?.cancelledBookings || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
