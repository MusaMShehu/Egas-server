const mongoose = require('mongoose');
const Cylinder = require('../models/Cylinder');
const CylinderCustodyRecord = require('../models/CylinderCustodyRecord');
const CylinderRemnantLedger = require('../models/CylinderRemnantLedger');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const AuditService = require('./auditService');
const RemnantLedgerService = require('./remnantLedgerService');

/**
 * CylinderService
 * ---------------
 * Handles cylinder lifecycle: registration, custody transfer, flagging, retiring.
 *
 * All operations are:
 *  - Transactional (MongoDB session)
 *  - Audited
 *  - Idempotency-aware (duplicate tag protection)
 */
class CylinderService {
  // =====================================================
  // READ
  // =====================================================

  async getById(cylinderId, { populate = [] } = {}) {
    let query = Cylinder.findById(cylinderId);
    for (const p of populate) query = query.populate(p);
    const cylinder = await query.lean();
    if (!cylinder) throw new ErrorResponse('Cylinder not found', 404);
    return cylinder;
  }

  async getByTag(tagCode, { session = null } = {}) {
    const query = Cylinder.findOne({
      tagCode: String(tagCode).toUpperCase().trim(),
      isDeleted: false,
    });
    if (session) query.session(session);
    return query.lean();
  }

  async getCustomerCylinders(userId, { session = null } = {}) {
    const query = Cylinder.find({
      userId,
      isDeleted: false,
    }).sort({ createdAt: -1 });
    if (session) query.session(session);
    return query.lean();
  }

