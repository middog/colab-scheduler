/**
 * SDCoLab Scheduler - OAuth Service
 * 
 * Multi-provider OAuth2/OIDC authentication.
 * Supports: Google, Microsoft, GitHub, Generic OIDC
 * 
 * 🔥 Fire Triangle: OXYGEN layer - identity and access
 */

import { config, isFeatureEnabled } from './config.js';
import crypto from 'crypto';

// State storage (in production, use Redis/DynamoDB)
const stateStore = new Map();

/**
 * Generate OAuth state token
 * @param {string} redirectTo - Where to redirect after auth
 * @param {string} linkToEmail - If set, link provider to this existing account
 */
export const generateState = (redirectTo = '/', linkToEmail = null) => {
  const state = crypto.randomBytes(32).toString('hex');
  stateStore.set(state, { 
    redirectTo, 
    linkToEmail,
    createdAt: Date.now() 
  });
  
  // Clean up old states (older than 10 minutes)
  for (const [key, value] of stateStore) {
    if (Date.now() - value.createdAt > 10 * 60 * 1000) {
      stateStore.delete(key);
    }
  }
  
  return state;
};

/**
 * Verify and consume state token
 */
export const verifyState = (state) => {
  const data = stateStore.get(state);
  if (!data) return null;
  stateStore.delete(state);
  return data;
};

// =============================================================================
// Provider Configurations
// =============================================================================

const providers = {
  google: {
    name: 'Google',
    icon: 'google',
    color: '#4285F4',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['email', 'profile'],
    
    getAuthUrl(state) {
      const params = new URLSearchParams({
        client_id: config.oauth.google.clientId,
        redirect_uri: `${config.baseUrl}${config.oauth.google.callbackUrl}`,
        response_type: 'code',
        scope: this.scopes.join(' '),
        state,
        access_type: 'offline',
        prompt: 'consent'
      });
      return `${this.authUrl}?${params}`;
    },
    
    async exchangeCode(code) {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.oauth.google.clientId,
          client_secret: config.oauth.google.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${config.baseUrl}${config.oauth.google.callbackUrl}`
        })
      });
      return response.json();
    },
    
    async getUserInfo(accessToken) {
      const response = await fetch(this.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      return {
        providerId: data.id,
        email: data.email,
        firstName: data.given_name,
        lastName: data.family_name,
        displayName: data.name,
        avatarUrl: data.picture,
        emailVerified: data.verified_email
      };
    }
  },
  
  microsoft: {
    name: 'Microsoft',
    icon: 'microsoft',
    color: '#00A4EF',
    
    get authUrl() {
      return `https://login.microsoftonline.com/${config.oauth.microsoft.tenantId}/oauth2/v2.0/authorize`;
    },
    get tokenUrl() {
      return `https://login.microsoftonline.com/${config.oauth.microsoft.tenantId}/oauth2/v2.0/token`;
    },
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: ['user.read', 'email', 'profile', 'openid'],
    
    getAuthUrl(state) {
      const params = new URLSearchParams({
        client_id: config.oauth.microsoft.clientId,
        redirect_uri: `${config.baseUrl}${config.oauth.microsoft.callbackUrl}`,
        response_type: 'code',
        scope: this.scopes.join(' '),
        state,
        response_mode: 'query'
      });
      return `${this.authUrl}?${params}`;
    },
    
    async exchangeCode(code) {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.oauth.microsoft.clientId,
          client_secret: config.oauth.microsoft.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${config.baseUrl}${config.oauth.microsoft.callbackUrl}`
        })
      });
      return response.json();
    },
    
    async getUserInfo(accessToken) {
      const response = await fetch(this.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      return {
        providerId: data.id,
        email: data.mail || data.userPrincipalName,
        firstName: data.givenName,
        lastName: data.surname,
        displayName: data.displayName,
        avatarUrl: null, // Microsoft Graph requires separate call for photo
        emailVerified: true
      };
    }
  },
  
  github: {
    name: 'GitHub',
    icon: 'github',
    color: '#333',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    emailsUrl: 'https://api.github.com/user/emails',
    scopes: ['user:email', 'read:user'],
    
    getAuthUrl(state) {
      const params = new URLSearchParams({
        client_id: config.oauth.github.clientId,
        redirect_uri: `${config.baseUrl}${config.oauth.github.callbackUrl}`,
        scope: this.scopes.join(' '),
        state
      });
      return `${this.authUrl}?${params}`;
    },
    
    async exchangeCode(code) {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: config.oauth.github.clientId,
          client_secret: config.oauth.github.clientSecret,
          code
        })
      });
      return response.json();
    },
    
    async getUserInfo(accessToken) {
      // Get user profile
      const userResponse = await fetch(this.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      const userData = await userResponse.json();
      
      // Get email (might not be in profile)
      let email = userData.email;
      if (!email) {
        const emailsResponse = await fetch(this.emailsUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json'
          }
        });
        const emails = await emailsResponse.json();
        const primaryEmail = emails.find(e => e.primary) || emails[0];
        email = primaryEmail?.email;
      }
      
      // Parse name
      const nameParts = (userData.name || '').split(' ');
      
      return {
        providerId: String(userData.id),
        email,
        firstName: nameParts[0] || userData.login,
        lastName: nameParts.slice(1).join(' ') || '',
        displayName: userData.name || userData.login,
        avatarUrl: userData.avatar_url,
        emailVerified: true // GitHub verifies emails
      };
    }
  },
  
  oidc: {
    name: 'SSO',
    icon: 'key',
    color: '#6B7280',
    
    get authUrl() {
      return `${config.oauth.oidc.issuer}/authorize`;
    },
    get tokenUrl() {
      return `${config.oauth.oidc.issuer}/token`;
    },
    get userInfoUrl() {
      return `${config.oauth.oidc.issuer}/userinfo`;
    },
    scopes: ['openid', 'email', 'profile'],
    
    getAuthUrl(state) {
      const params = new URLSearchParams({
        client_id: config.oauth.oidc.clientId,
        redirect_uri: `${config.baseUrl}${config.oauth.oidc.callbackUrl}`,
        response_type: 'code',
        scope: this.scopes.join(' '),
        state
      });
      return `${this.authUrl}?${params}`;
    },
    
    async exchangeCode(code) {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.oauth.oidc.clientId,
          client_secret: config.oauth.oidc.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${config.baseUrl}${config.oauth.oidc.callbackUrl}`
        })
      });
      return response.json();
    },
    
    async getUserInfo(accessToken) {
      const response = await fetch(this.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      return {
        providerId: data.sub,
        email: data.email,
        firstName: data.given_name,
        lastName: data.family_name,
        displayName: data.name,
        avatarUrl: data.picture,
        emailVerified: data.email_verified
      };
    }
  }
};

