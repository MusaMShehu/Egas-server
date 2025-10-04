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


router
  .route('/')
  .get(protect, getOrders)
  .post(protect, createOrder);

router
  .route('/:_id')
  .get(protect, getOrder)
  .put(protect, updateOrder)
  .delete(protect, deleteOrder);

router
.route('/stats')
.get(protect, getOrderStats);

module.exports = router;