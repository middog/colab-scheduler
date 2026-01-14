/**
 * SDCoLab Scheduler - Soft Delete & Archival Utilities
 * 
 * Implements consistent "delete" semantics across all entities:
 * - Soft-delete: status=archived, hidden by default, reversible
 * - Hard delete: Only for specific cases with audit trail
 * - Undo window: 10-second grace period for reversing destructive actions
 * 
 * 🔥 Fire Triangle: OXYGEN layer - data lifecycle management
 * 
 * @version 4.2.0-rc69.5
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  UpdateCommand,
  GetCommand,
  DeleteCommand 
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';
import { activityService } from './database.js';

const client = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

// =============================================================================
// Archive Status Constants
// =============================================================================

export const ArchiveStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  PENDING_DELETE: 'pending_delete', // In undo window
  DELETED: 'deleted' // Permanently removed (audit only)
};

// Entities that support soft-delete
export const SOFT_DELETE_ENTITIES = [
  'booking',
  'resource',
  'tool', 
  'room',
  'user',
  'certification',
  'issue'
];

// Undo window duration in milliseconds (10 seconds)
export const UNDO_WINDOW_MS = 10000;

// =============================================================================
// Pending Deletion Store (In-Memory with TTL)
// For tracking items in the undo window
// =============================================================================

const pendingDeletions = new Map();

/**
 * Schedule an item for deletion after undo window expires
 * @param {string} entityType - Type of entity (booking, tool, etc.)
 * @param {string} entityId - Entity ID
 * @param {Object} previousState - State before archival (for undo)
 * @param {Function} onDelete - Callback to execute hard delete
 */
export const scheduleDeletion = (entityType, entityId, previousState, onDelete) => {
  const key = `${entityType}:${entityId}`;
  
  // Clear any existing timeout
  if (pendingDeletions.has(key)) {
    clearTimeout(pendingDeletions.get(key).timeoutId);
  }
  
  const timeoutId = setTimeout(async () => {
    try {
      console.log(`🗑️ Undo window expired for ${key} - executing deletion`);
      await onDelete();
      pendingDeletions.delete(key);
    } catch (error) {
      console.error(`Failed to delete ${key}:`, error);
    }
  }, UNDO_WINDOW_MS);
  
  pendingDeletions.set(key, {
    entityType,
    entityId,
    previousState,
    timeoutId,
    expiresAt: Date.now() + UNDO_WINDOW_MS
  });
  
  return {
    undoToken: key,
    expiresAt: new Date(Date.now() + UNDO_WINDOW_MS).toISOString(),
    undoWindowSeconds: UNDO_WINDOW_MS / 1000
  };
};

/**
 * Cancel a pending deletion (undo)
 * @param {string} undoToken - Token from scheduleDeletion
 * @returns {Object|null} - Previous state if found, null otherwise
 */
export const cancelDeletion = (undoToken) => {
  if (!pendingDeletions.has(undoToken)) {
    return null;
  }
  
  const pending = pendingDeletions.get(undoToken);
  clearTimeout(pending.timeoutId);
  pendingDeletions.delete(undoToken);
  
  return pending.previousState;
};

/**
 * Check if an item is pending deletion
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @returns {Object|null} - Pending info or null
 */
export const getPendingDeletion = (entityType, entityId) => {
  const key = `${entityType}:${entityId}`;
  const pending = pendingDeletions.get(key);
  
  if (!pending) return null;
  
  return {
    expiresAt: new Date(pending.expiresAt).toISOString(),
    remainingMs: Math.max(0, pending.expiresAt - Date.now())
  };
};

// =============================================================================
// Soft Delete Operations
// =============================================================================

/**
 * Archive an entity (soft delete)
 * @param {string} tableName - DynamoDB table name
 * @param {Object} key - Primary key object
 * @param {Object} actor - User performing the action
 * @param {Object} options - { reason, metadata, enableUndo }
 * @returns {Object} - { archived: true, undoToken?, expiresAt? }
 */
