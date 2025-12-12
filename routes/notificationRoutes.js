// routes/notifications.js
const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting for notification endpoints
const notificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Apply auth middleware to all routes
router.use(auth);

// Store device token
router.post('/token', notificationLimiter, async (req, res) => {
  try {
    const { token, platform, browser, deviceModel, osVersion, preferences } = req.body;
    const userId = req.user.id;

    // Check if token already exists
    let device = await UserDevice.findOne({ deviceToken: token });
    
    if (device) {
      // Update existing device
      device.lastActive = new Date();
      device.isActive = true;
      device.platform = platform || device.platform;
      device.browser = browser || device.browser;
      device.deviceModel = deviceModel || device.deviceModel;
      device.osVersion = osVersion || device.osVersion;
      device.preferences = { ...device.preferences, ...preferences };
      
      // Handle FCM token for web
      if (platform === 'web' && token.startsWith('fcm_')) {
        device.fcmToken = token;
      }
      
      await device.save();
    } else {
      // Create new device entry
      device = new UserDevice({
        userId,
        deviceToken: token,
        platform: platform || 'web',
        browser,
        deviceModel,
        osVersion,
        lastActive: new Date(),
        preferences: preferences || {
          pushNotifications: true,
          promotional: true,
          orderUpdates: true,
          subscriptionReminders: true
        }
      });
      
      // Handle FCM token for web
      if (platform === 'web' && token.startsWith('fcm_')) {
        device.fcmToken = token;
      }
      
      await device.save();
    }

    res.json({
      success: true,
      message: 'Device token stored successfully'
    });
  } catch (error) {
    console.error('Error storing device token:', error);
    res.status(500).json({ error: 'Failed to store device token' });
  }
});

// Send notification
router.post('/send', async (req, res) => {
  try {
    const {
      title,
      message,
      type = 'system',
      subType,
      relatedId,
      priority = 'medium',
      data = {},
      scheduledFor
    } = req.body;

    const userId = req.user.id;

    // Validate required fields
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    // Prepare notification config
    const notificationConfig = {
      title,
      message,
      type,
      subType,
      relatedId,
      priority,
      data,
      sentVia: ['in_app']
    };

    // If scheduled for later
    if (scheduledFor) {
      notificationConfig.scheduledFor = new Date(scheduledFor);
      notificationConfig.status = 'scheduled';
      
      const notification = await NotificationService.storeNotification({
        userId,
        ...notificationConfig
      });

      return res.json({
        success: true,
        message: 'Notification scheduled',
        notificationId: notification._id,
        scheduledFor: notification.scheduledFor
      });
    }

    // Send immediate notification
    const result = await NotificationService.sendNotification(userId, notificationConfig);

    res.json({
      success: true,
      message: 'Notification sent successfully',
      ...result
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Get user notifications
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { 
      limit = 20, 
      skip = 0, 
      read, 
      type, 
      subType 
    } = req.query;

    // Verify user can access these notifications
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await NotificationService.getUserNotifications(userId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      read: read === 'true' ? true : read === 'false' ? false : null,
      type,
      subType
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    const notification = await NotificationService.markAsRead(notificationId, userId);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all as read
router.put('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const count = await NotificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: `Marked ${count} notifications as read`,
      count
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Get notification statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = await Notification.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $facet: {
          byType: [
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          byDay: [
            { $match: { createdAt: { $gte: today } } },
            { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
            { $sort: { '_id': 1 } }
          ],
          unreadByType: [
            { $match: { read: false } },
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          recentActivity: [
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            { 
              $project: {
                title: 1,
                type: 1,
                subType: 1,
                createdAt: 1,
                read: 1
              }
            }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch notification statistics' });
  }
});

// Delete notification
router.delete('/:notificationId', async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    const result = await Notification.deleteOne({
      _id: notificationId,
      userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Clear all notifications
router.delete('/clear/all', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Notification.deleteMany({ userId });

    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} notifications`,
      count: result.deletedCount
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

module.exports = router;