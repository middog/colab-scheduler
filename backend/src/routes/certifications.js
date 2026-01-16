/**
 * SDCoLab Scheduler - Certifications Routes
 * 
 * Comprehensive certification system:
 * - Define cert types with expiry, prerequisites, levels
 * - Track user certifications
 * - Instructor certification granting
 * - Training session management
 * - Expiry notifications
 * 
 * 🔥 Fire Triangle: OXYGEN layer - qualification governance
 * 
 * @version 4.2.0-rc69.15
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config, isFeatureEnabled } from '../lib/config.js';
import { userService, activityService } from '../lib/database.js';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth.js';
import { ErrorCodes, sendSuccess, sendError } from '../lib/responses.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const router = Router();

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const CERTS_TABLE = config.aws.tables.certifications || 'colab-scheduler-certifications';

// =============================================================================
// Certification Type Definitions (Admin Managed)
// =============================================================================

/**
 * GET /api/certifications/types
 * List all certification types (public for transparency)
 */
router.get('/types', async (req, res) => {
  try {
    const response = await docClient.send(new ScanCommand({
      TableName: CERTS_TABLE,
      FilterExpression: '#type = :type',
      ExpressionAttributeNames: { '#type': 'recordType' },
      ExpressionAttributeValues: { ':type': 'cert_type' }
    }));
    
    const certTypes = (response.Items || []).map(ct => ({
      id: ct.id,
      name: ct.name,
      description: ct.description,
      category: ct.category,
      level: ct.level, // basic, advanced, instructor
      requiresResources: ct.requiresResources || [], // tools/rooms this cert grants access to
      prerequisites: ct.prerequisites || [], // cert IDs required before this one
      expiryMonths: ct.expiryMonths, // null = never expires
      trainingRequired: ct.trainingRequired || false,
      trainingContent: ct.trainingContent || null, // URL or embedded content ref
      assessmentRequired: ct.assessmentRequired || false,
      grantableBy: ct.grantableBy || ['admin'], // ['admin', 'instructor', 'steward']
      isActive: ct.isActive !== false,
      createdAt: ct.createdAt
    }));
    
    sendSuccess(res, { 
      certificationTypes: certTypes,
      total: certTypes.length
    });
  } catch (error) {
    console.error('Get cert types error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get certification types');
  }
});

/**
 * POST /api/certifications/types
 * Create a new certification type (admin only)
 */
router.post('/types', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      level = 'basic',
      requiresResources = [],
      prerequisites = [],
      expiryMonths = null,
      trainingRequired = false,
      trainingContent = null,
      assessmentRequired = false,
      grantableBy = ['admin']
    } = req.body;
    
    if (!name) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Name is required');
    }
    
    const id = `cert-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const now = new Date().toISOString();
    
    const certType = {
      id,
      recordType: 'cert_type',
      name,
      description: description || '',
      category: category || 'general',
      level,
      requiresResources,
      prerequisites,
      expiryMonths,
      trainingRequired,
      trainingContent,
      assessmentRequired,
      grantableBy,
      isActive: true,
      createdAt: now,
      createdBy: req.user.email,
      updatedAt: now
    };
    
    await docClient.send(new PutCommand({
      TableName: CERTS_TABLE,
      Item: certType
    }));
    
    await activityService.log('cert_type.created', req.user, {
      type: 'cert_type',
      id,
      name
    }, { level, expiryMonths, prerequisites });
    
    sendSuccess(res, { certificationType: certType }, { status: 201 });
  } catch (error) {
    console.error('Create cert type error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create certification type');
  }
});

/**
 * PUT /api/certifications/types/:id
 * Update a certification type (admin only)
 */
router.put('/types/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const expressions = [];
    const names = {};
    const values = {};
    
    const allowedFields = [
      'name', 'description', 'category', 'level', 'requiresResources',
      'prerequisites', 'expiryMonths', 'trainingRequired', 'trainingContent',
      'assessmentRequired', 'grantableBy', 'isActive'
    ];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key) && value !== undefined) {
        expressions.push(`#${key} = :${key}`);
        names[`#${key}`] = key;
        values[`:${key}`] = value;
      }
    });
    
    expressions.push('#updatedAt = :updatedAt');
    names['#updatedAt'] = 'updatedAt';
    values[':updatedAt'] = new Date().toISOString();
    
    const response = await docClient.send(new UpdateCommand({
      TableName: CERTS_TABLE,
      Key: { id },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW'
    }));
    
    await activityService.log('cert_type.updated', req.user, {
      type: 'cert_type',
      id,
      name: response.Attributes?.name
    }, { updates: Object.keys(updates) });
    
    sendSuccess(res, { certificationType: response.Attributes });
  } catch (error) {
    console.error('Update cert type error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update certification type');
  }
});

