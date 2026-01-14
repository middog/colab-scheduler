/**
 * SDCoLab Scheduler API
 * 
 * Main application entry point with production reliability:
 * - Health check endpoints (liveness + readiness)
 * - Request ID tracing
 * - Security headers
 * - HttpOnly cookie authentication
 * - DynamoDB-backed rate limiting (fallback for API Gateway)
 * - Structured error handling
 * 
 * Note: For Lambda, graceful shutdown is handled by AWS.
 * Rate limiting should primarily be configured at API Gateway.
 * 
 * 🔥 Fire Triangle: Where Fuel + Oxygen + Heat converge
 * 
 * @version 4.2.0-rc69.8
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import serverless from 'serverless-http';

import { config, logConfig, isFeatureEnabled } from './lib/config.js';
import { integrations } from './integrations/index.js';
import { 
  getCircuitBreakerStatus, 
  asyncQueue,
  rateLimitMiddleware 
} from './lib/resilience.js';
import { extractAuthMiddleware } from './lib/cookies.js';
import authRoutes from './routes/auth.js';
import bookingRoutes from './routes/bookings.js';
import userRoutes from './routes/users.js';
import publicRoutes from './routes/public.js';
import certificationRoutes from './routes/certifications.js';
import resourceRoutes from './routes/resources.js';
import notificationRoutes from './routes/notifications.js';
import waitlistRoutes from './routes/waitlist.js';
import recurringRoutes from './routes/recurring.js';
import analyticsRoutes from './routes/analytics.js';
import githubRoutes from './routes/github.js';

const app = express();
const startTime = Date.now();
const isProduction = config.env === 'production';

// =============================================================================
// Request ID Middleware (for tracing)
// =============================================================================

app.use((req, res, next) => {
  // Use API Gateway request ID if available, otherwise generate one
  // Standardize on req.requestId and X-Request-Id (not req.id / X-Request-ID)
  const requestId = req.headers['x-amzn-requestid'] 
    || req.headers['x-request-id'] 
    || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Set both for compatibility during transition
  req.requestId = requestId;
  req.id = requestId; // Legacy - remove after full migration
  
  res.set('X-Request-Id', requestId);
  next();
});

// =============================================================================
// Security Headers Middleware
// =============================================================================

app.use((req, res, next) => {
  // Prevent clickjacking
  res.set('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.set('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS filter
  res.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy - don't leak URLs to third parties
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy - disable unused browser features
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // HSTS - only in production with HTTPS
  if (isProduction) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
});

// =============================================================================
// Core Middleware
// =============================================================================

// CORS configuration
// SECURITY: In production, only allow explicit origins
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = config.cors.origins;
    
    // In development with wildcard, allow all
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow same-domain requests (api.X from X)
    // e.g., allow https://sdcolab.mid.dog to call https://api.sdcolab.mid.dog
    const originHost = origin.replace(/^https?:\/\//, '');
    const apiHost = config.baseUrl?.replace(/^https?:\/\//, '') || '';
    if (apiHost.startsWith('api.') && apiHost.slice(4) === originHost) {
      return callback(null, true);
    }
    if (originHost.startsWith('api.') === false && `api.${originHost}` === apiHost) {
      return callback(null, true);
    }
    
    // Also check FRONTEND_URL
    const frontendHost = config.frontendUrl?.replace(/^https?:\/\//, '') || '';
    if (originHost === frontendHost) {
      return callback(null, true);
    }
    
    // In production with empty allowed list, check if it looks like our domain
    if (isProduction && allowedOrigins.length === 0) {
      // Allow if origin matches expected pattern (*.mid.dog for example)
      if (origin.includes('.mid.dog') || origin.includes('amplifyapp.com')) {
        console.warn(`CORS: allowing origin ${origin} (matches expected domain pattern)`);
        return callback(null, true);
      }
      return callback(new Error('CORS not allowed'), false);
    }
    
    // In dev, allow but warn
    console.warn(`CORS: allowing unlisted origin ${origin} (dev mode)`);
    callback(null, true);
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Idempotency-Key']
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));

// Cookie parser for HttpOnly cookie auth
app.use(cookieParser());

// Extract auth from cookies or Authorization header
app.use(extractAuthMiddleware);

// =============================================================================
// Health Check Routes
// =============================================================================

/**
 * GET /api/health
 * Basic liveness check - is the Lambda responding?
 * Use for: ALB health check, basic monitoring
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'SDCoLab Scheduler API',
    version: '4.3.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
});

/**
 * GET /api/ready
 * Readiness check - are integrations available?
 * Use for: Deployment verification, integration monitoring
 */
