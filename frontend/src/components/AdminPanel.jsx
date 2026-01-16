import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CheckCircle, XCircle, Clock, Filter, Search, RefreshCw, ChevronLeft, ChevronRight,
  Eye, EyeOff, Calendar, Users, AlertTriangle, Wrench, Mail, MessageSquare,
  ChevronDown, ChevronUp, ArrowUpDown, Download, MoreHorizontal, Check, X,
  Archive, Trash2, Edit, Send, UserCheck, Shield, Bell, Settings
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Enhanced Admin Panel
 * 
 * Features:
 * - Class/Booking Approvals with batch actions
 * - Advanced filtering and pagination
 * - Visibility controls for resources
 * - Quick actions menu
 * - Keyboard shortcuts
 * - Real-time updates
 * 
 * 🔥 Fire Triangle: OXYGEN layer - governance and oversight
 * 
 * @version 4.2.0-rc69.15
 */

// Pagination hook
const usePagination = (items, itemsPerPage = 10) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(itemsPerPage);
  
  const totalPages = Math.ceil(items.length / perPage);
  const startIndex = (currentPage - 1) * perPage;
  const paginatedItems = items.slice(startIndex, startIndex + perPage);
  
  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };
  
  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);
  
  // Reset to page 1 when items change significantly
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);
  
  return {
    currentPage,
    totalPages,
    perPage,
    setPerPage,
    paginatedItems,
    goToPage,
    nextPage,
    prevPage,
    startIndex,
    endIndex: Math.min(startIndex + perPage, items.length),
    totalItems: items.length
  };
};