export const archiveEntity = async (tableName, key, actor, options = {}) => {
  const { reason = null, metadata = {}, enableUndo = true, entityType = 'entity' } = options;
  
  const now = new Date().toISOString();
  
  // Get current state for audit and potential undo
  const current = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: key
  }));
  
  if (!current.Item) {
    throw new Error('Entity not found');
  }
  
  const previousState = current.Item;
  
  // Check if already archived
  if (previousState.status === ArchiveStatus.ARCHIVED) {
    return { 
      archived: true, 
      alreadyArchived: true,
      archivedAt: previousState.archivedAt 
    };
  }
  
  // Update to archived status
  const updateParams = {
    TableName: tableName,
    Key: key,
    UpdateExpression: `
      SET #status = :archived,
          #archivedAt = :archivedAt,
          #archivedBy = :archivedBy,
          #archiveReason = :reason,
          #previousStatus = :previousStatus,
          #updatedAt = :updatedAt
    `,
    ExpressionAttributeNames: {
      '#status': 'status',
      '#archivedAt': 'archivedAt',
      '#archivedBy': 'archivedBy',
      '#archiveReason': 'archiveReason',
      '#previousStatus': 'previousStatus',
      '#updatedAt': 'updatedAt'
    },
    ExpressionAttributeValues: {
      ':archived': ArchiveStatus.ARCHIVED,
      ':archivedAt': now,
      ':archivedBy': actor.email,
      ':reason': reason,
      ':previousStatus': previousState.status || ArchiveStatus.ACTIVE,
      ':updatedAt': now
    },
    ReturnValues: 'ALL_NEW'
  };
  
  await docClient.send(new UpdateCommand(updateParams));
  
  // Log activity
  await activityService.log(`${entityType}.archived`, actor, {
    type: entityType,
    id: key.id || Object.values(key)[0],
    name: previousState.name || previousState.resourceName || previousState.displayName
  }, { reason, ...metadata }, previousState);
  
  // Set up undo window if enabled
  let undoInfo = null;
  if (enableUndo) {
    undoInfo = scheduleDeletion(
      entityType,
      key.id || Object.values(key)[0],
      previousState,
      async () => {
        // This runs after undo window expires
        // For now, archived items just stay archived
        // Could implement actual deletion here if needed
        console.log(`✓ Archive finalized for ${entityType}:${key.id}`);
      }
    );
  }
  
  return {
    archived: true,
    archivedAt: now,
    ...(undoInfo && {
      undoToken: undoInfo.undoToken,
      undoExpiresAt: undoInfo.expiresAt,
      undoWindowSeconds: undoInfo.undoWindowSeconds
    })
  };
};

/**
 * Restore an archived entity (undo archive)
 * @param {string} tableName - DynamoDB table name
 * @param {Object} key - Primary key object
 * @param {Object} actor - User performing the action
 * @param {string} undoToken - Optional undo token from archive response
 */
export const restoreEntity = async (tableName, key, actor, undoToken = null) => {
  const now = new Date().toISOString();
  
  // Check for pending deletion first
  if (undoToken) {
    const previousState = cancelDeletion(undoToken);
    if (previousState) {
      // Restore from pending deletion state
      await docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: `
          SET #status = :status,
              #updatedAt = :updatedAt
          REMOVE #archivedAt, #archivedBy, #archiveReason
        `,
        ExpressionAttributeNames: {
          '#status': 'status',
          '#archivedAt': 'archivedAt',
          '#archivedBy': 'archivedBy',
          '#archiveReason': 'archiveReason',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':status': previousState.status || ArchiveStatus.ACTIVE,
          ':updatedAt': now
        }
      }));
      
      await activityService.log('entity.restored_via_undo', actor, {
        type: 'entity',
        id: key.id
      });
      
      return { restored: true, method: 'undo' };
    }
  }
  
  // Get current state
  const current = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: key
  }));
  
  if (!current.Item) {
    throw new Error('Entity not found');
  }
  
  if (current.Item.status !== ArchiveStatus.ARCHIVED) {
    return { 
      restored: false, 
      reason: 'Entity is not archived',
      currentStatus: current.Item.status 
    };
  }
  
  // Restore to previous status
  const previousStatus = current.Item.previousStatus || ArchiveStatus.ACTIVE;
  
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: `
      SET #status = :status,
          #restoredAt = :restoredAt,
          #restoredBy = :restoredBy,
          #updatedAt = :updatedAt
      REMOVE #archivedAt, #archivedBy, #archiveReason
    `,
    ExpressionAttributeNames: {
      '#status': 'status',
      '#restoredAt': 'restoredAt',
      '#restoredBy': 'restoredBy',
      '#archivedAt': 'archivedAt',
      '#archivedBy': 'archivedBy',
      '#archiveReason': 'archiveReason',
      '#updatedAt': 'updatedAt'
    },
    ExpressionAttributeValues: {
      ':status': previousStatus,
      ':restoredAt': now,
      ':restoredBy': actor.email,
      ':updatedAt': now
    }
  }));
  
  await activityService.log('entity.restored', actor, {
    type: 'entity',
    id: key.id
  });
  
  return { restored: true, method: 'manual', previousStatus };
};

