const mongoose = require('mongoose');
const CylinderRemnantLedger = require('../models/CylinderRemnantLedger');
const Cylinder = require('../models/Cylinder');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const ConfigService = require('./configService');
const AuditService = require('./auditService');

/**
 * RemnantLedgerService
 * --------------------
 * The ONLY component allowed to write to CylinderRemnantLedger.
 *
 * Guarantees:
 *  - Append-only (never UPDATE or DELETE)
 *  - Balance integrity (newBalance = previousBalance + delta, never < 0)
 *  - Atomicity via MongoDB sessions
 *  - Idempotency helpers for retried operations
 *  - Comprehensive audit logging
 *
 * Business rules:
 *  - Every delta is signed (+ for credit, - for debit)
 *  - `delta` must be a non-zero number
 *  - `newBalance` cannot be negative
 *  - All balance-changing operations must run inside a transaction
 */
class RemnantLedgerService {
  // =====================================================
  // READ OPERATIONS
  // =====================================================

  /**
   * Get the current ledger balance for a user.
   * Uses the latest `newBalance` entry (fastest).
   * Falls back to summing deltas if ledger is empty.
   */
  async getUserBalance(userId, session = null) {
    const query = CylinderRemnantLedger.findOne({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .select('newBalance');

    if (session) query.session(session);

    const latest = await query.lean();

    if (latest) return latest.newBalance;

    // Fallback: sum deltas (in case ledger has entries but no newBalance snapshot — should not happen)
    const aggQuery = CylinderRemnantLedger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$delta' } } },
    ]);
    if (session) aggQuery.session(session);

    const result = await aggQuery;
    return result.length > 0 ? Math.max(result[0].total, 0) : 0;
  }

  /**
   * Get the current balance, scoped to a cylinder.
   * Useful if a customer has multiple cylinders.
   */
  async getCylinderBalance(cylinderId, session = null) {
    const query = CylinderRemnantLedger.findOne({ cylinderId })
      .sort({ createdAt: -1, _id: -1 })
      .select('newBalance');

    if (session) query.session(session);

    const latest = await query.lean();
    return latest ? latest.newBalance : 0;
  }

