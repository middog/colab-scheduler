/**
 * SDCoLab Scheduler - Configuration
 * 
 * Central configuration with feature flags.
 * All integrations are optional - the Jolly Rancher Vision.
 * 
 * 🔥 Fire Triangle: OXYGEN layer - structure and governance
 * 
 * SECURITY: Critical secrets MUST be set in production.
 * The application will fail to start if they are missing.
 */

const bool = (key, defaultVal = false) => {
  const val = process.env[key];
  if (val === undefined) return defaultVal;
  return val === 'true' || val === '1' || val === 'yes';
};

// =============================================================================
// Security: Validate required secrets in production
// =============================================================================
const isProduction = process.env.NODE_ENV === 'production';

const validateSecrets = () => {
  const errors = [];
  
  if (!process.env.JWT_SECRET) {
    if (isProduction) {
      errors.push('JWT_SECRET is required in production');
    } else {
      console.warn('⚠️  WARNING: JWT_SECRET not set - using insecure default (dev only)');
    }
  }
  
  if (!process.env.SCHEDULER_API_KEY) {
    if (isProduction) {
      errors.push('SCHEDULER_API_KEY is required in production');
    } else {
      console.warn('⚠️  WARNING: SCHEDULER_API_KEY not set - using insecure default (dev only)');
    }
  }
  
  if (errors.length > 0) {
    console.error('❌ FATAL: Missing required secrets in production:');
    errors.forEach(e => console.error(`   - ${e}`));
    console.error('');
    console.error('Set these environment variables before starting the application.');
    process.exit(1);
  }
};

// Validate on module load
validateSecrets();

