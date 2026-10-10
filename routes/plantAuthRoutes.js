const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const plantScope = require('../middleware/plantScope');

const {
  login,
  refresh,
  logout,
  me,
} = require('../controllers/plantAuthController');

// Public
router.post('/login', login);
router.post('/refresh', refresh);

// Private (plant only)
router.post('/logout', protect, plantScope({ requirePlant: true }), logout);
router.get('/me', protect, plantScope({ requirePlant: true }), me);

module.exports = router;