// const mongoose = require('mongoose');
// const Cylinder = require('../models/Cylinder');
// const CylinderWeightRecord = require('../models/CylinderWeightRecord');
// const ErrorResponse = require('../utils/errorResponse');
// const AuditService = require('./auditService');
// const RemnantLedgerService = require('./remnantLedgerService');
// const CylinderService = require('./cylinderService');
// const ConfigService = require('./configService');

// /**
//  * CylinderWeightService
//  * ---------------------
//  * Records weight measurements, calculates remnant authoritatively, and appends to ledger.
//  *
//  * GUARANTEES:
//  *  - Backend is the sole authority for remnant calculation (not the frontend)
//  *  - Every measurement creates an immutable CylinderWeightRecord
//  *  - Every measurement appends to CylinderRemnantLedger
//  *  - Cylinder.lastMeasuredWeight is updated
//  *  - All within a single MongoDB transaction
//  */
// class CylinderWeightService {
//   /**
//    * Record a weight measurement for a cylinder.
//    *
//    * @param {Object} params
//    * @param {ObjectId} params.cylinderId
//    * @param {Number}   params.measuredWeight
//    * @param {ObjectId} params.recordedBy
//    * @param {String}   params.recordedByRole
//    * @param {ObjectId} params.deliveryId
//    * @param {ObjectId} params.plantRefillRequestId
//    * @param {String}   params.measurementType  - 'customer_delivery' | 'plant_refill_pre' | 'plant_refill_post' | 'audit' | 'registration'
//    * @param {Object}   params.gpsCoordinates
//    * @param {Array}    params.photos
//    * @param {String}   params.notes
//    * @param {Object}   params.req
//    * @param {Session}  params.session
//    *
//    * @returns {Object} { weightRecord, ledger, cylinder, remnant }
//    */
//   async recordWeight({
//     cylinderId,
//     measuredWeight,
//     recordedBy,
//     recordedByRole,
//     deliveryId = null,
//     subscriptionId = null,
//     plantRefillRequestId = null,
//     measurementType = 'customer_delivery',
//     gpsCoordinates = null,
//     photos = [],
//     notes = null,
//     req = null,
//     session: externalSession = null,
//   }) {
//     // ===================== VALIDATION =====================
//     if (!cylinderId) {
//       throw new ErrorResponse('cylinderId is required', 400);
//     }
//     if (typeof measuredWeight !== 'number' || !Number.isFinite(measuredWeight)) {
//       throw new ErrorResponse('measuredWeight must be a finite number', 400);
//     }
//     if (measuredWeight < 0) {
//       throw new ErrorResponse('measuredWeight cannot be negative', 400);
//     }

//     const ownsSession = !externalSession;
//     const session = externalSession || (await mongoose.startSession());

//     if (ownsSession) session.startTransaction();

//     try {
//       // ===================== LOAD CYLINDER =====================
//       const cylinder = await Cylinder.findById(cylinderId).session(session);
//       if (!cylinder || cylinder.isDeleted) {
//         throw new ErrorResponse('Cylinder not found', 404);
//       }

//       if (cylinder.status === 'retired') {
//         throw new ErrorResponse('Cannot weigh a retired cylinder', 400);
//       }
//       if (cylinder.status === 'flagged') {
//         throw new ErrorResponse('Cannot weigh a flagged cylinder. Escalate to E-GAS.', 400);
//       }

//       // ===================== CALCULATE REMNANT (AUTHORITATIVE) =====================
//       const emptyWeight = cylinder.emptyWeight;

//       // Guard: measured weight must be >= empty weight (physically required)
//       // Allow a small tolerance for measurement error (0.05kg)
//       const TOLERANCE = 0.05;
//       if (measuredWeight < emptyWeight - TOLERANCE) {
//         throw new ErrorResponse(
//           `Measured weight (${measuredWeight}kg) is less than registered empty weight (${emptyWeight}kg). Check cylinder tag or re-register.`,
//           400
//         );
//       }