/**
 * DELETE /api/certifications/types/:id
 * Deactivate a certification type (admin only)
 */
router.delete('/types/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Soft delete - just mark as inactive
    await docClient.send(new UpdateCommand({
      TableName: CERTS_TABLE,
      Key: { id },
      UpdateExpression: 'SET #isActive = :isActive, #updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#isActive': 'isActive', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: { ':isActive': false, ':updatedAt': new Date().toISOString() }
    }));
    
    await activityService.log('cert_type.deactivated', req.user, {
      type: 'cert_type',
      id
    });
    
    sendSuccess(res, { success: true, message: 'Certification type deactivated' });
  } catch (error) {
    console.error('Delete cert type error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to deactivate certification type');
  }
});

// =============================================================================
// User Certifications
// =============================================================================

/**
 * GET /api/certifications/mine
 * Get current user's certifications
 */
router.get('/mine', authenticate, async (req, res) => {
  try {
    const response = await docClient.send(new ScanCommand({
      TableName: CERTS_TABLE,
      FilterExpression: '#type = :type AND #userId = :userId',
      ExpressionAttributeNames: { '#type': 'recordType', '#userId': 'userId' },
      ExpressionAttributeValues: { ':type': 'user_cert', ':userId': req.user.email }
    }));
    
    const certs = (response.Items || []).map(c => ({
      ...c,
      isExpired: c.expiresAt ? new Date(c.expiresAt) < new Date() : false,
      daysUntilExpiry: c.expiresAt 
        ? Math.ceil((new Date(c.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
        : null
    }));
    
    sendSuccess(res, { 
      certifications: certs,
      expiringSoon: certs.filter(c => c.daysUntilExpiry !== null && c.daysUntilExpiry <= 30 && c.daysUntilExpiry > 0),
      expired: certs.filter(c => c.isExpired)
    });
  } catch (error) {
    console.error('Get my certs error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get certifications');
  }
});

/**
 * GET /api/certifications/user/:email
 * Get a user's certifications (admin/instructor)
 */
router.get('/user/:email', authenticate, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Check permission - must be admin, steward, or the user themselves
    if (req.user.email !== email && 
        !['admin', 'superadmin', 'steward'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized to view this user\'s certifications');
    }
    
    const response = await docClient.send(new ScanCommand({
      TableName: CERTS_TABLE,
      FilterExpression: '#type = :type AND #userId = :userId',
      ExpressionAttributeNames: { '#type': 'recordType', '#userId': 'userId' },
      ExpressionAttributeValues: { ':type': 'user_cert', ':userId': email }
    }));
    
    const certs = (response.Items || []).map(c => ({
      ...c,
      isExpired: c.expiresAt ? new Date(c.expiresAt) < new Date() : false
    }));
    
    sendSuccess(res, { certifications: certs, userEmail: email });
  } catch (error) {
    console.error('Get user certs error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get certifications');
  }
});

/**
 * POST /api/certifications/grant
 * Grant a certification to a user (admin/instructor)
 */
router.post('/grant', authenticate, async (req, res) => {
  try {
    const { userEmail, certTypeId, notes, bypassPrerequisites = false } = req.body;
    
    if (!userEmail || !certTypeId) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'userEmail and certTypeId are required');
    }
    
    // Get the cert type
    const certTypeResponse = await docClient.send(new GetCommand({
      TableName: CERTS_TABLE,
      Key: { id: certTypeId }
    }));
    
    const certType = certTypeResponse.Item;
    if (!certType || certType.recordType !== 'cert_type') {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Certification type not found');
    }
    
    // Check if granter has permission
    const canGrant = certType.grantableBy.includes('admin') && ['admin', 'superadmin'].includes(req.user.role) ||
                     certType.grantableBy.includes('steward') && req.user.role === 'steward' ||
                     certType.grantableBy.includes('instructor') && req.user.permissions?.canInstruct?.includes(certTypeId);
    
    if (!canGrant) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized to grant this certification');
    }
    
    // Check prerequisites (unless bypassed by admin)
    if (!bypassPrerequisites && certType.prerequisites?.length > 0) {
      const userCertsResponse = await docClient.send(new ScanCommand({
        TableName: CERTS_TABLE,
        FilterExpression: '#type = :type AND #userId = :userId',
        ExpressionAttributeNames: { '#type': 'recordType', '#userId': 'userId' },
        ExpressionAttributeValues: { ':type': 'user_cert', ':userId': userEmail }
      }));
      
      const userCertIds = (userCertsResponse.Items || [])
        .filter(c => !c.expiresAt || new Date(c.expiresAt) > new Date())
        .map(c => c.certTypeId);
      
      const missingPrereqs = certType.prerequisites.filter(p => !userCertIds.includes(p));
      if (missingPrereqs.length > 0) {
        return sendError(res, ErrorCodes.BAD_REQUEST, 'Missing prerequisite certifications', {
          missingPrerequisites: missingPrereqs
        });
      }
    }
    
    // Check if user already has this cert (and it's not expired)
    const existingResponse = await docClient.send(new ScanCommand({
      TableName: CERTS_TABLE,
      FilterExpression: '#type = :type AND #userId = :userId AND #certTypeId = :certTypeId',
      ExpressionAttributeNames: { '#type': 'recordType', '#userId': 'userId', '#certTypeId': 'certTypeId' },
      ExpressionAttributeValues: { ':type': 'user_cert', ':userId': userEmail, ':certTypeId': certTypeId }
    }));
    
    const existingCert = existingResponse.Items?.[0];
    if (existingCert && (!existingCert.expiresAt || new Date(existingCert.expiresAt) > new Date())) {
      return sendError(res, ErrorCodes.CONFLICT, 'User already has this certification');
    }
    
    // Create the certification
    const now = new Date();
    const id = `usercert-${uuidv4()}`;
    
    const userCert = {
      id,
      recordType: 'user_cert',
      userId: userEmail,
      certTypeId,
      certTypeName: certType.name,
      certTypeLevel: certType.level,
      grantedBy: req.user.email,
      grantedAt: now.toISOString(),
      expiresAt: certType.expiryMonths 
        ? new Date(now.setMonth(now.getMonth() + certType.expiryMonths)).toISOString()
        : null,
      notes: notes || null,
      method: 'manual_grant',
      bypassedPrerequisites: bypassPrerequisites && certType.prerequisites?.length > 0
    };
    
    await docClient.send(new PutCommand({
      TableName: CERTS_TABLE,
      Item: userCert
    }));
    
    // Update user's permissions to include resources this cert grants
    if (certType.requiresResources?.length > 0) {
      const user = await userService.get(userEmail);
      if (user) {
        const currentTools = user.permissions?.tools || [];
        const newTools = [...new Set([...currentTools, ...certType.requiresResources])];
        await userService.update(userEmail, {
          permissions: { ...user.permissions, tools: newTools }
        }, req.user);
      }
    }
    
    await activityService.log('certification.granted', req.user, {
      type: 'certification',
      id,
      name: `${certType.name} for ${userEmail}`
    }, { certTypeId, certTypeName: certType.name, userEmail });
    
    sendSuccess(res, { certification: userCert }, { status: 201 });
  } catch (error) {
    console.error('Grant cert error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to grant certification');
  }
});

