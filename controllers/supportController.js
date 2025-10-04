const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all support tickets
// @route   GET /api/v1/support
// @route   GET /api/v1/users/:userId/support
// @access  Private (user → own tickets, admin → all)
exports.getTickets = asyncHandler(async (req, res, next) => {
  let query;

  if (req.user.role === 'admin') {
    // Admin can see all or by userId param
    query = req.params.userId
      ? SupportTicket.find({ user: req.params.userId })
      : SupportTicket.find();
  } else {
    // Normal users can only see their own
    query = SupportTicket.find({ user: req.user._id });
  }

  const tickets = await query
    .populate('user', 'firstName lastName email phone')
    .populate('responses.user', 'firstName lastName role');

  res.status(200).json({
    success: true,
    count: tickets.length,
    data: tickets
  });
});

// @desc    Get single support ticket
// @route   GET /api/v1/support/:id
// @access  Private
exports.getTicket = asyncHandler(async (req, res, next) => {
  const ticket = await SupportTicket.findById(req.params.id)
    .populate('user', 'firstName lastName email phone')
    .populate('responses.user', 'firstName lastName role');

  if (!ticket) {
    return next(new ErrorResponse(`No ticket with id ${req.params.id}`, 404));
  }

  // Only owner or admin can access
  if (
    ticket.user._id.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    return next(
      new ErrorResponse('Not authorized to access this ticket', 401)
    );
  }

  res.status(200).json({ success: true, data: ticket });
});

// @desc    Create support ticket
// @route   POST /api/v1/support
// @access  Private
exports.createTicket = asyncHandler(async (req, res, next) => {
  if (!req.user || !req.user._id) {
    return next(new ErrorResponse('Not authorized to create a ticket', 401));
  }

  // Collect text fields from body
  const { subject, description, category } = req.body;

  // Collect uploaded files (if any)
  const attachments = req.files
    ? req.files.map(file => `/uploads/support/${file.filename}`)
    : [];

  // Create ticket data
  const ticketData = {
    user: req.user._id,
    subject,
    description,
    category,
    attachments
  };

  const ticket = await SupportTicket.create(ticketData);

  res.status(201).json({
    success: true,
    data: ticket
  });
});


// @desc    Add response to ticket
// @route   PUT /api/v1/support/:id/response
// @access  Private
exports.addResponse = asyncHandler(async (req, res, next) => {
  let ticket = await SupportTicket.findById(req.params._id);

  if (!ticket) {
    return next(new ErrorResponse(`No ticket with the id of ${req.params._id}`, 404));
  }

  // Only ticket owner or admin can reply
  if (ticket.user.toString() !== req.user._id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user._id} not authorized to respond`, 401));
  }

  // If admin replies and ticket is "open", move it to "in-progress"
  if (req.user.role === 'admin' && ticket.status === 'open') {
    ticket.status = 'in-progress';
  }

  // Collect attachments (if any uploaded)
  const attachments = req.files
    ? req.files.map(file => `/uploads/support/${file.filename}`)
    : [];

  // Push response
  ticket.responses.push({
    user: req.user._id,
    message: req.body.message,
    attachments
  });

  await ticket.save();

  res.status(200).json({
    success: true,
    data: ticket
  });
});


// @desc    Update ticket status
// @route   PUT /api/v1/support/:id/status
// @access  Private/Admin
exports.updateTicketStatus = asyncHandler(async (req, res, next) => {
  const ticket = await SupportTicket.findById(req.params.id);

  if (!ticket) {
    return next(new ErrorResponse(`No ticket with id ${req.params.id}`, 404));
  }

  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can update ticket status', 403));
  }

  ticket.status = req.body.status;
  await ticket.save();

  res.status(200).json({ success: true, data: ticket });
});

// @desc    Get ticket statistics
// @route   GET /api/v1/support/stats
// @access  Private/Admin
exports.getTicketStats = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can view ticket stats', 403));
  }

  const stats = await SupportTicket.aggregate([
    {
      $group: {
        _id: '$category',
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }
      }
    }
  ]);

  res.status(200).json({ success: true, data: stats });
});


// @desc    Close a ticket
// @route   PUT /api/support/tickets/:id/close
// @access  Private (ticket owner or admin)
exports.closeTicket = asyncHandler(async (req, res, next) => {
  const ticket = await SupportTicket.findById(req.params._id);

  if (!ticket) {
    return next(new ErrorResponse(`No ticket found with id of ${req.params._id}`, 404));
  }

  // Only ticket owner or admin can close it
  if (ticket.user.toString() !== req.user._id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user._id} not authorized to close this ticket`, 401));
  }

  // Update status to "closed"
  ticket.status = 'closed';
  ticket.updatedAt = new Date();
  await ticket.save();

  res.status(200).json({
    success: true,
    data: ticket
  });
});

