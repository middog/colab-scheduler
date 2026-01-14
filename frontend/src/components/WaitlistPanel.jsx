import React, { useState, useEffect, useCallback } from 'react';
import { 
  Clock, Users, Bell, X, CheckCircle, AlertCircle, 
  ChevronRight, Trash2, RefreshCw 
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Waitlist Panel Component
 * 
 * Shows user's waitlist entries and allows joining/leaving waitlists.
 * 
 * 🔥 Fire Triangle: OXYGEN layer - fair access
 * 
 * @version 4.2.0-rc69.6
 */

const WaitlistPanel = ({ token, user, theme, showMessage, onConvert }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const isDark = theme === 'dark';
  
  // api() from lib/api.js auto-unwraps standardized responses
  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/waitlist');
      // data is already unwrapped: { entries: [...] }
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);
  
  const handleLeave = async (id) => {
    if (!confirm('Leave this waitlist?')) return;
    try {
      await api(`/waitlist/${id}`, { method: 'DELETE' });
      showMessage('Removed from waitlist');
      loadEntries();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };
  
  const handleConvert = async (entry) => {
    try {
      const result = await api(`/waitlist/${entry.id}/convert`, { method: 'POST' });
      showMessage('Spot available! Create your booking now.');
      if (onConvert) {
        onConvert(result.bookingData);
      }
      loadEntries();
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
  
  const getStatusBadge = (status) => {
    const styles = {
      waiting: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
      notified: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      expired: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      converted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
    };
    return styles[status] || styles.waiting;
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
          <Clock size={18} className="text-orange-500" />
          My Waitlist ({entries.length})
        </h3>
        <button 
          onClick={loadEntries}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      
      {entries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock size={40} className="mx-auto mb-3 opacity-50" />
          <p>You're not on any waitlists</p>
          <p className="text-sm mt-1">Join a waitlist when a time slot is full</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <div 
              key={entry.id}
              className={`p-4 rounded-lg border ${
                entry.status === 'notified' 
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                  : isDark ? 'border-gray-700' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{entry.resourceName}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {entry.date} • {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(entry.status)}`}>
                      {entry.status === 'waiting' ? `#${entry.position} in line` : entry.status}
                    </span>
                    {entry.priority === 'high' && (
                      <span className="text-xs text-purple-600 dark:text-purple-400">
                        ⚡ Priority
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {entry.status === 'notified' && (
                    <button
                      onClick={() => handleConvert(entry)}
                      className="px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 text-sm flex items-center gap-1"
                    >
                      <CheckCircle size={14} /> Book Now
                    </button>
                  )}
                  {entry.status === 'waiting' && (
                    <button
                      onClick={() => handleLeave(entry.id)}
                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                      title="Leave waitlist"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              
              {entry.status === 'notified' && (
                <div className="mt-3 p-2 bg-green-100 dark:bg-green-900/30 rounded text-sm text-green-700 dark:text-green-300">
                  <Bell size={14} className="inline mr-1" />
                  A spot has opened up! Book now before it expires.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Waitlist join button (for slot view)
export const WaitlistButton = ({ token, resourceId, resourceName, date, startTime, endTime, theme, showMessage, onJoined }) => {
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(null);
  
  useEffect(() => {
    // Check if already on waitlist
    const checkPosition = async () => {
      try {
        const data = await api(`/waitlist/slot/${resourceId}/${date}/${startTime}`);
        setPosition(data.userPosition);
      } catch (err) {
        console.error('Failed to check waitlist:', err);
      }
    };
    checkPosition();
  }, [resourceId, date, startTime]);
  
  const handleJoin = async () => {
    setLoading(true);
    try {
      const result = await api('/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          resourceId,
          resourceName,
          date,
          startTime,
          endTime
        })
      });
      setPosition(result.entry.position);
      showMessage(`You're #${result.entry.position} on the waitlist`);
      if (onJoined) onJoined(result.entry);
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  
  if (position) {
    return (
      <span className="text-sm text-orange-600 dark:text-orange-400">
        #{position} on waitlist
      </span>
    );
  }
  
  return (
    <button
      onClick={() => handleJoin()}
      disabled={loading}
      className="text-sm px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50"
    >
      {loading ? 'Joining...' : 'Join Waitlist'}
    </button>
  );
};

export default WaitlistPanel;