/**
 * POST /api/certifications/revoke
 * Revoke a certification (admin only)
 */
router.post('/revoke', authenticate, requireAdmin, async (req, res) => {
  try {
    const { certificationId, reason } = req.body;
    
    if (!certificationId) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'certificationId is required');
    }
    
    const response = await docClient.send(new GetCommand({
      TableName: CERTS_TABLE,
      Key: { id: certificationId }
    }));
    
    const cert = response.Item;
    if (!cert || cert.recordType !== 'user_cert') {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Certification not found');
    }
    
    await docClient.send(new UpdateCommand({
      TableName: CERTS_TABLE,
      Key: { id: certificationId },
      UpdateExpression: 'SET #revoked = :revoked, #revokedBy = :revokedBy, #revokedAt = :revokedAt, #revokeReason = :reason',
      ExpressionAttributeNames: {
        '#revoked': 'revoked',
        '#revokedBy': 'revokedBy',
        '#revokedAt': 'revokedAt',
        '#revokeReason': 'revokeReason'
      },
      ExpressionAttributeValues: {
        ':revoked': true,
        ':revokedBy': req.user.email,
        ':revokedAt': new Date().toISOString(),
        ':reason': reason || 'Revoked by admin'
      }
    }));
    
    await activityService.log('certification.revoked', req.user, {
      type: 'certification',
      id: certificationId,
      name: cert.certTypeName
    }, { userEmail: cert.userId, reason });
    
    sendSuccess(res, { success: true, message: 'Certification revoked' });
  } catch (error) {
    console.error('Revoke cert error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to revoke certification');
  }
});