  /**
   * Get paginated ledger entries for a user.
   */
  async getUserLedger(userId, { page = 1, limit = 20, event = null } = {}) {
    const filter = { userId };
    if (event) filter.event = event;

    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      CylinderRemnantLedger.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('deliveryId', 'deliveryDate status')
        .populate('performedBy', 'firstName lastName role')
        .lean(),
      CylinderRemnantLedger.countDocuments(filter),
    ]);

    return {
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get ledger entries scoped to a specific cylinder.
   */
  async getCylinderLedger(cylinderId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const filter = { cylinderId };

    const [entries, total] = await Promise.all([
      CylinderRemnantLedger.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CylinderRemnantLedger.countDocuments(filter),
    ]);

    return {
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Check if a user is eligible for remnant-based delivery.
   * Uses the configurable MINIMUM_REMNANT_DELIVERY_KG.
   */
  async checkEligibility(userId, session = null) {
    const minimumKg = await ConfigService.getConfig('MINIMUM_REMNANT_DELIVERY_KG', 6);
    const balance = await this.getUserBalance(userId, session);

    return {
      eligible: balance >= minimumKg,
      balance,
      minimumRequired: minimumKg,
      shortfall: balance < minimumKg ? minimumKg - balance : 0,
    };
  }

  // =====================================================
  // WRITE OPERATIONS — always transactional
  // =====================================================

  /**
   * Add a measurement to the ledger.
   * Called by CylinderWeightService after every weighing.
   *
   * @param {Object} params
   * @param {ObjectId} params.userId
   * @param {ObjectId} params.cylinderId
   * @param {String}   params.cylinderTag
   * @param {Number}   params.delta          - signed (positive for measurement_added)
   * @param {Number}   params.measuredWeight
   * @param {Number}   params.emptyWeight
   * @param {Number}   params.physicalRemnant
   * @param {ObjectId} params.weightRecordId
   * @param {ObjectId} params.deliveryId
   * @param {ObjectId} params.performedBy
   * @param {String}   params.performedByRole
   * @param {String}   params.reason
   * @param {Object}   params.metadata
   * @param {Object}   params.req              - Express request (for audit)
   * @param {Session}  params.session          - MongoDB session (required if called within outer tx)
   */
  async addMeasurement({
    userId,
    cylinderId,
    cylinderTag,
    delta,
    measuredWeight,
    emptyWeight,
    physicalRemnant,
    weightRecordId,
    deliveryId = null,
    performedBy,
    performedByRole,
    reason = null,
    metadata = {},
    req = null,
    session: externalSession = null,
  }) {
    return this._performMutation({
      event: 'measurement_added',
      userId,
      cylinderId,
      cylinderTag,
      delta,
      measuredWeight,
      emptyWeight,
      physicalRemnant,
      weightRecordId,
      deliveryId,
      performedBy,
      performedByRole,
      reason,
      metadata,
      req,
      externalSession,
    });
  }

  /**
   * Consume remnant (customer requested delivery using accumulated balance).
   * delta is auto-negated.
   */
  async consumeRemnant({
    userId,
    amount,
    deliveryId,
    subscriptionId = null,
    performedBy,
    performedByRole,
    reason = 'Customer requested remnant delivery',
    metadata = {},
    req = null,
    session: externalSession = null,
  }) {
    if (amount <= 0) {
      throw new ErrorResponse('Consume amount must be positive', 400);
    }

    return this._performMutation({
      event: 'remnant_consumed',
      userId,
      delta: -Math.abs(amount),
      deliveryId,
      subscriptionId,
      performedBy,
      performedByRole,
      reason,
      metadata,
      req,
      externalSession,
      checkSufficientBalance: true,
    });
  }

  /**
   * Admin credit.
   */
  async creditRemnant({
    userId,
    amount,
    reason,
    performedBy,
    performedByRole,
    cylinderId = null,
    cylinderTag = null,
    metadata = {},
    req = null,
    session: externalSession = null,
  }) {
    if (amount <= 0) {
      throw new ErrorResponse('Credit amount must be positive', 400);
    }
    if (!reason || reason.trim().length === 0) {
      throw new ErrorResponse('Reason is required for manual credit', 400);
    }

    return this._performMutation({
      event: 'remnant_credited',
      userId,
      cylinderId,
      cylinderTag,
      delta: Math.abs(amount),
      performedBy,
      performedByRole,
      reason,
      metadata,
      req,
      externalSession,
    });
  }

  /**
   * Admin debit.
   */
  async debitRemnant({
    userId,
    amount,
    reason,
    performedBy,
    performedByRole,
    cylinderId = null,
    cylinderTag = null,
    metadata = {},
    req = null,
    session: externalSession = null,
  }) {
    if (amount <= 0) {
      throw new ErrorResponse('Debit amount must be positive', 400);
    }
    if (!reason || reason.trim().length === 0) {
      throw new ErrorResponse('Reason is required for manual debit', 400);
    }

    return this._performMutation({
      event: 'remnant_debited',
      userId,
      cylinderId,
      cylinderTag,
      delta: -Math.abs(amount),
      performedBy,
      performedByRole,
      reason,
      metadata,
      req,
      externalSession,
      checkSufficientBalance: true,
    });
  }

  /**
   * Dispute-driven adjustment. Signed delta (positive or negative).
   */
  async createAdjustment({
    userId,
    delta,
    reason,
    performedBy,
    performedByRole,
    cylinderId = null,
    cylinderTag = null,
    disputeId = null,
    adjustmentId = null,
    metadata = {},
    req = null,
    session: externalSession = null,
  }) {
    if (!delta || delta === 0) {
      throw new ErrorResponse('Adjustment delta must be non-zero', 400);
    }
    if (!reason || reason.trim().length === 0) {
      throw new ErrorResponse('Reason is required for adjustment', 400);
    }

    return this._performMutation({
      event: 'adjustment',
      userId,
      cylinderId,
      cylinderTag,
      delta,
      disputeId,
      adjustmentId,
      performedBy,
      performedByRole,
      reason,
      metadata,
      req,
      externalSession,
      checkSufficientBalance: delta < 0,
    });
  }

  // =====================================================
  // INTERNAL — Single mutation pipeline
  // =====================================================

  async _performMutation({
    event,
    userId,
    cylinderId = null,
    cylinderTag = null,
    delta,
    measuredWeight = null,
    emptyWeight = null,
    physicalRemnant = null,
    weightRecordId = null,
    deliveryId = null,
    subscriptionId = null,
    disputeId = null,
    adjustmentId = null,
    performedBy,
    performedByRole,
    reason = null,
    metadata = {},
    req = null,
    externalSession = null,
    checkSufficientBalance = false,
  }) {
    // Validate delta
    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) {
      throw new ErrorResponse('delta must be a non-zero number', 400);
    }

    const ownsSession = !externalSession;
    const session = externalSession || (await mongoose.startSession());

    if (ownsSession) session.startTransaction();

    try {
      // Fetch current balance (inside session for consistent read)
      const previousBalance = await this.getUserBalance(userId, session);
      const newBalance = previousBalance + delta;

      if (newBalance < 0) {
        throw new ErrorResponse(
          `Insufficient remnant balance. Available: ${previousBalance}, Required: ${Math.abs(delta)}`,
          400
        );
      }

      if (checkSufficientBalance && newBalance < 0) {
        throw new ErrorResponse('Insufficient remnant balance', 400);
      }

      // Create immutable ledger entry
      const [entry] = await CylinderRemnantLedger.create(
        [
          {
            userId,
            cylinderId,
            cylinderTag,
            event,
            previousBalance,
            delta,
            newBalance,
            measuredWeight,
            emptyWeight,
            physicalRemnant,
            deliveryId,
            subscriptionId,
            disputeId,
            adjustmentId,
            weightRecordId,
            performedBy,
            performedByRole,
            reason,
            metadata,
            createdAt: new Date(),
          },
        ],
        { session }
      );

      // Audit
      await AuditService.log({
        action: this._auditActionFor(event),
        actorId: performedBy,
        actorRole: performedByRole,
        entityType: 'CylinderRemnantLedger',
        entityId: entry._id,
        previousValue: { balance: previousBalance },
        newValue: { balance: newBalance, delta },
        metadata: {
          userId,
          cylinderId,
          deliveryId,
          event,
          ...metadata,
        },
        req,
      });

      if (ownsSession) {
        await session.commitTransaction();
      }

      return {
        success: true,
        entry: entry.toObject(),
        previousBalance,
        newBalance,
        delta,
      };
    } catch (error) {
      if (ownsSession) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (ownsSession) session.endSession();
    }
  }

  _auditActionFor(event) {
    const map = {
      measurement_added: 'REMNANT_ADDED',
      remnant_consumed: 'REMNANT_CONSUMED',
      remnant_credited: 'REMNANT_CREDITED',
      remnant_debited: 'REMNANT_DEBITED',
      remnant_expired: 'REMNANT_EXPIRED',
      adjustment: 'ADJUSTMENT_CREATED',
    };
    return map[event] || 'REMNANT_ADDED';
  }

  // =====================================================
  // MAINTENANCE
  // =====================================================

  /**
   * Verify integrity: recompute balance from deltas and compare with latest newBalance.
   * Returns boolean + details.
   */
  async verifyUserIntegrity(userId) {
    const entries = await CylinderRemnantLedger.find({ userId })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    if (entries.length === 0) {
      return { ok: true, balance: 0, entries: 0 };
    }

    let running = 0;
    let ok = true;
    let failedAt = null;

    for (const e of entries) {
      running += e.delta;

      if (running < 0) {
        ok = false;
        failedAt = { entryId: e._id, reason: 'negative_running_balance' };
        break;
      }

      if (Math.abs(e.previousBalance - (running - e.delta)) > 0.001) {
        ok = false;
        failedAt = { entryId: e._id, reason: 'previous_balance_mismatch' };
        break;
      }

      if (Math.abs(e.newBalance - running) > 0.001) {
        ok = false;
        failedAt = { entryId: e._id, reason: 'new_balance_mismatch' };
        break;
      }
    }

    return {
      ok,
      balance: running,
      entries: entries.length,
      failedAt,
    };
  }
}

module.exports = new RemnantLedgerService();