app.get('/api/ready', async (req, res) => {
  const integrationStatus = integrations?.getStatus?.() || {};
  const circuitStatus = getCircuitBreakerStatus();
  const queueStatus = asyncQueue.getStatus();
  
  // Count open circuits (degraded integrations)
  const openCircuits = Object.values(circuitStatus).filter(c => c.state === 'open').length;
  
  res.json({
    status: openCircuits > 0 ? 'degraded' : 'ready',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    integrations: integrationStatus,
    circuitBreakers: circuitStatus,
    queue: queueStatus,
    degradedServices: openCircuits
  });
});

/**
 * GET /api/health/deep
 * Detailed health check for debugging
 */
app.get('/api/health/deep', async (req, res) => {
  const integrationStatus = integrations?.getStatus?.() || {};
  const circuitStatus = getCircuitBreakerStatus();
  const queueStatus = asyncQueue.getStatus();
  
  res.json({
    status: 'healthy',
    service: 'SDCoLab Scheduler API',
    version: '4.2.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    features: config.features,
    integrations: integrationStatus,
    circuitBreakers: circuitStatus,
    queue: queueStatus,
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    },
    environment: config.env,
    lambda: {
      functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'local',
      memoryLimit: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 'N/A',
      region: process.env.AWS_REGION || 'local'
    }
  });
});

// =============================================================================
// Public Config Route
// =============================================================================

app.get('/api/config', (req, res) => {
  res.json({
    features: {
      selfRegistration: config.features.selfRegistration,
      darkMode: config.features.darkMode,
      certifications: config.features.certifications,
      waitlist: config.features.waitlist !== false,
      recurring: config.features.recurring !== false,
      analytics: config.features.analytics !== false
    },
    tools: config.tools,
    rooms: config.rooms
  });
});

// =============================================================================
// API Routes
// =============================================================================

// Public routes (no auth required)
// Rate limiting primarily at API Gateway; DynamoDB fallback here
app.use('/api/public', rateLimitMiddleware({ limit: 60 }), publicRoutes);

// Auth (stricter rate limit to prevent brute force)
app.use('/api/auth', rateLimitMiddleware({ limit: 20 }), authRoutes);

// Authenticated routes
app.use('/api/bookings', rateLimitMiddleware({ limit: 100 }), bookingRoutes);
app.use('/api/users', rateLimitMiddleware({ limit: 100 }), userRoutes);
app.use('/api/certifications', rateLimitMiddleware({ limit: 100 }), certificationRoutes);
app.use('/api/resources', rateLimitMiddleware({ limit: 100 }), resourceRoutes);
app.use('/api/notifications', rateLimitMiddleware({ limit: 100 }), notificationRoutes);
app.use('/api/waitlist', rateLimitMiddleware({ limit: 100 }), waitlistRoutes);
app.use('/api/recurring', rateLimitMiddleware({ limit: 100 }), recurringRoutes);
app.use('/api/analytics', rateLimitMiddleware({ limit: 100 }), analyticsRoutes);
app.use('/api/github', rateLimitMiddleware({ limit: 100 }), githubRoutes);

// Legacy routes
app.get('/api/tools', (req, res) => {
  res.json({ tools: config.tools });
});

app.get('/api/rooms', (req, res) => {
  res.json({ rooms: config.rooms });
});

// =============================================================================
// Error Handlers
// =============================================================================

/**
 * Import standardized error utilities
 * Note: Dynamic import to avoid circular dependencies
 */
import { ErrorCodes, ApiError } from './lib/responses.js';

