/**
 * SDCoLab Scheduler - Standardized API Responses
 * 
 * Provides consistent response formats across all endpoints:
 * - Success responses always include `data` field
 * - Error responses follow { code, message, details, requestId } shape
 * - ETag/version support for optimistic concurrency
 * - No 204 responses - always return JSON
 * 
 * 🔥 Fire Triangle: OXYGEN layer - API contract standardization
 * 
 * @version 4.2.0-rc69.15
 */

import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCodes = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SLOT_TAKEN: 'SLOT_TAKEN',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  ARCHIVED: 'ARCHIVED',
  
  // Business logic errors
  CERTIFICATION_REQUIRED: 'CERTIFICATION_REQUIRED',
  BOOKING_LIMIT_EXCEEDED: 'BOOKING_LIMIT_EXCEEDED',
  RESOURCE_UNAVAILABLE: 'RESOURCE_UNAVAILABLE',
  MAINTENANCE_WINDOW: 'MAINTENANCE_WINDOW',
  HOURS_CLOSED: 'HOURS_CLOSED',
  ROLE_RESTRICTED: 'ROLE_RESTRICTED',
  ALREADY_CANCELLED: 'ALREADY_CANCELLED',
  CANNOT_MODIFY_PAST: 'CANNOT_MODIFY_PAST',
  
  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR'
};

// HTTP status mapping
const statusForCode = {
  [ErrorCodes.BAD_REQUEST]: 400,
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.SLOT_TAKEN]: 409,
  [ErrorCodes.VERSION_MISMATCH]: 409,
  [ErrorCodes.IDEMPOTENCY_CONFLICT]: 409,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.ARCHIVED]: 410,
  [ErrorCodes.CERTIFICATION_REQUIRED]: 403,
  [ErrorCodes.BOOKING_LIMIT_EXCEEDED]: 403,
  [ErrorCodes.RESOURCE_UNAVAILABLE]: 409,
  [ErrorCodes.MAINTENANCE_WINDOW]: 409,
  [ErrorCodes.HOURS_CLOSED]: 409,
  [ErrorCodes.ROLE_RESTRICTED]: 403,
  [ErrorCodes.ALREADY_CANCELLED]: 409,
  [ErrorCodes.CANNOT_MODIFY_PAST]: 400,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.INTEGRATION_ERROR]: 502
};

// =============================================================================
// Response Builders
// =============================================================================

/**
 * Build a success response
 * @param {Object} data - Response payload
 * @param {Object} options - { message, meta, etag }
 */
export const success = (data, options = {}) => {
  const response = {
    success: true,
    data,
    ...(options.message && { message: options.message }),
    ...(options.meta && { meta: options.meta }),
    timestamp: new Date().toISOString()
  };
  
  return response;
};

/**
 * Build an error response
 * @param {string} code - Error code from ErrorCodes
 * @param {string} message - Human-readable message
 * @param {Object} details - Additional error details
 * @param {string} requestId - Request tracking ID
 */
export const error = (code, message, details = null, requestId = null) => {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      requestId: requestId || uuidv4()
    },
    timestamp: new Date().toISOString()
  };
};

/**
 * Build a paginated response
 * @param {Array} items - Array of items
 * @param {Object} pagination - { page, limit, total, hasMore }
 */
export const paginated = (items, pagination) => {
  return success(items, {
    meta: {
      pagination: {
        page: pagination.page || 1,
        limit: pagination.limit || items.length,
        total: pagination.total || items.length,
        hasMore: pagination.hasMore || false,
        ...(pagination.cursor && { cursor: pagination.cursor })
      }
    }
  });
};

// =============================================================================
// ETag / Version Support
// =============================================================================

/**
 * Generate ETag from entity version or content
 * @param {Object} entity - Entity with version or updatedAt
 */
export const generateETag = (entity) => {
  if (!entity) return null;
  
  // Use explicit version field if available
  if (entity.version !== undefined) {
    return `"v${entity.version}"`;
  }
  
  // Fall back to updatedAt hash
  if (entity.updatedAt) {
    const hash = Buffer.from(entity.updatedAt).toString('base64').slice(0, 16);
    return `"${hash}"`;
  }
  
  // Last resort: ID + current time (weak ETag)
  return `W/"${entity.id || 'unknown'}"`;
};

/**
 * Parse If-Match header for version checking
 * @param {string} ifMatch - If-Match header value
 * @returns {number|string|null} - Parsed version or null
 */
