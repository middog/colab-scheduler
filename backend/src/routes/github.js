/**
 * GitHub Integration Routes
 * 
 * Provides endpoints for:
 * - Fetching issue templates from GitHub repo
 * - GitHub-native issue CRUD with DynamoDB caching
 * - Version checking for optimistic conflict resolution
 * - Template YAML generator for admins
 * 
 * 🔥 Fire Triangle: FUEL layer (infrastructure) + OXYGEN layer (governance)
 * 
 * @version 4.2.0-rc69.15
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { sendSuccess, sendError, ErrorCodes } from '../lib/responses.js';
import { config, isFeatureEnabled } from '../lib/config.js';
import { githubService } from '../integrations/github.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  QueryCommand, 
  UpdateCommand,
  ScanCommand,
  DeleteCommand 
} from '@aws-sdk/lib-dynamodb';

const router = Router();

// DynamoDB setup
const dynamoClient = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const RESOURCES_TABLE = process.env.RESOURCES_TABLE || 'colab-scheduler-resources';

// Cache settings
const CACHE_STALE_MINUTES = 5;
const TEMPLATE_CACHE_MINUTES = 60; // Templates change rarely

// In-memory template cache (server-side)
// TODO: Consider Redis or DynamoDB for multi-instance deployments
let templateCache = {
  templates: null,
  fetchedAt: null
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if GitHub integration is properly configured
 */
const requireGitHub = (req, res, next) => {
  if (!isFeatureEnabled('github')) {
    return sendError(res, ErrorCodes.BAD_REQUEST, 'GitHub integration is not enabled', {
      hint: 'Set ENABLE_GITHUB=true and configure GITHUB_TOKEN'
    });
  }
  if (!config.github.token) {
    return sendError(res, ErrorCodes.BAD_REQUEST, 'GitHub token not configured', {
      hint: 'Set GITHUB_TOKEN environment variable'
    });
  }
  next();
};

/**
 * Parse YAML frontmatter and body from template content
 */
