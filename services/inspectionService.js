const mongoose = require('mongoose');
const PlantInspection = require('../models/PlantInspection');
const PlantRefillRequest = require('../models/PlantRefillRequest');
const PlantRefillTransaction = require('../models/PlantRefillTransaction');
const Cylinder = require('../models/Cylinder');
const ErrorResponse = require('../utils/errorResponse');
const AuditService = require('./auditService');
const CylinderService = require('./cylinderService');

/**
 * InspectionService — Handle plant cylinder inspections.
 *
 * Outcomes:
 *   approved → request.status = 'approved'
 *   rejected → request.status = 'rejected'   (delivery NOT touched)
 */
class InspectionService {
  async submitInspection({
    requestId,
    plantId,
    plantStaffId,
    plantStaffRole,
    checklist,
    outcome,
    rejectionReason = null,
    rejectionNotes = null,
    photos = [],
    measuredWeightAtInspection = null,
    req = null,
  }) {
    if (!requestId) throw new ErrorResponse('requestId is required', 400);
    if (!['approved', 'rejected'].includes(outcome)) {
      throw new ErrorResponse('outcome must be approved or rejected', 400);
    }
    if (outcome === 'rejected' && !rejectionReason) {
      throw new ErrorResponse('rejectionReason is required for rejections', 400);
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

      if (!['received', 'inspection_pending'].includes(request.status)) {
        throw new ErrorResponse(
          `Cannot inspect: current status is ${request.status}`,
          409
        );
      }

      // Guard: only one inspection per request
      const existing = await PlantInspection.findOne({
        requestId: request._id,
      }).session(session);
      if (existing) {
        throw new ErrorResponse('Inspection already submitted for this request', 409);
      }

      // Create inspection
      const [inspection] = await PlantInspection.create(
        [
          {
            requestId: request._id,
            transactionId: request.transactionId || null,
            plantId,
            cylinderId: request.cylinderId,
            inspectorId: plantStaffId,
            checklist: {
              valveCondition: checklist?.valveCondition || 'pass',
              bodyCondition: checklist?.bodyCondition || 'pass',
              leakTest: checklist?.leakTest || 'pass',
              visibleDamage: checklist?.visibleDamage || 'none',
              expiryValid: checklist?.expiryValid || 'pass',
              suitabilityForRefill: checklist?.suitabilityForRefill || 'pass',
            },
            outcome,
            rejectionReason: outcome === 'rejected' ? rejectionReason : null,
            rejectionNotes: outcome === 'rejected' ? rejectionNotes : null,
            photos,
            measuredWeightAtInspection,
          },
        ],
        { session }
      );

      // Update request
      const previousStatus = request.status;
      request.status = outcome === 'approved' ? 'approved' : 'rejected';
      if (outcome === 'rejected') {
        request.rejectedReason = rejectionNotes || rejectionReason;
      }
      await request.save({ session });

      // Update transaction
      const transaction = await PlantRefillTransaction.findOne({
        requestId: request._id,
      }).session(session);
      if (transaction) {
        transaction.inspectionId = inspection._id;
        transaction.status = outcome === 'approved' ? 'approved' : 'rejected';
        transaction.inspectedAt = new Date();
        await transaction.save({ session });
      }

      // Update cylinder.lastInspection
      await CylinderService.updateLastInspection({
        cylinderId: request.cylinderId,
        inspectionId: inspection._id,
        status: outcome === 'approved' ? 'pass' : 'fail',
        actorId: plantStaffId,
        actorRole: plantStaffRole,
        session,
      });

      // Update delivery plantWorkflowStatus (NOT delivery.status)
      const Delivery = require('../models/Delivery');
      await Delivery.findByIdAndUpdate(
        request.deliveryId,
        {
          plantWorkflowStatus:
            outcome === 'approved' ? 'inspection_approved' : 'inspection_rejected',
        },
        { session }
      );

      // If rejected, flag cylinder (mirroring business safety)
      if (outcome === 'rejected') {
        await Cylinder.findByIdAndUpdate(
          request.cylinderId,
          {
            status: 'flagged',
            flaggedReason: rejectionNotes || rejectionReason,
          },
          { session }
        );
      }

      // Audit
      await AuditService.log({
        action:
          outcome === 'approved'
            ? 'PLANT_INSPECTION_APPROVED'
            : 'PLANT_INSPECTION_REJECTED',
        actorId: plantStaffId,
        actorRole: plantStaffRole,
        entityType: 'PlantRefillRequest',
        entityId: request._id,
        previousValue: { status: previousStatus },
        newValue: {
          status: request.status,
          outcome,
          rejectionReason,
        },
        metadata: {
          plantId,
          inspectionId: inspection._id,
          transactionId: transaction?._id,
        },
        req,
      });

      await session.commitTransaction();

      return {
        success: true,
        request: request.toObject(),
        inspection: inspection.toObject(),
        affectedDelivery: 'UNCHANGED', // 🔒 explicit safeguard
        agentActionsAvailable:
          outcome === 'rejected'
            ? ['try_another_plant', 'mark_delivery_failed', 'escalate']
            : [],
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getByRequestId(requestId) {
    return PlantInspection.findOne({ requestId })
      .populate('inspectorId', 'firstName lastName role')
      .lean();
  }
}

module.exports = new InspectionService();