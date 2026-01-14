/**
 * SDCoLab Scheduler - Resources Routes
 * 
 * Dynamic management of tools and rooms:
 * - Create/edit/disable tools via admin UI
 * - Maintenance scheduling
 * - Issue reporting → GitHub
 * - Consumables tracking
 * - Resource status dashboard
 * 
 * 🔥 Fire Triangle: FUEL layer - resource management
 * 
 * @version 4.2.0-rc69.5
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config, isFeatureEnabled } from '../lib/config.js';
import { activityService } from '../lib/database.js';
import { ErrorCodes, sendSuccess, sendError } from '../lib/responses.js';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth.js';
import { integrations } from '../integrations/index.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const router = Router();

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

// =============================================================================
// Table Configuration
// =============================================================================

// IMPORTANT: Require dedicated resources table - no fallback to avoid schema collisions
const RESOURCES_TABLE = config.aws.tables.resources;

if (!RESOURCES_TABLE) {
  console.warn('⚠️ RESOURCES_TABLE not configured. Dynamic resource management will be disabled.');
  console.warn('   Set AWS_RESOURCES_TABLE environment variable or add resources table to Terraform.');
}

// =============================================================================
// In-Memory Resource Cache with TTL
// =============================================================================

// Cache configuration
const CACHE_TTL_MS = 60000; // 1 minute cache TTL
let dynamicTools = [];
let dynamicRooms = [];
let toolOverrides = {};
let lastCacheRefresh = 0;
let cacheRefreshPromise = null;

/**
 * Check if cache needs refresh
 */
const isCacheStale = () => {
  return Date.now() - lastCacheRefresh > CACHE_TTL_MS;
};

/**
 * Load dynamic resources from database with deduplication
 * Uses a promise to prevent multiple simultaneous refreshes
 */
const loadDynamicResources = async (forceRefresh = false) => {
  // Skip if no table configured
  if (!RESOURCES_TABLE) {
    return { tools: [], rooms: [] };
  }
  
  // Return cached data if fresh and not forcing refresh
  if (!forceRefresh && !isCacheStale()) {
    return { tools: dynamicTools, rooms: dynamicRooms };
  }
  
  // If a refresh is already in progress, wait for it
  if (cacheRefreshPromise) {
    return cacheRefreshPromise;
  }
  
  // Start refresh
  cacheRefreshPromise = (async () => {
    try {
      const response = await docClient.send(new ScanCommand({
        TableName: RESOURCES_TABLE,
        FilterExpression: '#type = :tool OR #type = :room',
        ExpressionAttributeNames: { '#type': 'recordType' },
        ExpressionAttributeValues: { ':tool': 'tool', ':room': 'room' }
      }));
      
      dynamicTools = (response.Items || []).filter(r => r.recordType === 'tool');
      dynamicRooms = (response.Items || []).filter(r => r.recordType === 'room');
      lastCacheRefresh = Date.now();
      
      console.log(`📦 Resource cache refreshed: ${dynamicTools.length} tools, ${dynamicRooms.length} rooms`);
      
      return { tools: dynamicTools, rooms: dynamicRooms };
    } catch (error) {
      console.error('Failed to load dynamic resources:', error);
      // Return stale cache on error rather than empty
      return { tools: dynamicTools, rooms: dynamicRooms };
    } finally {
      cacheRefreshPromise = null;
    }
  })();
  
  return cacheRefreshPromise;
};

/**
 * Load tool overrides from database
 */
const loadToolOverrides = async (forceRefresh = false) => {
  if (!RESOURCES_TABLE) {
    return {};
  }
  
  // Use same staleness check as main cache
  if (!forceRefresh && !isCacheStale()) {
    return toolOverrides;
  }
  
  try {
    const response = await docClient.send(new ScanCommand({
      TableName: RESOURCES_TABLE,
      FilterExpression: '#type = :type',
      ExpressionAttributeNames: { '#type': 'recordType' },
      ExpressionAttributeValues: { ':type': 'tool-override' }
    }));
    
    toolOverrides = {};
    for (const override of (response.Items || [])) {
      toolOverrides[override.id] = override;
    }
    
    return toolOverrides;
  } catch (error) {
    console.error('Failed to load tool overrides:', error);
    return toolOverrides; // Return stale on error
  }
};

