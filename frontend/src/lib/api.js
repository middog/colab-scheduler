/**
 * SDCoLab Scheduler - Frontend API Utilities
 * 
 * Enhanced API client with:
 * - Optimistic UI updates with rollback
 * - Undo support for destructive actions
 * - Field-level validation
 * - Consistent error handling
 * 
 * @version 4.2.0-rc69.8
 */

// =============================================================================
// Configuration
// =============================================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const UNDO_TIMEOUT_MS = 10000; // 10 seconds

// =============================================================================
// Token Management
// =============================================================================

let authToken = localStorage.getItem('colab_token');
let refreshToken = localStorage.getItem('colab_refresh');
let sessionId = localStorage.getItem('colab_session');

export const setTokens = (access, refresh, session = null) => {
  authToken = access;
  refreshToken = refresh;
  if (session) sessionId = session;
  
  if (access) {
    localStorage.setItem('colab_token', access);
    if (refresh) localStorage.setItem('colab_refresh', refresh);
    if (session) localStorage.setItem('colab_session', session);
  } else {
    localStorage.removeItem('colab_token');
    localStorage.removeItem('colab_refresh');
    localStorage.removeItem('colab_session');
    authToken = null;
    refreshToken = null;
    sessionId = null;
  }
};

export const getTokens = () => ({ authToken, refreshToken, sessionId });

// =============================================================================
// API Client
// =============================================================================

/**
 * Enhanced API client with automatic error handling
 */
export const api = async (endpoint, options = {}) => {
  const { 
    etag = null,         // For optimistic concurrency
    idempotencyKey = null, // For request deduplication
    rawResponse = false  // Return full response instead of unwrapped data
  } = options;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken && { Authorization: `Bearer ${authToken}` }),
    ...(etag && { 'If-Match': etag }),
    ...(idempotencyKey && { 'X-Idempotency-Key': idempotencyKey }),
    ...options.headers
  };
  
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers
  });
  
  // Handle 401 - try refresh
  if (res.status === 401) {
    const data = await res.json();
    
    if (data.error?.code === 'SESSION_COMPROMISED') {
      setTokens(null, null);
      window.location.href = '/?error=session_compromised';
      throw new ApiError('SESSION_COMPROMISED', 'Session compromised');
    }
    
    if ((data.error?.code === 'TOKEN_EXPIRED' || data.error?.code === 'SESSION_INVALID') && refreshToken) {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, sessionId })
      });
      
      if (refreshRes.ok) {
        const tokens = await refreshRes.json();
        setTokens(tokens.accessToken, tokens.refreshToken || refreshToken, tokens.sessionId || sessionId);
        return api(endpoint, options);
      }
    }
    
    setTokens(null, null);
    window.location.reload();
    throw new ApiError('SESSION_EXPIRED', 'Session expired');
  }
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'An error occurred',
      data.error?.details
    );
  }
  
  // Attach ETag from response for future updates
  const responseETag = res.headers.get('ETag');
  if (responseETag && data.data) {
    data.data._etag = responseETag;
  }
  
  // Auto-unwrap standardized response format { success: true, data: {...} }
  // This provides backward compatibility with code expecting direct data access
  // Use rawResponse: true to get the full response object
  if (rawResponse) {
    return data;
  }
  
  // If response follows standardized format, return the inner data
  // This allows: const { bookings } = await api('/bookings') 
  // Instead of: const { data: { bookings } } = await api('/bookings')
  if (data.success === true && data.data !== undefined) {
    // Preserve metadata on the unwrapped response
    const unwrapped = data.data;
    if (typeof unwrapped === 'object' && unwrapped !== null) {
      unwrapped._meta = {
        success: data.success,
        message: data.message,
        timestamp: data.timestamp,
        _etag: responseETag
      };
    }
    return unwrapped;
  }
  
  // Legacy response format - return as-is
  return data;
};

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Structured API error
 */
export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
  
  /**
   * Get field-level errors for form validation
   */
  getFieldErrors() {
    if (this.code === 'VALIDATION_ERROR' && this.details?.fields) {
      return this.details.fields;
    }
    return {};
  }
  
  /**
   * Check if this is a specific error type
   */
  is(code) {
    return this.code === code;
  }
  
  /**
   * Check if this is a conflict error
   */
  isConflict() {
    return ['CONFLICT', 'SLOT_TAKEN', 'VERSION_MISMATCH', 'OVERLAP_WARNING'].includes(this.code);
  }
  
  /**
   * Check if action can be retried
   */
  isRetryable() {
    return ['VERSION_MISMATCH', 'IDEMPOTENCY_CONFLICT'].includes(this.code);
  }
}

