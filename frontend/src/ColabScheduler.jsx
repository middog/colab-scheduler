import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { 
  Calendar, Wrench, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, 
  ExternalLink, LogOut, Users, Sun, Moon, HelpCircle, X, Menu,
  Mail, Github, Shield, Key, UserPlus, Activity, Download, Upload, Search, RefreshCw, Edit, Trash2,
  Award, Settings, Bell, AlertTriangle, Hash, Zap, CalendarRange
} from 'lucide-react';

// Shared API client - handles auth, refresh, standardized responses
import { api, setTokens, getTokens } from './lib/api.js';

// Admin Components
import CertificationManagement from './components/CertificationManagement.jsx';
import ResourceManagement from './components/ResourceManagement.jsx';
import NotificationPreferences from './components/NotificationPreferences.jsx';
import IssueDashboard from './components/IssueDashboard.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import MultiSelectCalendar from './components/MultiSelectCalendar.jsx';
import MyBookingsPanel from './components/MyBookingsPanel.jsx';
import TemplateGenerator from './components/TemplateGenerator.jsx';

// =============================================================================
// Theme Context
// =============================================================================

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// =============================================================================
// API URL for direct fetch (file downloads, etc)
// =============================================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Get current session ID (for API calls that need it)
const getSessionId = () => getTokens().sessionId;

// =============================================================================
// Modal Components
// =============================================================================

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const { theme } = useTheme();
  if (!isOpen) return null;
  
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className={`relative w-full ${sizes[size]} rounded-xl shadow-2xl ${
          theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'
        }`}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
              <X size={20} />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Unified Add User Modal (Invite + Create)
// =============================================================================