export const config = {
  // ==========================================================================
  // Core Settings
  // ==========================================================================
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // ==========================================================================
  // JWT Configuration
  // SECURITY: In production, JWT_SECRET must be set or app won't start
  // ==========================================================================
  jwt: {
    secret: process.env.JWT_SECRET || (isProduction ? undefined : 'sdcolab-dev-secret-DO-NOT-USE-IN-PROD'),
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  
  // ==========================================================================
  // Scheduler Configuration  
  // SECURITY: In production, SCHEDULER_API_KEY must be set or app won't start
  // ==========================================================================
  scheduler: {
    apiKey: process.env.SCHEDULER_API_KEY || (isProduction ? undefined : 'dev-scheduler-key-DO-NOT-USE-IN-PROD')
  },
  
  // ==========================================================================
  // CORS
  // SECURITY: In production, set explicit origins (not *)
  // ==========================================================================
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',') || (isProduction ? [] : ['*'])
  },
  
  // ==========================================================================
  // AWS / DynamoDB
  // ==========================================================================
  aws: {
    region: process.env.AWS_REGION || 'us-west-2',
    tables: {
      users: process.env.USERS_TABLE || 'colab-scheduler-users',
      bookings: process.env.BOOKINGS_TABLE || 'colab-scheduler-bookings',
      activity: process.env.ACTIVITY_TABLE || 'colab-scheduler-activity',
      invites: process.env.INVITES_TABLE || 'colab-scheduler-invites',
      certifications: process.env.CERTS_TABLE || 'colab-scheduler-certifications',
      sessions: process.env.SESSIONS_TABLE || 'colab-scheduler-sessions'
    },
    ses: {
      fromEmail: process.env.SES_FROM_EMAIL || 'noreply@sdcolab.org',
      replyToEmail: process.env.SES_REPLY_TO || 'info@sdcolab.org'
    }
  },
  
  // ==========================================================================
  // Feature Flags
  // ==========================================================================
  features: {
    // Auth Providers
    authEmail: bool('ENABLE_AUTH_EMAIL', true),
    authGoogle: bool('ENABLE_AUTH_GOOGLE', false),
    authMicrosoft: bool('ENABLE_AUTH_MICROSOFT', false),
    authGithub: bool('ENABLE_AUTH_GITHUB', false),
    authOidc: bool('ENABLE_AUTH_OIDC', false),
    
    // Integrations
    googleCalendar: bool('ENABLE_GCAL', false),
    github: bool('ENABLE_GITHUB', false),
    slack: bool('ENABLE_SLACK', false),
    email: bool('ENABLE_EMAIL', false),
    
    // Features
    selfRegistration: bool('ENABLE_SELF_REGISTRATION', true),
    inviteSystem: bool('ENABLE_INVITES', true),
    certifications: bool('ENABLE_CERTIFICATIONS', false),
    activityLog: bool('ENABLE_ACTIVITY_LOG', true),
    darkMode: bool('ENABLE_DARK_MODE', true)
  },
  
  // ==========================================================================
  // OAuth Providers
  // ==========================================================================
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      scopes: ['email', 'profile']
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
      callbackUrl: process.env.MICROSOFT_CALLBACK_URL || '/api/auth/microsoft/callback',
      scopes: ['user.read', 'email']
    },
    github: {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      callbackUrl: process.env.GITHUB_CALLBACK_URL || '/api/auth/github/callback',
      scopes: ['user:email']
    },
    oidc: {
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      callbackUrl: process.env.OIDC_CALLBACK_URL || '/api/auth/oidc/callback',
      scopes: ['openid', 'email', 'profile']
    }
  },
  
  // ==========================================================================
  // Google Calendar (when enabled)
  // ==========================================================================
  gcal: {
    authMethod: process.env.GCAL_AUTH_METHOD || 'service_account_key',
    projectNumber: process.env.GCAL_PROJECT_NUMBER,
    poolId: process.env.GCAL_POOL_ID || 'sdcolab-aws-pool',
    providerId: process.env.GCAL_PROVIDER_ID || 'aws-lambda',
    serviceAccountEmail: process.env.GCAL_SERVICE_ACCOUNT_EMAIL,
    projectId: process.env.GOOGLE_PROJECT_ID,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    primaryCalendarId: process.env.GCAL_PRIMARY_CALENDAR_ID || 'primary',
    resourceCalendars: {
      'laser': process.env.GCAL_LASER_LAB_ID,
      '3dprinter': process.env.GCAL_3D_PRINTING_ID,
      'cnc': process.env.GCAL_CNC_ID,
      'solder': process.env.GCAL_ELECTRONICS_ID,
      'sewing-standard': process.env.GCAL_SEWING_ID,
      'sewing-industrial': process.env.GCAL_SEWING_ID,
      'woodshop': process.env.GCAL_WOODSHOP_ID
    }
  },
  
  // ==========================================================================
  // GitHub Integration (when enabled)
  // ==========================================================================
  github: {
    token: process.env.GITHUB_TOKEN,
    org: process.env.GITHUB_ORG || 'middog',
    repo: process.env.GITHUB_REPO || 'sdcap-governance',
    defaultLabels: ['fire:fuel', 'booking'],
    // New in 3.9: Discussions and Projects support
    enableDiscussions: bool('ENABLE_GITHUB_DISCUSSIONS', false),
    projectId: process.env.GITHUB_PROJECT_ID || null,  // Projects V2 node ID
    // Category mapping for discussions (optional overrides)
    discussionCategories: {
      policy: process.env.GITHUB_CATEGORY_POLICY || 'general',
      feedback: process.env.GITHUB_CATEGORY_FEEDBACK || 'ideas',
      vision: process.env.GITHUB_CATEGORY_VISION || 'ideas'
    }
  },
  
  // ==========================================================================
  // Slack Integration (when enabled)
  // ==========================================================================
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: process.env.SLACK_CHANNEL || '#colab-bookings'
  },
  
  // ==========================================================================
  // Email (SES) Integration (when enabled)
  // ==========================================================================
  email: {
    provider: process.env.EMAIL_PROVIDER || 'ses', // ses, smtp
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  },
  
  // ==========================================================================
  // Tools Configuration
  // ==========================================================================
  tools: [
    { id: 'laser', name: 'Laser Cutter', maxConcurrent: 1, room: 'laser-lab', category: 'fabrication', requiresCert: true },
    { id: '3dprinter', name: '3D Printer', maxConcurrent: 4, room: '3d-printing', category: 'fabrication', requiresCert: false },
    { id: 'cnc', name: 'CNC Router', maxConcurrent: 1, room: 'cnc-area', category: 'fabrication', requiresCert: true },
    { id: 'solder', name: 'Soldering Station', maxConcurrent: 3, room: 'electronics-lab', category: 'electronics', requiresCert: false },
    { id: 'sewing-standard', name: 'Sewing Machines', maxConcurrent: 5, room: 'sewing-room', category: 'textiles', requiresCert: false },
    { id: 'sewing-industrial', name: 'Industrial Sewing', maxConcurrent: 3, room: 'sewing-room', category: 'textiles', requiresCert: true },
    { id: 'woodshop', name: 'Woodshop', maxConcurrent: 2, room: 'woodshop', category: 'woodworking', requiresCert: true }
  ],
  
  // ==========================================================================
  // Rooms Configuration
  // ==========================================================================
  rooms: [
    { id: 'laser-lab', name: 'Laser Lab', capacity: 4 },
    { id: '3d-printing', name: '3D Printing Area', capacity: 8 },
    { id: 'cnc-area', name: 'CNC Area', capacity: 3 },
    { id: 'electronics-lab', name: 'Electronics Lab', capacity: 6 },
    { id: 'sewing-room', name: 'Sewing Room', capacity: 10 },
    { id: 'woodshop', name: 'Woodshop', capacity: 6 },
    { id: 'classroom', name: 'Classroom', capacity: 20 }
  ],
  
  // ==========================================================================
  // Default Permissions for New Users
  // ==========================================================================
  defaults: {
    newUserRole: 'member',
    newUserStatus: 'pending', // pending requires admin approval
    newUserPermissions: {
      tools: [], // No tools until certified/approved
      rooms: [],
      capabilities: ['can_view_schedule']
    }
  }
};

