/**
 * SDCoLab Scheduler - Data Models
 * 
 * Extensible schemas designed for future expansion:
 * - Certification/learning pipelines
 * - Room/facility management
 * - Multi-org support (SDCAP + SDCoLab)
 * 
 * 🔥 Fire Triangle: FUEL layer - foundational data structures
 */

// =============================================================================
// USER MODEL
// =============================================================================

/**
 * User Schema
 * 
 * Designed for extensibility:
 * - Multiple auth providers
 * - Certification tracking
 * - Activity auditing
 * - Role-based + resource-based permissions
 */
export const UserSchema = {
  // Primary Key
  email: 'string', // PK
  
  // Identity
  id: 'string', // UUID for internal references
  firstName: 'string',
  lastName: 'string',
  displayName: 'string', // Playa name or preferred name
  avatarUrl: 'string|null',
  phone: 'string|null',
  
  // Authentication
  authProviders: [{
    provider: 'email|google|microsoft|github|oidc',
    providerId: 'string', // External ID from provider
    linkedAt: 'ISO8601',
    lastUsed: 'ISO8601'
  }],
  passwordHash: 'string|null', // Only for email auth
  passwordResetToken: 'string|null',
  passwordResetExpires: 'ISO8601|null',
  
  // Authorization
  status: 'pending|active|suspended|deactivated',
  role: 'guest|member|certified|steward|admin|superadmin',
  
  // Resource Permissions (extensible)
  permissions: {
    tools: ['laser', '3dprinter'],  // Tools user can book
    rooms: ['laser-lab', 'woodshop'],  // Rooms user can access
    capabilities: ['can_book', 'can_approve', 'can_admin']
  },
  
  // Certifications (for future learning system)
  certifications: [{
    certificationId: 'string',
    name: 'string',
    earnedAt: 'ISO8601',
    expiresAt: 'ISO8601|null',
    grantedBy: 'string', // admin email or 'system'
    method: 'manual|attended|unattended|imported'
  }],
  
  // Membership
  memberSince: 'ISO8601',
  membershipType: 'string|null', // Future: different tiers
  organizationAffiliations: ['SDCAP', 'SDCoLab'],
  
  // Access Codes (sensitive)
  doorAccessCode: 'string|null',
  alarmCode: 'string|null',
  
  // Preferences
  preferences: {
    notifications: {
      email: true,
      slack: false,
      sms: false
    },
    theme: 'light|dark|system',
    timezone: 'America/Los_Angeles'
  },
  
  // Audit Trail
  createdAt: 'ISO8601',
  createdBy: 'string', // 'self-registration' or admin email
  updatedAt: 'ISO8601',
  lastEditedBy: 'string',
  approvedAt: 'ISO8601|null',
  approvedBy: 'string|null',
  deactivatedAt: 'ISO8601|null',
  deactivatedBy: 'string|null',
  deactivationReason: 'string|null',
  lastLoginAt: 'ISO8601|null',
  lastActivityAt: 'ISO8601|null',
  
  // Notes (admin only)
  notes: 'string|null',
  tags: ['string'] // For filtering/grouping
};

// =============================================================================
// ROLE DEFINITIONS
// =============================================================================

export const Roles = {
  guest: {
    name: 'Guest',
    description: 'Unverified account, no access',
    permissions: [],
    canSelfRegister: true
  },
  member: {
    name: 'Member',
    description: 'Basic member, can view but not book',
    permissions: ['can_view_schedule'],
    canSelfRegister: true
  },
  certified: {
    name: 'Certified Member',
    description: 'Can book tools they are certified for',
    permissions: ['can_view_schedule', 'can_book'],
    canSelfRegister: false // Requires certification
  },
  steward: {
    name: 'Steward',
    description: 'Can approve bookings for their area',
    permissions: ['can_view_schedule', 'can_book', 'can_approve_area'],
    canSelfRegister: false
  },
  admin: {
    name: 'Administrator',
    description: 'Full admin access',
    permissions: ['can_view_schedule', 'can_book', 'can_approve', 'can_admin'],
    canSelfRegister: false
  },
  superadmin: {
    name: 'Super Administrator',
    description: 'System-level access, can manage admins',
    permissions: ['*'],
    canSelfRegister: false
  }
};

