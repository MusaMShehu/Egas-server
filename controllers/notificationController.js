// controllers/notificationController.js
const Notification = require('../models/Notification');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

const DEFAULT_PREFS = {
  orderUpdates: true,
  deliveryNotifications: true,
  promotionalOffers: false,
  newsletter: false,
  channels: { inApp: true, email: true, sms: true, push: true },
  quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'Africa/Lagos' },
};

// ============================================================
// GET /api/v1/notifications
// ============================================================
exports.getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly = 'false', type, includeArchived = 'false' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = { userId: req.user._id };
  if (unreadOnly === 'true') filter.read = false;
  if (type) filter.type = type;
  if (includeArchived !== 'true') filter.archived = { $ne: true };

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: req.user._id, read: false, archived: { $ne: true } }),
  ]);

  res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    unreadCount,
    pagination: { page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 },
    data: notifications,
  });
});

// ============================================================
// GET /api/v1/notifications/counts
// ============================================================
exports.getCounts = asyncHandler(async (req, res) => {
  const [total, unread, archived] = await Promise.all([
    Notification.countDocuments({ userId: req.user._id, archived: { $ne: true } }),
    Notification.countDocuments({ userId: req.user._id, read: false, archived: { $ne: true } }),
    Notification.countDocuments({ userId: req.user._id, archived: true }),
  ]);
  res.status(200).json({ success: true, data: { total, unread, archived } });
});

// ============================================================
// PATCH /api/v1/notifications/:id/read
// ============================================================
exports.markAsRead = asyncHandler(async (req, res, next) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true, readAt: new Date() },
    { new: true }
  );
  if (!notif) return next(new ErrorResponse('Notification not found', 404));
  res.status(200).json({ success: true, data: notif });
});

// PATCH /api/v1/notifications/:id/unread
exports.markAsUnread = asyncHandler(async (req, res, next) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: false, readAt: null },
    { new: true }
  );
  if (!notif) return next(new ErrorResponse('Notification not found', 404));
  res.status(200).json({ success: true, data: notif });
});

// PATCH /api/v1/notifications/read-all
exports.markAllAsRead = asyncHandler(async (req, res) => {
  const r = await Notification.updateMany(
    { userId: req.user._id, read: false, archived: { $ne: true } },
    { $set: { read: true, readAt: new Date() } }
  );
  res.status(200).json({ success: true, updated: r.modifiedCount, message: 'All marked as read' });
});

// PATCH /api/v1/notifications/:id/archive
exports.archive = asyncHandler(async (req, res, next) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { archived: true },
    { new: true }
  );
  if (!notif) return next(new ErrorResponse('Notification not found', 404));
  res.status(200).json({ success: true, data: notif });
});

// PATCH /api/v1/notifications/:id/unarchive
exports.unarchive = asyncHandler(async (req, res, next) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { archived: false },
    { new: true }
  );
  if (!notif) return next(new ErrorResponse('Notification not found', 404));
  res.status(200).json({ success: true, data: notif });
});

// ============================================================
// DELETE
// ============================================================
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const n = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!n) return next(new ErrorResponse('Notification not found', 404));
  res.status(200).json({ success: true, message: 'Notification deleted' });
});

exports.clearRead = asyncHandler(async (req, res) => {
  const r = await Notification.deleteMany({ userId: req.user._id, read: true });
  res.status(200).json({ success: true, deleted: r.deletedCount, message: 'Read notifications cleared' });
});

exports.clearAll = asyncHandler(async (req, res) => {
  const r = await Notification.deleteMany({ userId: req.user._id });
  res.status(200).json({ success: true, deleted: r.deletedCount, message: 'All notifications cleared' });
});

// controllers/notificationController.js — add
exports.registerToken = asyncHandler(async (req, res, next) => {
  const { token, platform = "web" } = req.body;
  if (!token || typeof token !== "string") {
    return next(new ErrorResponse("token is required", 400));
  }
  // Store on user (unique set). We use a per-user deviceTokens array.
  await User.findByIdAndUpdate(
    req.user._id,
    { $addToSet: { deviceTokens: token } },
    { new: true }
  );
  res.status(200).json({ success: true, message: "Token registered" });
});

exports.unregisterToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ success: false, message: "token required" });
  await User.findByIdAndUpdate(req.user._id, { $pull: { deviceTokens: token } });
  res.status(200).json({ success: true, message: "Token removed" });
});

// ============================================================
// PREFERENCES
// ============================================================
exports.getPreferences = asyncHandler(async (req, res) => {
  const u = await User.findById(req.user._id).select('notificationPreferences').lean();
  const stored = u?.notificationPreferences || {};
  const merged = {
    ...DEFAULT_PREFS,
    ...stored,
    channels: { ...DEFAULT_PREFS.channels, ...(stored.channels || {}) },
    quietHours: { ...DEFAULT_PREFS.quietHours, ...(stored.quietHours || {}) },
  };
  res.status(200).json({ success: true, data: merged });
});

exports.updatePreferences = asyncHandler(async (req, res, next) => {
  const body = req.body || {};
  const updates = {};

  // Boolean category toggles
  ['orderUpdates', 'deliveryNotifications', 'promotionalOffers', 'newsletter'].forEach((k) => {
    if (typeof body[k] === 'boolean') updates[`notificationPreferences.${k}`] = body[k];
  });

  // Channel toggles
  if (body.channels && typeof body.channels === 'object') {
    ['inApp', 'email', 'sms', 'push'].forEach((c) => {
      if (typeof body.channels[c] === 'boolean') updates[`notificationPreferences.channels.${c}`] = body.channels[c];
    });
  }

  // Quiet hours
  if (body.quietHours && typeof body.quietHours === 'object') {
    const q = body.quietHours;
    if (typeof q.enabled === 'boolean') updates['notificationPreferences.quietHours.enabled'] = q.enabled;
    if (typeof q.start === 'string' && /^\d{2}:\d{2}$/.test(q.start)) updates['notificationPreferences.quietHours.start'] = q.start;
    if (typeof q.end === 'string' && /^\d{2}:\d{2}$/.test(q.end)) updates['notificationPreferences.quietHours.end'] = q.end;
    if (typeof q.timezone === 'string') updates['notificationPreferences.quietHours.timezone'] = q.timezone;
  }

  if (Object.keys(updates).length === 0) {
    return next(new ErrorResponse('No valid preference fields provided', 400));
  }

  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, {
    new: true,
    runValidators: true,
  }).select('notificationPreferences');

  const stored = user?.notificationPreferences || {};
  const merged = {
    ...DEFAULT_PREFS,
    ...stored,
    channels: { ...DEFAULT_PREFS.channels, ...(stored.channels || {}) },
    quietHours: { ...DEFAULT_PREFS.quietHours, ...(stored.quietHours || {}) },
  };

  res.status(200).json({ success: true, message: 'Preferences updated', data: merged });
});