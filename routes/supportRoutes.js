const express = require('express');
const {
  getTickets,
  getTicket,
  createTicket,
  addResponse,
  closeTicket,
  updateTicketStatus,
  getTicketStats
} = require('../controllers/supportController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/uploadMiddleware');

router
  .route('/tickets')
  .get(protect, getTickets)
  .post(protect, uploadMultiple('attachments', 5), createTicket);

router
  .route('/tickets/:id')
  .get(protect, getTicket);

router
  .route('/tickets/response/:_id')
  .put(protect, uploadMultiple('attachments', 5), addResponse);

router
  .route('/tickets/:_id/close')
  .put(protect, closeTicket);


router
  .route('/:id/status')
  .put(protect, authorize('admin'), updateTicketStatus);

router
  .route('/stats')
  .get(protect, authorize('admin'), getTicketStats);

module.exports = router;