/**
 * Invalidate cache (call after writes)
 */
const invalidateCache = () => {
  lastCacheRefresh = 0;
};

// Initial load on startup (non-blocking)
loadDynamicResources().catch(err => console.error('Initial resource load failed:', err));
loadToolOverrides().catch(err => console.error('Initial override load failed:', err));

// Helper to get all tools (config with overrides + dynamic)
const getAllTools = () => {
  const configTools = config.tools.map(t => {
    const override = toolOverrides[t.id];
    return { 
      ...t, 
      ...(override && { 
        status: override.status || t.status,
        maintenanceNotes: override.maintenanceNotes || t.maintenanceNotes,
        lastMaintenanceAt: override.lastMaintenanceAt,
        nextMaintenanceAt: override.nextMaintenanceAt,
        maxConcurrent: override.maxConcurrent || t.maxConcurrent,
        description: override.description || t.description
      }),
      source: 'config',
      hasOverrides: !!override
    };
  });
  const dbTools = dynamicTools.map(t => ({ ...t, source: 'database' }));
  return [...configTools, ...dbTools];
};

// Helper to get all rooms
const getAllRooms = () => {
  const configRooms = config.rooms.map(r => ({ ...r, source: 'config' }));
  const dbRooms = dynamicRooms.map(r => ({ ...r, source: 'database' }));
  return [...configRooms, ...dbRooms];
};

// =============================================================================
// Tools Management
// =============================================================================

/**
 * GET /api/resources/tools
 * List all tools (config + dynamic)
 */
