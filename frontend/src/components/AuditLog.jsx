/**
 * SDCoLab Scheduler - Audit Log Component
 * 
 * Admin interface for viewing activity logs:
 * - Who changed what, when, from where
 * - Filterable by category, user, date
 * - Expandable details with diff view
 * 
 * @version 4.2.0-rc69.6
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  History, Filter, Search, ChevronDown, ChevronRight,
  User, Calendar, Clock, ArrowRight, RefreshCw,
  Download, AlertCircle, Check, X, Edit, Trash2,
  UserPlus, Shield, Tool, BookOpen
} from 'lucide-react';
import { api } from '../lib/api.js';

// Action type icons
const actionIcons = {
  'user.created': UserPlus,
  'user.updated': Edit,
  'user.deleted': Trash2,
  'user.role_changed': Shield,
  'booking.created': BookOpen,
  'booking.updated': Edit,
  'booking.deleted': Trash2,
  'booking.approved': Check,
  'booking.rejected': X,
  'booking.cancelled': X,
  'booking.archived': Trash2,
  'booking.restored': RefreshCw,
  'resource.tool_created': Tool,
  'resource.tool_updated': Edit,
  'resource.status_changed': AlertCircle,
  'resource.maintenance': AlertCircle,
  'admin.viewed_activity_log': History
};

// Action type colors
const actionColors = {
  created: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  updated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  deleted: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  restored: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
};

const getActionColor = (action) => {
  for (const [key, color] of Object.entries(actionColors)) {
    if (action.includes(key)) return color;
  }
  return actionColors.default;
};

/**
 * Single audit log entry
 */
