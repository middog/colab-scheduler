import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, ChevronLeft, ChevronRight, X, Check, Clock, 
  Wrench, Save, Trash2, AlertCircle, Grid, List
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Multi-Select Calendar Component
 * 
 * Allows users to select multiple tools and time slots across days/weeks,
 * then submit all bookings at once.
 * 
 * 🔥 Fire Triangle: OXYGEN layer - batch scheduling
 * 
 * @version 4.2.0-rc69.15
 */

// Generate time slots for a day (e.g., 8am to 8pm in 1-hour increments)
const generateTimeSlots = (startHour = 8, endHour = 20, intervalMinutes = 60) => {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += intervalMinutes) {
      const start = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      const endMin = min + intervalMinutes;
      const endHr = endMin >= 60 ? hour + 1 : hour;
      const end = `${endHr.toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;
      slots.push({ start, end, label: formatTime(start) });
    }
  }
  return slots;
};

const formatTime = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  return `${h % 12 || 12}:${minutes} ${h >= 12 ? 'PM' : 'AM'}`;
};

const formatDate = (date) => {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { 
    weekday: 'short', month: 'short', day: 'numeric' 
  });
};

const getWeekDates = (startDate) => {
  const dates = [];
  const start = new Date(startDate);
  // Adjust to Monday
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
};

const MultiSelectCalendar = ({ 
  token, 
  user, 
  tools = [], 
  theme, 
  showMessage, 
  onClose, 
  onBookingsCreated 
}) => {
  const [viewMode, setViewMode] = useState('week'); // 'day', 'week', 'month'
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTools, setSelectedTools] = useState([]);
  const [selections, setSelections] = useState([]); // [{toolId, date, startTime, endTime}]
  const [existingBookings, setExistingBookings] = useState([]);
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const isDark = theme === 'dark';
  const timeSlots = useMemo(() => generateTimeSlots(8, 20, 60), []);
  
  // Get dates for current view
  const viewDates = useMemo(() => {
    if (viewMode === 'day') {
      return [currentDate];
    } else if (viewMode === 'week') {
      return getWeekDates(currentDate);
    } else {
      // Month view - get all days in month
      const date = new Date(currentDate);
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const dates = [];
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }
      return dates;
    }
  }, [currentDate, viewMode]);
  
  // Fetch existing bookings for selected tools and date range
  useEffect(() => {
    const fetchBookings = async () => {
      if (selectedTools.length === 0 || viewDates.length === 0) {
        setExistingBookings([]);
        return;
      }
      
      setLoading(true);
      try {
        const startDate = viewDates[0];
        const endDate = viewDates[viewDates.length - 1];
        
        const allBookings = [];
        for (const toolId of selectedTools) {
          try {
            // api() auto-unwraps standardized responses
            const data = await api(`/bookings?resourceId=${toolId}&startDate=${startDate}&endDate=${endDate}`);
            allBookings.push(...(data.bookings || []));
          } catch (err) {
            console.error(`Failed to fetch bookings for tool ${toolId}:`, err);
          }
        }
        setExistingBookings(allBookings.filter(b => b.status !== 'cancelled' && b.status !== 'rejected'));
      } catch (err) {
        console.error('Failed to fetch bookings:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchBookings();
  }, [selectedTools, viewDates]);
  
  // Check if a slot is already booked
  const isSlotBooked = useCallback((toolId, date, startTime) => {
    return existingBookings.some(b => 
      b.resourceId === toolId && 
      b.date === date && 
      b.startTime <= startTime && 
      b.endTime > startTime
    );
  }, [existingBookings]);
  
  // Check if a slot is selected
  const isSlotSelected = useCallback((toolId, date, startTime, endTime) => {
    return selections.some(s => 
      s.toolId === toolId && 
      s.date === date && 
      s.startTime === startTime
    );
  }, [selections]);
  
  // Toggle slot selection
  const toggleSlot = (toolId, date, startTime, endTime) => {
    if (isSlotBooked(toolId, date, startTime)) return;
    
    const existing = selections.findIndex(s => 
      s.toolId === toolId && s.date === date && s.startTime === startTime
    );
    
    if (existing >= 0) {
      setSelections(prev => prev.filter((_, i) => i !== existing));
    } else {
      const tool = (tools || []).find(t => t.id === toolId);
      setSelections(prev => [...prev, { 
        toolId, 
        toolName: tool?.name || toolId,
        date, 
        startTime, 
        endTime 
      }]);
    }
  };
  
  // Clear all selections
  const clearSelections = () => {
    setSelections([]);
  };
  
  // Submit all bookings
  const handleSubmit = async () => {
    if (selections.length === 0) {
      showMessage('Please select at least one time slot', 'error');
      return;
    }
    if (!purpose.trim()) {
      showMessage('Please enter a purpose for the bookings', 'error');
      return;
    }
    
    setSubmitting(true);
    const results = { success: 0, failed: 0, errors: [] };
    
    for (const selection of selections) {
      try {
        // api() auto-unwraps standardized responses
        await api('/bookings', {
          method: 'POST',
          body: JSON.stringify({
            resourceId: selection.toolId,
            resourceName: selection.toolName,
            date: selection.date,
            startTime: selection.startTime,
            endTime: selection.endTime,
            purpose: purpose.trim()
          })
        });
        
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${selection.toolName} on ${selection.date}: ${err.message}`);
      }
    }
    
    setSubmitting(false);
    
    if (results.success > 0) {
      // Build detailed success message
      const toolNames = [...new Set(selections.map(s => s.toolName))];
      const dates = [...new Set(selections.map(s => s.date))].sort();
      const dateRange = dates.length === 1 
        ? dates[0] 
        : `${dates[0]} to ${dates[dates.length - 1]}`;
      
      const successMsg = results.success === 1
        ? `✅ Booking request submitted for ${toolNames[0]} on ${dateRange}. Awaiting approval.`
        : `✅ ${results.success} booking requests submitted for ${toolNames.join(', ')} (${dateRange}). Awaiting approval.${results.failed > 0 ? ` ⚠️ ${results.failed} failed.` : ''}`;
      
      showMessage(successMsg);
      setSelections([]);
      setPurpose('');
      if (onBookingsCreated) onBookingsCreated();
    } else {
      showMessage(`Failed to create bookings: ${results.errors[0]}`, 'error');
    }
  };
  
  // Navigation
  const navigate = (direction) => {
    const date = new Date(currentDate);
    if (viewMode === 'day') {
      date.setDate(date.getDate() + direction);
    } else if (viewMode === 'week') {
      date.setDate(date.getDate() + (direction * 7));
    } else {
      date.setMonth(date.getMonth() + direction);
    }
    setCurrentDate(date.toISOString().split('T')[0]);
  };
  
  const goToToday = () => {
    setCurrentDate(new Date().toISOString().split('T')[0]);
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="flex h-full">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        
        {/* Main panel */}
        <div className={`relative ml-auto w-full max-w-6xl h-full flex flex-col ${
          isDark ? 'bg-gray-900' : 'bg-white'
        } shadow-2xl`}>
          
          {/* Header */}
          <div className={`flex items-center justify-between p-4 border-b ${
            isDark ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex items-center gap-3">
              <Calendar className="text-orange-500" size={24} />
              <div>
                <h2 className="text-xl font-bold">Multi-Select Booking</h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Select multiple tools and time slots, then save all at once
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
              <X size={24} />
            </button>
          </div>
          
          {/* Tool selector */}
          <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex flex-wrap gap-2">
              <span className={`text-sm py-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Select tools:
              </span>
              {(tools || []).filter(t => t?.status !== 'maintenance').map(tool => (
                <button
                  key={tool.id}
                  onClick={() => {
                    if (selectedTools.includes(tool.id)) {
                      setSelectedTools(prev => prev.filter(id => id !== tool.id));
                      setSelections(prev => prev.filter(s => s.toolId !== tool.id));
                    } else {
                      setSelectedTools(prev => [...prev, tool.id]);
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedTools.includes(tool.id)
                      ? 'bg-orange-500 text-white'
                      : isDark 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  <Wrench size={14} className="inline mr-1" />
                  {tool.name}
                </button>
              ))}
            </div>
          </div>
          
          {/* Navigation bar */}
          <div className={`flex items-center justify-between p-3 border-b ${
            isDark ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                <ChevronLeft size={20} />
              </button>
              <button onClick={goToToday} className="px-3 py-1 text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded">
                Today
              </button>
              <button onClick={() => navigate(1)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                <ChevronRight size={20} />
              </button>
              <span className="ml-2 font-medium">
                {viewMode === 'month' 
                  ? new Date(currentDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : viewMode === 'week'
                    ? `${formatDate(viewDates[0])} - ${formatDate(viewDates[6])}`
                    : formatDate(currentDate)
                }
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'border-gray-600' : 'border-gray-300'}`}>
                {['day', 'week'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1 text-sm capitalize ${
                      viewMode === mode 
                        ? 'bg-orange-500 text-white' 
                        : isDark ? 'bg-gray-800' : 'bg-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Calendar grid */}
          <div className="flex-1 overflow-auto p-4">
            {selectedTools.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Wrench size={48} className="mb-4 opacity-50" />
                <p>Select one or more tools above to view availability</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="min-w-[600px]">
                {/* Grid header - dates */}
                <div className="flex">
                  <div className="w-20 shrink-0" /> {/* Time column */}
                  {viewDates.map(date => (
                    <div 
                      key={date} 
                      className={`flex-1 text-center p-2 font-medium text-sm border-b ${
                        date === new Date().toISOString().split('T')[0] 
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' 
                          : ''
                      } ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
                    >
                      {formatDate(date)}
                    </div>
                  ))}
                </div>
                
                {/* For each tool */}
                {selectedTools.map(toolId => {
                  const tool = (tools || []).find(t => t.id === toolId);
                  return (
                    <div key={toolId} className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                      {/* Tool name header */}
                      <div className={`p-2 font-medium text-sm ${
                        isDark ? 'bg-gray-800' : 'bg-gray-100'
                      }`}>
                        <Wrench size={14} className="inline mr-1 text-orange-500" />
                        {tool?.name}
                      </div>
                      
                      {/* Time slots */}
                      {timeSlots.map(slot => (
                        <div key={slot.start} className="flex">
                          <div className={`w-20 shrink-0 p-1 text-xs text-right pr-2 ${
                            isDark ? 'text-gray-500 border-r border-gray-700' : 'text-gray-400 border-r border-gray-200'
                          }`}>
                            {slot.label}
                          </div>
                          {viewDates.map(date => {
                            const isBooked = isSlotBooked(toolId, date, slot.start);
                            const isSelected = isSlotSelected(toolId, date, slot.start, slot.end);
                            const isPast = date < new Date().toISOString().split('T')[0];
                            
                            return (
                              <div
                                key={`${date}-${slot.start}`}
                                onClick={() => !isPast && !isBooked && toggleSlot(toolId, date, slot.start, slot.end)}
                                className={`flex-1 h-8 border-r border-b cursor-pointer transition-colors ${
                                  isDark ? 'border-gray-800' : 'border-gray-100'
                                } ${
                                  isPast 
                                    ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' 
                                    : isBooked 
                                      ? 'bg-red-100 dark:bg-red-900/30 cursor-not-allowed' 
                                      : isSelected 
                                        ? 'bg-orange-500 hover:bg-orange-600' 
                                        : 'hover:bg-orange-100 dark:hover:bg-orange-900/20'
                                }`}
                                title={
                                  isPast ? 'Past date' :
                                  isBooked ? 'Already booked' :
                                  isSelected ? 'Click to deselect' :
                                  'Click to select'
                                }
                              >
                                {isSelected && (
                                  <Check size={14} className="text-white m-auto mt-1.5" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Selection summary and submit */}
          <div className={`border-t p-4 ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex flex-col md:flex-row gap-4">
              {/* Selected slots summary */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">
                    Selected: {selections.length} slot{selections.length !== 1 ? 's' : ''}
                  </span>
                  {selections.length > 0 && (
                    <button 
                      onClick={clearSelections}
                      className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 size={14} /> Clear all
                    </button>
                  )}
                </div>
                
                {selections.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {selections.map((sel, i) => (
                      <span 
                        key={i}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                          isDark ? 'bg-gray-700' : 'bg-gray-200'
                        }`}
                      >
                        {sel.toolName} • {sel.date} {formatTime(sel.startTime)}
                        <button 
                          onClick={() => setSelections(prev => prev.filter((_, idx) => idx !== i))}
                          className="hover:text-red-500"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Purpose and submit */}
              <div className="flex items-end gap-2">
                <div className="flex-1 md:w-64">
                  <label className="block text-sm font-medium mb-1">Purpose *</label>
                  <input
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="What will you be working on?"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                    }`}
                  />
                </div>
                <button
                  onClick={() => handleSubmit()}
                  disabled={submitting || selections.length === 0}
                  className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Save {selections.length > 0 ? `(${selections.length})` : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiSelectCalendar;