router.get('/tools', authenticate, async (req, res) => {
  try {
    // Use cache with auto-refresh based on TTL
    await loadDynamicResources();
    await loadToolOverrides();
    
    const tools = getAllTools().map(tool => ({
      id: tool.id,
      name: tool.name,
      category: tool.category || 'general',
      room: tool.room,
      maxConcurrent: tool.maxConcurrent || 1,
      requiresCert: tool.requiresCert || false,
      description: tool.description || null,
      imageUrl: tool.imageUrl || null,
      specs: tool.specs || null,
      status: tool.status || 'available', // available, maintenance, disabled
      maintenanceNotes: tool.maintenanceNotes || null,
      lastMaintenanceAt: tool.lastMaintenanceAt || null,
      nextMaintenanceAt: tool.nextMaintenanceAt || null,
      consumablesTracking: tool.consumablesTracking || false,
      consumables: tool.consumables || null,
      source: tool.source,
      isActive: tool.isActive !== false,
      createdAt: tool.createdAt,
      updatedAt: tool.updatedAt
    }));
    
    const categories = [...new Set(tools.map(t => t.category))].sort();
    
    // Standardized response format
    sendSuccess(res, { 
      success: true,
      data: {
        tools,
        categories,
        total: tools.length,
        configTools: config.tools.length,
        dynamicTools: dynamicTools.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get tools error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get tools');
  }
});

/**
 * POST /api/resources/tools
 * Create a new tool (admin only)
 */
router.post('/tools', authenticate, requireAdmin, async (req, res) => {
  try {
    // Check if table is configured
    if (!RESOURCES_TABLE) {
      return sendError(res, ErrorCodes.SERVICE_UNAVAILABLE, 
        'Resource management is not configured. Set RESOURCES_TABLE environment variable.');
    }
    
    const {
      name,
      category = 'general',
      room,
      maxConcurrent = 1,
      requiresCert = false,
      description,
      imageUrl,
      specs,
      consumablesTracking = false
    } = req.body;
    
    if (!name) {
      return sendError(res, ErrorCodes.VALIDATION_ERROR, 'Name is required', {
        fields: { name: 'This field is required' }
      });
    }
    
    const id = `tool-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const now = new Date().toISOString();
    
    const tool = {
      id,
      recordType: 'tool',
      name,
      category,
      room: room || null,
      maxConcurrent,
      requiresCert,
      description: description || '',
      imageUrl: imageUrl || null,
      specs: specs || null,
      status: 'available',
      consumablesTracking,
      consumables: consumablesTracking ? { level: 100, unit: '%', lastRestocked: now } : null,
      isActive: true,
      version: 1, // Add version for optimistic concurrency
      createdAt: now,
      createdBy: req.user.email,
      updatedAt: now
    };
    
    await docClient.send(new PutCommand({
      TableName: RESOURCES_TABLE,
      Item: tool
    }));
    
    // Invalidate cache to ensure fresh data on next read
    invalidateCache();
    
    await activityService.log('resource.tool_created', req.user, {
      type: 'tool',
      id,
      name
    }, { category, room, requiresCert });
    
    sendSuccess(res, { 
      success: true,
      data: { tool },
      message: 'Tool created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Create tool error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create tool');
  }
});

/**
 * PUT /api/resources/tools/:id
 * Update a tool (admin only)
 * 
 * Config-based tools can only have status/maintenance fields updated.
 * Dynamic (database) tools can be fully edited.
 * Only superadmins can edit core tool properties.
 */
router.put('/tools/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const isSuperAdmin = req.user.role === 'superadmin';
    
    // Check if it's a config tool
    const configTool = config.tools.find(t => t.id === id);
    
    if (configTool) {
      // Config tools: only allow status/maintenance updates for regular admins
      const allowedConfigUpdates = ['status', 'maintenanceNotes', 'nextMaintenanceAt', 'lastMaintenanceAt'];
      
      // Superadmins can also update maxConcurrent and other operational fields
      if (isSuperAdmin) {
        allowedConfigUpdates.push('maxConcurrent', 'description', 'requiresCert');
      }
      
      const filteredUpdates = {};
      for (const key of allowedConfigUpdates) {
        if (updates[key] !== undefined) {
          filteredUpdates[key] = updates[key];
        }
      }
      
      if (Object.keys(filteredUpdates).length === 0) {
        return sendError(res, ErrorCodes.BAD_REQUEST, 
          isSuperAdmin 
            ? 'No valid fields to update. Config tools have limited editable fields.'
            : 'Only status and maintenance fields can be updated for config tools. Contact a superadmin for other changes.',
          { allowedFields: allowedConfigUpdates }
        );
      }
      
      // Store config tool overrides in database
      const now = new Date().toISOString();
      const override = {
        id,
        recordType: 'tool-override',
        ...filteredUpdates,
        updatedAt: now,
        updatedBy: req.user.email
      };
      
      await docClient.send(new PutCommand({
        TableName: RESOURCES_TABLE,
        Item: override
      }));
      
      await activityService.log('resource.tool_updated', req.user, {
        type: 'tool',
        id,
        name: configTool.name
      }, { updates: Object.keys(filteredUpdates), isConfigTool: true });
      
      // Return merged tool
      sendSuccess(res, { 
        tool: { ...configTool, ...filteredUpdates, source: 'config', hasOverrides: true },
        message: 'Tool settings updated'
      });
      return;
    }
    
    // Dynamic tool - allow full updates
    const expressions = [];
    const names = {};
    const values = {};
    
    const allowedFields = [
      'name', 'category', 'room', 'maxConcurrent', 'requiresCert',
      'description', 'imageUrl', 'specs', 'status', 'maintenanceNotes',
      'nextMaintenanceAt', 'consumablesTracking', 'consumables', 'isActive'
    ];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key) && value !== undefined) {
        expressions.push(`#${key} = :${key}`);
        names[`#${key}`] = key;
        values[`:${key}`] = value;
      }
    });
    
    if (expressions.length === 0) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'No valid fields to update');
    }
    
    expressions.push('#updatedAt = :updatedAt');
    names['#updatedAt'] = 'updatedAt';
    values[':updatedAt'] = new Date().toISOString();
    
    const response = await docClient.send(new UpdateCommand({
      TableName: RESOURCES_TABLE,
      Key: { id },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW'
    }));
    
    await loadDynamicResources();
    
    await activityService.log('resource.tool_updated', req.user, {
      type: 'tool',
      id,
      name: response.Attributes?.name
    }, { updates: Object.keys(updates) });
    
    sendSuccess(res, { tool: response.Attributes });
  } catch (error) {
    console.error('Update tool error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update tool');
  }
});

/**
 * PUT /api/resources/tools/:id/visibility
 * Toggle tool visibility (admin only)
 */
