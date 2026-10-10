// const ErrorResponse = require('../utils/errorResponse');

// /**
//  * plantScope — Enforces that a plant user only accesses their own plant.
//  *
//  * Behavior:
//  *  - If req.user.role is NOT plant_*, next() (this middleware is a no-op for non-plant users)
//  *  - If req.user.role IS plant_*:
//  *      - req.plantId = req.user.plantId  (string, always trusted from JWT/db)
//  *      - If a plantId param exists in route, verify it matches req.user.plantId
//  *
//  * Usage on any plant-scoped route:
//  *   router.use(protect, plantScope, ...)
//  */
// const plantScope = (options = {}) => {
//   const { paramName = 'plantId', requirePlant = false } = options;

//   return (req, res, next) => {
//     const role = req.user?.role;
//     const isPlantUser = typeof role === 'string' && role.startsWith('plant_');

//     if (!isPlantUser) {
//       // Non-plant user — this middleware does nothing; admin routes handle their own auth
//       if (requirePlant) {
//         return next(new ErrorResponse('Plant access required', 403));
//       }
//       return next();
//     }

//     // Plant user: must have plantId
//     if (!req.user.plantId) {
//       return next(new ErrorResponse('User is not assigned to a plant', 403));
//     }

//     // Expose canonical plantId to downstream handlers
//     req.plantId = req.user.plantId.toString();

//     // If URL/body provides a different plantId, reject
//     const requestedPlantId =
//       req.params?.[paramName] || req.body?.[paramName] || null;

//     if (requestedPlantId && requestedPlantId.toString() !== req.plantId) {
//       return next(new ErrorResponse('Not authorized to access this plant', 403));
//     }

//     next();
//   };
// };

// module.exports = plantScope;























const User = require('../models/User');
const PartnerPlant = require('../models/PartnerPlant');
const ErrorResponse = require('../utils/errorResponse');

const PLANT_ROLES = [
  'plant_admin',
  'plant_supervisor',
  'plant_operator',
  'plant_staff',
];

const plantScope = (options = {}) => {
  const {
    paramName = 'plantId',
    requirePlant = false,
  } = options;

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(
          new ErrorResponse('Authentication required', 401)
        );
      }

      const userId =
        req.user._id ||
        req.user.id ||
        req.user.userId;

      if (!userId) {
        return next(
          new ErrorResponse(
            'Authenticated user ID is missing',
            401
          )
        );
      }

      // Reload the latest role and plant assignment.
      const user = await User.findById(userId)
        .select('_id role plantId isActive')
        .lean();

      if (!user) {
        return next(
          new ErrorResponse('User account not found', 401)
        );
      }

      if (user.isActive === false) {
        return next(
          new ErrorResponse('User account is inactive', 403)
        );
      }

      const isPlantUser = PLANT_ROLES.includes(user.role);

      // Routes requiring plant access must reject non-plant users.
      if (!isPlantUser) {
        if (requirePlant) {
          return next(
            new ErrorResponse(
              'Plant access required',
              403
            )
          );
        }

        return next();
      }

      if (!user.plantId) {
        return next(
          new ErrorResponse(
            'Your account is not assigned to a plant',
            403
          )
        );
      }

      const plant = await PartnerPlant.findOne({
        _id: user.plantId,
        isDeleted: { $ne: true },
      }).lean();

      if (!plant) {
        return next(
          new ErrorResponse(
            'Assigned partner plant was not found',
            403
          )
        );
      }

      const canonicalPlantId = user.plantId.toString();

      const requestedPlantId =
        req.params?.[paramName] ||
        req.body?.[paramName] ||
        req.query?.[paramName];

      if (
        requestedPlantId &&
        requestedPlantId.toString() !== canonicalPlantId
      ) {
        return next(
          new ErrorResponse(
            'Not authorized to access this plant',
            403
          )
        );
      }

      req.plantId = canonicalPlantId;
      req.plant = plant;

      // Preserve existing authenticated-user fields.
      req.user = {
        ...req.user,
        _id: user._id,
        role: user.role,
        plantId: user.plantId,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = plantScope;
