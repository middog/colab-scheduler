/**
 * SDCoLab Scheduler - Auth Routes
 * 
 * Authentication endpoints for all providers:
 * - Email/Password
 * - Google, Microsoft, GitHub OAuth
 * - Generic OIDC
 * - Password reset
 * - Session management (v4.2.0-rc69.15)
 * 
 * Security features (v4.2.0-rc69.15):
 * - Server-side refresh token storage with rotation
 * - Replay attack detection
 * - Session revocation (logout, logout-all)
 * - HttpOnly cookie authentication
 * - Input validation with Zod
 * 
 * 🔥 Fire Triangle: OXYGEN layer - identity and access
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config, isFeatureEnabled, getEnabledAuthProviders } from '../lib/config.js';
import { userService, activityService, inviteService } from '../lib/database.js';
import { oauthService } from '../lib/oauth.js';
import { sendPasswordResetEmail } from '../integrations/email.js';
import { 
  createSession, 
  rotateRefreshToken, 
  revokeSession, 
  revokeAllUserSessions,
  getUserSessions 
} from '../lib/sessions.js';
import { setAuthCookies, clearAuthCookies, getTokensFromCookies } from '../lib/cookies.js';
import { validate, validateBody, validateParams } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  logoutSchema,
  logoutAllSchema,
  sessionParamsSchema
} from '../schemas/auth.js';
import { 
  ErrorCodes, 
  sendSuccess, 
  sendError 
} from '../lib/responses.js';

const router = Router();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate an access token (short-lived JWT)
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { email: user.email, role: user.role, id: user.id },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

/**
 * Generate tokens for a user with session creation
 * @param {object} user - User object
 * @param {object} metadata - Session metadata (userAgent, ip, provider)
 * @returns {Promise<{accessToken: string, refreshToken: string, sessionId: string}>}
 */
const generateTokensWithSession = async (user, metadata = {}) => {
  const accessToken = generateAccessToken(user);
  
  // Create server-side session with rotating refresh token
  const { sessionId, refreshToken } = await createSession(user.email, metadata);
  
  return { accessToken, refreshToken, sessionId };
};

