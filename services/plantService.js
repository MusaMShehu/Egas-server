const mongoose = require('mongoose');
const PartnerPlant = require('../models/PartnerPlant');
const PlantPriceAgreement = require('../models/PlantPriceAgreement');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const AuditService = require('./auditService');

/**
 * PlantService — Partner plant lifecycle + discovery + price agreements.
 */
class PlantService {
  // =====================================================
  // READ
  // =====================================================

  async getById(plantId, { session = null } = {}) {
    const query = PartnerPlant.findOne({ _id: plantId, isDeleted: false });
    if (session) query.session(session);
    const plant = await query.lean();
    if (!plant) throw new ErrorResponse('Plant not found', 404);
    return plant;
  }

  async getByCode(code) {
    return PartnerPlant.findOne({
      code: String(code).toUpperCase().trim(),
      isDeleted: false,
    }).lean();
  }

  async list(filter = {}, { page = 1, limit = 20, sort = { createdAt: -1 } } = {}) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      PartnerPlant.find({ ...filter, isDeleted: false })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      PartnerPlant.countDocuments({ ...filter, isDeleted: false }),
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

  /**
   * Find nearby active plants — used by agents for plant selection.
   *
   * @param {Object} gps        - { type: 'Point', coordinates: [lng, lat] }
   * @param {Object} options    - { maxDistanceKm, limit, onlyOperational }
   */
  async findNearby(gps, { maxDistanceKm = 30, limit = 20, onlyOperational = true } = {}) {
    if (
      !gps ||
      !Array.isArray(gps.coordinates) ||
      gps.coordinates.length !== 2
    ) {
      throw new ErrorResponse('Valid GPS coordinates required', 400);
    }

    const maxDistanceMeters = maxDistanceKm * 1000;

    // Aggregate with $geoNear for distance computation
    const pipeline = [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: gps.coordinates.map(Number),
          },
          distanceField: 'distanceMeters',
          maxDistance: maxDistanceMeters,
          spherical: true,
          query: {
            status: 'active',
            isDeleted: false,
          },
        },
      },
      {
        $addFields: {
          distanceKm: { $divide: ['$distanceMeters', 1000] },
        },
      },
      { $sort: { distanceMeters: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'plantpriceagreements',
          let: { plantId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$plantId', '$$plantId'] },
                status: 'active',
                effectiveFrom: { $lte: new Date() },
                $or: [
                  { effectiveTo: null },
                  { effectiveTo: { $gte: new Date() } },
                ],
              },
            },
            { $sort: { effectiveFrom: -1 } },
            { $limit: 1 },
          ],
          as: 'currentAgreement',
        },
      },
      {
        $addFields: {
          currentPricePerKg: {
            $ifNull: [{ $arrayElemAt: ['$currentAgreement.pricePerKg', 0] }, null],
          },
          currentlyOpen: this._operationalExpr(),
        },
      },
      {
        $project: {
          currentAgreement: 0,
        },
      },
    ];

    let plants = await PartnerPlant.aggregate(pipeline);

    if (onlyOperational) {
      plants = plants.filter((p) => p.currentlyOpen);
    }

    return plants;
  }

  // =====================================================
  // WRITE — CREATE / UPDATE
  // =====================================================

  async createPlant(payload, adminId, req = null) {
    const {
      name,
      code,
      description,
      logo,
      contactPerson,
      address,
      city,
      state,
      gpsCoordinates,
      serviceRadiusKm,
      operatingHours,
    } = payload;

    if (!name || !code || !address || !city || !state || !gpsCoordinates?.coordinates) {
      throw new ErrorResponse(
        'name, code, address, city, state, and gpsCoordinates are required',
        400
      );
    }

    // Check duplicates
    const existing = await PartnerPlant.findOne({
      $or: [{ name }, { code: String(code).toUpperCase() }],
      isDeleted: false,
    });

    if (existing) {
      throw new ErrorResponse(
        existing.name === name
          ? 'A plant with this name already exists'
          : 'A plant with this code already exists',
        409
      );
    }

    const plant = await PartnerPlant.create({
      name,
      code: String(code).toUpperCase(),
      description,
      logo,
      contactPerson,
      address,
      city,
      state,
      gpsCoordinates: {
        type: 'Point',
        coordinates: gpsCoordinates.coordinates.map(Number),
      },
      serviceRadiusKm: serviceRadiusKm || 30,
      operatingHours: operatingHours || undefined,
      status: 'pending_approval',
      createdBy: adminId,
    });

    await AuditService.log({
      action: 'PLANT_CREATED',
      actorId: adminId,
      actorRole: 'admin',
      entityType: 'PartnerPlant',
      entityId: plant._id,
      newValue: { name: plant.name, code: plant.code, status: plant.status },
      req,
    });

    return plant.toObject();
  }

  async updatePlant(plantId, updates, adminId, req = null) {
    const plant = await PartnerPlant.findOne({
      _id: plantId,
      isDeleted: false,
    });
    if (!plant) throw new ErrorResponse('Plant not found', 404);

    const previous = {
      name: plant.name,
      code: plant.code,
      status: plant.status,
      city: plant.city,
      state: plant.state,
    };

    // Allowlist of updatable fields
    const allowed = [
      'name',
      'description',
      'logo',
      'contactPerson',
      'address',
      'city',
      'state',
      'serviceRadiusKm',
      'operatingHours',
    ];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        plant[key] = updates[key];
      }
    }

    if (updates.gpsCoordinates?.coordinates) {
      plant.gpsCoordinates = {
        type: 'Point',
        coordinates: updates.gpsCoordinates.coordinates.map(Number),
      };
    }

    plant.updatedBy = adminId;
    await plant.save();

    await AuditService.log({
      action: 'PLANT_UPDATED',
      actorId: adminId,
      actorRole: 'admin',
      entityType: 'PartnerPlant',
      entityId: plant._id,
      previousValue: previous,
      newValue: updates,
      req,
    });

    return plant.toObject();
  }

  // =====================================================
  // WRITE — LIFECYCLE
  // =====================================================

  async approvePlant(plantId, adminId, req = null) {
    const plant = await PartnerPlant.findOne({
      _id: plantId,
      isDeleted: false,
    });
    if (!plant) throw new ErrorResponse('Plant not found', 404);

    if (plant.status === 'active') {
      throw new ErrorResponse('Plant is already active', 400);
    }

    const previous = plant.status;
    await plant.approve(adminId);

    await AuditService.log({
      action: 'PLANT_APPROVED',
      actorId: adminId,
      actorRole: 'admin',
      entityType: 'PartnerPlant',
      entityId: plant._id,
      previousValue: { status: previous },
      newValue: { status: 'active' },
      req,
    });

    return plant.toObject();
  }

  async suspendPlant(plantId, reason, adminId, req = null) {
    if (!reason || reason.trim().length === 0) {
      throw new ErrorResponse('Suspension reason is required', 400);
    }

    const plant = await PartnerPlant.findOne({
      _id: plantId,
      isDeleted: false,
    });
    if (!plant) throw new ErrorResponse('Plant not found', 404);

    if (plant.status === 'suspended') {
      throw new ErrorResponse('Plant is already suspended', 400);
    }

    const previous = plant.status;
    await plant.suspend(adminId, reason.trim());

    await AuditService.log({
      action: 'PLANT_SUSPENDED',
      actorId: adminId,
      actorRole: 'admin',
      entityType: 'PartnerPlant',
      entityId: plant._id,
      previousValue: { status: previous },
      newValue: { status: 'suspended', reason },
      req,
    });

    return plant.toObject();
  }

  async activatePlant(plantId, adminId, req = null) {
    const plant = await PartnerPlant.findOne({
      _id: plantId,
      isDeleted: false,
    });
    if (!plant) throw new ErrorResponse('Plant not found', 404);

    if (plant.status === 'active') {
      throw new ErrorResponse('Plant is already active', 400);
    }

    const previous = plant.status;
    plant.status = 'active';
    plant.suspendedBy = null;
    plant.suspendedAt = null;
    plant.suspensionReason = null;
    plant.updatedBy = adminId;
    await plant.save();

    await AuditService.log({
      action: 'PLANT_ACTIVATED',
      actorId: adminId,
      actorRole: 'admin',
      entityType: 'PartnerPlant',
      entityId: plant._id,
      previousValue: { status: previous },
      newValue: { status: 'active' },
      req,
    });

    return plant.toObject();
  }

  // =====================================================
  // PRICE AGREEMENTS
  // =====================================================

  async getActivePrice(plantId, session = null) {
    const now = new Date();
    const query = PlantPriceAgreement.findOne({
      plantId,
      status: 'active',
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }],
    }).sort({ effectiveFrom: -1 });

    if (session) query.session(session);
    return query.lean();
  }

  async createPriceAgreement(
    plantId,
    { pricePerKg, effectiveFrom, notes },
    adminId,
    req = null
  ) {
    const plant = await PartnerPlant.findOne({
      _id: plantId,
      isDeleted: false,
    });
    if (!plant) throw new ErrorResponse('Plant not found', 404);

    if (!pricePerKg || pricePerKg <= 0) {
      throw new ErrorResponse('pricePerKg must be positive', 400);
    }

    const startDate = effectiveFrom ? new Date(effectiveFrom) : new Date();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Supersede any current active agreement
      await PlantPriceAgreement.updateMany(
        {
          plantId,
          status: 'active',
        },
        {
          $set: {
            status: 'superseded',
            effectiveTo: startDate,
          },
        },
        { session }
      );

      const [agreement] = await PlantPriceAgreement.create(
        [
          {
            plantId,
            pricePerKg,
            effectiveFrom: startDate,
            effectiveTo: null,
            status: 'active',
            notes,
            createdBy: adminId,
            approvedBy: adminId,
            approvedAt: new Date(),
          },
        ],
        { session }
      );

      // Update plant pointer
      plant.currentPriceAgreement = agreement._id;
      plant.priceHistory = [...(plant.priceHistory || []), agreement._id];
      plant.updatedBy = adminId;
      await plant.save({ session });

      await AuditService.log({
        action: 'PLANT_PRICE_AGREEMENT_CREATED',
        actorId: adminId,
        actorRole: 'admin',
        entityType: 'PlantPriceAgreement',
        entityId: agreement._id,
        newValue: { plantId, pricePerKg, effectiveFrom: startDate },
        metadata: { plantId },
        req,
      });

      await session.commitTransaction();

      return agreement.toObject();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async listPriceAgreements(plantId, filter = {}) {
    return PlantPriceAgreement.find({ plantId, ...filter })
      .sort({ effectiveFrom: -1 })
      .lean();
  }

  // =====================================================
  // HELPERS
  // =====================================================

  _operationalExpr() {
    // Aggregation expression — compute if currently within operating hours + day
    return {
      $let: {
        vars: {
          dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
          currentDay: { $arrayElemAt: [['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], { $dayOfWeek: new Date() }] },
          currentTime: {
            $dateToString: { format: '%H:%M', date: new Date() },
          },
        },
        in: {
          $and: [
            { $in: ['$$currentDay', { $ifNull: ['$operatingHours.daysOpen', []] }] },
            { $gte: ['$$currentTime', { $ifNull: ['$operatingHours.open', '00:00'] }] },
            { $lte: ['$$currentTime', { $ifNull: ['$operatingHours.close', '23:59'] }] },
          ],
        },
      },
    };
  }
}

module.exports = new PlantService();