/**
 * User-friendly error messages
 */
export const getErrorMessage = (error) => {
  if (!(error instanceof ApiError)) {
    return error.message || 'An unexpected error occurred';
  }
  
  const messages = {
    VALIDATION_ERROR: 'Please check the form for errors',
    SLOT_TAKEN: error.message || 'This time slot is no longer available',
    VERSION_MISMATCH: 'Someone else modified this. Please refresh and try again.',
    CERTIFICATION_REQUIRED: 'You need certification for this equipment',
    MAINTENANCE_WINDOW: 'Equipment is under maintenance',
    HOURS_CLOSED: 'The space is closed during these hours',
    ROLE_RESTRICTED: 'You don\'t have permission for this resource',
    BOOKING_LIMIT_EXCEEDED: 'You\'ve reached your maximum booking limit',
    OVERLAP_WARNING: 'You have overlapping bookings - confirm to proceed',
    NOT_FOUND: 'Resource not found',
    FORBIDDEN: 'You don\'t have permission for this action',
    ALREADY_CANCELLED: 'This booking is already cancelled'
  };
  
  return messages[error.code] || error.message || 'An error occurred';
};

// =============================================================================
// Optimistic Updates
// =============================================================================

/**
 * Create an optimistic update handler
 * 
 * Usage:
 * const { execute, rollback } = createOptimisticUpdate(
 *   (booking) => setBookings(prev => [...prev, booking]), // optimistic
 *   (booking) => setBookings(prev => prev.filter(b => b.id !== booking.id)) // rollback
 * );
 * 
 * try {
 *   execute(newBooking);
 *   await api('/bookings', { method: 'POST', body: ... });
 * } catch (err) {
 *   rollback(newBooking);
 *   showError(err);
 * }
 */
export const createOptimisticUpdate = (applyFn, revertFn) => {
  let pendingUpdate = null;
  
  return {
    execute: (data) => {
      pendingUpdate = data;
      applyFn(data);
    },
    rollback: (data) => {
      if (pendingUpdate) {
        revertFn(data || pendingUpdate);
        pendingUpdate = null;
      }
    },
    complete: () => {
      pendingUpdate = null;
    }
  };
};

/**
 * Hook for optimistic state updates
 */
export const useOptimistic = (initialState, reducer) => {
  const [state, setState] = React.useState(initialState);
  const pendingRef = React.useRef([]);
  
  const dispatch = React.useCallback((action) => {
    setState(prev => reducer(prev, action));
    pendingRef.current.push(action);
  }, [reducer]);
  
  const rollback = React.useCallback((action) => {
    const reverseAction = { ...action, type: `ROLLBACK_${action.type}` };
    setState(prev => reducer(prev, reverseAction));
    pendingRef.current = pendingRef.current.filter(a => a !== action);
  }, [reducer]);
  
  const confirm = React.useCallback((action) => {
    pendingRef.current = pendingRef.current.filter(a => a !== action);
  }, []);
  
  return [state, dispatch, { rollback, confirm }];
};

// =============================================================================
// Undo Support
// =============================================================================

const undoQueue = new Map();

/**
 * Register an undoable action
 * 
 * @param {string} key - Unique key for this action
 * @param {Function} undoFn - Function to call on undo
 * @param {Object} options - { timeoutMs, onExpire }
 * @returns {Function} - Call to trigger undo
 */
export const registerUndo = (key, undoFn, options = {}) => {
  const { 
    timeoutMs = UNDO_TIMEOUT_MS,
    onExpire = null 
  } = options;
  
  // Clear any existing undo for this key
  if (undoQueue.has(key)) {
    clearTimeout(undoQueue.get(key).timeoutId);
  }
  
  const timeoutId = setTimeout(() => {
    undoQueue.delete(key);
    onExpire?.();
  }, timeoutMs);
  
  const expiresAt = Date.now() + timeoutMs;
  
  undoQueue.set(key, {
    undoFn,
    timeoutId,
    expiresAt
  });
  
  return async () => {
    const entry = undoQueue.get(key);
    if (!entry) {
      throw new Error('Undo window expired');
    }
    
    clearTimeout(entry.timeoutId);
    undoQueue.delete(key);
    
    return entry.undoFn();
  };
};

