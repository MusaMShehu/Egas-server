const axios = require('axios');

class PaystackService {
  constructor(secretKey) {
    this.secretKey = secretKey;
    this.baseURL = 'https://api.paystack.co';
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // Initialize transaction
  async initializeTransaction(data) {
    try {
      const response = await this.axiosInstance.post('/transaction/initialize', data);
      return response.data;
    } catch (error) {
      throw new Error(`Paystack initialization failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Verify transaction
  async verifyTransaction(reference) {
    try {
      const response = await this.axiosInstance.get(`/transaction/verify/${encodeURIComponent(reference)}`);
      return response.data;
    } catch (error) {
      throw new Error(`Paystack verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Create subscription
  async createSubscription(data) {
    try {
      const response = await this.axiosInstance.post('/subscription', data);
      return response.data;
    } catch (error) {
      throw new Error(`Paystack subscription creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Disable subscription
  async disableSubscription(code, token) {
    try {
      const response = await this.axiosInstance.post('/subscription/disable', {
        code,
        token
      });
      return response.data;
    } catch (error) {
      throw new Error(`Paystack subscription disable failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // List transactions
  async listTransactions(params = {}) {
    try {
      const response = await this.axiosInstance.get('/transaction', { params });
      return response.data;
    } catch (error) {
      throw new Error(`Paystack list transactions failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = PaystackService;