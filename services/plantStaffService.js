// const User = require('../models/User');
// const PartnerPlant = require('../models/PartnerPlant');
// const ErrorResponse = require('../utils/errorResponse');
// const AuditService = require('./auditService');

// /**
//  * PlantStaffService — Manage plant staff membership.
//  *
//  * Staff are stored in the User model with:
//  *   - role:    plant_admin | plant_supervisor | plant_operator | plant_staff
//  *   - plantId: ObjectId of the plant
//  *
//  * A user can belong to ONLY one plant (via plantId).
//  */
// class PlantStaffService {
//   static VALID_ROLES = [
//     'plant_admin',
//     'plant_supervisor',
//     'plant_operator',
//     'plant_staff',
//   ];

//   // =====================================================
//   // READ
//   // =====================================================

//   async listStaff(plantId, filter = {}) {
//     return User.find({
//       plantId,
//       role: { $in: PlantStaffService.VALID_ROLES },
//       ...filter,
//     })
//       .select('-password -loginAttempts -lockUntil')
//       .sort({ createdAt: -1 })
//       .lean();
//   }

//   async getStaffById(staffId, plantId) {
//     const user = await User.findOne({
//       _id: staffId,
//       plantId,
//       role: { $in: PlantStaffService.VALID_ROLES },
//     }).select('-password -loginAttempts -lockUntil');

//     if (!user) throw new ErrorResponse('Staff member not found', 404);
//     return user;
//   }

//   // =====================================================
//   // WRITE — INVITE / CREATE
//   // =====================================================

//   /**
//    * Invite a new staff member.
//    * NOTE: In v1, this creates a User with a temporary password.
//    * Email invite flow can be layered later.
//    */
//   async inviteStaff({
//     plantId,
//     firstName,
//     lastName,
//     email,
//     phone,
//     password,
//     role,
//     actorId,
//     actorRole,
//     req = null,
//   }) {
//     if (!firstName || !lastName || !email || !password || !role) {
//       throw new ErrorResponse(
//         'firstName, lastName, email, password, and role are required',
//         400
//       );
//     }

//     if (!PlantStaffService.VALID_ROLES.includes(role)) {
//       throw new ErrorResponse('Invalid plant role', 400);
//     }

//     // Plant must exist
//     const plant = await PartnerPlant.findOne({
//       _id: plantId,
//       isDeleted: false,
//     }).lean();
//     if (!plant) throw new ErrorResponse('Plant not found', 404);

//     // Email uniqueness
//     const existing = await User.findOne({ email: email.toLowerCase() });
//     if (existing) {
//       throw new ErrorResponse('A user with this email already exists', 409);
//     }

//     const user = await User.create({
//       firstName,
//       lastName,
//       email: email.toLowerCase(),
//       phone: phone || undefined,
//       password,
//       address: plant.address || 'N/A',
//       city: plant.city || 'N/A',
//       state: plant.state || 'N/A',
//       role,
//       plantId,
//       isActive: true,
//       emailVerified: false,
//       phoneVerified: false,
//     });

//     await AuditService.log({
//       action: 'PLANT_STAFF_ADDED',
//       actorId,
//       actorRole,
//       entityType: 'User',
//       entityId: user._id,
//       newValue: { email: user.email, role, plantId },
//       metadata: { plantId },
//       req,
//     });

//     const sanitized = await User.findById(user._id)
//       .select('-password -loginAttempts -lockUntil')
//       .lean();

//     return sanitized;
//   }

//   // =====================================================
//   // WRITE — UPDATE
//   // =====================================================

//   async updateStaffRole({
//     staffId,
//     plantId,
//     newRole,
//     actorId,
//     actorRole,
//     req = null,
//   }) {
//     if (!PlantStaffService.VALID_ROLES.includes(newRole)) {
//       throw new ErrorResponse('Invalid plant role', 400);
//     }