/**
 * Check if undo is available for a key
 */
export const canUndo = (key) => {
  const entry = undoQueue.get(key);
  if (!entry) return false;
  return Date.now() < entry.expiresAt;
};

/**
 * Get remaining undo time in seconds
 */
export const getUndoTimeRemaining = (key) => {
  const entry = undoQueue.get(key);
  if (!entry) return 0;
  return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
};

/**
 * Cancel an undo (e.g., if user navigates away)
 */
export const cancelUndo = (key) => {
  const entry = undoQueue.get(key);
  if (entry) {
    clearTimeout(entry.timeoutId);
    undoQueue.delete(key);
  }
};

// =============================================================================
// Validation
// =============================================================================

/**
 * Field validation rules
 */
export const validators = {
  required: (value, fieldName = 'This field') => {
    if (value === undefined || value === null || value === '') {
      return `${fieldName} is required`;
    }
    return null;
  },
  
  minLength: (min) => (value, fieldName = 'This field') => {
    if (value && value.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    return null;
  },
  
  maxLength: (max) => (value, fieldName = 'This field') => {
    if (value && value.length > max) {
      return `${fieldName} must be at most ${max} characters`;
    }
    return null;
  },
  
  email: (value) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Please enter a valid email address';
    }
    return null;
  },
  
  date: (value) => {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return 'Please enter a valid date (YYYY-MM-DD)';
    }
    return null;
  },
  
  time: (value) => {
    if (value && !/^\d{2}:\d{2}$/.test(value)) {
      return 'Please enter a valid time (HH:MM)';
    }
    return null;
  },
  
  futureDate: (value) => {
    if (value) {
      const date = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        return 'Date must be in the future';
      }
    }
    return null;
  },
  
  timeRange: (startTime, endTime) => {
    if (startTime && endTime && startTime >= endTime) {
      return 'End time must be after start time';
    }
    return null;
  }
};

/**
 * Validate a form object
 * 
 * @param {Object} data - Form data
 * @param {Object} rules - Validation rules { fieldName: [validators] }
 * @returns {Object} - { valid: boolean, errors: { fieldName: message } }
 */
