// server/routes/sendchampSms.js
const express = require('express');
const router = express.Router();
const sendchampSmsService = require('../services/sendChampSmsService');
const SMSLog = require('../models/SMSLog');
const SMSPreferences = require('../models/SMSPreferences');

// Send SMS notification
router.post('/send-sms', async (req, res) => {
  try {
    const { to, message, type, userId } = req.body;

    const result = await sendchampSmsService.sendSMS(userId, type, message, to);

    res.json({
      success: true,
      messageId: result.messageId,
      status: result.status,
      provider: 'sendchamp'
    });

  } catch (error) {
    console.error('SMS sending error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check SMS balance
router.get('/balance', async (req, res) => {
  try {
    const balance = await sendchampSmsService.checkBalance();
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SMS status
router.get('/status/:messageId', async (req, res) => {
  try {
    const status = await sendchampSmsService.getSMSStatus(req.params.messageId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user SMS preferences
router.get('/preferences/:userId', async (req, res) => {
  try {
    const preferences = await SMSPreferences.findOne({
      userId: req.params.userId
    });
    
    res.json(preferences || getDefaultPreferences());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update SMS preferences
router.put('/preferences/:userId', async (req, res) => {
  try {
    const preferences = await SMSPreferences.findOneAndUpdate(
      { userId: req.params.userId },
      req.body,
      { new: true, upsert: true }
    );
    
    res.json(preferences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SMS logs for user
router.get('/logs/:userId', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const logs = await SMSLog.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await SMSLog.countDocuments({ userId: req.params.userId });
    
    res.json({
      logs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getDefaultPreferences() {
  return {
    enabled: true,
    preferences: {
      accountAlerts: true,
      orderUpdates: true,
      orderConfirmation: true,
      orderDelivery: true,
      subscriptionAlerts: true,
      subscriptionReminders: true,
      subscriptionChanges: true,
      transactionAlerts: true,
      walletUpdates: true,
      supportUpdates: true,
      securityAlerts: true,
      promotional: false,
      marketing: false,
      abandonedCart: true
    },
    dailyLimit: 15,
    quietHours: {
      start: '22:00',
      end: '08:00'
    }
  };
}

module.exports = router;