// =============================================================================
// Expiring Certifications
// =============================================================================

/**
 * GET /api/certifications/expiring
 * Get all certifications expiring soon (admin/steward)
 */
router.get('/expiring', authenticate, async (req, res) => {
  try {
    if (!['admin', 'superadmin', 'steward'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized');
    }
    
    const { days = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + parseInt(days));
    
    const response = await docClient.send(new ScanCommand({
      TableName: CERTS_TABLE,
      FilterExpression: '#type = :type AND #expiresAt <= :cutoff AND #expiresAt > :now AND attribute_not_exists(#revoked)',
      ExpressionAttributeNames: { 
        '#type': 'recordType', 
        '#expiresAt': 'expiresAt',
        '#revoked': 'revoked'
      },
      ExpressionAttributeValues: { 
        ':type': 'user_cert', 
        ':cutoff': cutoffDate.toISOString(),
        ':now': new Date().toISOString()
      }
    }));
    
    const expiring = (response.Items || []).map(c => ({
      ...c,
      daysUntilExpiry: Math.ceil((new Date(c.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
    })).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    
    sendSuccess(res, { 
      expiring,
      total: expiring.length,
      queryDays: parseInt(days)
    });
  } catch (error) {
    console.error('Get expiring certs error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get expiring certifications');
  }
});

// =============================================================================
// Training Sessions (Future Enhancement)
// =============================================================================

/**
 * GET /api/certifications/training
 * List upcoming training sessions
 */
router.get('/training', authenticate, async (req, res) => {
  try {
    // Future: Query training sessions table
    sendSuccess(res, {
      sessions: [],
      message: 'Training session scheduling coming soon!'
    });
  } catch (error) {
    console.error('Get training sessions error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get training sessions');
  }
});

/**
 * GET /certifications/requests
 * Get pending certification/training requests (admin only)
 * 
 * This endpoint returns user requests for certification classes or training sessions.
 * Currently returns pending certification requests where users don't have the cert yet.
 */
router.get('/requests', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    
    // Query for certification requests
    // For now, return an empty array since the request system isn't fully implemented
    // In the future, this would query a 'certification_requests' table
    
    // Placeholder: Could query activity logs for 'certification.requested' events
    // or implement a dedicated requests table
    
    sendSuccess(res, {
      requests: [],
      total: 0,
      message: 'Certification request system coming soon. Users can currently request certifications through email or Slack.'
    });
  } catch (error) {
    console.error('Get certification requests error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get certification requests');
  }
});

export default router;
