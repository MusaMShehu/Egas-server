const express = require('express');
const {
  register,
  login,
  logout,
  refreshToken,
  getProfile,
  updateProfile,
  updatePreferences,
  updatePassword,
  forgotPassword,
  resetPassword,
  registerMobile,
  loginMobile,
  refreshTokenMobile
} = require('../controllers/authController');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { profileUpload } = require('../middleware/upload');




router.post('/register', profileUpload.single('profileImage'), register);
router.post('/register-mobile', profileUpload.single('profileImage'), registerMobile);
router.post('/login', login);
router.post('/login-mobile', loginMobile);
router.get('/logout', logout);
router.get('/me', protect, getProfile);

router.post('/refresh', refreshToken);
router.post('/refresh-mobile', refreshTokenMobile);

router.put('/profile', protect, profileUpload.single('image'), updateProfile);
router.put('/profile/preferences/:id', protect, updatePreferences);
router.put('/updatepassword', protect, updatePassword);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);

module.exports = router;