/**
 * Global error handler with standardized response format
 * 
 * Serializes all errors (including ApiError) in the same format as sendError():
 * { success: false, error: { code, message, details, requestId }, timestamp }
 */
app.use((err, req, res, next) => {
  const requestId = req.requestId || req.id;
  const isDev = config.env === 'development' || config.env === 'dev';
  
  // Log error with context
  console.error(JSON.stringify({
    level: 'error',
    requestId,
    method: req.method,
    path: req.path,
    errorCode: err.code || 'INTERNAL_ERROR',
    error: err.message,
    stack: !isProduction ? err.stack : undefined,
    timestamp: new Date().toISOString()
  }));
  
  // Determine error code and status
  let code = ErrorCodes.INTERNAL_ERROR;
  let status = 500;
  let message = 'An unexpected error occurred';
  let details = null;
  
  // Handle ApiError (thrown by routes using standardized responses)
  if (err instanceof ApiError || err.code) {
    code = err.code || ErrorCodes.INTERNAL_ERROR;
    message = err.message;
    details = err.details || null;
    
    // Map code to status
    const statusMap = {
      [ErrorCodes.BAD_REQUEST]: 400,
      [ErrorCodes.VALIDATION_ERROR]: 400,
      [ErrorCodes.UNAUTHORIZED]: 401,
      [ErrorCodes.FORBIDDEN]: 403,
      [ErrorCodes.NOT_FOUND]: 404,
      [ErrorCodes.CONFLICT]: 409,
      [ErrorCodes.SLOT_TAKEN]: 409,
      [ErrorCodes.VERSION_MISMATCH]: 409,
      [ErrorCodes.RATE_LIMITED]: 429,
      [ErrorCodes.INTERNAL_ERROR]: 500
    };
    status = statusMap[code] || err.status || 500;
  }
  // Handle DynamoDB ConditionalCheckFailed (version mismatch)
  else if (err.name === 'ConditionalCheckFailedException') {
    code = ErrorCodes.VERSION_MISMATCH;
    status = 409;
    message = err.message || 'Resource was modified by another request. Please refresh and try again.';
    details = err.currentVersion ? { currentVersion: err.currentVersion } : null;
  }
  // Handle validation errors
  else if (err.name === 'ValidationError' || err.errors) {
    code = ErrorCodes.VALIDATION_ERROR;
    status = 400;
    message = 'Validation failed';
    details = { fields: err.errors || err.message };
  }
  // Handle HTTP errors with status
  else if (err.status || err.statusCode) {
    status = err.status || err.statusCode;
    if (status === 401) code = ErrorCodes.UNAUTHORIZED;
    else if (status === 403) code = ErrorCodes.FORBIDDEN;
    else if (status === 404) code = ErrorCodes.NOT_FOUND;
    else if (status === 409) code = ErrorCodes.CONFLICT;
    else if (status === 429) code = ErrorCodes.RATE_LIMITED;
    message = err.message;
  }
  // Development: include message in response
  else if (isDev) {
    message = err.message;
  }
  
  // Send standardized error response
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      requestId
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * 404 handler - also uses standardized format
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: `Endpoint not found: ${req.method} ${req.path}`,
      requestId: req.requestId || req.id
    },
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// Startup
// =============================================================================

logConfig();
console.log('🔥 SDCoLab Scheduler v4.2.0-rc69.11 initialized');

// Lambda handler
export const handler = serverless(app);

// Local development server
if (config.env !== 'production') {
  const PORT = config.port;
  const server = app.listen(PORT, () => {
    console.log(`\n🔥 SDCoLab Scheduler v4.2.0-rc69.11 running on http://localhost:${PORT}`);
    console.log(`   Environment: ${config.env}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Readiness: http://localhost:${PORT}/api/ready`);
    console.log(`   Deep Health: http://localhost:${PORT}/api/health/deep`);
  });
  
  // Graceful shutdown for local dev
  process.on('SIGTERM', () => {
    console.log('Shutting down...');
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    server.close(() => process.exit(0));
  });
}

export default app;