//     const staff = await User.findOne({
//       _id: staffId,
//       plantId,
//       role: { $in: PlantStaffService.VALID_ROLES },
//     });
//     if (!staff) throw new ErrorResponse('Staff member not found', 404);

//     // Prevent demoting the last plant_admin (safety)
//     if (staff.role === 'plant_admin' && newRole !== 'plant_admin') {
//       const adminCount = await User.countDocuments({
//         plantId,
//         role: 'plant_admin',
//         isActive: true,
//       });
//       if (adminCount <= 1) {
//         throw new ErrorResponse(
//           'Cannot demote the last active plant administrator',
//           400
//         );
//       }
//     }

//     const previousRole = staff.role;
//     staff.role = newRole;
//     await staff.save();

//     await AuditService.log({
//       action: 'PLANT_STAFF_ROLE_CHANGED',
//       actorId,
//       actorRole,
//       entityType: 'User',
//       entityId: staff._id,
//       previousValue: { role: previousRole },
//       newValue: { role: newRole },
//       metadata: { plantId },
//       req,
//     });

//     return User.findById(staff._id)
//       .select('-password -loginAttempts -lockUntil')
//       .lean();
//   }

//   async toggleStaffStatus({
//     staffId,
//     plantId,
//     isActive,
//     actorId,
//     actorRole,
//     req = null,
//   }) {
//     const staff = await User.findOne({
//       _id: staffId,
//       plantId,
//       role: { $in: PlantStaffService.VALID_ROLES },
//     });
//     if (!staff) throw new ErrorResponse('Staff member not found', 404);

//     // Prevent deactivating last active plant_admin
//     if (!isActive && staff.role === 'plant_admin') {
//       const adminCount = await User.countDocuments({
//         plantId,
//         role: 'plant_admin',
//         isActive: true,
//       });
//       if (adminCount <= 1) {
//         throw new ErrorResponse(
//           'Cannot deactivate the last active plant administrator',
//           400
//         );
//       }
//     }

//     const previousStatus = staff.isActive;
//     staff.isActive = isActive;
//     await staff.save();

//     await AuditService.log({
//       action: 'PLANT_STAFF_STATUS_CHANGED',
//       actorId,
//       actorRole,
//       entityType: 'User',
//       entityId: staff._id,
//       previousValue: { isActive: previousStatus },
//       newValue: { isActive },
//       metadata: { plantId },
//       req,
//     });

//     return User.findById(staff._id)
//       .select('-password -loginAttempts -lockUntil')
//       .lean();
//   }

//   // =====================================================
//   // WRITE — REMOVE
//   // =====================================================

//   /**
//    * Remove a staff member from a plant.
//    * Deactivates the user and detaches plantId; does not hard-delete.
//    */
//   async removeStaff({
//     staffId,
//     plantId,
//     actorId,
//     actorRole,
//     req = null,
//   }) {
//     const staff = await User.findOne({
//       _id: staffId,
//       plantId,
//       role: { $in: PlantStaffService.VALID_ROLES },
//     });
//     if (!staff) throw new ErrorResponse('Staff member not found', 404);

//     // Prevent removing the last plant_admin
//     if (staff.role === 'plant_admin') {
//       const adminCount = await User.countDocuments({
//         plantId,
//         role: 'plant_admin',
//         isActive: true,
//       });
//       if (adminCount <= 1) {
//         throw new ErrorResponse(
//           'Cannot remove the last active plant administrator',
//           400
//         );
//       }
//     }

//     const previousRole = staff.role;
//     staff.isActive = false;
//     staff.role = 'user';       // detach from plant role
//     staff.plantId = null;      // detach from plant
//     await staff.save();

//     await AuditService.log({
//       action: 'PLANT_STAFF_REMOVED',
//       actorId,
//       actorRole,
//       entityType: 'User',
//       entityId: staff._id,
//       previousValue: { role: previousRole, plantId: plantId.toString() },
//       newValue: { role: 'user', plantId: null, isActive: false },
//       metadata: { plantId },
//       req,
//     });