// =============================================================================
// CERTIFICATION MODEL (Future-ready)
// =============================================================================

export const CertificationSchema = {
  id: 'string', // PK
  name: 'string',
  description: 'string',
  category: 'tool|room|safety|general',
  
  // What this unlocks
  grantsPermissions: {
    tools: ['laser'],
    rooms: ['laser-lab'],
    capabilities: []
  },
  
  // Requirements
  prerequisites: ['cert-id-1', 'cert-id-2'],
  
  // How to earn
  earnMethods: {
    attended: {
      enabled: true,
      instructorRequired: true,
      duration: '2 hours'
    },
    unattended: {
      enabled: false,
      quizId: 'quiz-123',
      passingScore: 80
    },
    manual: {
      enabled: true // Admin can grant
    }
  },
  
  // Validity
  expiresAfterDays: null, // null = never expires
  renewalRequired: false,
  
  // Metadata
  createdAt: 'ISO8601',
  updatedAt: 'ISO8601'
};

// =============================================================================
// ACTIVITY LOG MODEL
// =============================================================================

export const ActivityLogSchema = {
  id: 'string', // PK
  timestamp: 'ISO8601',
  
  // Who
  actorId: 'string', // User email
  actorName: 'string',
  actorRole: 'string',
  actorIp: 'string|null',
  
  // What
  action: 'string', // e.g., 'user.created', 'booking.approved'
  category: 'auth|booking|user|admin|system',
  
  // Target
  targetType: 'user|booking|tool|certification|system',
  targetId: 'string|null',
  targetName: 'string|null',
  
  // Details
  details: {}, // Flexible JSON
  previousState: {}, // For auditing changes
  newState: {},
  
  // Oversight (who viewed this log)
  viewedBy: [{
    email: 'string',
    viewedAt: 'ISO8601'
  }]
};

// =============================================================================
// BOOKING MODEL (Enhanced)
// =============================================================================

export const BookingSchema = {
  id: 'string', // PK
  
  // What
  resourceType: 'tool|room|equipment',
  resourceId: 'string',
  resourceName: 'string',
  
  // Who
  userId: 'string',
  userEmail: 'string',
  userName: 'string',
  
  // When
  date: 'YYYY-MM-DD',
  startTime: 'HH:MM',
  endTime: 'HH:MM',
  timezone: 'America/Los_Angeles',
  
  // Why
  purpose: 'string',
  projectName: 'string|null',
  
  // Status
  status: 'pending|approved|rejected|cancelled|completed|no-show',
  
  // Approval
  approvedBy: 'string|null',
  approvedAt: 'ISO8601|null',
  rejectedBy: 'string|null',
  rejectedAt: 'ISO8601|null',
  rejectionReason: 'string|null',
  
  // Integrations
  calendarEventId: 'string|null',
  calendarEventUrl: 'string|null',
  githubIssueNumber: 'number|null',
  githubIssueUrl: 'string|null',
  
  // Check-in (future)
  checkedInAt: 'ISO8601|null',
  checkedOutAt: 'ISO8601|null',
  
  // Audit
  createdAt: 'ISO8601',
  updatedAt: 'ISO8601',
  
  // Composite keys for queries
  dateResourceKey: 'YYYY-MM-DD#resourceId',
  userDateKey: 'email#YYYY-MM-DD'
};

// =============================================================================
// INVITE MODEL
// =============================================================================

export const InviteSchema = {
  id: 'string', // PK - also the invite token
  email: 'string',
  
  // Pre-populated values
  role: 'string',
  permissions: {},
  
  // Metadata
  createdBy: 'string',
  createdAt: 'ISO8601',
  expiresAt: 'ISO8601',
  
  // Status
  status: 'pending|accepted|expired|revoked',
  acceptedAt: 'ISO8601|null'
};

export default {
  UserSchema,
  Roles,
  CertificationSchema,
  ActivityLogSchema,
  BookingSchema,
  InviteSchema
};
