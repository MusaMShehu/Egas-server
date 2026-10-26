// services/notificationService.js
const admin = require('firebase-admin');
const Notification = require('../models/Notification');
const UserDevice = require('../models/UserDevice');
const User = require('../models/User');
const axios = require('axios');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

class NotificationService {
  
  // Get user's active device tokens
  static async getUserDeviceTokens(userId) {
    try {
      const devices = await UserDevice.find({
        userId,
        isActive: true,
        'preferences.pushNotifications': true
      });
      
      return devices.map(device => ({
        token: device.fcmToken || device.deviceToken,
        platform: device.platform,
        preferences: device.preferences
      }));
    } catch (error) {
      console.error('Error getting user device tokens:', error);
      return [];
    }
  }

  // Send push notification
  static async sendPushNotification(userId, notificationData) {
    try {
      // Get user's device tokens
      const userTokens = await this.getUserDeviceTokens(userId);
      
      if (userTokens.length === 0) {
        console.log('No active device tokens found for user:', userId);
        return { success: false, reason: 'No active devices' };
      }

      // Filter based on notification type preferences
      const filteredTokens = userTokens.filter(device => {
        const prefs = device.preferences;
        
        switch (notificationData.subType) {
          case 'promotional':
            return prefs.promotional;
          case 'order_created':
          case 'order_confirmed':
          case 'order_delivered':
          case 'order_out_for_delivery':
            return prefs.orderUpdates;
          case 'subscription_delivery_reminder':
          case 'subscription_ending_warning':
            return prefs.subscriptionReminders;
          default:
            return prefs.pushNotifications;
        }
      });

      if (filteredTokens.length === 0) {
        return { success: false, reason: 'User has disabled this notification type' };
      }

      const results = [];
      
      // Prepare notification payload
      const payload = {
        notification: {
          title: notificationData.title,
          body: notificationData.message,
          icon: '/logo.png',
          badge: '1',
          click_action: `${process.env.FRONTEND_URL}/notifications`
        },
        data: {
          notificationId: notificationData._id?.toString() || '',
          type: notificationData.type,
          subType: notificationData.subType,
          relatedId: notificationData.relatedId?.toString() || '',
          userId: userId.toString(),
          timestamp: new Date().toISOString(),
          priority: notificationData.priority || 'medium'
        },
        android: {
          priority: notificationData.priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: 'default',
            channelId: notificationData.priority === 'high' ? 'high_priority' : 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'mutable-content': 1
            }
          }
        },
        webpush: {
          headers: {
            Urgency: notificationData.priority === 'high' ? 'high' : 'normal'
          }
        }
      };

      // Send to each device
      for (const device of filteredTokens) {
        try {
          const message = {
            ...payload,
            token: device.token
          };

          const response = await admin.messaging().send(message);
          results.push({
            deviceToken: device.token,
            success: true,
            messageId: response
          });
        } catch (deviceError) {
          console.error('Error sending to device:', device.token, deviceError);
          
          // If token is invalid, mark device as inactive
          if (deviceError.code === 'messaging/registration-token-not-registered') {
            await UserDevice.updateOne(
              { deviceToken: device.token },
              { isActive: false }
            );
          }
          
          results.push({
            deviceToken: device.token,
            success: false,
            error: deviceError.message
          });
        }
      }

      // Update notification with sent status
      await Notification.findByIdAndUpdate(notificationData._id, {
        $set: {
          'sentVia': ['push', ...notificationData.sentVia],
          'deviceTokens': filteredTokens.map(d => d.token),
          'metadata.sentResults': results
        }
      });

      return {
        success: true,
        totalDevices: filteredTokens.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };

    } catch (error) {
      console.error('Error in sendPushNotification:', error);
      throw error;
    }
  }

  // Store notification in database
  static async storeNotification(notificationData) {
    try {
      const notification = new Notification(notificationData);
      await notification.save();
      return notification;
    } catch (error) {
      console.error('Error storing notification:', error);
      throw error;
    }
  }

  // Send notification with retry logic
  static async sendNotification(userId, notificationConfig) {
    try {
      // 1. Store notification in database first
      const notification = await this.storeNotification({
        userId,
        ...notificationConfig,
        status: 'pending'
      });

      // 2. Send push notification
      let pushResult = { success: false };
      try {
        pushResult = await this.sendPushNotification(userId, notification);
      } catch (pushError) {
        console.error('Push notification failed:', pushError);
      }

      // 3. Update notification status
      await Notification.findByIdAndUpdate(notification._id, {
        $set: {
          status: pushResult.success ? 'sent' : 'failed',
          'metadata.pushResult': pushResult
        }
      });

      // 4. Send email notification if push failed or as backup
      if (!pushResult.success || notificationConfig.priority === 'high') {
        await this.sendEmailNotification(userId, notificationConfig);
      }

      return {
        notificationId: notification._id,
        pushResult,
        success: pushResult.success || true // Consider email as backup success
      };

    } catch (error) {
      console.error('Error in sendNotification:', error);
      throw error;
    }
  }

  // Send email notification
  static async sendEmailNotification(userId, notificationData) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) return;

      const emailData = {
        to: user.email,
        subject: notificationData.title,
        template: 'notification',
        context: {
          title: notificationData.title,
          message: notificationData.message,
          type: notificationData.type,
          userName: user.name,
          actionUrl: `${process.env.FRONTEND_URL}/notifications/${notificationData._id}`
        }
      };

      // Call your email service
      await axios.post(`${process.env.EMAIL_SERVICE_URL}/send`, emailData);
      
      // Update notification with email sent status
      await Notification.findByIdAndUpdate(notificationData._id, {
        $addToSet: { sentVia: 'email' }
      });

    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  // Batch notification sender
  static async sendBatchNotifications(userIds, notificationConfig) {
    const results = [];
    
    for (const userId of userIds) {
      try {
        const result = await this.sendNotification(userId, notificationConfig);
        results.push({ userId, success: true, ...result });
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Get user notifications
  static async getUserNotifications(userId, options = {}) {
    const {
      limit = 50,
      skip = 0,
      read = null,
      type = null,
      subType = null
    } = options;

    const query = { userId };
    
    if (read !== null) query.read = read;
    if (type) query.type = type;
    if (subType) query.subType = subType;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      userId,
      read: false
    });

    return {
      notifications,
      pagination: {
        total,
        limit,
        skip,
        hasMore: total > skip + limit
      },
      unreadCount
    };
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { 
        $set: { 
          read: true,
          readAt: new Date()
        }
      },
      { new: true }
    );
    
    return notification;
  }

  // Mark all notifications as read
  static async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { userId, read: false },
      { 
        $set: { 
          read: true,
          readAt: new Date()
        }
      }
    );
    
    return result.modifiedCount;
  }
}

module.exports = NotificationService;