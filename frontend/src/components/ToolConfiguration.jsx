import React, { useState, useEffect } from 'react';
import { 
  Wrench, Settings, Save, Plus, Trash2, Edit, X, Check,
  AlertCircle, RefreshCw, MapPin, Users, ToggleLeft, ToggleRight
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Tool Configuration Panel
 * 
 * Super Admin UI for managing tool settings:
 * - Tool names and descriptions
 * - Number of available tools (inventory)
 * - Concurrent booking flags
 * - Room associations
 * - Maintenance status
 * 
 * 🔥 Fire Triangle: FUEL layer - resource configuration
 * 
 * @version 4.2.0-rc69.15
 */

const DEFAULT_ROOMS = [
  'Laser Lab',
  '3D Printing Area',
  'CNC Area',
  'Electronics Lab',
  'Sewing Room',
  'Woodshop',
  'Screen Printing',
  'General Workshop'
];

export default function ToolConfiguration({ theme, user, showMessage }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [newTool, setNewTool] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Load tools configuration
  useEffect(() => {
    loadTools();
  }, []);
  
  const loadTools = async () => {
    setLoading(true);
    try {
      const data = await api('/resources/tools/config');
      setTools(data.tools || []);
    } catch (err) {
      // Fallback to default tools if endpoint doesn't exist yet
      setTools([
        { id: 'laser', name: 'Laser Cutter', room: 'Laser Lab', maxConcurrent: 1, status: 'active', requiresCert: true },
        { id: '3dprinter', name: '3D Printer', room: '3D Printing Area', maxConcurrent: 4, status: 'active', requiresCert: true },
        { id: 'cnc', name: 'CNC Router', room: 'CNC Area', maxConcurrent: 1, status: 'active', requiresCert: true },
        { id: 'solder', name: 'Soldering Station', room: 'Electronics Lab', maxConcurrent: 3, status: 'active', requiresCert: false },
        { id: 'sewing-standard', name: 'Sewing Machines', room: 'Sewing Room', maxConcurrent: 5, status: 'active', requiresCert: false },
        { id: 'sewing-industrial', name: 'Industrial Sewing', room: 'Sewing Room', maxConcurrent: 3, status: 'active', requiresCert: true },
        { id: 'woodshop', name: 'Woodshop', room: 'Woodshop', maxConcurrent: 2, status: 'active', requiresCert: true }
      ]);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await api('/resources/tools/config', {
        method: 'PUT',
        body: JSON.stringify({ tools })
      });
      showMessage('Tool configuration saved successfully!');
      setHasChanges(false);
    } catch (err) {
      showMessage(err.message || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const handleUpdateTool = (toolId, updates) => {
    setTools(prev => prev.map(t => 
      t.id === toolId ? { ...t, ...updates } : t
    ));
    setHasChanges(true);
  };
  
  const handleAddTool = () => {
    setNewTool({
      id: '',
      name: '',
      room: DEFAULT_ROOMS[0],
      maxConcurrent: 1,
      status: 'active',
      requiresCert: true,
      description: ''
    });
  };
  
  const handleSaveNewTool = () => {
    if (!newTool.id || !newTool.name) {
      showMessage('Tool ID and name are required', 'error');
      return;
    }
    
    // Check for duplicate ID
    if (tools.some(t => t.id === newTool.id)) {
      showMessage('Tool ID already exists', 'error');
      return;
    }
    
    setTools(prev => [...prev, newTool]);
    setNewTool(null);
    setHasChanges(true);
  };
  
  const handleDeleteTool = (toolId) => {
    if (!confirm(`Are you sure you want to delete this tool? This action cannot be undone.`)) {
      return;
    }
    setTools(prev => prev.filter(t => t.id !== toolId));
    setHasChanges(true);
  };
  
  const handleToggleStatus = (toolId) => {
    setTools(prev => prev.map(t => {
      if (t.id === toolId) {
        const newStatus = t.status === 'active' ? 'maintenance' : 'active';
        return { ...t, status: newStatus };
      }
      return t;
    }));
    setHasChanges(true);
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>Loading tool configuration...</span>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings size={24} className="text-orange-500" />
            Tool Configuration
          </h2>
          <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Manage tool settings, capacity limits, and room associations
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddTool}
            className={`px-4 py-2 rounded-lg border flex items-center gap-2 ${
              theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            <Plus size={18} />
            Add Tool
          </button>
          <button
            onClick={handleSaveAll}
            disabled={!hasChanges || saving}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              hasChanges 
                ? 'bg-orange-500 text-white hover:bg-orange-600' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
            Save Changes
          </button>
        </div>
      </div>
      
      {hasChanges && (
        <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
          <AlertCircle size={18} />
          You have unsaved changes
        </div>
      )}
      
      {/* New Tool Form */}
      {newTool && (
        <div className={`p-4 rounded-lg border-2 border-dashed ${
          theme === 'dark' ? 'border-orange-500 bg-gray-800' : 'border-orange-300 bg-orange-50'
        }`}>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Plus size={18} className="text-orange-500" />
            Add New Tool
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tool ID *</label>
              <input
                type="text"
                value={newTool.id}
                onChange={(e) => setNewTool(prev => ({ ...prev, id: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                placeholder="e.g., laser-2"
                className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Display Name *</label>
              <input
                type="text"
                value={newTool.name}
                onChange={(e) => setNewTool(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Laser Cutter 2"
                className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Room</label>
              <select
                value={newTool.room}
                onChange={(e) => setNewTool(prev => ({ ...prev, room: e.target.value }))}
                className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
              >
                {DEFAULT_ROOMS.map(room => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Concurrent</label>
              <input
                type="number"
                min="1"
                max="20"
                value={newTool.maxConcurrent}
                onChange={(e) => setNewTool(prev => ({ ...prev, maxConcurrent: parseInt(e.target.value) || 1 }))}
                className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
              />
            </div>
          </div>
          <div className="flex gap-4 mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newTool.requiresCert}
                onChange={(e) => setNewTool(prev => ({ ...prev, requiresCert: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Requires certification</span>
            </label>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSaveNewTool}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2"
            >
              <Check size={18} />
              Add Tool
            </button>
            <button
              onClick={() => setNewTool(null)}
              className={`px-4 py-2 rounded-lg border ${
                theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Tools List */}
      <div className="space-y-3">
        {tools.map(tool => (
          <div
            key={tool.id}
            className={`p-4 rounded-lg border ${
              tool.status === 'maintenance' 
                ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' 
                : theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            }`}
          >
            {editingTool === tool.id ? (
              // Edit Mode
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Display Name</label>
                    <input
                      type="text"
                      value={tool.name}
                      onChange={(e) => handleUpdateTool(tool.id, { name: e.target.value })}
                      className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Room</label>
                    <select
                      value={tool.room}
                      onChange={(e) => handleUpdateTool(tool.id, { room: e.target.value })}
                      className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
                    >
                      {DEFAULT_ROOMS.map(room => (
                        <option key={room} value={room}>{room}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Max Concurrent</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={tool.maxConcurrent}
                      onChange={(e) => handleUpdateTool(tool.id, { maxConcurrent: parseInt(e.target.value) || 1 })}
                      className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <input
                      type="text"
                      value={tool.description || ''}
                      onChange={(e) => handleUpdateTool(tool.id, { description: e.target.value })}
                      placeholder="Optional description"
                      className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tool.requiresCert}
                      onChange={(e) => handleUpdateTool(tool.id, { requiresCert: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm">Requires certification</span>
                  </label>
                  <button
                    onClick={() => setEditingTool(null)}
                    className="px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"
                  >
                    Done Editing
                  </button>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${
                    tool.status === 'maintenance' 
                      ? 'bg-yellow-200 dark:bg-yellow-800' 
                      : 'bg-orange-100 dark:bg-orange-900/30'
                  }`}>
                    <Wrench size={20} className={tool.status === 'maintenance' ? 'text-yellow-700' : 'text-orange-500'} />
                  </div>
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {tool.name}
                      {tool.status === 'maintenance' && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded">
                          🔧 Maintenance
                        </span>
                      )}
                      {tool.requiresCert && (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                          🔒 Cert Required
                        </span>
                      )}
                    </div>
                    <div className={`text-sm flex items-center gap-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      <span className="flex items-center gap-1">
                        <MapPin size={14} /> {tool.room}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={14} /> Max {tool.maxConcurrent} concurrent
                      </span>
                      <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        ID: {tool.id}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleStatus(tool.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      tool.status === 'active'
                        ? 'text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30'
                        : 'text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
                    }`}
                    title={tool.status === 'active' ? 'Set to maintenance' : 'Set to active'}
                  >
                    {tool.status === 'active' ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                  <button
                    onClick={() => setEditingTool(tool.id)}
                    className={`p-2 rounded-lg ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                    title="Edit tool"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteTool(tool.id)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                    title="Delete tool"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {tools.length === 0 && (
        <div className={`text-center py-12 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          <Wrench size={48} className="mx-auto mb-4 opacity-50" />
          <p>No tools configured yet.</p>
          <button
            onClick={handleAddTool}
            className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            Add Your First Tool
          </button>
        </div>
      )}
    </div>
  );
}
