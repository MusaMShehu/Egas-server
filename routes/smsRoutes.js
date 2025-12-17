const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const NotificationService = require('../services/notificationService');
const SendChampService = require('../services/sendchampService');
const WebhookController = require('../controllers/webhookController');
const SMSLog = require('../models/SMSLog');

// Webhook endpoint (no auth required)
router.post('/webhook/sendchamp', WebhookController.handleSendChampWebhook);

// Send promotional SMS (admin only)
router.post('/promotional', adminAuth, async (req, res) => {
    try {
        const { phone, message, userName } = req.body;
        
        const result = await NotificationService.sendPromotionalSMS(
            phone,
            message,
            userName
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send bulk promotional SMS (admin only)
router.post('/promotional/bulk', adminAuth, async (req, res) => {
    try {
        const { recipients, message } = req.body;
        
        if (!recipients || !Array.isArray(recipients)) {
            return res.status(400).json({
                success: false,
                message: 'Recipients must be an array'
            });
        }

        const result = await NotificationService.sendBulkPromotionalSMS(
            recipients,
            message
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Check SMS balance (admin only)
router.get('/balance', adminAuth, async (req, res) => {
    try {
        const result = await SendChampService.getBalance();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get SMS logs (admin only)
router.get('/logs', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, type, status, startDate, endDate } = req.query;
        
        const query = {};
        
        if (type) query.type = type;
        if (status) query.status = status;
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const logs = await SMSLog.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const total = await SMSLog.countDocuments(query);

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get delivery status for specific SMS
router.get('/status/:logId', adminAuth, async (req, res) => {
    try {
        const log = await SMSLog.findById(req.params.logId);
        
        if (!log) {
            return res.status(404).json({
                success: false,
                message: 'SMS log not found'
            });
        }

        if (log.providerId) {
            const status = await SendChampService.checkDeliveryStatus(log.providerId);
            return res.json(status);
        }

        res.json({
            success: true,
            data: {
                status: log.status,
                updatedAt: log.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Test SMS endpoint (admin only)
router.post('/test', adminAuth, async (req, res) => {
    try {
        const { phone, message } = req.body;
        
        const result = await SendChampService.sendSMS(phone, message);
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;