const SMSLog = require('../models/SMSLogs');

class WebhookController {
    async handleSendChampWebhook(req, res) {
        try {
            const { event, data } = req.body;

            // Verify webhook signature (add your verification logic)
            // const signature = req.headers['x-sendchamp-signature'];
            // if (!this.verifySignature(signature, req.body)) {
            //     return res.status(401).json({ error: 'Invalid signature' });
            // }

            switch (event) {
                case 'sms.delivered':
                    await this.handleSMSSent(data);
                    break;
                case 'sms.failed':
                    await this.handleSMSFailed(data);
                    break;
                default:
                    console.log('Unhandled webhook event:', event);
            }

            res.status(200).json({ received: true });
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async handleSMSSent(data) {
        // Update SMS log with delivery status
        if (data.message_id) {
            await SMSLog.findOneAndUpdate(
                { providerId: data.message_id },
                {
                    status: 'delivered',
                    providerResponse: data,
                    updatedAt: new Date()
                }
            );
        }
    }

    async handleSMSFailed(data) {
        // Update SMS log with failure status
        if (data.message_id) {
            await SMSLog.findOneAndUpdate(
                { providerId: data.message_id },
                {
                    status: 'failed',
                    providerResponse: data,
                    updatedAt: new Date()
                }
            );
        }
    }

    verifySignature(signature, payload) {
        // Implement signature verification
        // This depends on SendChamp's webhook signature method
        return true; // Placeholder
    }
}

module.exports = new WebhookController();