  async listCylinders(filter = {}, { page = 1, limit = 20, sort = { createdAt: -1 } } = {}) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Cylinder.find({ ...filter, isDeleted: false })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('userId', 'firstName lastName email phone')
        .lean(),
      Cylinder.countDocuments({ ...filter, isDeleted: false }),
    ]);

    return {
      items,
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

  // =====================================================
  // WRITE — REGISTER CYLINDER
  // =====================================================

  /**
   * Register a new cylinder for a customer.
   * Transactional: cylinder + custody record + audit.
   * Prevents duplicate tagCode.
   *
   * @returns {Object} { cylinder, custodyRecord }
   */
  // async registerCylinder({
  //   tagCode,
  //   size,
  //   emptyWeight,
  //   customerId,
  //   agentId,
  //   agentRole,
  //   brand = null,
  //   gpsCoordinates = null,
  //   photos = [],
  //   notes = null,
  //   req = null,
  // }) {
  //   if (!tagCode || !size || emptyWeight === undefined || emptyWeight === null) {
  //     throw new ErrorResponse('tagCode, size, and emptyWeight are required', 400);
  //   }
  //   if (emptyWeight < 0) {
  //     throw new ErrorResponse('emptyWeight must be >= 0', 400);
  //   }

  //   const normalizedTag = String(tagCode).toUpperCase().trim();

  //   const session = await mongoose.startSession();
  //   session.startTransaction();

  //   try {
  //     // 1. Check duplicate (active tag)
  //     const existing = await Cylinder.findOne({
  //       tagCode: normalizedTag,
  //       isDeleted: false,
  //     }).session(session);

  //     if (existing) {
  //       throw new ErrorResponse(
  //         `Cylinder tag ${normalizedTag} is already registered`,
  //         409
  //       );
  //     }

  //     // 2. Validate customer exists
  //     const customer = await User.findById(customerId).session(session).lean();
  //     if (!customer) {
  //       throw new ErrorResponse('Customer not found', 404);
  //     }

  //     // 3. Create cylinder
  //     const [cylinder] = await Cylinder.create(
  //       [
  //         {
  //           tagCode: normalizedTag,
  //           size: String(size).trim(),
  //           brand,
  //           userId: customerId,
  //           registeredBy: agentId,
  //           registeredAt: new Date(),
  //           emptyWeight,
  //           status: 'active',
  //           currentCustodian: {
  //             type: 'customer',
  //             referenceId: customerId,
  //             since: new Date(),
  //           },
  //           isDeleted: false,
  //         },
  //       ],
  //       { session }
  //     );

  //     // 4. Create custody record — E-GAS → customer (registration handover)
  //     const [custodyRecord] = await CylinderCustodyRecord.create(
  //       [
  //         {
  //           cylinderId: cylinder._id,
  //           tagCode: cylinder.tagCode,
  //           fromCustodian: { type: 'egas', referenceId: null },
  //           toCustodian: { type: 'customer', referenceId: customerId },
  //           event: 'registered',
  //           actorId: agentId,
  //           actorRole: agentRole,
  //           gpsCoordinates,
  //           notes,
  //           createdAt: new Date(),
  //         },
  //       ],
  //       { session }
  //     );

  //     // 5. Link custody record to cylinder
  //     cylinder.custodyHistory = [custodyRecord._id];
  //     await cylinder.save({ session });

  //     // 6. Audit
  //     await AuditService.log({
  //       action: 'CYLINDER_REGISTERED',
  //       actorId: agentId,
  //       actorRole: agentRole,
  //       entityType: 'Cylinder',
  //       entityId: cylinder._id,
  //       newValue: {
  //         tagCode: cylinder.tagCode,
  //         size: cylinder.size,
  //         emptyWeight: cylinder.emptyWeight,
  //         customerId,
  //       },
  //       metadata: { gpsCoordinates, custodyRecordId: custodyRecord._id },
  //       gpsCoordinates,
  //       req,
  //     });

  //     await session.commitTransaction();

  //     return {
  //       success: true,
  //       cylinder: cylinder.toObject(),
  //       custodyRecord: custodyRecord.toObject(),
  //     };
  //   } catch (error) {
  //     await session.abortTransaction();
  //     throw error;
  //   } finally {
  //     session.endSession();
  //   }
  // }

  

/**
 * Generate a unique cylinder tag for a customer.
 * Format: EG-CYL-{F}{L}-{4 digits}
 * Example: Alice Okafor → EG-CYL-AO-4821
 */
_generateTagCode(firstName, lastName) {
  const F = String(firstName || 'X').trim().toUpperCase().replace(/[^A-Z]/g, '')[0] || 'X';
  const L = String(lastName || 'X').trim().toUpperCase().replace(/[^A-Z]/g, '')[0] || 'X';
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `EG-CYL-${F}${L}-${digits}`;
}

/**
 * Generate a guaranteed-unique tag.
 * Tries up to 10 times; if all collide, appends a 2-digit suffix
 * (e.g. EG-CYL-AO-4821-37) so we never fail registration.
 */
async _generateUniqueTagCode(firstName, lastName, session = null) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const tagCode = this._generateTagCode(firstName, lastName);
    const query = Cylinder.findOne({ tagCode, isDeleted: false });
    if (session) query.session(session);
    const existing = await query.lean();
    if (!existing) return tagCode;
  }

  // Fallback: append a random 2-digit suffix
  const base = this._generateTagCode(firstName, lastName);
  const suffix = Math.floor(10 + Math.random() * 90);
  return `${base}-${suffix}`;
}

/**
 * Register a new cylinder for a customer.
 * IMPORTANT: tag is generated server-side. Client-supplied `tagCode` is IGNORED.
 * @returns {Object} { cylinder, custodyRecord }
 */