export const parseIfMatch = (ifMatch) => {
  if (!ifMatch) return null;
  
  // Remove quotes and 'W/' prefix
  const cleaned = ifMatch.replace(/^W\//, '').replace(/"/g, '');
  
  // Check for version prefix
  if (cleaned.startsWith('v')) {
    const version = parseInt(cleaned.slice(1), 10);
    return isNaN(version) ? cleaned : version;
  }
  
  return cleaned;
};

/**
 * Check if versions match
 * @param {Object} entity - Entity with version
 * @param {string} ifMatch - If-Match header value
 * @returns {boolean} - True if versions match
 */
export const versionsMatch = (entity, ifMatch) => {
  if (!ifMatch) return true; // No version specified = no check
  
  const requestedVersion = parseIfMatch(ifMatch);
  if (requestedVersion === null) return true;
  
  const currentVersion = entity.version ?? entity.updatedAt;
  
  // Numeric version comparison
  if (typeof requestedVersion === 'number' && typeof entity.version === 'number') {
    return requestedVersion === entity.version;
  }
  
  // String comparison (updatedAt or hash)
  return String(requestedVersion) === String(currentVersion);
};

// =============================================================================
// Express Middleware & Helpers
// =============================================================================

/**
 * Wrap an async route handler with standardized error handling
 * @param {Function} handler - Async route handler (req, res) => Promise
 */
export const asyncHandler = (handler) => {
  return async (req, res, next) => {
    // Generate request ID for tracking
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.set('X-Request-Id', req.requestId);
    
    try {
      await handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Send a success response
 * Sets ETag if entity has version info
 */
export const sendSuccess = (res, data, options = {}) => {
  const { status = 200, message, meta, etag } = options;
  
  // Set ETag if provided or extractable
  if (etag) {
    res.set('ETag', etag);
  } else if (data && typeof data === 'object') {
    const generatedETag = generateETag(data);
    if (generatedETag) {
      res.set('ETag', generatedETag);
    }
  }
  
  res.status(status).json(success(data, { message, meta }));
};

/**
 * Send an error response
 */
export const sendError = (res, code, message, details = null, requestId = null) => {
  const status = statusForCode[code] || 500;
  const rid = requestId || res.req?.requestId;
  
  res.status(status).json(error(code, message, details, rid));
};

/**
 * Express error handling middleware
 * Catches all errors and formats them consistently
 */
export const errorHandler = (err, req, res, _next) => {
  console.error(`[${req.requestId || 'no-id'}] Error:`, err.message);
  
  // Already sent response
  if (res.headersSent) {
    return;
  }
  
  // Structured API error
  if (err.code && ErrorCodes[err.code]) {
    return sendError(res, err.code, err.message, err.details, req.requestId);
  }
  
  // Validation error (from express-validator or similar)
  if (err.name === 'ValidationError' || err.errors) {
    return sendError(
      res, 
      ErrorCodes.VALIDATION_ERROR, 
      'Validation failed',
      { fields: err.errors || err.message },
      req.requestId
    );
  }
  
  // DynamoDB ConditionalCheckFailed (version mismatch)
  if (err.name === 'ConditionalCheckFailedException') {
    return sendError(
      res,
      ErrorCodes.VERSION_MISMATCH,
      'Resource was modified by another request. Please refresh and try again.',
      null,
      req.requestId
    );
  }
  
  // DynamoDB errors
  if (err.name?.includes('DynamoDB') || err.$metadata) {
    return sendError(
      res,
      ErrorCodes.DATABASE_ERROR,
      'Database operation failed',
      process.env.NODE_ENV === 'development' ? { message: err.message } : null,
      req.requestId
    );
  }
  
  // Generic error
  sendError(
    res,
    ErrorCodes.INTERNAL_ERROR,
    process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    process.env.NODE_ENV === 'development' ? { stack: err.stack?.split('\n').slice(0, 3) } : null,
    req.requestId
  );
};

/**
 * Create a typed API error
 */
export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

// =============================================================================
// Conflict Detection Helpers
// =============================================================================

/**
 * Build booking conflict error with helpful details
 */
export const bookingConflictError = (conflictType, details) => {
  const messages = {
    slot_taken: 'This time slot was just taken',
    certification_required: 'You need certification for this equipment',
    maintenance_window: 'Equipment is scheduled for maintenance during this time',
    hours_closed: 'The space is closed during these hours',
    role_restricted: 'This resource requires a different role level',
    limit_exceeded: 'You have reached your maximum booking limit'
  };
  
  return new ApiError(
    conflictType === 'slot_taken' ? ErrorCodes.SLOT_TAKEN :
    conflictType === 'certification_required' ? ErrorCodes.CERTIFICATION_REQUIRED :
    conflictType === 'maintenance_window' ? ErrorCodes.MAINTENANCE_WINDOW :
    conflictType === 'hours_closed' ? ErrorCodes.HOURS_CLOSED :
    conflictType === 'role_restricted' ? ErrorCodes.ROLE_RESTRICTED :
    conflictType === 'limit_exceeded' ? ErrorCodes.BOOKING_LIMIT_EXCEEDED :
    ErrorCodes.CONFLICT,
    messages[conflictType] || 'Booking conflict detected',
    details
  );
};

// =============================================================================
// Exports
// =============================================================================

export default {
  ErrorCodes,
  success,
  error,
  paginated,
  generateETag,
  parseIfMatch,
  versionsMatch,
  asyncHandler,
  sendSuccess,
  sendError,
  errorHandler,
  ApiError,
  bookingConflictError
};
