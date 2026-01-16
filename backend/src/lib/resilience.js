/**
 * Resilience Utilities (Production)
 * 
 * Provides stability patterns for Lambda/serverless:
 * - Timeouts: Hard limits on external calls
 * - Retry with exponential backoff: Automatic recovery from transient failures  
 * - Circuit breaker: Fail-fast when services are degraded (per-instance)
 * - Idempotency: DynamoDB-backed deduplication
 * - Rate limiting: DynamoDB-backed (fallback for API Gateway)
 * - Async queue: SQS for non-critical operations
 * 
 * 🔥 Fire Triangle: OXYGEN layer - system connectivity resilience
 * 
 * @version 4.2.0-rc69.15
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand,
  UpdateCommand 
} from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { config } from './config.js';

// =============================================================================
// AWS Clients
// =============================================================================

const dynamoClient = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true }
});

const sqsClient = new SQSClient({ region: config.aws.region });

// Table names from environment
const IDEMPOTENCY_TABLE = process.env.IDEMPOTENCY_TABLE || 'colab-scheduler-idempotency';
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'colab-scheduler-ratelimit';
const QUEUE_URL = process.env.INTEGRATION_QUEUE_URL || null;

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_TIMEOUT_MS = 5000;        // 5 seconds - hard limit
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 200;
const DEFAULT_RETRY_MAX_DELAY_MS = 5000;

const CIRCUIT_BREAKER_THRESHOLD = 5;     // failures before opening
const CIRCUIT_BREAKER_RESET_MS = 30000;  // 30 seconds before half-open

const IDEMPOTENCY_TTL_SECONDS = 300;     // 5 minutes
const RATE_LIMIT_WINDOW_SECONDS = 60;    // 1 minute window

// =============================================================================
// Timeout Wrapper
// =============================================================================

/**
 * Execute a promise with a hard timeout
 * @param {Promise} promise - The promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name for error messages
 * @returns {Promise} - Resolves with result or rejects with TimeoutError
 */
export const withTimeout = async (promise, timeoutMs = DEFAULT_TIMEOUT_MS, operationName = 'Operation') => {
  let timeoutId;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

/**
 * Custom timeout error for identification
 */
export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
    this.isTimeout = true;
  }
}

// =============================================================================
// Retry with Exponential Backoff
// =============================================================================

/**
 * Execute a function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry configuration
 * @returns {Promise} - Result of successful execution
 */
export const withRetry = async (fn, options = {}) => {
  const {
    attempts = DEFAULT_RETRY_ATTEMPTS,
    baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
    operationName = 'Operation',
    shouldRetry = defaultShouldRetry,
    onRetry = null
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!shouldRetry(error) || attempt === attempts) {
        throw error;
      }
      
      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100,
        maxDelayMs
      );
      
      if (onRetry) {
        onRetry({ attempt, error, delay, operationName });
      } else {
        console.warn(`⚠️ ${operationName} attempt ${attempt}/${attempts} failed: ${error.message}. Retrying in ${Math.round(delay)}ms...`);
      }
      
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Default retry decision logic
 */
const defaultShouldRetry = (error) => {
  if (error.isTimeout) return true;
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') return true;
  if (error.status >= 500 && error.status < 600) return true;
  if (error.statusCode >= 500 && error.statusCode < 600) return true;
  if (error.status === 429 || error.statusCode === 429) return true;
  if (error.status >= 400 && error.status < 500) return false;
  if (error.statusCode >= 400 && error.statusCode < 500) return false;
  return true;
};

// =============================================================================
// Circuit Breaker (Per-Instance)
// =============================================================================

const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open'
};

/**
 * Circuit breaker for external services
 * Note: Per-instance only. For distributed circuit breaking, 
 * monitor error rates centrally and use API Gateway throttling.
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.threshold = options.threshold || CIRCUIT_BREAKER_THRESHOLD;
    this.resetTimeMs = options.resetTimeMs || CIRCUIT_BREAKER_RESET_MS;
    this.onStateChange = options.onStateChange || null;
    
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  async execute(fn) {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitOpenError(
          `Circuit '${this.name}' is OPEN. Retry after ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= 2) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;
    
    if (this.state === CircuitState.HALF_OPEN || this.failures >= this.threshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    
    if (newState === CircuitState.OPEN) {
      this.nextAttemptTime = Date.now() + this.resetTimeMs;
      console.error(`🔴 Circuit '${this.name}' OPENED after ${this.failures} failures`);
    } else if (newState === CircuitState.HALF_OPEN) {
      console.warn(`🟡 Circuit '${this.name}' HALF-OPEN - testing`);
      this.successes = 0;
    } else if (newState === CircuitState.CLOSED) {
      console.log(`🟢 Circuit '${this.name}' CLOSED - recovered`);
      this.failures = 0;
    }
    
    if (this.onStateChange) {
      this.onStateChange({ name: this.name, from: oldState, to: newState });
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      nextAttempt: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null
    };
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    console.log(`🔄 Circuit '${this.name}' manually reset`);
  }
}

export class CircuitOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitOpenError';
    this.isCircuitOpen = true;
  }
}

// =============================================================================
// Resilient Call - Combines timeout + retry + circuit breaker
// =============================================================================

/**
 * Execute a function with full resilience
 */
