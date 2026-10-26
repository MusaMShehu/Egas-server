const express = require('express');
const {
  getTickets,
  getTicket,
  createTicket,
  addResponse,
  closeTicket,
  updateTicketStatus,
  getTicketStats,
  getTicketWithResponses
} = require('../controllers/supportController');

const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { supportUpload, supportResponseUpload } = require('../middleware/upload');

// Use consistent parameter names (use :id instead of :_id)
router.route('/')
  .get(protect, getTickets)
  .post(protect, supportUpload.array('images', 5), createTicket);

router.route('/stats')
  .get(protect, authorize('admin'), getTicketStats);

router.route('/:id')
  .get(protect, getTicketWithResponses);

router.route('/:id/response')
  .put(protect, supportResponseUpload.array('attachments', 5), addResponse);

router.route('/:id/close')
  .put(protect, closeTicket);

router.route('/:id/status')
  .put(protect, authorize('admin'), updateTicketStatus);

module.exports = router;