//     return { success: true, staffId: staff._id.toString() };
//   }
// }

// module.exports = new PlantStaffService();
























const mongoose = require('mongoose');
const User = require('../models/User');
const PartnerPlant = require('../models/PartnerPlant');
const ErrorResponse = require('../utils/errorResponse');
const AuditService = require('./auditService');

const USER_PRIVATE_FIELDS =
  '-password -loginAttempts -lockUntil -__v';

class PlantStaffService {
  static VALID_ROLES = [
    'plant_admin',
    'plant_supervisor',
    'plant_operator',
    'plant_staff',
  ];

  // ============================================================
  // SHARED HELPERS
  // ============================================================

  static validateObjectId(id, label = 'ID') {
    if (!id || !mongoose.isValidObjectId(id)) {
      throw new ErrorResponse(`Invalid ${label}`, 400);
    }
  }

  static normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  static normalizeEmail(email) {
    return PlantStaffService.normalizeText(email).toLowerCase();
  }

  static validateActor(actorId, actorRole) {
    if (!actorId || !actorRole) {
      throw new ErrorResponse(
        'Authenticated actor ID and role are required',
        401
      );
    }
  }

  static validateRole(role) {
    if (!PlantStaffService.VALID_ROLES.includes(role)) {
      throw new ErrorResponse('Invalid plant staff role', 400);
    }
  }

  /**
   * Read the assigned plant's location.
   *
   * gpsCoordinates is the preferred PartnerPlant field.
   * location is supported as a fallback if that is the field
   * actually used by your PartnerPlant schema.
   *
   * GeoJSON coordinates must be [longitude, latitude].
   */
  static getPlantCoordinates(plant) {
    const location = plant.gpsCoordinates || plant.location;

    if (
      !location ||
      location.type !== 'Point' ||
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2
    ) {
      throw new ErrorResponse(
        'The assigned plant has no valid GPS location. Update the plant location before adding staff.',
        400
      );
    }

    const [longitude, latitude] = location.coordinates;

    if (
      typeof longitude !== 'number' ||
      typeof latitude !== 'number' ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new ErrorResponse(
        'The assigned plant has invalid GPS coordinates',
        400
      );
    }

    return {
      type: 'Point',
      coordinates: [longitude, latitude],
    };
  }

  static async getPlant(plantId) {
    PlantStaffService.validateObjectId(plantId, 'plant ID');

    const plant = await PartnerPlant.findOne({
      _id: plantId,
      isDeleted: { $ne: true },
    }).lean();

    if (!plant) {
      throw new ErrorResponse('Plant not found', 404);
    }

    return plant;
  }

  static async ensureUniqueAccount({ email, phone }) {
    const conditions = [{ email }];

    if (phone) {
      conditions.push({ phone });
    }

    const existing = await User.findOne({
      $or: conditions,
    })
      .select('email phone')
      .lean();

    if (!existing) return;

    if (existing.email === email) {
      throw new ErrorResponse(
        'A user with this email already exists',
        409
      );
    }

    if (phone && existing.phone === phone) {
      throw new ErrorResponse(
        'A user with this phone number already exists',
        409
      );
    }

    throw new ErrorResponse(
      'An account with these details already exists',
      409
    );
  }

  static handleDuplicateKey(error) {
    if (error?.code !== 11000) return;

    const field = Object.keys(error.keyPattern || {})[0];

    const messages = {
      email: 'A user with this email already exists',
      phone: 'A user with this phone number already exists',
    };

    throw new ErrorResponse(
      messages[field] || 'An account with these details already exists',
      409
    );
  }

  static async findPlantStaff(staffId, plantId) {
    PlantStaffService.validateObjectId(staffId, 'staff ID');
    PlantStaffService.validateObjectId(plantId, 'plant ID');

    const staff = await User.findOne({
      _id: staffId,
      plantId,
      role: { $in: PlantStaffService.VALID_ROLES },
    });

    if (!staff) {
      throw new ErrorResponse(
        'Staff member not found in this plant',
        404
      );
    }

    return staff;
  }