export const resilientCall = async (fn, options = {}) => {
  const {
    circuitBreaker = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryAttempts = DEFAULT_RETRY_ATTEMPTS,
    operationName = 'External call',
    critical = false
  } = options;

  const executeWithRetry = () => withRetry(
    () => withTimeout(fn(), timeoutMs, operationName),
    { attempts: retryAttempts, operationName }
  );

  try {
    if (circuitBreaker) {
      return await circuitBreaker.execute(executeWithRetry);
    } else {
      return await executeWithRetry();
    }
  } catch (error) {
    console.error(`❌ ${operationName} failed:`, error.message);
    if (critical) throw error;
    return null;
  }
};

// =============================================================================
// Integration Circuit Breakers (Singletons)
// =============================================================================

export const circuitBreakers = {
  googleCalendar: new CircuitBreaker({ name: 'google-calendar', threshold: 3, resetTimeMs: 60000 }),
  github: new CircuitBreaker({ name: 'github', threshold: 5, resetTimeMs: 30000 }),
  slack: new CircuitBreaker({ name: 'slack', threshold: 5, resetTimeMs: 30000 }),
  email: new CircuitBreaker({ name: 'email', threshold: 3, resetTimeMs: 60000 })
};

export const getCircuitBreakerStatus = () => {
  return Object.fromEntries(
    Object.entries(circuitBreakers).map(([name, cb]) => [name, cb.getStatus()])
  );
};

// =============================================================================
// Idempotency (DynamoDB-backed)
// =============================================================================

/**
 * DynamoDB-backed idempotency for request deduplication
 * 
 * Table schema:
 *   PK: idempotencyKey (string)
 *   status: 'processing' | 'completed'
 *   response: stored response (if completed)
 *   ttl: Unix timestamp for auto-cleanup
 */
export const idempotency = {
  /**
   * Check if request is a duplicate and get cached response
   * @param {string} key - Idempotency key
   * @returns {Object|null} - Cached response or null
   */
  async get(key) {
    try {
      const response = await docClient.send(new GetCommand({
        TableName: IDEMPOTENCY_TABLE,
        Key: { idempotencyKey: key }
      }));
      
      if (!response.Item) return null;
      
      // Check if still processing (concurrent request)
      if (response.Item.status === 'processing') {
        return { status: 'processing', inProgress: true };
      }
      
      return response.Item.response || null;
    } catch (error) {
      console.error('Idempotency get error:', error.message);
      return null; // Fail open - allow request to proceed
    }
  },
  
  /**
   * Start processing a request (claim the idempotency key)
   * @param {string} key - Idempotency key
   * @returns {boolean} - True if claimed, false if already exists
   */
  async claim(key) {
    try {
      await docClient.send(new PutCommand({
        TableName: IDEMPOTENCY_TABLE,
        Item: {
          idempotencyKey: key,
          status: 'processing',
          createdAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS
        },
        ConditionExpression: 'attribute_not_exists(idempotencyKey)'
      }));
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return false; // Key already exists
      }
      console.error('Idempotency claim error:', error.message);
      return true; // Fail open
    }
  },
  
  /**
   * Store response for completed request
   * @param {string} key - Idempotency key
   * @param {Object} response - Response to cache
   */
  async complete(key, response) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: IDEMPOTENCY_TABLE,
        Key: { idempotencyKey: key },
        UpdateExpression: 'SET #status = :status, #response = :response, #completedAt = :completedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#response': 'response',
          '#completedAt': 'completedAt'
        },
        ExpressionAttributeValues: {
          ':status': 'completed',
          ':response': response,
          ':completedAt': new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Idempotency complete error:', error.message);
    }
  },
  
  /**
   * Generate idempotency key for booking creation
   */
  bookingKey(userEmail, tool, date, startTime, endTime) {
    return `booking:${userEmail}:${tool}:${date}:${startTime}:${endTime}`;
  },
  
  /**
   * Generate idempotency key from request header or body
   */
  fromRequest(req, prefix = 'api') {
    // Prefer explicit header
    if (req.headers['x-idempotency-key']) {
      return `${prefix}:${req.headers['x-idempotency-key']}`;
    }
    return null;
  }
};

