const express = require('express');
const {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  getOrderStats
} = require('../controllers/orderController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');