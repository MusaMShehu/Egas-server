const express = require('express');
const router = express.Router();
const {
  getSupportTickets,
  getSupportTicket,
  updateTicketStatus,
  addResponse,
  getTicketStats,
  createSupportTicket,
  deleteSupportTicket,
  bulkUpdateTicketStatus,
  getTicketsByUser
} = require('../controllers/supportManagementController');
const { protect, authorize } = require('../../middleware/auth');
const { supportUpload } = require('../../middleware/upload');
// Apply authentication and authorization to all routes
router.use(protect);
router.use(authorize('admin'));

router.route('/')
  .get(getSupportTickets)
  // .post(upload.array('attachments', 5), createSupportTicket);

router.route('/stats/overview')
  .get(getTicketStats);

router.route('/bulk/status')
  .patch(bulkUpdateTicketStatus);

router.route('/user/:userId')
  .get(getTicketsByUser);

router.route('/:id')
  .get(getSupportTicket)
  .delete(deleteSupportTicket);

router.route('/:id/status')
  .patch(updateTicketStatus);

router.route('/:id/respond')
  // .post(upload.array('attachments', 5), addResponse);

module.exports = router;