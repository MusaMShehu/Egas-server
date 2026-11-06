// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth'); // adjust to your middleware
const ctrl = require('../controllers/notificationController');

router.use(protect);

// Static paths FIRST (must come before /:id)
router.get('/', ctrl.getNotifications);
router.get('/counts', ctrl.getCounts);
router.get('/preferences', ctrl.getPreferences);
router.put('/preferences', ctrl.updatePreferences);
router.patch('/read-all', ctrl.markAllAsRead);
router.delete('/clear-read', ctrl.clearRead);
router.delete('/clear-all', ctrl.clearAll);

// Dynamic paths
router.patch('/:id/read', ctrl.markAsRead);
router.patch('/:id/unread', ctrl.markAsUnread);
router.patch('/:id/archive', ctrl.archive);
router.patch('/:id/unarchive', ctrl.unarchive);
router.delete('/:id', ctrl.deleteNotification);

router.post('/register-token', ctrl.registerToken);
router.delete('/token/:token', ctrl.unregisterToken);

module.exports = router;