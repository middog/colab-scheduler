/**
 * SDCoLab Scheduler - Permission Utilities
 * 
 * 🔥 Fire Triangle Role System:
 *   - participant: Basic access (schedule, book, view own certs)
 *   - tender: Tool-scoped admin (manages specific tools via toolGrants)
 *   - operator: Full system access (integrations, templates, role management)
 * 
 * @version 4.2.0-rc69.15
 */

// =============================================================================
// Role Normalization (backward compatibility)
// =============================================================================

const ROLE_MAP = {
  member: 'participant',
  certified: 'participant',
  instructor: 'participant',
  steward: 'participant',
  admin: 'tender',
  superadmin: 'operator',
  // New roles map to themselves
  participant: 'participant',
  tender: 'tender',
  operator: 'operator'
};

/**
 * Normalize legacy roles to new Fire Triangle roles
 */
export const normalizeRole = (role) => ROLE_MAP[role] || 'participant';

/**
 * Get display name for role
 */
export const getRoleDisplayName = (role) => {
  const normalized = normalizeRole(role);
  const names = {
    participant: 'Participant',
    tender: 'Tender',
    operator: 'Operator'
  };
  return names[normalized] || 'Participant';
};

/**
 * Get role badge color classes
 */
export const getRoleBadgeClasses = (role) => {
  const normalized = normalizeRole(role);
  const classes = {
    operator: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    tender: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    participant: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  };
  return classes[normalized] || classes.participant;
};

// =============================================================================
// Role Checks
// =============================================================================

/**
 * Check if user has operator-level access (full system)
 */
export const isOperator = (user) => {
  if (!user) return false;
  return normalizeRole(user.role) === 'operator';
};

/**
 * Check if user has tender-level access (tool-scoped admin)
 */
export const isTender = (user) => {
  if (!user) return false;
  const normalized = normalizeRole(user.role);
  return normalized === 'tender' || normalized === 'operator';
};

/**
 * Check if user is a participant (basic access)
 */
export const isParticipant = (user) => {
  if (!user) return false;
  return normalizeRole(user.role) === 'participant';
};

/**
 * Check if user can manage a specific tool
 * Operators can manage all tools
 * Tenders can manage tools in their toolGrants array
 * Legacy admins (no toolGrants) can manage all tools
 */
export const canManageTool = (user, toolId) => {
  if (!user) return false;
  if (isOperator(user)) return true;
  if (!isTender(user)) return false;
  
  const grants = user.toolGrants || [];
  // Legacy admins without toolGrants get full access
  if (grants.length === 0 && (user.role === 'admin' || user.role === 'tender')) return true;
  // Check for wildcard or specific tool
  return grants.includes('*') || grants.includes(toolId);
};

/**
 * Get list of tools user can manage
 * Returns ['*'] for full access, or specific tool IDs
 */
export const getManagedTools = (user) => {
  if (!user) return [];
  if (isOperator(user)) return ['*'];
  if (!isTender(user)) return [];
  
  const grants = user.toolGrants || [];
  // Legacy admins without toolGrants get full access
  if (grants.length === 0 && (user.role === 'admin' || user.role === 'tender')) return ['*'];
  return grants;
};

/**
 * Check if user has full tool access (can manage all tools)
 */
export const hasFullToolAccess = (user) => {
  const managed = getManagedTools(user);
  return managed.includes('*');
};

// =============================================================================
// Navigation Groups (Fire Triangle)
// =============================================================================

/**
 * Navigation group definitions
 */
