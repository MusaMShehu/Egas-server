// const mongoose = require('mongoose');
// const Cylinder = require('../models/Cylinder');
// const CylinderWeightRecord = require('../models/CylinderWeightRecord');
// const Delivery = require('../models/Delivery');
// const Subscription = require('../models/Subscription');
// const ErrorResponse = require('../utils/errorResponse');
// const AuditService = require('./auditService');
// const RemnantLedgerService = require('./remnantLedgerService');
// const ConfigService = require('./configService');
// const { resolvePurchasedKg } = require('../utils/deliveryHelper');

// /**
//  * CylinderWeightService
//  * ---------------------
//  * Records weight measurements and (for post-fill records) credits remnant.
//  *
//  * TWO WORKFLOWS, ONE SERVICE:
//  *   - Delivery (agent) workflow → pre/post fill → remnant credit (customer-visible)
//  *   - Plant workflow            → handled by PlantRefillService (this service is NOT involved)
//  *
//  * GUARANTEES:
//  *   - Pre-fill records are created at "agent collects from customer".
//  *   - Post-fill records are created at "agent collects from plant" (after plant confirms).
//  *   - Remnant credit is only applied on post-fill records.
//  *   - All weight records are immutable (except `superseded` flag on retries).
//  *   - Every mutation runs inside a MongoDB transaction.
//  *
//  * REMNANT FORMULA (authoritative):
//  *   refilledKg    = postFillWeight - preFillWeight
//  *   purchasedKg   = delivery.requestedKg ?? planDetails.size ?? subscription.size
//  *   remnantDeltaKg = max(0, purchasedKg - refilledKg)
//  */
// class CylinderWeightService {
//   // =====================================================
//   // PRE-FILL WEIGHING
//   // =====================================================

//   /**
//    * Record the pre-fill weight of a cylinder.
//    * Called when the agent collects the cylinder from the customer,
//    * BEFORE going to the plant.
//    *
//    * Side effects:
//    *   - creates a CylinderWeightRecord (phase: pre_fill)
//    *   - updates Delivery.{preFillWeight, preFillRecordedAt/By, preFillWeightRecordId,
//    *                        plantWorkflowStatus: 'agent_collected_from_customer'}
//    *   - updates Cylinder.{lastMeasuredWeight, lastMeasuredAt, weightHistory}
//    *   - does NOT credit remnant
//    */
//   async recordPreFillWeight({
//     cylinderId,
//     deliveryId,
//     measuredWeight,
//     recordedBy,
//     recordedByRole,
//     gpsCoordinates = null,
//     photos = [],
//     notes = null,
//     req = null,
//   }) {
//     // ---------- VALIDATION ----------
//     if (!cylinderId) throw new ErrorResponse('cylinderId is required', 400);
//     if (!deliveryId) throw new ErrorResponse('deliveryId is required', 400);
//     if (typeof measuredWeight !== 'number' || !Number.isFinite(measuredWeight)) {
//       throw new ErrorResponse('measuredWeight must be a finite number', 400);
//     }
//     if (measuredWeight <= 0) {
//       throw new ErrorResponse('measuredWeight must be > 0', 400);
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       // ---------- LOAD DELIVERY & CYLINDER ----------
//       const delivery = await Delivery.findById(deliveryId).session(session);
//       if (!delivery) throw new ErrorResponse('Delivery not found', 404);

//       const cylinder = await Cylinder.findById(cylinderId).session(session);
//       if (!cylinder || cylinder.isDeleted) {
//         throw new ErrorResponse('Cylinder not found', 404);
//       }

//       if (cylinder.userId.toString() !== delivery.userId.toString()) {
//         throw new ErrorResponse(
//           "Cylinder does not belong to this delivery's customer",
//           400
//         );
//       }

//       if (delivery.cylinderId && delivery.cylinderId.toString() !== cylinderId.toString()) {
//         throw new ErrorResponse(
//           'Cylinder does not match the one assigned to this delivery. Reassign first.',
//           409
//         );
//       }

//       if (cylinder.status === 'retired' || cylinder.status === 'flagged') {
//         throw new ErrorResponse(
//           `Cannot weigh a ${cylinder.status} cylinder`,
//           400
//         );
//       }

//       // ---------- IDEMPOTENCY GUARD ----------
//       // Only one *active* (non-superseded) pre-fill per delivery.
//       const existingActivePreFill = await CylinderWeightRecord.findOne({
//         deliveryId,
//         phase: 'pre_fill',
//         superseded: { $ne: true },
//       }).session(session);

//       if (existingActivePreFill) {
//         throw new ErrorResponse(
//           `Pre-fill weight already recorded for this delivery (${existingActivePreFill.measuredWeight}kg). ` +
//             `Supersede it via retry instead of recording a new pre-fill.`,
//           409
//         );
//       }

//       // ---------- SANITY GUARD ----------
//       const sizeKg = this._parseSizeKg(cylinder.size);
//       if (sizeKg && measuredWeight > sizeKg * 1.5) {
//         throw new ErrorResponse(
//           `Pre-fill weight (${measuredWeight}kg) is implausibly high for a ${cylinder.size} cylinder`,
//           400
//         );
//       }

