const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const { validateObjectId } = require('../../middleware/validation');

const {
  listDisputes,
  getDispute,
  createDispute,
  resolveDispute,
  addComment,
} = require('../controllers/adminDisputeController');

router.use(protect);
router.use(authorize('admin', 'superadmin', 'super-admin'));

router.get('/', listDisputes);
router.post('/', createDispute);
router.get('/:id', validateObjectId('id'), getDispute);
router.post('/:id/resolve', validateObjectId('id'), resolveDispute);
router.post('/:id/comment', validateObjectId('id'), addComment);

module.exports = router;