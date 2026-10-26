const axios = require('axios');
require('dotenv').config();

class SendChampService {
    constructor() {
        this.apiKey = process.env.SENDCHAMP_API_KEY;
        this.baseURL = process.env.SENDCHAMP_BASE_URL;
        this.senderName = process.env.SENDCHAMP_SENDER_NAME;
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

   async sendSMS(to, message, route = 'dnd') {
    try {
        const response = await this.client.post('/sms/send', {
            to: to, // MUST be string
            message,
            sender_name: this.senderName,
            route
        });

        return {
            success: true,
            data: response.data,
            message: 'SMS sent successfully'
        };
    } catch (error) {
        console.error('SendChamp SMS Error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message,
            message: 'Failed to send SMS'
        };
    }
}

   

    async sendBulkSMS(recipients, message, route = 'dnd') {
        try {
            const response = await this.client.post('/sms/send/bulk', {
                to: recipients,
                message,
                sender_name: this.senderName,
                route
            });

            return {
                success: true,
                data: response.data,
                message: 'Bulk SMS sent successfully'
            };
        } catch (error) {
            console.error('SendChamp Bulk SMS Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message,
                message: 'Failed to send bulk SMS'
            };
        }
    }

    

    async checkDeliveryStatus(smsId) {
        try {
            const response = await this.client.get(`/sms/status/${smsId}`);
            return {
                success: true,
                data: response.data,
                message: 'Delivery status retrieved'
            };
        } catch (error) {
            console.error('SendChamp Status Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message,
                message: 'Failed to get delivery status'
            };
        }
    }

    /**
     * Get SMS balance
     */
    async getBalance() {
        try {
            const response = await this.client.get('/wallet/balance');
            return {
                success: true,
                data: response.data,
                message: 'Balance retrieved successfully'
            };
        } catch (error) {
            console.error('SendChamp Balance Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message,
                message: 'Failed to get balance'
            };
        }
    }
}

module.exports = new SendChampService();