  static async ensureAnotherActiveAdminExists(plantId, staff) {
    if (staff.role !== 'plant_admin' || !staff.isActive) {
      return;
    }

    const otherAdminCount = await User.countDocuments({
      plantId,
      _id: { $ne: staff._id },
      role: 'plant_admin',
      isActive: true,
    });

    if (otherAdminCount < 1) {
      throw new ErrorResponse(
        'Cannot demote, deactivate or remove the last active plant administrator',
        400
      );
    }
  }

  static async returnSanitizedUser(userId) {
    return User.findById(userId)
      .select(USER_PRIVATE_FIELDS)
      .lean();
  }

  // ============================================================
  // READ: LIST STAFF
  // ============================================================

  async listStaff(plantId, filter = {}) {
    PlantStaffService.validateObjectId(plantId, 'plant ID');

    // Only allow safe, explicitly supported filters.
    const safeFilter = {};

    if (typeof filter.isActive === 'boolean') {
      safeFilter.isActive = filter.isActive;
    }

    if (
      typeof filter.role === 'string' &&
      PlantStaffService.VALID_ROLES.includes(filter.role)
    ) {
      safeFilter.role = filter.role;
    }

    return User.find({
      ...safeFilter,
      plantId,
      role: { $in: PlantStaffService.VALID_ROLES },
    })
      .select(USER_PRIVATE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
  }

  // ============================================================
  // READ: GET STAFF BY ID
  // ============================================================

  async getStaffById(staffId, plantId) {
    return PlantStaffService.findPlantStaff(staffId, plantId)
      .then((user) => {
        user.password = undefined;
        user.loginAttempts = undefined;
        user.lockUntil = undefined;
        return user;
      });
  }

  // ============================================================
  // CREATE: INVITE PLANT STAFF
  // ============================================================

  async inviteStaff({
    plantId,
    firstName,
    lastName,
    email,
    phone,
    password,
    role,
    actorId,
    actorRole,
    req = null,
  }) {
    PlantStaffService.validateActor(actorId, actorRole);
    PlantStaffService.validateObjectId(plantId, 'plant ID');

    firstName = PlantStaffService.normalizeText(firstName);
    lastName = PlantStaffService.normalizeText(lastName);
    email = PlantStaffService.normalizeEmail(email);
    phone = PlantStaffService.normalizeText(phone);

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      typeof password !== 'string' ||
      !password
    ) {
      throw new ErrorResponse(
        'First name, last name, email, phone and password are required',
        400
      );
    }

    if (password.length < 8) {
      throw new ErrorResponse(
        'Password must be at least 8 characters',
        400
      );
    }

    PlantStaffService.validateRole(role);

    // Retrieve the plant and use its location, never staff GPS input.
    const plant = await PlantStaffService.getPlant(plantId);
    const gpsCoordinates =
      PlantStaffService.getPlantCoordinates(plant);

    await PlantStaffService.ensureUniqueAccount({ email, phone });

    let user;

    try {
      user = await User.create({
        firstName,
        lastName,
        email,
        phone,
        password,

        address: plant.address || 'N/A',
        city: plant.city || 'N/A',
        state: plant.state || 'N/A',

        // All staff inherit the assigned plant's coordinates.
        gpsCoordinates,

        role,
        plantId: plant._id,
        isActive: true,
        emailVerified: false,
        phoneVerified: false,
      });
    } catch (error) {
      // Covers duplicate-key races between the pre-check and insert.
      PlantStaffService.handleDuplicateKey(error);
      throw error;
    }

    await AuditService.log({
      action: 'PLANT_STAFF_ADDED',
      actorId,
      actorRole,
      entityType: 'User',
      entityId: user._id,
      newValue: {
        email: user.email,
        role: user.role,
        plantId: plant._id,
      },
      metadata: { plantId: plant._id },
      req,
    });

    return PlantStaffService.returnSanitizedUser(user._id);
  }

