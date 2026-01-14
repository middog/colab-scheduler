/**
 * SDCoLab Scheduler - User Management Routes
 * 
 * Admin endpoints for user management:
 * - CRUD operations
 * - Bulk import
 * - Invites
 * - Activity logs
 * - Deactivation/reactivation
 * 
 * 🔥 Fire Triangle: OXYGEN layer - governance and administration
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { config } from '../lib/config.js';
import { userService, activityService, inviteService } from '../lib/database.js';
import { ErrorCodes, sendSuccess, sendError } from '../lib/responses.js';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth.js';
import { sendInviteEmail, sendUserCreatedEmail } from '../integrations/email.js';

const router = Router();

// All user management routes require authentication
router.use(authenticate);

// =============================================================================
// User CRUD (Admin only)
// =============================================================================

/**
 * GET /api/users
 * List all users with pagination support
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, role, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    
    let users = await userService.getAll({ status });
    
    // Filter by role
    if (role) {
      users = users.filter(u => u.role === role);
    }
    
    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(u => 
        u.email.toLowerCase().includes(searchLower) ||
        u.displayName?.toLowerCase().includes(searchLower) ||
        u.firstName?.toLowerCase().includes(searchLower) ||
        u.lastName?.toLowerCase().includes(searchLower)
      );
    }
    
    // Calculate pagination
    const totalCount = users.length;
    const totalPages = Math.ceil(totalCount / limitNum);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    
    // Slice for current page
    const paginatedUsers = users.slice(startIndex, endIndex);
    
    // Remove sensitive fields
    const safeUsers = paginatedUsers.map(({ passwordHash, passwordResetToken, passwordResetExpires, doorAccessCode, alarmCode, ...safe }) => safe);
    
    // Log that admin viewed user list
    await activityService.log('admin.viewed_users', req.user, {
      type: 'users',
      name: 'User List'
    }, {
      filters: { status, role, search },
      page: pageNum,
      resultCount: safeUsers.length,
      totalCount
    });
    
    sendSuccess(res, { 
      users: safeUsers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get users');
  }
});

/**
 * GET /api/users/:email
 * Get single user
 */
router.get('/:email', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    const user = await userService.get(email);
    
    if (!user) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'User not found');
    }
    
    const { passwordHash, passwordResetToken, passwordResetExpires, ...safeUser } = user;
    
    // Log that admin viewed user
    await activityService.log('admin.viewed_user', req.user, {
      type: 'user',
      id: email,
      name: user.displayName
    });
    
    sendSuccess(res, { user: safeUser });
  } catch (error) {
    console.error('Get user error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get user');
  }
});

/**
 * POST /api/users
 * Create new user (admin) - sends welcome email with temp password
 * 
 * The difference between Create User and Invite:
 * - Create User: Immediately creates an active account with a temp password
 * - Invite: Sends link for user to complete their own registration
 * 
 * Use Create when you need to set up an account immediately
 * Use Invite when you want the user to set their own password
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const userData = req.body;
    
    // Check if exists
    const existing = await userService.get(userData.email);
    if (existing) {
      return sendError(res, ErrorCodes.CONFLICT, 'User already exists');
    }
    
    // Generate temp password if not provided
    const tempPassword = userData.password || crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    
    const user = await userService.create({
      ...userData,
      phone: userData.phone || null,
      notes: userData.notes || null,
      passwordHash,
      authProviders: [{
        provider: 'email',
        providerId: userData.email,
        linkedAt: new Date().toISOString()
      }],
      status: 'active', // Admin-created users are active
      approvedBy: req.user.email,
      approvedAt: new Date().toISOString(),
      requirePasswordChange: !userData.password // Flag if using temp password
    }, req.user);
    
    // Send welcome email with credentials
    const emailResult = await sendUserCreatedEmail(userData.email, {
      displayName: user.displayName || user.firstName || 'New User',
      email: userData.email,
      tempPassword: tempPassword,
      loginUrl: config.frontendUrl
    });
    
    const { passwordHash: _, ...safeUser } = user;
    sendSuccess(res, { 
      user: safeUser,
      emailSent: emailResult.success,
      tempPassword: !userData.password ? tempPassword : undefined // Only return if generated
    });
  } catch (error) {
    console.error('Create user error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create user');
  }
});

/**
 * PUT /api/users/:email
 * Update user
 */
router.put('/:email', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    const updates = req.body;
    
    // Hash password if updating
    if (updates.password) {
      updates.passwordHash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    }
    
    const user = await userService.update(email, updates, req.user);
    const { passwordHash: _, passwordResetToken, passwordResetExpires, ...safeUser } = user;
    
    sendSuccess(res, { user: safeUser });
  } catch (error) {
    console.error('Update user error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to update user');
  }
});

