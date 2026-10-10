const ConfigService = require('../services/configService');
const ErrorResponse = require('../utils/errorResponse');

/**
 * Feature guard middleware.
 * Blocks requests to routes whose feature flag is disabled.
 *
 * Usage:
 *   router.post('/path', protect, featureGuard('PARTNER_PLANT_WORKFLOW'), handler)
 */
const featureGuard = (flagKey) => async (req, res, next) => {
  try {
    const enabled = await ConfigService.isFeatureEnabled(flagKey);

    if (!enabled) {
      return next(new ErrorResponse('Feature not available', 404));
    }

    next();
  } catch (error) {
    // Fail-safe: block if we cannot determine flag state
    console.error(`featureGuard error for ${flagKey}:`, error.message);
    return next(new ErrorResponse('Feature check failed', 500));
  }
};

module.exports = featureGuard;