//       const calculatedLpg = Math.max(0, +(measuredWeight - emptyWeight).toFixed(3));

//       // Guard: sanity check against cylinder size
//       const sizeKg = this._parseSizeKg(cylinder.size);
//       if (sizeKg && calculatedLpg > sizeKg + 0.5) {
//         // More than 0.5kg over cylinder size — likely a measurement error
//         throw new ErrorResponse(
//           `Measured LPG (${calculatedLpg}kg) exceeds cylinder size (${sizeKg}kg). Verify measurement.`,
//           400
//         );
//       }

//       // ===================== CREATE WEIGHT RECORD (IMMUTABLE) =====================
//       const [weightRecord] = await CylinderWeightRecord.create(
//         [
//           {
//             cylinderId: cylinder._id,
//             tagCode: cylinder.tagCode,
//             userId: cylinder.userId,
//             deliveryId,
//             subscriptionId,
//             plantRefillRequestId,
//             measurementType,
//             measuredWeight,
//             emptyWeight,
//             calculatedLpg,
//             recordedBy,
//             recordedByRole,
//             gpsCoordinates,
//             photos,
//             notes,
//             createdAt: new Date(),
//           },
//         ],
//         { session }
//       );

//       // ===================== APPEND TO REMNANT LEDGER =====================
//       let ledgerResult = null;

//       // Only credit remnant for measurements that represent a customer-side delivery weighing.
//       // Plant-side pre/post measurements do NOT credit customer remnant (they serve plant ops).
//       const shouldCredit =
//         measurementType === 'customer_delivery' ||
//         measurementType === 'registration' ||
//         measurementType === 'audit';

//       if (shouldCredit && calculatedLpg > 0) {
//         ledgerResult = await RemnantLedgerService.addMeasurement({
//           userId: cylinder.userId,
//           cylinderId: cylinder._id,
//           cylinderTag: cylinder.tagCode,
//           delta: calculatedLpg,
//           measuredWeight,
//           emptyWeight,
//           physicalRemnant: calculatedLpg,
//           weightRecordId: weightRecord._id,
//           deliveryId,
//           performedBy: recordedBy,
//           performedByRole: recordedByRole,
//           metadata: { measurementType },
//           req,
//           session, // pass outer session
//         });

//         // Link ledger entry back to weight record (immutable, so we just link by ref in weight record? No — weight record is immutable. So we store the ledger ID on the ledger entry only. Optionally, we can add the ledger ID to the cylinder's remnantLedger array.)
//         cylinder.remnantLedger = [
//           ...(cylinder.remnantLedger || []),
//           ledgerResult.entry._id,
//         ];
//       }

//       // ===================== UPDATE CYLINDER =====================
//       cylinder.lastMeasuredWeight = measuredWeight;
//       cylinder.lastMeasuredAt = new Date();
//       cylinder.weightHistory = [
//         ...(cylinder.weightHistory || []),
//         weightRecord._id,
//       ];

//       await cylinder.save({ session });

//       // ===================== AUDIT =====================
//       await AuditService.log({
//         action: 'CYLINDER_WEIGHT_RECORDED',
//         actorId: recordedBy,
//         actorRole: recordedByRole,
//         entityType: 'Cylinder',
//         entityId: cylinder._id,
//         previousValue: {
//           lastMeasuredWeight: cylinder.lastMeasuredWeight,
//         },
//         newValue: {
//           measuredWeight,
//           calculatedLpg,
//         },
//         metadata: {
//           weightRecordId: weightRecord._id,
//           deliveryId,
//           plantRefillRequestId,
//           measurementType,
//         },
//         gpsCoordinates,
//         req,
//       });

//       if (ownsSession) await session.commitTransaction();

