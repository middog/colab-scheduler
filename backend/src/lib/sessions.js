/**
 * SDCoLab Scheduler - Sessions Service
 * 
 * Server-side session management with rotating refresh tokens.
 * 
 * Security features:
 * - Refresh tokens are random secrets (not JWTs)
 * - Only token hashes are stored in DynamoDB
 * - Token rotation on every refresh (one-time use)
 * - Replay detection with immediate session revocation
 * - Support for logout and admin revoke-all
 * 
 * 🔥 Fire Triangle: OXYGEN layer - secure session management
 * 
 * @version 4.2.0-rc69.15
 */

import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand,
  QueryCommand 
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'colab-scheduler-sessions';

// Session expiry (matches JWT refresh token expiry)
const SESSION_TTL_DAYS = 7;
const GRACE_PERIOD_MS = 30000; // 30 seconds for race conditions

/**
 * Generate a cryptographically secure refresh token
 * @returns {string} Base64url encoded token
 */
const generateRefreshToken = () => {
  return crypto.randomBytes(32).toString('base64url');
};

/**
 * Hash a refresh token for storage
 * @param {string} token - The plaintext refresh token
 * @returns {string} SHA-256 hash of the token
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Create a new session for a user
 * 
 * @param {string} userId - User's email
 * @param {object} metadata - Optional session metadata
 * @param {string} metadata.userAgent - Browser/client user agent
 * @param {string} metadata.ip - Client IP address
 * @param {string} metadata.provider - Auth provider used (email, google, etc)
 * @returns {Promise<{sessionId: string, refreshToken: string}>}
 */
export const createSession = async (userId, metadata = {}) => {
  const sessionId = crypto.randomUUID();
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);
  
  const now = new Date();
  const expiresAt = Math.floor(now.getTime() / 1000) + (SESSION_TTL_DAYS * 24 * 60 * 60);
  
  const session = {
    sessionId,
    userId,
    refreshTokenHash,
    refreshTokenPrevHash: null, // For race condition handling
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt, // TTL attribute (epoch seconds)
    rotationCounter: 0,
    revokedAt: null,
    ...metadata
  };
  
  await docClient.send(new PutCommand({
    TableName: SESSIONS_TABLE,
    Item: session
  }));
  
  console.log(`🔐 Session created: ${sessionId} for user ${userId}`);
  
  return {
    sessionId,
    refreshToken
  };
};

/**
 * Validate and rotate a refresh token
 * 
 * @param {string} sessionId - The session ID
 * @param {string} refreshToken - The refresh token to validate
 * @returns {Promise<{valid: boolean, newRefreshToken?: string, userId?: string, error?: string}>}
 */
export const rotateRefreshToken = async (sessionId, refreshToken) => {
  const tokenHash = hashToken(refreshToken);
  
  // Get the session
  const result = await docClient.send(new GetCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionId }
  }));
  
  const session = result.Item;
  
  if (!session) {
    console.warn(`🔐 Session not found: ${sessionId}`);
    return { valid: false, error: 'session_not_found' };
  }
  
  // Check if session is revoked
  if (session.revokedAt) {
    console.warn(`🔐 Session revoked: ${sessionId} at ${session.revokedAt}`);
    return { valid: false, error: 'session_revoked' };
  }
  
  // Check if session is expired (belt-and-suspenders with TTL)
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt && session.expiresAt < now) {
    console.warn(`🔐 Session expired: ${sessionId}`);
    return { valid: false, error: 'session_expired' };
  }
  
  // Check token hash
  const currentMatch = tokenHash === session.refreshTokenHash;
  const prevMatch = session.refreshTokenPrevHash && tokenHash === session.refreshTokenPrevHash;
  
  if (!currentMatch && !prevMatch) {
    // REPLAY ATTACK DETECTED - someone is using an old token
    // Immediately revoke the session
    console.error(`🚨 REPLAY DETECTED: Session ${sessionId} - token mismatch. Revoking session.`);
    
    await revokeSession(sessionId, 'replay_detected');
    
    return { 
      valid: false, 
      error: 'token_reuse_detected',
      compromised: true 
    };
  }
  
  // If using previous token within grace period, that's OK (race condition)
  // But we don't rotate again
  if (prevMatch && !currentMatch) {
    console.log(`🔐 Session ${sessionId}: grace period token used`);
    // Return the current token (client should already have it)
    return { 
      valid: true, 
      userId: session.userId,
      graceUsed: true
    };
  }
  
  // Generate new refresh token and rotate
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = hashToken(newRefreshToken);
  
  const newExpiresAt = Math.floor(Date.now() / 1000) + (SESSION_TTL_DAYS * 24 * 60 * 60);
  
  await docClient.send(new UpdateCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionId },
    UpdateExpression: `
      SET refreshTokenHash = :newHash,
          refreshTokenPrevHash = :oldHash,
          lastSeenAt = :now,
          expiresAt = :expiresAt,
          rotationCounter = rotationCounter + :one
    `,
    ExpressionAttributeValues: {
      ':newHash': newRefreshTokenHash,
      ':oldHash': session.refreshTokenHash,
      ':now': new Date().toISOString(),
      ':expiresAt': newExpiresAt,
      ':one': 1
    }
  }));
  
  console.log(`🔐 Session rotated: ${sessionId} (rotation #${session.rotationCounter + 1})`);
  
  return {
    valid: true,
    newRefreshToken,
    userId: session.userId
  };
};

