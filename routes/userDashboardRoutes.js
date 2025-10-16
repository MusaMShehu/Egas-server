const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/userDashboardController');
const { protect } = require('../middleware/auth');
const { ensureWallet } = require('../middleware/ensureWallet');

router.get('/overview', protect, ensureWallet, getDashboardStats);

module.exports = router;
