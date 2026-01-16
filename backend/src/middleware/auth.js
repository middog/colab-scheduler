/**
 * SDCoLab Scheduler - Auth Middleware
 * 
 * JWT verification and role-based access control.
 * Supports both cookie-based and header-based authentication.
 * 
 * 🔥 Fire Triangle Role System:
 *   - participant: Basic access (schedule, book, view own certs)
 *   - tender: Tool-scoped admin (manages specific tools via toolGrants)
 *   - operator: Full system access (integrations, templates, role management)
 */

import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';
import { userService } from '../lib/database.js';

// =============================================================================
// Role Normalization (backward compatibility)
// =============================================================================

const ROLE_MAP = {
  member: 'participant',
  certified: 'participant',
  instructor: 'participant',
  steward: 'participant',
  admin: 'tender',
  superadmin: 'operator',
  // New roles map to themselves
  participant: 'participant',
  tender: 'tender',
  operator: 'operator'
};

/**
 * Normalize legacy roles to new Fire Triangle roles
 */
export const normalizeRole = (role) => ROLE_MAP[role] || 'participant';

/**
 * Check if user has operator-level access (full system)
 */
export const isOperator = (user) => {
  const normalized = normalizeRole(user?.role);
  return normalized === 'operator';
};

/**
 * Check if user has tender-level access (tool-scoped admin)
 * Legacy admins with no toolGrants get ['*'] (all tools)
 */
export const isTender = (user) => {
  const normalized = normalizeRole(user?.role);
  return normalized === 'tender' || normalized === 'operator';
};

/**
 * Check if user can manage a specific tool
 * Operators can manage all tools
 * Tenders can manage tools in their toolGrants array
 * Legacy admins (no toolGrants) can manage all tools
 */
export const canManageTool = (user, toolId) => {
  if (!user) return false;
  if (isOperator(user)) return true;
  if (!isTender(user)) return false;
  
  const grants = user.toolGrants || [];
  // Legacy admins without toolGrants get full access
  if (grants.length === 0 && user.role === 'admin') return true;
  // Check for wildcard or specific tool
  return grants.includes('*') || grants.includes(toolId);
};

/**
 * Verify JWT and attach user to request
 * Supports both cookie auth (req.authToken) and header auth
 */
export const authenticate = async (req, res, next) => {
  // First check for token from extractAuthMiddleware (cookies or header)
  let token = req.authToken;
  
  // Fall back to Authorization header if not set by middleware
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await userService.get(decoded.email);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active', status: user.status });
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (req, res, next) => {
  // First check for token from extractAuthMiddleware
  let token = req.authToken;
  
  // Fall back to Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await userService.get(decoded.email);
    if (user && user.status === 'active') {
      req.user = user;
    }
  } catch (error) {
    // Ignore errors - optional auth
  }
  
  next();
};

/**
 * Require tender or operator role (tool management access)
 * Note: This grants access but tool-specific actions still need canManageTool check
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!isTender(req.user)) {
    return res.status(403).json({ error: 'Tender or Operator access required' });
  }
  
  next();
};

/**
 * Require operator role (full system access)
 */
export const requireOperator = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!isOperator(req.user)) {
    return res.status(403).json({ error: 'Operator access required' });
  }
  
  next();
};

/**
 * Require valid scheduler API key OR authenticated tender/operator
 * Used for scheduler endpoints that can be called by cron/Lambda or manually by admins
 */
export const requireSchedulerKeyOrAdmin = async (req, res, next) => {
  // Check scheduler API key first
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === config.scheduler.apiKey) {
    // Valid scheduler key - allow through
    req.isScheduler = true;
    return next();
  }
  
  // Fall back to tender/operator authentication
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Valid API key or Tender/Operator authentication required' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await userService.get(decoded.email);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }
    
    if (!isTender(user)) {
      return res.status(403).json({ error: 'Tender or Operator access required' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token or API key' });
  }
};

/**
 * Require specific role(s)
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `One of these roles required: ${roles.join(', ')}` });
    }
    
    next();
  };
};

/**
 * Require specific capability
 */
export const requireCapability = (capability) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const capabilities = req.user.permissions?.capabilities || [];
    
    // Operators have all capabilities
    if (isOperator(req.user)) {
      return next();
    }
    
    // Tenders have most capabilities (except operator-only)
    if (isTender(req.user) && capability !== 'operator_only') {
      return next();
    }
    
    if (!capabilities.includes(capability)) {
      return res.status(403).json({ error: `Capability required: ${capability}` });
    }
    
    next();
  };
};

/**
 * Check tool authorization for booking
 */
export const requireToolAccess = (toolIdParam = 'tool') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Operators and Tenders bypass tool access for booking (they manage, not necessarily use)
    if (isTender(req.user)) {
      return next();
    }
    
    const toolId = req.body[toolIdParam] || req.params[toolIdParam];
    
    if (!toolId) {
      return next();
    }
    
    const allowedTools = req.user.permissions?.tools || [];
    
    if (!allowedTools.includes(toolId)) {
      const tool = config.tools.find(t => t.id === toolId);
      return res.status(403).json({ 
        error: 'Not authorized for this tool',
        tool: tool?.name || toolId,
        message: 'You need certification to book this tool.'
      });
    }
    
    next();
  };
};

/**
 * Require tool management access (for tender tool-scoped actions)
 */
export const requireToolManagement = (toolIdParam = 'tool') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const toolId = req.body[toolIdParam] || req.params[toolIdParam] || req.query[toolIdParam];
    
    if (!toolId) {
      return next();
    }
    
    if (!canManageTool(req.user, toolId)) {
      const tool = config.tools.find(t => t.id === toolId);
      return res.status(403).json({ 
        error: 'Not authorized to manage this tool',
        tool: tool?.name || toolId,
        message: 'You do not have management access for this tool.'
      });
    }
    
    next();
  };
};

export default { 
  authenticate, 
  optionalAuth, 
  requireAdmin,
  requireOperator,
  requireSchedulerKeyOrAdmin,
  requireRole, 
  requireCapability, 
  requireToolAccess,
  requireToolManagement,
  // Role utilities
  normalizeRole,
  isOperator,
  isTender,
  canManageTool
};
