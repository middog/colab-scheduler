import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wrench, MapPin, Plus, Edit, Trash2, Settings, AlertTriangle,
  CheckCircle, XCircle, Package, RefreshCw, Search, Filter,
  Home, Gauge, Clock, AlertCircle, Users
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Resource Management Admin Panel
 * 
 * Features:
 * - Create/edit/disable tools dynamically
 * - Create/edit rooms
 * - Maintenance scheduling
 * - Consumables tracking
 * - Tool status dashboard
 * 
 * 🔥 Fire Triangle: FUEL layer - resource management
 * 
 * @version 4.2.0-rc69.15
 */

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className={`relative w-full ${sizes[size]} rounded-xl shadow-2xl bg-white dark:bg-gray-800 dark:text-white`}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">✕</button>
          </div>
          <div className="p-4 max-h-[80vh] overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
};

const ResourceManagement = ({ token, user, theme, showMessage }) => {
  const [tools, setTools] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tools');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Modal states
  const [toolModalOpen, setToolModalOpen] = useState(false);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [consumablesModalOpen, setConsumablesModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedTool, setSelectedTool] = useState(null);

  // api() from lib/api.js auto-unwraps standardized responses

  const loadResources = useCallback(async () => {
    try {
      setLoading(true);
      const [toolsData, roomsData] = await Promise.all([
        api('/resources/tools'),
        api('/resources/rooms')
      ]);
      // api() unwraps { success, data } -> data directly
      setTools(toolsData.tools || []);
      setRooms(roomsData.rooms || []);
    } catch (err) {
      showMessage('Failed to load resources', 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  // Tool CRUD
  const handleSaveTool = async (formData) => {
    try {
      if (editingItem) {
        await api(`/resources/tools/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        showMessage('Tool updated successfully');
      } else {
        await api('/resources/tools', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        showMessage('Tool created successfully');
      }
      setToolModalOpen(false);
      setEditingItem(null);
      loadResources();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  // Room CRUD
  const handleSaveRoom = async (formData) => {
    try {
      if (editingItem) {
        await api(`/resources/rooms/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        showMessage('Room updated successfully');
      } else {
        await api('/resources/rooms', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        showMessage('Room created successfully');
      }
      setRoomModalOpen(false);
      setEditingItem(null);
      loadResources();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  // Maintenance
  const handleMaintenance = async (action, notes, nextDate) => {
    try {
      await api(`/resources/tools/${selectedTool.id}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({ action, notes, nextMaintenanceAt: nextDate })
      });
      showMessage(`Maintenance ${action === 'start' ? 'started' : 'completed'}`);
      setMaintenanceModalOpen(false);
      setSelectedTool(null);
      loadResources();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  // Consumables
  const handleConsumablesUpdate = async (level, notes, restocked) => {
    try {
      await api(`/resources/tools/${selectedTool.id}/consumables`, {
        method: 'PUT',
        body: JSON.stringify({ level, notes, restocked })
      });
      showMessage('Consumables updated');
      setConsumablesModalOpen(false);
      setSelectedTool(null);
      loadResources();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const isDark = theme === 'dark';
  const categories = [...new Set(tools.map(t => t.category))].filter(Boolean);

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || tool.category === categoryFilter;
    const matchesStatus = !statusFilter || tool.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusBadge = (status) => {
    const styles = {
      available: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
      disabled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    };
    return styles[status] || styles.available;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings className="text-orange-500" /> Resource Management
            </h2>
            <p className="text-sm text-gray-500 mt-1">Manage tools, rooms, and equipment</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingItem(null); setToolModalOpen(true); }}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 flex items-center gap-2"
            >
              <Plus size={18} /> New Tool
            </button>
            <button
              onClick={() => { setEditingItem(null); setRoomModalOpen(true); }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
            >
              <Plus size={18} /> New Room
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Tools', value: tools.length, icon: Wrench, color: 'orange' },
          { label: 'Available', value: tools.filter(t => t.status === 'available').length, icon: CheckCircle, color: 'green' },
          { label: 'In Maintenance', value: tools.filter(t => t.status === 'maintenance').length, icon: AlertTriangle, color: 'yellow' },
          { label: 'Rooms', value: rooms.length, icon: Home, color: 'blue' }
        ].map(stat => (
          <div key={stat.label} className={`p-4 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow`}>
            <div className="flex items-center gap-3">
              <stat.icon className={`text-${stat.color}-500`} size={24} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs & Content */}
      <div className={`rounded-lg shadow ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'tools', label: 'Tools', icon: Wrench },
            { id: 'rooms', label: 'Rooms', icon: Home }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-orange-500 text-orange-500'
                  : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tools Tab */}
        {activeTab === 'tools' && (
          <div className="p-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex-1 min-w-[200px] relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search tools..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={`px-4 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`px-4 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
              >
                <option value="">All Status</option>
                <option value="available">Available</option>
                <option value="maintenance">Maintenance</option>
                <option value="disabled">Disabled</option>
              </select>
              <button
                onClick={loadResources}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Wrench size={48} className="mx-auto mb-4 opacity-50" />
                <p>No tools found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`text-left ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <th className="p-3">Tool</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Room</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Consumables</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTools.map(tool => (
                      <tr key={tool.id} className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Wrench size={16} className="text-orange-500" />
                            <div>
                              <p className="font-medium">{tool.name}</p>
                              <p className="text-xs text-gray-500">Max: {tool.maxConcurrent} concurrent</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 capitalize">{tool.category}</td>
                        <td className="p-3">{rooms.find(r => r.id === tool.room)?.name || tool.room || '-'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(tool.status)}`}>
                            {tool.status || 'available'}
                          </span>
                        </td>
                        <td className="p-3">
                          {tool.consumablesTracking ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${
                                    (tool.consumables?.level || 0) > 50 ? 'bg-green-500' :
                                    (tool.consumables?.level || 0) > 20 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${tool.consumables?.level || 0}%` }}
                                />
                              </div>
                              <span className="text-xs">{tool.consumables?.level || 0}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-1 rounded ${
                            tool.source === 'database' 
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                          }`}>
                            {tool.source || 'config'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {tool.source === 'database' && (
                              <button
                                onClick={() => { setEditingItem(tool); setToolModalOpen(true); }}
                                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                title="Edit"
                              >
                                <Edit size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => { setSelectedTool(tool); setMaintenanceModalOpen(true); }}
                              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              title="Maintenance"
                            >
                              <Wrench size={14} />
                            </button>
                            {tool.consumablesTracking && (
                              <button
                                onClick={() => { setSelectedTool(tool); setConsumablesModalOpen(true); }}
                                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                title="Consumables"
                              >
                                <Package size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Rooms Tab */}
        {activeTab === 'rooms' && (
          <div className="p-4">
            {rooms.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Home size={48} className="mx-auto mb-4 opacity-50" />
                <p>No rooms configured</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {rooms.map(room => (
                  <div
                    key={room.id}
                    className={`p-4 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <Home className="text-blue-500" size={20} />
                        <h3 className="font-bold">{room.name}</h3>
                      </div>
                      {room.source === 'database' && (
                        <button
                          onClick={() => { setEditingItem(room); setRoomModalOpen(true); }}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                        >
                          <Edit size={14} />
                        </button>
                      )}
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <Users size={14} /> Capacity: {room.capacity}
                      </div>
                      {room.tools?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Tools in this room:</p>
                          <div className="flex flex-wrap gap-1">
                            {room.tools.map(t => (
                              <span key={t.id} className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                                {t.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tool Modal */}
      <ToolModal
        isOpen={toolModalOpen}
        onClose={() => { setToolModalOpen(false); setEditingItem(null); }}
        onSave={handleSaveTool}
        tool={editingItem}
        rooms={rooms}
        theme={theme}
      />

      {/* Room Modal */}
      <RoomModal
        isOpen={roomModalOpen}
        onClose={() => { setRoomModalOpen(false); setEditingItem(null); }}
        onSave={handleSaveRoom}
        room={editingItem}
        theme={theme}
      />

      {/* Maintenance Modal */}
      <MaintenanceModal
        isOpen={maintenanceModalOpen}
        onClose={() => { setMaintenanceModalOpen(false); setSelectedTool(null); }}
        tool={selectedTool}
        onAction={handleMaintenance}
        theme={theme}
      />

      {/* Consumables Modal */}
      <ConsumablesModal
        isOpen={consumablesModalOpen}
        onClose={() => { setConsumablesModalOpen(false); setSelectedTool(null); }}
        tool={selectedTool}
        onUpdate={handleConsumablesUpdate}
        theme={theme}
      />
    </div>
  );
};

// Tool Create/Edit Modal
const ToolModal = ({ isOpen, onClose, onSave, tool, rooms, theme }) => {
  const [formData, setFormData] = useState({
    name: '', category: 'general', room: '', maxConcurrent: 1,
    requiresCert: false, description: '', consumablesTracking: false
  });

  useEffect(() => {
    if (tool) {
      setFormData({
        name: tool.name || '',
        category: tool.category || 'general',
        room: tool.room || '',
        maxConcurrent: tool.maxConcurrent || 1,
        requiresCert: tool.requiresCert || false,
        description: tool.description || '',
        consumablesTracking: tool.consumablesTracking || false
      });
    } else {
      setFormData({
        name: '', category: 'general', room: '', maxConcurrent: 1,
        requiresCert: false, description: '', consumablesTracking: false
      });
    }
  }, [tool, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const isDark = theme === 'dark';
  const inputClass = `w-full p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tool ? '✏️ Edit Tool' : '🔧 New Tool'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className={inputClass}
            >
              <option value="general">General</option>
              <option value="fabrication">Fabrication</option>
              <option value="electronics">Electronics</option>
              <option value="textiles">Textiles</option>
              <option value="woodworking">Woodworking</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Room</label>
            <select
              value={formData.room}
              onChange={(e) => setFormData({ ...formData, room: e.target.value })}
              className={inputClass}
            >
              <option value="">No specific room</option>
              {rooms.map(room => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Max Concurrent Users</label>
          <input
            type="number"
            value={formData.maxConcurrent}
            onChange={(e) => setFormData({ ...formData, maxConcurrent: parseInt(e.target.value) })}
            min="1"
            className={inputClass}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            className={inputClass}
          />
        </div>
        
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.requiresCert}
              onChange={(e) => setFormData({ ...formData, requiresCert: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Requires certification to use</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.consumablesTracking}
              onChange={(e) => setFormData({ ...formData, consumablesTracking: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Track consumables (filament, materials, etc.)</span>
          </label>
        </div>
        
        <div className="flex gap-2 pt-4">
          <button type="button" onClick={onClose} className="flex-1 py-3 border rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button type="submit" className="flex-1 py-3 bg-orange-500 text-white rounded hover:bg-orange-600">
            {tool ? 'Update' : 'Create'} Tool
          </button>
        </div>
      </form>
    </Modal>
  );
};

// Room Modal
const RoomModal = ({ isOpen, onClose, onSave, room, theme }) => {
  const [formData, setFormData] = useState({
    name: '', capacity: 10, description: '', bookable: true, requiresApproval: false
  });

  useEffect(() => {
    if (room) {
      setFormData({
        name: room.name || '',
        capacity: room.capacity || 10,
        description: room.description || '',
        bookable: room.bookable !== false,
        requiresApproval: room.requiresApproval || false
      });
    } else {
      setFormData({ name: '', capacity: 10, description: '', bookable: true, requiresApproval: false });
    }
  }, [room, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const isDark = theme === 'dark';
  const inputClass = `w-full p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={room ? '✏️ Edit Room' : '🏠 New Room'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Capacity</label>
          <input
            type="number"
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
            min="1"
            className={inputClass}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            className={inputClass}
          />
        </div>
        
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.bookable}
              onChange={(e) => setFormData({ ...formData, bookable: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Room is bookable</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.requiresApproval}
              onChange={(e) => setFormData({ ...formData, requiresApproval: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Requires admin approval</span>
          </label>
        </div>
        
        <div className="flex gap-2 pt-4">
          <button type="button" onClick={onClose} className="flex-1 py-3 border rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button type="submit" className="flex-1 py-3 bg-blue-500 text-white rounded hover:bg-blue-600">
            {room ? 'Update' : 'Create'} Room
          </button>
        </div>
      </form>
    </Modal>
  );
};

// Maintenance Modal
const MaintenanceModal = ({ isOpen, onClose, tool, onAction, theme }) => {
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  
  if (!tool) return null;
  const isDark = theme === 'dark';
  const inputClass = `w-full p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`;
  const isInMaintenance = tool.status === 'maintenance';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🔧 ${tool.name} - Maintenance`} size="md">
      <div className="space-y-4">
        <div className={`p-4 rounded-lg ${
          isInMaintenance 
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700'
            : 'bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700'
        }`}>
          <p className="font-medium">
            Status: {isInMaintenance ? '🔧 Under Maintenance' : '✅ Available'}
          </p>
          {tool.maintenanceNotes && (
            <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">{tool.maintenanceNotes}</p>
          )}
          {tool.lastMaintenanceAt && (
            <p className="text-xs mt-2 text-gray-500">
              Last maintenance: {new Date(tool.lastMaintenanceAt).toLocaleDateString()}
            </p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isInMaintenance ? 'What was done...' : 'Issue description...'}
            rows={2}
            className={inputClass}
          />
        </div>
        
        {isInMaintenance && (
          <div>
            <label className="block text-sm font-medium mb-1">Next Scheduled Maintenance</label>
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
        
        <div className="flex gap-2 pt-4">
          <button onClick={onClose} className="flex-1 py-3 border rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            Cancel
          </button>
          {isInMaintenance ? (
            <button
              onClick={() => onAction('complete', notes, nextDate)}
              className="flex-1 py-3 bg-green-500 text-white rounded hover:bg-green-600"
            >
              ✅ Complete Maintenance
            </button>
          ) : (
            <button
              onClick={() => onAction('start', notes)}
              className="flex-1 py-3 bg-yellow-500 text-white rounded hover:bg-yellow-600"
            >
              🔧 Start Maintenance
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

// Consumables Modal
const ConsumablesModal = ({ isOpen, onClose, tool, onUpdate, theme }) => {
  const [level, setLevel] = useState(100);
  const [notes, setNotes] = useState('');
  const [restocked, setRestocked] = useState(false);
  
  useEffect(() => {
    if (tool?.consumables) {
      setLevel(tool.consumables.level || 100);
    }
  }, [tool]);
  
  if (!tool) return null;
  const isDark = theme === 'dark';
  const inputClass = `w-full p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`📦 ${tool.name} - Consumables`} size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Current Level: {level}%</label>
          <input
            type="range"
            value={level}
            onChange={(e) => setLevel(parseInt(e.target.value))}
            min="0"
            max="100"
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Empty</span>
            <span>Full</span>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Added 2 spools of PLA"
            rows={2}
            className={inputClass}
          />
        </div>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={restocked}
            onChange={(e) => setRestocked(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Mark as restocked (logs restock date)</span>
        </label>
        
        <div className="flex gap-2 pt-4">
          <button onClick={onClose} className="flex-1 py-3 border rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={() => onUpdate(level, notes, restocked)}
            className="flex-1 py-3 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Update Consumables
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ResourceManagement;