router.put('/tools/:id/visibility', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { visible } = req.body;
    
    const now = new Date().toISOString();
    
    // Check if config tool or dynamic tool
    const configTool = config.tools.find(t => t.id === id);
    const dynamicTool = dynamicTools.find(t => t.id === id);
    
    if (!configTool && !dynamicTool) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Tool not found');
    }
    
    if (configTool) {
      // Store visibility override for config tool
      const override = {
        id,
        recordType: 'tool-override',
        visible,
        updatedAt: now,
        updatedBy: req.user.email
      };
      
      await docClient.send(new PutCommand({
        TableName: RESOURCES_TABLE,
        Item: override
      }));
      
      await loadToolOverrides();
    } else if (dynamicTool) {
      // Update dynamic tool directly
      await docClient.send(new UpdateCommand({
        TableName: RESOURCES_TABLE,
        Key: { id },
        UpdateExpression: 'SET #visible = :visible, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#visible': 'visible',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':visible': visible,
          ':updatedAt': now
        }
      }));
      
      await loadDynamicResources();
    }
    
    await activityService.log('resource.visibility_changed', req.user, {
      type: 'tool',
      id,
      name: configTool?.name || dynamicTool?.name
    }, { visible });
    
    sendSuccess(res, { 
      success: true, 
      message: `Tool ${visible ? 'shown' : 'hidden'} successfully`,
      visible 
    });
  } catch (error) {
    console.error('Toggle visibility error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to toggle visibility');
  }
});

/**
 * POST /api/resources/tools/:id/maintenance
 * Mark tool for maintenance or complete maintenance
 */
router.post('/tools/:id/maintenance', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes, nextMaintenanceAt } = req.body;
    
    // Stewards and admins can manage maintenance
    if (!['admin', 'superadmin', 'steward'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized');
    }
    
    const now = new Date().toISOString();
    let updates = {};
    
    if (action === 'start') {
      updates = {
        status: 'maintenance',
        maintenanceNotes: notes || 'Under maintenance',
        maintenanceStartedAt: now,
        maintenanceStartedBy: req.user.email
      };
    } else if (action === 'complete') {
      updates = {
        status: 'available',
        maintenanceNotes: null,
        lastMaintenanceAt: now,
        lastMaintenanceBy: req.user.email,
        nextMaintenanceAt: nextMaintenanceAt || null
      };
    } else {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Action must be "start" or "complete"');
    }
    
    // Check if dynamic tool
    const dynamicTool = dynamicTools.find(t => t.id === id);
    if (dynamicTool) {
      const expressions = [];
      const names = {};
      const values = {};
      
      Object.entries(updates).forEach(([key, value]) => {
        expressions.push(`#${key} = :${key}`);
        names[`#${key}`] = key;
        values[`:${key}`] = value;
      });
      
      expressions.push('#updatedAt = :updatedAt');
      names['#updatedAt'] = 'updatedAt';
      values[':updatedAt'] = now;
      
      await docClient.send(new UpdateCommand({
        TableName: RESOURCES_TABLE,
        Key: { id },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values
      }));
      
      await loadDynamicResources();
    }
    
    await activityService.log(`resource.maintenance_${action}`, req.user, {
      type: 'tool',
      id,
      name: dynamicTool?.name || config.tools.find(t => t.id === id)?.name
    }, { notes });
    
    sendSuccess(res, { success: true, message: `Maintenance ${action === 'start' ? 'started' : 'completed'}` });
  } catch (error) {
    console.error('Maintenance error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update maintenance status');
  }
});

// =============================================================================
// Issue Reporting
// =============================================================================

/**
 * POST /api/resources/issues
 * Report an issue with a tool/room (creates GitHub issue if enabled)
 */