export const validateForm = (data, rules) => {
  const errors = {};
  
  for (const [field, fieldRules] of Object.entries(rules)) {
    for (const rule of fieldRules) {
      const error = rule(data[field], field);
      if (error) {
        errors[field] = error;
        break; // Only first error per field
      }
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Booking-specific validation
 */
export const validateBooking = (booking) => {
  return validateForm(booking, {
    tool: [validators.required],
    date: [validators.required, validators.date, validators.futureDate],
    startTime: [validators.required, validators.time],
    endTime: [validators.required, validators.time],
    purpose: [validators.required, validators.minLength(10), validators.maxLength(500)]
  });
};

// =============================================================================
// Booking API Helpers
// =============================================================================

/**
 * Create a booking with optimistic UI support
 */
export const createBooking = async (bookingData, options = {}) => {
  const { 
    onOptimistic = null,
    onRollback = null,
    confirmOverlap = false 
  } = options;
  
  // Generate a temporary ID for optimistic update
  const tempId = `temp-${Date.now()}`;
  const optimisticBooking = {
    ...bookingData,
    id: tempId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  try {
    // Apply optimistic update
    onOptimistic?.(optimisticBooking);
    
    const result = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({ ...bookingData, confirmOverlap })
    });
    
    // api() auto-unwraps { success, data } -> returns data directly
    // result is now { booking, message, ... } not { data: { booking, ... } }
    return result.booking || result;
  } catch (error) {
    // Rollback optimistic update
    onRollback?.(optimisticBooking);
    throw error;
  }
};

/**
 * Cancel a booking with undo support
 */
export const cancelBooking = async (bookingId, options = {}) => {
  const { 
    onOptimistic = null,
    onUndo = null,
    reason = null 
  } = options;
  
  try {
    // Apply optimistic update
    onOptimistic?.({ id: bookingId, status: 'cancelled' });
    
    const result = await api(`/bookings/${bookingId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason })
    });
    
    // api() auto-unwraps { success, data } -> returns data directly
    // result is now { cancelled, booking, undo: {...} } not { data: { ... } }
    if (result.undo?.available) {
      const undoToken = result.undo.token;
      
      registerUndo(`booking-${bookingId}`, async () => {
        const undoResult = await api(`/bookings/${bookingId}/undo`, {
          method: 'POST',
          body: JSON.stringify({ undoToken })
        });
        // undoResult is also unwrapped: { restored, booking, ... }
        onUndo?.(undoResult.booking);
        return undoResult.booking;
      }, {
        timeoutMs: (result.undo.windowSeconds || 10) * 1000
      });
    }
    
    return result;
  } catch (error) {
    // Rollback on error
    onOptimistic?.({ id: bookingId, status: 'reverted' });
    throw error;
  }
};

/**
 * Update a booking with optimistic concurrency
 */
export const updateBooking = async (bookingId, updates, options = {}) => {
  const { etag = null, version = null } = options;
  
  return api(`/bookings/${bookingId}`, {
    method: 'PUT',
    etag,
    body: JSON.stringify({ ...updates, version })
  });
};

// =============================================================================
// Conflict Resolution Helpers
// =============================================================================

/**
 * Handle booking conflicts with user-friendly messages
 */
export const handleBookingConflict = (error) => {
  if (error.code === 'SLOT_TAKEN') {
    return {
      type: 'slot_taken',
      message: error.message,
      takenAt: error.details?.takenAt,
      alternatives: error.details?.alternatives || []
    };
  }
  
  if (error.code === 'OVERLAP_WARNING') {
    return {
      type: 'overlap',
      message: error.details?.message || 'You have overlapping bookings',
      overlappingBookings: error.details?.overlappingBookings || [],
      requiresConfirmation: true
    };
  }
  
  if (error.code === 'VERSION_MISMATCH') {
    return {
      type: 'version_conflict',
      message: 'This booking was modified. Please refresh to see the latest version.',
      currentVersion: error.details?.currentVersion,
      yourVersion: error.details?.yourVersion
    };
  }
  
  return {
    type: 'unknown',
    message: error.message
  };
};

// =============================================================================
// React Hooks
// =============================================================================

/**
 * Hook for API calls with loading/error state
 */
export const useApi = (initialData = null) => {
  const [data, setData] = React.useState(initialData);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  
  const execute = React.useCallback(async (apiCall) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await apiCall();
      // api() auto-unwraps { success, data } -> result IS the data
      setData(result);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  
  return { data, loading, error, execute, setData, setError };
};

/**
 * Hook for form validation
 */
export const useFormValidation = (initialData, rules) => {
  const [data, setData] = React.useState(initialData);
  const [errors, setErrors] = React.useState({});
  const [touched, setTouched] = React.useState({});
  
  const validate = React.useCallback(() => {
    const result = validateForm(data, rules);
    setErrors(result.errors);
    return result.valid;
  }, [data, rules]);
  
  const validateField = React.useCallback((field) => {
    const fieldRules = rules[field] || [];
    for (const rule of fieldRules) {
      const error = rule(data[field], field);
      if (error) {
        setErrors(prev => ({ ...prev, [field]: error }));
        return false;
      }
    }
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    return true;
  }, [data, rules]);
  
  const setField = React.useCallback((field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
    if (touched[field]) {
      // Re-validate on change if already touched
      setTimeout(() => validateField(field), 0);
    }
  }, [touched, validateField]);
  
  const touchField = React.useCallback((field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    validateField(field);
  }, [validateField]);
  
  const reset = React.useCallback(() => {
    setData(initialData);
    setErrors({});
    setTouched({});
  }, [initialData]);
  
  return {
    data,
    errors,
    touched,
    setField,
    touchField,
    validate,
    validateField,
    reset,
    isValid: Object.keys(errors).length === 0
  };
};

export default {
  api,
  setTokens,
  getTokens,
  ApiError,
  getErrorMessage,
  createOptimisticUpdate,
  registerUndo,
  canUndo,
  getUndoTimeRemaining,
  cancelUndo,
  validators,
  validateForm,
  validateBooking,
  createBooking,
  cancelBooking,
  updateBooking,
  handleBookingConflict,
  useApi,
  useFormValidation
};
