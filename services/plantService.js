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
  // async findNearby(gps, { maxDistanceKm = 30, limit = 20, onlyOperational = true } = {}) {
  //   if (
  //     !gps ||
  //     !Array.isArray(gps.coordinates) ||
  //     gps.coordinates.length !== 2
  //   ) {
  //     throw new ErrorResponse('Valid GPS coordinates required', 400);
  //   }

  //   const maxDistanceMeters = maxDistanceKm * 1000;

  //   // Aggregate with $geoNear for distance computation
  //   const pipeline = [
  //     {
  //       $geoNear: {
  //         near: {
  //           type: 'Point',
  //           coordinates: gps.coordinates.map(Number),
  //         },
  //         distanceField: 'distanceMeters',
  //         maxDistance: maxDistanceMeters,
  //         spherical: true,
  //         query: {
  //           status: 'active',
  //           isDeleted: false,
  //         },
  //       },
  //     },
  //     {
  //       $addFields: {
  //         distanceKm: { $divide: ['$distanceMeters', 1000] },
  //       },
  //     },
  //     { $sort: { distanceMeters: 1 } },
  //     { $limit: limit },
  //     {
  //       $lookup: {
  //         from: 'plantpriceagreements',
  //         let: { plantId: '$_id' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: { $eq: ['$plantId', '$$plantId'] },
  //               status: 'active',
  //               effectiveFrom: { $lte: new Date() },
  //               $or: [
  //                 { effectiveTo: null },
  //                 { effectiveTo: { $gte: new Date() } },
  //               ],
  //             },
  //           },
  //           { $sort: { effectiveFrom: -1 } },
  //           { $limit: 1 },
  //         ],
  //         as: 'currentAgreement',
  //       },
  //     },
  //     {
  //       $addFields: {
  //         currentPricePerKg: {
  //           $ifNull: [{ $arrayElemAt: ['$currentAgreement.pricePerKg', 0] }, null],
  //         },
  //         currentlyOpen: this._operationalExpr(),
  //       },
  //     },
  //     {
  //       $project: {
  //         currentAgreement: 0,
  //       },
  //     },
  //   ];

  //   let plants = await PartnerPlant.aggregate(pipeline);

  //   if (onlyOperational) {
  //     plants = plants.filter((p) => p.currentlyOpen);
  //   }

  //   return plants;
  // }

  // services/plantService.js

/**
 * Find nearby plants with graceful fallback.
 *
 * Search strategy (in order):
 *   1. Geospatial within `maxDistanceKm` (default 50km)
 *   2. Same city as agent
 *   3. Same state as agent
 *   4. All active plants (last resort)
 *
 * Returns plants with `distanceKm` (null if geospatial search failed),
 * `currentlyOpen`, and `currentPricePerKg`.
 */