// =============================================================================
// Hard Delete (Use Sparingly)
// =============================================================================

/**
 * Permanently delete an entity (hard delete)
 * Use only when absolutely necessary (e.g., GDPR data erasure)
 * 
 * @param {string} tableName - DynamoDB table name
 * @param {Object} key - Primary key object
 * @param {Object} actor - User performing the action
 * @param {Object} options - { reason, skipAudit }
 */
export const hardDelete = async (tableName, key, actor, options = {}) => {
  const { reason = 'Permanent deletion requested', skipAudit = false, entityType = 'entity' } = options;
  
  // Get current state for audit
  const current = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: key
  }));
  
  if (!current.Item) {
    return { deleted: false, reason: 'Entity not found' };
  }
  
  // Actually delete
  await docClient.send(new DeleteCommand({
    TableName: tableName,
    Key: key
  }));
  
  // Log activity (unless skipped for privacy reasons)
  if (!skipAudit) {
    await activityService.log(`${entityType}.permanently_deleted`, actor, {
      type: entityType,
      id: key.id || Object.values(key)[0],
      name: current.Item.name || '[redacted]'
    }, { 
      reason,
      // Don't log full previous state for privacy
      hadPreviousStatus: current.Item.status 
    });
  }
  
  return { deleted: true, permanent: true };
};

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Default filter to exclude archived items
 */
export const excludeArchivedFilter = () => ({
  FilterExpression: '#status <> :archived OR attribute_not_exists(#status)',
  ExpressionAttributeNames: { '#status': 'status' },
  ExpressionAttributeValues: { ':archived': ArchiveStatus.ARCHIVED }
});

/**
 * Filter to include only archived items
 */
export const archivedOnlyFilter = () => ({
  FilterExpression: '#status = :archived',
  ExpressionAttributeNames: { '#status': 'status' },
  ExpressionAttributeValues: { ':archived': ArchiveStatus.ARCHIVED }
});

// =============================================================================
// Booking-Specific Operations
// =============================================================================

/**
 * Cancel a booking with undo support
 * This is the recommended way to "delete" bookings
 */
export const cancelBooking = async (bookingId, actor, options = {}) => {
  const { reason = 'Cancelled by user' } = options;
  const tableName = config.aws.tables.bookings;
  
  return archiveEntity(
    tableName,
    { id: bookingId },
    actor,
    {
      reason,
      enableUndo: true,
      entityType: 'booking',
      metadata: {
        cancelledAt: new Date().toISOString(),
        cancelledBy: actor.email
      }
    }
  );
};

/**
 * Undo a booking cancellation
 */
export const undoCancelBooking = async (bookingId, undoToken, actor) => {
  const tableName = config.aws.tables.bookings;
  
  return restoreEntity(tableName, { id: bookingId }, actor, undoToken);
};

// =============================================================================
// Exports
// =============================================================================

export default {
  ArchiveStatus,
  SOFT_DELETE_ENTITIES,
  UNDO_WINDOW_MS,
  
  // Core operations
  archiveEntity,
  restoreEntity,
  hardDelete,
  
  // Undo support
  scheduleDeletion,
  cancelDeletion,
  getPendingDeletion,
  
  // Query helpers
  excludeArchivedFilter,
  archivedOnlyFilter,
  
  // Entity-specific
  cancelBooking,
  undoCancelBooking
};
