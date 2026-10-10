const mongoose = require('mongoose');
const PlantRefillRequest = require('../models/PlantRefillRequest');
const PlantRefillTransaction = require('../models/PlantRefillTransaction');
const PlantInspection = require('../models/PlantInspection');
const PartnerPlant = require('../models/PartnerPlant');
const Delivery = require('../models/Delivery');
const Cylinder = require('../models/Cylinder');
const ErrorResponse = require('../utils/errorResponse');
const AuditService = require('./auditService');
const PlantService = require('./plantService');
const CylinderService = require('./cylinderService');
const ConfigService = require('./configService');
const RemnantLedgerService = require('./remnantLedgerService');
const {
  generateRequestNumber,
  generateTransactionNumber,
} = require('../utils/idGenerators');

/**
 * PlantRefillService
 * ------------------
 * Handles the entire plant refill workflow:
 *   createRequest → receiveCylinder → (InspectionService) →
 *   recordQuantity → confirmRefill → collectFromPlant
 *
 * CRITICAL:
 *   - Never modifies Delivery.status or Order.status.
 *   - Idempotent confirmation.
 *   - Immutable quantities.
 */
class PlantRefillService {
  // =====================================================
  // READ
  // =====================================================

  async getById(requestId, { populate = true } = {}) {
    let query = PlantRefillRequest.findById(requestId);

    if (populate) {
      query = query
        .populate('deliveryId', 'deliveryDate status plantWorkflowStatus address')
        .populate('customerId', 'firstName lastName phone email')
        .populate('agentId', 'firstName lastName phone')
        .populate('plantId', 'name code status city state operatingHours')
        .populate('cylinderId', 'tagCode size emptyWeight status')
        .populate('transactionId');
    }

    const request = await query.lean();
    if (!request) throw new ErrorResponse('Refill request not found', 404);
    return request;
  }

  async listByPlant(plantId, filter = {}, { page = 1, limit = 20, sort = { createdAt: -1 } } = {}) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      PlantRefillRequest.find({ plantId, ...filter })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('agentId', 'firstName lastName phone')
        .populate('cylinderId', 'tagCode size')
        .populate('plantId', 'name code')
        .lean(),
      PlantRefillRequest.countDocuments({ plantId, ...filter }),
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