  // ============================================================
  // UPDATE: CHANGE STAFF ROLE
  // ============================================================

  async updateStaffRole({
    staffId,
    plantId,
    newRole,
    actorId,
    actorRole,
    req = null,
  }) {
    PlantStaffService.validateActor(actorId, actorRole);
    PlantStaffService.validateRole(newRole);

    const staff = await PlantStaffService.findPlantStaff(
      staffId,
      plantId
    );

    if (
      String(staff._id) === String(actorId) &&
      staff.role !== newRole
    ) {
      throw new ErrorResponse(
        'You cannot change your own plant staff role',
        403
      );
    }

    await PlantStaffService.ensureAnotherActiveAdminExists(
      plantId,
      staff.role !== newRole ? staff : { ...staff, role: null }
    );

    const previousRole = staff.role;
    staff.role = newRole;

    await staff.save();

    await AuditService.log({
      action: 'PLANT_STAFF_ROLE_CHANGED',
      actorId,
      actorRole,
      entityType: 'User',
      entityId: staff._id,
      previousValue: { role: previousRole },
      newValue: { role: newRole },
      metadata: { plantId },
      req,
    });

    return PlantStaffService.returnSanitizedUser(staff._id);
  }

  // ============================================================
  // UPDATE: ACTIVATE / DEACTIVATE STAFF
  // ============================================================

  async toggleStaffStatus({
    staffId,
    plantId,
    isActive,
    actorId,
    actorRole,
    req = null,
  }) {
    PlantStaffService.validateActor(actorId, actorRole);

    if (typeof isActive !== 'boolean') {
      throw new ErrorResponse(
        'isActive must be a boolean',
        400
      );
    }

    const staff = await PlantStaffService.findPlantStaff(
      staffId,
      plantId
    );

    if (
      String(staff._id) === String(actorId) &&
      !isActive
    ) {
      throw new ErrorResponse(
        'You cannot deactivate your own account here',
        403
      );
    }

    if (!isActive) {
      await PlantStaffService.ensureAnotherActiveAdminExists(
        plantId,
        staff
      );
    }

    const previousStatus = staff.isActive;
    staff.isActive = isActive;

    await staff.save();

    await AuditService.log({
      action: 'PLANT_STAFF_STATUS_CHANGED',
      actorId,
      actorRole,
      entityType: 'User',
      entityId: staff._id,
      previousValue: { isActive: previousStatus },
      newValue: { isActive },
      metadata: { plantId },
      req,
    });

    return PlantStaffService.returnSanitizedUser(staff._id);
  }

  // ============================================================
  // REMOVE: DETACH STAFF FROM PLANT
  // ============================================================

  async removeStaff({
    staffId,
    plantId,
    actorId,
    actorRole,
    req = null,
  }) {
    PlantStaffService.validateActor(actorId, actorRole);

    const staff = await PlantStaffService.findPlantStaff(
      staffId,
      plantId
    );

    if (String(staff._id) === String(actorId)) {
      throw new ErrorResponse(
        'You cannot remove your own account',
        403
      );
    }

    await PlantStaffService.ensureAnotherActiveAdminExists(
      plantId,
      staff
    );

    const previousRole = staff.role;
    const previousPlantId = staff.plantId;

    staff.isActive = false;
    staff.role = 'user';
    staff.plantId = null;

    // Keep the last known plant location as historical profile data.
    // It is not a live staff GPS reading.
    await staff.save();

    await AuditService.log({
      action: 'PLANT_STAFF_REMOVED',
      actorId,
      actorRole,
      entityType: 'User',
      entityId: staff._id,
      previousValue: {
        role: previousRole,
        plantId: String(previousPlantId),
      },
      newValue: {
        role: 'user',
        plantId: null,
        isActive: false,
      },
      metadata: { plantId },
      req,
    });

    return {
      success: true,
      staffId: staff._id.toString(),
    };
  }
}

module.exports = new PlantStaffService();