// Dropdown Menu Component
const DropdownMenu = ({ trigger, children, align = 'right' }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={`absolute z-50 mt-1 py-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}>
            {React.Children.map(children, child => 
              React.cloneElement(child, { onClick: () => { child.props.onClick?.(); setIsOpen(false); }})
            )}
          </div>
        </>
      )}
    </div>
  );
};

const DropdownItem = ({ icon: Icon, children, onClick, variant = 'default', disabled = false }) => {
  const variants = {
    default: 'hover:bg-gray-100 dark:hover:bg-gray-700',
    danger: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20',
    success: 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
};

// Sort indicator component
const SortIndicator = ({ sortKey, currentSort, onSort }) => {
  const isActive = currentSort.key === sortKey;
  const Icon = isActive && currentSort.direction === 'asc' ? ChevronUp : 
               isActive && currentSort.direction === 'desc' ? ChevronDown : ArrowUpDown;
  
  return (
    <button 
      onClick={() => onSort(sortKey)}
      className={`ml-1 p-0.5 rounded ${isActive ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <Icon size={14} />
    </button>
  );
};

// Status badge component
const StatusBadge = ({ status, size = 'md' }) => {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    active: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
  };
  
  const sizes = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm'
  };
  
  return (
    <span className={`rounded font-medium ${styles[status] || styles.pending} ${sizes[size]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// Checkbox component
const Checkbox = ({ checked, onChange, indeterminate = false }) => {
  const ref = React.useRef();
  
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
    />
  );
};

// Main AdminPanel Component
const AdminPanel = ({ token, user, theme, showMessage, onNavigate }) => {
  // Core state
  const [activeTab, setActiveTab] = useState('approvals');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Bookings state
  const [pendingBookings, setPendingBookings] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [selectedBookings, setSelectedBookings] = useState(new Set());
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [toolFilter, setToolFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);
  
  // Sorting
  const [sort, setSort] = useState({ key: 'date', direction: 'asc' });
  
  // Visibility state
  const [resources, setResources] = useState([]);
  const [visibilityChanges, setVisibilityChanges] = useState({});
  
  // Class approvals state
  const [classRequests, setClassRequests] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState(new Set());
  
  // Modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [bulkAction, setBulkAction] = useState(null);
  
  const isDark = theme === 'dark';
  
  // Load data - uses shared api() which auto-unwraps standardized responses
  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      
      const [bookingsData, resourcesData] = await Promise.all([
        api('/bookings?status=all&admin=true').catch(() => ({ bookings: [] })),
        api('/resources/tools').catch(() => ({ tools: [] }))
      ]);
      
      // api() unwraps { success, data } -> data, so we get { bookings: [...] } directly
      setAllBookings(bookingsData.bookings || []);
      setPendingBookings((bookingsData.bookings || []).filter(b => b.status === 'pending'));
      setResources(resourcesData.tools || []);
      
      // Load class requests if that tab is active
      if (activeTab === 'classes') {
        const classData = await api('/certifications/requests').catch(() => ({ requests: [] }));
        setClassRequests(classData.requests || []);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      showMessage('Failed to load data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showMessage, activeTab]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Filtered and sorted bookings
  const filteredBookings = useMemo(() => {
    let filtered = statusFilter === 'all' ? allBookings : 
                   statusFilter === 'pending' ? pendingBookings :
                   allBookings.filter(b => b.status === statusFilter);
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(b => 
        b.userName?.toLowerCase().includes(search) ||
        b.userEmail?.toLowerCase().includes(search) ||
        b.purpose?.toLowerCase().includes(search) ||
        b.resourceName?.toLowerCase().includes(search)
      );
    }
    
    // Tool filter
    if (toolFilter) {
      filtered = filtered.filter(b => b.resourceId === toolFilter || b.tool === toolFilter);
    }
    
    // Date range filter
    if (dateRangeFilter.start) {
      filtered = filtered.filter(b => b.date >= dateRangeFilter.start);
    }
    if (dateRangeFilter.end) {
      filtered = filtered.filter(b => b.date <= dateRangeFilter.end);
    }
    
    // Sort
    return [...filtered].sort((a, b) => {
      const aVal = a[sort.key] || '';
      const bVal = b[sort.key] || '';
      const comparison = aVal.localeCompare(bVal);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [allBookings, pendingBookings, statusFilter, searchTerm, toolFilter, dateRangeFilter, sort]);
  
  // Pagination
  const pagination = usePagination(filteredBookings, 15);
  
  // Handle sort
  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  // Selection handlers
  const handleSelectAll = () => {
    if (selectedBookings.size === pagination.paginatedItems.length) {
      setSelectedBookings(new Set());
    } else {
      setSelectedBookings(new Set(pagination.paginatedItems.map(b => b.id)));
    }
  };
  
  const handleSelectBooking = (id) => {
    const newSelected = new Set(selectedBookings);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedBookings(newSelected);
  };
  
  // Approval actions
  const handleApprove = async (id) => {
    try {
      await api(`/bookings/${id}/approve`, { method: 'POST' });
      showMessage('Booking approved');
      loadData(true);
      setSelectedBookings(prev => { prev.delete(id); return new Set(prev); });
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };
  
  const handleReject = async () => {
    if (!rejectingBooking) return;
    try {
      await api(`/bookings/${rejectingBooking.id}/reject`, { 
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason || 'Rejected by admin' })
      });
      showMessage('Booking rejected');
      setRejectModalOpen(false);
      setRejectingBooking(null);
      setRejectReason('');
      loadData(true);
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };
  
  // Bulk actions
  const handleBulkApprove = async () => {
    if (selectedBookings.size === 0) return;
    setBulkAction('approving');
    try {
      const results = await Promise.allSettled(
        Array.from(selectedBookings).map(id => 
          api(`/bookings/${id}/approve`, { method: 'POST' })
        )
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      showMessage(`Approved ${succeeded} booking(s)${failed > 0 ? `, ${failed} failed` : ''}`);
      setSelectedBookings(new Set());
      loadData(true);
    } catch (err) {
      showMessage('Bulk approve failed', 'error');
    } finally {
      setBulkAction(null);
    }
  };
  
  const handleBulkReject = async (reason = 'Rejected by admin') => {
    if (selectedBookings.size === 0) return;
    setBulkAction('rejecting');
    try {
      const results = await Promise.allSettled(
        Array.from(selectedBookings).map(id => 
          api(`/bookings/${id}/reject`, { 
            method: 'POST', 
            body: JSON.stringify({ reason }) 
          })
        )
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      showMessage(`Rejected ${succeeded} booking(s)`);
      setSelectedBookings(new Set());
      loadData(true);
    } catch (err) {
      showMessage('Bulk reject failed', 'error');
    } finally {
      setBulkAction(null);
    }
  };
  
  // Visibility toggle
  const handleVisibilityToggle = async (resourceId, visible) => {
    try {
      await api(`/resources/tools/${resourceId}/visibility`, {
        method: 'PUT',
        body: JSON.stringify({ visible })
      });
      showMessage(`Tool ${visible ? 'shown' : 'hidden'} successfully`);
      setResources(prev => prev.map(r => 
        r.id === resourceId ? { ...r, visible } : r
      ));
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };
  
  // Export bookings
  const handleExport = () => {
    const data = filteredBookings.map(b => ({
      date: b.date,
      time: `${b.startTime}-${b.endTime}`,
      user: b.userName,
      email: b.userEmail,
      tool: b.resourceName,
      purpose: b.purpose,
      status: b.status
    }));
    
    const csv = [
      Object.keys(data[0] || {}).join(','),
      ...data.map(row => Object.values(row).map(v => `"${v || ''}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  // Quick stats
  const stats = useMemo(() => ({
    pending: pendingBookings.length,
    todayBookings: allBookings.filter(b => b.date === new Date().toISOString().split('T')[0]).length,
    thisWeek: allBookings.filter(b => {
      const bookingDate = new Date(b.date);
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return bookingDate >= weekAgo;
    }).length,
    rejected: allBookings.filter(b => b.status === 'rejected').length
  }), [pendingBookings, allBookings]);
  
  // Format time helper
  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending Approvals', value: stats.pending, icon: Clock, color: 'yellow', onClick: () => setStatusFilter('pending') },
          { label: "Today's Bookings", value: stats.todayBookings, icon: Calendar, color: 'blue' },
          { label: 'This Week', value: stats.thisWeek, icon: Users, color: 'green' },
          { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'red', onClick: () => setStatusFilter('rejected') }
        ].map((stat, i) => (
          <div 
            key={i}
            onClick={stat.onClick}
            className={`p-4 rounded-lg shadow ${isDark ? 'bg-gray-800' : 'bg-white'} ${stat.onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${stat.color}-100 dark:bg-${stat.color}-900/30 text-${stat.color}-600 dark:text-${stat.color}-400`}>
                <stat.icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Tab Navigation */}
      <div className={`rounded-lg shadow ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {[
            { id: 'approvals', label: 'Booking Approvals', icon: CheckCircle, badge: stats.pending },
            { id: 'visibility', label: 'Resource Visibility', icon: Eye },
            { id: 'classes', label: 'Class Requests', icon: UserCheck },
            { id: 'settings', label: 'Admin Settings', icon: Settings }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
              {tab.badge > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-orange-500 text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        
        {/* Approvals Tab */}
        {activeTab === 'approvals' && (
          <div className="p-4">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by name, email, or purpose..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                    isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                  }`}
                />
              </div>
              
              {/* Quick Filters */}
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`px-3 py-2 rounded-lg border ${
                    isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                  }`}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All Status</option>
                </select>
                
                <select
                  value={toolFilter}
                  onChange={(e) => setToolFilter(e.target.value)}
                  className={`px-3 py-2 rounded-lg border ${
                    isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                  }`}
                >
                  <option value="">All Tools</option>
                  {resources.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-3 py-2 rounded-lg border flex items-center gap-1 ${
                    showFilters ? 'bg-orange-100 border-orange-300 text-orange-600' : ''
                  } ${isDark ? 'border-gray-600' : 'border-gray-300'}`}
                >
                  <Filter size={16} /> Filters
                </button>
                
                <button
                  onClick={() => loadData(true)}
                  disabled={refreshing}
                  className={`px-3 py-2 rounded-lg border ${isDark ? 'border-gray-600' : 'border-gray-300'}`}
                >
                  <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            
            {/* Advanced Filters */}
            {showFilters && (
              <div className={`mb-4 p-4 rounded-lg border ${isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Date From</label>
                    <input
                      type="date"
                      value={dateRangeFilter.start}
                      onChange={(e) => setDateRangeFilter(prev => ({ ...prev, start: e.target.value }))}
                      className={`w-full p-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Date To</label>
                    <input
                      type="date"
                      value={dateRangeFilter.end}
                      onChange={(e) => setDateRangeFilter(prev => ({ ...prev, end: e.target.value }))}
                      className={`w-full p-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setStatusFilter('pending');
                        setToolFilter('');
                        setDateRangeFilter({ start: '', end: '' });
                      }}
                      className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Bulk Actions Bar */}
            {selectedBookings.size > 0 && (
              <div className={`mb-4 p-3 rounded-lg flex items-center justify-between ${
                isDark ? 'bg-orange-900/30 border-orange-800' : 'bg-orange-50 border-orange-200'
              } border`}>
                <span className="font-medium">
                  {selectedBookings.size} booking{selectedBookings.size > 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkApprove}
                    disabled={bulkAction === 'approving'}
                    className="px-4 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1 text-sm"
                  >
                    <Check size={16} />
                    {bulkAction === 'approving' ? 'Approving...' : 'Approve All'}
                  </button>
                  <button
                    onClick={() => handleBulkReject()}
                    disabled={bulkAction === 'rejecting'}
                    className="px-4 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 flex items-center gap-1 text-sm"
                  >
                    <X size={16} />
                    {bulkAction === 'rejecting' ? 'Rejecting...' : 'Reject All'}
                  </button>
                  <button
                    onClick={() => setSelectedBookings(new Set())}
                    className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {/* Bookings Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={isDark ? 'bg-gray-900' : 'bg-gray-50'}>
                  <tr>
                    <th className="p-3 text-left">
                      <Checkbox
                        checked={selectedBookings.size === pagination.paginatedItems.length && pagination.paginatedItems.length > 0}
                        indeterminate={selectedBookings.size > 0 && selectedBookings.size < pagination.paginatedItems.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="p-3 text-left font-semibold">
                      User
                      <SortIndicator sortKey="userName" currentSort={sort} onSort={handleSort} />
                    </th>
                    <th className="p-3 text-left font-semibold">
                      Tool
                      <SortIndicator sortKey="resourceName" currentSort={sort} onSort={handleSort} />
                    </th>
                    <th className="p-3 text-left font-semibold">
                      Date
                      <SortIndicator sortKey="date" currentSort={sort} onSort={handleSort} />
                    </th>
                    <th className="p-3 text-left font-semibold">Time</th>
                    <th className="p-3 text-left font-semibold">Purpose</th>
                    <th className="p-3 text-left font-semibold">
                      Requested
                      <SortIndicator sortKey="createdAt" currentSort={sort} onSort={handleSort} />
                    </th>
                    <th className="p-3 text-left font-semibold">Status</th>
                    <th className="p-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {pagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-gray-500">
                        <Clock size={48} className="mx-auto mb-4 opacity-50" />
                        <p>No bookings found</p>
                        <p className="text-sm mt-1">Try adjusting your filters</p>
                      </td>
                    </tr>
                  ) : (
                    pagination.paginatedItems.map(booking => (
                      <tr key={booking.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                        selectedBookings.has(booking.id) ? 'bg-orange-50 dark:bg-orange-900/20' : ''
                      }`}>
                        <td className="p-3">
                          <Checkbox
                            checked={selectedBookings.has(booking.id)}
                            onChange={() => handleSelectBooking(booking.id)}
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{booking.userName}</div>
                          <div className="text-sm text-gray-500">{booking.userEmail}</div>
                        </td>
                        <td className="p-3">
                          <span className="flex items-center gap-1">
                            <Wrench size={14} className="text-gray-400" />
                            {booking.resourceName || booking.toolName}
                          </span>
                        </td>
                        <td className="p-3">{booking.date}</td>
                        <td className="p-3">
                          {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                        </td>
                        <td className="p-3">
                          <span className="line-clamp-2 max-w-xs" title={booking.purpose}>
                            {booking.purpose}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-gray-500">
                          {booking.createdAt ? (
                            <span title={new Date(booking.createdAt).toLocaleString()}>
                              {new Date(booking.createdAt).toLocaleDateString()}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={booking.status} />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            {booking.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(booking.id)}
                                  className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                                  title="Approve"
                                >
                                  <CheckCircle size={18} />
                                </button>
                                <button
                                  onClick={() => { setRejectingBooking(booking); setRejectModalOpen(true); }}
                                  className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                  title="Reject"
                                >
                                  <XCircle size={18} />
                                </button>
                              </>
                            )}
                            <DropdownMenu
                              trigger={
                                <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                                  <MoreHorizontal size={18} />
                                </button>
                              }
                            >
                              <DropdownItem icon={Mail} onClick={() => window.location.href = `mailto:${booking.userEmail}`}>
                                Email User
                              </DropdownItem>
                              <DropdownItem icon={Edit} onClick={() => onNavigate?.('editBooking', booking)}>
                                Edit Booking
                              </DropdownItem>
                              {booking.status === 'approved' && (
                                <DropdownItem icon={XCircle} variant="danger" onClick={() => { setRejectingBooking(booking); setRejectModalOpen(true); }}>
                                  Cancel Booking
                                </DropdownItem>
                              )}
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500">
                  Showing {pagination.startIndex + 1}-{pagination.endIndex} of {pagination.totalItems}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={pagination.perPage}
                    onChange={(e) => pagination.setPerPage(parseInt(e.target.value))}
                    className={`px-2 py-1 text-sm rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
                  >
                    {[10, 15, 25, 50].map(n => (
                      <option key={n} value={n}>{n} per page</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <button
                      onClick={pagination.prevPage}
                      disabled={pagination.currentPage === 1}
                      className={`p-1.5 rounded border ${isDark ? 'border-gray-600' : 'border-gray-300'} disabled:opacity-50`}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let page;
                      if (pagination.totalPages <= 5) {
                        page = i + 1;
                      } else if (pagination.currentPage <= 3) {
                        page = i + 1;
                      } else if (pagination.currentPage >= pagination.totalPages - 2) {
                        page = pagination.totalPages - 4 + i;
                      } else {
                        page = pagination.currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => pagination.goToPage(page)}
                          className={`w-8 h-8 rounded border text-sm ${
                            page === pagination.currentPage
                              ? 'bg-orange-500 text-white border-orange-500'
                              : isDark ? 'border-gray-600' : 'border-gray-300'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      onClick={pagination.nextPage}
                      disabled={pagination.currentPage === pagination.totalPages}
                      className={`p-1.5 rounded border ${isDark ? 'border-gray-600' : 'border-gray-300'} disabled:opacity-50`}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Export Button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleExport}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>
        )}
        
        {/* Visibility Tab */}
        {activeTab === 'visibility' && (
          <div className="p-4">
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Resource Visibility Controls</h3>
              <p className="text-sm text-gray-500">
                Control which tools are visible to users. Hidden tools can still be accessed by admins.
              </p>
            </div>
            
            <div className="grid gap-4">
              {resources.map(resource => (
                <div 
                  key={resource.id}
                  className={`p-4 rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        resource.status === 'maintenance' 
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        <Wrench size={20} />
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {resource.name}
                          {resource.status === 'maintenance' && (
                            <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded">
                              Maintenance
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{resource.room} • {resource.category}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-500">
                        Max {resource.maxConcurrent || 1} concurrent
                      </div>
                      <button
                        onClick={() => handleVisibilityToggle(resource.id, !resource.visible)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                          resource.visible !== false
                            ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                            : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {resource.visible !== false ? <Eye size={18} /> : <EyeOff size={18} />}
                        {resource.visible !== false ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Class Requests Tab */}
        {activeTab === 'classes' && (
          <div className="p-4">
            <div className="mb-4 flex justify-between items-center">
              <div>
                <h3 className="font-semibold">Certification Class Requests</h3>
                <p className="text-sm text-gray-500">Review and approve training class requests</p>
              </div>
              <button
                onClick={() => loadData(true)}
                className="px-3 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
            
            {classRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <UserCheck size={48} className="mx-auto mb-4 opacity-50" />
                <p>No class requests pending</p>
              </div>
            ) : (
              <div className="space-y-4">
                {classRequests.map(request => (
                  <div key={request.id} className={`p-4 rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{request.userName}</div>
                        <div className="text-sm text-gray-500">{request.userEmail}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <Shield size={14} className="text-purple-500" />
                          <span>{request.certificationName}</span>
                        </div>
                        {request.message && (
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{request.message}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
                          Approve
                        </button>
                        <button className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                          Deny
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="p-4">
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-4">Admin Preferences</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 rounded-lg border dark:border-gray-700">
                    <div>
                      <div className="font-medium">Email notifications for new bookings</div>
                      <div className="text-sm text-gray-500">Receive email when new booking requests arrive</div>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 rounded text-orange-500" />
                  </label>
                  <label className="flex items-center justify-between p-4 rounded-lg border dark:border-gray-700">
                    <div>
                      <div className="font-medium">Auto-approve certified users</div>
                      <div className="text-sm text-gray-500">Automatically approve bookings from users with valid certifications</div>
                    </div>
                    <input type="checkbox" className="w-5 h-5 rounded text-orange-500" />
                  </label>
                  <label className="flex items-center justify-between p-4 rounded-lg border dark:border-gray-700">
                    <div>
                      <div className="font-medium">Require approval for all bookings</div>
                      <div className="text-sm text-gray-500">All bookings require admin approval before being confirmed</div>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 rounded text-orange-500" />
                  </label>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-4">Default Booking Settings</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Max booking duration (hours)</label>
                    <input 
                      type="number" 
                      defaultValue={4} 
                      min={1} 
                      max={12}
                      className={`w-full p-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Advance booking limit (days)</label>
                    <input 
                      type="number" 
                      defaultValue={30} 
                      min={1} 
                      max={365}
                      className={`w-full p-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-4">GitHub Integration Tools</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => onNavigate?.('template-generator')}
                    className={`w-full text-left p-4 rounded-lg border ${isDark ? 'border-gray-700 hover:border-blue-500' : 'border-gray-200 hover:border-blue-500'} transition-colors flex items-center justify-between`}
                  >
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        📄 Issue Template Generator
                      </div>
                      <div className="text-sm text-gray-500">Generate YAML templates with current tools and rooms</div>
                    </div>
                    <span className="text-gray-400">→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setRejectModalOpen(false)} />
            <div className={`relative w-full max-w-md rounded-xl shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold">Reject Booking</h2>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <p className="mb-2">Rejecting booking for <strong>{rejectingBooking?.userName}</strong></p>
                  <p className="text-sm text-gray-500">
                    {rejectingBooking?.resourceName} on {rejectingBooking?.date}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reason (optional)</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Provide a reason for rejection..."
                    rows={3}
                    className={`w-full p-3 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejectModalOpen(false)}
                    className="flex-1 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReject}
                    className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    Reject Booking
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