router.post('/issues', authenticate, async (req, res) => {
  try {
    const { resourceType, resourceId, title, description, severity = 'medium', imageUrl } = req.body;
    
    if (!resourceId || !title || !description) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'resourceId, title, and description are required');
    }
    
    const tool = getAllTools().find(t => t.id === resourceId);
    const room = getAllRooms().find(r => r.id === resourceId);
    const resource = tool || room;
    
    if (!resource) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Resource not found');
    }
    
    const issueId = `issue-${uuidv4()}`;
    const now = new Date().toISOString();
    
    const issue = {
      id: issueId,
      recordType: 'issue',
      resourceType: tool ? 'tool' : 'room',
      resourceId,
      resourceName: resource.name,
      title,
      description,
      severity, // low, medium, high, critical
      imageUrl: imageUrl || null,
      status: 'open',
      reportedBy: req.user.email,
      reportedAt: now
    };
    
    // Store in database
    await docClient.send(new PutCommand({
      TableName: RESOURCES_TABLE,
      Item: issue
    }));
    
    // Create GitHub issue if enabled
    let githubIssue = null;
    if (isFeatureEnabled('github')) {
      try {
        const severityEmoji = {
          low: '🟢',
          medium: '🟡',
          high: '🟠',
          critical: '🔴'
        };
        
        githubIssue = await integrations.github?.createIssue?.({
          title: `${severityEmoji[severity]} [${resource.name}] ${title}`,
          body: `## Issue Report

**Resource:** ${resource.name} (${tool ? 'Tool' : 'Room'})
**Severity:** ${severity.toUpperCase()}
**Reported by:** ${req.user.displayName || req.user.email}
**Date:** ${new Date().toLocaleDateString()}

### Description
${description}

${imageUrl ? `### Image\n![Issue Image](${imageUrl})` : ''}

---
*Reported via SDCoLab Scheduler*
*Issue ID: ${issueId}*`,
          labels: ['fire:fuel', 'maintenance', `severity:${severity}`]
        });
        
        if (githubIssue) {
          await docClient.send(new UpdateCommand({
            TableName: RESOURCES_TABLE,
            Key: { id: issueId },
            UpdateExpression: 'SET #ghNumber = :ghNumber, #ghUrl = :ghUrl',
            ExpressionAttributeNames: { '#ghNumber': 'githubIssueNumber', '#ghUrl': 'githubIssueUrl' },
            ExpressionAttributeValues: { ':ghNumber': githubIssue.number, ':ghUrl': githubIssue.url }
          }));
          
          issue.githubIssueNumber = githubIssue.number;
          issue.githubIssueUrl = githubIssue.url;
        }
      } catch (ghError) {
        console.error('GitHub issue creation failed:', ghError);
      }
    }
    
    await activityService.log('resource.issue_reported', req.user, {
      type: 'issue',
      id: issueId,
      name: title
    }, { resourceId, resourceName: resource.name, severity, githubIssue: githubIssue?.number });
    
    sendSuccess(res, { 
      issue,
      message: githubIssue 
        ? `Issue reported and GitHub issue #${githubIssue.number} created`
        : 'Issue reported successfully'
    });
  } catch (error) {
    console.error('Report issue error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to report issue');
  }
});

/**
 * GET /api/resources/issues
 * Get all open issues (admin/steward)
 */
