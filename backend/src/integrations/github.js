/**
 * GitHub Integration Service
 * 
 * Integrates with GitHub Issues, Discussions, and Projects for
 * facilities management, governance, and community engagement.
 * 
 * 🔥 Fire Triangle Alignment:
 *   - FUEL: Issues for bookings, maintenance, equipment
 *   - OXYGEN: Discussions for policy, governance, access
 *   - HEAT: Discussions for vision, feedback, community ideas
 * 
 * @version 3.9.0
 */

import { config, isFeatureEnabled, getToolById } from '../lib/config.js';

class GitHubService {
  constructor() {
    this.restUrl = 'https://api.github.com';
    this.graphqlUrl = 'https://api.github.com/graphql';
    this.initialized = false;
    this._repoId = null;
    this._discussionCategories = null;
  }

  /**
   * Initialize GitHub client
   */
  init() {
    if (!isFeatureEnabled('github')) {
      console.log('🐙 GitHub integration disabled');
      return false;
    }

    if (!config.github.token) {
      console.error('❌ GitHub token not configured');
      return false;
    }

    this.headers = {
      'Authorization': `Bearer ${config.github.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SDCoLab-Scheduler/3.9.0'
    };

    this.graphqlHeaders = {
      'Authorization': `Bearer ${config.github.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'SDCoLab-Scheduler/3.9.0'
    };

    this.initialized = true;
    console.log('✅ GitHub integration initialized (Issues, Discussions, Projects)');
    return true;
  }

  // ===========================================================================
  // REST API (Issues)
  // ===========================================================================

  /**
   * Make GitHub REST API request
   */
  async rest(method, endpoint, body = null) {
    if (!this.initialized && !this.init()) {
      return null;
    }

    const url = `${this.restUrl}${endpoint}`;
    const options = {
      method,
      headers: this.headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `GitHub API error: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`❌ GitHub REST ${method} ${endpoint} failed:`, error.message);
      throw error;
    }
  }

  // ===========================================================================
  // GraphQL API (Discussions, Projects)
  // ===========================================================================

  /**
   * Make GitHub GraphQL API request
   */
  async graphql(query, variables = {}) {
    if (!this.initialized && !this.init()) {
      return null;
    }

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: this.graphqlHeaders,
        body: JSON.stringify({ query, variables })
      });

      const result = await response.json();

      if (result.errors) {
        const msg = result.errors.map(e => e.message).join(', ');
        throw new Error(`GraphQL error: ${msg}`);
      }

      return result.data;
    } catch (error) {
      console.error('❌ GitHub GraphQL failed:', error.message);
      throw error;
    }
  }

  /**
   * Get repository node ID (cached, needed for GraphQL mutations)
   */
  async getRepoId() {
    if (this._repoId) return this._repoId;

    const { org, repo } = config.github;
    const data = await this.graphql(`
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
        }
      }
    `, { owner: org, name: repo });

    this._repoId = data.repository.id;
    return this._repoId;
  }

  // ===========================================================================
  // Fire Triangle Labels & Templates
  // ===========================================================================

  /**
   * Get Fire Triangle classification for content
   */
  getFireType(contentType) {
    const mapping = {
      // FUEL - physical resources
      booking: 'fuel',
      maintenance: 'fuel',
      equipment: 'fuel',
      supply: 'fuel',
      
      // OXYGEN - governance
      access: 'oxygen',
      certification: 'oxygen',
      policy: 'oxygen',
      governance: 'oxygen',
      
      // HEAT - community
      vision: 'heat',
      feedback: 'heat',
      idea: 'heat',
      event: 'heat'
    };
    return mapping[contentType] || 'fuel';
  }

  /**
   * Build labels for content
   */
  getLabels(contentType, status = null) {
    const labels = [
      `fire:${this.getFireType(contentType)}`,
      contentType
    ];
    
    if (status) {
      labels.push(`status:${status}`);
    }
    
    if (status === 'pending') {
      labels.push('needs-review');
    }

    return labels;
  }

  // ===========================================================================
  // ISSUES - Action items, bookings, maintenance
  // ===========================================================================

  /**
   * Create GitHub issue
   */
  async createIssue({ title, body, labels = [], contentType = 'booking' }) {
    if (!isFeatureEnabled('github')) return null;

    const { org, repo } = config.github;
    const endpoint = `/repos/${org}/${repo}/issues`;
    const allLabels = [...this.getLabels(contentType), ...labels];

    try {
      const issue = await this.rest('POST', endpoint, {
        title,
        body,
        labels: allLabels
      });

      console.log(`🐙 Created issue #${issue.number}`);

      // Optionally add to project
      if (config.github.projectId) {
        await this.addToProject(issue.node_id).catch(e => 
          console.warn('⚠️ Could not add to project:', e.message)
        );
      }

      return {
        type: 'issue',
        number: issue.number,
        url: issue.html_url,
        nodeId: issue.node_id
      };
    } catch (error) {
      console.error('❌ Create issue failed:', error.message);
      return null;
    }
  }

  /**
   * Update existing issue
   */
  async updateIssue(issueNumber, updates) {
    if (!isFeatureEnabled('github') || !issueNumber) return null;

    const { org, repo } = config.github;
    const endpoint = `/repos/${org}/${repo}/issues/${issueNumber}`;

    try {
      const issue = await this.rest('PATCH', endpoint, updates);
      console.log(`🐙 Updated issue #${issueNumber}`);
      return { type: 'issue', number: issue.number, url: issue.html_url };
    } catch (error) {
      console.error('❌ Update issue failed:', error.message);
      return null;
    }
  }

  /**
   * Add comment to issue
   */
  async commentOnIssue(issueNumber, body) {
    if (!isFeatureEnabled('github') || !issueNumber) return null;

    const { org, repo } = config.github;
    const endpoint = `/repos/${org}/${repo}/issues/${issueNumber}/comments`;

    try {
      const comment = await this.rest('POST', endpoint, { body });
      console.log(`🐙 Commented on issue #${issueNumber}`);
      return comment;
    } catch (error) {
      console.error('❌ Add comment failed:', error.message);
      return null;
    }
  }

  /**
   * Close issue with reason
   */
  async closeIssue(issueNumber, reason = 'completed') {
    return this.updateIssue(issueNumber, {
      state: 'closed',
      state_reason: reason // 'completed' or 'not_planned'
    });
  }

  // ===========================================================================
  // DISCUSSIONS - Policy, feedback, community ideas
  // ===========================================================================

  /**
   * Get discussion categories for the repo (cached)
   */
  async getDiscussionCategories() {
    if (this._discussionCategories) return this._discussionCategories;

    const { org, repo } = config.github;
    const data = await this.graphql(`
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          discussionCategories(first: 20) {
            nodes {
              id
              name
              slug
              emoji
              description
            }
          }
        }
      }
    `, { owner: org, name: repo });

    this._discussionCategories = data.repository.discussionCategories.nodes;
    return this._discussionCategories;
  }

  /**
   * Find category by name/slug
   */
  async findCategory(nameOrSlug) {
    const categories = await this.getDiscussionCategories();
    const lower = nameOrSlug.toLowerCase();
    return categories.find(c => 
      c.name.toLowerCase() === lower || 
      c.slug.toLowerCase() === lower
    );
  }

  /**
   * Map content type to suggested discussion category
   */
  suggestCategory(contentType) {
    const mapping = {
      policy: 'general',
      feedback: 'ideas',
      idea: 'ideas',
      vision: 'ideas',
      question: 'q-a',
      announcement: 'announcements',
      event: 'general'
    };
    return mapping[contentType] || 'general';
  }

  /**
   * Create GitHub Discussion
   */
  async createDiscussion({ title, body, category = null, contentType = 'feedback' }) {
    if (!isFeatureEnabled('github')) return null;
    if (!config.github.enableDiscussions) {
      console.log('🐙 Discussions not enabled, falling back to issue');
      return this.createIssue({ title, body, contentType });
    }

    try {
      const repoId = await this.getRepoId();
      
      // Find category
      const categoryName = category || this.suggestCategory(contentType);
      const categoryObj = await this.findCategory(categoryName);
      
      if (!categoryObj) {
        console.warn(`⚠️ Discussion category '${categoryName}' not found, using first available`);
        const categories = await this.getDiscussionCategories();
        if (!categories.length) {
          throw new Error('No discussion categories found in repo');
        }
      }

      const categoryId = categoryObj?.id || (await this.getDiscussionCategories())[0]?.id;

      // Add Fire Triangle context to body
      const fireType = this.getFireType(contentType);
      const enrichedBody = `${body}\n\n---\n🔥 **Fire Triangle:** \`${fireType}\` | 📋 **Type:** ${contentType}`;

      const data = await this.graphql(`
        mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
          createDiscussion(input: {
            repositoryId: $repoId
            categoryId: $categoryId
            title: $title
            body: $body
          }) {
            discussion {
              id
              number
              url
            }
          }
        }
      `, {
        repoId,
        categoryId,
        title,
        body: enrichedBody
      });

      const discussion = data.createDiscussion.discussion;
      console.log(`🐙 Created discussion #${discussion.number}`);

      return {
        type: 'discussion',
        number: discussion.number,
        url: discussion.url,
        nodeId: discussion.id
      };
    } catch (error) {
      console.error('❌ Create discussion failed:', error.message);
      console.log('🐙 Falling back to issue');
      return this.createIssue({ title, body, contentType });
    }
  }

  /**
   * Add comment to discussion
   */
  async commentOnDiscussion(discussionId, body) {
    if (!isFeatureEnabled('github')) return null;

    try {
      const data = await this.graphql(`
        mutation($discussionId: ID!, $body: String!) {
          addDiscussionComment(input: {
            discussionId: $discussionId
            body: $body
          }) {
            comment {
              id
              url
            }
          }
        }
      `, { discussionId, body });

      console.log('🐙 Commented on discussion');
      return data.addDiscussionComment.comment;
    } catch (error) {
      console.error('❌ Discussion comment failed:', error.message);
      return null;
    }
  }

  // ===========================================================================
  // PROJECTS - Visual tracking, kanban, timelines
  // ===========================================================================

  /**
   * Add item (issue/discussion) to a project board
   */
  async addToProject(contentId, projectId = null) {
    if (!isFeatureEnabled('github')) return null;

    const targetProject = projectId || config.github.projectId;
    if (!targetProject) {
      console.log('🐙 No project configured, skipping');
      return null;
    }

    try {
      const data = await this.graphql(`
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: {
            projectId: $projectId
            contentId: $contentId
          }) {
            item {
              id
            }
          }
        }
      `, { projectId: targetProject, contentId });

      console.log('🐙 Added to project board');
      return data.addProjectV2ItemById.item;
    } catch (error) {
      console.error('❌ Add to project failed:', error.message);
      return null;
    }
  }

  /**
   * Update project item field (e.g., status column)
   */
  async updateProjectItemField(itemId, fieldId, value, projectId = null) {
    if (!isFeatureEnabled('github')) return null;

    const targetProject = projectId || config.github.projectId;
    if (!targetProject) return null;

    try {
      const data = await this.graphql(`
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: $value
          }) {
            projectV2Item {
              id
            }
          }
        }
      `, { projectId: targetProject, itemId, fieldId, value });

      console.log('🐙 Updated project item field');
      return data.updateProjectV2ItemFieldValue.projectV2Item;
    } catch (error) {
      console.error('❌ Update project field failed:', error.message);
      return null;
    }
  }

  // ===========================================================================
  // HIGH-LEVEL HELPERS - Common operations
  // ===========================================================================

  /**
   * Create booking request (Issue, optionally on Project)
   */
  async createBookingRequest(booking) {
    const tool = getToolById(booking.tool);
    const title = `🔧 ${booking.toolName} - ${booking.date}`;
    const body = this.templates.booking(booking, tool);

    return this.createIssue({
      title,
      body,
      contentType: 'booking',
      labels: [`status:${booking.status}`]
    });
  }

  /**
   * Create maintenance request (Issue, on Project if configured)
   */
  async createMaintenanceRequest({ tool, description, priority = 'normal', reportedBy }) {
    const title = `🔧 Maintenance: ${tool}`;
    const body = this.templates.maintenance({ tool, description, priority, reportedBy });

    return this.createIssue({
      title,
      body,
      contentType: 'maintenance',
      labels: [`priority:${priority}`]
    });
  }

  /**
   * Create policy discussion (Discussion in governance category)
   */
  async createPolicyDiscussion({ title, question, context, proposedBy }) {
    const body = this.templates.policy({ question, context, proposedBy });

    return this.createDiscussion({
      title: `📜 ${title}`,
      body,
      category: 'general',
      contentType: 'policy'
    });
  }

  /**
   * Create feedback/idea (Discussion in ideas category)
   */
  async createFeedback({ title, idea, proposedBy }) {
    const body = this.templates.feedback({ idea, proposedBy });

    return this.createDiscussion({
      title: `💡 ${title}`,
      body,
      category: 'ideas',
      contentType: 'feedback'
    });
  }

  /**
   * Create vision proposal (Discussion for community)
   */
  async createVisionProposal({ title, vision, proposedBy }) {
    const body = this.templates.vision({ vision, proposedBy });

    return this.createDiscussion({
      title: `🔥 ${title}`,
      body,
      category: 'ideas',
      contentType: 'vision'
    });
  }

  // ===========================================================================
  // TEMPLATES - Structured content bodies
  // ===========================================================================

  templates = {
    booking: (booking, tool) => {
      const formatTime = (t) => {
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
      };

      return `## 🔧 Tool Booking Request

**Tool:** ${booking.toolName}
**Room:** ${tool?.room || 'TBD'}
**Requested By:** ${booking.userName} (${booking.user})
**Date:** ${booking.date}
**Time:** ${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}

### Purpose
${booking.purpose}

---

### 🔥 Fire Triangle
- **Element:** \`fuel\` (physical resource)
- **Space:** ${tool?.room || 'SDCoLab'}

| Field | Value |
|-------|-------|
| Booking ID | \`${booking.id}\` |
| Status | ${booking.status} |
| Created | ${booking.createdAt || new Date().toISOString()} |

---
📅 *Filed via SDCoLab Scheduler*`;
    },

    maintenance: ({ tool, description, priority, reportedBy }) => `## 🔧 Maintenance Request

**Equipment:** ${tool}
**Priority:** ${priority}
**Reported By:** ${reportedBy}
**Date:** ${new Date().toISOString().split('T')[0]}

### Description
${description}

---

### 🔥 Fire Triangle
- **Element:** \`fuel\` (equipment maintenance)

---
🔧 *Filed via SDCoLab Scheduler*`,

    policy: ({ question, context, proposedBy }) => `## 📜 Policy Question

**Raised By:** ${proposedBy}
**Date:** ${new Date().toISOString().split('T')[0]}

### Question
${question}

### Context
${context}

---

### 🔥 Fire Triangle
- **Element:** \`oxygen\` (governance)

*Please share your thoughts below. This discussion will inform community policy.*`,

    feedback: ({ idea, proposedBy }) => `## 💡 Idea / Feedback

**From:** ${proposedBy}
**Date:** ${new Date().toISOString().split('T')[0]}

### The Idea
${idea}

---

### 🔥 Fire Triangle
- **Element:** \`heat\` (community engagement)

*Share your thoughts, reactions, and builds on this idea below!*`,

    vision: ({ vision, proposedBy }) => `## 🔥 Vision Proposal

**From:** ${proposedBy}
**Date:** ${new Date().toISOString().split('T')[0]}

### The Vision
${vision}

---

### 🔥 Fire Triangle
- **Element:** \`heat\` (community vision)

*This is about where we're going. Dream big, then let's figure out how to get there.*`,

    comments: {
      approved: (approvedBy, calendarUrl = null) => `## ✅ Approved

**By:** ${approvedBy}
**Date:** ${new Date().toISOString()}

${calendarUrl ? `📅 [View Calendar Event](${calendarUrl})` : ''}

Resource is reserved.`,

      rejected: (rejectedBy, reason) => `## ❌ Rejected

**By:** ${rejectedBy}
**Reason:** ${reason || 'No reason provided'}
**Date:** ${new Date().toISOString()}

Please submit a new request if needed.`,

      cancelled: (cancelledBy) => `## 🗑️ Cancelled

**By:** ${cancelledBy}
**Date:** ${new Date().toISOString()}

Resource released.`,

      completed: () => `## ✅ Completed

**Date:** ${new Date().toISOString()}

Booking completed successfully.`
    }
  };

  // ===========================================================================
  // STATUS CHECKS
  // ===========================================================================

  /**
   * Check if GitHub integration is healthy
   */
  async healthCheck() {
    if (!isFeatureEnabled('github')) {
      return { enabled: false };
    }

    try {
      const { org, repo } = config.github;
      await this.rest('GET', `/repos/${org}/${repo}`);
      
      const features = {
        issues: true,
        discussions: config.github.enableDiscussions || false,
        projects: !!config.github.projectId
      };

      return { 
        enabled: true, 
        initialized: this.initialized,
        repo: `${org}/${repo}`,
        features
      };
    } catch (error) {
      return { 
        enabled: true, 
        initialized: false, 
        error: error.message 
      };
    }
  }

  // ===========================================================================
  // ALIAS METHODS - For integration compatibility
  // ===========================================================================

  /**
   * Alias for createBookingRequest (used by integration hooks)
   */
  async createBookingIssue(booking) {
    return this.createBookingRequest(booking);
  }

  /**
   * Update a booking issue status
   */
  async updateBookingIssue(issueNumber, booking) {
    if (!issueNumber) return null;
    
    const statusLabels = {
      pending: ['status:pending', 'needs-review'],
      approved: ['status:approved'],
      rejected: ['status:rejected'],
      cancelled: ['status:cancelled']
    };
    
    return this.updateIssue(issueNumber, {
      labels: ['fire:fuel', 'booking', ...(statusLabels[booking.status] || [])]
    });
  }

  /**
   * Add comment to issue (alias for commentOnIssue)
   */
  async addIssueComment(issueNumber, body) {
    return this.commentOnIssue(issueNumber, body);
  }

  /**
   * Pre-built comment templates for booking events
   */
  comments = {
    approved: (booking, approvedBy) => `## ✅ Booking Approved

**Approved by:** ${approvedBy?.displayName || approvedBy?.email || 'Admin'}
**Date:** ${new Date().toISOString()}

${booking.calendarEventUrl ? `📅 [View Calendar Event](${booking.calendarEventUrl})` : ''}

The resource has been reserved.`,

    rejected: (booking, rejectedBy, reason) => `## ❌ Booking Rejected

**Rejected by:** ${rejectedBy?.displayName || rejectedBy?.email || 'Admin'}
**Reason:** ${reason || 'No reason provided'}
**Date:** ${new Date().toISOString()}

Please submit a new request if needed.`,

    cancelled: (booking, cancelledBy) => `## 🗑️ Booking Cancelled

**Cancelled by:** ${cancelledBy?.displayName || cancelledBy?.email || 'User'}
**Date:** ${new Date().toISOString()}

The resource reservation has been released.`,

    updated: (booking, updatedBy) => `## ✏️ Booking Updated

**Updated by:** ${updatedBy?.displayName || updatedBy?.email || 'User'}
**Date:** ${new Date().toISOString()}
**New Details:**
- Date: ${booking.date}
- Time: ${booking.startTime} - ${booking.endTime}
- Purpose: ${booking.purpose || 'N/A'}

${booking.status === 'pending' ? '⏳ Awaiting re-approval' : ''}`,

    completed: (booking) => `## ✅ Booking Completed

**Date:** ${new Date().toISOString()}

The booking has been completed successfully.`
  };
}

// Export singleton
export const githubService = new GitHubService();
export default githubService;
