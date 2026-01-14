/**
 * SDCoLab Scheduler - Undo Toast Component
 * 
 * Shows a toast with countdown timer for undoable actions.
 * Supports:
 * - 10-second undo window
 * - Visual countdown
 * - Keyboard shortcut (Ctrl+Z)
 * 
 * @version 4.2.0-rc69.6
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Undo2, X, Clock } from 'lucide-react';

/**
 * Single Undo Toast
 */
const UndoToastItem = ({ 
  id,
  message, 
  onUndo, 
  onDismiss, 
  timeoutSeconds = 10,
  theme = 'light'
}) => {
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const [isUndoing, setIsUndoing] = useState(false);
  const intervalRef = useRef(null);
  
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          onDismiss?.(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [id, onDismiss]);
  
  const handleUndo = async () => {
    if (isUndoing) return;
    
    setIsUndoing(true);
    clearInterval(intervalRef.current);
    
    try {
      await onUndo?.();
      onDismiss?.(id);
    } catch (error) {
      console.error('Undo failed:', error);
      setIsUndoing(false);
    }
  };
  
  const handleDismiss = () => {
    clearInterval(intervalRef.current);
    onDismiss?.(id);
  };
  
  // Calculate progress for visual indicator
  const progress = (remaining / timeoutSeconds) * 100;
  
  const isDark = theme === 'dark';
  
  return (
    <div 
      className={`
        relative overflow-hidden rounded-lg shadow-lg border
        ${isDark 
          ? 'bg-gray-800 border-gray-700 text-white' 
          : 'bg-white border-gray-200 text-gray-900'
        }
        transform transition-all duration-300 ease-out
        animate-slide-up
      `}
      role="alert"
      aria-live="polite"
    >
      {/* Progress bar */}
      <div 
        className="absolute bottom-0 left-0 h-1 bg-orange-500 transition-all duration-1000 ease-linear"
        style={{ width: `${progress}%` }}
      />
      
      <div className="p-4 pr-12">
        <div className="flex items-center gap-3">
          <div className={`flex-shrink-0 p-2 rounded-full ${isDark ? 'bg-orange-900/50' : 'bg-orange-100'}`}>
            <Undo2 className="w-4 h-4 text-orange-500" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{message}</p>
            <div className="flex items-center gap-2 mt-1">
              <Clock className={`w-3 h-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
              <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {remaining}s to undo
              </span>
            </div>
          </div>
          
          <button
            onClick={handleUndo}
            disabled={isUndoing}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md
              transition-colors duration-200
              ${isUndoing 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2'
              }
              bg-orange-500 text-white
            `}
          >
            {isUndoing ? 'Undoing...' : 'Undo'}
          </button>
        </div>
      </div>
      
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className={`
          absolute top-2 right-2 p-1 rounded-full
          ${isDark 
            ? 'hover:bg-gray-700 text-gray-400' 
            : 'hover:bg-gray-100 text-gray-500'
          }
          transition-colors
        `}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

/**
 * Undo Toast Container - Manages multiple toasts
 */
const UndoToastContainer = ({ 
  toasts = [], 
  onUndo, 
  onDismiss,
  position = 'bottom-center',
  theme = 'light'
}) => {
  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && toasts.length > 0) {
        e.preventDefault();
        // Undo the most recent action
        const latestToast = toasts[toasts.length - 1];
        onUndo?.(latestToast.id);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toasts, onUndo]);
  
  if (toasts.length === 0) return null;
  
  const positions = {
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4'
  };
  
  return (
    <div 
      className={`fixed ${positions[position]} z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none`}
      aria-live="polite"
    >
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <UndoToastItem
            id={toast.id}
            message={toast.message}
            onUndo={() => onUndo?.(toast.id)}
            onDismiss={onDismiss}
            timeoutSeconds={toast.timeoutSeconds || 10}
            theme={theme}
          />
        </div>
      ))}
    </div>
  );
};

/**
 * Hook for managing undo toasts
 */
export const useUndoToast = () => {
  const [toasts, setToasts] = useState([]);
  const undoHandlers = useRef(new Map());
  
  const showUndo = useCallback((message, undoFn, options = {}) => {
    const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeoutSeconds = options.timeoutSeconds || 10;
    
    // Store the undo handler
    undoHandlers.current.set(id, undoFn);
    
    // Add toast
    setToasts(prev => [...prev, { id, message, timeoutSeconds }]);
    
    // Auto-remove after timeout
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      undoHandlers.current.delete(id);
    }, timeoutSeconds * 1000);
    
    return id;
  }, []);
  
  const handleUndo = useCallback(async (id) => {
    const undoFn = undoHandlers.current.get(id);
    if (undoFn) {
      try {
        await undoFn();
      } finally {
        setToasts(prev => prev.filter(t => t.id !== id));
        undoHandlers.current.delete(id);
      }
    }
  }, []);
  
  const handleDismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    undoHandlers.current.delete(id);
  }, []);
  
  return {
    toasts,
    showUndo,
    handleUndo,
    handleDismiss
  };
};

/**
 * Provider component for undo functionality
 */
export const UndoProvider = ({ children, theme = 'light', position = 'bottom-center' }) => {
  const { toasts, showUndo, handleUndo, handleDismiss } = useUndoToast();
  
  return (
    <>
      {children}
      <UndoToastContainer
        toasts={toasts}
        onUndo={handleUndo}
        onDismiss={handleDismiss}
        position={position}
        theme={theme}
      />
    </>
  );
};

// Add CSS for animation
const styles = `
  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-slide-up {
    animation: slide-up 0.3s ease-out forwards;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default UndoToastContainer;
export { UndoToastItem };