//       // ===================== ELIGIBILITY SNAPSHOT =====================
//       // (After commit — read-only, safe)
//       const minimumKg = await ConfigService.getConfig('MINIMUM_REMNANT_DELIVERY_KG', 6);
//       const currentBalance = ledgerResult?.newBalance ?? (await RemnantLedgerService.getUserBalance(cylinder.userId));

//       return {
//         success: true,
//         cylinder: cylinder.toObject(),
//         weightRecord: weightRecord.toObject(),
//         ledger: ledgerResult
//           ? {
//               entryId: ledgerResult.entry._id,
//               previousBalance: ledgerResult.previousBalance,
//               delta: ledgerResult.delta,
//               newBalance: ledgerResult.newBalance,
//             }
//           : null,
//         remnant: {
//           measuredWeight,
//           emptyWeight,
//           physicalRemnant: calculatedLpg,
//           currentAccumulatedBalance: currentBalance,
//           eligibilityThresholdKg: minimumKg,
//           eligibleForDelivery: currentBalance >= minimumKg,
//         },
//       };
//     } catch (error) {
//       if (ownsSession) await session.abortTransaction();
//       throw error;
//     } finally {
//       if (ownsSession) session.endSession();
//     }
//   }

//   // =====================================================
//   // READ
//   // =====================================================

//   async getWeightHistoryForCylinder(cylinderId, { page = 1, limit = 20 } = {}) {
//     const skip = (page - 1) * limit;
//     const [records, total] = await Promise.all([
//       CylinderWeightRecord.find({ cylinderId })
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .populate('recordedBy', 'firstName lastName role')
//         .populate('deliveryId', 'deliveryDate status')
//         .lean(),
//       CylinderWeightRecord.countDocuments({ cylinderId }),
//     ]);

//     return {
//       records,
//       pagination: {
//         page,
//         limit,
//         total,
//         pages: Math.ceil(total / limit),
//       },
//     };
//   }

//   async getWeightHistoryForDelivery(deliveryId) {
//     return CylinderWeightRecord.find({ deliveryId })
//       .sort({ createdAt: 1 })
//       .lean();
//   }

//   async getByDelivery(deliveryId) {
//     return CylinderWeightRecord.find({ deliveryId })
//       .sort({ createdAt: 1 })
//       .populate('recordedBy', 'firstName lastName role')
//       .lean();
//   }

//   // =====================================================
//   // HELPERS
//   // =====================================================

//   _parseSizeKg(sizeStr) {
//     if (!sizeStr) return null;
//     const match = String(sizeStr).match(/(\d+(\.\d+)?)/);
//     if (!match) return null;
//     const num = parseFloat(match[1]);
//     return Number.isFinite(num) ? num : null;
//   }
// }

// module.exports = new CylinderWeightService();

























const mongoose = require('mongoose');
const Cylinder = require('../models/Cylinder');
const CylinderWeightRecord = require('../models/CylinderWeightRecord');
const Delivery = require('../models/Delivery');
const Subscription = require('../models/Subscription');
const ErrorResponse = require('../utils/errorResponse');
const AuditService = require('./auditService');
const RemnantLedgerService = require('./remnantLedgerService');
const ConfigService = require('./configService');
const { resolvePurchasedKg } = require('../utils/deliveryHelper');

/**
 * CylinderWeightService
 * ---------------------
 * Records weight measurements and (for post-fill records) credits remnant.
 *
 * TWO WORKFLOWS, ONE SERVICE:
 *   - Delivery (agent) workflow → pre/post fill → remnant credit (customer-visible)
 *   - Plant workflow            → handled by PlantRefillService (this service is NOT involved)
 *
 * GUARANTEES:
 *   - Pre-fill records are created at "agent collects from customer".
 *   - Post-fill records are created at "agent collects from plant" (after plant confirms).
 *   - Remnant credit is only applied on post-fill records.
 *   - All weight records are immutable (except `superseded` flag on retries).
 *   - Every mutation runs inside a MongoDB transaction.
 *
 * REMNANT FORMULA (authoritative):
 *   refilledKg    = postFillWeight - preFillWeight
 *   purchasedKg   = delivery.requestedKg ?? planDetails.size ?? subscription.size
 *   remnantDeltaKg = max(0, purchasedKg - refilledKg)
 */
