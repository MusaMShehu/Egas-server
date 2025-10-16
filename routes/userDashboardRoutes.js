const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/userDashboardController');
const { protect } = require('../middleware/auth');

router.get('/overview', protect, getDashboardStats);

module.exports = router;