/**
 * DELETE /api/users/:email
 * Delete user
 */
router.delete('/:email', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Can't delete yourself
    if (email === req.user.email) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Cannot delete yourself');
    }
    
    // Can't delete superadmin unless you're superadmin
    const targetUser = await userService.get(email);
    if (targetUser?.role === 'superadmin' && req.user.role !== 'superadmin') {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Cannot delete superadmin');
    }
    
    await userService.delete(email, req.user);
    sendSuccess(res, { success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to delete user');
  }
});

// =============================================================================
// User Status Management
// =============================================================================

/**
 * POST /api/users/:email/approve
 * Approve pending user
 */
router.post('/:email/approve', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    const { role, permissions } = req.body;
    
    const user = await userService.get(email);
    if (!user) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'User not found');
    }
    
    if (user.status !== 'pending') {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'User is not pending approval');
    }
    
    const updates = {
      status: 'active',
      approvedBy: req.user.email,
      approvedAt: new Date().toISOString(),
      ...(role && { role }),
      ...(permissions && { permissions })
    };
    
    await userService.update(email, updates, req.user);
    
    await activityService.log('admin.approved_user', req.user, {
      type: 'user',
      id: email,
      name: user.displayName
    }, { role: role || user.role });
    
    sendSuccess(res, { success: true, message: 'User approved' });
  } catch (error) {
    console.error('Approve user error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to approve user');
  }
});

/**
 * POST /api/users/:email/deactivate
 * Deactivate user (soft delete)
 */
router.post('/:email/deactivate', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    const { reason } = req.body;
    
    if (email === req.user.email) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Cannot deactivate yourself');
    }
    
    const user = await userService.deactivate(email, reason || 'Deactivated by admin', req.user);
    
    const { passwordHash: _, ...safeUser } = user;
    sendSuccess(res, { user: safeUser, message: 'User deactivated' });
  } catch (error) {
    console.error('Deactivate user error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to deactivate user');
  }
});

/**
 * POST /api/users/:email/reactivate
 * Reactivate deactivated user
 */
router.post('/:email/reactivate', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    
    const user = await userService.update(email, {
      status: 'active',
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null
    }, req.user);
    
    await activityService.log('admin.reactivated_user', req.user, {
      type: 'user',
      id: email,
      name: user.displayName
    });
    
    const { passwordHash: _, ...safeUser } = user;
    sendSuccess(res, { user: safeUser, message: 'User reactivated' });
  } catch (error) {
    console.error('Reactivate user error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to reactivate user');
  }
});

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * POST /api/users/bulk/import
 * Import users from CSV
 * Expected format: email,firstName,lastName,role,tools
 */
router.post('/bulk/import', requireAdmin, async (req, res) => {
  try {
    const { csv, defaultRole = 'member', defaultTools = [] } = req.body;
    
    if (!csv) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'CSV data required');
    }
    
    // Parse CSV
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    // Transform to user objects
    const users = records.map(record => ({
      email: record.email,
      firstName: record.firstName || record.first_name || '',
      lastName: record.lastName || record.last_name || '',
      displayName: record.displayName || `${record.firstName || ''} ${record.lastName || ''}`.trim(),
      role: record.role || defaultRole,
      permissions: {
        tools: record.tools ? record.tools.split(',').map(t => t.trim()) : defaultTools,
        rooms: [],
        capabilities: ['can_view_schedule', 'can_book']
      }
    }));
    
    // Bulk import
    const results = await userService.bulkImport(users, req.user);
    
    sendSuccess(res, {
      message: `Imported ${results.success.length} users`,
      success: results.success,
      failed: results.failed
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Import failed: ' + error.message);
  }
});

/**
 * GET /api/users/bulk/export
 * Export users as CSV
 */
router.get('/bulk/export', requireAdmin, async (req, res) => {
  try {
    const users = await userService.getAll();
    
    // Build CSV
    const headers = ['email', 'firstName', 'lastName', 'displayName', 'role', 'status', 'tools', 'createdAt'];
    const rows = users.map(u => [
      u.email,
      u.firstName,
      u.lastName,
      u.displayName,
      u.role,
      u.status,
      u.permissions?.tools?.join(';') || '',
      u.createdAt
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    await activityService.log('admin.exported_users', req.user, {
      type: 'users'
    }, { count: users.length });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=users-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Export failed');
  }
});

// =============================================================================
// Invites
// =============================================================================

/**
 * GET /api/users/invites
 * List pending invites
 */
router.get('/invites', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const invites = await inviteService.getAll(status || null);
    sendSuccess(res, { invites });
  } catch (error) {
    console.error('Get invites error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get invites');
  }
});

