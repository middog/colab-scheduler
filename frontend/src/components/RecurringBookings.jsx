import React, { useState, useEffect, useCallback } from 'react';
import { 
  Repeat, Calendar, Clock, Plus, Trash2, Pause, Play, 
  ChevronDown, ChevronRight, AlertCircle, CheckCircle, X
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Recurring Bookings Component
 * 
 * Manage recurring booking series with patterns like weekly, daily, etc.
 * 
 * 🔥 Fire Triangle: FUEL layer - scheduled access
 * 
 * @version 4.2.0-rc69.6
 */

// Pattern templates
const PATTERN_TEMPLATES = [
  { name: 'Every weekday', pattern: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', desc: 'Mon-Fri' },
  { name: 'Weekly', pattern: 'FREQ=WEEKLY', desc: 'Same day each week' },
  { name: 'MWF', pattern: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', desc: 'Mon, Wed, Fri' },
  { name: 'TTh', pattern: 'FREQ=WEEKLY;BYDAY=TU,TH', desc: 'Tue, Thu' },
  { name: 'Daily', pattern: 'FREQ=DAILY', desc: 'Every day' },
  { name: 'Bi-weekly', pattern: 'FREQ=WEEKLY;INTERVAL=2', desc: 'Every 2 weeks' },
  { name: 'Monthly', pattern: 'FREQ=MONTHLY', desc: 'Same day each month' },
  { name: 'Weekends', pattern: 'FREQ=WEEKLY;BYDAY=SA,SU', desc: 'Sat & Sun' },
];

const RecurringBookings = ({ token, user, tools, theme, showMessage }) => {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [expandedSeries, setExpandedSeries] = useState(null);
  const [seriesBookings, setSeriesBookings] = useState({});
  
  const isDark = theme === 'dark';
  
  // api() from lib/api.js auto-unwraps standardized responses
  const loadSeries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/recurring');
      setSeries(data.series || []);
    } catch (err) {
      console.error('Failed to load recurring series:', err);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    loadSeries();
  }, [loadSeries]);
  
  const loadSeriesBookings = async (seriesId) => {
    try {
      const data = await api(`/recurring/${seriesId}`);
      setSeriesBookings(prev => ({ ...prev, [seriesId]: data.bookings }));
    } catch (err) {
      console.error('Failed to load series bookings:', err);
    }
  };
  
  const toggleExpanded = async (seriesId) => {
    if (expandedSeries === seriesId) {
      setExpandedSeries(null);
    } else {
      setExpandedSeries(seriesId);
      if (!seriesBookings[seriesId]) {
        await loadSeriesBookings(seriesId);
      }
    }
  };
  
  const handleCancel = async (seriesId) => {
    if (!confirm('Cancel this recurring series? This will cancel all future bookings.')) return;
    try {
      await api(`/recurring/${seriesId}`, { method: 'DELETE' });
      showMessage('Recurring series cancelled');
      loadSeries();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };
  
  const handlePause = async (seriesId) => {
    try {
      await api(`/recurring/${seriesId}/pause`, { method: 'POST' });
      showMessage('Series paused');
      loadSeries();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };
  
  const handleResume = async (seriesId) => {
    try {
      await api(`/recurring/${seriesId}/resume`, { method: 'POST' });
      showMessage('Series resumed');
      loadSeries();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };
  
  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    return `${h % 12 || 12}:${minutes} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  
  const getPatternLabel = (pattern) => {
    const template = PATTERN_TEMPLATES.find(t => t.pattern === pattern);
    if (template) return template.name;
    
    // Parse pattern
    if (pattern.includes('FREQ=DAILY')) return 'Daily';
    if (pattern.includes('FREQ=WEEKLY')) {
      if (pattern.includes('BYDAY=')) {
        const days = pattern.match(/BYDAY=([A-Z,]+)/)?.[1];
        return days ? `Weekly (${days})` : 'Weekly';
      }
      if (pattern.includes('INTERVAL=2')) return 'Bi-weekly';
      return 'Weekly';
    }
    if (pattern.includes('FREQ=MONTHLY')) return 'Monthly';
    return pattern;
  };
  
  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
      cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
    };
    return styles[status] || styles.active;
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2">
          <Repeat size={18} className="text-purple-500" />
          Recurring Bookings ({series.length})
        </h3>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-3 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-1 text-sm"
        >
          <Plus size={16} /> New Series
        </button>
      </div>
      
      {series.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Repeat size={40} className="mx-auto mb-3 opacity-50" />
          <p>No recurring bookings</p>
          <p className="text-sm mt-1">Create a recurring series for regular tool access</p>
        </div>
      ) : (
        <div className="space-y-3">
          {series.map(s => (
            <div 
              key={s.id}
              className={`rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}
            >
              <div 
                className="p-4 cursor-pointer"
                onClick={() => toggleExpanded(s.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {expandedSeries === s.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                    <div>
                      <div className="font-medium">{s.resourceName}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {getPatternLabel(s.recurrence)} • {formatTime(s.startTime)} - {formatTime(s.endTime)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {s.startDate} to {s.endDate} • {s.createdInstances}/{s.totalInstances} created
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(s.status)}`}>
                      {s.status}
                    </span>
                    
                    {s.status === 'active' && (
                      <button
                        onClick={() => handlePause(s.id)}
                        className="p-1.5 text-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded"
                        title="Pause series"
                      >
                        <Pause size={16} />
                      </button>
                    )}
                    {s.status === 'paused' && (
                      <button
                        onClick={() => handleResume(s.id)}
                        className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                        title="Resume series"
                      >
                        <Play size={16} />
                      </button>
                    )}
                    {s.status !== 'cancelled' && (
                      <button
                        onClick={() => handleCancel(s.id)}
                        className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        title="Cancel series"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Expanded bookings */}
              {expandedSeries === s.id && (
                <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} p-4`}>
                  <h4 className="text-sm font-medium mb-2">Upcoming Bookings</h4>
                  {seriesBookings[s.id] ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {seriesBookings[s.id]
                        .filter(b => b.date >= new Date().toISOString().split('T')[0])
                        .slice(0, 10)
                        .map(booking => (
                          <div 
                            key={booking.id}
                            className={`flex justify-between items-center p-2 rounded ${
                              isDark ? 'bg-gray-700' : 'bg-gray-50'
                            }`}
                          >
                            <span className="text-sm">{booking.date}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              booking.status === 'approved' 
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                : booking.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                                  : 'bg-gray-100 text-gray-600'
                            }`}>
                              {booking.status}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full mx-auto" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Create Modal */}
      {createModalOpen && (
        <CreateRecurringModal
          token={token}
          tools={tools}
          theme={theme}
          onClose={() => setCreateModalOpen(false)}
          onCreated={() => {
            setCreateModalOpen(false);
            loadSeries();
          }}
          showMessage={showMessage}
        />
      )}
    </div>
  );
};

// Create recurring booking modal
const CreateRecurringModal = ({ token, tools, theme, onClose, onCreated, showMessage }) => {
  const [formData, setFormData] = useState({
    resourceId: '',
    startDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '10:00',
    purpose: '',
    recurrence: 'FREQ=WEEKLY'
  });
  const [loading, setLoading] = useState(false);
  const [customPattern, setCustomPattern] = useState(false);
  
  const isDark = theme === 'dark';
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const selectedTool = tools.find(t => t.id === formData.resourceId);
      
      // api() auto-unwraps standardized responses
      const data = await api('/recurring', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          resourceName: selectedTool?.name
        })
      });
      
      showMessage(`Created recurring series with ${data.createdBookings} bookings`);
      onCreated();
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const inputClass = `w-full p-3 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`;
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className={`relative w-full max-w-lg rounded-xl shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Repeat className="text-purple-500" /> New Recurring Booking
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tool *</label>
              <select
                value={formData.resourceId}
                onChange={(e) => setFormData({ ...formData, resourceId: e.target.value })}
                required
                className={inputClass}
              >
                <option value="">Select a tool...</option>
                {tools.map(tool => (
                  <option key={tool.id} value={tool.id}>{tool.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
                required
                className={inputClass}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Time *</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Time *</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  required
                  className={inputClass}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Recurrence Pattern *</label>
              {!customPattern ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {PATTERN_TEMPLATES.slice(0, 6).map(template => (
                      <button
                        key={template.pattern}
                        type="button"
                        onClick={() => setFormData({ ...formData, recurrence: template.pattern })}
                        className={`p-2 rounded border text-left text-sm ${
                          formData.recurrence === template.pattern
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                            : isDark ? 'border-gray-600' : 'border-gray-300'
                        }`}
                      >
                        <div className="font-medium">{template.name}</div>
                        <div className="text-xs text-gray-500">{template.desc}</div>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomPattern(true)}
                    className="text-sm text-purple-600 hover:underline"
                  >
                    Custom pattern...
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={formData.recurrence}
                    onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                    placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Format: FREQ=DAILY|WEEKLY|MONTHLY, BYDAY=MO,TU,WE..., COUNT=N, INTERVAL=N
                  </p>
                  <button
                    type="button"
                    onClick={() => setCustomPattern(false)}
                    className="text-sm text-purple-600 hover:underline mt-1"
                  >
                    Use templates
                  </button>
                </>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Purpose *</label>
              <textarea
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                placeholder="What will you be working on?"
                rows={2}
                required
                className={inputClass}
              />
            </div>
            
            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Series'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RecurringBookings;