router.get('/issues', authenticate, async (req, res) => {
  try {
    if (!['admin', 'superadmin', 'steward'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized');
    }
    
    const { status = 'open', resourceId } = req.query;
    
    let filterExpression = '#type = :type';
    const names = { '#type': 'recordType' };
    const values = { ':type': 'issue' };
    
    if (status !== 'all') {
      filterExpression += ' AND #status = :status';
      names['#status'] = 'status';
      values[':status'] = status;
    }
    
    if (resourceId) {
      filterExpression += ' AND #resourceId = :resourceId';
      names['#resourceId'] = 'resourceId';
      values[':resourceId'] = resourceId;
    }
    
    const response = await docClient.send(new ScanCommand({
      TableName: RESOURCES_TABLE,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    }));
    
    const issues = (response.Items || []).sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    
    sendSuccess(res, { issues, total: issues.length });
  } catch (error) {
    console.error('Get issues error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get issues');
  }
});

/**
 * PUT /api/resources/issues/:id
 * Update issue status (admin/steward)
 */
router.put('/issues/:id', authenticate, async (req, res) => {
  try {
    if (!['admin', 'superadmin', 'steward'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized');
    }
    
    const { id } = req.params;
    const { status, resolution } = req.body;
    
    // First, get the current issue to check for GitHub issue number
    const currentIssue = await docClient.send(new GetCommand({
      TableName: RESOURCES_TABLE,
      Key: { id }
    }));
    
    if (!currentIssue.Item) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Issue not found');
    }
    
    const updates = {};
    if (status) updates.status = status;
    if (resolution) updates.resolution = resolution;
    if (status === 'resolved') {
      updates.resolvedBy = req.user.email;
      updates.resolvedAt = new Date().toISOString();
    }
    
    const expressions = [];
    const names = {};
    const values = {};
    
    Object.entries(updates).forEach(([key, value]) => {
      expressions.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    });
    
    const response = await docClient.send(new UpdateCommand({
      TableName: RESOURCES_TABLE,
      Key: { id },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW'
    }));
    
    // Sync with GitHub if issue was linked
    const githubIssueNumber = currentIssue.Item.githubIssueNumber;
    if (githubIssueNumber && isFeatureEnabled('github')) {
      try {
        const { githubService } = await import('../integrations/github.js');
        
        if (status === 'resolved' || status === 'closed') {
          // Add resolution comment and close the issue
          const commentBody = status === 'resolved'
            ? `## ✅ Resolved\n\n**By:** ${req.user.displayName || req.user.email}\n**Date:** ${new Date().toISOString()}\n\n### Resolution\n${resolution || 'Issue has been resolved.'}\n\n---\n*Updated via SDCoLab Scheduler*`
            : `## 🔒 Closed\n\n**By:** ${req.user.displayName || req.user.email}\n**Date:** ${new Date().toISOString()}\n\n---\n*Updated via SDCoLab Scheduler*`;
          
          await githubService.commentOnIssue(githubIssueNumber, commentBody);
          await githubService.closeIssue(githubIssueNumber, status === 'resolved' ? 'completed' : 'not_planned');
          console.log(`🐙 Closed GitHub issue #${githubIssueNumber}`);
        } else if (status === 'open') {
          // Reopen the issue
          await githubService.updateIssue(githubIssueNumber, { state: 'open' });
          await githubService.commentOnIssue(githubIssueNumber, 
            `## 🔄 Reopened\n\n**By:** ${req.user.displayName || req.user.email}\n**Date:** ${new Date().toISOString()}\n\n---\n*Updated via SDCoLab Scheduler*`
          );
          console.log(`🐙 Reopened GitHub issue #${githubIssueNumber}`);
        } else if (status === 'in_progress') {
          // Add comment for in-progress
          await githubService.commentOnIssue(githubIssueNumber,
            `## 🔧 In Progress\n\n**Assigned to:** ${req.user.displayName || req.user.email}\n**Date:** ${new Date().toISOString()}\n\n---\n*Updated via SDCoLab Scheduler*`
          );
          await githubService.updateIssue(githubIssueNumber, { 
            labels: ['fire:fuel', 'maintenance', 'in-progress'] 
          });
        }
      } catch (ghError) {
        console.error('GitHub sync failed:', ghError);
        // Don't fail the request, just log the error
      }
    }
    
    await activityService.log('resource.issue_updated', req.user, {
      type: 'issue',
      id,
      name: response.Attributes?.title
    }, { status, resolution, githubSynced: !!githubIssueNumber });
    
    sendSuccess(res, { issue: response.Attributes });
  } catch (error) {
    console.error('Update issue error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update issue');
  }
});

// =============================================================================
// Consumables Tracking
// =============================================================================

/**
 * PUT /api/resources/tools/:id/consumables
 * Update consumables level for a tool
 */
router.put('/tools/:id/consumables', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { level, notes, restocked = false } = req.body;
    
    // Stewards and admins can update consumables
    if (!['admin', 'superadmin', 'steward', 'certified'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized');
    }
    
    const now = new Date().toISOString();
    const consumables = {
      level,
      unit: '%',
      lastUpdated: now,
      lastUpdatedBy: req.user.email,
      notes: notes || null
    };
    
    if (restocked) {
      consumables.lastRestocked = now;
      consumables.lastRestockedBy = req.user.email;
    }
    
    // Check if dynamic tool
    const dynamicTool = dynamicTools.find(t => t.id === id);
    if (dynamicTool) {
      await docClient.send(new UpdateCommand({
        TableName: RESOURCES_TABLE,
        Key: { id },
        UpdateExpression: 'SET #consumables = :consumables, #updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#consumables': 'consumables', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: { ':consumables': consumables, ':updatedAt': now }
      }));
      
      await loadDynamicResources();
    }
    
    await activityService.log('resource.consumables_updated', req.user, {
      type: 'tool',
      id,
      name: dynamicTool?.name || config.tools.find(t => t.id === id)?.name
    }, { level, restocked });
    
    sendSuccess(res, { success: true, consumables });
  } catch (error) {
    console.error('Update consumables error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update consumables');
  }
});