const AuditLogEntry = ({ entry, theme, expanded, onToggle }) => {
  const isDark = theme === 'dark';
  const Icon = actionIcons[entry.action] || History;
  
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };
  
  return (
    <div className={`
      border rounded-lg overflow-hidden transition-all
      ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}
      ${expanded ? 'shadow-md' : 'hover:shadow-sm'}
    `}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className={`
          w-full px-4 py-3 flex items-center gap-3 text-left
          ${isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}
          transition-colors
        `}
      >
        {/* Expand icon */}
        <div className={isDark ? 'text-gray-400' : 'text-gray-500'}>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        
        {/* Action icon */}
        <div className={`p-2 rounded-full ${getActionColor(entry.action)}`}>
          <Icon className="w-4 h-4" />
        </div>
        
        {/* Action description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {entry.actorName || entry.actorId}
            </span>
            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
              {entry.action.replace(/\./g, ' → ').replace(/_/g, ' ')}
            </span>
          </div>
          {entry.targetName && (
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {entry.targetType}: {entry.targetName}
            </div>
          )}
        </div>
        
        {/* Timestamp */}
        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {formatTime(entry.timestamp)}
        </div>
      </button>
      
      {/* Expanded details */}
      {expanded && (
        <div className={`
          px-4 py-3 border-t
          ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}
        `}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                Timestamp
              </dt>
              <dd className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                {new Date(entry.timestamp).toLocaleString()}
              </dd>
            </div>
            
            <div>
              <dt className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                Actor
              </dt>
              <dd className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                {entry.actorId} ({entry.actorRole})
              </dd>
            </div>
            
            {entry.targetId && (
              <div>
                <dt className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  Target ID
                </dt>
                <dd className={`font-mono text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {entry.targetId}
                </dd>
              </div>
            )}
            
            <div>
              <dt className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                Log ID
              </dt>
              <dd className={`font-mono text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {entry.id}
              </dd>
            </div>
          </div>
          
          {/* Details object */}
          {entry.details && Object.keys(entry.details).length > 0 && (
            <div className="mt-4">
              <h4 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                Details
              </h4>
              <pre className={`
                text-xs p-3 rounded overflow-x-auto
                ${isDark ? 'bg-gray-900 text-gray-300' : 'bg-white text-gray-700'}
              `}>
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </div>
          )}
          
          {/* Previous state (for updates) */}
          {entry.previousState && (
            <div className="mt-4">
              <h4 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                Previous State
              </h4>
              <pre className={`
                text-xs p-3 rounded overflow-x-auto
                ${isDark ? 'bg-gray-900 text-gray-300' : 'bg-white text-gray-700'}
              `}>
                {JSON.stringify(entry.previousState, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Main Audit Log component
 */
const AuditLog = ({ token, theme = 'light', showMessage }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  
  // Filters
  const [category, setCategory] = useState('');
  const [actorId, setActorId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  const isDark = theme === 'dark';
  
  const categories = [
    { value: '', label: 'All Categories' },
    { value: 'user', label: 'Users' },
    { value: 'booking', label: 'Bookings' },
    { value: 'resource', label: 'Resources' },
    { value: 'admin', label: 'Admin Actions' },
    { value: 'auth', label: 'Authentication' }
  ];
  
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (actorId) params.set('actorId', actorId);
      
      // api() auto-unwraps standardized responses
      const data = await api(`/users/activity?${params}`);
      setLogs(data.activities || []);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      showMessage?.('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [category, actorId, showMessage]);
  
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  
  // Filter logs by search query
  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      log.action?.toLowerCase().includes(query) ||
      log.actorId?.toLowerCase().includes(query) ||
      log.actorName?.toLowerCase().includes(query) ||
      log.targetName?.toLowerCase().includes(query) ||
      log.targetId?.toLowerCase().includes(query)
    );
  });
  
  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Action', 'Actor', 'Actor Role', 'Target Type', 'Target', 'Details'].join(','),
      ...filteredLogs.map(log => [
        log.timestamp,
        log.action,
        log.actorId,
        log.actorRole,
        log.targetType,
        log.targetName || log.targetId,
        JSON.stringify(log.details || {}).replace(/,/g, ';')
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className={`w-6 h-6 ${isDark ? 'text-orange-400' : 'text-orange-500'}`} />
          <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Audit Log
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className={`
              p-2 rounded-lg transition-colors
              ${isDark 
                ? 'hover:bg-gray-700 text-gray-400' 
                : 'hover:bg-gray-100 text-gray-500'
              }
              disabled:opacity-50
            `}
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className={`
              p-2 rounded-lg transition-colors
              ${isDark 
                ? 'hover:bg-gray-700 text-gray-400' 
                : 'hover:bg-gray-100 text-gray-500'
              }
              disabled:opacity-50
            `}
            title="Export CSV"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className={`
        p-4 rounded-lg border
        ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
      `}>
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`
              absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4
              ${isDark ? 'text-gray-400' : 'text-gray-500'}
            `} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className={`
                w-full pl-10 pr-4 py-2 rounded-lg border
                ${isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                }
                focus:outline-none focus:ring-2 focus:ring-orange-500
              `}
            />
          </div>
          
          {/* Category filter */}
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className={`
              px-4 py-2 rounded-lg border
              ${isDark 
                ? 'bg-gray-700 border-gray-600 text-white' 
                : 'bg-white border-gray-300 text-gray-900'
              }
              focus:outline-none focus:ring-2 focus:ring-orange-500
            `}
          >
            {categories.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          
          {/* Actor filter */}
          <input
            type="text"
            value={actorId}
            onChange={e => setActorId(e.target.value)}
            placeholder="Filter by user email"
            className={`
              px-4 py-2 rounded-lg border
              ${isDark 
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }
              focus:outline-none focus:ring-2 focus:ring-orange-500
            `}
          />
        </div>
      </div>
      
      {/* Results count */}
      <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        Showing {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
      </div>
      
      {/* Log entries */}
      <div className="space-y-2">
        {loading ? (
          <div className={`
            p-8 text-center rounded-lg border
            ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
          `}>
            <RefreshCw className={`w-8 h-8 mx-auto mb-2 animate-spin ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>Loading audit logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className={`
            p-8 text-center rounded-lg border
            ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
          `}>
            <History className={`w-8 h-8 mx-auto mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
              No audit logs found
            </p>
          </div>
        ) : (
          filteredLogs.map(log => (
            <AuditLogEntry
              key={log.id}
              entry={log}
              theme={theme}
              expanded={expandedId === log.id}
              onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default AuditLog;
