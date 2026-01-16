/**
 * SDCoLab Scheduler - Cookie Utilities
 * 
 * Secure cookie management for authentication tokens.
 * 
 * Security features:
 * - HttpOnly cookies (not accessible via JavaScript)
 * - Secure flag (HTTPS only in production)
 * - SameSite protection (CSRF mitigation)
 * - Separate paths for different token types
 * 
 * 🔥 Fire Triangle: OXYGEN layer - secure token delivery
 * 
 * @version 4.2.0-rc69.15
 */

import crypto from 'crypto';
import { config } from './config.js';

const isProduction = config.env === 'production';

// Cookie names
export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'colab_access',
  REFRESH_TOKEN: 'colab_refresh',
  SESSION_ID: 'colab_session',
  CSRF_TOKEN: 'colab_csrf'
};

// Cookie configuration
const getCookieConfig = () => {
  // Parse the frontend URL to get the domain
  let domain;
  try {
    const url = new URL(config.frontendUrl);
    // For localhost, don't set domain (browser default)
    // For production, use the root domain for cross-subdomain cookies
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      // Extract root domain (e.g., "example.com" from "app.example.com")
      const parts = url.hostname.split('.');
      if (parts.length >= 2) {
        domain = '.' + parts.slice(-2).join('.');
      }
    }
  } catch (e) {
    console.warn('Could not parse frontend URL for cookie domain:', e.message);
  }

  return {
    domain,
    secure: isProduction, // HTTPS only in production
    sameSite: isProduction ? 'strict' : 'lax', // Strict in production for CSRF protection
    httpOnly: true // Not accessible via JavaScript
  };
};

/**
 * Set authentication cookies on response
 * 
 * @param {Response} res - Express response object
 * @param {object} tokens - Token data
 * @param {string} tokens.accessToken - JWT access token
 * @param {string} tokens.refreshToken - Refresh token secret
 * @param {string} tokens.sessionId - Session identifier
 */
export const setAuthCookies = (res, { accessToken, refreshToken, sessionId }) => {
  const baseConfig = getCookieConfig();
  
  // Access token - short lived, needed for API calls
  // Path: /api to limit exposure
  if (accessToken) {
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, {
      ...baseConfig,
      path: '/api',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours (matches JWT expiry)
    });
  }
  
  // Refresh token - longer lived, only sent to refresh endpoint
  // Path: /api/auth/refresh to minimize exposure
  if (refreshToken) {
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
      ...baseConfig,
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (matches session expiry)
    });
  }
  
  // Session ID - needed for refresh and logout
  // Path: /api/auth for auth-related endpoints
  if (sessionId) {
    res.cookie(COOKIE_NAMES.SESSION_ID, sessionId, {
      ...baseConfig,
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  }
};

/**
 * Clear all authentication cookies
 * 
 * @param {Response} res - Express response object
 */
export const clearAuthCookies = (res) => {
  const baseConfig = getCookieConfig();
  
  // Clear each cookie with matching path
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, {
    ...baseConfig,
    path: '/api'
  });
  
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, {
    ...baseConfig,
    path: '/api/auth/refresh'
  });
  
  res.clearCookie(COOKIE_NAMES.SESSION_ID, {
    ...baseConfig,
    path: '/api/auth'
  });
};

/**
 * Extract tokens from cookies
 * 
 * @param {Request} req - Express request object
 * @returns {object} Extracted tokens
 */
export const getTokensFromCookies = (req) => {
  return {
    accessToken: req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN],
    refreshToken: req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN],
    sessionId: req.cookies?.[COOKIE_NAMES.SESSION_ID]
  };
};

/**
 * Generate a CSRF token for double-submit cookie pattern
 * 
 * @returns {string} Random CSRF token
 */
export const generateCsrfToken = () => {
  return crypto.randomBytes(32).toString('base64url');
};

/**
 * Set CSRF cookie (readable by JavaScript for header submission)
 * 
 * @param {Response} res - Express response object
 * @param {string} token - CSRF token
 */
export const setCsrfCookie = (res, token) => {
  const baseConfig = getCookieConfig();
  
  res.cookie(COOKIE_NAMES.CSRF_TOKEN, token, {
    ...baseConfig,
    httpOnly: false, // Must be readable by JavaScript
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
};

/**
 * Middleware to extract auth from cookies OR headers
 * Supports both cookie-based and header-based auth for backwards compatibility
 * 
 * @param {Request} req 
 * @param {Response} res 
 * @param {Function} next 
 */
export const extractAuthMiddleware = (req, res, next) => {
  // Try cookies first (preferred)
  const cookieTokens = getTokensFromCookies(req);
  
  if (cookieTokens.accessToken) {
    // Use cookie-based auth
    req.authToken = cookieTokens.accessToken;
    req.authMethod = 'cookie';
  } else {
    // Fall back to Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      req.authToken = authHeader.substring(7);
      req.authMethod = 'header';
    }
  }
  
  // Also extract session info from cookies if available
  if (cookieTokens.sessionId) {
    req.sessionId = cookieTokens.sessionId;
  }
  if (cookieTokens.refreshToken) {
    req.refreshToken = cookieTokens.refreshToken;
  }
  
  next();
};

export default {
  COOKIE_NAMES,
  setAuthCookies,
  clearAuthCookies,
  getTokensFromCookies,
  generateCsrfToken,
  setCsrfCookie,
  extractAuthMiddleware
};