// =============================================================================
// Rooms Management (similar structure to tools)
// =============================================================================

/**
 * GET /api/resources/rooms
 * List all rooms
 */
router.get('/rooms', authenticate, async (req, res) => {
  try {
    await loadDynamicResources();
    
    const rooms = getAllRooms().map(room => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      description: room.description || null,
      imageUrl: room.imageUrl || null,
      bookable: room.bookable !== false,
      requiresApproval: room.requiresApproval || false,
      allowedRoles: room.allowedRoles || null, // null = all roles
      status: room.status || 'available',
      source: room.source,
      tools: getAllTools().filter(t => t.room === room.id).map(t => ({ id: t.id, name: t.name }))
    }));
    
    sendSuccess(res, { rooms, total: rooms.length });
  } catch (error) {
    console.error('Get rooms error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get rooms');
  }
});

/**
 * POST /api/resources/rooms
 * Create a new room (admin only)
 */
router.post('/rooms', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      capacity,
      description,
      imageUrl,
      bookable = true,
      requiresApproval = false,
      allowedRoles = null
    } = req.body;
    
    if (!name) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Name is required');
    }
    
    const id = `room-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const now = new Date().toISOString();
    
    const room = {
      id,
      recordType: 'room',
      name,
      capacity: capacity || 0,
      description: description || '',
      imageUrl: imageUrl || null,
      bookable,
      requiresApproval,
      allowedRoles,
      status: 'available',
      isActive: true,
      createdAt: now,
      createdBy: req.user.email,
      updatedAt: now
    };
    
    await docClient.send(new PutCommand({
      TableName: RESOURCES_TABLE,
      Item: room
    }));
    
    await loadDynamicResources();
    
    await activityService.log('resource.room_created', req.user, {
      type: 'room',
      id,
      name
    }, { capacity, bookable });
    
    sendSuccess(res, { room });
  } catch (error) {
    console.error('Create room error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create room');
  }
});

/**
 * PUT /rooms/:id - Update a room
 * @version 4.2.0-rc69.8
 */
router.put('/rooms/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      capacity,
      description,
      imageUrl,
      bookable,
      requiresApproval,
      allowedRoles,
      status
    } = req.body;
    
    // Fetch existing room
    const result = await docClient.send(new GetCommand({
      TableName: RESOURCES_TABLE,
      Key: { id }
    }));
    
    if (!result.Item || result.Item.recordType !== 'room') {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Room not found');
    }
    
    const existingRoom = result.Item;
    const now = new Date().toISOString();
    
    // Build update expression
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (capacity !== undefined) updates.capacity = capacity;
    if (description !== undefined) updates.description = description;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;
    if (bookable !== undefined) updates.bookable = bookable;
    if (requiresApproval !== undefined) updates.requiresApproval = requiresApproval;
    if (allowedRoles !== undefined) updates.allowedRoles = allowedRoles;
    if (status !== undefined) updates.status = status;
    
    if (Object.keys(updates).length === 0) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'No valid fields to update');
    }
    
    updates.updatedAt = now;
    updates.updatedBy = req.user.email;
    
    // Build DynamoDB update expression
    const updateExpr = [];
    const exprNames = {};
    const exprValues = {};
    
    Object.entries(updates).forEach(([key, value], i) => {
      updateExpr.push(`#f${i} = :v${i}`);
      exprNames[`#f${i}`] = key;
      exprValues[`:v${i}`] = value;
    });
    
    await docClient.send(new UpdateCommand({
      TableName: RESOURCES_TABLE,
      Key: { id },
      UpdateExpression: `SET ${updateExpr.join(', ')}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues
    }));
    
    await loadDynamicResources();
    
    const updatedRoom = { ...existingRoom, ...updates };
    
    await activityService.log('resource.room_updated', req.user, {
      type: 'room',
      id,
      name: updatedRoom.name
    }, { changes: Object.keys(updates) });
    
    sendSuccess(res, { room: updatedRoom });
  } catch (error) {
    console.error('Update room error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update room');
  }
});

export default router;