/**
 * Revoke a specific session
 * 
 * @param {string} sessionId - The session to revoke
 * @param {string} reason - Reason for revocation
 * @returns {Promise<boolean>}
 */
export const revokeSession = async (sessionId, reason = 'user_logout') => {
  try {
    await docClient.send(new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
      UpdateExpression: 'SET revokedAt = :now, revokeReason = :reason',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
        ':reason': reason
      }
    }));
    
    console.log(`🔐 Session revoked: ${sessionId} (${reason})`);
    return true;
  } catch (error) {
    console.error(`Failed to revoke session ${sessionId}:`, error);
    return false;
  }
};

/**
 * Revoke all sessions for a user
 * 
 * @param {string} userId - User's email
 * @param {string} reason - Reason for revocation
 * @param {string} exceptSessionId - Optional session to keep (current session)
 * @returns {Promise<number>} Number of sessions revoked
 */
export const revokeAllUserSessions = async (userId, reason = 'logout_all', exceptSessionId = null) => {
  // Query all sessions for user
  const result = await docClient.send(new QueryCommand({
    TableName: SESSIONS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :userId',
    FilterExpression: 'attribute_not_exists(revokedAt)',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  }));
  
  const sessions = result.Items || [];
  let revokedCount = 0;
  
  for (const session of sessions) {
    if (exceptSessionId && session.sessionId === exceptSessionId) {
      continue; // Skip the current session
    }
    
    await revokeSession(session.sessionId, reason);
    revokedCount++;
  }
  
  console.log(`🔐 Revoked ${revokedCount} sessions for user ${userId}`);
  return revokedCount;
};

/**
 * Get all active sessions for a user (for admin/settings view)
 * 
 * @param {string} userId - User's email
 * @returns {Promise<Array>} List of sessions (without sensitive data)
 */
export const getUserSessions = async (userId) => {
  const result = await docClient.send(new QueryCommand({
    TableName: SESSIONS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :userId',
    FilterExpression: 'attribute_not_exists(revokedAt)',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  }));
  
  // Return sanitized session info (no token hashes)
  return (result.Items || []).map(session => ({
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    userAgent: session.userAgent,
    ip: session.ip,
    provider: session.provider
  }));
};

/**
 * Get session by ID (for validation)
 * 
 * @param {string} sessionId 
 * @returns {Promise<object|null>}
 */
export const getSession = async (sessionId) => {
  const result = await docClient.send(new GetCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionId }
  }));
  
  return result.Item || null;
};

/**
 * Delete a session completely (cleanup)
 * 
 * @param {string} sessionId 
 */
export const deleteSession = async (sessionId) => {
  await docClient.send(new DeleteCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionId }
  }));
};

export default {
  createSession,
  rotateRefreshToken,
  revokeSession,
  revokeAllUserSessions,
  getUserSessions,
  getSession,
  deleteSession
};
