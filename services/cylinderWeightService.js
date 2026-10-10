const mongoose = require('mongoose');
const Cylinder = require('../models/Cylinder');
const CylinderWeightRecord = require('../models/CylinderWeightRecord');
const ErrorResponse = require('../utils/errorResponse');
const AuditService = require('./auditService');
const RemnantLedgerService = require('./remnantLedgerService');
const CylinderService = require('./cylinderService');
const ConfigService = require('./configService');

/**
 * CylinderWeightService
 * ---------------------
 * Records weight measurements, calculates remnant authoritatively, and appends to ledger.
 *
 * GUARANTEES:
 *  - Backend is the sole authority for remnant calculation (not the frontend)
 *  - Every measurement creates an immutable CylinderWeightRecord
 *  - Every measurement appends to CylinderRemnantLedger
 *  - Cylinder.lastMeasuredWeight is updated
 *  - All within a single MongoDB transaction
 */
class CylinderWeightService {
  /**
   * Record a weight measurement for a cylinder.
   *
   * @param {Object} params
   * @param {ObjectId} params.cylinderId
   * @param {Number}   params.measuredWeight
   * @param {ObjectId} params.recordedBy
   * @param {String}   params.recordedByRole
   * @param {ObjectId} params.deliveryId
   * @param {ObjectId} params.plantRefillRequestId
   * @param {String}   params.measurementType  - 'customer_delivery' | 'plant_refill_pre' | 'plant_refill_post' | 'audit' | 'registration'
   * @param {Object}   params.gpsCoordinates
   * @param {Array}    params.photos
   * @param {String}   params.notes
   * @param {Object}   params.req
   * @param {Session}  params.session
   *
   * @returns {Object} { weightRecord, ledger, cylinder, remnant }
   */
  async recordWeight({
    cylinderId,
    measuredWeight,
    recordedBy,
    recordedByRole,
    deliveryId = null,
    subscriptionId = null,
    plantRefillRequestId = null,
    measurementType = 'customer_delivery',
    gpsCoordinates = null,
    photos = [],
    notes = null,
    req = null,
    session: externalSession = null,
  }) {
    // ===================== VALIDATION =====================
    if (!cylinderId) {
      throw new ErrorResponse('cylinderId is required', 400);
    }
    if (typeof measuredWeight !== 'number' || !Number.isFinite(measuredWeight)) {
      throw new ErrorResponse('measuredWeight must be a finite number', 400);
    }
    if (measuredWeight < 0) {
      throw new ErrorResponse('measuredWeight cannot be negative', 400);
    }

    const ownsSession = !externalSession;
    const session = externalSession || (await mongoose.startSession());

    if (ownsSession) session.startTransaction();

    try {
      // ===================== LOAD CYLINDER =====================
      const cylinder = await Cylinder.findById(cylinderId).session(session);
      if (!cylinder || cylinder.isDeleted) {
        throw new ErrorResponse('Cylinder not found', 404);
      }

      if (cylinder.status === 'retired') {
        throw new ErrorResponse('Cannot weigh a retired cylinder', 400);
      }
      if (cylinder.status === 'flagged') {
        throw new ErrorResponse('Cannot weigh a flagged cylinder. Escalate to E-GAS.', 400);
      }

      // ===================== CALCULATE REMNANT (AUTHORITATIVE) =====================
      const emptyWeight = cylinder.emptyWeight;

      // Guard: measured weight must be >= empty weight (physically required)
      // Allow a small tolerance for measurement error (0.05kg)
      const TOLERANCE = 0.05;
      if (measuredWeight < emptyWeight - TOLERANCE) {
        throw new ErrorResponse(
          `Measured weight (${measuredWeight}kg) is less than registered empty weight (${emptyWeight}kg). Check cylinder tag or re-register.`,
          400
        );
      }

      const calculatedLpg = Math.max(0, +(measuredWeight - emptyWeight).toFixed(3));

      // Guard: sanity check against cylinder size
      const sizeKg = this._parseSizeKg(cylinder.size);
      if (sizeKg && calculatedLpg > sizeKg + 0.5) {
        // More than 0.5kg over cylinder size — likely a measurement error
        throw new ErrorResponse(
          `Measured LPG (${calculatedLpg}kg) exceeds cylinder size (${sizeKg}kg). Verify measurement.`,
          400
        );
      }

      // ===================== CREATE WEIGHT RECORD (IMMUTABLE) =====================
      const [weightRecord] = await CylinderWeightRecord.create(
        [
          {
            cylinderId: cylinder._id,
            tagCode: cylinder.tagCode,
            userId: cylinder.userId,
            deliveryId,
            subscriptionId,
            plantRefillRequestId,
            measurementType,
            measuredWeight,
            emptyWeight,
            calculatedLpg,
            recordedBy,
            recordedByRole,
            gpsCoordinates,
            photos,
            notes,
            createdAt: new Date(),
          },
        ],
        { session }
      );

      // ===================== APPEND TO REMNANT LEDGER =====================
      let ledgerResult = null;

      // Only credit remnant for measurements that represent a customer-side delivery weighing.
      // Plant-side pre/post measurements do NOT credit customer remnant (they serve plant ops).
      const shouldCredit =
        measurementType === 'customer_delivery' ||
        measurementType === 'registration' ||
        measurementType === 'audit';

      if (shouldCredit && calculatedLpg > 0) {
        ledgerResult = await RemnantLedgerService.addMeasurement({
          userId: cylinder.userId,
          cylinderId: cylinder._id,
          cylinderTag: cylinder.tagCode,
          delta: calculatedLpg,
          measuredWeight,
          emptyWeight,
          physicalRemnant: calculatedLpg,
          weightRecordId: weightRecord._id,
          deliveryId,
          performedBy: recordedBy,
          performedByRole: recordedByRole,
          metadata: { measurementType },
          req,
          session, // pass outer session
        });

        // Link ledger entry back to weight record (immutable, so we just link by ref in weight record? No — weight record is immutable. So we store the ledger ID on the ledger entry only. Optionally, we can add the ledger ID to the cylinder's remnantLedger array.)
        cylinder.remnantLedger = [
          ...(cylinder.remnantLedger || []),
          ledgerResult.entry._id,
        ];
      }

      // ===================== UPDATE CYLINDER =====================
      cylinder.lastMeasuredWeight = measuredWeight;
      cylinder.lastMeasuredAt = new Date();
      cylinder.weightHistory = [
        ...(cylinder.weightHistory || []),
        weightRecord._id,
      ];

      await cylinder.save({ session });

      // ===================== AUDIT =====================
      await AuditService.log({
        action: 'CYLINDER_WEIGHT_RECORDED',
        actorId: recordedBy,
        actorRole: recordedByRole,
        entityType: 'Cylinder',
        entityId: cylinder._id,
        previousValue: {
          lastMeasuredWeight: cylinder.lastMeasuredWeight,
        },
        newValue: {
          measuredWeight,
          calculatedLpg,
        },
        metadata: {
          weightRecordId: weightRecord._id,
          deliveryId,
          plantRefillRequestId,
          measurementType,
        },
        gpsCoordinates,
        req,
      });

      if (ownsSession) await session.commitTransaction();

      // ===================== ELIGIBILITY SNAPSHOT =====================
      // (After commit — read-only, safe)
      const minimumKg = await ConfigService.getConfig('MINIMUM_REMNANT_DELIVERY_KG', 6);
      const currentBalance = ledgerResult?.newBalance ?? (await RemnantLedgerService.getUserBalance(cylinder.userId));

      return {
        success: true,
        cylinder: cylinder.toObject(),
        weightRecord: weightRecord.toObject(),
        ledger: ledgerResult
          ? {
              entryId: ledgerResult.entry._id,
              previousBalance: ledgerResult.previousBalance,
              delta: ledgerResult.delta,
              newBalance: ledgerResult.newBalance,
            }
          : null,
        remnant: {
          measuredWeight,
          emptyWeight,
          physicalRemnant: calculatedLpg,
          currentAccumulatedBalance: currentBalance,
          eligibilityThresholdKg: minimumKg,
          eligibleForDelivery: currentBalance >= minimumKg,
        },
      };
    } catch (error) {
      if (ownsSession) await session.abortTransaction();
      throw error;
    } finally {
      if (ownsSession) session.endSession();
    }
  }

  // =====================================================
  // READ
  // =====================================================

  async getWeightHistoryForCylinder(cylinderId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      CylinderWeightRecord.find({ cylinderId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('recordedBy', 'firstName lastName role')
        .populate('deliveryId', 'deliveryDate status')
        .lean(),
      CylinderWeightRecord.countDocuments({ cylinderId }),
    ]);

    return {
      records,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getWeightHistoryForDelivery(deliveryId) {
    return CylinderWeightRecord.find({ deliveryId })
      .sort({ createdAt: 1 })
      .lean();
  }

  async getByDelivery(deliveryId) {
    return CylinderWeightRecord.find({ deliveryId })
      .sort({ createdAt: 1 })
      .populate('recordedBy', 'firstName lastName role')
      .lean();
  }

  // =====================================================
  // HELPERS
  // =====================================================

  _parseSizeKg(sizeStr) {
    if (!sizeStr) return null;
    const match = String(sizeStr).match(/(\d+(\.\d+)?)/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    return Number.isFinite(num) ? num : null;
  }
}

module.exports = new CylinderWeightService();