/**
 * Legacy token generation (for backwards compatibility during transition)
 * @deprecated Use generateTokensWithSession instead
 */
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { email: user.email, role: user.role, id: user.id },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  
  const refreshToken = jwt.sign(
    { email: user.email, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
  
  return { accessToken, refreshToken };
};

const sanitizeUser = (user) => {
  const { passwordHash, passwordResetToken, passwordResetExpires, doorAccessCode, alarmCode, ...safe } = user;
  return safe;
};

// =============================================================================
// Public Routes
// =============================================================================

/**
 * GET /api/auth/providers
 * List available auth providers
 */
router.get('/providers', (req, res) => {
  const providers = [];
  
  if (isFeatureEnabled('authEmail')) {
    providers.push({ id: 'email', name: 'Email', icon: 'mail' });
  }
  
  providers.push(...oauthService.getEnabledProviders());
  
  sendSuccess(res, {
    providers,
    selfRegistration: isFeatureEnabled('selfRegistration'),
    inviteRequired: !isFeatureEnabled('selfRegistration')
  });
});

/**
 * POST /api/auth/register
 * Self-registration with email/password
 */
router.post('/register', validateBody(registerSchema), async (req, res) => {
  if (!isFeatureEnabled('selfRegistration')) {
    return sendError(res, ErrorCodes.FORBIDDEN, 'Self-registration is disabled');
  }
  
  if (!isFeatureEnabled('authEmail')) {
    return sendError(res, ErrorCodes.FORBIDDEN, 'Email authentication is disabled');
  }
  
  try {
    const { email, password, firstName, lastName, displayName, inviteCode } = req.body;
    
    // Check if user exists
    const existing = await userService.get(email);
    if (existing) {
      return sendError(res, ErrorCodes.CONFLICT, 'Email already registered');
    }
    
    // Check invite code if provided
    let invite = null;
    if (inviteCode) {
      invite = await inviteService.get(inviteCode);
      if (!invite || invite.status !== 'pending') {
        return sendError(res, ErrorCodes.BAD_REQUEST, 'Invalid invite code');
      }
      if (new Date(invite.expiresAt) < new Date()) {
        return sendError(res, ErrorCodes.BAD_REQUEST, 'Invite code expired');
      }
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await userService.create({
      email,
      firstName,
      lastName,
      displayName: displayName || `${firstName} ${lastName}`.trim(),
      passwordHash,
      authProviders: [{
        provider: 'email',
        providerId: email,
        linkedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      }],
      // If invited, use invite's permissions
      ...(invite && {
        status: 'active',
        role: invite.role,
        permissions: invite.permissions
      })
    });
    
    // Accept invite if used
    if (invite) {
      await inviteService.accept(inviteCode, user.email);
    }
    
    // Generate tokens with server-side session
    const { accessToken, refreshToken, sessionId } = await generateTokensWithSession(user, {
      provider: 'email',
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.headers['x-forwarded-for']
    });
    
    // Set HttpOnly cookies
    setAuthCookies(res, { accessToken, refreshToken, sessionId });
    
    sendSuccess(res, {
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
      sessionId,
      message: user.status === 'pending' 
        ? 'Account created. Awaiting admin approval.'
        : 'Account created successfully.'
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Registration failed');
  }
});

/**
 * POST /api/auth/login
 * Email/password login
 */
router.post('/login', validateBody(loginSchema), async (req, res) => {
  if (!isFeatureEnabled('authEmail')) {
    return sendError(res, ErrorCodes.FORBIDDEN, 'Email authentication is disabled');
  }
  
  try {
    const { email, password } = req.body;
    
    const user = await userService.get(email);
    if (!user) {
      return sendError(res, ErrorCodes.UNAUTHORIZED, 'Invalid credentials');
    }
    
    // Check if email auth is linked
    const hasEmailAuth = user.authProviders?.some(ap => ap.provider === 'email');
    if (!hasEmailAuth && !user.passwordHash) {
      // User registered with OAuth, no password set
      // SECURITY: Don't reveal account existence or linked providers
      return sendError(res, ErrorCodes.UNAUTHORIZED, 'Invalid credentials');
    }
    
    // Check password (allow 'demodemo' in dev environment for testing)
    const isDev = config.env === 'development' || config.env === 'dev';
    const isValidPassword = 
      (isDev && password === 'demodemo') ||
      (user.passwordHash && await bcrypt.compare(password, user.passwordHash));
    
    if (!isValidPassword) {
      return sendError(res, ErrorCodes.UNAUTHORIZED, 'Invalid credentials');
    }
    
    // Check status
    if (user.status === 'pending') {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Account pending approval', { status: 'pending' });
    }
    if (user.status === 'suspended' || user.status === 'deactivated') {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Account is disabled', { status: user.status });
    }
    
    // Record login
    await userService.recordLogin(email, 'email');
    
    // Log activity
    await activityService.log('auth.login', user, { type: 'user', id: email }, { provider: 'email' });
    
    // Generate tokens with server-side session
    const { accessToken, refreshToken, sessionId } = await generateTokensWithSession(user, {
      provider: 'email',
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.headers['x-forwarded-for']
    });
    
    // Set HttpOnly cookies
    setAuthCookies(res, { accessToken, refreshToken, sessionId });
    
    sendSuccess(res, {
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
      sessionId
    });
  } catch (error) {
    console.error('Login error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Login failed');
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token with token rotation
 * 
 * Security (v4.2.0-rc69.15):
 * - Validates refresh token against server-side session
 * - Rotates refresh token on each use (one-time tokens)
 * - Detects and revokes on replay attacks
 * - Supports cookie-based auth
 */
router.post('/refresh', async (req, res) => {
  try {
    // Get tokens from cookies or body
    const cookieTokens = getTokensFromCookies(req);
    const refreshTokenValue = req.body.refreshToken || cookieTokens.refreshToken || req.refreshToken;
    const sessionIdValue = req.body.sessionId || cookieTokens.sessionId || req.sessionId;
    
    if (!refreshTokenValue) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Refresh token required');
    }
    
    // New session-based refresh (v4.2.0-rc69.15)
    if (sessionIdValue) {
      const result = await rotateRefreshToken(sessionIdValue, refreshTokenValue);
      
      if (!result.valid) {
        // Clear cookies on failure
        clearAuthCookies(res);
        
        // Handle different error types
        if (result.compromised) {
          // Session was compromised - force re-login everywhere
          console.error(`🚨 Compromised session detected for sessionId: ${sessionIdValue}`);
          return res.status(401).json({ 
            success: false,
            error: {
              code: 'SESSION_COMPROMISED',
              message: 'Please log in again for security'
            },
            timestamp: new Date().toISOString()
          });
        }
        
        return res.status(401).json({ 
          success: false,
          error: {
            code: 'SESSION_INVALID',
            message: result.error || 'Invalid session'
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Get user for new access token
      const user = await userService.get(result.userId);
      if (!user || user.status !== 'active') {
        clearAuthCookies(res);
        return sendError(res, ErrorCodes.UNAUTHORIZED, 'User not found or inactive');
      }
      
      const accessToken = generateAccessToken(user);
      
      // Prepare response
      const responseData = { accessToken, sessionId: sessionIdValue };
      
      // Set new cookies - update access token always
      const cookieData = { accessToken, sessionId: sessionIdValue };
      
      // Only include new refresh token if rotated (not grace period)
      if (result.newRefreshToken) {
        responseData.refreshToken = result.newRefreshToken;
        cookieData.refreshToken = result.newRefreshToken;
      }
      
      setAuthCookies(res, cookieData);
      
      return sendSuccess(res, responseData);
    }
    
    // Legacy JWT-based refresh (for backwards compatibility)
    // TODO: Remove after migration period
    try {
      const decoded = jwt.verify(refreshTokenValue, config.jwt.secret);
      if (decoded.type !== 'refresh') {
        return sendError(res, ErrorCodes.UNAUTHORIZED, 'Invalid token type');
      }
      
      const user = await userService.get(decoded.email);
      if (!user || user.status !== 'active') {
        return sendError(res, ErrorCodes.UNAUTHORIZED, 'User not found or inactive');
      }
      
      // Create a new session for this user (migrate to session-based)
      const { accessToken, refreshToken: newRefreshToken, sessionId: newSessionId } = 
        await generateTokensWithSession(user, {
          provider: 'legacy_jwt_migration',
          userAgent: req.headers['user-agent'],
          ip: req.ip || req.headers['x-forwarded-for']
        });
      
      console.log(`🔐 Migrated legacy JWT to session: ${newSessionId} for ${user.email}`);
      
      // Set cookies for migrated session
      setAuthCookies(res, { accessToken, refreshToken: newRefreshToken, sessionId: newSessionId });
      
      sendSuccess(res, { 
        accessToken, 
        refreshToken: newRefreshToken,
        sessionId: newSessionId 
      });
    } catch (jwtError) {
      return sendError(res, ErrorCodes.UNAUTHORIZED, 'Invalid refresh token');
    }
  } catch (error) {
    console.error('Refresh error:', error);
    sendError(res, ErrorCodes.UNAUTHORIZED, 'Invalid refresh token');
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', validateBody(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await userService.get(email);
    
    // Always return success to prevent email enumeration
    if (!user) {
      return sendSuccess(res, { message: 'If an account exists, a reset email has been sent.' });
    }
    
    // Generate reset token and hash it before storage
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    
    // SECURITY: Store only the hash, not the plaintext token
    await userService.update(email, {
      passwordResetToken: resetTokenHash,
      passwordResetExpires: resetExpires
    });
    
    // Send password reset email with the actual token (not hash)
    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail(email, {
      displayName: user.displayName || user.firstName || email.split('@')[0],
      resetUrl
    });
    
    await activityService.log('auth.password_reset_requested', user, { type: 'user', id: email });
    
    sendSuccess(res, { message: 'If an account exists, a reset email has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Request failed');
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', validateBody(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.body;
    
    // SECURITY: Hash the provided token to compare with stored hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with this token hash
    const user = await userService.getByResetToken(tokenHash);
    
    if (!user) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Invalid or expired reset token');
    }
    
    // Update password
    const passwordHash = await bcrypt.hash(password, 10);
    await userService.update(user.email, {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null
    });
    
    await activityService.log('auth.password_reset', user, { type: 'user', id: user.email });
    
    sendSuccess(res, { message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Reset failed');
  }
});

// =============================================================================
// OAuth Routes
// =============================================================================

/**
 * GET /api/auth/:provider
 * Initiate OAuth flow
 */
router.get('/:provider(google|microsoft|github|oidc)', async (req, res) => {
  const { provider } = req.params;
  const { redirect } = req.query;
  
  const featureFlag = `auth${provider.charAt(0).toUpperCase() + provider.slice(1)}`;
  if (!isFeatureEnabled(featureFlag)) {
    return sendError(res, ErrorCodes.FORBIDDEN, `${provider} auth is disabled`);
  }
  
  try {
    const authUrl = oauthService.getAuthUrl(provider, redirect || '/');
    res.redirect(authUrl);
  } catch (error) {
    console.error(`OAuth ${provider} init error:`, error);
    res.redirect(`${config.frontendUrl}/?error=oauth_init_failed`);
  }
});

/**
 * GET /api/auth/:provider/callback
 * OAuth callback handler
 */
router.get('/:provider(google|microsoft|github|oidc)/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state, error: oauthError } = req.query;
  
  if (oauthError) {
    console.error(`OAuth ${provider} error:`, oauthError);
    return res.redirect(`${config.frontendUrl}/?error=${oauthError}`);
  }
  
  try {
    // Handle OAuth callback
    const authResult = await oauthService.handleCallback(provider, code, state);
    
    // Check if this is an account linking request
    if (authResult.linkToEmail) {
      // Linking a provider to an existing account
      const existingUser = await userService.get(authResult.linkToEmail);
      
      if (!existingUser) {
        return res.redirect(`${config.frontendUrl}/settings?error=user_not_found`);
      }
      
      // Check if this provider is already linked to another account
      const providerUser = await userService.getByProviderId(provider, authResult.providerId);
      if (providerUser && providerUser.email !== authResult.linkToEmail) {
        return res.redirect(`${config.frontendUrl}/settings?error=provider_linked_to_other_account`);
      }
      
      // Check if provider is already linked to this account
      const hasProvider = existingUser.authProviders?.some(ap => ap.provider === provider);
      if (hasProvider) {
        return res.redirect(`${config.frontendUrl}/settings?linked=${provider}&message=already_linked`);
      }
      
      // Link the provider
      await userService.linkProvider(existingUser.email, provider, authResult.providerId, existingUser);
      await activityService.log('user.provider_linked', existingUser, {
        type: 'user',
        id: existingUser.email
      }, { provider, oauthEmail: authResult.email });
      
      return res.redirect(`${config.frontendUrl}/settings?linked=${provider}&success=true`);
    }
    
    // Normal login/registration flow
    // Check if user exists
    let user = await userService.get(authResult.email);
    
    if (!user) {
      // Check if email is linked to different account via provider ID
      user = await userService.getByProviderId(provider, authResult.providerId);
    }
    
    if (user) {
      // Existing user - check if this provider is linked
      const hasProvider = user.authProviders?.some(ap => ap.provider === provider);
      
      if (!hasProvider) {
        // Link this provider to existing account
        await userService.linkProvider(user.email, provider, authResult.providerId);
        user = await userService.get(user.email);
      }
      
      // Check status
      if (user.status === 'pending') {
        return res.redirect(`${config.frontendUrl}/?error=pending_approval`);
      }
      if (user.status !== 'active') {
        return res.redirect(`${config.frontendUrl}/?error=account_disabled`);
      }
      
      // Record login
      await userService.recordLogin(user.email, provider);
      await activityService.log('auth.login', user, { type: 'user', id: user.email }, { provider });
      
    } else {
      // New user
      if (!isFeatureEnabled('selfRegistration')) {
        return res.redirect(`${config.frontendUrl}/?error=registration_disabled`);
      }
      
      // Create new user
      user = await userService.create({
        email: authResult.email,
        firstName: authResult.profile.firstName,
        lastName: authResult.profile.lastName,
        displayName: authResult.profile.displayName,
        avatarUrl: authResult.profile.avatarUrl,
        authProviders: [{
          provider,
          providerId: authResult.providerId,
          linkedAt: new Date().toISOString(),
          lastUsed: new Date().toISOString()
        }]
      });
    }
    
    // Generate tokens with server-side session
    const { accessToken, refreshToken, sessionId } = await generateTokensWithSession(user, {
      provider,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.headers['x-forwarded-for']
    });
    
    // SECURITY: Use URL fragment (#) instead of query params (?)
    // Fragments are not sent in HTTP referrer headers, preventing token leakage
    const redirectTo = authResult.redirectTo || '/';
    const callbackUrl = `${config.frontendUrl}/auth/callback#token=${accessToken}&refresh=${refreshToken}&session=${sessionId}&redirect=${encodeURIComponent(redirectTo)}`;
    
    res.redirect(callbackUrl);
    
  } catch (error) {
    console.error(`OAuth ${provider} callback error:`, error);
    res.redirect(`${config.frontendUrl}/?error=oauth_failed`);
  }
});

// =============================================================================
// Protected Routes (require authentication)
// =============================================================================

import { authenticate } from '../middleware/auth.js';

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', authenticate, (req, res) => {
  sendSuccess(res, { user: sanitizeUser(req.user) });
});

/**
 * POST /api/auth/logout
 * Logout - revokes the current session
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    // Get session from body, cookies, or middleware
    const sessionIdValue = sessionId || req.sessionId;
    
    // Revoke the session if provided
    if (sessionIdValue) {
      await revokeSession(sessionIdValue, 'user_logout');
    }
    
    // Clear auth cookies
    clearAuthCookies(res);
    
    await activityService.log('auth.logout', req.user, { type: 'user', id: req.user.email });
    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    // Clear cookies even on error
    clearAuthCookies(res);
    // Still return success - client should discard tokens either way
    sendSuccess(res, { message: 'Logged out successfully' });
  }
});

/**
 * POST /api/auth/logout-all
 * Logout from all devices - revokes all sessions for the user
 */
router.post('/logout-all', authenticate, validateBody(logoutAllSchema), async (req, res) => {
  try {
    const { keepCurrent, currentSessionId } = req.body;
    const currentSession = currentSessionId || req.sessionId;
    
    const revokedCount = await revokeAllUserSessions(
      req.user.email, 
      'logout_all',
      keepCurrent ? currentSession : null
    );
    
    // Clear cookies if not keeping current session
    if (!keepCurrent) {
      clearAuthCookies(res);
    }
    
    await activityService.log('auth.logout_all', req.user, { 
      type: 'user', 
      id: req.user.email 
    }, { 
      sessionsRevoked: revokedCount,
      keptCurrent: keepCurrent 
    });
    
    sendSuccess(res, { 
      message: 'Logged out from all devices',
      sessionsRevoked: revokedCount 
    });
  } catch (error) {
    console.error('Logout all error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to logout from all devices');
  }
});

/**
 * GET /api/auth/sessions
 * Get all active sessions for the current user
 */
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const sessions = await getUserSessions(req.user.email);
    sendSuccess(res, { sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get sessions');
  }
});

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verify this session belongs to the user (via the sessions service)
    const sessions = await getUserSessions(req.user.email);
    const session = sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Session not found');
    }
    
    await revokeSession(sessionId, 'user_revoked');
    
    await activityService.log('auth.session_revoked', req.user, { 
      type: 'session', 
      id: sessionId 
    });
    
    sendSuccess(res, { message: 'Session revoked' });
  } catch (error) {
    console.error('Revoke session error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to revoke session');
  }
});

/**
 * POST /api/auth/change-password
 * Change password (authenticated user)
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword, logoutOtherSessions, currentSessionId } = req.body;
    
    if (!newPassword || newPassword.length < 8) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'New password must be at least 8 characters');
    }
    
    // Verify current password
    if (req.user.passwordHash) {
      const isValid = await bcrypt.compare(currentPassword, req.user.passwordHash);
      if (!isValid) {
        return sendError(res, ErrorCodes.UNAUTHORIZED, 'Current password is incorrect');
      }
    }
    
    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await userService.update(req.user.email, { passwordHash }, req.user);
    
    // Ensure email auth provider is linked
    const hasEmailAuth = req.user.authProviders?.some(ap => ap.provider === 'email');
    if (!hasEmailAuth) {
      await userService.linkProvider(req.user.email, 'email', req.user.email, req.user);
    }
    
    // Optionally revoke other sessions (security best practice)
    let sessionsRevoked = 0;
    if (logoutOtherSessions) {
      sessionsRevoked = await revokeAllUserSessions(
        req.user.email, 
        'password_changed',
        currentSessionId // Keep current session
      );
    }
    
    await activityService.log('auth.password_changed', req.user, { 
      type: 'user', 
      id: req.user.email 
    }, { 
      otherSessionsRevoked: sessionsRevoked 
    });
    
    sendSuccess(res, { 
      message: 'Password changed successfully',
      sessionsRevoked 
    });
  } catch (error) {
    console.error('Change password error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to change password');
  }
});

/**
 * POST /api/auth/link/:provider
 * Link OAuth provider to current account
 */
router.get('/link/:provider', authenticate, (req, res) => {
  const { provider } = req.params;
  
  const featureFlag = `auth${provider.charAt(0).toUpperCase() + provider.slice(1)}`;
  if (!isFeatureEnabled(featureFlag)) {
    return sendError(res, ErrorCodes.FORBIDDEN, `${provider} auth is disabled`);
  }
  
  // Pass the authenticated user's email to link to their account
  const authUrl = oauthService.getAuthUrl(provider, '/settings', req.user.email);
  res.redirect(authUrl);
});

export default router;