  async listByAgent(agentId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      PlantRefillRequest.find({ agentId, ...filter })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('plantId', 'name code status')
        .populate('cylinderId', 'tagCode size')
        .lean(),
      PlantRefillRequest.countDocuments({ agentId, ...filter }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // =====================================================
  // WRITE — CREATE REQUEST
  // =====================================================

  async createRequest({
    deliveryId,
    cylinderId,
    plantId,
    requestedQuantity,
    agentReportedQuantity = null,
    agentNotes = null,
    gpsAtRequest = null,
    agentId,
    agentRole,
    req = null,
  }) {
    if (!deliveryId || !cylinderId || !plantId || !requestedQuantity) {
      throw new ErrorResponse(
        'deliveryId, cylinderId, plantId, and requestedQuantity are required',
        400
      );
    }

    if (requestedQuantity <= 0) {
      throw new ErrorResponse('requestedQuantity must be positive', 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Load delivery (must belong to agent)
      const delivery = await Delivery.findById(deliveryId).session(session);
      if (!delivery) {
        throw new ErrorResponse('Delivery not found', 404);
      }

      // Only assigned agent or admin can act on this delivery
      const isOwner = delivery.deliveryAgent?.toString() === agentId.toString();
      const isAdmin = agentRole === 'admin' || agentRole?.startsWith('super');
      if (!isOwner && !isAdmin) {
        throw new ErrorResponse('You are not the assigned agent for this delivery', 403);
      }

      // 2. Load cylinder
      const cylinder = await Cylinder.findById(cylinderId).session(session);
      if (!cylinder || cylinder.isDeleted) {
        throw new ErrorResponse('Cylinder not found', 404);
      }

      if (cylinder.userId.toString() !== delivery.userId.toString()) {
        throw new ErrorResponse('Cylinder does not belong to this delivery\'s customer', 400);
      }

      // 3. Load plant
      const plant = await PartnerPlant.findOne({
        _id: plantId,
        isDeleted: false,
      }).session(session);
      if (!plant) {
        throw new ErrorResponse('Plant not found', 404);
      }
      if (plant.status !== 'active') {
        throw new ErrorResponse(`Plant is not active (status: ${plant.status})`, 400);
      }

      // 4. Guard: prevent duplicate active request on the same delivery
      const existingActive = await PlantRefillRequest.findOne({
        deliveryId,
        status: {
          $nin: ['rejected', 'cancelled', 'settled'],
        },
      }).session(session);

      if (existingActive) {
        throw new ErrorResponse(
          `A refill request already exists for this delivery (${existingActive.requestNumber}, status: ${existingActive.status})`,
          409
        );
      }

      // 5. Fetch current price (snapshot)
      const price = await PlantService.getActivePrice(plant._id, session);

      // 6. Generate request number
      const requestNumber = await generateRequestNumber();

      // 7. Compute remnant snapshot from latest cylinder state
      const emptyWeight = cylinder.emptyWeight;
      const measuredWeight = cylinder.lastMeasuredWeight ?? emptyWeight;
      const calculatedRemnant = Math.max(
        0,
        +(measuredWeight - emptyWeight).toFixed(3)
      );

      // 8. Create request
      const [request] = await PlantRefillRequest.create(
        [
          {
            requestNumber,
            deliveryId,
            subscriptionId: delivery.subscriptionId || null,
            customerId: delivery.userId,
            agentId,
            plantId: plant._id,

            cylinderId: cylinder._id,
            cylinderTag: cylinder.tagCode,
            cylinderSize: cylinder.size,
            emptyWeight,
            measuredWeight,
            calculatedRemnant,

            requestedQuantity,
            agentReportedQuantity,
            pricePerKg: price?.pricePerKg ?? null,
            priceAgreementId: price?._id ?? null,

            status: 'created',
            agentNotes,
            gpsAtRequest: gpsAtRequest
              ? { type: 'Point', coordinates: gpsAtRequest.coordinates.map(Number) }
              : undefined,

            attemptNumber: 1,
            previousRequestId: null,
          },
        ],
        { session }
      );

      // 9. Update delivery workflow (do NOT touch delivery.status)
      delivery.plantWorkflowStatus = 'request_created';
      delivery.plantRefillRequestId = request._id;
      delivery.cylinderId = cylinder._id;
      delivery.cylinderTag = cylinder.tagCode;
      delivery.cylinderTareWeight = emptyWeight;
      delivery.measuredWeight = measuredWeight;
      delivery.calculatedRemnant = calculatedRemnant;
      await delivery.save({ session });

      // 10. Audit
      await AuditService.log({
        action: 'PLANT_REFILL_REQUEST_CREATED',
        actorId: agentId,
        actorRole: req.user.role,
        entityType: 'PlantRefillRequest',
        entityId: request._id,
        newValue: {
          requestNumber,
          plantId,
          requestedQuantity,
          cylinderTag: cylinder.tagCode,
        },
        metadata: {
          deliveryId,
          plantId,
          cylinderId,
        },
        req,
      });

      await session.commitTransaction();

      return {
        success: true,
        request: request.toObject(),
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // WRITE — RECEIVE CYLINDER AT PLANT
  // =====================================================

  async receiveCylinder({
    requestId,
    plantStaffId,
    plantStaffRole,
    plantId,
    gpsCoordinates = null,
    req = null,
  }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Atomic claim: only transition from 'created' → 'received'
      const request = await PlantRefillRequest.findOneAndUpdate(
        { _id: requestId, plantId, status: 'created' },
        {
          $set: {
            status: 'received',
            receivedBy: plantStaffId,
            receivedAt: new Date(),
          },
        },
        { new: true, session }
      );

      if (!request) {
        // Either not found, or already claimed (concurrency guard)
        const existing = await PlantRefillRequest.findById(requestId).session(session);
        if (!existing) {
          throw new ErrorResponse('Refill request not found', 404);
        }
        if (existing.plantId.toString() !== plantId.toString()) {
          throw new ErrorResponse('Not authorized to access this request', 403);
        }
        throw new ErrorResponse(
          `Request cannot be received (current status: ${existing.status})`,
          409
        );
      }

      // 2. Create PlantRefillTransaction
      const transactionNumber = await generateTransactionNumber();

      const [transaction] = await PlantRefillTransaction.create(
        [
          {
            transactionNumber,
            requestId: request._id,
            plantId,
            cylinderId: request.cylinderId,
            cylinderTag: request.cylinderTag,
            requestedQuantity: request.requestedQuantity,
            pricePerKg: request.pricePerKg,
            plantStaffId,
            status: 'received',
            receivedAt: new Date(),
          },
        ],
        { session }
      );

      // 3. Link
      request.transactionId = transaction._id;
      await request.save({ session });

      // 4. Update cylinder custody: agent → plant
      await CylinderService.transferCustody({
        cylinderId: request.cylinderId,
        toCustodianType: 'plant',
        toCustodianId: plantId,
        event: 'delivered_to_plant',
        actorId: plantStaffId,
        actorRole: plantStaffRole,
        plantRefillRequestId: request._id,
        gpsCoordinates,
        req,
        externalSession: session,
      });

      // 5. Update Delivery's plantWorkflowStatus (do NOT change Delivery.status)
      await Delivery.findByIdAndUpdate(
        request.deliveryId,
        { plantWorkflowStatus: 'at_plant' },
        { session }
      );

      // 6. Audit
      await AuditService.log({
        action: 'PLANT_RECEIVED_CYLINDER',
        actorId: plantStaffId,
        actorRole: plantStaffRole,
        entityType: 'PlantRefillRequest',
        entityId: request._id,
        previousValue: { status: 'created' },
        newValue: { status: 'received' },
        metadata: { plantId, transactionId: transaction._id },
        gpsCoordinates,
        req,
      });

      await session.commitTransaction();

      return {
        success: true,
        request: request.toObject(),
        transaction: transaction.toObject(),
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // WRITE — RECORD QUANTITY
  // =====================================================

  async recordQuantity({
    requestId,
    plantStaffId,
    plantStaffRole,
    plantId,
    plantConfirmedQuantity,
    notes = null,
    req = null,
  }) {
    if (
      typeof plantConfirmedQuantity !== 'number' ||
      !Number.isFinite(plantConfirmedQuantity) ||
      plantConfirmedQuantity <= 0
    ) {
      throw new ErrorResponse('plantConfirmedQuantity must be a positive number', 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const request = await PlantRefillRequest.findOne({
        _id: requestId,
        plantId,
      }).session(session);

      if (!request) throw new ErrorResponse('Refill request not found', 404);
      if (request.plantId.toString() !== plantId.toString()) {
        throw new ErrorResponse('Not authorized for this plant', 403);
      }

      if (!['received', 'approved', 'refilling'].includes(request.status)) {
        throw new ErrorResponse(
          `Quantity can only be recorded when status is received/approved/refilling (current: ${request.status})`,
          409
        );
      }

      // Optional sanity: max cylinder size check
      const sizeKg = this._parseSizeKg(request.cylinderSize);
      const tolerance = 0.5;
      if (sizeKg && plantConfirmedQuantity > sizeKg + tolerance) {
        throw new ErrorResponse(
          `plantConfirmedQuantity (${plantConfirmedQuantity}kg) exceeds cylinder size (${sizeKg}kg)`,
          400
        );
      }

      const variance = +(plantConfirmedQuantity - request.requestedQuantity).toFixed(3);

      // Update request
      const previousStatus = request.status;
      request.plantConfirmedQuantity = plantConfirmedQuantity;
      request.status = 'quantity_recorded';
      await request.save({ session });

      // Update transaction
      const transaction = await PlantRefillTransaction.findOne({
        requestId: request._id,
      }).session(session);

      if (transaction) {
        transaction.plantConfirmedQuantity = plantConfirmedQuantity;
        transaction.variance = variance;
        transaction.totalValue = request.pricePerKg
          ? +(plantConfirmedQuantity * request.pricePerKg).toFixed(2)
          : null;
        transaction.status = 'quantity_recorded';
        transaction.refilledAt = new Date();
        await transaction.save({ session });
      }

      // Audit
      await AuditService.log({
        action: 'PLANT_REFILL_QUANTITY_RECORDED',
        actorId: plantStaffId,
        actorRole: plantStaffRole,
        entityType: 'PlantRefillRequest',
        entityId: request._id,
        previousValue: { status: previousStatus },
        newValue: {
          status: 'quantity_recorded',
          plantConfirmedQuantity,
          variance,
        },
        metadata: { plantId, transactionId: transaction?._id },
        req,
      });

      await session.commitTransaction();

      return {
        success: true,
        request: request.toObject(),
        transaction: transaction ? transaction.toObject() : null,
        variance,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // WRITE — CONFIRM REFILL (IDEMPOTENT)
  // =====================================================

  async confirmRefill({
    requestId,
    plantStaffId,
    plantStaffRole,
    plantId,
    idempotencyKey = null,
    req = null,
  }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Idempotency check (if key provided)
      if (idempotencyKey) {
        const existing = await PlantRefillTransaction.findOne({
          idempotencyKey,
        }).session(session);

        if (existing) {
          // Return the already-completed request
          const alreadyConfirmed = await PlantRefillRequest.findById(
            existing.requestId
          ).session(session);

          await session.commitTransaction();

          return {
            success: true,
            idempotent: true,
            request: alreadyConfirmed ? alreadyConfirmed.toObject() : null,
            transaction: existing.toObject(),
          };
        }
      }

      const request = await PlantRefillRequest.findOne({
        _id: requestId,
        plantId,
      }).session(session);

      if (!request) throw new ErrorResponse('Refill request not found', 404);

      if (request.status === 'confirmed') {
        // Idempotent: already confirmed
        await session.commitTransaction();
        return { success: true, idempotent: true, request: request.toObject() };
      }

      if (request.status !== 'quantity_recorded') {
        throw new ErrorResponse(
          `Refill can only be confirmed from 'quantity_recorded' status (current: ${request.status})`,
          409
        );
      }

      if (request.plantConfirmedQuantity === null) {
        throw new ErrorResponse('Cannot confirm without recorded quantity', 400);
      }

      // Update request
      request.status = 'confirmed';
      request.confirmedBy = plantStaffId;
      request.confirmedAt = new Date();
      await request.save({ session });

      // Update transaction
      const transaction = await PlantRefillTransaction.findOne({
        requestId: request._id,
      }).session(session);

      if (transaction) {
        transaction.status = 'confirmed';
        transaction.confirmedAt = new Date();
        if (idempotencyKey) transaction.idempotencyKey = idempotencyKey;
        await transaction.save({ session });
      }

      // Update plant metrics (denormalized)
      await PartnerPlant.findByIdAndUpdate(
        plantId,
        {
          $inc: {
            'metrics.totalRefills': 1,
            'metrics.totalKgSupplied': request.plantConfirmedQuantity,
          },
          $set: { 'metrics.lastRefillAt': new Date() },
        },
        { session }
      );

      // Update Delivery's plantWorkflowStatus (NOT delivery.status)
      await Delivery.findByIdAndUpdate(
        request.deliveryId,
        { plantWorkflowStatus: 'plant_confirmed' },
        { session }
      );

      // Check variance against tolerance → flag for dispute (do NOT auto-resolve)
      const toleranceKg = await ConfigService.getConfig(
        'PLANT_VARIANCE_TOLERANCE_KG',
        0.2
      );
      const variance = Math.abs(
        +(request.plantConfirmedQuantity - request.requestedQuantity).toFixed(3)
      );
      const requiresDispute = variance > toleranceKg;

      // Audit
      await AuditService.log({
        action: 'PLANT_REFILL_CONFIRMED',
        actorId: plantStaffId,
        actorRole: plantStaffRole,
        entityType: 'PlantRefillRequest',
        entityId: request._id,
        previousValue: { status: 'quantity_recorded' },
        newValue: {
          status: 'confirmed',
          variance,
          requiresDispute,
        },
        metadata: {
          plantId,
          transactionId: transaction?._id,
          requiresDispute,
          toleranceKg,
        },
        req,
      });

      await session.commitTransaction();

      return {
        success: true,
        request: request.toObject(),
        transaction: transaction ? transaction.toObject() : null,
        customerOrderStatus: 'UNCHANGED', // 🔒 explicit safeguard
        requiresDispute,
        variance,
        toleranceKg,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // WRITE — AGENT COLLECTS FROM PLANT
  // =====================================================

  async collectFromPlant({
    requestId,
    agentId,
    agentRole,
    gpsCoordinates = null,
    req = null,
  }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const request = await PlantRefillRequest.findOne({
        _id: requestId,
        agentId,
      }).session(session);

      if (!request) throw new ErrorResponse('Refill request not found', 404);

      if (request.status !== 'confirmed') {
        throw new ErrorResponse(
          `Cannot collect: current status is ${request.status}`,
          409
        );
      }

      // Update cylinder custody: plant → agent
      await CylinderService.transferCustody({
        cylinderId: request.cylinderId,
        toCustodianType: 'agent',
        toCustodianId: agentId,
        event: 'collected_from_plant',
        actorId: agentId,
        actorRole,
        deliveryId: request.deliveryId,
        plantRefillRequestId: request._id,
        gpsCoordinates,
        req,
        externalSession: session,
      });

      // Update Delivery plant workflow
      await Delivery.findByIdAndUpdate(
        request.deliveryId,
        { plantWorkflowStatus: 'cylinder_collected_from_plant' },
        { session }
      );

      // Audit
      await AuditService.log({
        action: 'CYLINDER_COLLECTED_FROM_PLANT',
        actorId: agentId,
        actorRole,
        entityType: 'PlantRefillRequest',
        entityId: request._id,
        metadata: { plantId: request.plantId, deliveryId: request.deliveryId },
        gpsCoordinates,
        req,
      });

      await session.commitTransaction();

      return { success: true, request: request.toObject() };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // WRITE — RETRY WITH ANOTHER PLANT
  // =====================================================

  async retryWithAnotherPlant({
    originalRequestId,
    newPlantId,
    agentId,
    agentRole,
    agentNotes = null,
    req = null,
  }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const original = await PlantRefillRequest.findOne({
        _id: originalRequestId,
        agentId,
      }).session(session);

      if (!original) throw new ErrorResponse('Original request not found', 404);

      if (original.status !== 'rejected') {
        throw new ErrorResponse(
          'Only rejected requests can be retried with another plant',
          409
        );
      }

      // Max attempts check
      const maxAttempts = await ConfigService.getConfig(
        'PLANT_MAX_RETRY_ATTEMPTS',
        3
      );
      if (original.attemptNumber >= maxAttempts) {
        throw new ErrorResponse(
          `Maximum retry attempts (${maxAttempts}) reached. Escalate to E-GAS.`,
          400
        );
      }

      // New plant validation
      const newPlant = await PartnerPlant.findOne({
        _id: newPlantId,
        isDeleted: false,
      }).session(session);
      if (!newPlant) throw new ErrorResponse('New plant not found', 404);
      if (newPlant.status !== 'active') {
        throw new ErrorResponse(`New plant is not active`, 400);
      }

      // Generate new request number
      const requestNumber = await generateRequestNumber();
      const price = await PlantService.getActivePrice(newPlant._id, session);

      const [newRequest] = await PlantRefillRequest.create(
        [
          {
            requestNumber,
            deliveryId: original.deliveryId,
            subscriptionId: original.subscriptionId,
            customerId: original.customerId,
            agentId: original.agentId,
            plantId: newPlant._id,
            cylinderId: original.cylinderId,
            cylinderTag: original.cylinderTag,
            cylinderSize: original.cylinderSize,
            emptyWeight: original.emptyWeight,
            measuredWeight: original.measuredWeight,
            calculatedRemnant: original.calculatedRemnant,
            requestedQuantity: original.requestedQuantity,
            agentReportedQuantity: original.agentReportedQuantity,
            pricePerKg: price?.pricePerKg ?? null,
            priceAgreementId: price?._id ?? null,
            status: 'created',
            agentNotes: agentNotes || `Retry after rejection: ${original.rejectedReason}`,
            attemptNumber: original.attemptNumber + 1,
            previousRequestId: original._id,
          },
        ],
        { session }
      );

      // Update delivery pointer to new request
      await Delivery.findByIdAndUpdate(
        original.deliveryId,
        {
          plantRefillRequestId: newRequest._id,
          plantWorkflowStatus: 'request_created',
        },
        { session }
      );

      // Audit
      await AuditService.log({
        action: 'PLANT_REFILL_REQUEST_RETRY',
        actorId: agentId,
        actorRole,
        entityType: 'PlantRefillRequest',
        entityId: newRequest._id,
        metadata: {
          originalRequestId: original._id,
          attemptNumber: newRequest.attemptNumber,
        },
        req,
      });

      await session.commitTransaction();

      return { success: true, request: newRequest.toObject() };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
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

module.exports = new PlantRefillService();