// =============================================================================
// OAuth Service API
// =============================================================================

export const oauthService = {
  /**
   * Get list of enabled providers for UI
   */
  getEnabledProviders() {
    const enabled = [];
    if (isFeatureEnabled('authGoogle') && config.oauth.google.clientId) {
      enabled.push({ id: 'google', ...providers.google });
    }
    if (isFeatureEnabled('authMicrosoft') && config.oauth.microsoft.clientId) {
      enabled.push({ id: 'microsoft', ...providers.microsoft });
    }
    if (isFeatureEnabled('authGithub') && config.oauth.github.clientId) {
      enabled.push({ id: 'github', ...providers.github });
    }
    if (isFeatureEnabled('authOidc') && config.oauth.oidc.clientId) {
      enabled.push({ id: 'oidc', ...providers.oidc });
    }
    return enabled.map(p => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      color: p.color
    }));
  },
  
  /**
   * Get authorization URL for a provider
   * @param {string} providerId - Provider ID (google, microsoft, github, oidc)
   * @param {string} redirectTo - Where to redirect after auth
   * @param {string} linkToEmail - If set, link provider to this existing account
   */
  getAuthUrl(providerId, redirectTo = '/', linkToEmail = null) {
    const provider = providers[providerId];
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);
    
    const state = generateState(redirectTo, linkToEmail);
    return provider.getAuthUrl(state);
  },
  
  /**
   * Handle OAuth callback
   */
  async handleCallback(providerId, code, state) {
    const provider = providers[providerId];
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);
    
    // Verify state
    const stateData = verifyState(state);
    if (!stateData) throw new Error('Invalid or expired state');
    
    // Exchange code for tokens
    const tokens = await provider.exchangeCode(code);
    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error);
    }
    
    // Get user info
    const userInfo = await provider.getUserInfo(tokens.access_token);
    
    return {
      provider: providerId,
      providerId: userInfo.providerId,
      email: userInfo.email,
      profile: userInfo,
      tokens,
      redirectTo: stateData.redirectTo,
      linkToEmail: stateData.linkToEmail  // Pass through for account linking
    };
  }
};

export default oauthService;
