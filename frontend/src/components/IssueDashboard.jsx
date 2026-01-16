import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, AlertCircle, CheckCircle, XCircle,
  ExternalLink, RefreshCw, Search, Filter, MessageSquare,
  Clock, User, Wrench, Github, Plus, ArrowLeft, FileText,
  Tag, Flame, AlertOctagon, Eye
} from 'lucide-react';
import { api } from '../lib/api.js';
import TemplateForm, { validateTemplateForm, buildIssueBody } from './TemplateForm.jsx';
import IssueDetail from './IssueDetail.jsx';

/**
 * Issue Dashboard - GitHub-Native Implementation
 * 
 * Features:
 * - View issues from GitHub (with DynamoDB caching)
 * - Create issues using GitHub templates
 * - Filter by status, severity, Fire Triangle element
 * - Direct GitHub integration with optimistic conflict resolution
 * 
 * 🔥 Fire Triangle: FUEL layer - resource maintenance tracking
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
        <div className={`relative w-full ${sizes[size]} rounded-xl shadow-2xl bg-white dark:bg-gray-800 dark:text-white max-h-[90vh] overflow-hidden flex flex-col`}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h2 className="text-xl font-bold">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">✕</button>
          </div>
          <div className="p-4 overflow-y-auto flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
};

const IssueDashboard = ({ token, user, theme, showMessage }) => {
  // Issues state
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [isStale, setIsStale] = useState(false);
  
  // Filter state
  const [stateFilter, setStateFilter] = useState('open');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [fireFilter, setFireFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // GitHub integration state
  const [githubStatus, setGithubStatus] = useState({ enabled: false, configured: false });
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  
  // View state
  const [selectedIssueNumber, setSelectedIssueNumber] = useState(null);
  
  // Create issue modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [issueTitle, setIssueTitle] = useState('');
  const [creating, setCreating] = useState(false);
  
  const isDark = theme === 'dark';
  
  // Check GitHub status on mount
  useEffect(() => {
    let cancelled = false;
    const checkGitHub = async () => {
      try {
        const status = await api('/github/status');
        if (!cancelled) {
          setGithubStatus(status);
        }
      } catch (err) {
        if (!cancelled) {
          setGithubStatus({ enabled: false, configured: false, error: err.message });
        }
      }
    };
    checkGitHub();
    return () => { cancelled = true; };
  }, []);
  
  // Load issues (from GitHub with caching)
  const loadIssues = useCallback(async (force = false) => {
    // Don't load if GitHub status hasn't been checked yet
    if (githubStatus.enabled === undefined) return;
    
    if (!githubStatus.enabled || !githubStatus.configured) {
      // GitHub not enabled/configured - show empty state, don't call API
      setIssues([]);
      setLoading(false);
      setIsStale(false);
      return;
    }
    
    try {
      setLoading(true);
      const params = new URLSearchParams({ state: stateFilter });
      if (force) params.append('force', 'true');
      
      const data = await api(`/github/issues?${params}`);
      setIssues(data.issues || []);
      setIsStale(data.stale || false);
      setLastSynced(new Date().toISOString());
      
      if (data.warning) {
        showMessage?.(data.warning, 'warning');
      }
    } catch (err) {
      // Don't spam error messages on 429
      if (!err.message?.includes('429')) {
        showMessage?.('Failed to load issues', 'error');
      }
      console.error('Failed to load issues:', err);
    } finally {
      setLoading(false);
    }
  }, [githubStatus.enabled, githubStatus.configured, stateFilter, showMessage]);
  
  // Load templates
  const loadTemplates = useCallback(async () => {
    if (!githubStatus.enabled || !githubStatus.configured) return;
    
    try {
      setTemplatesLoading(true);
      const data = await api('/github/templates');
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setTemplatesLoading(false);
    }
  }, [githubStatus.enabled, githubStatus.configured]);
  
  // Load data when GitHub status is determined
  useEffect(() => {
    // Only load once we know GitHub status AND it's properly configured
    if (githubStatus.enabled === undefined) return;
    
    // Load issues (will handle enabled/configured check internally)
    loadIssues();
    
    // Only load templates if GitHub is properly configured
    if (githubStatus.enabled && githubStatus.configured) {
      loadTemplates();
    }
  }, [githubStatus.enabled, githubStatus.configured]); // Don't include loadIssues/loadTemplates to avoid loops
  
  // Reload when filter changes (only if GitHub is enabled)
  useEffect(() => {
    if (githubStatus.enabled && githubStatus.configured) {
      loadIssues();
    }
  }, [stateFilter]); // Only re-fetch when filter changes
  
  // Force sync
  const handleForceSync = async () => {
    if (!githubStatus.enabled) return;
    
    try {
      setSyncing(true);
      await api('/github/issues/sync', { method: 'POST' });
      await loadIssues(true);
      showMessage?.('Issues synced from GitHub');
    } catch (err) {
      showMessage?.('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };
  
  // Create issue
  const handleCreateIssue = async () => {
    if (!selectedTemplate) return;
    
    // Validate form
    const errors = validateTemplateForm(selectedTemplate, formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      showMessage?.('Please fill in all required fields', 'error');
      return;
    }
    
    // Build issue body from template
    const body = buildIssueBody(selectedTemplate, formValues);
    const title = issueTitle || selectedTemplate.title?.replace('[', '').replace(']:', ':') || 'New Issue';
    
    try {
      setCreating(true);
      const data = await api('/github/issues', {
        method: 'POST',
        body: JSON.stringify({
          title,
          body,
          labels: selectedTemplate.labels || [],
          template: selectedTemplate.filename?.replace('.yml', '')
        })
      });
      
      showMessage?.(`Issue #${data.issue.githubNumber} created`);
      setCreateModalOpen(false);
      setSelectedTemplate(null);
      setFormValues({});
      setFormErrors({});
      setIssueTitle('');
      loadIssues(true);
    } catch (err) {
      showMessage?.('Failed to create issue', 'error');
    } finally {
      setCreating(false);
    }
  };
  
  // Filter issues
  const filteredIssues = issues.filter(issue => {
    const matchesStatus = !statusFilter || issue.status === statusFilter;
    const matchesSeverity = !severityFilter || issue.severity === severityFilter;
    const matchesFire = !fireFilter || issue.fireElement === fireFilter;
    const matchesSearch = !searchTerm || 
      issue.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.resourceName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.bodyPreview?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSeverity && matchesFire && matchesSearch;
  });
  
  // Badge helpers
  const getSeverityBadge = (severity) => {
    const styles = {
      critical: 'bg-red-500 text-white',
      high: 'bg-orange-500 text-white',
      medium: 'bg-yellow-500 text-black',
      low: 'bg-green-500 text-white'
    };
    const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[severity] || styles.medium}`}>
        {icons[severity] || '🟡'} {severity}
      </span>
    );
  };
  
  const getStatusBadge = (status, state) => {
    const styles = {
      'new': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      'triaged': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
      'in-progress': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
      'resolved': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      'wont-fix': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      'open': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      'closed': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
    };
    const displayStatus = status || state || 'open';
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[displayStatus] || styles.open}`}>
        {displayStatus}
      </span>
    );
  };
  
  const getFireBadge = (element) => {
    const styles = {
      'fuel': 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
      'oxygen': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
      'heat': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    };
    const icons = { 'fuel': '🔥', 'oxygen': '💨', 'heat': '🌡️' };
    if (!element) return null;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[element] || styles.fuel}`}>
        {icons[element] || '🔥'} {element}
      </span>
    );
  };
  
  // If viewing a specific issue
  if (selectedIssueNumber) {
    return (
      <IssueDetail
        issueNumber={selectedIssueNumber}
        onBack={() => { setSelectedIssueNumber(null); loadIssues(); }}
        token={token}
        user={user}
        theme={theme}
        showMessage={showMessage}
      />
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <AlertTriangle className="text-yellow-500" /> Issue Dashboard
              {githubStatus.enabled && (
                <Github size={18} className="text-gray-400" title="GitHub-native" />
              )}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {githubStatus.enabled 
                ? `Synced from ${githubStatus.org}/${githubStatus.repo}`
                : 'Track and resolve equipment issues'
              }
            </p>
            {isStale && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1 mt-1">
                <AlertCircle size={14} /> Showing cached data
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {githubStatus.enabled && (
              <button
                onClick={handleForceSync}
                disabled={syncing}
                className={`px-4 py-2 rounded flex items-center gap-2 ${
                  isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                } disabled:opacity-50`}
              >
                <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            )}
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 bg-red-500 text-white rounded flex items-center gap-2 hover:bg-red-600"
            >
              <Plus size={18} /> Report Issue
            </button>
          </div>
        </div>
      </div>
      
      {/* GitHub not configured warning */}
      {!githubStatus.enabled && (
        <div className={`rounded-lg p-4 ${isDark ? 'bg-yellow-900/30' : 'bg-yellow-50'} border border-yellow-500/30`}>
          <div className="flex items-start gap-3">
            <AlertOctagon className="text-yellow-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-semibold text-yellow-700 dark:text-yellow-300">GitHub Integration Not Configured</h3>
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                Issue templates require GitHub integration. Set <code className="px-1 py-0.5 rounded bg-yellow-200/50 dark:bg-yellow-900/50">ENABLE_GITHUB=true</code> and configure <code className="px-1 py-0.5 rounded bg-yellow-200/50 dark:bg-yellow-900/50">GITHUB_TOKEN</code> to enable.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Filters */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search issues..."
              className={`w-full pl-10 pr-4 py-2 rounded border ${
                isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
              }`}
            />
          </div>
          
          {/* State filter */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className={`px-4 py-2 rounded border ${
              isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
          
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-4 py-2 rounded border ${
              isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          >
            <option value="">All Status</option>
            <option value="new">🆕 New</option>
            <option value="triaged">📋 Triaged</option>
            <option value="in-progress">🔧 In Progress</option>
            <option value="resolved">✅ Resolved</option>
          </select>
          
          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className={`px-4 py-2 rounded border ${
              isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          >
            <option value="">All Severity</option>
            <option value="critical">🔴 Critical</option>
            <option value="high">🟠 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
          
          {/* Fire Triangle filter */}
          <select
            value={fireFilter}
            onChange={(e) => setFireFilter(e.target.value)}
            className={`px-4 py-2 rounded border ${
              isDark ? 'bg-gray-700 border-gray-600' : 'border-gray-300'
            }`}
          >
            <option value="">🔥 All Elements</option>
            <option value="fuel">🔥 Fuel</option>
            <option value="oxygen">💨 Oxygen</option>
            <option value="heat">🌡️ Heat</option>
          </select>
        </div>
      </div>
      
      {/* Issues List */}
      <div className={`rounded-lg shadow ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="animate-spin mx-auto mb-4 text-blue-500" size={32} />
            <p>Loading issues...</p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="mx-auto mb-4 text-green-500" size={48} />
            <p className="text-lg font-medium">No issues found</p>
            <p className="text-gray-500 mt-1">
              {stateFilter === 'open' ? 'All clear! No open issues.' : 'No issues match your filters.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredIssues.map(issue => (
              <div
                key={issue.id || issue.githubNumber}
                className={`p-4 hover:${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} cursor-pointer transition-colors`}
                onClick={() => issue.githubNumber && setSelectedIssueNumber(issue.githubNumber)}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {issue.githubNumber && (
                        <span className="text-xs text-gray-500">#{issue.githubNumber}</span>
                      )}
                      {getStatusBadge(issue.status, issue.state)}
                      {issue.severity && getSeverityBadge(issue.severity)}
                      {getFireBadge(issue.fireElement)}
                      {issue.template && (
                        <span className={`px-2 py-1 rounded text-xs ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                          📄 {issue.template}
                        </span>
                      )}
                    </div>
                    
                    <h3 className="font-bold text-lg">{issue.title}</h3>
                    
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                      {(issue.resourceName || issue.resource) && (
                        <span className="flex items-center gap-1">
                          <Wrench size={14} /> {issue.resourceName || issue.resource}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <User size={14} /> {issue.createdBy || issue.reportedBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} /> {new Date(issue.createdAt || issue.reportedAt).toLocaleDateString()}
                      </span>
                      {issue.commentsCount > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare size={14} /> {issue.commentsCount}
                        </span>
                      )}
                    </div>
                    
                    {issue.bodyPreview && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {issue.bodyPreview}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex flex-row md:flex-col gap-2">
                    {issue.githubUrl && (
                      <a
                        href={issue.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 border rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-1"
                      >
                        <ExternalLink size={14} /> GitHub
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        issue.githubNumber && setSelectedIssueNumber(issue.githubNumber);
                      }}
                      className="px-3 py-1.5 border rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-1"
                    >
                      <Eye size={14} /> View
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Create Issue Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setSelectedTemplate(null);
          setFormValues({});
          setFormErrors({});
          setIssueTitle('');
        }}
        title={selectedTemplate ? `📝 ${selectedTemplate.name}` : '🐛 Report an Issue'}
        size="lg"
      >
        {!selectedTemplate ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Select the type of issue you want to report:</p>
            
            {templatesLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                <p className="text-gray-500">Loading templates...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'} text-center`}>
                <FileText className="mx-auto mb-2 text-gray-400" size={32} />
                <p className="text-gray-500">No issue templates found</p>
                <p className="text-sm text-gray-400 mt-1">
                  {githubStatus.enabled 
                    ? "Create templates in your GitHub repo's .github/ISSUE_TEMPLATE/ folder"
                    : "Enable GitHub integration to use issue templates"
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template, index) => {
                  const fireLabel = template.labels?.find(l => l.startsWith('fire:'))?.replace('fire:', '');
                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedTemplate(template)}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        isDark 
                          ? 'border-gray-600 hover:border-blue-500 hover:bg-gray-700' 
                          : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{template.name}</h3>
                          <p className="text-sm text-gray-500">{template.description}</p>
                        </div>
                        {fireLabel && getFireBadge(fireLabel)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            
            {githubStatus.enabled && (
              <div className={`p-3 rounded-lg ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'} text-sm`}>
                <Github size={16} className="inline mr-2" />
                Issues will be created in GitHub and synced back to the scheduler.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => {
                setSelectedTemplate(null);
                setFormValues({});
                setFormErrors({});
              }}
              className="flex items-center gap-1 text-sm text-blue-500 hover:underline"
            >
              <ArrowLeft size={14} /> Back to templates
            </button>
            
            {/* Issue title */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Issue Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder={selectedTemplate.title || 'Enter a descriptive title'}
                className={`w-full p-3 rounded-lg border ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 focus:border-blue-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              />
            </div>
            
            {/* Template form */}
            <TemplateForm
              template={selectedTemplate}
              values={formValues}
              onChange={setFormValues}
              theme={theme}
              errors={formErrors}
            />
            
            {/* Labels preview */}
            {selectedTemplate.labels?.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">Labels (auto-applied)</label>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate.labels.map((label, i) => (
                    <span 
                      key={i} 
                      className={`px-2 py-1 rounded text-xs ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Submit buttons */}
            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setCreateModalOpen(false);
                  setSelectedTemplate(null);
                  setFormValues({});
                  setFormErrors({});
                  setIssueTitle('');
                }}
                className="flex-1 py-3 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIssue}
                disabled={creating || !issueTitle.trim()}
                className="flex-1 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating && <RefreshCw className="animate-spin" size={16} />}
                Create Issue
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default IssueDashboard;
