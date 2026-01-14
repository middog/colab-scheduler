/**
 * SDCoLab Scheduler - Validation Schemas Index
 * 
 * Central export for all Zod schemas.
 * 
 * @version 4.3.0
 */

export * as auth from './auth.js';
export * as bookings from './bookings.js';
export * as resources from './resources.js';
export * as users from './users.js';
export * as notifications from './notifications.js';

// Re-export common schemas for convenience
export { 
  emailSchema, 
  passwordSchema, 
  nameSchema, 
  sessionIdSchema 
} from './auth.js';

export { 
  dateSchema, 
  timeSchema, 
  bookingIdSchema 
} from './bookings.js';

export { 
  resourceIdSchema, 
  categorySchema 
} from './resources.js';

export { 
  roleSchema, 
  userStatusSchema 
} from './users.js';