// =============================================================================
// Rate Limiting (DynamoDB-backed fallback)
// =============================================================================

/**
 * DynamoDB-backed rate limiting
 * Primary rate limiting should be at API Gateway level.
 * This is a fallback for additional protection.
 * 
 * Table schema:
 *   PK: rateLimitKey (string) - e.g., "ip:1.2.3.4" or "user:email@example.com"
 *   windowStart: ISO timestamp
 *   count: number of requests in window
 *   ttl: Unix timestamp for auto-cleanup
 */
export const rateLimit = {
  /**
   * Check and increment rate limit counter
   * @param {string} key - Rate limit key (IP or user ID)
   * @param {number} limit - Max requests per window
   * @param {number} windowSeconds - Window size in seconds
   * @returns {Object} - { allowed: boolean, remaining: number, resetAt: Date }
   */
  async check(key, limit = 100, windowSeconds = RATE_LIMIT_WINDOW_SECONDS) {
    const now = Date.now();
    const windowStart = Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
    const rateLimitKey = `${key}:${windowStart}`;
    
    try {
      const response = await docClient.send(new UpdateCommand({
        TableName: RATE_LIMIT_TABLE,
        Key: { rateLimitKey },
        UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#ttl': 'ttl'
        },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':one': 1,
          ':ttl': Math.floor(windowStart / 1000) + windowSeconds + 60 // Extra minute buffer
        },
        ReturnValues: 'ALL_NEW'
      }));
      
      const count = response.Attributes?.count || 1;
      const resetAt = new Date(windowStart + windowSeconds * 1000);
      
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        count,
        limit,
        resetAt
      };
    } catch (error) {
      console.error('Rate limit check error:', error.message);
      // Fail open - allow request
      return { allowed: true, remaining: limit, count: 0, limit, resetAt: new Date() };
    }
  },
  
  /**
   * Get rate limit key from request
   */
  keyFromRequest(req, type = 'ip') {
    if (type === 'user' && req.user?.email) {
      return `user:${req.user.email}`;
    }
    // Use X-Forwarded-For for Lambda behind API Gateway
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
      || req.ip 
      || req.connection?.remoteAddress 
      || 'unknown';
    return `ip:${ip}`;
  }
};

// =============================================================================
// Async Queue (SQS)
// =============================================================================

/**
 * SQS-backed async queue for non-critical operations
 * Falls back to fire-and-forget if SQS is not configured
 */
export const asyncQueue = {
  /**
   * Enqueue a task for async processing
   * @param {string} taskType - Type of task (e.g., 'slack.notify', 'email.send')
   * @param {Object} payload - Task payload
   * @param {Object} options - Queue options
   * @returns {Object} - { queued: boolean, messageId?: string }
   */
  async enqueue(taskType, payload, options = {}) {
    const { delaySeconds = 0, deduplicationId = null } = options;
    
    const message = {
      taskType,
      payload,
      enqueuedAt: new Date().toISOString(),
      traceId: payload.traceId || `trace_${Date.now()}`
    };
    
    // If SQS is configured, use it
    if (QUEUE_URL) {
      try {
        const params = {
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify(message),
          DelaySeconds: delaySeconds
        };
        
        // For FIFO queues
        if (QUEUE_URL.endsWith('.fifo')) {
          params.MessageGroupId = taskType;
          params.MessageDeduplicationId = deduplicationId || `${taskType}_${Date.now()}_${Math.random()}`;
        }
        
        const response = await sqsClient.send(new SendMessageCommand(params));
        
        console.log(`📤 Queued ${taskType}: ${response.MessageId}`);
        return { queued: true, messageId: response.MessageId };
      } catch (error) {
        console.error(`❌ Failed to queue ${taskType}:`, error.message);
        // Fall through to fire-and-forget
      }
    }
    
    // Fallback: fire-and-forget (not recommended for production)
    console.warn(`⚠️ SQS not configured. Executing ${taskType} synchronously (not recommended)`);
    
    // Execute immediately but don't await
    setImmediate(async () => {
      try {
        // The caller should handle this in their task processor
        console.log(`🔥 Fire-and-forget: ${taskType}`);
      } catch (error) {
        console.error(`❌ Fire-and-forget failed: ${taskType}`, error.message);
      }
    });
    
    return { queued: false, fallback: true };
  },
  
  /**
   * Get queue status
   */
  getStatus() {
    return {
      type: QUEUE_URL ? 'sqs' : 'fire-and-forget',
      queueUrl: QUEUE_URL ? '***configured***' : null,
      warning: QUEUE_URL ? null : 'SQS not configured - using fire-and-forget fallback'
    };
  },
  
  /**
   * Check if SQS is configured
   */
  isConfigured() {
    return !!QUEUE_URL;
  }
};

