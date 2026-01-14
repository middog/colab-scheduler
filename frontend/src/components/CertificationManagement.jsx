import React, { useState, useEffect, useCallback } from 'react';
import { 
  Shield, ShieldCheck, ShieldAlert, Plus, Edit, Trash2, 
  Award, Clock, Users, ChevronDown, ChevronRight, Search,
  CheckCircle, XCircle, AlertTriangle, RefreshCw, UserPlus
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * Certification Management Admin Panel
 * 
 * Features:
 * - List/create/edit certification types
 * - View expiring certifications
 * - Grant certifications to users
 * - Revoke certifications
 * 
 * 🔥 Fire Triangle: OXYGEN layer - qualification governance
 * 
 * @version 4.2.0-rc69.6
 */

// Modal wrapper component
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
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

const CertificationManagement = ({ token, user, theme, showMessage }) => {
  // State
  const [certTypes, setCertTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('types'); // types, expiring, grant
  
  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingCertType, setEditingCertType] = useState(null);
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  
  // Expiring certs
  const [expiringCerts, setExpiringCerts] = useState([]);
  const [expiringDays, setExpiringDays] = useState(30);
  
  // Grant state
  const [grantEmail, setGrantEmail] = useState('');
  const [grantCertType, setGrantCertType] = useState('');
  const [grantNotes, setGrantNotes] = useState('');
  const [grantBypass, setGrantBypass] = useState(false);

  // api() from lib/api.js auto-unwraps standardized responses

  // Load cert types
  const loadCertTypes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api('/certifications/types');
      setCertTypes(data.certificationTypes || []);
    } catch (err) {
      console.error('Failed to load certification types:', err);
      setError(err.message || 'Failed to load certification types');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load expiring certs
  const loadExpiringCerts = useCallback(async () => {
    try {
      const data = await api(`/certifications/expiring?days=${expiringDays}`);
      setExpiringCerts(data.expiring || []);
    } catch (err) {
      console.error('Failed to load expiring certs:', err);
    }
  }, [expiringDays]);

  useEffect(() => {
    loadCertTypes();
  }, [loadCertTypes]);

  useEffect(() => {
    if (activeTab === 'expiring') {
      loadExpiringCerts();
    }
  }, [activeTab, loadExpiringCerts]);

  // Create/Update cert type
  const handleSaveCertType = async (formData) => {
    try {
      if (editingCertType) {
        await api(`/certifications/types/${editingCertType.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        showMessage('Certification type updated');
      } else {
        await api('/certifications/types', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        showMessage('Certification type created');
      }
      setCreateModalOpen(false);
      setEditingCertType(null);
      loadCertTypes();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  // Delete cert type
  const handleDeleteCertType = async (id) => {
    if (!confirm('Are you sure you want to deactivate this certification type?')) return;
    try {
      await api(`/certifications/types/${id}`, { method: 'DELETE' });
      showMessage('Certification type deactivated');
      loadCertTypes();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  // Grant certification
  const handleGrantCert = async () => {
    if (!grantEmail || !grantCertType) {
      showMessage('Email and certification type are required', 'error');
      return;
    }
    try {
      await api('/certifications/grant', {
        method: 'POST',
        body: JSON.stringify({
          userEmail: grantEmail,
          certTypeId: grantCertType,
          notes: grantNotes,
          bypassPrerequisites: grantBypass
        })
      });
      showMessage('Certification granted successfully');
      setGrantModalOpen(false);
      setGrantEmail('');
      setGrantCertType('');
      setGrantNotes('');
      setGrantBypass(false);
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Award className="text-purple-500" /> Certification Management
            </h2>
            <p className="text-sm text-gray-500 mt-1">Define, grant, and track certifications</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingCertType(null); setCreateModalOpen(true); }}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-2"
            >
              <Plus size={18} /> New Cert Type
            </button>
            <button
              onClick={() => setGrantModalOpen(true)}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-2"
            >
              <UserPlus size={18} /> Grant Cert
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={`rounded-lg shadow ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'types', label: 'Cert Types', icon: Shield },
            { id: 'expiring', label: 'Expiring Soon', icon: AlertTriangle },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-500'
                  : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
              {tab.id === 'expiring' && expiringCerts.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                  {expiringCerts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Cert Types Tab */}
        {activeTab === 'types' && (
          <div className="p-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <AlertTriangle size={48} className="mx-auto mb-4 text-red-500 opacity-75" />
                <p className="text-red-500 font-medium mb-2">Failed to load certification types</p>
                <p className="text-gray-500 text-sm mb-4">{error}</p>
                <button
                  onClick={loadCertTypes}
                  className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 inline-flex items-center gap-2"
                >
                  <RefreshCw size={16} /> Try Again
                </button>
              </div>
            ) : certTypes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Shield size={48} className="mx-auto mb-4 opacity-50" />
                <p>No certification types defined yet</p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-4 text-purple-500 hover:underline"
                >
                  Create your first certification type
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {certTypes.map(cert => (
                  <div
                    key={cert.id}
                    className={`p-4 rounded-lg border ${
                      isDark ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'
                    } ${!cert.isActive ? 'opacity-50' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className={`${
                          cert.level === 'instructor' ? 'text-purple-500' :
                          cert.level === 'advanced' ? 'text-blue-500' : 'text-green-500'
                        }`} size={20} />
                        <h3 className="font-bold">{cert.name}</h3>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        cert.level === 'instructor' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                        cert.level === 'advanced' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      }`}>
                        {cert.level}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{cert.description}</p>
                    
                    <div className="space-y-1 text-xs text-gray-500 mb-3">
                      {cert.expiryMonths && (
                        <div className="flex items-center gap-1">
                          <Clock size={12} /> Expires in {cert.expiryMonths} months
                        </div>
                      )}
                      {cert.prerequisites?.length > 0 && (
                        <div className="flex items-center gap-1">
                          <ChevronRight size={12} /> {cert.prerequisites.length} prerequisite(s)
                        </div>
                      )}
                      {cert.requiresResources?.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Shield size={12} /> Grants access to {cert.requiresResources.length} resource(s)
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingCertType(cert); setCreateModalOpen(true); }}
                        className="flex-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-1"
                      >
                        <Edit size={14} /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCertType(cert.id)}
                        className="px-3 py-1.5 text-sm border border-red-300 text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Expiring Tab */}
        {activeTab === 'expiring' && (
          <div className="p-4">
            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm">Show expiring within:</label>
              <select
                value={expiringDays}
                onChange={(e) => setExpiringDays(parseInt(e.target.value))}
                className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
              >
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </select>
              <button
                onClick={loadExpiringCerts}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {expiringCerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
                <p>No certifications expiring in the next {expiringDays} days</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`text-left ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <th className="p-3">User</th>
                      <th className="p-3">Certification</th>
                      <th className="p-3">Expires</th>
                      <th className="p-3">Days Left</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringCerts.map(cert => (
                      <tr key={cert.id} className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <td className="p-3">{cert.userId}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-purple-500" />
                            {cert.certTypeName}
                          </div>
                        </td>
                        <td className="p-3 text-sm text-gray-500">
                          {new Date(cert.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            cert.daysUntilExpiry <= 7 ? 'bg-red-100 text-red-700' :
                            cert.daysUntilExpiry <= 14 ? 'bg-orange-100 text-orange-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {cert.daysUntilExpiry} days
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              setGrantEmail(cert.userId);
                              setGrantCertType(cert.certTypeId);
                              setGrantModalOpen(true);
                            }}
                            className="text-sm text-purple-500 hover:underline"
                          >
                            Renew
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Cert Type Modal */}
      <CertTypeModal
        isOpen={createModalOpen}
        onClose={() => { setCreateModalOpen(false); setEditingCertType(null); }}
        onSave={handleSaveCertType}
        certType={editingCertType}
        existingTypes={certTypes}
        theme={theme}
      />

      {/* Grant Certification Modal */}
      <Modal
        isOpen={grantModalOpen}
        onClose={() => setGrantModalOpen(false)}
        title="🎓 Grant Certification"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">User Email *</label>
            <input
              type="email"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="user@example.com"
              className={`w-full p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Certification Type *</label>
            <select
              value={grantCertType}
              onChange={(e) => setGrantCertType(e.target.value)}
              className={`w-full p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
            >
              <option value="">Select certification...</option>
              {certTypes.filter(c => c.isActive).map(cert => (
                <option key={cert.id} value={cert.id}>
                  {cert.name} ({cert.level})
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Notes (optional)</label>
            <textarea
              value={grantNotes}
              onChange={(e) => setGrantNotes(e.target.value)}
              placeholder="Training date, instructor name, etc."
              rows={2}
              className={`w-full p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}
            />
          </div>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={grantBypass}
              onChange={(e) => setGrantBypass(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Bypass prerequisite requirements (admin only)</span>
          </label>
          
          <button
            onClick={handleGrantCert}
            disabled={!grantEmail || !grantCertType}
            className="w-full py-3 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Award size={18} /> Grant Certification
          </button>
        </div>
      </Modal>
    </div>
  );
};

// Cert Type Create/Edit Modal
const CertTypeModal = ({ isOpen, onClose, onSave, certType, existingTypes, theme }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'general',
    level: 'basic',
    expiryMonths: '',
    prerequisites: [],
    requiresResources: [],
    trainingRequired: false,
    trainingContent: '',
    grantableBy: ['admin']
  });

  useEffect(() => {
    if (certType) {
      setFormData({
        name: certType.name || '',
        description: certType.description || '',
        category: certType.category || 'general',
        level: certType.level || 'basic',
        expiryMonths: certType.expiryMonths || '',
        prerequisites: certType.prerequisites || [],
        requiresResources: certType.requiresResources || [],
        trainingRequired: certType.trainingRequired || false,
        trainingContent: certType.trainingContent || '',
        grantableBy: certType.grantableBy || ['admin']
      });
    } else {
      setFormData({
        name: '',
        description: '',
        category: 'general',
        level: 'basic',
        expiryMonths: '',
        prerequisites: [],
        requiresResources: [],
        trainingRequired: false,
        trainingContent: '',
        grantableBy: ['admin']
      });
    }
  }, [certType, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      expiryMonths: formData.expiryMonths ? parseInt(formData.expiryMonths) : null
    });
  };

  const isDark = theme === 'dark';
  const inputClass = `w-full p-3 rounded border ${isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`;

  const availableTools = [
    'laser', '3dprinter', 'cnc', 'solder', 'sewing-standard', 'sewing-industrial', 'woodshop'
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={certType ? '✏️ Edit Certification Type' : '➕ New Certification Type'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Laser Cutter Safety"
              required
              className={inputClass}
            />
          </div>
          
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What this certification covers..."
              rows={2}
              className={inputClass}
            />
          </div>
          
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
              <option value="safety">Safety</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Level</label>
            <select
              value={formData.level}
              onChange={(e) => setFormData({ ...formData, level: e.target.value })}
              className={inputClass}
            >
              <option value="basic">Basic</option>
              <option value="advanced">Advanced</option>
              <option value="instructor">Instructor</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Expires After (months)</label>
            <input
              type="number"
              value={formData.expiryMonths}
              onChange={(e) => setFormData({ ...formData, expiryMonths: e.target.value })}
              placeholder="Leave blank for no expiry"
              min="1"
              className={inputClass}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Who Can Grant</label>
            <div className="flex gap-4 mt-2">
              {['admin', 'steward', 'instructor'].map(role => (
                <label key={role} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={formData.grantableBy.includes(role)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, grantableBy: [...formData.grantableBy, role] });
                      } else {
                        setFormData({ ...formData, grantableBy: formData.grantableBy.filter(r => r !== role) });
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm capitalize">{role}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Prerequisites</label>
            <div className="flex flex-wrap gap-2">
              {existingTypes.filter(c => c.id !== certType?.id && c.isActive).map(cert => (
                <label
                  key={cert.id}
                  className={`flex items-center gap-1 px-3 py-1 rounded border cursor-pointer ${
                    formData.prerequisites.includes(cert.id)
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                      : isDark ? 'border-gray-600' : 'border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.prerequisites.includes(cert.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, prerequisites: [...formData.prerequisites, cert.id] });
                      } else {
                        setFormData({ ...formData, prerequisites: formData.prerequisites.filter(p => p !== cert.id) });
                      }
                    }}
                    className="sr-only"
                  />
                  <span className="text-sm">{cert.name}</span>
                </label>
              ))}
              {existingTypes.filter(c => c.id !== certType?.id && c.isActive).length === 0 && (
                <span className="text-sm text-gray-500">No other cert types available</span>
              )}
            </div>
          </div>
          
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Grants Access To (Tools)</label>
            <div className="flex flex-wrap gap-2">
              {availableTools.map(tool => (
                <label
                  key={tool}
                  className={`flex items-center gap-1 px-3 py-1 rounded border cursor-pointer ${
                    formData.requiresResources.includes(tool)
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                      : isDark ? 'border-gray-600' : 'border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.requiresResources.includes(tool)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, requiresResources: [...formData.requiresResources, tool] });
                      } else {
                        setFormData({ ...formData, requiresResources: formData.requiresResources.filter(r => r !== tool) });
                      }
                    }}
                    className="sr-only"
                  />
                  <span className="text-sm">{tool}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.trainingRequired}
                onChange={(e) => setFormData({ ...formData, trainingRequired: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Training required before certification</span>
            </label>
            {formData.trainingRequired && (
              <input
                type="url"
                value={formData.trainingContent}
                onChange={(e) => setFormData({ ...formData, trainingContent: e.target.value })}
                placeholder="Training content URL (optional)"
                className={`mt-2 ${inputClass}`}
              />
            )}
          </div>
        </div>
        
        <div className="flex gap-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-3 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            {certType ? 'Update' : 'Create'} Certification Type
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CertificationManagement;
