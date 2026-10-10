const AuditLog = require('../models/AuditLog');

/**
 * AuditService — centralized audit logging.
 *
 * Usage:
 *   await AuditService.log({
 *     action: 'PLANT_REFILL_CONFIRMED',
 *     actorId: req.user._id,
 *     actorRole: req.user.role,
 *     entityType: 'PlantRefillRequest',
 *     entityId: request._id,
 *     previousValue: { status: 'quantity_recorded' },
 *     newValue: { status: 'confirmed' },
 *     metadata: { plantId, deliveryId, cylinderId, requestNumber },
 *     req,
 *   });
 */
class AuditService {
  async log({
    action,
    actorId,
    actorRole,
    entityType,
    entityId,
    previousValue = null,
    newValue = null,
    details = {},
    metadata = {},
    gpsCoordinates = null,
    req = null,
  }) {
    try {
      const ip = req?.ip || req?.headers?.['x-forwarded-for'] || null;
      const userAgent = req?.get?.('user-agent') || req?.headers?.['user-agent'] || null;

      await AuditLog.create({
        user: actorId,
        actorRole,
        action,
        entityType,
        entityId,
        previousValue,
        newValue,
        details,
        metadata,
        ip,
        userAgent,
        gpsCoordinates,
        timestamp: new Date(),
      });
    } catch (error) {
      // Audit failures must not break business operations.
      // Log to stderr for observability.
      console.error('AuditService.log failed:', {
        action,
        entityType,
        entityId: entityId?.toString(),
        error: error.message,
      });
    }
  }

  /**
   * Batch: write multiple audit records in one call.
   */
  async logBatch(entries) {
    if (!entries || entries.length === 0) return;
    try {
      const docs = entries.map((e) => ({
        user: e.actorId,
        actorRole: e.actorRole,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        previousValue: e.previousValue ?? null,
        newValue: e.newValue ?? null,
        details: e.details ?? {},
        metadata: e.metadata ?? {},
        ip: e.req?.ip || null,
        userAgent: e.req?.get?.('user-agent') || null,
        gpsCoordinates: e.gpsCoordinates ?? null,
        timestamp: new Date(),
      }));
      await AuditLog.insertMany(docs, { ordered: false });
    } catch (error) {
      console.error('AuditService.logBatch failed:', error.message);
    }
  }

  /**
   * Query audit trail for an entity.
   */
  async getTrail(entityType, entityId, { limit = 100, skip = 0 } = {}) {
    return AuditLog.find({ entityType, entityId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'firstName lastName email role')
      .lean();
  }

  /**
   * Query by actor.
   */
  async getByActor(actorId, { limit = 100, skip = 0 } = {}) {
    return AuditLog.find({ user: actorId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Query by action type within a date range.
   */
  async getByAction(action, { from, to, limit = 200 } = {}) {
    const filter = { action };
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }
    return AuditLog.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
  }
}

module.exports = new AuditService();