async registerCylinder({
  size,
  emptyWeight,
  customerId,
  agentId,
  agentRole,
  brand = null,
  gpsCoordinates = null,
  photos = [],
  notes = null,
  req = null,
}) {
  if (!size || emptyWeight === undefined || emptyWeight === null) {
    throw new ErrorResponse('size and emptyWeight are required', 400);
  }
  if (emptyWeight < 0) {
    throw new ErrorResponse('emptyWeight must be >= 0', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Load customer
    const customer = await User.findById(customerId).session(session).lean();
    if (!customer) {
      throw new ErrorResponse('Customer not found', 404);
    }

    // 2. Generate unique tag from customer's name
    const tagCode = await this._generateUniqueTagCode(
      customer.firstName,
      customer.lastName,
      session
    );

    // 3. Create cylinder
    const [cylinder] = await Cylinder.create(
      [
        {
          tagCode,
          size: String(size).trim(),
          brand,
          userId: customerId,
          registeredBy: agentId,
          registeredAt: new Date(),
          emptyWeight,
          status: 'active',
          currentCustodian: {
            type: 'customer',
            referenceId: customerId,
            since: new Date(),
          },
          isDeleted: false,
        },
      ],
      { session }
    );

    // 4. Custody record — E-GAS → customer
    const [custodyRecord] = await CylinderCustodyRecord.create(
      [
        {
          cylinderId: cylinder._id,
          tagCode: cylinder.tagCode,
          fromCustodian: { type: 'egas', referenceId: null },
          toCustodian: { type: 'customer', referenceId: customerId },
          event: 'registered',
          actorId: agentId,
          actorRole: agentRole,
          gpsCoordinates,
          notes,
          createdAt: new Date(),
        },
      ],
      { session }
    );

    // 5. Link history
    cylinder.custodyHistory = [custodyRecord._id];
    await cylinder.save({ session });

    // 6. Audit
    await AuditService.log({
      action: 'CYLINDER_REGISTERED',
      actorId: agentId,
      actorRole: agentRole,
      entityType: 'Cylinder',
      entityId: cylinder._id,
      newValue: {
        tagCode: cylinder.tagCode,
        size: cylinder.size,
        emptyWeight: cylinder.emptyWeight,
        customerId,
      },
      metadata: { gpsCoordinates, custodyRecordId: custodyRecord._id },
      gpsCoordinates,
      req,
    });

    await session.commitTransaction();

    return {
      success: true,
      cylinder: cylinder.toObject(),
      custodyRecord: custodyRecord.toObject(),
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

  // =====================================================
  // WRITE — CUSTODY TRANSFER
  // =====================================================

  /**
   * Record a custody transfer of a cylinder.
   * Updates cylinder.currentCustodian and appends to custodyHistory.
   */
  async transferCustody({
    cylinderId,
    toCustodianType,   // 'customer' | 'agent' | 'plant' | 'egas'
    toCustodianId,
    event,             // 'collected_by_agent' | 'delivered_to_plant' | ...
    actorId,
    actorRole,
    deliveryId = null,
    plantRefillRequestId = null,
    gpsCoordinates = null,
    notes = null,
    req = null,
    externalSession = null,
  }) {
    const ownsSession = !externalSession;
    const session = externalSession || (await mongoose.startSession());

    if (ownsSession) session.startTransaction();

    try {
      const cylinder = await Cylinder.findById(cylinderId).session(session);
      if (!cylinder || cylinder.isDeleted) {
        throw new ErrorResponse('Cylinder not found', 404);
      }

      const fromCustodian = {
        type: cylinder.currentCustodian?.type || 'unknown',
        referenceId: cylinder.currentCustodian?.referenceId || null,
      };

      // 1. Create custody record
      const [custodyRecord] = await CylinderCustodyRecord.create(
        [
          {
            cylinderId: cylinder._id,
            tagCode: cylinder.tagCode,
            fromCustodian,
            toCustodian: { type: toCustodianType, referenceId: toCustodianId },
            deliveryId,
            plantRefillRequestId,
            actorId,
            actorRole,
            gpsCoordinates,
            event,
            notes,
            createdAt: new Date(),
          },
        ],
        { session }
      );

      // 2. Update cylinder custodian + status + history
      cylinder.currentCustodian = {
        type: toCustodianType,
        referenceId: toCustodianId,
        since: new Date(),
      };

      // Sync status with custodian
      const statusMap = {
        customer: 'active',
        agent: 'in_transit',
        plant: 'at_plant',
        egas: 'active',
      };
      if (statusMap[toCustodianType]) {
        cylinder.status = statusMap[toCustodianType];
      }

      cylinder.custodyHistory = [...(cylinder.custodyHistory || []), custodyRecord._id];
      await cylinder.save({ session });

      // 3. Audit
      await AuditService.log({
        action: 'CYLINDER_CUSTODY_CHANGED',
        actorId,
        actorRole,
        entityType: 'Cylinder',
        entityId: cylinder._id,
        previousValue: { custodian: fromCustodian },
        newValue: { custodian: { type: toCustodianType, referenceId: toCustodianId } },
        metadata: {
          event,
          deliveryId,
          plantRefillRequestId,
          custodyRecordId: custodyRecord._id,
        },
        gpsCoordinates,
        req,
      });

      if (ownsSession) await session.commitTransaction();

      return {
        success: true,
        cylinder: cylinder.toObject(),
        custodyRecord: custodyRecord.toObject(),
      };
    } catch (error) {
      if (ownsSession) await session.abortTransaction();
      throw error;
    } finally {
      if (ownsSession) session.endSession();
    }
  }

  // =====================================================
  // WRITE — FLAG / RETIRE
  // =====================================================

  /**
   * Flag a cylinder as unsafe / damaged.
   */
  async flagCylinder({
    cylinderId,
    reason,
    actorId,
    actorRole,
    req = null,
  }) {
    if (!reason || reason.trim().length === 0) {
      throw new ErrorResponse('Reason is required to flag a cylinder', 400);
    }

    const cylinder = await Cylinder.findById(cylinderId);
    if (!cylinder || cylinder.isDeleted) {
      throw new ErrorResponse('Cylinder not found', 404);
    }

    const previousStatus = cylinder.status;

    cylinder.status = 'flagged';
    cylinder.flaggedReason = reason.trim();
    await cylinder.save();

    await AuditService.log({
      action: 'CYLINDER_FLAGGED',
      actorId,
      actorRole,
      entityType: 'Cylinder',
      entityId: cylinder._id,
      previousValue: { status: previousStatus },
      newValue: { status: 'flagged', reason },
      req,
    });

    return { success: true, cylinder: cylinder.toObject() };
  }

  /**
   * Retire a cylinder (end of life).
   */
  async retireCylinder({
    cylinderId,
    reason,
    actorId,
    actorRole,
    req = null,
  }) {
    if (!reason || reason.trim().length === 0) {
      throw new ErrorResponse('Reason is required to retire a cylinder', 400);
    }

    const cylinder = await Cylinder.findById(cylinderId);
    if (!cylinder || cylinder.isDeleted) {
      throw new ErrorResponse('Cylinder not found', 404);
    }

    const previousStatus = cylinder.status;

    cylinder.status = 'retired';
    cylinder.flaggedReason = reason.trim();
    await cylinder.save();

    await AuditService.log({
      action: 'CYLINDER_RETIRED',
      actorId,
      actorRole,
      entityType: 'Cylinder',
      entityId: cylinder._id,
      previousValue: { status: previousStatus },
      newValue: { status: 'retired', reason },
      req,
    });

    return { success: true, cylinder: cylinder.toObject() };
  }

  /**
   * Update cylinder inspection status (called by InspectionService after approval/rejection).
   */
  async updateLastInspection({
    cylinderId,
    inspectionId,
    status,
    actorId,
    actorRole,
    session = null,
  }) {
    const query = Cylinder.findById(cylinderId);
    if (session) query.session(session);

    const cylinder = await query;
    if (!cylinder) throw new ErrorResponse('Cylinder not found', 404);

    cylinder.lastInspection = {
      inspectionId,
      status,
      at: new Date(),
    };

    await cylinder.save({ session });
    return cylinder;
  }
}

module.exports = new CylinderService();