//       // ---------- CREATE WEIGHT RECORD ----------
//       const [preRecord] = await CylinderWeightRecord.create(
//         [
//           {
//             cylinderId: cylinder._id,
//             tagCode: cylinder.tagCode,
//             userId: cylinder.userId,
//             deliveryId,
//             subscriptionId: delivery.subscriptionId || null,
//             phase: 'pre_fill',
//             measurementType: 'plant_refill_pre',
//             measuredWeight,
//             emptyWeight: cylinder.emptyWeight, // reference only; not used in remnant math
//             calculatedLpg: Math.max(0, +(measuredWeight - cylinder.emptyWeight).toFixed(3)),
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

//       // ---------- UPDATE DELIVERY ----------
//       delivery.preFillWeight = measuredWeight;
//       delivery.preFillRecordedAt = new Date();
//       delivery.preFillRecordedBy = recordedBy;
//       delivery.preFillWeightRecordId = preRecord._id;

//       // Only advance the workflow status if we're still at (or before) this stage.
//       const preFillSafeStatuses = [
//         'not_started',
//         'plant_selected',
//         'request_created',
//         'agent_collected_from_customer',
//       ];
//       if (
//         preFillSafeStatuses.includes(delivery.plantWorkflowStatus) ||
//         !delivery.plantWorkflowStatus
//       ) {
//         delivery.plantWorkflowStatus = 'agent_collected_from_customer';
//       }

//       await delivery.save({ session });

//       // ---------- UPDATE CYLINDER ----------
//       cylinder.lastMeasuredWeight = measuredWeight;
//       cylinder.lastMeasuredAt = new Date();
//       cylinder.weightHistory = [
//         ...(cylinder.weightHistory || []),
//         preRecord._id,
//       ];
//       await cylinder.save({ session });

//       // ---------- AUDIT ----------
//       await AuditService.log({
//         action: 'CYLINDER_PRE_FILL_RECORDED',
//         actorId: recordedBy,
//         actorRole: recordedByRole,
//         entityType: 'Cylinder',
//         entityId: cylinder._id,
//         previousValue: { lastMeasuredWeight: cylinder.lastMeasuredWeight },
//         newValue: {
//           phase: 'pre_fill',
//           measuredWeight,
//           deliveryId,
//           weightRecordId: preRecord._id,
//         },
//         metadata: {
//           deliveryId,
//           cylinderId: cylinder._id,
//           weightRecordId: preRecord._id,
//         },
//         gpsCoordinates,
//         req,
//       });

//       await session.commitTransaction();

//       return {
//         success: true,
//         phase: 'pre_fill',
//         weightRecord: preRecord.toObject(),
//         delivery: delivery.toObject(),
//         cylinder: cylinder.toObject(),
//         remnant: {
//           credit: 0, // no remnant credited at pre-fill
//           note: 'Pre-fill weight recorded. Remnant is credited only at post-fill.',
//         },
//       };
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }

//   // =====================================================
//   // POST-FILL WEIGHING (credits remnant)
//   // =====================================================

//   /**
//    * Record the post-fill weight of a cylinder.
//    * Called when the agent collects the cylinder from the plant, AFTER refill.
//    *
//    * Computes:
//    *   refilledKg      = postFillWeight - preFillWeight
//    *   purchasedKg     = resolvePurchasedKg(delivery, subscription)
//    *   rawRemnant      = purchasedKg - refilledKg
//    *   remnantDeltaKg  = max(0, rawRemnant)  ← what we credit
//    *   overFillKg      = max(0, -rawRemnant) ← diagnostic if plant over-filled
//    *
//    * Side effects:
//    *   - creates a CylinderWeightRecord (phase: post_fill, pairedWeightRecordId: preRecord._id)
//    *   - credits CylinderRemnantLedger via RemnantLedgerService.addMeasurement
//    *   - updates Delivery.{postFillWeight, postFillRecordedAt/By, postFillWeightRecordId,
//    *                        purchasedKg, refilledKg, remnantDeltaKg, overFillKg,
//    *                        remnantLedgerEntryId, plantWorkflowStatus: 'remnant_credited'}
//    *   - updates Cylinder.{lastMeasuredWeight, lastMeasuredAt, weightHistory, remnantLedger}
//    */
//   async recordPostFillWeight({
//     cylinderId,
//     deliveryId,
//     measuredWeight,
//     recordedBy,
//     recordedByRole,
//     gpsCoordinates = null,
//     photos = [],
//     notes = null,
//     req = null,
//   }) {
//     // ---------- VALIDATION ----------
//     if (!cylinderId) throw new ErrorResponse('cylinderId is required', 400);
//     if (!deliveryId) throw new ErrorResponse('deliveryId is required', 400);
//     if (typeof measuredWeight !== 'number' || !Number.isFinite(measuredWeight)) {
//       throw new ErrorResponse('measuredWeight must be a finite number', 400);
//     }
//     if (measuredWeight <= 0) {
//       throw new ErrorResponse('measuredWeight must be > 0', 400);
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       // ---------- LOAD DELIVERY & CYLINDER ----------
//       const delivery = await Delivery.findById(deliveryId).session(session);
//       if (!delivery) throw new ErrorResponse('Delivery not found', 404);

//       const cylinder = await Cylinder.findById(cylinderId).session(session);
//       if (!cylinder || cylinder.isDeleted) {
//         throw new ErrorResponse('Cylinder not found', 404);
//       }

