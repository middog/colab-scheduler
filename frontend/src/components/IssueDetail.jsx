import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ArrowLeft, ExternalLink, MessageSquare, Send, RefreshCw,
  Clock, User, Tag, AlertTriangle, CheckCircle, XCircle,
  Edit3, Trash2, AlertCircle
} from 'lucide-react';
import { api } from '../lib/api.js';

/**
 * IssueDetail - View and interact with a single GitHub issue
 * 
 * Features:
 * - Issue details and comments display
 * - Add comments with draft persistence
 * - Optimistic conflict resolution (detects updates before submit)
 * - Status updates with GitHub sync
 * 
 * 🔥 Fire Triangle: FUEL layer - issue management
 * 
 * @version 4.2.0-rc69.11
 */

const DRAFT_KEY_PREFIX = 'issue-draft-';

const IssueDetail = ({ 
  issueNumber, 
  onBack, 
  token, 
  user, 
  theme = 'light',
  showMessage 
}) => {
  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commenting, setCommenting] = useState(false);
  
  // Draft state
  const [commentDraft, setCommentDraft] = useState('');
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [issueVersion, setIssueVersion] = useState(null);
  const [initialCommentCount, setInitialCommentCount] = useState(0);
  
  // Conflict detection
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictInfo, setConflictInfo] = useState(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  
  // Status update
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  const draftTimerRef = useRef(null);
  const isDark = theme === 'dark';
  
  // Load issue and comments
  const loadIssue = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api(`/github/issues/${issueNumber}`);
      setIssue(data.issue);
      setComments(data.comments || []);
      setIssueVersion(data.issue.updatedAt);
      setInitialCommentCount(data.comments?.length || 0);
      
      // Check for existing draft
      const draftKey = `${DRAFT_KEY_PREFIX}${issueNumber}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          setCommentDraft(draft.content || '');
          setDraftSavedAt(draft.savedAt);
        } catch (e) {
          // Invalid draft, ignore
        }
      }
    } catch (err) {
      showMessage?.('Failed to load issue', 'error');
    } finally {
      setLoading(false);
    }
  }, [issueNumber, showMessage]);
  
  useEffect(() => {
    loadIssue();
  }, [loadIssue]);
  
  // Auto-save draft
  useEffect(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }
    
    if (commentDraft.trim()) {
      draftTimerRef.current = setTimeout(() => {
        const draftKey = `${DRAFT_KEY_PREFIX}${issueNumber}`;
        const draft = {
          content: commentDraft,
          savedAt: new Date().toISOString(),
          issueVersion,
          commentCount: initialCommentCount
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));
        setDraftSavedAt(draft.savedAt);
      }, 5000);
    }
    
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [commentDraft, issueNumber, issueVersion, initialCommentCount]);
  
  // Check for conflicts before submitting
  const checkForConflicts = async () => {
    try {
      const data = await api(
        `/github/issues/${issueNumber}/version?since=${issueVersion}&commentCount=${initialCommentCount}`
      );
      
      if (data.hasUpdates || data.newCommentCount > 0) {
        setConflictInfo(data);
        setHasConflict(true);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  };
  
  // Submit comment
  const handleSubmitComment = async (force = false) => {
    if (!commentDraft.trim()) return;
    
    if (!force) {
      const hasConflicts = await checkForConflicts();
      if (hasConflicts) {
        setShowConflictModal(true);
        return;
      }
    }
    
    try {
      setCommenting(true);
      await api(`/github/issues/${issueNumber}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentDraft })
      });
      
      const draftKey = `${DRAFT_KEY_PREFIX}${issueNumber}`;
      localStorage.removeItem(draftKey);
      setCommentDraft('');
      setDraftSavedAt(null);
      setHasConflict(false);
      setShowConflictModal(false);
      
      await loadIssue();
      showMessage?.('Comment added');
    } catch (err) {
      showMessage?.('Failed to add comment', 'error');
    } finally {
      setCommenting(false);
    }
  };
  
  const handleReviewChanges = async () => {
    setShowConflictModal(false);
    await loadIssue();
    showMessage?.('Issue refreshed. Your draft has been preserved.');
  };
  
  const handleSubmitAnyway = () => {
    handleSubmitComment(true);
  };
  
  const handleStatusChange = async (newStatus) => {
    try {
      setUpdatingStatus(true);
      setShowStatusMenu(false);
      
      const shouldClose = newStatus === 'resolved' || newStatus === 'wont-fix';
      
      await api(`/github/issues/${issueNumber}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          state: shouldClose ? 'closed' : 'open',
          stateReason: newStatus === 'wont-fix' ? 'not_planned' : 'completed'
        })
      });
      
      await loadIssue();
      showMessage?.(`Status updated to ${newStatus}`);
    } catch (err) {
      showMessage?.('Failed to update status', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };
  
  const handleDiscardDraft = () => {
    const draftKey = `${DRAFT_KEY_PREFIX}${issueNumber}`;
    localStorage.removeItem(draftKey);
    setCommentDraft('');
    setDraftSavedAt(null);
  };
  
  const getStatusBadge = (status) => {
    const styles = {
      'new': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      'triaged': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
      'in-progress': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
      'resolved': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      'wont-fix': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    };
    const emojis = { 'new': '🆕', 'triaged': '📋', 'in-progress': '🔧', 'resolved': '✅', 'wont-fix': '🚫' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || styles.new}`}>
        {emojis[status] || '📝'} {status || 'new'}
      </span>
    );
  };
  
  const getFireBadge = (element) => {
    const styles = {
      'fuel': 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
      'oxygen': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
      'heat': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    };
    const emojis = { 'fuel': '🔥', 'oxygen': '💨', 'heat': '🌡️' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[element] || styles.fuel}`}>
        {emojis[element] || '🔥'} {element}
      </span>
    );
  };
  
  const getSeverityBadge = (severity) => {
    const styles = {
      'critical': 'bg-red-500 text-white',
      'high': 'bg-orange-500 text-white',
      'medium': 'bg-yellow-500 text-black',
      'low': 'bg-green-500 text-white'
    };
    const emojis = { 'critical': '🔴', 'high': '🟠', 'medium': '🟡', 'low': '🟢' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[severity] || styles.medium}`}>
        {emojis[severity] || '🟡'} {severity}
      </span>
    );
  };
  
  if (loading) {
    return (
      <div className={`rounded-lg shadow p-8 text-center ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <RefreshCw className="animate-spin mx-auto mb-4 text-blue-500" size={32} />
        <p>Loading issue...</p>
      </div>
    );
  }
  
  if (!issue) {
    return (
      <div className={`rounded-lg shadow p-8 text-center ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <AlertCircle className="mx-auto mb-4 text-red-500" size={32} />
        <p>Issue not found</p>
        <button onClick={onBack} className="mt-4 text-blue-500 hover:underline">
          ← Back to issues
        </button>
      </div>
    );
  }
  
  const canManage = ['admin', 'superadmin', 'steward'].includes(user?.role);
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex items-center gap-4 mb-4">
          <button onClick={onBack} className={`p-2 rounded-lg hover:${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <span>#{issue.githubNumber}</span>
              <span>•</span>
              <span className={`px-2 py-0.5 rounded text-xs ${
                issue.state === 'open' 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' 
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
              }`}>
                {issue.state}
              </span>
            </div>
            <h2 className="text-xl font-bold">{issue.title}</h2>
          </div>
          <a
            href={issue.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ExternalLink size={16} /> View on GitHub
          </a>
        </div>
        
        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {getStatusBadge(issue.status)}
          {issue.severity && getSeverityBadge(issue.severity)}
          {issue.fireElement && getFireBadge(issue.fireElement)}
          {issue.template && (
            <span className={`px-2 py-1 rounded text-xs font-medium ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              📄 {issue.template}
            </span>
          )}
          {issue.resource && (
            <span className={`px-2 py-1 rounded text-xs font-medium ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              🔧 {issue.resource}
            </span>
          )}
        </div>
        
        {/* Meta info */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1"><User size={14} /> {issue.createdBy}</span>
          <span className="flex items-center gap-1"><Clock size={14} /> {new Date(issue.createdAt).toLocaleDateString()}</span>
          <span className="flex items-center gap-1"><MessageSquare size={14} /> {issue.commentsCount} comments</span>
        </div>
        
        {/* Status actions */}
        {canManage && issue.state === 'open' && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="relative inline-block">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                disabled={updatingStatus}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
              >
                {updatingStatus ? <RefreshCw className="animate-spin" size={16} /> : <Edit3 size={16} />}
                Update Status
              </button>
              
              {showStatusMenu && (
                <div className={`absolute top-full left-0 mt-2 w-48 rounded-lg shadow-lg z-10 ${isDark ? 'bg-gray-700' : 'bg-white'} border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                  {['new', 'triaged', 'in-progress', 'resolved', 'wont-fix'].map(status => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      className={`w-full text-left px-4 py-2 hover:${isDark ? 'bg-gray-600' : 'bg-gray-100'} first:rounded-t-lg last:rounded-b-lg`}
                    >
                      {getStatusBadge(status)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Issue body */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <h3 className="font-semibold mb-3">Description</h3>
        <div className={`prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}>
          <pre className="whitespace-pre-wrap font-sans text-sm">{issue.body || issue.bodyPreview || 'No description provided.'}</pre>
        </div>
      </div>
      
      {/* Comments */}
      <div className={`rounded-lg shadow p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <MessageSquare size={18} /> Comments ({comments.length})
          <button onClick={loadIssue} className={`ml-auto p-1 rounded hover:${isDark ? 'bg-gray-700' : 'bg-gray-100'}`} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </h3>
        
        {comments.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No comments yet</p>
        ) : (
          <div className="space-y-4">
            {comments.map(comment => (
              <div key={comment.id} className={`p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2 text-sm">
                  {comment.authorAvatarUrl && (
                    <img src={comment.authorAvatarUrl} alt={comment.author} className="w-6 h-6 rounded-full" />
                  )}
                  <span className="font-medium">{comment.author}</span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-500">{new Date(comment.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm">{comment.body}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Add comment form */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          {draftSavedAt && (
            <div className={`flex items-center justify-between mb-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <span className="flex items-center gap-1">
                <CheckCircle size={14} className="text-green-500" /> Draft saved {new Date(draftSavedAt).toLocaleTimeString()}
              </span>
              <button onClick={handleDiscardDraft} className="text-red-500 hover:underline flex items-center gap-1">
                <Trash2 size={14} /> Discard
              </button>
            </div>
          )}
          
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            className={`w-full p-3 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
          />
          
          {hasConflict && !showConflictModal && (
            <div className={`mt-2 p-3 rounded-lg flex items-center gap-2 ${isDark ? 'bg-yellow-900/30' : 'bg-yellow-50'} text-yellow-700 dark:text-yellow-300`}>
              <AlertTriangle size={16} />
              <span className="text-sm">This issue has been updated. Review changes before submitting.</span>
            </div>
          )}
          
          <div className="flex justify-end mt-2">
            <button
              onClick={() => handleSubmitComment(false)}
              disabled={!commentDraft.trim() || commenting}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
            >
              {commenting ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />} Add Comment
            </button>
          </div>
        </div>
      </div>
      
      {/* Conflict Modal */}
      {showConflictModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowConflictModal(false)} />
            <div className={`relative w-full max-w-md rounded-xl shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900">
                    <AlertTriangle className="text-yellow-600 dark:text-yellow-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Issue Updated</h3>
                    <p className="text-sm text-gray-500">This issue has been modified since you started writing.</p>
                  </div>
                </div>
                
                {conflictInfo && (
                  <div className={`p-3 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    {conflictInfo.newCommentCount > 0 && (
                      <p className="text-sm">📝 {conflictInfo.newCommentCount} new comment{conflictInfo.newCommentCount > 1 ? 's' : ''}</p>
                    )}
                    {conflictInfo.stateChanged && <p className="text-sm">🔄 Issue state has changed</p>}
                  </div>
                )}
                
                <p className="text-sm text-gray-500 mb-4">
                  Your draft will be preserved. You can review the changes or submit your comment anyway.
                </p>
                
                <div className="flex gap-3">
                  <button onClick={handleReviewChanges} className="flex-1 py-2 px-4 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    Review Changes
                  </button>
                  <button onClick={handleSubmitAnyway} className="flex-1 py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    Submit Anyway
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

export default IssueDetail;
