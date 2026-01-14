/**
 * SDCoLab Scheduler - Auth Middleware
 * 
 * JWT verification and role-based access control.
 * Supports both cookie-based and header-based authentication.
 * 
 * 🔥 Fire Triangle: OXYGEN layer - access control
 */

import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';
import { userService } from '../lib/database.js';

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
 * Require admin role
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

/**
 * Require valid scheduler API key OR authenticated admin
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
  
  // Fall back to admin authentication
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Valid API key or admin authentication required' });
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
    
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Admin access required' });
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
    
    // Superadmin has all capabilities
    if (req.user.role === 'superadmin') {
      return next();
    }
    
    // Admin has most capabilities
    if (req.user.role === 'admin' && capability !== 'superadmin_only') {
      return next();
    }
    
    if (!capabilities.includes(capability)) {
      return res.status(403).json({ error: `Capability required: ${capability}` });
    }
    
    next();
  };
};

/**
 * Check tool authorization
 */
export const requireToolAccess = (toolIdParam = 'tool') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Admins can access all tools
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
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

export default { 
  authenticate, 
  optionalAuth, 
  requireAdmin, 
  requireSchedulerKeyOrAdmin,
  requireRole, 
  requireCapability, 
  requireToolAccess 
};