//       if (cylinder.userId.toString() !== delivery.userId.toString()) {
//         throw new ErrorResponse(
//           "Cylinder does not belong to this delivery's customer",
//           400
//         );
//       }

//       if (delivery.cylinderId && delivery.cylinderId.toString() !== cylinderId.toString()) {
//         throw new ErrorResponse(
//           'Cylinder does not match the one assigned to this delivery.',
//           409
//         );
//       }

//       // ---------- REQUIRE A PAIRED PRE-FILL ----------
//       if (!delivery.preFillWeightRecordId || delivery.preFillWeight === null) {
//         throw new ErrorResponse(
//           'Cannot record post-fill weight before pre-fill weight',
//           400
//         );
//       }

//       const preRecord = await CylinderWeightRecord.findById(
//         delivery.preFillWeightRecordId
//       ).session(session);

//       if (!preRecord || preRecord.superseded) {
//         throw new ErrorResponse(
//           'Paired pre-fill record is missing or superseded — re-record pre-fill first',
//           409
//         );
//       }

//       const preFillWeight = preRecord.measuredWeight;

//       // ---------- IDEMPOTENCY GUARD ----------
//       if (delivery.postFillWeightRecordId) {
//         throw new ErrorResponse(
//           'Post-fill weight already recorded for this delivery',
//           409
//         );
//       }

//       // ---------- PHYSICAL GUARD ----------
//       if (measuredWeight < preFillWeight) {
//         throw new ErrorResponse(
//           'Post-fill weight must be ≥ pre-fill weight',
//           400
//         );
//       }

//       const sizeKg = this._parseSizeKg(cylinder.size);
//       if (sizeKg && measuredWeight > sizeKg * 1.5) {
//         throw new ErrorResponse(
//           `Post-fill weight (${measuredWeight}kg) is implausibly high for a ${cylinder.size} cylinder`,
//           400
//         );
//       }

//       // ---------- RESOLVE PURCHASED KG ----------
//       let subscription = null;
//       if (delivery.subscriptionId) {
//         subscription = await Subscription.findById(delivery.subscriptionId)
//           .select('size')
//           .session(session)
//           .lean();
//       }

//       const purchasedKg = resolvePurchasedKg(delivery, subscription);
//       if (purchasedKg === null) {
//         throw new ErrorResponse(
//           'Cannot determine purchased quantity for this delivery (requestedKg / planDetails.size / subscription.size all missing)',
//           400
//         );
//       }

//       // ---------- COMPUTE REMNANT ----------
//       const refilledKg = +(measuredWeight - preFillWeight).toFixed(3);
//       const rawRemnant = +(purchasedKg - refilledKg).toFixed(3);
//       const remnantDeltaKg = Math.max(0, rawRemnant);
//       const overFillKg = rawRemnant < 0 ? Math.abs(rawRemnant) : 0;

//       // ---------- CREATE POST-FILL RECORD ----------
//       const [postRecord] = await CylinderWeightRecord.create(
//         [
//           {
//             cylinderId: cylinder._id,
//             tagCode: cylinder.tagCode,
//             userId: cylinder.userId,
//             deliveryId,
//             subscriptionId: delivery.subscriptionId || null,
//             phase: 'post_fill',
//             measurementType: 'plant_refill_post',
//             pairedWeightRecordId: preRecord._id,
//             measuredWeight,
//             emptyWeight: cylinder.emptyWeight, // reference only
//             calculatedLpg: Math.max(0, +(measuredWeight - cylinder.emptyWeight).toFixed(3)),
//             remnantDeltaKg,
//             purchasedKg,
//             refilledKg,
//             overFillKg,
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

//       // ---------- CREDIT REMNANT LEDGER ----------
//       let ledgerResult = null;

//       if (remnantDeltaKg >= 0.01) {
//         ledgerResult = await RemnantLedgerService.addMeasurement({
//           userId: cylinder.userId,
//           cylinderId: cylinder._id,
//           cylinderTag: cylinder.tagCode,
//           delta: remnantDeltaKg,
//           // Legacy fields — keep their meaning aligned with the new model:
//           measuredWeight,       // = postFill
//           emptyWeight: preFillWeight, // = preFill
//           physicalRemnant: refilledKg,
//           weightRecordId: postRecord._id,
//           deliveryId,
//           performedBy: recordedBy,
//           performedByRole: recordedByRole,
//           metadata: {
//             phase: 'post_fill',
//             purchasedKg,
//             refilledKg,
//             remnantDeltaKg,
//             overFillKg,
//             preWeightRecordId: preRecord._id,
//             preFillWeight,
//             postFillWeight: measuredWeight,
//           },
//           req,
//           session, // reuse the outer session — do not open a new one
//         });

//         // Link the ledger entry to the post-fill weight record
//         postRecord.remnantLedgerEntryId = ledgerResult.entry._id;
//         await postRecord.save({ session });
//       }

//       // ---------- UPDATE DELIVERY ----------
//       delivery.postFillWeight = measuredWeight;
//       delivery.postFillRecordedAt = new Date();
//       delivery.postFillRecordedBy = recordedBy;
//       delivery.postFillWeightRecordId = postRecord._id;
//       delivery.purchasedKg = purchasedKg;
//       delivery.refilledKg = refilledKg;
//       delivery.remnantDeltaKg = remnantDeltaKg;
//       delivery.overFillKg = overFillKg > 0 ? overFillKg : null;

