import React, { useState, useMemo, useCallback } from 'react';
import { 
  Calendar, ChevronLeft, ChevronRight, List, Grid, Clock, 
  X, Check, Edit, Trash2, Download, Filter, Search,
  CalendarRange, Wrench, ExternalLink, AlertCircle, CheckCircle,
  XCircle, ChevronDown
} from 'lucide-react';

/**
 * MyBookingsPanel - Enhanced booking management with calendar view
 * 
 * Features:
 * - Calendar view (month/week)
 * - List view with sorting
 * - Timeline view
 * - Filtering by status, date, tool
 * - Bulk operations
 * - Export functionality
 * 
 * 🔥 Fire Triangle: FUEL layer - user resource management
 */

const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m || '00'} ${hour >= 12 ? 'PM' : 'AM'}`;
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getStatusColor = (status, isDark) => {
  const colors = {
    approved: isDark ? 'bg-green-900/50 text-green-300 border-green-700' : 'bg-green-100 text-green-700 border-green-300',
    pending: isDark ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' : 'bg-yellow-100 text-yellow-700 border-yellow-300',
    rejected: isDark ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-red-100 text-red-700 border-red-300',
    cancelled: isDark ? 'bg-gray-700 text-gray-400 border-gray-600' : 'bg-gray-100 text-gray-500 border-gray-300'
  };
  return colors[status] || colors.pending;
};

const getStatusIcon = (status) => {
  const icons = {
    approved: <CheckCircle size={14} className="text-green-500" />,
    pending: <Clock size={14} className="text-yellow-500" />,
    rejected: <XCircle size={14} className="text-red-500" />,
    cancelled: <X size={14} className="text-gray-400" />
  };
  return icons[status] || icons.pending;
};

// Generate calendar days for a month
const getMonthDays = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];
  
  // Add padding for days before first day of month
  const startPadding = firstDay.getDay();
  for (let i = 0; i < startPadding; i++) {
    const d = new Date(year, month, -startPadding + i + 1);
    days.push({ date: d.toISOString().split('T')[0], isCurrentMonth: false });
  }
  
  // Add days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d).toISOString().split('T')[0], isCurrentMonth: true });
  }
  
  // Add padding for days after last day of month
  const endPadding = 42 - days.length; // 6 weeks * 7 days
  for (let i = 1; i <= endPadding; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d.toISOString().split('T')[0], isCurrentMonth: false });
  }
  
  return days;
};

// Get week dates
const getWeekDates = (startDate) => {
  const dates = [];
  const start = new Date(startDate);
  const day = start.getDay();
  const diff = start.getDate() - day;
  start.setDate(diff);
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
};

const MyBookingsPanel = ({ 
  bookings = [], 
  tools = [],
  theme, 
  onCancel, 
  onEdit, 
  onMultiBook,
  showMessage 
}) => {
  const [viewMode, setViewMode] = useState('list'); // 'list', 'calendar', 'week', 'timeline'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState('all');
  const [toolFilter, setToolFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [selectedBookings, setSelectedBookings] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  
  const isDark = theme === 'dark';
  const today = new Date().toISOString().split('T')[0];
  
  // Filter and sort bookings
  const filteredBookings = useMemo(() => {
    let filtered = [...bookings];
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(b => b.status === statusFilter);
    }
    
    // Tool filter
    if (toolFilter !== 'all') {
      filtered = filtered.filter(b => (b.resourceId || b.tool) === toolFilter);
    }
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(b => 
        (b.resourceName || b.toolName || '').toLowerCase().includes(term) ||
        (b.purpose || '').toLowerCase().includes(term) ||
        b.date.includes(term)
      );
    }
    
    // Sort
    const [field, direction] = sortBy.split('-');
    filtered.sort((a, b) => {
      let cmp = 0;
      if (field === 'date') {
        cmp = a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
      } else if (field === 'tool') {
        cmp = (a.resourceName || a.toolName || '').localeCompare(b.resourceName || b.toolName || '');
      } else if (field === 'status') {
        cmp = a.status.localeCompare(b.status);
      }
      return direction === 'asc' ? cmp : -cmp;
    });
    
    return filtered;
  }, [bookings, statusFilter, toolFilter, searchTerm, sortBy]);
  
  // Get bookings for a specific date
  const getBookingsForDate = useCallback((date) => {
    return filteredBookings.filter(b => b.date === date);
  }, [filteredBookings]);
  
  // Statistics
  const stats = useMemo(() => {
    const upcoming = bookings.filter(b => b.date >= today && b.status !== 'cancelled' && b.status !== 'rejected');
    return {
      total: bookings.length,
      upcoming: upcoming.length,
      approved: bookings.filter(b => b.status === 'approved' && b.date >= today).length,
      pending: bookings.filter(b => b.status === 'pending').length,
      past: bookings.filter(b => b.date < today).length
    };
  }, [bookings, today]);
  
  // Calendar navigation
  const navigateCalendar = (direction) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'calendar') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else {
      newDate.setDate(newDate.getDate() + (direction * 7));
    }
    setCurrentDate(newDate);
  };
  
  const goToToday = () => setCurrentDate(new Date());
  
  // Bulk operations
  const toggleSelectBooking = (id) => {
    setSelectedBookings(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };
  
  const selectAll = () => {
    const cancelable = filteredBookings.filter(b => b.status !== 'rejected' && b.status !== 'cancelled');
    setSelectedBookings(cancelable.map(b => b.id));
  };
  
  const clearSelection = () => setSelectedBookings([]);
  
  const cancelSelected = async () => {
    if (selectedBookings.length === 0) return;
    if (!confirm(`Cancel ${selectedBookings.length} booking(s)?`)) return;
    
    let success = 0, failed = 0;
    for (const id of selectedBookings) {
      try {
        await onCancel(id);
        success++;
      } catch {
        failed++;
      }
    }
    
    showMessage(`Cancelled ${success} booking(s)${failed > 0 ? `, ${failed} failed` : ''}`);
    clearSelection();
  };
  
  // Export bookings
  const exportBookings = () => {
    const data = filteredBookings.map(b => ({
      Date: b.date,
      Tool: b.resourceName || b.toolName,
      Time: `${formatTime(b.startTime)} - ${formatTime(b.endTime)}`,
      Purpose: b.purpose,
      Status: b.status
    }));
    
    const csv = [
      Object.keys(data[0] || {}).join(','),
      ...data.map(row => Object.values(row).map(v => `"${v || ''}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-bookings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showMessage('Bookings exported to CSV');
  };
  
  // Calendar month data
  const calendarDays = useMemo(() => {
    return getMonthDays(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);
  
  // Week data
  const weekDates = useMemo(() => {
    return getWeekDates(currentDate.toISOString().split('T')[0]);
  }, [currentDate]);
  
  const inputClass = `px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`;
  const btnClass = `px-3 py-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`;
  
  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-blue-500' },
          { label: 'Upcoming', value: stats.upcoming, color: 'text-purple-500' },
          { label: 'Approved', value: stats.approved, color: 'text-green-500' },
          { label: 'Pending', value: stats.pending, color: 'text-yellow-500' },
          { label: 'Past', value: stats.past, color: 'text-gray-500' }
        ].map(stat => (
          <div 
            key={stat.label}
            className={`p-3 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow`}
          >
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{stat.label}</div>
          </div>
        ))}
      </div>
      
      {/* Main Panel */}
      <div className={`rounded-lg shadow ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col lg:flex-row gap-4 justify-between">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'border-gray-600' : 'border-gray-300'}`}>
                {[
                  { id: 'list', icon: List, label: 'List' },
                  { id: 'calendar', icon: Calendar, label: 'Month' },
                  { id: 'week', icon: CalendarRange, label: 'Week' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setViewMode(mode.id)}
                    className={`px-3 py-2 flex items-center gap-1 text-sm ${
                      viewMode === mode.id 
                        ? 'bg-orange-500 text-white' 
                        : isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-50'
                    }`}
                    title={mode.label}
                  >
                    <mode.icon size={16} />
                    <span className="hidden sm:inline">{mode.label}</span>
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => onMultiBook?.()}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2"
              >
                <CalendarRange size={18} />
                <span className="hidden sm:inline">Multi-Book</span>
              </button>
            </div>
            
            {/* Search & Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`${inputClass} pl-9 w-40 lg:w-56`}
                />
              </div>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`${btnClass} flex items-center gap-1 border ${isDark ? 'border-gray-600' : 'border-gray-300'} ${showFilters ? 'bg-orange-100 dark:bg-orange-900/30' : ''}`}
              >
                <Filter size={16} />
                <span className="hidden sm:inline">Filters</span>
                {(statusFilter !== 'all' || toolFilter !== 'all') && (
                  <span className="w-2 h-2 bg-orange-500 rounded-full" />
                )}
              </button>
              
              <button onClick={exportBookings} className={btnClass} title="Export CSV">
                <Download size={18} />
              </button>
            </div>
          </div>
          
          {/* Filters Row */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className={inputClass}
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
              
              <select 
                value={toolFilter} 
                onChange={(e) => setToolFilter(e.target.value)}
                className={inputClass}
              >
                <option value="all">All Tools</option>
                {tools.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className={inputClass}
              >
                <option value="date-desc">Date (Newest)</option>
                <option value="date-asc">Date (Oldest)</option>
                <option value="tool-asc">Tool (A-Z)</option>
                <option value="status-asc">Status</option>
              </select>
              
              {(statusFilter !== 'all' || toolFilter !== 'all') && (
                <button 
                  onClick={() => { setStatusFilter('all'); setToolFilter('all'); }}
                  className="text-orange-500 text-sm hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
          
          {/* Bulk Actions */}
          {selectedBookings.length > 0 && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm">
                {selectedBookings.length} selected
              </span>
              <button 
                onClick={cancelSelected}
                className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              >
                Cancel Selected
              </button>
              <button 
                onClick={clearSelection}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        
        {/* Calendar Navigation (for calendar/week views) */}
        {(viewMode === 'calendar' || viewMode === 'week') && (
          <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <button onClick={() => navigateCalendar(-1)} className={btnClass}>
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={goToToday}
                className="px-3 py-1 text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50"
              >
                Today
              </button>
              <button onClick={() => navigateCalendar(1)} className={btnClass}>
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="font-semibold">
              {viewMode === 'calendar' 
                ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`
              }
            </div>
          </div>
        )}
        
        {/* Content Area */}
        <div className="p-4">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12">
              <Calendar size={48} className={`mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                {bookings.length === 0 ? 'No bookings yet' : 'No bookings match your filters'}
              </p>
              <button
                onClick={() => onMultiBook?.()}
                className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
              >
                Book a Tool
              </button>
            </div>
          ) : viewMode === 'list' ? (
            /* List View */
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              <div className="flex items-center gap-2 pb-2 mb-2">
                <input
                  type="checkbox"
                  checked={selectedBookings.length === filteredBookings.filter(b => b.status !== 'rejected' && b.status !== 'cancelled').length}
                  onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
                  className="rounded"
                />
                <span className="text-sm text-gray-500">Select all</span>
              </div>
              {filteredBookings.map(booking => (
                <div key={booking.id} className="py-4 flex flex-col sm:flex-row justify-between gap-2">
                  <div className="flex items-start gap-3">
                    {booking.status !== 'rejected' && booking.status !== 'cancelled' && (
                      <input
                        type="checkbox"
                        checked={selectedBookings.includes(booking.id)}
                        onChange={() => toggleSelectBooking(booking.id)}
                        className="rounded mt-1"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{booking.resourceName || booking.toolName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${getStatusColor(booking.status, isDark)}`}>
                          {getStatusIcon(booking.status)}
                          <span className="ml-1">{booking.status}</span>
                        </span>
                      </div>
                      <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {formatDate(booking.date)} • {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                      </div>
                      <div className="text-sm">{booking.purpose}</div>
                      {booking.date < today && booking.status === 'approved' && (
                        <span className="text-xs text-gray-400">Completed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:self-center">
                    {booking.calendarEventUrl && (
                      <a href={booking.calendarEventUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600">
                        <ExternalLink size={16} />
                      </a>
                    )}
                    {['pending', 'approved'].includes(booking.status) && booking.date >= today && (
                      <>
                        <button 
                          onClick={() => onEdit?.(booking)} 
                          className="p-1 text-blue-500 hover:text-blue-600"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => onCancel?.(booking.id)} 
                          className="p-1 text-red-500 hover:text-red-600"
                          title="Cancel"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === 'calendar' ? (
            /* Month Calendar View */
            <div>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className={`text-center text-sm font-medium py-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  const dayBookings = getBookingsForDate(day.date);
                  const isToday = day.date === today;
                  const isPast = day.date < today;
                  
                  return (
                    <div
                      key={idx}
                      className={`min-h-24 p-1 rounded border ${
                        !day.isCurrentMonth 
                          ? isDark ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50 border-gray-100'
                          : isToday
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                            : isDark ? 'border-gray-700' : 'border-gray-200'
                      } ${isPast && day.isCurrentMonth ? 'opacity-60' : ''}`}
                    >
                      <div className={`text-sm font-medium ${
                        isToday ? 'text-orange-600' : 
                        !day.isCurrentMonth ? 'text-gray-400' : ''
                      }`}>
                        {new Date(day.date + 'T12:00:00').getDate()}
                      </div>
                      <div className="space-y-1 mt-1">
                        {dayBookings.slice(0, 3).map(b => (
                          <div 
                            key={b.id}
                            onClick={() => onEdit?.(b)}
                            className={`text-xs px-1 py-0.5 rounded truncate cursor-pointer ${getStatusColor(b.status, isDark)}`}
                            title={`${b.resourceName || b.toolName} - ${formatTime(b.startTime)}`}
                          >
                            {formatTime(b.startTime).replace(':00', '')} {(b.resourceName || b.toolName || '').substring(0, 8)}
                          </div>
                        ))}
                        {dayBookings.length > 3 && (
                          <div className="text-xs text-gray-400 pl-1">
                            +{dayBookings.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Week View */
            <div>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {weekDates.map(date => {
                  const isToday = date === today;
                  const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNum = new Date(date + 'T12:00:00').getDate();
                  
                  return (
                    <div 
                      key={date}
                      className={`text-center p-2 rounded ${
                        isToday ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : ''
                      }`}
                    >
                      <div className="text-sm font-medium">{dayName}</div>
                      <div className={`text-lg ${isToday ? 'font-bold' : ''}`}>{dayNum}</div>
                    </div>
                  );
                })}
              </div>
              {/* Week grid */}
              <div className="grid grid-cols-7 gap-2">
                {weekDates.map(date => {
                  const dayBookings = getBookingsForDate(date);
                  const isPast = date < today;
                  
                  return (
                    <div 
                      key={date}
                      className={`min-h-40 p-2 rounded border ${
                        isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200'
                      } ${isPast ? 'opacity-60' : ''}`}
                    >
                      {dayBookings.length === 0 ? (
                        <div className={`text-xs text-center py-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                          No bookings
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dayBookings.map(b => (
                            <div 
                              key={b.id}
                              onClick={() => onEdit?.(b)}
                              className={`p-2 rounded cursor-pointer border ${getStatusColor(b.status, isDark)}`}
                            >
                              <div className="text-xs font-medium truncate">
                                {b.resourceName || b.toolName}
                              </div>
                              <div className="text-xs opacity-75">
                                {formatTime(b.startTime)} - {formatTime(b.endTime)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className={`p-3 border-t ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'} text-sm text-gray-500`}>
          Showing {filteredBookings.length} of {bookings.length} bookings
        </div>
      </div>
    </div>
  );
};

export default MyBookingsPanel;