// Helper functions
export const getToolById = (id) => config.tools.find(t => t.id === id);
export const getRoomById = (id) => config.rooms.find(r => r.id === id);
export const isFeatureEnabled = (feature) => config.features[feature] === true;

// Get enabled auth providers
export const getEnabledAuthProviders = () => {
  const providers = [];
  if (config.features.authEmail) providers.push('email');
  if (config.features.authGoogle) providers.push('google');
  if (config.features.authMicrosoft) providers.push('microsoft');
  if (config.features.authGithub) providers.push('github');
  if (config.features.authOidc) providers.push('oidc');
  return providers;
};

// Log config on startup
export const logConfig = () => {
  console.log('🔥 SDCoLab Scheduler Configuration');
  console.log('══════════════════════════════════');
  console.log(`Environment: ${config.env}`);
  console.log(`Base URL: ${config.baseUrl}`);
  console.log('');
  console.log('Auth Providers:');
  console.log(`  ${config.features.authEmail ? '✅' : '⬜'} Email/Password`);
  console.log(`  ${config.features.authGoogle ? '✅' : '⬜'} Google`);
  console.log(`  ${config.features.authMicrosoft ? '✅' : '⬜'} Microsoft`);
  console.log(`  ${config.features.authGithub ? '✅' : '⬜'} GitHub`);
  console.log(`  ${config.features.authOidc ? '✅' : '⬜'} OIDC`);
  console.log('');
  console.log('Integrations:');
  console.log(`  ${config.features.googleCalendar ? '✅' : '⬜'} Google Calendar`);
  console.log(`  ${config.features.github ? '✅' : '⬜'} GitHub Issues`);
  console.log(`  ${config.features.slack ? '✅' : '⬜'} Slack`);
  console.log(`  ${config.features.email ? '✅' : '⬜'} Email (SES)`);
  console.log('');
  console.log('Features:');
  console.log(`  ${config.features.selfRegistration ? '✅' : '⬜'} Self Registration`);
  console.log(`  ${config.features.activityLog ? '✅' : '⬜'} Activity Log`);
  console.log(`  ${config.features.certifications ? '✅' : '⬜'} Certifications`);
  console.log('');
};

export default config;