export const NAV_GROUPS = {
  oxygen: {
    id: 'oxygen',
    label: 'Oxygen',
    icon: '🌬️',
    description: 'Participate',
    routes: [
      { id: 'schedule', path: '#oxygen/schedule', label: 'Schedule', icon: 'Calendar' },
      { id: 'bookings', path: '#oxygen/bookings', label: 'My Bookings', icon: 'CalendarRange' },
      { id: 'certifications', path: '#oxygen/certifications', label: 'My Certifications', icon: 'Award' }
    ],
    access: () => true // Everyone
  },
  fuel: {
    id: 'fuel',
    label: 'Fuel',
    icon: '🪵',
    description: 'Resources',
    routes: [
      { id: 'resources', path: '#fuel/resources', label: 'Resources', icon: 'Settings' },
      { id: 'tool-config', path: '#fuel/tool-config', label: 'Tool Config', icon: 'Wrench' }
    ],
    access: (user) => isTender(user) // Tenders and Operators
  },
  heat: {
    id: 'heat',
    label: 'Heat',
    icon: '🔥',
    description: 'Community',
    routes: [
      { id: 'people', path: '#heat/people', label: 'People', icon: 'Users' },
      { id: 'issues', path: '#heat/issues', label: 'Issues', icon: 'AlertTriangle' },
      { id: 'activity', path: '#heat/activity', label: 'Activity', icon: 'Activity' }
    ],
    access: (user) => isTender(user) // Tenders and Operators
  },
  system: {
    id: 'system',
    label: 'System',
    icon: '⚙️',
    description: 'System',
    routes: [
      { id: 'integrations', path: '#system/integrations', label: 'Integrations', icon: 'Zap' },
      { id: 'templates', path: '#system/templates', label: 'Templates', icon: 'FileText' },
      { id: 'roles', path: '#system/roles', label: 'Role Management', icon: 'Shield' }
    ],
    access: (user) => isOperator(user) // Operators only
  }
};

/**
 * Get accessible navigation groups for a user
 */
export const getAccessibleNavGroups = (user) => {
  return Object.values(NAV_GROUPS).filter(group => group.access(user));
};

/**
 * Parse route hash to get group and view
 * e.g., "#oxygen/schedule" -> { group: 'oxygen', view: 'schedule' }
 */
export const parseRouteHash = (hash) => {
  const clean = hash.replace('#', '');
  const [group, view] = clean.split('/');
  
  // Handle legacy routes (no group prefix)
  if (!view) {
    // Map legacy routes to new structure
    const legacyMap = {
      schedule: { group: 'oxygen', view: 'schedule' },
      mybookings: { group: 'oxygen', view: 'bookings' },
      certifications: { group: 'oxygen', view: 'certifications' },
      resources: { group: 'fuel', view: 'resources' },
      'tool-config': { group: 'fuel', view: 'tool-config' },
      users: { group: 'heat', view: 'people' },
      issues: { group: 'heat', view: 'issues' },
      activity: { group: 'heat', view: 'activity' },
      integrations: { group: 'system', view: 'integrations' },
      'template-generator': { group: 'system', view: 'templates' },
      admin: { group: 'heat', view: 'people' } // Legacy admin -> people
    };
    return legacyMap[group] || { group: 'oxygen', view: 'schedule' };
  }
  
  return { group, view };
};

/**
 * Build route hash from group and view
 */
export const buildRouteHash = (group, view) => `#${group}/${view}`;

// =============================================================================
// Filter Utilities for Tenders
// =============================================================================

/**
 * Filter items by tool for scoped tenders
 * @param {Array} items - Items with a tool/toolId property
 * @param {Object} user - Current user
 * @param {string} toolKey - Property name for tool ID (default: 'tool')
 * @param {boolean} showAll - Whether to show all (for full view toggle)
 */
export const filterByToolGrants = (items, user, toolKey = 'tool', showAll = false) => {
  if (!items || !Array.isArray(items)) return [];
  if (showAll || hasFullToolAccess(user)) return items;
  
  const managedTools = getManagedTools(user);
  if (managedTools.length === 0) return [];
  
  return items.filter(item => {
    const itemTool = item[toolKey];
    return itemTool && managedTools.includes(itemTool);
  });
};

export default {
  normalizeRole,
  getRoleDisplayName,
  getRoleBadgeClasses,
  isOperator,
  isTender,
  isParticipant,
  canManageTool,
  getManagedTools,
  hasFullToolAccess,
  NAV_GROUPS,
  getAccessibleNavGroups,
  parseRouteHash,
  buildRouteHash,
  filterByToolGrants
};
