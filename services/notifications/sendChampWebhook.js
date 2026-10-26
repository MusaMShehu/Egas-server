// server/webhooks/sendchampWebhooks.js
const express = require('express');
const router = express.Router();
const SMSLog = require('../models/SMSLog');

// Sendchamp delivery report webhook
router.post('/delivery-report', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (data && data.id) {
      await SMSLog.findOneAndUpdate(
        { providerId: data.id },
        {
          status: mapSendchampWebhookStatus(data.status),
          cost: data.cost || null,
          updatedAt: new Date()
        }
      );
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

function mapSendchampWebhookStatus(status) {
  const statusMap = {
    'sent': 'sent',
    'delivered': 'delivered',
    'failed': 'failed',
    'undelivered': 'undelivered'
  };
  
  return statusMap[status] || status;
}

module.exports = router;