class CylinderWeightService {
  // =====================================================
  // PRE-FILL WEIGHING
  // =====================================================

  /**
   * Record the pre-fill weight of a cylinder.
   * Called when the agent collects the cylinder from the customer,
   * BEFORE going to the plant.
   *
   * Side effects:
   *   - creates a CylinderWeightRecord (phase: pre_fill)
   *   - updates Delivery.{preFillWeight, preFillRecordedAt/By, preFillWeightRecordId,
   *                        plantWorkflowStatus: 'agent_collected_from_customer'}
   *   - updates Cylinder.{lastMeasuredWeight, lastMeasuredAt, weightHistory}
   *   - does NOT credit remnant
   */
  async recordPreFillWeight({
    cylinderId,
    deliveryId,
    measuredWeight,
    recordedBy,
    recordedByRole,
    gpsCoordinates = null,
    photos = [],
    notes = null,
    req = null,
  }) {
    // ---------- VALIDATION ----------
    if (!cylinderId) throw new ErrorResponse('cylinderId is required', 400);
    if (!deliveryId) throw new ErrorResponse('deliveryId is required', 400);
    if (typeof measuredWeight !== 'number' || !Number.isFinite(measuredWeight)) {
      throw new ErrorResponse('measuredWeight must be a finite number', 400);
    }
    if (measuredWeight <= 0) {
      throw new ErrorResponse('measuredWeight must be > 0', 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // ---------- LOAD DELIVERY & CYLINDER ----------
      const delivery = await Delivery.findById(deliveryId).session(session);
      if (!delivery) throw new ErrorResponse('Delivery not found', 404);

      const cylinder = await Cylinder.findById(cylinderId).session(session);
      if (!cylinder || cylinder.isDeleted) {
        throw new ErrorResponse('Cylinder not found', 404);
      }

      if (cylinder.userId.toString() !== delivery.userId.toString()) {
        throw new ErrorResponse(
          "Cylinder does not belong to this delivery's customer",
          400
        );
      }

      if (cylinder.status === 'retired' || cylinder.status === 'flagged') {
        throw new ErrorResponse(
          `Cannot weigh a ${cylinder.status} cylinder`,
          400
        );
      }

      // ---------- IDEMPOTENCY GUARD ----------
      // Only one *active* (non-superseded) pre-fill per delivery.
      const existingActivePreFill = await CylinderWeightRecord.findOne({
        deliveryId,
        phase: 'pre_fill',
        superseded: { $ne: true },
      }).session(session);

      if (existingActivePreFill) {
        throw new ErrorResponse(
          `Pre-fill weight already recorded for this delivery (${existingActivePreFill.measuredWeight}kg). ` +
            `Supersede it via retry instead of recording a new pre-fill.`,
          409
        );
      }

      // ---------- SANITY GUARD ----------
      const sizeKg = this._parseSizeKg(cylinder.size);
      if (sizeKg && measuredWeight > sizeKg * 1.5) {
        throw new ErrorResponse(
          `Pre-fill weight (${measuredWeight}kg) is implausibly high for a ${cylinder.size} cylinder`,
          400
        );
      }

      // ---------- CREATE WEIGHT RECORD ----------
      const [preRecord] = await CylinderWeightRecord.create(
        [
          {
            cylinderId: cylinder._id,
            tagCode: cylinder.tagCode,
            userId: cylinder.userId,
            deliveryId,
            subscriptionId: delivery.subscriptionId || null,
            phase: 'pre_fill',
            measurementType: 'plant_refill_pre',
            measuredWeight,
            emptyWeight: cylinder.emptyWeight, // reference only; not used in remnant math
            calculatedLpg: Math.max(0, +(measuredWeight - cylinder.emptyWeight).toFixed(3)),
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

      // ---------- UPDATE DELIVERY ----------
      delivery.preFillWeight = measuredWeight;
      delivery.preFillRecordedAt = new Date();
      delivery.preFillRecordedBy = recordedBy;
      delivery.preFillWeightRecordId = preRecord._id;

      // Only advance the workflow status if we're still at (or before) this stage.
      const preFillSafeStatuses = [
        'not_started',
        'plant_selected',
        'request_created',
        'agent_collected_from_customer',
      ];
      if (
        preFillSafeStatuses.includes(delivery.plantWorkflowStatus) ||
        !delivery.plantWorkflowStatus
      ) {
        delivery.plantWorkflowStatus = 'agent_collected_from_customer';
      }

      await delivery.save({ session });

      // ---------- UPDATE CYLINDER ----------
      cylinder.lastMeasuredWeight = measuredWeight;
      cylinder.lastMeasuredAt = new Date();
      cylinder.weightHistory = [
        ...(cylinder.weightHistory || []),
        preRecord._id,
      ];
      await cylinder.save({ session });

      // ---------- AUDIT ----------
      await AuditService.log({
        action: 'CYLINDER_PRE_FILL_RECORDED',
        actorId: recordedBy,
        actorRole: recordedByRole,
        entityType: 'Cylinder',
        entityId: cylinder._id,
        previousValue: { lastMeasuredWeight: cylinder.lastMeasuredWeight },
        newValue: {
          phase: 'pre_fill',
          measuredWeight,
          deliveryId,
          weightRecordId: preRecord._id,
        },
        metadata: {
          deliveryId,
          cylinderId: cylinder._id,
          weightRecordId: preRecord._id,
        },
        gpsCoordinates,
        req,
      });

      await session.commitTransaction();

      return {
        success: true,
        phase: 'pre_fill',
        weightRecord: preRecord.toObject(),
        delivery: delivery.toObject(),
        cylinder: cylinder.toObject(),
        remnant: {
          credit: 0, // no remnant credited at pre-fill
          note: 'Pre-fill weight recorded. Remnant is credited only at post-fill.',
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // POST-FILL WEIGHING (credits remnant)
  // =====================================================

  /**
   * Record the post-fill weight of a cylinder.
   * Called when the agent collects the cylinder from the plant, AFTER refill.
   *
   * Computes:
   *   refilledKg      = postFillWeight - preFillWeight
   *   purchasedKg     = resolvePurchasedKg(delivery, subscription)
   *   rawRemnant      = purchasedKg - refilledKg
   *   remnantDeltaKg  = max(0, rawRemnant)  ← what we credit
   *   overFillKg      = max(0, -rawRemnant) ← diagnostic if plant over-filled
   *
   * Side effects:
   *   - creates a CylinderWeightRecord (phase: post_fill, pairedWeightRecordId: preRecord._id)
   *   - credits CylinderRemnantLedger via RemnantLedgerService.addMeasurement
   *   - updates Delivery.{postFillWeight, postFillRecordedAt/By, postFillWeightRecordId,
   *                        purchasedKg, refilledKg, remnantDeltaKg, overFillKg,
   *                        remnantLedgerEntryId, plantWorkflowStatus: 'remnant_credited'}
   *   - updates Cylinder.{lastMeasuredWeight, lastMeasuredAt, weightHistory, remnantLedger}
   */
  async recordPostFillWeight({
    cylinderId,
    deliveryId,
    measuredWeight,
    recordedBy,
    recordedByRole,
    gpsCoordinates = null,
    photos = [],
    notes = null,
    req = null,
  }) {
    // ---------- VALIDATION ----------
    if (!cylinderId) throw new ErrorResponse('cylinderId is required', 400);
    if (!deliveryId) throw new ErrorResponse('deliveryId is required', 400);
    if (typeof measuredWeight !== 'number' || !Number.isFinite(measuredWeight)) {
      throw new ErrorResponse('measuredWeight must be a finite number', 400);
    }
    if (measuredWeight <= 0) {
      throw new ErrorResponse('measuredWeight must be > 0', 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // ---------- LOAD DELIVERY & CYLINDER ----------
      const delivery = await Delivery.findById(deliveryId).session(session);
      if (!delivery) throw new ErrorResponse('Delivery not found', 404);

      const cylinder = await Cylinder.findById(cylinderId).session(session);
      if (!cylinder || cylinder.isDeleted) {
        throw new ErrorResponse('Cylinder not found', 404);
      }

      if (cylinder.userId.toString() !== delivery.userId.toString()) {
        throw new ErrorResponse(
          "Cylinder does not belong to this delivery's customer",
          400
        );
      }

      // ---------- REQUIRE A PAIRED PRE-FILL ----------
      if (!delivery.preFillWeightRecordId || delivery.preFillWeight === null) {
        throw new ErrorResponse(
          'Cannot record post-fill weight before pre-fill weight',
          400
        );
      }

      const preRecord = await CylinderWeightRecord.findById(
        delivery.preFillWeightRecordId
      ).session(session);

      if (!preRecord || preRecord.superseded) {
        throw new ErrorResponse(
          'Paired pre-fill record is missing or superseded — re-record pre-fill first',
          409
        );
      }

      const preFillWeight = preRecord.measuredWeight;

      // ---------- IDEMPOTENCY GUARD ----------
      if (delivery.postFillWeightRecordId) {
        throw new ErrorResponse(
          'Post-fill weight already recorded for this delivery',
          409
        );
      }

      // ---------- PHYSICAL GUARD ----------
      if (measuredWeight < preFillWeight) {
        throw new ErrorResponse(
          'Post-fill weight must be ≥ pre-fill weight',
          400
        );
      }

      const sizeKg = this._parseSizeKg(cylinder.size);
      if (sizeKg && measuredWeight > sizeKg * 1.5) {
        throw new ErrorResponse(
          `Post-fill weight (${measuredWeight}kg) is implausibly high for a ${cylinder.size} cylinder`,
          400
        );
      }

      // ---------- RESOLVE PURCHASED KG ----------
      let subscription = null;
      if (delivery.subscriptionId) {
        subscription = await Subscription.findById(delivery.subscriptionId)
          .select('size')
          .session(session)
          .lean();
      }

      const purchasedKg = resolvePurchasedKg(delivery, subscription);
      if (purchasedKg === null) {
        throw new ErrorResponse(
          'Cannot determine purchased quantity for this delivery (requestedKg / planDetails.size / subscription.size all missing)',
          400
        );
      }

      // ---------- COMPUTE REMNANT ----------
      const refilledKg = +(measuredWeight - preFillWeight).toFixed(3);
      const rawRemnant = +(purchasedKg - refilledKg).toFixed(3);
      const remnantDeltaKg = Math.max(0, rawRemnant);
      const overFillKg = rawRemnant < 0 ? Math.abs(rawRemnant) : 0;

      // ---------- CREATE POST-FILL RECORD ----------
      const [postRecord] = await CylinderWeightRecord.create(
        [
          {
            cylinderId: cylinder._id,
            tagCode: cylinder.tagCode,
            userId: cylinder.userId,
            deliveryId,
            subscriptionId: delivery.subscriptionId || null,
            phase: 'post_fill',
            measurementType: 'plant_refill_post',
            pairedWeightRecordId: preRecord._id,
            measuredWeight,
            emptyWeight: cylinder.emptyWeight, // reference only
            calculatedLpg: Math.max(0, +(measuredWeight - cylinder.emptyWeight).toFixed(3)),
            remnantDeltaKg,
            purchasedKg,
            refilledKg,
            overFillKg,
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

      // ---------- CREDIT REMNANT LEDGER ----------
      let ledgerResult = null;

      if (remnantDeltaKg >= 0.01) {
        ledgerResult = await RemnantLedgerService.addMeasurement({
          userId: cylinder.userId,
          cylinderId: cylinder._id,
          cylinderTag: cylinder.tagCode,
          delta: remnantDeltaKg,
          // Legacy fields — keep their meaning aligned with the new model:
          measuredWeight,       // = postFill
          emptyWeight: preFillWeight, // = preFill
          physicalRemnant: refilledKg,
          weightRecordId: postRecord._id,
          deliveryId,
          performedBy: recordedBy,
          performedByRole: recordedByRole,
          metadata: {
            phase: 'post_fill',
            purchasedKg,
            refilledKg,
            remnantDeltaKg,
            overFillKg,
            preWeightRecordId: preRecord._id,
            preFillWeight,
            postFillWeight: measuredWeight,
          },
          req,
          session, // reuse the outer session — do not open a new one
        });

        // Link the ledger entry to the post-fill weight record
        postRecord.remnantLedgerEntryId = ledgerResult.entry._id;
        await postRecord.save({ session });
      }

      // ---------- UPDATE DELIVERY ----------
      delivery.postFillWeight = measuredWeight;
      delivery.postFillRecordedAt = new Date();
      delivery.postFillRecordedBy = recordedBy;
      delivery.postFillWeightRecordId = postRecord._id;
      delivery.purchasedKg = purchasedKg;
      delivery.refilledKg = refilledKg;
      delivery.remnantDeltaKg = remnantDeltaKg;
      delivery.overFillKg = overFillKg > 0 ? overFillKg : null;

      if (ledgerResult) {
        delivery.remnantLedgerEntryId = ledgerResult.entry._id;
      }

      delivery.plantWorkflowStatus = 'remnant_credited';

      await delivery.save({ session });

      // ---------- UPDATE CYLINDER ----------
      cylinder.lastMeasuredWeight = measuredWeight;
      cylinder.lastMeasuredAt = new Date();
      cylinder.weightHistory = [
        ...(cylinder.weightHistory || []),
        postRecord._id,
      ];
      if (ledgerResult) {
        cylinder.remnantLedger = [
          ...(cylinder.remnantLedger || []),
          ledgerResult.entry._id,
        ];
      }
      await cylinder.save({ session });

      // ---------- AUDIT ----------
      await AuditService.log({
        action: 'CYLINDER_POST_FILL_RECORDED',
        actorId: recordedBy,
        actorRole: recordedByRole,
        entityType: 'Cylinder',
        entityId: cylinder._id,
        previousValue: { lastMeasuredWeight: cylinder.lastMeasuredWeight },
        newValue: {
          phase: 'post_fill',
          preFillWeight,
          postFillWeight: measuredWeight,
          purchasedKg,
          refilledKg,
          remnantDeltaKg,
          overFillKg,
          deliveryId,
          weightRecordId: postRecord._id,
          ledgerEntryId: ledgerResult?.entry._id || null,
        },
        metadata: {
          deliveryId,
          cylinderId: cylinder._id,
          preWeightRecordId: preRecord._id,
          postWeightRecordId: postRecord._id,
        },
        gpsCoordinates,
        req,
      });

      await session.commitTransaction();

      // ---------- ELIGIBILITY SNAPSHOT (after commit) ----------
      const eligibility = await RemnantLedgerService.checkEligibility(
        cylinder.userId
      );

      return {
        success: true,
        phase: 'post_fill',
        weightRecord: postRecord.toObject(),
        delivery: delivery.toObject(),
        cylinder: cylinder.toObject(),
        remnant: {
          preFillWeight,
          postFillWeight: measuredWeight,
          purchasedKg,
          refilledKg,
          remnantDeltaKg,
          overFillKg,
          ledgerEntryId: ledgerResult?.entry._id || null,
          previousBalance: ledgerResult?.previousBalance ?? null,
          newBalance: ledgerResult?.newBalance ?? eligibility.balance,
          eligibleForDelivery: eligibility.eligible,
          minimumRequired: eligibility.minimumRequired,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // LEGACY (kept for old code paths — audit / registration / customer_delivery)
  // =====================================================

  /**
   * Legacy single-measurement weigh.
   * Retained for audit / registration / customer_delivery flows.
   * NOT used by the plant refill workflow anymore.
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
    if (!cylinderId) throw new ErrorResponse('cylinderId is required', 400);
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
      const cylinder = await Cylinder.findById(cylinderId).session(session);
      if (!cylinder || cylinder.isDeleted) {
        throw new ErrorResponse('Cylinder not found', 404);
      }
      if (cylinder.status === 'retired') {
        throw new ErrorResponse('Cannot weigh a retired cylinder', 400);
      }
      if (cylinder.status === 'flagged') {
        throw new ErrorResponse(
          'Cannot weigh a flagged cylinder. Escalate to E-GAS.',
          400
        );
      }

      const emptyWeight = cylinder.emptyWeight;
      const TOLERANCE = 0.05;
      if (measuredWeight < emptyWeight - TOLERANCE) {
        throw new ErrorResponse(
          `Measured weight (${measuredWeight}kg) is less than registered empty weight (${emptyWeight}kg).`,
          400
        );
      }

      const calculatedLpg = Math.max(
        0,
        +(measuredWeight - emptyWeight).toFixed(3)
      );

      const sizeKg = this._parseSizeKg(cylinder.size);
      if (sizeKg && calculatedLpg > sizeKg + 0.5) {
        throw new ErrorResponse(
          `Measured LPG (${calculatedLpg}kg) exceeds cylinder size (${sizeKg}kg).`,
          400
        );
      }

      const [weightRecord] = await CylinderWeightRecord.create(
        [
          {
            cylinderId: cylinder._id,
            tagCode: cylinder.tagCode,
            userId: cylinder.userId,
            deliveryId,
            subscriptionId,
            plantRefillRequestId,
            phase: 'standalone',
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

      // Legacy remnant credit for customer_delivery / registration / audit.
      // NOTE: This uses old tare math. Kept for backwards compatibility only.
      let ledgerResult = null;
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
          metadata: { measurementType, legacy: true },
          req,
          session,
        });

        cylinder.remnantLedger = [
          ...(cylinder.remnantLedger || []),
          ledgerResult.entry._id,
        ];
      }

      cylinder.lastMeasuredWeight = measuredWeight;
      cylinder.lastMeasuredAt = new Date();
      cylinder.weightHistory = [
        ...(cylinder.weightHistory || []),
        weightRecord._id,
      ];
      await cylinder.save({ session });

      await AuditService.log({
        action: 'CYLINDER_WEIGHT_RECORDED',
        actorId: recordedBy,
        actorRole: recordedByRole,
        entityType: 'Cylinder',
        entityId: cylinder._id,
        previousValue: { lastMeasuredWeight: cylinder.lastMeasuredWeight },
        newValue: { measuredWeight, calculatedLpg },
        metadata: {
          weightRecordId: weightRecord._id,
          deliveryId,
          plantRefillRequestId,
          measurementType,
          legacy: true,
        },
        gpsCoordinates,
        req,
      });

      if (ownsSession) await session.commitTransaction();

      const minimumKg = await ConfigService.getConfig(
        'MINIMUM_REMNANT_DELIVERY_KG',
        6
      );
      const currentBalance =
        ledgerResult?.newBalance ??
        (await RemnantLedgerService.getUserBalance(cylinder.userId));

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
          legacy: true,
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