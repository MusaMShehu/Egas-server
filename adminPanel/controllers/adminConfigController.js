const ConfigService = require('../../services/configService');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const AuditLog = require('../../models/AuditLog');

// @desc    Get all system configs
// @route   GET /api/v1/admin/config
// @access  Private/Admin
exports.getAllConfigs = asyncHandler(async (req, res, next) => {
  const configs = await ConfigService.getAllConfigs();
  res.status(200).json({ success: true, count: configs.length, data: configs });
});

// @desc    Get configs by category
// @route   GET /api/v1/admin/config/category/:category
// @access  Private/Admin
exports.getConfigsByCategory = asyncHandler(async (req, res, next) => {
  const configs = await ConfigService.getConfigsByCategory(req.params.category);
  res.status(200).json({ success: true, count: configs.length, data: configs });
});

// @desc    Update a config
// @route   PUT /api/v1/admin/config/:key
// @access  Private/Admin
exports.updateConfig = asyncHandler(async (req, res, next) => {
  const { key } = req.params;
  const { value, category, description } = req.body;

  if (value === undefined) {
    return next(new ErrorResponse('Value is required', 400));
  }

  const before = await ConfigService.getConfig(key);

  const doc = await ConfigService.setConfig(key, value, {
    category,
    description,
    actorId: req.user._id,
  });

  // Audit
  await AuditLog.create({
    user: req.user._id,
    actorRole: req.user.role,
    action: 'UPDATE_DELIVERY', // reuse an enum value; or extend enum
    details: {
      entityType: 'SystemConfig',
      entityId: doc._id,
      key: doc.key,
      before,
      after: value,
    },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json({ success: true, data: doc });
});

// @desc    Get all feature flags
// @route   GET /api/v1/admin/feature-flags
// @access  Private/Admin
exports.getAllFlags = asyncHandler(async (req, res, next) => {
  const flags = await ConfigService.getAllFlags();
  res.status(200).json({ success: true, count: flags.length, data: flags });
});

// @desc    Toggle a feature flag
// @route   PUT /api/v1/admin/feature-flags/:key
// @access  Private/Admin
exports.updateFlag = asyncHandler(async (req, res, next) => {
  const { key } = req.params;
  const { enabled, description, scope, scopeValue } = req.body;

  if (typeof enabled !== 'boolean') {
    return next(new ErrorResponse('enabled (boolean) is required', 400));
  }

  const before = await ConfigService.isFeatureEnabled(key);

  const doc = await ConfigService.setFlag(key, enabled, {
    description,
    scope,
    scopeValue,
    actorId: req.user._id,
  });

  // Audit
  await AuditLog.create({
    user: req.user._id,
    actorRole: req.user.role,
    action: 'UPDATE_DELIVERY',
    details: {
      entityType: 'FeatureFlag',
      entityId: doc._id,
      key: doc.key,
      before,
      after: enabled,
    },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json({ success: true, data: doc });
});

// @desc    Clear config/flag cache (force refresh)
// @route   POST /api/v1/admin/config/clear-cache
// @access  Private/Admin
exports.clearCache = asyncHandler(async (req, res, next) => {
  ConfigService.clearCache();
  res.status(200).json({ success: true, message: 'Config cache cleared' });
});