async findNearby(gps, options = {}) {
  const {
    maxDistanceKm = 50,
    limit = 20,
    onlyOperational = false, // ← changed default: never hide closed plants
    agentCity = null,
    agentState = null,
    includeNonOperational = true,
  } = options;

  // Validate GPS
  const hasValidGps =
    gps &&
    Array.isArray(gps.coordinates) &&
    gps.coordinates.length === 2 &&
    Number.isFinite(Number(gps.coordinates[0])) &&
    Number.isFinite(Number(gps.coordinates[1]));

  const maxDistanceMeters = maxDistanceKm * 1000;

  // ─────────────────────────────────────────────────────
  // STEP 1: Geospatial search
  // ─────────────────────────────────────────────────────
  let plants = [];

  if (hasValidGps) {
    try {
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
            query: { status: 'active', isDeleted: false },
          },
        },
        {
          $addFields: {
            distanceKm: { $divide: ['$distanceMeters', 1000] },
          },
        },
        { $sort: { distanceMeters: 1 } },
        { $limit: limit * 2 }, // get extra for the filter stage
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
              $ifNull: [
                { $arrayElemAt: ['$currentAgreement.pricePerKg', 0] },
                null,
              ],
            },
          },
        },
        { $project: { currentAgreement: 0 } },
      ];

      plants = await PartnerPlant.aggregate(pipeline);
    } catch (err) {
      // $geoNear failed — likely missing 2dsphere index or bad coords
      console.warn(
        '[PlantService.findNearby] geospatial search failed:',
        err.message
      );
      plants = [];
    }
  }

  // Annotate currentlyOpen for geospatial results
  plants = plants.map((p) => ({
    ...p,
    currentlyOpen: this._isCurrentlyOpen(p),
    searchSource: 'geospatial',
  }));

  // ─────────────────────────────────────────────────────
  // STEP 2: Fallback — same city
  // ─────────────────────────────────────────────────────
  if (plants.length === 0 && agentCity) {
    const cityPlants = await PartnerPlant.find({
      status: 'active',
      isDeleted: false,
      city: new RegExp(`^${escapeRegex(agentCity)}$`, 'i'),
    })
      .limit(limit)
      .lean();

    plants = cityPlants.map((p) => ({
      ...p,
      distanceKm: null,
      distanceMeters: null,
      currentlyOpen: this._isCurrentlyOpen(p),
      currentPricePerKg: null, // would need lookup — acceptable for fallback
      searchSource: 'city',
    }));
  }

  // ─────────────────────────────────────────────────────
  // STEP 3: Fallback — same state
  // ─────────────────────────────────────────────────────
  if (plants.length === 0 && agentState) {
    const statePlants = await PartnerPlant.find({
      status: 'active',
      isDeleted: false,
      state: new RegExp(`^${escapeRegex(agentState)}$`, 'i'),
    })
      .limit(limit)
      .lean();

    plants = statePlants.map((p) => ({
      ...p,
      distanceKm: null,
      distanceMeters: null,
      currentlyOpen: this._isCurrentlyOpen(p),
      currentPricePerKg: null,
      searchSource: 'state',
    }));
  }

  // ─────────────────────────────────────────────────────
  // STEP 4: Last resort — all active plants
  // ─────────────────────────────────────────────────────
  if (plants.length === 0) {
    const allPlants = await PartnerPlant.find({
      status: 'active',
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    plants = allPlants.map((p) => ({
      ...p,
      distanceKm: null,
      distanceMeters: null,
      currentlyOpen: this._isCurrentlyOpen(p),
      currentPricePerKg: null,
      searchSource: 'all_active',
    }));
  }

  // ─────────────────────────────────────────────────────
  // STEP 5: Optional operational filter (explicit opt-in)
  // ─────────────────────────────────────────────────────
  if (onlyOperational) {
    const operational = plants.filter((p) => p.currentlyOpen);
    // Only filter if it wouldn't empty the list
    if (operational.length > 0) {
      plants = operational;
    }
  }

  return plants.slice(0, limit);
}

/**
 * Helper: check if a plant is currently open (pure function, no DB).
 */
_isCurrentlyOpen(plant) {
  if (!plant || plant.status !== 'active') return false;

  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = dayNames[now.getDay()];

  const days = plant.operatingHours?.daysOpen || [];
  if (!days.includes(today)) return false;

  const current = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  const open = plant.operatingHours?.open || '00:00';
  const close = plant.operatingHours?.close || '23:59';

  return current >= open && current <= close;
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
      operatingHours: operatingHours || {
        open: '00:00',
        close: '23:59',
        daysOpen: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      },
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

  // _operationalExpr() {
  //   // Aggregation expression — compute if currently within operating hours + day
  //   return {
  //     $let: {
  //       vars: {
  //         dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  //         currentDay: { $arrayElemAt: [['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], { $dayOfWeek: new Date() }] },
  //         currentTime: {
  //           $dateToString: { format: '%H:%M', date: new Date() },
  //         },
  //       },
  //       in: {
  //         $and: [
  //           { $in: ['$$currentDay', { $ifNull: ['$operatingHours.daysOpen', []] }] },
  //           { $gte: ['$$currentTime', { $ifNull: ['$operatingHours.open', '00:00'] }] },
  //           { $lte: ['$$currentTime', { $ifNull: ['$operatingHours.close', '23:59'] }] },
  //         ],
  //       },
  //     },
  //   };
  // }

  _operationalExpr() {
  return {
    $let: {
      vars: {
        currentDay: {
          $arrayElemAt: [
            // $dayOfWeek returns 1=Sun ... 7=Sat → index must map accordingly
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            { $dayOfWeek: new Date() },
          ],
        },
        currentTime: {
          $dateToString: {
            format: '%H:%M',
            date: new Date(),
            timezone: 'Africa/Lagos',
          },
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

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = new PlantService();