//       if (ledgerResult) {
//         delivery.remnantLedgerEntryId = ledgerResult.entry._id;
//       }

//       delivery.plantWorkflowStatus = 'remnant_credited';

//       await delivery.save({ session });

//       // ---------- UPDATE CYLINDER ----------
//       cylinder.lastMeasuredWeight = measuredWeight;
//       cylinder.lastMeasuredAt = new Date();
//       cylinder.weightHistory = [
//         ...(cylinder.weightHistory || []),
//         postRecord._id,
//       ];
//       if (ledgerResult) {
//         cylinder.remnantLedger = [
//           ...(cylinder.remnantLedger || []),
//           ledgerResult.entry._id,
//         ];
//       }
//       await cylinder.save({ session });

//       // ---------- AUDIT ----------
//       await AuditService.log({
//         action: 'CYLINDER_POST_FILL_RECORDED',
//         actorId: recordedBy,
//         actorRole: recordedByRole,
//         entityType: 'Cylinder',
//         entityId: cylinder._id,
//         previousValue: { lastMeasuredWeight: cylinder.lastMeasuredWeight },
//         newValue: {
//           phase: 'post_fill',
//           preFillWeight,
//           postFillWeight: measuredWeight,
//           purchasedKg,
//           refilledKg,
//           remnantDeltaKg,
//           overFillKg,
//           deliveryId,
//           weightRecordId: postRecord._id,
//           ledgerEntryId: ledgerResult?.entry._id || null,
//         },
//         metadata: {
//           deliveryId,
//           cylinderId: cylinder._id,
//           preWeightRecordId: preRecord._id,
//           postWeightRecordId: postRecord._id,
//         },
//         gpsCoordinates,
//         req,
//       });

//       await session.commitTransaction();

//       // ---------- ELIGIBILITY SNAPSHOT (after commit) ----------
//       const eligibility = await RemnantLedgerService.checkEligibility(
//         cylinder.userId
//       );

//       return {
//         success: true,
//         phase: 'post_fill',
//         weightRecord: postRecord.toObject(),
//         delivery: delivery.toObject(),
//         cylinder: cylinder.toObject(),
//         remnant: {
//           preFillWeight,
//           postFillWeight: measuredWeight,
//           purchasedKg,
//           refilledKg,
//           remnantDeltaKg,
//           overFillKg,
//           ledgerEntryId: ledgerResult?.entry._id || null,
//           previousBalance: ledgerResult?.previousBalance ?? null,
//           newBalance: ledgerResult?.newBalance ?? eligibility.balance,
//           eligibleForDelivery: eligibility.eligible,
//           minimumRequired: eligibility.minimumRequired,
//         },
//       };
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }

//   // =====================================================
//   // LEGACY (kept for old code paths — audit / registration / customer_delivery)
//   // =====================================================

//   /**
//    * Legacy single-measurement weigh.
//    * Retained for audit / registration / customer_delivery flows.
//    * NOT used by the plant refill workflow anymore.
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
//     if (!cylinderId) throw new ErrorResponse('cylinderId is required', 400);
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
//       const cylinder = await Cylinder.findById(cylinderId).session(session);
//       if (!cylinder || cylinder.isDeleted) {
//         throw new ErrorResponse('Cylinder not found', 404);
//       }
//       if (cylinder.status === 'retired') {
//         throw new ErrorResponse('Cannot weigh a retired cylinder', 400);
//       }
//       if (cylinder.status === 'flagged') {
//         throw new ErrorResponse(
//           'Cannot weigh a flagged cylinder. Escalate to E-GAS.',
//           400
//         );
//       }

//       const emptyWeight = cylinder.emptyWeight;
//       const TOLERANCE = 0.05;
//       if (measuredWeight < emptyWeight - TOLERANCE) {
//         throw new ErrorResponse(
//           `Measured weight (${measuredWeight}kg) is less than registered empty weight (${emptyWeight}kg).`,
//           400
//         );
//       }

//       const calculatedLpg = Math.max(
//         0,
//         +(measuredWeight - emptyWeight).toFixed(3)
//       );

//       const sizeKg = this._parseSizeKg(cylinder.size);
//       if (sizeKg && calculatedLpg > sizeKg + 0.5) {
//         throw new ErrorResponse(
//           `Measured LPG (${calculatedLpg}kg) exceeds cylinder size (${sizeKg}kg).`,
//           400
//         );
//       }

//       const [weightRecord] = await CylinderWeightRecord.create(
//         [
//           {
//             cylinderId: cylinder._id,
//             tagCode: cylinder.tagCode,
//             userId: cylinder.userId,
//             deliveryId,
//             subscriptionId,
//             plantRefillRequestId,
//             phase: 'standalone',
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

//       // Legacy remnant credit for customer_delivery / registration / audit.
//       // NOTE: This uses old tare math. Kept for backwards compatibility only.
//       let ledgerResult = null;
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
//           metadata: { measurementType, legacy: true },
//           req,
//           session,
//         });