/**
 * POST /api/users/invites
 * Create invite and send email
 * 
 * Invites allow you to pre-configure a user's role, permissions, and even
 * certifications before they register. When they click the invite link,
 * they'll set their own password and the account will be created with
 * all the pre-configured settings.
 */
router.post('/invites', requireAdmin, async (req, res) => {
  try {
    const { email, firstName, lastName, role, permissions, certifications, message } = req.body;
    
    if (!email) {
      return sendError(res, ErrorCodes.BAD_REQUEST, 'Email required');
    }
    
    // Check if user already exists
    const existing = await userService.get(email);
    if (existing) {
      return sendError(res, ErrorCodes.CONFLICT, 'User already exists');
    }
    
    const invite = await inviteService.create({
      email,
      firstName: firstName || null,
      lastName: lastName || null,
      role,
      permissions,
      preCertifications: certifications || [], // Tools they'll be pre-certified for
      message
    }, req.user);
    
    const inviteUrl = `${config.frontendUrl}/register?invite=${invite.id}`;
    
    // Send invite email
    const emailResult = await sendInviteEmail(email, {
      inviteUrl,
      inviterName: req.user.displayName || req.user.email,
      role: role || 'member',
      message,
      toolCount: permissions?.tools?.length || 0,
      firstName: firstName || null
    });
    
    await activityService.log('admin.sent_invite', req.user, {
      type: 'invite',
      id: invite.id,
      name: email
    }, { 
      role, 
      emailSent: emailResult.success,
      preCertifications: certifications?.length || 0
    });
    
    sendSuccess(res, { 
      invite,
      inviteUrl,
      emailSent: emailResult.success,
      message: emailResult.success 
        ? 'Invite sent! The user will receive an email with the invitation link.'
        : 'Invite created but email could not be sent. Share the link manually.'
    });
  } catch (error) {
    console.error('Create invite error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to create invite');
  }
});

// =============================================================================
// Activity Logs
// =============================================================================

/**
 * GET /api/users/activity
 * Get activity logs
 */
router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const { category, actorId, targetId, limit = 100 } = req.query;
    
    const logs = await activityService.query({
      category,
      actorId,
      targetId,
      limit: parseInt(limit)
    });
    
    // Record that admin viewed logs (oversight)
    await activityService.log('admin.viewed_activity_logs', req.user, {
      type: 'activity_logs'
    }, {
      filters: { category, actorId, targetId },
      resultCount: logs.length
    });
    
    sendSuccess(res, { logs });
  } catch (error) {
    console.error('Get activity error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get activity logs');
  }
});

/**
 * GET /api/users/:email/activity
 * Get activity for specific user
 */
router.get('/:email/activity', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    
    const logs = await activityService.query({ actorId: email });
    
    await activityService.log('admin.viewed_user_activity', req.user, {
      type: 'user',
      id: email
    });
    
    sendSuccess(res, { logs });
  } catch (error) {
    console.error('Get user activity error:', error);
    sendError(res, ErrorCodes.INTERNAL_ERROR, 'Failed to get activity');
  }
});

// =============================================================================
// Role Templates (for convenience)
// =============================================================================

/**
 * GET /api/users/roles
 * Get available roles and their default permissions
 */
router.get('/roles', authenticate, (req, res) => {
  const roles = {
    guest: {
      name: 'Guest',
      description: 'No access - pending verification',
      defaultPermissions: { tools: [], rooms: [], capabilities: [] }
    },
    member: {
      name: 'Member',
      description: 'Basic member - can view schedule',
      defaultPermissions: { tools: [], rooms: [], capabilities: ['can_view_schedule'] }
    },
    certified: {
      name: 'Certified Member',
      description: 'Can book tools they are certified for',
      defaultPermissions: { tools: [], rooms: [], capabilities: ['can_view_schedule', 'can_book'] }
    },
    steward: {
      name: 'Steward',
      description: 'Can approve bookings for their area',
      defaultPermissions: { tools: [], rooms: [], capabilities: ['can_view_schedule', 'can_book', 'can_approve_area'] }
    },
    admin: {
      name: 'Administrator',
      description: 'Full admin access',
      defaultPermissions: { tools: config.tools.map(t => t.id), rooms: config.rooms.map(r => r.id), capabilities: ['can_view_schedule', 'can_book', 'can_approve', 'can_admin'] }
    }
  };
  
  sendSuccess(res, { roles, tools: config.tools, rooms: config.rooms });
});

export default router;