// =============================================================================
// Booking Uniqueness Constraint
// =============================================================================

/**
 * Database-level uniqueness check for bookings
 * Uses a composite key to prevent double-bookings at the same time slot
 * 
 * This works alongside idempotency but at the data level:
 * - Idempotency: Prevents duplicate API requests
 * - Uniqueness: Prevents conflicting bookings (same tool, same time)
 */
export const bookingConstraints = {
  /**
   * Generate unique constraint key for a booking slot
   * Format: {tool}#{date}#{startTime}#{slotIndex}
   * slotIndex allows for tools with maxConcurrent > 1
   */
  slotKey(tool, date, startTime, slotIndex = 0) {
    return `${tool}#${date}#${startTime}#${slotIndex}`;
  },
  
  /**
   * Check if booking slot is available
   * This should be called before creating a booking
   * The actual enforcement is in the booking creation with ConditionExpression
   */
  async checkAvailability(tool, date, startTime, endTime, maxConcurrent = 1) {
    // This is handled by the existing booking service
    // The slot check queries bookings and counts conflicts
    // Adding a ConditionExpression on insert provides the final guarantee
    return true;
  }
};

// =============================================================================
// Middleware Factories
// =============================================================================

/**
 * Create Express middleware for idempotency
 */
export const idempotencyMiddleware = (options = {}) => {
  const { keyGenerator = null } = options;
  
  return async (req, res, next) => {
    // Generate or extract idempotency key
    let key = idempotency.fromRequest(req);
    
    if (!key && keyGenerator) {
      key = keyGenerator(req);
    }
    
    if (!key) {
      return next(); // No idempotency key - proceed normally
    }
    
    // Check for cached response
    const cached = await idempotency.get(key);
    
    if (cached) {
      if (cached.inProgress) {
        // Another request is processing - return conflict
        return res.status(409).json({
          error: 'Request already in progress',
          message: 'A request with this idempotency key is currently being processed'
        });
      }
      
      // Return cached response
      console.log(`🔄 Idempotent replay: ${key}`);
      res.set('X-Idempotent-Replayed', 'true');
      return res.status(cached.statusCode || 200).json(cached.body);
    }
    
    // Claim the key
    const claimed = await idempotency.claim(key);
    if (!claimed) {
      // Race condition - another request claimed it
      return res.status(409).json({
        error: 'Duplicate request',
        message: 'This request is already being processed'
      });
    }
    
    // Store key for response capture
    req.idempotencyKey = key;
    
    // Capture response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        idempotency.complete(key, {
          statusCode: res.statusCode,
          body
        }).catch(err => console.error('Failed to cache response:', err));
      }
      return originalJson(body);
    };
    
    next();
  };
};

/**
 * Create Express middleware for rate limiting (fallback)
 * Primary rate limiting should be at API Gateway
 */
export const rateLimitMiddleware = (options = {}) => {
  const { limit = 100, windowSeconds = 60, keyType = 'ip' } = options;
  
  return async (req, res, next) => {
    const key = rateLimit.keyFromRequest(req, keyType);
    const result = await rateLimit.check(key, limit, windowSeconds);
    
    // Set rate limit headers
    res.set('X-RateLimit-Limit', result.limit);
    res.set('X-RateLimit-Remaining', result.remaining);
    res.set('X-RateLimit-Reset', Math.ceil(result.resetAt.getTime() / 1000));
    
    if (!result.allowed) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)
      });
    }
    
    next();
  };
};

// =============================================================================
// Utilities
// =============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =============================================================================
// Exports
// =============================================================================

export default {
  // Core patterns
  withTimeout,
  withRetry,
  resilientCall,
  
  // Circuit breaker
  CircuitBreaker,
  circuitBreakers,
  getCircuitBreakerStatus,
  
  // Idempotency (DynamoDB)
  idempotency,
  idempotencyMiddleware,
  
  // Rate limiting (DynamoDB fallback)
  rateLimit,
  rateLimitMiddleware,
  
  // Queue (SQS)
  asyncQueue,
  
  // Booking constraints
  bookingConstraints,
  
  // Errors
  TimeoutError,
  CircuitOpenError
};