//         cylinder.remnantLedger = [
//           ...(cylinder.remnantLedger || []),
//           ledgerResult.entry._id,
//         ];
//       }

//       cylinder.lastMeasuredWeight = measuredWeight;
//       cylinder.lastMeasuredAt = new Date();
//       cylinder.weightHistory = [
//         ...(cylinder.weightHistory || []),
//         weightRecord._id,
//       ];
//       await cylinder.save({ session });

//       await AuditService.log({
//         action: 'CYLINDER_WEIGHT_RECORDED',
//         actorId: recordedBy,
//         actorRole: recordedByRole,
//         entityType: 'Cylinder',
//         entityId: cylinder._id,
//         previousValue: { lastMeasuredWeight: cylinder.lastMeasuredWeight },
//         newValue: { measuredWeight, calculatedLpg },
//         metadata: {
//           weightRecordId: weightRecord._id,
//           deliveryId,
//           plantRefillRequestId,
//           measurementType,
//           legacy: true,
//         },
//         gpsCoordinates,
//         req,
//       });

//       if (ownsSession) await session.commitTransaction();

//       const minimumKg = await ConfigService.getConfig(
//         'MINIMUM_REMNANT_DELIVERY_KG',
//         6
//       );
//       const currentBalance =
//         ledgerResult?.newBalance ??
//         (await RemnantLedgerService.getUserBalance(cylinder.userId));

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
//           legacy: true,
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























// services/cylinderWeightService.js

const mongoose = require('mongoose');
const Cylinder = require('../models/Cylinder');
const CylinderWeightRecord = require('../models/CylinderWeightRecord');
const Delivery = require('../models/Delivery');
const Subscription = require('../models/Subscription');
const ErrorResponse = require('../utils/errorResponse');
const AuditService = require('./auditService');
const RemnantLedgerService = require('./remnantLedgerService');
const ConfigService = require('./configService');

/**
 * CylinderWeightService
 * ---------------------
 * Records weight measurements and credits remnant when the plant under-fills.
 *
 * REMNANT MODEL (authoritative):
 *
 *   purchasedKg  = customer's plan cylinder size (e.g. 12.5 for "12.5kg")
 *   preFillKg    = physical reading when agent collects from customer
 *   postFillKg   = physical reading when agent collects from plant
 *   refilledKg   = postFillKg − preFillKg          ← what plant actually added
 *   remnantDelta = max(0, purchasedKg − refilledKg)
 *
 * TARE WEIGHT (cylinder.emptyWeight) is NEVER used in remnant math.
 * It can drift (rust, dirt, valve changes) and is preserved only as:
 *   - registration metadata
 *   - a sanity ceiling in the physical-reality guard for `refilledKg`
 *
 * Two workflows share this service:
 *   - Delivery (agent): pre-fill → post-fill → remnant credit
 *   - Standalone weigh: audit / customer_delivery / registration
 *     (NO remnant credit — see `recordWeight` below)
 */
class CylinderWeightService {
  // =====================================================
  // PRE-FILL WEIGHING (no remnant credit)
  // =====================================================

