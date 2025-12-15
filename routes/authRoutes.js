const express = require('express');
const {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  updatePreferences,
  updatePassword,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { profileUpload } = require('../middleware/upload');




router.post('/register', profileUpload.single('image'), register);
router.post('/login', login);
router.get('/logout', logout);
router.get('/me', protect, getProfile);

router.put('/profile', protect, profileUpload.single('image'), updateProfile);
router.put('/profile/preferences/:id', protect, updatePreferences);
router.put('/updatepassword', protect, updatePassword);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);

module.exports = router;