const AddUserModal = ({ isOpen, onClose, onInvite, onCreate }) => {
  const { theme } = useTheme();
  const [mode, setMode] = useState('invite'); // 'invite' or 'immediate'
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('member');
  const [tools, setTools] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const availableTools = [
    { id: 'laser', name: 'Laser Cutter' },
    { id: '3dprinter', name: '3D Printer' },
    { id: 'cnc', name: 'CNC Router' },
    { id: 'solder', name: 'Soldering Station' },
    { id: 'sewing-standard', name: 'Sewing Machines' },
    { id: 'sewing-industrial', name: 'Industrial Sewing' },
    { id: 'woodshop', name: 'Woodshop' }
  ];
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'invite') {
        const data = await onInvite({
          email,
          firstName: firstName || null,
          lastName: lastName || null,
          role,
          permissions: { tools, rooms: [], capabilities: ['can_view_schedule', 'can_book'] },
          certifications: tools,
          message
        });
        setResult({ type: 'success', mode: 'invite', inviteUrl: data.inviteUrl });
      } else {
        const data = await onCreate({
          email,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`.trim(),
          role,
          permissions: { tools, rooms: [], capabilities: ['can_view_schedule', 'can_book'] }
        });
        setResult({ 
          type: 'success', 
          mode: 'immediate',
          tempPassword: data.tempPassword,
          emailSent: data.emailSent 
        });
      }
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };
  
  const handleClose = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setRole('member');
    setTools([]);
    setMessage('');
    setResult(null);
    setMode('invite');
    onClose();
  };
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="👤 Add User" size="md">
      {result?.type === 'success' ? (
        <div className="space-y-4">
          <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <p className="font-semibold text-green-700 dark:text-green-300">
              {result.mode === 'invite' ? '✉️ Invite Created!' : '✅ User Created!'}
            </p>
          </div>
          
          {result.mode === 'invite' && (
            <>
              <p className="text-sm">Share this link with the user:</p>
              <div className={`p-3 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <code className="text-sm break-all">{result.inviteUrl}</code>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(result.inviteUrl); }}
                className="w-full bg-orange-500 text-white p-3 rounded hover:bg-orange-600"
              >
                📋 Copy Invite Link
              </button>
            </>
          )}
          
          {result.mode === 'immediate' && result.tempPassword && (
            <>
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-yellow-50 border-yellow-200'}`}>
                <p className="text-sm font-medium mb-2">Temporary Password:</p>
                <code className={`block p-3 rounded text-lg font-mono ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
                  {result.tempPassword}
                </code>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(result.tempPassword)}
                className="w-full bg-orange-500 text-white p-3 rounded hover:bg-orange-600"
              >
                📋 Copy Password
              </button>
              <div className={`p-3 rounded ${result.emailSent ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'}`}>
                {result.emailSent ? (
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    📧 Welcome email sent with login credentials!
                  </p>
                ) : (
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    ⚠️ Email not sent. Please share the credentials manually.
                  </p>
                )}
              </div>
            </>
          )}
          
          <button
            onClick={handleClose}
            className={`w-full p-3 rounded border ${theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {result?.type === 'error' && (
            <div className="p-3 bg-red-100 text-red-700 rounded">{result.message}</div>
          )}
          
          {/* Mode Selection */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              type="button"
              onClick={() => setMode('invite')}
              className={`flex-1 p-3 text-sm font-medium transition-colors ${
                mode === 'invite' 
                  ? 'bg-orange-500 text-white' 
                  : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              ✉️ Send Invite Link
            </button>
            <button
              type="button"
              onClick={() => setMode('immediate')}
              className={`flex-1 p-3 text-sm font-medium transition-colors ${
                mode === 'immediate' 
                  ? 'bg-orange-500 text-white' 
                  : theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              ⚡ Create Immediately
            </button>
          </div>
          
          <div className={`p-3 rounded-lg text-sm ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
            {mode === 'invite' ? (
              <p>User receives an email with a link to set their own password.</p>
            ) : (
              <p>Creates an active account immediately with a temporary password you can share.</p>
            )}
          </div>
          
          <input
            type="email"
            placeholder="Email address *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={`w-full p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
          />
          
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={`p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
            />
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={`p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
            />
          </div>
          
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={`w-full p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
          >
            <option value="member">Member</option>
            <option value="certified">Certified Member</option>
            <option value="steward">Steward</option>
            <option value="admin">Administrator</option>
          </select>
          
          <div>
            <label className="block text-sm font-medium mb-2">Tool Certifications</label>
            <div className="grid grid-cols-2 gap-2">
              {availableTools.map(tool => (
                <label key={tool.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                  tools.includes(tool.id) 
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30' 
                    : theme === 'dark' ? 'border-gray-600' : 'border-gray-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={tools.includes(tool.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setTools([...tools, tool.id]);
                      } else {
                        setTools(tools.filter(t => t !== tool.id));
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{tool.name}</span>
                </label>
              ))}
            </div>
          </div>
          
          {mode === 'invite' && (
            <textarea
              placeholder="Optional message to include in invite email"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={`w-full p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
              rows={2}
            />
          )}
          
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-orange-500 text-white p-3 rounded hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Processing...' : (mode === 'invite' ? 'Send Invite' : 'Create User')}
          </button>
        </form>
      )}
    </Modal>
  );
};

// Legacy alias for backwards compatibility
const InviteModal = AddUserModal;

// =============================================================================
// CSV Import Modal
// =============================================================================

const ImportModal = ({ isOpen, onClose, onImport }) => {
  const { theme } = useTheme();
  const [csv, setCsv] = useState('');
  const [defaultRole, setDefaultRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const sampleCsv = `email,firstName,lastName,role,tools
john@example.com,John,Doe,certified,laser,3dprinter
jane@example.com,Jane,Smith,member,`;
  
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setCsv(e.target.result);
      reader.readAsText(file);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await onImport({ csv, defaultRole });
      setResult({ type: 'success', ...data });
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };
  
  const handleClose = () => {
    setCsv('');
    setResult(null);
    onClose();
  };
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="📤 Import Users from CSV" size="lg">
      {result?.type === 'success' ? (
        <div className="space-y-4">
          <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <p className="font-semibold text-green-700 dark:text-green-300">
              ✅ Imported {result.success?.length || 0} users successfully!
            </p>
          </div>
          {result.failed?.length > 0 && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <p className="font-semibold text-yellow-700 dark:text-yellow-300">
                ⚠️ {result.failed.length} users failed to import:
              </p>
              <ul className="mt-2 text-sm space-y-1">
                {result.failed.map((f, i) => (
                  <li key={i}>{f.email}: {f.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={handleClose} className="w-full bg-orange-500 text-white p-3 rounded hover:bg-orange-600">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {result?.type === 'error' && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
              {result.message}
            </div>
          )}
          
          <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <p className="text-sm font-medium mb-2">Expected CSV Format:</p>
            <pre className="text-xs overflow-x-auto">{sampleCsv}</pre>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className={`w-full p-2 rounded border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
              }`}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Or Paste CSV Data</label>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="email,firstName,lastName,role,tools"
              rows={8}
              className={`w-full p-3 rounded border font-mono text-sm ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
              }`}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Default Role (if not specified)</label>
            <select
              value={defaultRole}
              onChange={(e) => setDefaultRole(e.target.value)}
              className={`w-full p-3 rounded border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
              }`}
            >
              <option value="member">Member</option>
              <option value="certified">Certified Member</option>
            </select>
          </div>
          
          <button
            type="submit"
            disabled={loading || !csv.trim()}
            className="w-full bg-orange-500 text-white p-3 rounded hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Importing...' : <><Upload size={18} /> Import Users</>}
          </button>
        </form>
      )}
    </Modal>
  );
};

// =============================================================================
// =============================================================================
// User Edit Modal
// =============================================================================

const UserEditModal = ({ isOpen, onClose, user, onSave, onDelete }) => {
  const { theme } = useTheme();
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const availableTools = [
    { id: 'laser', name: 'Laser Cutter' },
    { id: '3dprinter', name: '3D Printer' },
    { id: 'cnc', name: 'CNC Router' },
    { id: 'solder', name: 'Soldering Station' },
    { id: 'sewing-standard', name: 'Sewing Machines' },
    { id: 'sewing-industrial', name: 'Industrial Sewing' },
    { id: 'woodshop', name: 'Woodshop' }
  ];
  
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        displayName: user.displayName || '',
        role: user.role || 'member',
        status: user.status || 'active',
        tools: user.permissions?.tools || []
      });
    }
  }, [user]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSave(user.email, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        displayName: formData.displayName || `${formData.firstName} ${formData.lastName}`.trim(),
        role: formData.role,
        permissions: { ...user.permissions, tools: formData.tools }
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${user.email}? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await onDelete(user.email);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (!user) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`✏️ Edit User`} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
            {error}
          </div>
        )}
        
        <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <p className="text-sm"><strong>Email:</strong> {user.email}</p>
          <p className="text-sm"><strong>Created:</strong> {new Date(user.createdAt).toLocaleDateString()}</p>
          {user.approvedBy && (
            <p className="text-sm"><strong>Approved by:</strong> {user.approvedBy}</p>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">First Name</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className={`w-full p-3 rounded border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Last Name</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className={`w-full p-3 rounded border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
              }`}
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Display Name</label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            placeholder={`${formData.firstName} ${formData.lastName}`.trim()}
            className={`w-full p-3 rounded border ${
              theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className={`w-full p-3 rounded border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
              }`}
            >
              <option value="guest">Guest</option>
              <option value="member">Member</option>
              <option value="certified">Certified</option>
              <option value="steward">Steward</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <div className={`p-3 rounded border ${
              theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-200'
            }`}>
              <span className={`px-2 py-1 rounded text-sm ${
                user.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                user.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
              }`}>
                {user.status}
              </span>
            </div>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Tool Certifications</label>
          <div className="grid grid-cols-2 gap-2">
            {availableTools.map(tool => (
              <label key={tool.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                formData.tools?.includes(tool.id) 
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30' 
                  : theme === 'dark' ? 'border-gray-600' : 'border-gray-200'
              }`}>
                <input
                  type="checkbox"
                  checked={formData.tools?.includes(tool.id) || false}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({ ...formData, tools: [...(formData.tools || []), tool.id] });
                    } else {
                      setFormData({ ...formData, tools: formData.tools.filter(t => t !== tool.id) });
                    }
                  }}
                  className="rounded"
                />
                <span className="text-sm">{tool.name}</span>
              </label>
            ))}
          </div>
        </div>
        
        <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-orange-500 text-white p-3 rounded hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-6 bg-red-500 text-white p-3 rounded hover:bg-red-600 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </form>
    </Modal>
  );
};

// =============================================================================
// Edit Booking Modal
// =============================================================================

const EditBookingModal = ({ isOpen, onClose, booking, onSave, tools }) => {
  const { theme } = useTheme();
  const [formData, setFormData] = useState({
    tool: '',
    date: '',
    startTime: '',
    endTime: '',
    purpose: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (booking) {
      setFormData({
        tool: booking.resourceId || booking.tool,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        purpose: booking.purpose || ''
      });
    }
  }, [booking]);
  
  const timeOptions = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSave(booking.id, formData);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen || !booking) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="✏️ Edit Booking" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded">
            {error}
          </div>
        )}
        
        {booking.status === 'approved' && (
          <div className="p-3 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 rounded">
            <strong>Note:</strong> Editing an approved booking will reset it to pending and require re-approval.
          </div>
        )}
        
        <div>
          <label className="block text-sm font-medium mb-1">Tool</label>
          <select
            value={formData.tool}
            onChange={(e) => setFormData({ ...formData, tool: e.target.value })}
            className={`w-full p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
          >
            {tools.map(tool => (
              <option key={tool.id} value={tool.id}>{tool.name}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className={`w-full p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Start Time</label>
            <select
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              className={`w-full p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
            >
              {timeOptions.slice(8, 22).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Time</label>
            <select
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              className={`w-full p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
            >
              {timeOptions.slice(9, 23).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Purpose</label>
          <textarea
            value={formData.purpose}
            onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
            className={`w-full p-3 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
            rows={3}
            required
          />
        </div>
        
        <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 p-3 rounded border ${theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-orange-500 text-white p-3 rounded hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// =============================================================================
// Overlap Warning Dialog
// =============================================================================

const OverlapWarningDialog = ({ isOpen, onClose, onConfirm, overlapData }) => {
  const { theme } = useTheme();
  
  if (!isOpen || !overlapData) return null;
  
  const formatTime = (t) => {
    const [h] = t.split(':');
    const hour = parseInt(h);
    return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}`;
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="⚠️ Overlapping Bookings" size="md">
      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <p className="text-yellow-800 dark:text-yellow-200">
            You already have bookings for other tools during this time. 
            Are you sure you want to book multiple tools simultaneously?
          </p>
        </div>
        
        <div>
          <h4 className="font-medium mb-2">New booking:</h4>
          <div className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <p><strong>{overlapData.pendingBooking?.toolName}</strong></p>
            <p className="text-sm">{overlapData.pendingBooking?.date} • {formatTime(overlapData.pendingBooking?.startTime)} - {formatTime(overlapData.pendingBooking?.endTime)}</p>
          </div>
        </div>
        
        <div>
          <h4 className="font-medium mb-2">Overlapping with:</h4>
          <div className="space-y-2">
            {overlapData.overlappingBookings?.map((b, i) => (
              <div key={i} className={`p-3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <p><strong>{b.tool}</strong> <span className={`text-xs px-2 py-0.5 rounded ${
                  b.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                }`}>{b.status}</span></p>
                <p className="text-sm">{b.date} • {formatTime(b.startTime)} - {formatTime(b.endTime)}</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className={`flex-1 p-3 rounded border ${theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-orange-500 text-white p-3 rounded hover:bg-orange-600"
          >
            Yes, Book Anyway
          </button>
        </div>
      </div>
    </Modal>
  );
};

// =============================================================================
// Help System
// =============================================================================

const HelpDrawer = ({ isOpen, onClose }) => {
  const { theme } = useTheme();
  
  const quickTips = [
    { icon: '📅', title: 'Book a Tool', desc: 'Select a tool, pick time slots, describe your project' },
    { icon: '⏳', title: 'Approval', desc: 'Bookings need admin approval before confirmed' },
    { icon: '📧', title: 'Notifications', desc: 'You\'ll get notified when your booking is approved' },
    { icon: '🔧', title: 'Certifications', desc: 'Some tools require certification before booking' },
    { icon: '🌙', title: 'Dark Mode', desc: 'Toggle theme with the sun/moon icon' },
  ];
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`absolute right-0 top-0 h-full w-96 max-w-full transform transition-transform ${
        theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white'
      } shadow-xl`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <HelpCircle size={24} /> Quick Help
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto h-full pb-20">
          <div className="space-y-3">
            {quickTips.map((tip, i) => (
              <div key={i} className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{tip.icon}</span>
                  <div>
                    <h3 className="font-semibold">{tip.title}</h3>
                    <p className="text-sm opacity-70">{tip.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className={`p-4 rounded-lg border-2 border-dashed ${
            theme === 'dark' ? 'border-orange-500/50' : 'border-orange-300'
          }`}>
            <h3 className="font-bold text-orange-500 mb-2">🔥 Fire Triangle</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-yellow-400" />
                <span><strong>FUEL</strong> - Physical resources (tools, rooms)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-blue-400" />
                <span><strong>OXYGEN</strong> - Governance, process</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-red-400" />
                <span><strong>HEAT</strong> - Community, people</span>
              </div>
            </div>
          </div>
          
          <a 
            href="/help" 
            className="block w-full p-3 text-center bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            View Full Documentation →
          </a>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Login Component with SSO
// =============================================================================

const Login = ({ onLogin, providers = [] }) => {
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState('login'); // login, register, forgot, reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Check for invite code or reset token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    const token = params.get('token');
    const path = window.location.pathname;
    
    if (invite) {
      setInviteCode(invite);
      setMode('register');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (path === '/reset-password' && token) {
      setResetToken(token);
      setMode('reset');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      if (mode === 'login') {
        const data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        setTokens(data.accessToken, data.refreshToken);
        onLogin(data.user);
      } else if (mode === 'register') {
        const data = await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, firstName, lastName, inviteCode: inviteCode || undefined })
        });
        setTokens(data.accessToken, data.refreshToken);
        if (data.user.status === 'pending') {
          setMessage('Account created! Awaiting admin approval.');
        } else {
          onLogin(data.user);
        }
      } else if (mode === 'forgot') {
        await api('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        setMessage('If an account exists, a reset email has been sent.');
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }
        await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, password })
        });
        setMessage('Password reset successfully! You can now log in.');
        setMode('login');
        setResetToken('');
        window.history.replaceState({}, '', '/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => {
    window.location.href = `${API_URL}/auth/${provider}?redirect=${encodeURIComponent(window.location.pathname)}`;
  };

  const providerIcons = {
    google: <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>,
    microsoft: <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>,
    github: <Github size={20} />,
    oidc: <Key size={20} />
  };

  return (
    <div className={`min-h-screen flex items-center justify-center ${
      theme === 'dark' 
        ? 'bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900' 
        : 'bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600'
    }`}>
      {/* Theme toggle */}
      <button 
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30"
      >
        {theme === 'dark' ? <Sun size={20} className="text-white" /> : <Moon size={20} className="text-white" />}
      </button>
      
      <div className={`p-8 rounded-xl shadow-2xl w-full max-w-md ${
        theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'
      }`}>
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">{mode === 'reset' ? '🔑' : '🔥'}</div>
          <h1 className="text-3xl font-bold">
            {mode === 'reset' ? 'Reset Password' : 'SDCoLab'}
          </h1>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            {mode === 'reset' ? 'Enter your new password' : 'Tool Scheduler'}
          </p>
        </div>
        
        {/* Messages */}
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
        {message && <div className="bg-green-100 text-green-700 p-3 rounded mb-4">{message}</div>}
        
        {/* SSO Buttons */}
        {providers.length > 0 && mode === 'login' && (
          <div className="space-y-2 mb-6">
            {providers.filter(p => p.id !== 'email').map(provider => (
              <button
                key={provider.id}
                onClick={() => handleOAuth(provider.id)}
                className={`w-full flex items-center justify-center gap-3 p-3 rounded-lg border ${
                  theme === 'dark' 
                    ? 'border-gray-600 hover:bg-gray-700' 
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                {providerIcons[provider.id]}
                Continue with {provider.name}
              </button>
            ))}
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`} />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className={`px-2 ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500'}`}>
                  or continue with email
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={`p-3 rounded-lg border ${
                  theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                }`}
                required
              />
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={`p-3 rounded-lg border ${
                  theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                }`}
                required
              />
            </div>
          )}
          
          {mode !== 'reset' && (
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full p-3 rounded-lg border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              }`}
              required
            />
          )}
          
          {mode === 'reset' && (
            <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-50'} text-sm`}>
              🔑 Enter your new password below
            </div>
          )}
          
          {(mode !== 'forgot') && (
            <input
              type="password"
              placeholder={mode === 'reset' ? 'New Password' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full p-3 rounded-lg border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              }`}
              required
              minLength={8}
            />
          )}
          
          {mode === 'reset' && (
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full p-3 rounded-lg border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              } ${confirmPassword && password !== confirmPassword ? 'border-red-500' : ''}`}
              required
              minLength={8}
            />
          )}
          
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Invite Code (optional)"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className={`w-full p-3 rounded-lg border ${
                theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
              } ${inviteCode ? 'border-green-500' : ''}`}
            />
          )}
          
          <button
            type="submit"
            disabled={loading || (mode === 'reset' && password !== confirmPassword)}
            className="w-full bg-orange-500 text-white p-3 rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Please wait...' : (
              mode === 'login' ? 'Sign In' : 
              mode === 'register' ? 'Create Account' : 
              mode === 'reset' ? 'Reset Password' : 
              'Send Reset Link'
            )}
          </button>
        </form>
        
        {/* Mode toggles */}
        <div className="mt-4 text-center text-sm space-y-2">
          {mode === 'login' && (
            <>
              <button onClick={() => setMode('forgot')} className="text-orange-500 hover:underline">
                Forgot password?
              </button>
              <div>
                <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Don't have an account? </span>
                <button onClick={() => setMode('register')} className="text-orange-500 hover:underline">
                  Sign up
                </button>
              </div>
            </>
          )}
          {mode !== 'login' && (
            <button onClick={() => setMode('login')} className="text-orange-500 hover:underline">
              Back to sign in
            </button>
          )}
        </div>
        
        {/* Demo hint - shown in dev mode or when using localhost API */}
        {(import.meta.env.DEV || API_URL.includes('localhost') || import.meta.env.VITE_SHOW_DEMO_HINT === 'true') && (
          <p className={`text-center text-xs mt-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
            Dev: admin@colab.org / demodemo
          </p>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Main App Component
// =============================================================================

const TOOLS = [
  { id: 'laser', name: 'Laser Cutter', maxConcurrent: 1, room: 'Laser Lab' },
  { id: '3dprinter', name: '3D Printer', maxConcurrent: 4, room: '3D Printing Area' },
  { id: 'cnc', name: 'CNC Router', maxConcurrent: 1, room: 'CNC Area' },
  { id: 'solder', name: 'Soldering Station', maxConcurrent: 3, room: 'Electronics Lab' },
  { id: 'sewing-standard', name: 'Sewing Machines', maxConcurrent: 5, room: 'Sewing Room' },
  { id: 'sewing-industrial', name: 'Industrial Sewing', maxConcurrent: 3, room: 'Sewing Room' },
  { id: 'woodshop', name: 'Woodshop', maxConcurrent: 2, room: 'Woodshop' }
];

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
const formatTime = (t) => {
  const [h] = t.split(':');
  const hour = parseInt(h);
  return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}`;
};

const App = () => {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [features, setFeatures] = useState({}); // Backend feature flags
  const [view, setView] = useState('schedule');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookings, setBookings] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]); // All pending bookings for admin
  const [selectedTool, setSelectedTool] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [bookingPurpose, setBookingPurpose] = useState('');
  const [message, setMessage] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // User management state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  
  // Pagination state
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(20);
  const [userPagination, setUserPagination] = useState({ totalCount: 0, totalPages: 1 });
  
  // Activity log state
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityCategory, setActivityCategory] = useState('');
  const [activityLimit, setActivityLimit] = useState(50);
  
  // Notification preferences modal
  const [notificationPrefsOpen, setNotificationPrefsOpen] = useState(false);
  
  // Time slot range selection state
  const [rangeStart, setRangeStart] = useState(null);
  
  // Slot availability data
  const [slotData, setSlotData] = useState(null);
  
  // Edit booking modal
  const [editBookingModalOpen, setEditBookingModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  
  // Multi-select calendar modal
  const [multiSelectCalendarOpen, setMultiSelectCalendarOpen] = useState(false);
  
  // Calendar summary for date hover preview
  const [calendarSummary, setCalendarSummary] = useState({});
  const [calendarPopover, setCalendarPopover] = useState({ open: false, date: null, x: 0, y: 0 });
  
  // Overlap warning dialog
  const [overlapWarning, setOverlapWarning] = useState(null);
  
  // Integration health dashboard
  const [integrationHealth, setIntegrationHealth] = useState(null);
  const [integrationHealthLoading, setIntegrationHealthLoading] = useState(false);
  const [testingIntegration, setTestingIntegration] = useState(null);

  // Check for OAuth callback and errors
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const refresh = params.get('refresh');
    const error = params.get('error');
    
    if (error) {
      // Map error codes to user-friendly messages
      const errorMessages = {
        'oauth_init_failed': 'Failed to start sign-in. Please try again.',
        'oauth_failed': 'Sign-in failed. Please try again.',
        'pending_approval': 'Your account is pending approval by an administrator.',
        'account_disabled': 'Your account has been disabled. Contact an administrator.',
        'registration_disabled': 'New account registration is currently disabled.',
        'user_not_found': 'Account not found.',
        'provider_linked_to_other_account': 'This provider is already linked to another account.'
      };
      showMessage(errorMessages[error] || `Sign-in error: ${error}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    if (token) {
      setTokens(token, refresh);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Fetch providers and features
        const [providersData, healthData] = await Promise.all([
          api('/auth/providers'),
          api('/health').catch(() => ({ features: {} }))
        ]);
        setProviders(providersData.providers);
        setFeatures(healthData.features || {});
        
        if (getTokens().authToken) {
          const { user } = await api('/auth/me');
          setUser(user);
        }
      } catch (err) {
        console.error('Init error:', err);
        setTokens(null, null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Load bookings
  const loadBookings = useCallback(async () => {
    if (!user) return;
    try {
      const [dateData, myData] = await Promise.all([
        api(`/bookings?date=${selectedDate}`),
        api('/bookings/mine')
      ]);
      setBookings(dateData.bookings || []);
      setMyBookings(myData.bookings || []);
    } catch (err) {
      console.error('Load bookings error:', err);
    }
  }, [user, selectedDate]);

  useEffect(() => { loadBookings(); }, [loadBookings]);
  
  // Load calendar summary for the current month (for date hover preview)
  const loadCalendarSummary = useCallback(async () => {
    if (!user) return;
    try {
      const date = new Date(selectedDate);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const data = await api(`/bookings/calendar/${year}/${month}`);
      setCalendarSummary(prev => ({ ...prev, ...data.calendar }));
    } catch (err) {
      console.error('Load calendar summary error:', err);
    }
  }, [user, selectedDate]);
  
  useEffect(() => { loadCalendarSummary(); }, [loadCalendarSummary]);

  // Load all pending bookings for admin view
  const loadPendingBookings = useCallback(async () => {
    if (!user || !['admin', 'superadmin'].includes(user.role)) return;
    try {
      const data = await api('/bookings/pending');
      setPendingBookings(data.bookings || []);
    } catch (err) {
      console.error('Load pending bookings error:', err);
    }
  }, [user]);

  // Load pending bookings when user is admin
  useEffect(() => {
    if (user && ['admin', 'superadmin'].includes(user.role)) {
      loadPendingBookings();
    }
  }, [user, loadPendingBookings]);

  // Navigate to a view with history support
  const navigateToView = useCallback((newView) => {
    if (newView === view) return;
    window.history.pushState({ view: newView }, '', `#${newView}`);
    setView(newView);
  }, [view]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.slice(1);
      const validViews = ['schedule', 'mybookings', 'admin', 'users', 'activity', 'certifications', 'resources', 'issues', 'integrations'];
      if (validViews.includes(hash)) {
        setView(hash);
      } else {
        setView('schedule');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Set initial view from hash on mount
    const initialHash = window.location.hash.slice(1);
    const validViews2 = ['schedule', 'mybookings', 'admin', 'users', 'activity', 'certifications', 'resources', 'issues', 'integrations'];
    if (validViews2.includes(initialHash)) {
      setView(initialHash);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleLogout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    setTokens(null, null);
    setUser(null);
  };

  const handleCreateBooking = async (confirmOverlap = false) => {
    if (!selectedTool || selectedSlots.length === 0 || !bookingPurpose.trim()) {
      showMessage('Please select tool, time slots, and enter purpose', 'error');
      return;
    }
    try {
      const response = await api('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          tool: selectedTool,
          date: selectedDate,
          startTime: selectedSlots[0],
          endTime: TIME_SLOTS[TIME_SLOTS.indexOf(selectedSlots[selectedSlots.length - 1]) + 1] || '24:00',
          purpose: bookingPurpose,
          confirmOverlap
        })
      });
      
      // Build detailed success message
      const toolName = TOOLS.find(t => t.id === selectedTool)?.name || selectedTool;
      const startTime = formatTime(selectedSlots[0]);
      const endTime = formatTime(TIME_SLOTS[TIME_SLOTS.indexOf(selectedSlots[selectedSlots.length - 1]) + 1] || '24:00');
      
      const statusMsg = response.autoApproved 
        ? `✅ Booking confirmed for ${toolName} on ${selectedDate} (${startTime} - ${endTime})`
        : `✅ Booking request submitted for ${toolName} on ${selectedDate} (${startTime} - ${endTime}). Awaiting approval.`;
      showMessage(statusMsg);
      setSelectedTool(null);
      setSelectedSlots([]);
      setRangeStart(null);
      setBookingPurpose('');
      setOverlapWarning(null);
      loadBookings();
    } catch (err) {
      // Check for overlap warning
      if (err.message === 'OVERLAP_WARNING' || err.data?.error === 'OVERLAP_WARNING') {
        const errorData = err.data || {};
        setOverlapWarning({
          overlappingBookings: errorData.overlappingBookings || [],
          pendingBooking: {
            tool: selectedTool,
            toolName: TOOLS.find(t => t.id === selectedTool)?.name,
            date: selectedDate,
            startTime: selectedSlots[0],
            endTime: TIME_SLOTS[TIME_SLOTS.indexOf(selectedSlots[selectedSlots.length - 1]) + 1] || '24:00'
          }
        });
        return;
      }
      showMessage(err.message, 'error');
    }
  };

  const handleApprove = async (id) => {
    try {
      await api(`/bookings/${id}/approve`, { method: 'POST' });
      showMessage('Booking approved!');
      loadBookings();
      loadPendingBookings();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Please provide a reason for rejection (required for transparency):');
    if (!reason || reason.trim() === '') {
      showMessage('Rejection reason is required', 'error');
      return;
    }
    try {
      await api(`/bookings/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      showMessage('Booking rejected');
      loadBookings();
      loadPendingBookings();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this booking?')) return;
    try {
      await api(`/bookings/${id}`, { method: 'DELETE' });
      showMessage('Booking cancelled');
      loadBookings();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleEditBooking = async (bookingId, updates, confirmOverlap = false) => {
    try {
      const response = await api(`/bookings/${bookingId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...updates, confirmOverlap })
      });
      
      if (response.statusChanged) {
        showMessage('Booking updated and resubmitted for approval');
      } else {
        showMessage('Booking updated successfully');
      }
      
      setEditBookingModalOpen(false);
      setEditingBooking(null);
      loadBookings();
    } catch (err) {
      if (err.message === 'OVERLAP_WARNING') {
        showMessage('You have overlapping bookings. Please confirm to proceed.', 'warning');
        return;
      }
      showMessage(err.message, 'error');
    }
  };

  const openEditBookingModal = (booking) => {
    setEditingBooking(booking);
    setEditBookingModalOpen(true);
  };

  // =============================================================================
  // User Management Functions
  // =============================================================================
  
  const loadUsers = useCallback(async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return;
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (userSearch) params.set('search', userSearch);
      if (userStatusFilter) params.set('status', userStatusFilter);
      if (userRoleFilter) params.set('role', userRoleFilter);
      params.set('page', userPage.toString());
      params.set('limit', userPageSize.toString());
      
      const data = await api(`/users?${params.toString()}`);
      setUsers(data.users || []);
      if (data.pagination) {
        setUserPagination(data.pagination);
      }
    } catch (err) {
      console.error('Load users error:', err);
      showMessage('Failed to load users', 'error');
    } finally {
      setUsersLoading(false);
    }
  }, [user, userSearch, userStatusFilter, userRoleFilter, userPage, userPageSize]);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setUserPage(1);
  }, [userSearch, userStatusFilter, userRoleFilter]);
  
  useEffect(() => {
    if (view === 'users') loadUsers();
  }, [view, loadUsers]);
  
  const handleCreateUser = async (userData) => {
    const data = await api('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    showMessage('User created successfully');
    loadUsers();
    return data;
  };
  
  const handleUserSave = async (email, updates) => {
    await api(`/users/${encodeURIComponent(email)}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    showMessage('User updated successfully');
    loadUsers();
  };
  
  const handleUserDelete = async (email) => {
    await api(`/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
    showMessage('User deleted');
    loadUsers();
  };
  
  const handleUserApprove = async (email) => {
    await api(`/users/${encodeURIComponent(email)}/approve`, { method: 'POST' });
    showMessage('User approved');
    loadUsers();
  };
  
  const handleUserDeactivate = async (email) => {
    if (!confirm('Deactivate this user? They will lose access.')) return;
    await api(`/users/${encodeURIComponent(email)}/deactivate`, { 
      method: 'POST',
      body: JSON.stringify({ reason: 'Deactivated by admin' })
    });
    showMessage('User deactivated');
    loadUsers();
  };
  
  const handleUserReactivate = async (email) => {
    await api(`/users/${encodeURIComponent(email)}/reactivate`, { method: 'POST' });
    showMessage('User reactivated');
    loadUsers();
  };
  
  const handleInviteUser = async (inviteData) => {
    const data = await api('/users/invites', {
      method: 'POST',
      body: JSON.stringify(inviteData)
    });
    showMessage('Invite created!');
    return data;
  };
  
  const handleImportUsers = async (importData) => {
    const data = await api('/users/bulk/import', {
      method: 'POST',
      body: JSON.stringify(importData)
    });
    showMessage(`Imported ${data.success?.length || 0} users`);
    loadUsers();
    return data;
  };
  
  const handleExportUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/users/bulk/export`, {
        headers: { Authorization: `Bearer ${getTokens().authToken}` }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showMessage('Export downloaded');
    } catch (err) {
      showMessage('Export failed', 'error');
    }
  };
  
  // =============================================================================
  // Activity Log Functions
  // =============================================================================
  
  const loadActivityLogs = useCallback(async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return;
    setActivityLoading(true);
    try {
      const params = new URLSearchParams();
      if (activityCategory) params.set('category', activityCategory);
      params.set('limit', activityLimit.toString());
      
      const data = await api(`/users/activity?${params.toString()}`);
      setActivityLogs(data.logs || []);
    } catch (err) {
      console.error('Load activity error:', err);
      showMessage('Failed to load activity logs', 'error');
    } finally {
      setActivityLoading(false);
    }
  }, [user, activityCategory, activityLimit]);
  
  useEffect(() => {
    if (view === 'activity') loadActivityLogs();
  }, [view, loadActivityLogs]);
  
  // =============================================================================
  // Integration Health Functions
  // =============================================================================
  
  const loadIntegrationHealth = useCallback(async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return;
    setIntegrationHealthLoading(true);
    try {
      const data = await api('/notifications/integrations/health');
      setIntegrationHealth(data);
    } catch (err) {
      console.error('Load integration health error:', err);
      showMessage('Failed to load integration health', 'error');
    } finally {
      setIntegrationHealthLoading(false);
    }
  }, [user]);
  
  const testIntegration = async (integration) => {
    setTestingIntegration(integration);
    try {
      const data = await api(`/notifications/integrations/test/${integration}`, {
        method: 'POST'
      });
      if (data.success) {
        showMessage(data.message, 'success');
      } else {
        showMessage(data.message || 'Test failed', 'error');
      }
      // Refresh health data
      loadIntegrationHealth();
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setTestingIntegration(null);
    }
  };
  
  useEffect(() => {
    if (view === 'integrations') loadIntegrationHealth();
  }, [view, loadIntegrationHealth]);

  const getSlotStatus = (toolId, time) => {
    const toolBookings = bookings.filter(b => 
      (b.resourceId === toolId || b.tool === toolId) &&
      b.status !== 'rejected' && b.status !== 'cancelled' &&
      time >= b.startTime && time < b.endTime
    );
    const tool = TOOLS.find(t => t.id === toolId);
    const maxConcurrent = tool?.maxConcurrent || 1;
    
    // Only APPROVED bookings count toward the "full" limit
    const approvedCount = toolBookings.filter(b => b.status === 'approved').length;
    const pendingCount = toolBookings.filter(b => b.status === 'pending').length;
    
    if (approvedCount >= maxConcurrent) return 'full';
    if (approvedCount > 0) return 'approved'; // Some slots taken but not full
    if (pendingCount > 0) return 'pending';   // Only pending (doesn't block booking)
    return 'available';
  };
  
  // Get detailed slot info for display
  const getSlotInfo = (toolId, time) => {
    const toolBookings = bookings.filter(b => 
      (b.resourceId === toolId || b.tool === toolId) &&
      b.status !== 'rejected' && b.status !== 'cancelled' &&
      time >= b.startTime && time < b.endTime
    );
    const tool = TOOLS.find(t => t.id === toolId);
    const maxConcurrent = tool?.maxConcurrent || 1;
    
    const approved = toolBookings.filter(b => b.status === 'approved').length;
    const pending = toolBookings.filter(b => b.status === 'pending').length;
    
    return {
      approved,
      pending,
      available: maxConcurrent - approved,
      maxConcurrent,
      isFull: approved >= maxConcurrent
    };
  };

  const changeDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">🔥</div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} providers={providers} />;
  }

  const pendingCount = pendingBookings.length;

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`${
        theme === 'dark' 
          ? 'bg-gradient-to-r from-gray-800 via-purple-900 to-gray-800' 
          : 'bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600'
      } text-white p-4 shadow-lg`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-3xl">🔥</span>
            <span className="hidden sm:inline">SDCoLab Scheduler</span>
          </h1>
          
          <div className="flex items-center gap-2">
            <span className="hidden md:inline">{user.displayName || user.email}</span>
            
            <button onClick={() => setNotificationPrefsOpen(true)} className="p-2 hover:bg-white/20 rounded" title="Notifications">
              <Bell size={20} />
            </button>
            <button onClick={() => setHelpOpen(true)} className="p-2 hover:bg-white/20 rounded" title="Help">
              <HelpCircle size={20} />
            </button>
            <button onClick={toggleTheme} className="p-2 hover:bg-white/20 rounded" title="Toggle theme">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {(user.role === 'admin' || user.role === 'superadmin') && (
              <button onClick={() => navigateToView('users')} className="p-2 hover:bg-white/20 rounded" title="Users">
                <Users size={20} />
              </button>
            )}
            <button onClick={handleLogout} className="p-2 hover:bg-white/20 rounded" title="Logout">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Toast */}
      {message && (
        <div className={`fixed top-20 right-4 p-4 rounded-lg shadow-lg z-50 ${
          message.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        } text-white`}>
          {message.text}
        </div>
      )}

      {/* Help Drawer */}
      <HelpDrawer isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Navigation */}
      <nav className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'} border-b`}>
        <div className="max-w-7xl mx-auto flex gap-1 p-2 overflow-x-auto">
          {[
            { id: 'schedule', label: 'Schedule', icon: Calendar },
            { id: 'mybookings', label: 'My Bookings', icon: Wrench },
            ...(user.role === 'admin' || user.role === 'superadmin' ? [
              { id: 'admin', label: `Admin${pendingCount ? ` (${pendingCount})` : ''}`, icon: CheckCircle },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'certifications', label: 'Certs', icon: Award },
              { id: 'resources', label: 'Resources', icon: Settings },
              { id: 'issues', label: 'Issues', icon: AlertTriangle },
              { id: 'integrations', label: 'Integrations', icon: Zap },
              { id: 'activity', label: 'Activity', icon: Activity }
            ] : [])
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigateToView(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded whitespace-nowrap ${
                view === id 
                  ? 'bg-orange-500 text-white' 
                  : theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
            >
              <Icon size={18} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4">
        {/* Schedule View */}
        {view === 'schedule' && (
          <div className="space-y-4">
            {/* Date Picker with Calendar Preview */}
            <div className={`p-4 rounded-lg shadow ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                  <ChevronLeft />
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className={`text-lg font-semibold text-center bg-transparent border-none ${
                      theme === 'dark' ? 'text-white' : ''
                    }`}
                  />
                  {calendarSummary[selectedDate] && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                    }`}>
                      {calendarSummary[selectedDate].total} booking{calendarSummary[selectedDate].total !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                  <ChevronRight />
                </button>
              </div>
              
              {/* Mini Calendar with Booking Indicators */}
              <div className="grid grid-cols-7 gap-1 text-xs">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                  <div key={day} className={`text-center font-semibold p-1 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>{day}</div>
                ))}
                {(() => {
                  const current = new Date(selectedDate);
                  const year = current.getFullYear();
                  const month = current.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const today = new Date().toISOString().split('T')[0];
                  
                  const cells = [];
                  // Empty cells before first day
                  for (let i = 0; i < firstDay; i++) {
                    cells.push(<div key={`empty-${i}`} />);
                  }
                  // Day cells
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                    const summary = calendarSummary[dateStr];
                    const isSelected = dateStr === selectedDate;
                    const isToday = dateStr === today;
                    const isPast = dateStr < today;
                    
                    cells.push(
                      <button
                        key={day}
                        onClick={() => setSelectedDate(dateStr)}
                        onMouseEnter={(e) => {
                          if (summary) {
                            const rect = e.target.getBoundingClientRect();
                            setCalendarPopover({ 
                              open: true, 
                              date: dateStr, 
                              summary,
                              x: rect.left + rect.width / 2,
                              y: rect.bottom + 5
                            });
                          }
                        }}
                        onMouseLeave={() => setCalendarPopover({ open: false, date: null })}
                        className={`relative p-1 rounded text-center transition-colors ${
                          isSelected ? 'bg-orange-500 text-white font-bold' :
                          isToday ? 'bg-blue-100 dark:bg-blue-900 font-bold' :
                          isPast ? 'text-gray-400 dark:text-gray-600' :
                          'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {day}
                        {/* Booking indicators */}
                        {summary && !isSelected && (
                          <span className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5`}>
                            {summary.approved > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" title={`${summary.approved} approved`} />
                            )}
                            {summary.pending > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" title={`${summary.pending} pending`} />
                            )}
                          </span>
                        )}
                      </button>
                    );
                  }
                  return cells;
                })()}
              </div>
              
              {/* Legend */}
              <div className={`flex justify-center gap-4 mt-2 text-xs ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Approved
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" /> Pending
                </span>
              </div>
            </div>
            
            {/* Calendar Popover for Date Hover */}
            {calendarPopover.open && calendarPopover.summary && (
              <div 
                className={`fixed z-50 p-3 rounded-lg shadow-lg border text-sm ${
                  theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                }`}
                style={{ 
                  left: calendarPopover.x, 
                  top: calendarPopover.y,
                  transform: 'translateX(-50%)'
                }}
              >
                <div className="font-semibold mb-2">
                  {new Date(calendarPopover.date + 'T12:00:00').toLocaleDateString('en-US', { 
                    weekday: 'short', month: 'short', day: 'numeric' 
                  })}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span>{calendarPopover.summary.approved} approved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span>{calendarPopover.summary.pending} pending</span>
                  </div>
                  {calendarPopover.summary.tools?.length > 0 && (
                    <div className={`mt-2 pt-2 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                      <div className="text-xs text-gray-500 mb-1">Tools booked:</div>
                      <div className="flex flex-wrap gap-1">
                        {calendarPopover.summary.tools.slice(0, 4).map(tool => (
                          <span key={tool} className={`text-xs px-1.5 py-0.5 rounded ${
                            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                          }`}>{tool}</span>
                        ))}
                        {calendarPopover.summary.tools.length > 4 && (
                          <span className="text-xs text-gray-500">+{calendarPopover.summary.tools.length - 4} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tool Selection */}
            <div className={`p-4 rounded-lg shadow ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className="font-semibold mb-3">Select Tool</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {TOOLS.map(tool => {
                  const isCertified = user.role === 'admin' || 
                    user.role === 'superadmin' || 
                    user.permissions?.tools?.includes(tool.id);
                  const isInMaintenance = tool.status === 'maintenance';
                  
                  return (
                    <button
                      key={tool.id}
                      onClick={() => { 
                        if (!isCertified) {
                          showMessage(`Certification required for ${tool.name}. Contact an admin to get certified.`, 'error');
                          return;
                        }
                        if (isInMaintenance) {
                          showMessage(`${tool.name} is currently under maintenance`, 'error');
                          return;
                        }
                        setSelectedTool(tool.id); 
                        setSelectedSlots([]); 
                      }}
                      className={`p-3 rounded border text-left relative ${
                        selectedTool === tool.id 
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30' 
                          : !isCertified
                            ? 'border-gray-300 dark:border-gray-700 opacity-60 cursor-not-allowed'
                            : isInMaintenance
                              ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                              : theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Wrench className="inline mr-2" size={16} />
                      {tool.name}
                      <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        {tool.room}
                      </div>
                      {!isCertified && (
                        <div className="absolute top-1 right-1 text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded">
                          🔒 Cert Required
                        </div>
                      )}
                      {isInMaintenance && (
                        <div className="absolute top-1 right-1 text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400 rounded">
                          🔧 Maintenance
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {TOOLS.filter(t => user.permissions?.tools?.includes(t.id)).length === 0 && 
               user.role !== 'admin' && user.role !== 'superadmin' && (
                <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <p className="text-orange-600 dark:text-orange-400 text-sm">
                    <strong>No certifications yet.</strong> You need to be certified before booking tools. 
                    Contact an admin or attend a training session to get started.
                  </p>
                </div>
              )}
            </div>

            {/* Time Slots */}
            {selectedTool && (
              <div className={`p-4 rounded-lg shadow ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">Select Time Slots</h3>
                  {TOOLS.find(t => t.id === selectedTool)?.maxConcurrent > 1 && (
                    <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Max {TOOLS.find(t => t.id === selectedTool)?.maxConcurrent} concurrent bookings
                    </span>
                  )}
                </div>
                
                {/* Range selection mode indicator */}
                {rangeStart && (
                  <div className="mb-2 p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg border border-orange-300 dark:border-orange-700">
                    <p className="text-sm text-orange-700 dark:text-orange-300 flex items-center gap-2">
                      <span className="animate-pulse">🎯</span>
                      <span>
                        Range selection started at <strong>{formatTime(rangeStart)}</strong> — 
                        click another time to select all slots in between, or click the same slot to cancel
                      </span>
                    </p>
                  </div>
                )}
                
                <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Click to select a slot, or click two non-adjacent times to select a range
                </p>
                <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
                  {TIME_SLOTS.slice(8, 22).map(time => {
                    const status = getSlotStatus(selectedTool, time);
                    const info = getSlotInfo(selectedTool, time);
                    const isSelected = selectedSlots.includes(time);
                    const isRangeStart = rangeStart === time;
                    
                    // Calculate if this slot is in the potential range (between rangeStart and hover)
                    // For now, highlight all slots between rangeStart and current slot on hover
                    const isInPotentialRange = rangeStart && rangeStart !== time && (() => {
                      const startIdx = TIME_SLOTS.indexOf(rangeStart);
                      const currentIdx = TIME_SLOTS.indexOf(time);
                      const [from, to] = startIdx < currentIdx ? [startIdx, currentIdx] : [currentIdx, startIdx];
                      return currentIdx >= from && currentIdx <= to;
                    })();
                    
                    return (
                      <button
                        key={time}
                        onClick={() => {
                          if (status === 'full') return;
                          
                          // Range selection logic
                          if (rangeStart && rangeStart !== time) {
                            // Select all slots between rangeStart and this time
                            const startIdx = TIME_SLOTS.indexOf(rangeStart);
                            const endIdx = TIME_SLOTS.indexOf(time);
                            const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                            const range = TIME_SLOTS.slice(from, to + 1).filter(t => {
                              const s = getSlotStatus(selectedTool, t);
                              return s !== 'full';
                            });
                            setSelectedSlots(range.sort());
                            setRangeStart(null);
                          } else if (rangeStart === time) {
                            // Clicking same slot cancels range selection
                            setRangeStart(null);
                            if (!isSelected) {
                              setSelectedSlots([time]);
                            }
                          } else if (isSelected && selectedSlots.length > 1) {
                            // Deselect if already selected
                            setSelectedSlots(prev => prev.filter(t => t !== time));
                            setRangeStart(null);
                          } else {
                            // Start new selection or add to selection
                            if (selectedSlots.length === 0) {
                              setSelectedSlots([time]);
                              setRangeStart(time);
                            } else {
                              // Check if adjacent to existing selection
                              const sortedSlots = [...selectedSlots, time].sort();
                              const isContiguous = sortedSlots.every((slot, i) => {
                                if (i === 0) return true;
                                const prevIdx = TIME_SLOTS.indexOf(sortedSlots[i-1]);
                                const currIdx = TIME_SLOTS.indexOf(slot);
                                return currIdx - prevIdx === 1;
                              });
                              
                              if (isContiguous) {
                                setSelectedSlots(sortedSlots);
                                setRangeStart(null);
                              } else {
                                // Not adjacent - start range selection from this point
                                setRangeStart(time);
                              }
                            }
                          }
                        }}
                        disabled={status === 'full'}
                        title={info.maxConcurrent > 1 
                          ? `${info.approved}/${info.maxConcurrent} booked${info.pending > 0 ? `, ${info.pending} pending` : ''}`
                          : status === 'full' ? 'Fully booked' : status === 'pending' ? 'Has pending requests' : 'Available'
                        }
                        className={`p-2 text-xs rounded transition-colors relative ${
                          isSelected ? 'bg-orange-500 text-white ring-2 ring-orange-300' :
                          isRangeStart ? 'bg-orange-400 text-white ring-2 ring-orange-500 animate-pulse' :
                          isInPotentialRange && status !== 'full' ? 'bg-orange-200 dark:bg-orange-800/50 ring-1 ring-orange-400' :
                          status === 'full' ? 'bg-red-200 dark:bg-red-900 cursor-not-allowed opacity-60' :
                          status === 'approved' ? 'bg-purple-200 dark:bg-purple-900 hover:bg-purple-300 dark:hover:bg-purple-800' :
                          status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/50 hover:bg-yellow-200 dark:hover:bg-yellow-800' :
                          'bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800'
                        }`}
                      >
                        {formatTime(time)}
                        {/* Show booking count for tools with concurrent slots */}
                        {info.maxConcurrent > 1 && (info.approved > 0 || info.pending > 0) && (
                          <span className={`absolute -top-1 -right-1 text-[10px] px-1 rounded-full font-bold ${
                            info.isFull ? 'bg-red-500 text-white' : 
                            info.approved > 0 ? 'bg-purple-500 text-white' :
                            'bg-yellow-500 text-yellow-900'
                          }`}>
                            {info.approved}/{info.maxConcurrent}
                          </span>
                        )}
                        {/* Show pending indicator for single-slot tools */}
                        {info.maxConcurrent === 1 && info.pending > 0 && status !== 'full' && (
                          <span className="absolute -top-1 -right-1 text-[10px] px-1 bg-yellow-500 text-yellow-900 rounded-full font-bold">
                            P
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 dark:bg-green-900 rounded" /> Available</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-100 dark:bg-yellow-900/50 rounded" /> Pending (you can still book)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-200 dark:bg-purple-900 rounded" /> Has bookings</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-200 dark:bg-red-900 rounded" /> Full</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-200 dark:bg-orange-800 rounded" /> Range preview</span>
                </div>
              </div>
            )}

            {/* Booking Form */}
            {selectedSlots.length > 0 && (
              <div className={`p-4 rounded-lg shadow ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
                <h3 className="font-semibold mb-3">Complete Booking</h3>
                <textarea
                  placeholder="What will you be working on?"
                  value={bookingPurpose}
                  onChange={(e) => setBookingPurpose(e.target.value)}
                  className={`w-full p-3 border rounded mb-3 ${
                    theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                  }`}
                  rows={3}
                />
                <button
                  onClick={() => handleCreateBooking()}
                  className="w-full bg-orange-500 text-white p-3 rounded hover:bg-orange-600"
                >
                  Request Booking ({formatTime(selectedSlots[0])} - {formatTime(TIME_SLOTS[TIME_SLOTS.indexOf(selectedSlots[selectedSlots.length - 1]) + 1] || '24:00')})
                </button>
              </div>
            )}
          </div>
        )}

        {/* My Bookings View - Enhanced with Calendar and Management */}
        {view === 'mybookings' && (
          <MyBookingsPanel
            bookings={myBookings}
            tools={TOOLS}
            theme={theme}
            onCancel={handleCancel}
            onEdit={openEditBookingModal}
            onMultiBook={() => setMultiSelectCalendarOpen(true)}
            showMessage={showMessage}
          />
        )}

        {/* Admin View - Enhanced Admin Panel */}
        {view === 'admin' && (user.role === 'admin' || user.role === 'superadmin') && (
          <AdminPanel
            token={getTokens().authToken}
            user={user}
            theme={theme}
            showMessage={(text, type) => setMessage({ text, type: type || 'success' })}
            onNavigate={(action, data) => {
              if (action === 'editBooking') {
                setEditingBooking(data);
                setEditBookingModalOpen(true);
              } else if (action === 'template-generator') {
                setView('template-generator');
              }
            }}
          />
        )}

        {/* Users View - Full User Management */}
        {view === 'users' && (user.role === 'admin' || user.role === 'superadmin') && (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className={`rounded-lg shadow p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex flex-col md:flex-row gap-4 justify-between">
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setAddUserModalOpen(true)}
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 flex items-center gap-2"
                  >
                    <UserPlus size={18} /> Add User
                  </button>
                  <button 
                    onClick={() => setImportModalOpen(true)}
                    className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Upload size={18} /> Import CSV
                  </button>
                  <button 
                    onClick={handleExportUsers}
                    className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Download size={18} /> Export
                  </button>
                </div>
                <button
                  onClick={loadUsers}
                  disabled={usersLoading}
                  className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  {usersLoading ? 'Loading...' : '🔄 Refresh'}
                </button>
              </div>
            </div>
            
            {/* Filters */}
            <div className={`rounded-lg shadow p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    placeholder="🔍 Search by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className={`w-full p-3 rounded border ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                    }`}
                  />
                </div>
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className={`p-3 rounded border ${
                    theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                  }`}
                >
                  <option value="">All Statuses</option>
                  <option value="pending">🟡 Pending</option>
                  <option value="active">🟢 Active</option>
                  <option value="suspended">🟠 Suspended</option>
                  <option value="deactivated">🔴 Deactivated</option>
                </select>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className={`p-3 rounded border ${
                    theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                  }`}
                >
                  <option value="">All Roles</option>
                  <option value="guest">Guest</option>
                  <option value="member">Member</option>
                  <option value="certified">Certified</option>
                  <option value="steward">Steward</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
            </div>
            
            {/* Users Table */}
            <div className={`rounded-lg shadow overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-xl font-semibold">Users ({users.length})</h2>
              </div>
              
              {usersLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
                  <p className="mt-2 text-gray-500">Loading users...</p>
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Users size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No users found</p>
                  <p className="text-sm mt-1">Try adjusting your search or filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className={theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}>
                      <tr>
                        <th className="text-left p-4 font-semibold">User</th>
                        <th className="text-left p-4 font-semibold">Role</th>
                        <th className="text-left p-4 font-semibold">Status</th>
                        <th className="text-left p-4 font-semibold hidden md:table-cell">Certifications</th>
                        <th className="text-left p-4 font-semibold hidden lg:table-cell">Joined</th>
                        <th className="text-right p-4 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {users.map(u => (
                        <tr key={u.email} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                                u.role === 'admin' || u.role === 'superadmin' 
                                  ? 'bg-purple-500' 
                                  : u.role === 'steward' 
                                    ? 'bg-blue-500' 
                                    : 'bg-gray-400'
                              }`}>
                                {(u.displayName || u.email).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium">{u.displayName || 'No name'}</div>
                                <div className="text-sm text-gray-500">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              u.role === 'superadmin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                              u.role === 'admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                              u.role === 'steward' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' :
                              u.role === 'certified' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                              'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              u.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                              u.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                              u.status === 'suspended' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                              'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            }`}>
                              {u.status}
                            </span>
                          </td>
                          <td className="p-4 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {u.permissions?.tools?.slice(0, 3).map(t => (
                                <span key={t} className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs">
                                  {t}
                                </span>
                              ))}
                              {(u.permissions?.tools?.length || 0) > 3 && (
                                <span className="text-xs text-gray-500">+{u.permissions.tools.length - 3}</span>
                              )}
                              {!u.permissions?.tools?.length && (
                                <span className="text-gray-400 text-xs">None</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 hidden lg:table-cell text-sm text-gray-500">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              {u.status === 'pending' && (
                                <button
                                  onClick={() => handleUserApprove(u.email)}
                                  className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                                >
                                  Approve
                                </button>
                              )}
                              {u.status === 'deactivated' ? (
                                <button
                                  onClick={() => handleUserReactivate(u.email)}
                                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                                >
                                  Reactivate
                                </button>
                              ) : u.status === 'active' && u.email !== user.email && (
                                <button
                                  onClick={() => handleUserDeactivate(u.email)}
                                  className="px-3 py-1 border border-red-300 text-red-500 rounded text-sm hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  Deactivate
                                </button>
                              )}
                              <button
                                onClick={() => { setSelectedUser(u); setEditModalOpen(true); }}
                                className="px-3 py-1 border rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* Pagination Controls */}
              {userPagination.totalPages > 1 && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-sm text-gray-500">
                    Showing {((userPage - 1) * userPageSize) + 1} - {Math.min(userPage * userPageSize, userPagination.totalCount)} of {userPagination.totalCount} users
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUserPage(1)}
                      disabled={userPage === 1}
                      className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                      disabled={userPage === 1}
                      className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-3 py-1">
                      Page {userPage} of {userPagination.totalPages}
                    </span>
                    <button
                      onClick={() => setUserPage(p => Math.min(userPagination.totalPages, p + 1))}
                      disabled={userPage >= userPagination.totalPages}
                      className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => setUserPage(userPagination.totalPages)}
                      disabled={userPage >= userPagination.totalPages}
                      className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Last
                    </button>
                    <select
                      value={userPageSize}
                      onChange={(e) => { setUserPageSize(parseInt(e.target.value)); setUserPage(1); }}
                      className={`ml-4 px-2 py-1 border rounded ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}`}
                    >
                      <option value="10">10 per page</option>
                      <option value="20">20 per page</option>
                      <option value="50">50 per page</option>
                      <option value="100">100 per page</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            
            {/* Modals */}
            <AddUserModal
              isOpen={addUserModalOpen}
              onClose={() => setAddUserModalOpen(false)}
              onInvite={handleInviteUser}
              onCreate={handleCreateUser}
            />
            <ImportModal 
              isOpen={importModalOpen} 
              onClose={() => setImportModalOpen(false)} 
              onImport={handleImportUsers}
            />
            <UserEditModal
              isOpen={editModalOpen}
              onClose={() => { setEditModalOpen(false); setSelectedUser(null); }}
              user={selectedUser}
              onSave={handleUserSave}
              onDelete={handleUserDelete}
            />
          </div>
        )}

        {/* Activity Log View - Full Implementation */}
        {view === 'activity' && (user.role === 'admin' || user.role === 'superadmin') && (
          <div className="space-y-4">
            {/* Filters */}
            <div className={`rounded-lg shadow p-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex flex-col md:flex-row gap-4 justify-between items-end">
                <div className="flex flex-wrap gap-4 flex-1">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium mb-1">Category</label>
                    <select
                      value={activityCategory}
                      onChange={(e) => setActivityCategory(e.target.value)}
                      className={`w-full p-3 rounded border ${
                        theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                      }`}
                    >
                      <option value="">All Categories</option>
                      <option value="auth">🔐 Authentication</option>
                      <option value="booking">📅 Bookings</option>
                      <option value="admin">👤 Admin Actions</option>
                      <option value="system">⚙️ System</option>
                    </select>
                  </div>
                  <div className="w-32">
                    <label className="block text-sm font-medium mb-1">Limit</label>
                    <select
                      value={activityLimit}
                      onChange={(e) => setActivityLimit(parseInt(e.target.value))}
                      className={`w-full p-3 rounded border ${
                        theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
                      }`}
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={loadActivityLogs}
                  disabled={activityLoading}
                  className="px-4 py-3 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                >
                  {activityLoading ? 'Loading...' : '🔄 Refresh'}
                </button>
              </div>
            </div>
            
            {/* Activity Timeline */}
            <div className={`rounded-lg shadow ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Activity size={24} /> Activity Log
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  All actions are logged for transparency and accountability. Viewing this log is also logged.
                </p>
              </div>
              
              {activityLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
                  <p className="mt-2 text-gray-500">Loading activity...</p>
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Activity size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No activity logs found</p>
                  <p className="text-sm mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {activityLogs.map((log, i) => {
                    const actionIcons = {
                      'auth.login': '🔓',
                      'auth.logout': '🔒',
                      'auth.register': '📝',
                      'auth.failed_login': '🚨',
                      'booking.created': '📅',
                      'booking.approved': '✅',
                      'booking.rejected': '❌',
                      'booking.cancelled': '🚫',
                      'admin.approved_user': '✅',
                      'admin.viewed_users': '👁️',
                      'admin.viewed_user': '👁️',
                      'admin.viewed_activity_logs': '👁️',
                      'admin.deactivated_user': '🚫',
                      'admin.reactivated_user': '♻️',
                      'admin.exported_users': '📤',
                      'admin.sent_invite': '✉️',
                      'user.created': '➕',
                      'user.updated': '✏️',
                      'user.deleted': '🗑️',
                      'system.error': '⚠️'
                    };
                    
                    const actionColors = {
                      'auth': 'border-blue-500',
                      'booking': 'border-green-500',
                      'admin': 'border-purple-500',
                      'user': 'border-orange-500',
                      'system': 'border-gray-500'
                    };
                    
                    // Highlighted/important actions get special treatment
                    const highlightedActions = [
                      'booking.approved', 'booking.rejected', 
                      'admin.approved_user', 'admin.deactivated_user', 
                      'user.deleted', 'auth.failed_login', 'system.error',
                      'admin.sent_invite', 'user.created'
                    ];
                    const isHighlighted = highlightedActions.includes(log.action);
                    
                    // Security-related actions
                    const securityActions = ['auth.failed_login', 'admin.deactivated_user', 'user.deleted'];
                    const isSecurityEvent = securityActions.includes(log.action);
                    
                    // Success actions
                    const successActions = ['booking.approved', 'admin.approved_user', 'user.created', 'admin.sent_invite'];
                    const isSuccessEvent = successActions.includes(log.action);
                    
                    const category = log.action?.split('.')[0] || 'system';
                    
                    return (
                      <div 
                        key={log.id || i} 
                        className={`p-4 flex gap-4 transition-colors ${
                          isSecurityEvent 
                            ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500' 
                            : isSuccessEvent 
                              ? 'bg-green-50 dark:bg-green-900/10 border-l-4 border-green-500'
                              : isHighlighted 
                                ? 'bg-orange-50 dark:bg-orange-900/10 border-l-4 border-orange-500'
                                : ''
                        }`}
                      >
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 ${
                          isSecurityEvent ? 'border-red-500 bg-red-100 dark:bg-red-900/50' :
                          isSuccessEvent ? 'border-green-500 bg-green-100 dark:bg-green-900/50' :
                          actionColors[category] || 'border-gray-500'
                        } ${!isSecurityEvent && !isSuccessEvent ? (theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50') : ''}`}>
                          {actionIcons[log.action] || '📋'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{log.actorDisplayName || log.actorId || 'System'}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                            }`}>
                              {log.action?.replace('.', ' → ') || 'Unknown'}
                            </span>
                          </div>
                          {log.target && (
                            <p className="text-sm text-gray-500 mt-1">
                              Target: {log.target.name || log.target.id || JSON.stringify(log.target)}
                            </p>
                          )}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                                Details
                              </summary>
                              <pre className={`mt-1 p-2 rounded text-xs overflow-x-auto ${
                                theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                              }`}>
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 flex-shrink-0">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Transparency Note */}
            <div className={`p-4 rounded-lg border-2 border-dashed ${
              theme === 'dark' ? 'border-blue-500/50 bg-blue-900/20' : 'border-blue-300 bg-blue-50'
            }`}>
              <div className="flex items-start gap-3">
                <Shield className="text-blue-500 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="font-semibold text-blue-700 dark:text-blue-300">Transparency & Accountability</h3>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    Your view of this log has been recorded. This recursive logging ensures no action 
                    goes untracked, embodying our commitment to transparent governance (OXYGEN layer).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Certifications View */}
        {view === 'certifications' && (user.role === 'admin' || user.role === 'superadmin') && (
          <CertificationManagement
            token={getTokens().authToken}
            user={user}
            theme={theme}
            showMessage={(text, type) => {
              setMessage({ text, type: type || 'success' });
              setTimeout(() => setMessage(null), 3000);
            }}
          />
        )}

        {/* Resources View */}
        {view === 'resources' && (user.role === 'admin' || user.role === 'superadmin') && (
          <ResourceManagement
            token={getTokens().authToken}
            user={user}
            theme={theme}
            showMessage={(text, type) => {
              setMessage({ text, type: type || 'success' });
              setTimeout(() => setMessage(null), 3000);
            }}
          />
        )}

        {/* Issues View */}
        {view === 'issues' && (user.role === 'admin' || user.role === 'superadmin') && (
          <IssueDashboard
            token={getTokens().authToken}
            user={user}
            theme={theme}
            showMessage={(text, type) => {
              setMessage({ text, type: type || 'success' });
              setTimeout(() => setMessage(null), 3000);
            }}
          />
        )}
        
        {/* Template Generator View */}
        {view === 'template-generator' && (user.role === 'admin' || user.role === 'superadmin') && (
          <TemplateGenerator
            token={getTokens().authToken}
            theme={theme}
            showMessage={(text, type) => {
              setMessage({ text, type: type || 'success' });
              setTimeout(() => setMessage(null), 3000);
            }}
          />
        )}
        
        {/* Integrations Health Dashboard */}
        {view === 'integrations' && (user.role === 'admin' || user.role === 'superadmin') && (
          <div className="space-y-6">
            <div className={`rounded-lg shadow p-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Zap size={24} /> Integration Health Dashboard
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Monitor external service connections and scheduled jobs
                  </p>
                </div>
                <button
                  onClick={loadIntegrationHealth}
                  disabled={integrationHealthLoading}
                  className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                >
                  {integrationHealthLoading ? 'Loading...' : '🔄 Refresh'}
                </button>
              </div>
              
              {integrationHealthLoading && !integrationHealth ? (
                <div className="text-center py-8">
                  <div className="animate-spin inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
                  <p className="mt-2 text-gray-500">Loading integration status...</p>
                </div>
              ) : integrationHealth ? (
                <div className="space-y-6">
                  {/* Overall Status */}
                  <div className={`p-4 rounded-lg ${
                    integrationHealth.overallStatus === 'healthy' ? 'bg-green-100 dark:bg-green-900/30' :
                    integrationHealth.overallStatus === 'degraded' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                    integrationHealth.overallStatus === 'unhealthy' ? 'bg-red-100 dark:bg-red-900/30' :
                    'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {integrationHealth.overallStatus === 'healthy' ? '✅' :
                         integrationHealth.overallStatus === 'degraded' ? '⚠️' :
                         integrationHealth.overallStatus === 'unhealthy' ? '❌' : 'ℹ️'}
                      </span>
                      <span className="font-semibold capitalize">
                        System Status: {integrationHealth.overallStatus.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm mt-1 opacity-75">
                      Last checked: {new Date(integrationHealth.timestamp).toLocaleString()}
                    </p>
                  </div>
                  
                  {/* Integrations Grid */}
                  <div>
                    <h3 className="font-semibold mb-3">External Integrations</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {Object.entries(integrationHealth.integrations).map(([key, integration]) => (
                        <div key={key} className={`p-4 rounded-lg border ${
                          theme === 'dark' ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'
                        }`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {key === 'email' ? '📧' : key === 'slack' ? '💬' : key === 'github' ? '🐙' : '📅'}
                              </span>
                              <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              !integration.enabled ? 'bg-gray-200 dark:bg-gray-600' :
                              integration.status === 'healthy' ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200' :
                              integration.status === 'degraded' ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200' :
                              integration.status === 'unhealthy' ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200' :
                              'bg-gray-200 dark:bg-gray-600'
                            }`}>
                              {!integration.enabled ? 'Disabled' : integration.status || 'Unknown'}
                            </span>
                          </div>
                          
                          {integration.enabled && (
                            <>
                              <div className="text-sm space-y-1 mb-3">
                                {integration.lastSuccess && (
                                  <p className="text-green-600 dark:text-green-400">
                                    ✓ Last success: {new Date(integration.lastSuccess).toLocaleString()}
                                  </p>
                                )}
                                {integration.lastFailure && (
                                  <p className="text-red-600 dark:text-red-400">
                                    ✗ Last failure: {new Date(integration.lastFailure).toLocaleString()}
                                    {integration.lastError && <span className="block text-xs opacity-75">{integration.lastError}</span>}
                                  </p>
                                )}
                                {integration.failureCount > 0 && (
                                  <p className="text-orange-600 dark:text-orange-400">
                                    ⚠ Failure count: {integration.failureCount}
                                  </p>
                                )}
                              </div>
                              
                              {/* Config Summary */}
                              <div className={`text-xs p-2 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
                                {Object.entries(integration.config || {}).map(([k, v]) => (
                                  <div key={k} className="flex justify-between">
                                    <span className="opacity-60">{k}:</span>
                                    <span className={v?.startsWith('✓') ? 'text-green-600' : v?.startsWith('✗') ? 'text-red-600' : ''}>
                                      {v}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Test Button */}
                              {(key === 'email' || key === 'slack') && (
                                <button
                                  onClick={() => testIntegration(key)}
                                  disabled={testingIntegration === key}
                                  className="mt-3 w-full px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                >
                                  {testingIntegration === key ? 'Testing...' : `🧪 Test ${key}`}
                                </button>
                              )}
                            </>
                          )}
                          
                          {!integration.enabled && (
                            <p className="text-sm text-gray-500">
                              Enable in infrastructure config to use this integration
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Auth Providers */}
                  <div>
                    <h3 className="font-semibold mb-3">Authentication Providers</h3>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(integrationHealth.authProviders || {}).map(([key, provider]) => (
                        <div key={key} className={`px-4 py-2 rounded-lg border ${
                          provider.enabled 
                            ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          <span className="font-medium capitalize">{key}</span>
                          <span className="ml-2 text-sm">
                            {provider.enabled ? '✓ Enabled' : '○ Disabled'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Scheduled Jobs */}
                  <div>
                    <h3 className="font-semibold mb-3">Scheduled Jobs</h3>
                    <div className="space-y-2">
                      {Object.entries(integrationHealth.scheduledJobs || {}).map(([key, job]) => (
                        <div key={key} className={`p-3 rounded-lg border ${
                          theme === 'dark' ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'
                        }`}>
                          <div className="flex justify-between">
                            <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                            <span className={`text-sm ${job.enabled ? 'text-green-600' : 'text-gray-500'}`}>
                              {job.enabled ? '✓ Active' : '○ Inactive'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">{job.schedule}</p>
                          <p className="text-xs text-gray-400">{job.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Zap size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Click Refresh to load integration status</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Notification Preferences Modal */}
      <Modal isOpen={notificationPrefsOpen} onClose={() => setNotificationPrefsOpen(false)} title="🔔 Notification Preferences" size="lg">
        <NotificationPreferences
          token={getTokens().authToken}
          user={user}
          theme={theme}
          showMessage={(text, type) => {
            setMessage({ text, type: type || 'success' });
            setTimeout(() => setMessage(null), 3000);
          }}
          onClose={() => setNotificationPrefsOpen(false)}
        />
      </Modal>
      
      {/* Edit Booking Modal */}
      <EditBookingModal
        isOpen={editBookingModalOpen}
        onClose={() => { setEditBookingModalOpen(false); setEditingBooking(null); }}
        booking={editingBooking}
        onSave={handleEditBooking}
        tools={TOOLS}
      />
      
      {/* Multi-Select Calendar */}
      {multiSelectCalendarOpen && (
        <MultiSelectCalendar
          token={token}
          user={user}
          tools={TOOLS}
          theme={theme}
          showMessage={showMessage}
          onClose={() => setMultiSelectCalendarOpen(false)}
          onBookingsCreated={() => {
            loadBookings();
            setMultiSelectCalendarOpen(false);
          }}
        />
      )}
      
      {/* Overlap Warning Dialog */}
      <OverlapWarningDialog
        isOpen={!!overlapWarning}
        onClose={() => setOverlapWarning(null)}
        onConfirm={() => {
          setOverlapWarning(null);
          handleCreateBooking(true); // Confirm overlap
        }}
        overlapData={overlapWarning}
      />

      {/* Footer */}
      <footer className={`mt-8 p-4 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
        <div className="flex items-center justify-center gap-4">
          <span>🔥 SDCoLab Scheduler v4.2.0-rc69.11</span>
          <span>•</span>
          <a href="/help" className="hover:text-orange-500">Documentation</a>
          <span>•</span>
          <a href="/tools" className="hover:text-orange-500">Equipment Catalog</a>
          <span>•</span>
          <a href="https://github.com/middog/colab-scheduler" className="hover:text-orange-500">GitHub</a>
        </div>
      </footer>
    </div>
  );
};

// =============================================================================
// Export with Theme Provider
// =============================================================================

export default function ColabScheduler() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}