  /**
   * Record the pre-fill weight of a cylinder.
   *
   * Called when the agent collects the cylinder from the customer,
   * BEFORE going to the plant.
   *
   * This is a **delta anchor** — the post-fill measurement will be
   * compared against this value to determine what the plant added.
   *
   * Tare weight is stored as reference only. It is NOT used to
   * compute any derived value.
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
    // ── VALIDATION ──
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
      // ── LOAD DELIVERY & CYLINDER ──
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

      // ── GUARD: cylinder must match the one assigned to this delivery ──
      if (
        delivery.cylinderId &&
        delivery.cylinderId.toString() !== cylinderId.toString()
      ) {
        throw new ErrorResponse(
          'Cylinder does not match the one assigned to this delivery. Reassign first.',
          409
        );
      }

      // ── IDEMPOTENCY GUARD ──
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

      // ── PHYSICAL-REALITY GUARD (not tare math) ──
      // A pre-fill reading of 0 is impossible for a real cylinder.
      // Very low readings suggest a scale or cylinder issue.
      // We only sanity-check against 0 — we do NOT compare to tare.
      // const MIN_PLAUSIBLE = 0.5; // kg — any real cylinder weighs more
      // if (measuredWeight < MIN_PLAUSIBLE) {
      //   throw new ErrorResponse(
      //     `Pre-fill weight (${measuredWeight}kg) is implausibly low. Verify the scale.`,
      //     400
      //   );
      // }

      // const sizeKg = this._parseSizeKg(cylinder.size);
      // if (sizeKg && measuredWeight > sizeKg * 2) {
      //   throw new ErrorResponse(
      //     `Pre-fill weight (${measuredWeight}kg) is more than twice the cylinder's ${cylinder.size} rated capacity. Verify the scale or cylinder.`,
      //     400
      //   );
      // }

      this._validateGrossWeight(measuredWeight, cylinder, { context: 'Pre-fill' });

      // ── CREATE PRE-FILL RECORD ──
      // calculatedLpg is stored for legacy/audit compatibility only.
      // It is computed as measured − registered tare, but it is NOT
      // the source of truth for anything — it is informational.
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
            emptyWeight: cylinder.emptyWeight, // reference only — never used in math
            calculatedLpg: null, // deprecated — DO NOT compute from tare
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

      // ── UPDATE DELIVERY ──
      delivery.preFillWeight = measuredWeight;
      delivery.preFillRecordedAt = new Date();
      delivery.preFillRecordedBy = recordedBy;
      delivery.preFillWeightRecordId = preRecord._id;

      // Advance workflow only if we're still at (or before) this stage
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

      // ── UPDATE CYLINDER (last measured only, no derived fields) ──
      cylinder.lastMeasuredWeight = measuredWeight;
      cylinder.lastMeasuredAt = new Date();
      cylinder.weightHistory = [
        ...(cylinder.weightHistory || []),
        preRecord._id,
      ];
      await cylinder.save({ session });

      // ── AUDIT ──
      await AuditService.log({
        action: 'CYLINDER_PRE_FILL_RECORDED',
        actorId: recordedBy,
        actorRole: recordedByRole,
        entityType: 'Cylinder',
        entityId: cylinder._id,
        newValue: {
          phase: 'pre_fill',
          measuredWeight,
          deliveryId,
          weightRecordId: preRecord._id,
          note: 'Delta anchor — remnant is computed at post-fill only',
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
          credit: 0,
          note: 'Pre-fill weight recorded. Remnant is calculated only at post-fill.',
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
   *
   * Called when the agent collects the cylinder from the plant, AFTER refill.
   *
   * Computation:
   *   refilledKg     = postFillWeight − preFillWeight
   *   purchasedKg    = planSizeKg (from delivery.planDetails.size)
   *   remnantDeltaKg = max(0, purchasedKg − refilledKg)
   *   overFillKg     = max(0, refilledKg − purchasedKg)   ← diagnostic only
   *
   * Tare weight is stored on the record for reference but NOT used
   * in any calculation.
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
    // ── VALIDATION ──
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
      // ── LOAD DELIVERY & CYLINDER ──
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

      if (
        delivery.cylinderId &&
        delivery.cylinderId.toString() !== cylinderId.toString()
      ) {
        throw new ErrorResponse(
          'Cylinder does not match the one assigned to this delivery.',
          409
        );
      }

      // ── REQUIRE PAIRED PRE-FILL ──
      if (
        !delivery.preFillWeightRecordId ||
        delivery.preFillWeight === null ||
        delivery.preFillWeight === undefined
      ) {
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

      // ── IDEMPOTENCY GUARD ──
      if (delivery.postFillWeightRecordId) {
        throw new ErrorResponse(
          'Post-fill weight already recorded for this delivery',
          409
        );
      }

      // ── PHYSICAL-REALITY GUARD (not tare math) ──
      if (measuredWeight < preFillWeight) {
        throw new ErrorResponse(
          'Post-fill weight must be ≥ pre-fill weight',
          400
        );
      }

      // ── RESOLVE PURCHASED KG FROM PLAN ──
      // The authoritative source is the plan's cylinder size.
      // delivery.purchasedKg is a legacy fallback only.
      let subscription = null;
      if (delivery.subscriptionId) {
        subscription = await Subscription.findById(delivery.subscriptionId)
          .select('size')
          .session(session)
          .lean();
      }

      const purchasedKg = this._resolvePurchasedKg(delivery, subscription);
      if (purchasedKg === null) {
        throw new ErrorResponse(
          'Cannot determine purchased quantity for this delivery ' +
            '(planDetails.size / subscription.size / requestedKg all missing)',
          400
        );
      }

      // ── COMPUTE REFILL DELTA ──
      // This is what the plant actually added.
      const refilledKg = +(measuredWeight - preFillWeight).toFixed(3);

      // ── PHYSICAL-REALITY SANITY ──
      // If the plant somehow added far more than the plan size + a
      // generous tolerance, something is wrong with the reading.
      // Not remnant — just a data-quality guard.
      // const OVERSIZE_TOLERANCE_KG = 5;
      // if (refilledKg > purchasedKg + OVERSIZE_TOLERANCE_KG) {
      //   throw new ErrorResponse(
      //     `Refill delta (${refilledKg}kg) is implausibly large for a ${purchasedKg}kg plan. Verify the measurements.`,
      //     400
      //   );
      // }

      this._validateGrossWeight(measuredWeight, cylinder, { context: 'Post-fill' });

      // ── COMPUTE REMNANT ──
      // Remnant = what the plant failed to deliver.
      const rawRemnant = +(purchasedKg - refilledKg).toFixed(3);
      const remnantDeltaKg = Math.max(0, rawRemnant);
      const overFillKg = rawRemnant < 0 ? Math.abs(rawRemnant) : 0;

      // ── CREATE POST-FILL RECORD ──
      // Tare is stored for reference, marked clearly as evidence-only.
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
            emptyWeight: cylinder.emptyWeight, // reference only — never used in math
            calculatedLpg: null, // deprecated — DO NOT compute from tare
            remnantDeltaKg,
            purchasedKg,
            refilledKg,
            overFillKg,
            recordedBy,
            recordedByRole,
            gpsCoordinates,
            photos,
            notes,
            metadata: {
              remnantBasis: 'plan_size_minus_refill_delta',
              tareUsedInMath: false,
            },
            createdAt: new Date(),
          },
        ],
        { session }
      );

      // ── CREDIT REMNANT LEDGER ──
      let ledgerResult = null;

      if (remnantDeltaKg >= 0.01) {
        ledgerResult = await RemnantLedgerService.addMeasurement({
          userId: cylinder.userId,
          cylinderId: cylinder._id,
          cylinderTag: cylinder.tagCode,
          delta: remnantDeltaKg,
          // Legacy ledger fields:
          //   measuredWeight  = postFill (the anchor reading)
          //   emptyWeight     = preFill (the delta anchor — NOT tare)
          //   physicalRemnant = refilledKg (what plant added)
          // These field names are legacy; their meaning in the ledger is:
          measuredWeight,
          emptyWeight: preFillWeight, // ← pre-fill, NOT tare
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
            remnantBasis: 'plan_size_minus_refill_delta',
          },
          req,
          session,
        });

        postRecord.remnantLedgerEntryId = ledgerResult.entry._id;
        await postRecord.save({ session });
      }

      // ── UPDATE DELIVERY ──
      delivery.postFillWeight = measuredWeight;
      delivery.postFillRecordedAt = new Date();
      delivery.postFillRecordedBy = recordedBy;
      delivery.postFillWeightRecordId = postRecord._id;
      delivery.purchasedKg = purchasedKg; // normalized — from plan
      delivery.refilledKg = refilledKg;
      delivery.remnantDeltaKg = remnantDeltaKg;
      delivery.overFillKg = overFillKg > 0 ? overFillKg : null;

      if (ledgerResult) {
        delivery.remnantLedgerEntryId = ledgerResult.entry._id;
      }

      delivery.plantWorkflowStatus = 'remnant_credited';
      await delivery.save({ session });

      // ── UPDATE CYLINDER (last measured + ledger pointer only) ──
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

      // ── AUDIT ──
      await AuditService.log({
        action: 'CYLINDER_POST_FILL_RECORDED',
        actorId: recordedBy,
        actorRole: recordedByRole,
        entityType: 'Cylinder',
        entityId: cylinder._id,
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
          remnantBasis: 'plan_size_minus_refill_delta',
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

      // ── ELIGIBILITY SNAPSHOT ──
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
          basis: 'plan_size_minus_refill_delta',
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
  // STANDALONE WEIGH (NO REMNANT CREDIT)
  // =====================================================

  /**
   * Record a standalone weight measurement.
   *
   * Used for: audit, registration, customer_delivery (legacy)
   *
   * IMPORTANT: this does NOT credit remnant.
   *
   * Reason: standalone weighs are snapshots in time, not part of a
   * delivery workflow. There is no plan size, no pre/post delta,
   * and no plant responsibility to measure. Crediting remnant from
   * a single measurement would require inferring "content" — which
   * we explicitly refuse to do from tare weight.
   *
   * If an audit discovers a physical issue that should result in
   * a credit, that goes through an admin adjustment (RemnantLedgerService
   * `creditRemnant` / `adjustment`) — not through this method.
   */
  async recordWeight({
    cylinderId,
    measuredWeight,
    recordedBy,
    recordedByRole,
    deliveryId = null,
    subscriptionId = null,
    plantRefillRequestId = null,
    measurementType = 'audit',
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

      // ── PHYSICAL-REALITY GUARD (no tare reference) ──
      // const MIN_PLAUSIBLE = 0.5;
      // if (measuredWeight < MIN_PLAUSIBLE) {
      //   throw new ErrorResponse(
      //     `Measured weight (${measuredWeight}kg) is implausibly low. Verify the scale.`,
      //     400
      //   );
      // }

      // const sizeKg = this._parseSizeKg(cylinder.size);
      // if (sizeKg && measuredWeight > sizeKg * 2) {
      //   throw new ErrorResponse(
      //     `Measured weight (${measuredWeight}kg) is more than twice the cylinder's ${cylinder.size} rated capacity.`,
      //     400
      //   );
      // }

      this._validateGrossWeight(measuredWeight, cylinder, { context: 'Weighing' });
      // const calculatedLpg = Math.max(0, +(measuredWeight - emptyWeight).toFixed(3));

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
            emptyWeight: cylinder.emptyWeight, // reference only
            calculatedLpg: null, // never computed from tare
            recordedBy,
            recordedByRole,
            gpsCoordinates,
            photos,
            notes,
            metadata: {
              remnantCredited: false,
              note: 'Standalone weigh — no remnant math. Use admin adjustment for credits.',
            },
            createdAt: new Date(),
          },
        ],
        { session }
      );

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
        newValue: { measuredWeight, measurementType },
        metadata: {
          weightRecordId: weightRecord._id,
          deliveryId,
          plantRefillRequestId,
          measurementType,
          remnantCredited: false,
        },
        gpsCoordinates,
        req,
      });

      if (ownsSession) await session.commitTransaction();

      const currentBalance = await RemnantLedgerService.getUserBalance(
        cylinder.userId
      );

      return {
        success: true,
        cylinder: cylinder.toObject(),
        weightRecord: weightRecord.toObject(),
        ledger: null, // never written by standalone weigh
        remnant: {
          measuredWeight,
          currentAccumulatedBalance: currentBalance,
          remnantCredited: false,
          note: 'Standalone weigh does not credit remnant.',
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

  /**
   * Resolve the customer's purchased quantity for this delivery.
   *
   * Priority:
   *   1. Remnant-only delivery → delivery.requestedKg
   *   2. Plan cylinder size → delivery.planDetails.size (parsed)
   *   3. Subscription size → subscription.size (parsed)
   *   4. Legacy fallback → delivery.purchasedKg
   *
   * NOTE: Tare weight is NOT a source. The customer's purchase is
   * defined by their plan, not by physical cylinder weight.
   */
  _resolvePurchasedKg(delivery, subscription = null) {
    if (!delivery) return null;

    // 1. Remnant-only delivery
    const isRemnantOnly =
      delivery.isRemnantDelivery || delivery.isOneTimeRemnantDelivery;

    if (
      isRemnantOnly &&
      typeof delivery.requestedKg === 'number' &&
      Number.isFinite(delivery.requestedKg) &&
      delivery.requestedKg > 0
    ) {
      return +delivery.requestedKg.toFixed(3);
    }

    // 2. Plan size
    const fromPlan = this._parseSizeKg(delivery.planDetails?.size);
    if (fromPlan !== null && fromPlan > 0) return +fromPlan.toFixed(3);

    // 3. Subscription size
    if (subscription) {
      const fromSub = this._parseSizeKg(subscription.size);
      if (fromSub !== null && fromSub > 0) return +fromSub.toFixed(3);
    }

    // 4. Legacy field
    if (
      typeof delivery.purchasedKg === 'number' &&
      Number.isFinite(delivery.purchasedKg) &&
      delivery.purchasedKg > 0
    ) {
      return +delivery.purchasedKg.toFixed(3);
    }

    return null;
  }

  /**
   * Parse a kg-ish string ("12.5kg", "12.5 kg", 12.5) to number.
   */
  _parseSizeKg(sizeStr) {
    if (sizeStr === null || sizeStr === undefined) return null;
    if (typeof sizeStr === 'number') {
      return Number.isFinite(sizeStr) && sizeStr > 0 ? sizeStr : null;
    }
    const match = String(sizeStr).match(/(\d+(\.\d+)?)/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    return Number.isFinite(num) && num > 0 ? num : null;
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

/**
 * Validate a GROSS weight (cylinder + gas) against the cylinder's tare
 * and capacity.
 *
 *  - Gross weight is what the scale reads: cylinder + whatever gas is
 *    inside. It is NOT the gas alone.
 *  - Capacity (cylinder.size, e.g. "6kg") is how much gas the cylinder
 *    can HOLD, not how much the cylinder WEIGHS.
 *
 * Physical bounds:
 *   min: tare - small tolerance (never below the empty cylinder)
 *   max: tare + capacity + tolerance (empty + full, allowing for a
 *        slightly overfilled cylinder or imprecise scale)
 *
 * We deliberately do NOT reject anything above capacity+tolerance —
 * that would reject every legitimate full cylinder.
 * We only reject:
 *   - non-finite / non-positive numbers
 *   - gross weight below the empty tare (impossible)
 *   - gross weight beyond tare + capacity + a generous 2kg headroom
 *     (catches obvious typos, e.g. 150 instead of 15)
 */
_validateGrossWeight(measuredWeight, cylinder, { context = 'weighing' } = {}) {
  if (typeof measuredWeight !== 'number' || !Number.isFinite(measuredWeight)) {
    throw new ErrorResponse('measuredWeight must be a finite number', 400);
  }
  if (measuredWeight <= 0) {
    throw new ErrorResponse('measuredWeight must be > 0', 400);
  }

  const tare = Number(cylinder.emptyWeight);
  const capacity = this._parseSizeKg(cylinder.size); // nullable

  // Tare is authoritative; if it's missing, skip the physical bounds.
  if (!Number.isFinite(tare) || tare <= 0) {
    return;
  }

  const LOWER_TOLERANCE = 0.5;   // scale tolerance below tare
  const UPPER_HEADROOM = 2.0;    // allow overfill / scale variance above (tare + capacity)

  // Cannot weigh less than an empty cylinder (minus scale tolerance)
  if (measuredWeight < tare - LOWER_TOLERANCE) {
    throw new ErrorResponse(
      `${context}: measured gross weight (${measuredWeight}kg) is below ` +
      `the cylinder's registered empty weight (${tare}kg). ` +
      `Check the cylinder tag or verify the measurement.`,
      400
    );
  }

  // If we know capacity, allow up to tare + capacity + headroom.
  // DO NOT reject anything within this range, even if it exceeds capacity —
  // a full cylinder's gross weight is always greater than its gas capacity.
  if (capacity && capacity > 0) {
    const maxReasonableGross = tare + capacity + UPPER_HEADROOM;
    if (measuredWeight > maxReasonableGross) {
      throw new ErrorResponse(
        `${context}: measured gross weight (${measuredWeight}kg) exceeds ` +
        `the physical maximum for a ${cylinder.size} cylinder ` +
        `(tare ${tare}kg + capacity ${capacity}kg + ${UPPER_HEADROOM}kg headroom ` +
        `= ${maxReasonableGross}kg). Verify the reading (is the unit correct?).`,
        400
      );
    }
  }
}
}

module.exports = new CylinderWeightService();