const parseYamlTemplate = (content) => {
  try {
    // GitHub YAML templates have structured format
    // We'll parse the key fields we need
    const lines = content.split('\n');
    const template = {
      name: '',
      description: '',
      title: '',
      labels: [],
      assignees: [],
      body: []
    };
    
    let inBody = false;
    let currentItem = null;
    let currentField = null;
    let indentLevel = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Top-level fields
      if (!inBody) {
        if (trimmed.startsWith('name:')) {
          template.name = trimmed.substring(5).trim().replace(/^["']|["']$/g, '');
        } else if (trimmed.startsWith('description:')) {
          template.description = trimmed.substring(12).trim().replace(/^["']|["']$/g, '');
        } else if (trimmed.startsWith('title:')) {
          template.title = trimmed.substring(6).trim().replace(/^["']|["']$/g, '');
        } else if (trimmed.startsWith('labels:')) {
          const labelsStr = trimmed.substring(7).trim();
          if (labelsStr.startsWith('[')) {
            // Inline array format
            template.labels = labelsStr
              .replace(/^\[|\]$/g, '')
              .split(',')
              .map(l => l.trim().replace(/^["']|["']$/g, ''))
              .filter(Boolean);
          }
        } else if (trimmed === '- ' || trimmed.match(/^- ["']/)) {
          // Array item for labels
          const val = trimmed.substring(2).trim().replace(/^["']|["']$/g, '');
          if (val) template.labels.push(val);
        } else if (trimmed.startsWith('body:')) {
          inBody = true;
        }
      } else {
        // Parse body items
        if (trimmed.startsWith('- type:')) {
          // New body item
          if (currentItem) {
            template.body.push(currentItem);
          }
          currentItem = {
            type: trimmed.substring(8).trim(),
            id: '',
            attributes: {}
          };
          currentField = null;
        } else if (currentItem) {
          if (trimmed.startsWith('id:')) {
            currentItem.id = trimmed.substring(3).trim();
          } else if (trimmed.startsWith('attributes:')) {
            currentField = 'attributes';
          } else if (trimmed.startsWith('validations:')) {
            currentField = 'validations';
            currentItem.validations = {};
          } else if (currentField === 'attributes') {
            if (trimmed.startsWith('label:')) {
              currentItem.attributes.label = trimmed.substring(6).trim().replace(/^["']|["']$/g, '');
            } else if (trimmed.startsWith('description:')) {
              currentItem.attributes.description = trimmed.substring(12).trim().replace(/^["']|["']$/g, '');
            } else if (trimmed.startsWith('placeholder:')) {
              currentItem.attributes.placeholder = trimmed.substring(12).trim().replace(/^["']|["']$/g, '');
            } else if (trimmed.startsWith('value:')) {
              currentItem.attributes.value = trimmed.substring(6).trim().replace(/^["']|["']$/g, '');
            } else if (trimmed.startsWith('options:')) {
              currentItem.attributes.options = [];
            } else if (trimmed.startsWith('multiple:')) {
              currentItem.attributes.multiple = trimmed.substring(9).trim() === 'true';
            } else if (trimmed.startsWith('default:')) {
              currentItem.attributes.default = parseInt(trimmed.substring(8).trim()) || 0;
            } else if (trimmed.startsWith('render:')) {
              currentItem.attributes.render = trimmed.substring(7).trim();
            } else if (trimmed.startsWith('- ') && currentItem.attributes.options) {
              // Option item
              let optVal = trimmed.substring(2).trim().replace(/^["']|["']$/g, '');
              if (optVal) currentItem.attributes.options.push(optVal);
            }
          } else if (currentField === 'validations') {
            if (trimmed.startsWith('required:')) {
              currentItem.validations = currentItem.validations || {};
              currentItem.validations.required = trimmed.substring(9).trim() === 'true';
            }
          }
        }
      }
    }
    
    // Don't forget last item
    if (currentItem) {
      template.body.push(currentItem);
    }
    
    return template;
  } catch (error) {
    console.error('Template parse error:', error);
    return null;
  }
};

/**
 * Extract labels from GitHub issue for caching
 */
const extractLabelsFromIssue = (issue) => {
  const labels = issue.labels?.map(l => typeof l === 'string' ? l : l.name) || [];
  
  return {
    status: labels.find(l => l.startsWith('status:'))?.replace('status:', '') || 'new',
    severity: labels.find(l => l.startsWith('severity:'))?.replace('severity:', '') || 'medium',
    fireElement: labels.find(l => l.startsWith('fire:'))?.replace('fire:', '') || 'fuel',
    resource: labels.find(l => l.startsWith('resource:'))?.replace('resource:', '') || null,
    template: labels.find(l => l.startsWith('template:'))?.replace('template:', '') || null,
    allLabels: labels
  };
};

/**
 * Transform GitHub issue to cached format
 */
const transformGitHubIssue = (issue) => {
  const labelData = extractLabelsFromIssue(issue);
  
  return {
    id: `gh-issue-${issue.number}`,
    recordType: 'github-issue',
    githubNumber: issue.number,
    githubUrl: issue.html_url,
    githubNodeId: issue.node_id,
    title: issue.title,
    body: issue.body,
    bodyPreview: issue.body?.substring(0, 500) || '',
    state: issue.state, // 'open' or 'closed'
    ...labelData,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    createdBy: issue.user?.login || 'unknown',
    commentsCount: issue.comments || 0,
    lastSyncedAt: new Date().toISOString(),
    syncSource: 'github'
  };
};

// =============================================================================
// Template Endpoints
// =============================================================================

/**
 * GET /api/github/templates
 * Fetch issue templates from the configured GitHub repository
 */
router.get('/templates', authenticate, requireGitHub, async (req, res) => {
  try {
    const { force } = req.query;
    const { org, repo } = config.github;
    
    // Check server-side cache
    if (!force && templateCache.templates && templateCache.fetchedAt) {
      const cacheAge = (Date.now() - new Date(templateCache.fetchedAt).getTime()) / 1000 / 60;
      if (cacheAge < TEMPLATE_CACHE_MINUTES) {
        return sendSuccess(res, {
          templates: templateCache.templates,
          cached: true,
          cacheAge: Math.round(cacheAge),
          source: `${org}/${repo}`
        });
      }
    }
    
    // Fetch template directory listing
    const templatePath = '.github/ISSUE_TEMPLATE';
    const listUrl = `https://api.github.com/repos/${org}/${repo}/contents/${templatePath}`;
    
    const listResponse = await fetch(listUrl, {
      headers: {
        'Authorization': `Bearer ${config.github.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SDCoLab-Scheduler/4.2.0'
      }
    });
    
    if (!listResponse.ok) {
      if (listResponse.status === 404) {
        return sendError(res, ErrorCodes.NOT_FOUND, 'No issue templates found in repository', {
          hint: `Create templates in ${org}/${repo}/.github/ISSUE_TEMPLATE/`
        });
      }
      throw new Error(`GitHub API error: ${listResponse.status}`);
    }
    
    const files = await listResponse.json();
    
    // Filter for YAML template files (not config.yml)
    const templateFiles = files.filter(f => 
      f.type === 'file' && 
      f.name.endsWith('.yml') && 
      f.name !== 'config.yml'
    );
    
    if (templateFiles.length === 0) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'No issue templates found', {
        hint: 'Create .yml template files in .github/ISSUE_TEMPLATE/'
      });
    }
    
    // Fetch each template's content
    const templates = [];
    for (const file of templateFiles) {
      try {
        const contentResponse = await fetch(file.url, {
          headers: {
            'Authorization': `Bearer ${config.github.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'SDCoLab-Scheduler/4.2.0'
          }
        });
        
        if (contentResponse.ok) {
          const fileData = await contentResponse.json();
          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
          const parsed = parseYamlTemplate(content);
          
          if (parsed && parsed.name) {
            templates.push({
              filename: file.name,
              ...parsed
            });
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch template ${file.name}:`, err.message);
      }
    }
    
    // Update cache
    templateCache = {
      templates,
      fetchedAt: new Date().toISOString()
    };
    
    sendSuccess(res, {
      templates,
      cached: false,
      source: `${org}/${repo}`
    });
    
  } catch (error) {
    console.error('Fetch templates error:', error);
    
    // If we have cached templates, return them with a warning
    if (templateCache.templates) {
      return sendSuccess(res, {
        templates: templateCache.templates,
        cached: true,
        stale: true,
        warning: 'GitHub unavailable, showing cached templates',
        source: `${config.github.org}/${config.github.repo}`
      });
    }
    
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch templates', {
      message: error.message
    });
  }
});

/**
 * GET /api/github/templates/generate
 * Generate YAML template content with current tools/rooms (admin only)
 */
router.get('/templates/generate', authenticate, requireGitHub, async (req, res) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Admin access required');
    }
    
    const { type = 'maintenance' } = req.query;
    
    // Use config.tools and config.rooms directly
    // Note: This doesn't include dynamic tools/rooms from database
    // For full list, frontend should call /api/resources/tools and /api/resources/rooms
    const tools = config.tools || [];
    const rooms = config.rooms || [];
    
    // Generate equipment options
    const equipmentOptions = tools.map(t => `        - "${t.name}"`).join('\n');
    const locationOptions = rooms.map(r => `        - "${r.name}"`).join('\n');
    
    let yaml = '';
    
    if (type === 'maintenance') {
      yaml = `name: 🔧 Maintenance Request
description: Report equipment or facility maintenance needs
title: "[Maintenance]: "
labels: ["maintenance", "status:new", "fire:fuel"]
assignees: []

body:
  - type: markdown
    attributes:
      value: |
        ## Equipment/Facility Maintenance Request
        Report issues with tools, equipment, or facility infrastructure.

  - type: dropdown
    id: equipment
    attributes:
      label: Equipment/Resource
      description: Which equipment or area needs attention?
      options:
${equipmentOptions}
        - "General Facility"
        - "Other"
    validations:
      required: true

  - type: dropdown
    id: location
    attributes:
      label: Location
      description: Where is this equipment located?
      options:
${locationOptions}
        - "Other"
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Issue Description
      description: Describe the problem in detail
    validations:
      required: true

  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - "🟢 Low - Cosmetic or minor issue"
        - "🟡 Medium - Degraded functionality"
        - "🟠 High - Equipment unusable"
        - "🔴 Critical - Safety hazard"
      default: 1
    validations:
      required: true

  - type: checkboxes
    id: safety
    attributes:
      label: Safety Assessment
      options:
        - label: "⚠️ This is a potential safety hazard"
        - label: "🔒 Equipment should be locked out until repaired"

  - type: markdown
    attributes:
      value: |
        ---
        🔥 *Fire Triangle: FUEL (physical resources)*
        *Generated by SDCoLab Scheduler*
`;
    } else if (type === 'access') {
      const certEquipment = tools.filter(t => t.requiresCert).map(t => `        - "${t.name}"`).join('\n');
      
      yaml = `name: 🔑 Access Request
description: Request certification or access to restricted equipment
title: "[Access]: "
labels: ["access-request", "status:new", "fire:oxygen"]
assignees: []

body:
  - type: markdown
    attributes:
      value: |
        ## Certification / Access Request
        Request access to equipment that requires certification.

  - type: dropdown
    id: equipment
    attributes:
      label: Equipment/Area
      description: Which equipment do you need access to?
      multiple: true
      options:
${certEquipment}
        - "After-Hours Building Access"
        - "Other"
    validations:
      required: true

  - type: textarea
    id: justification
    attributes:
      label: Justification
      description: Why do you need this access?
    validations:
      required: true

  - type: textarea
    id: experience
    attributes:
      label: Relevant Experience
      description: Describe your experience with this type of equipment
    validations:
      required: true

  - type: checkboxes
    id: agreements
    attributes:
      label: Agreements
      options:
        - label: "I agree to follow all safety protocols"
          required: true
        - label: "I understand access can be revoked for violations"
          required: true

  - type: markdown
    attributes:
      value: |
        ---
        🔥 *Fire Triangle: OXYGEN (governance)*
        *Generated by SDCoLab Scheduler*
`;
    }
    
    sendSuccess(res, {
      type,
      yaml,
      tools: tools.map(t => ({ id: t.id, name: t.name, requiresCert: t.requiresCert })),
      rooms: rooms.map(r => ({ id: r.id, name: r.name })),
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Generate template error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to generate template');
  }
});

// =============================================================================
// Issue Endpoints (GitHub as primary, DynamoDB as cache)
// =============================================================================

/**
 * GET /api/github/issues
 * Fetch issues from GitHub with DynamoDB caching
 */
router.get('/issues', authenticate, requireGitHub, async (req, res) => {
  try {
    const { state = 'open', labels, force, page = 1, per_page = 30 } = req.query;
    const { org, repo } = config.github;
    
    // Check cache freshness
    let useCache = false;
    let cacheData = null;
    
    if (!force) {
      // Check last sync time from a metadata record
      try {
        const metaResponse = await docClient.send(new GetCommand({
          TableName: RESOURCES_TABLE,
          Key: { id: 'github-issues-meta' }
        }));
        
        if (metaResponse.Item?.lastSyncedAt) {
          const cacheAge = (Date.now() - new Date(metaResponse.Item.lastSyncedAt).getTime()) / 1000 / 60;
          if (cacheAge < CACHE_STALE_MINUTES) {
            useCache = true;
          }
        }
      } catch (err) {
        // No meta record, fetch fresh
      }
    }
    
    // If cache is fresh, return from DynamoDB
    if (useCache) {
      const cacheResponse = await docClient.send(new ScanCommand({
        TableName: RESOURCES_TABLE,
        FilterExpression: '#type = :type AND #state = :state',
        ExpressionAttributeNames: {
          '#type': 'recordType',
          '#state': 'state'
        },
        ExpressionAttributeValues: {
          ':type': 'github-issue',
          ':state': state
        }
      }));
      
      const issues = (cacheResponse.Items || [])
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      
      return sendSuccess(res, {
        issues,
        total: issues.length,
        cached: true,
        source: 'dynamodb'
      });
    }
    
    // Fetch from GitHub
    let url = `https://api.github.com/repos/${org}/${repo}/issues?state=${state}&page=${page}&per_page=${per_page}`;
    if (labels) {
      url += `&labels=${encodeURIComponent(labels)}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.github.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SDCoLab-Scheduler/4.2.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const githubIssues = await response.json();
    
    // Filter out pull requests (GitHub API returns them with issues)
    const issues = githubIssues
      .filter(i => !i.pull_request)
      .map(transformGitHubIssue);
    
    // Update cache
    for (const issue of issues) {
      await docClient.send(new PutCommand({
        TableName: RESOURCES_TABLE,
        Item: issue
      }));
    }
    
    // Update meta record
    await docClient.send(new PutCommand({
      TableName: RESOURCES_TABLE,
      Item: {
        id: 'github-issues-meta',
        recordType: 'meta',
        lastSyncedAt: new Date().toISOString(),
        issueCount: issues.length
      }
    }));
    
    sendSuccess(res, {
      issues,
      total: issues.length,
      cached: false,
      source: 'github'
    });
    
  } catch (error) {
    console.error('Fetch issues error:', error);
    
    // Fallback to cache on error
    try {
      const cacheResponse = await docClient.send(new ScanCommand({
        TableName: RESOURCES_TABLE,
        FilterExpression: '#type = :type',
        ExpressionAttributeNames: { '#type': 'recordType' },
        ExpressionAttributeValues: { ':type': 'github-issue' }
      }));
      
      if (cacheResponse.Items?.length > 0) {
        return sendSuccess(res, {
          issues: cacheResponse.Items,
          total: cacheResponse.Items.length,
          cached: true,
          stale: true,
          warning: 'GitHub unavailable, showing cached data',
          source: 'dynamodb'
        });
      }
    } catch (cacheError) {
      // Cache also failed
    }
    
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch issues', {
      message: error.message
    });
  }
});

/**
 * GET /api/github/issues/:number
 * Get a single issue with comments
 */
router.get('/issues/:number', authenticate, requireGitHub, async (req, res) => {
  try {
    const { number } = req.params;
    const { org, repo } = config.github;
    
    // Fetch issue
    const issueResponse = await fetch(
      `https://api.github.com/repos/${org}/${repo}/issues/${number}`,
      {
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        }
      }
    );
    
    if (!issueResponse.ok) {
      if (issueResponse.status === 404) {
        return sendError(res, ErrorCodes.NOT_FOUND, 'Issue not found');
      }
      throw new Error(`GitHub API error: ${issueResponse.status}`);
    }
    
    const githubIssue = await issueResponse.json();
    const issue = transformGitHubIssue(githubIssue);
    
    // Fetch comments
    const commentsResponse = await fetch(
      `https://api.github.com/repos/${org}/${repo}/issues/${number}/comments`,
      {
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        }
      }
    );
    
    let comments = [];
    if (commentsResponse.ok) {
      const ghComments = await commentsResponse.json();
      comments = ghComments.map(c => ({
        id: c.id,
        body: c.body,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        author: c.user?.login || 'unknown',
        authorAvatarUrl: c.user?.avatar_url
      }));
    }
    
    // Update cache
    await docClient.send(new PutCommand({
      TableName: RESOURCES_TABLE,
      Item: { ...issue, comments }
    }));
    
    sendSuccess(res, {
      issue,
      comments,
      source: 'github'
    });
    
  } catch (error) {
    console.error('Fetch issue error:', error);
    
    // Try cache
    try {
      const cacheResponse = await docClient.send(new GetCommand({
        TableName: RESOURCES_TABLE,
        Key: { id: `gh-issue-${req.params.number}` }
      }));
      
      if (cacheResponse.Item) {
        return sendSuccess(res, {
          issue: cacheResponse.Item,
          comments: cacheResponse.Item.comments || [],
          cached: true,
          stale: true,
          warning: 'GitHub unavailable, showing cached data'
        });
      }
    } catch (cacheError) {
      // Cache also failed
    }
    
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch issue');
  }
});

/**
 * GET /api/github/issues/:number/version
 * Check if issue has been updated (for optimistic conflict resolution)
 */
router.get('/issues/:number/version', authenticate, requireGitHub, async (req, res) => {
  try {
    const { number } = req.params;
    const { since, commentCount: clientCommentCount } = req.query;
    const { org, repo } = config.github;
    
    // Fetch just the issue metadata (lightweight)
    const response = await fetch(
      `https://api.github.com/repos/${org}/${repo}/issues/${number}`,
      {
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const issue = await response.json();
    
    const currentVersion = issue.updated_at;
    const currentCommentCount = issue.comments || 0;
    const sinceDate = since ? new Date(since) : null;
    const hasUpdates = sinceDate ? new Date(currentVersion) > sinceDate : false;
    const newCommentCount = clientCommentCount ? 
      currentCommentCount - parseInt(clientCommentCount) : 0;
    
    sendSuccess(res, {
      currentVersion,
      commentCount: currentCommentCount,
      hasUpdates,
      newCommentCount: Math.max(0, newCommentCount),
      state: issue.state,
      stateChanged: false // Would need to track previous state to determine this
    });
    
  } catch (error) {
    console.error('Version check error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to check issue version');
  }
});

/**
 * POST /api/github/issues
 * Create a new issue in GitHub (write-through to cache)
 */
router.post('/issues', authenticate, requireGitHub, async (req, res) => {
  try {
    const { title, body, labels = [], template } = req.body;
    const { org, repo } = config.github;
    
    if (!title || !body) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Title and body are required');
    }
    
    // Add template label if provided
    const allLabels = [...labels];
    if (template) {
      allLabels.push(`template:${template}`);
    }
    
    // Add submitter info to body
    const enrichedBody = `${body}

---
📋 *Submitted by:* ${req.user.displayName || req.user.email}
📅 *Date:* ${new Date().toLocaleDateString()}
🔧 *Via:* SDCoLab Scheduler`;
    
    // Create in GitHub
    const response = await fetch(
      `https://api.github.com/repos/${org}/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        },
        body: JSON.stringify({
          title,
          body: enrichedBody,
          labels: allLabels
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }
    
    const githubIssue = await response.json();
    const issue = transformGitHubIssue(githubIssue);
    
    // Cache the new issue
    await docClient.send(new PutCommand({
      TableName: RESOURCES_TABLE,
      Item: issue
    }));
    
    console.log(`🐙 Created GitHub issue #${githubIssue.number}`);
    
    sendSuccess(res, {
      issue,
      message: `Issue #${githubIssue.number} created successfully`,
      githubUrl: githubIssue.html_url
    });
    
  } catch (error) {
    console.error('Create issue error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create issue', {
      message: error.message
    });
  }
});

/**
 * POST /api/github/issues/:number/comments
 * Add a comment to an issue
 */
router.post('/issues/:number/comments', authenticate, requireGitHub, async (req, res) => {
  try {
    const { number } = req.params;
    const { body } = req.body;
    const { org, repo } = config.github;
    
    if (!body) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Comment body is required');
    }
    
    // Add commenter info
    const enrichedBody = `${body}

---
*— ${req.user.displayName || req.user.email} via SDCoLab Scheduler*`;
    
    const response = await fetch(
      `https://api.github.com/repos/${org}/${repo}/issues/${number}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        },
        body: JSON.stringify({ body: enrichedBody })
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const comment = await response.json();
    
    console.log(`🐙 Added comment to issue #${number}`);
    
    sendSuccess(res, {
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.created_at,
        author: comment.user?.login
      },
      message: 'Comment added successfully'
    });
    
  } catch (error) {
    console.error('Add comment error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to add comment');
  }
});

/**
 * PATCH /api/github/issues/:number
 * Update an issue (state, labels)
 */
router.patch('/issues/:number', authenticate, requireGitHub, async (req, res) => {
  try {
    const { number } = req.params;
    const { state, labels, status, addLabels, removeLabels } = req.body;
    const { org, repo } = config.github;
    
    // Build update payload
    const updates = {};
    
    if (state) {
      updates.state = state;
      if (state === 'closed') {
        updates.state_reason = req.body.stateReason || 'completed';
      }
    }
    
    // Handle labels
    if (labels) {
      updates.labels = labels;
    } else if (addLabels || removeLabels || status) {
      // Fetch current labels first
      const issueResponse = await fetch(
        `https://api.github.com/repos/${org}/${repo}/issues/${number}`,
        {
          headers: {
            'Authorization': `Bearer ${config.github.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'SDCoLab-Scheduler/4.2.0'
          }
        }
      );
      
      if (issueResponse.ok) {
        const issue = await issueResponse.json();
        let currentLabels = issue.labels.map(l => l.name);
        
        // Remove old status labels if setting new status
        if (status) {
          currentLabels = currentLabels.filter(l => !l.startsWith('status:'));
          currentLabels.push(`status:${status}`);
        }
        
        // Add/remove specific labels
        if (addLabels) {
          currentLabels = [...new Set([...currentLabels, ...addLabels])];
        }
        if (removeLabels) {
          currentLabels = currentLabels.filter(l => !removeLabels.includes(l));
        }
        
        updates.labels = currentLabels;
      }
    }
    
    // Update in GitHub
    const response = await fetch(
      `https://api.github.com/repos/${org}/${repo}/issues/${number}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        },
        body: JSON.stringify(updates)
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const githubIssue = await response.json();
    const issue = transformGitHubIssue(githubIssue);
    
    // Update cache
    await docClient.send(new PutCommand({
      TableName: RESOURCES_TABLE,
      Item: issue
    }));
    
    // Add status change comment if status changed
    if (status && req.body.comment !== false) {
      const statusEmojis = {
        'new': '🆕',
        'triaged': '📋',
        'in-progress': '🔧',
        'resolved': '✅',
        'wont-fix': '🚫'
      };
      
      await fetch(
        `https://api.github.com/repos/${org}/${repo}/issues/${number}/comments`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.github.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'SDCoLab-Scheduler/4.2.0'
          },
          body: JSON.stringify({
            body: `${statusEmojis[status] || '📝'} **Status changed to:** \`${status}\`

*— ${req.user.displayName || req.user.email} via SDCoLab Scheduler*`
          })
        }
      );
    }
    
    console.log(`🐙 Updated GitHub issue #${number}`);
    
    sendSuccess(res, {
      issue,
      message: `Issue #${number} updated successfully`
    });
    
  } catch (error) {
    console.error('Update issue error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update issue');
  }
});

/**
 * POST /api/github/issues/sync
 * Force a full sync from GitHub to cache
 */
router.post('/issues/sync', authenticate, requireGitHub, async (req, res) => {
  try {
    if (!['admin', 'superadmin', 'steward'].includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Not authorized');
    }
    
    const { org, repo } = config.github;
    
    // Fetch all open issues
    const openResponse = await fetch(
      `https://api.github.com/repos/${org}/${repo}/issues?state=open&per_page=100`,
      {
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        }
      }
    );
    
    if (!openResponse.ok) {
      throw new Error(`GitHub API error: ${openResponse.status}`);
    }
    
    const openIssues = await openResponse.json();
    
    // Fetch recently closed issues (last 30 days)
    const closedResponse = await fetch(
      `https://api.github.com/repos/${org}/${repo}/issues?state=closed&per_page=50&sort=updated`,
      {
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        }
      }
    );
    
    let closedIssues = [];
    if (closedResponse.ok) {
      closedIssues = await closedResponse.json();
    }
    
    // Combine and dedupe
    const allIssues = [...openIssues, ...closedIssues]
      .filter(i => !i.pull_request)
      .map(transformGitHubIssue);
    
    // Update cache
    let synced = 0;
    for (const issue of allIssues) {
      await docClient.send(new PutCommand({
        TableName: RESOURCES_TABLE,
        Item: issue
      }));
      synced++;
    }
    
    // Update meta
    await docClient.send(new PutCommand({
      TableName: RESOURCES_TABLE,
      Item: {
        id: 'github-issues-meta',
        recordType: 'meta',
        lastSyncedAt: new Date().toISOString(),
        issueCount: allIssues.length,
        syncedBy: req.user.email
      }
    }));
    
    console.log(`🐙 Synced ${synced} issues from GitHub`);
    
    sendSuccess(res, {
      synced,
      openCount: openIssues.filter(i => !i.pull_request).length,
      closedCount: closedIssues.filter(i => !i.pull_request).length,
      message: `Synced ${synced} issues from GitHub`
    });
    
  } catch (error) {
    console.error('Sync error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to sync issues');
  }
});

/**
 * GET /api/github/status
 * Check GitHub integration status
 */
// Status cache (prevent rapid GitHub API calls)
let statusCache = {
  data: null,
  fetchedAt: null
};
const STATUS_CACHE_SECONDS = 30;

router.get('/status', authenticate, async (req, res) => {
  try {
    const enabled = isFeatureEnabled('github');
    const configured = !!config.github.token;
    
    // If not enabled or configured, return immediately without API calls
    if (!enabled || !configured) {
      return sendSuccess(res, {
        enabled,
        configured,
        connected: false,
        org: config.github.org,
        repo: config.github.repo
      });
    }
    
    // Check cache to prevent rapid API calls
    if (statusCache.data && statusCache.fetchedAt) {
      const cacheAge = (Date.now() - statusCache.fetchedAt) / 1000;
      if (cacheAge < STATUS_CACHE_SECONDS) {
        return sendSuccess(res, statusCache.data);
      }
    }
    
    const status = {
      enabled,
      configured,
      org: config.github.org,
      repo: config.github.repo
    };
    
    // Test connection
    const response = await fetch(
      `https://api.github.com/repos/${config.github.org}/${config.github.repo}`,
      {
        headers: {
          'Authorization': `Bearer ${config.github.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SDCoLab-Scheduler/4.2.0'
        }
      }
    );
    
    status.connected = response.ok;
    if (response.ok) {
      const repoData = await response.json();
      status.repoDetails = {
        fullName: repoData.full_name,
        private: repoData.private,
        hasIssues: repoData.has_issues
      };
    } else {
      status.error = `GitHub API returned ${response.status}`;
    }
    
    // Check rate limit
    const rateResponse = await fetch('https://api.github.com/rate_limit', {
      headers: {
        'Authorization': `Bearer ${config.github.token}`,
        'User-Agent': 'SDCoLab-Scheduler/4.2.0'
      }
    });
    
    if (rateResponse.ok) {
      const rateData = await rateResponse.json();
      status.rateLimit = {
        remaining: rateData.rate.remaining,
        limit: rateData.rate.limit,
        resetsAt: new Date(rateData.rate.reset * 1000).toISOString()
      };
    }
    
    // Cache the result
    statusCache = {
      data: status,
      fetchedAt: Date.now()
    };
    
    sendSuccess(res, status);
    
  } catch (error) {
    console.error('Status check error:', error);
    sendSuccess(res, {
      enabled: isFeatureEnabled('github'),
      configured: !!config.github.token,
      connected: false,
      error: error.message
    });
  }
});

export default router;
