const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("../middleware/async");
const NotificationService = require("../services/notifications/notificationService");
const emailService = require("../services/notifications/emailService");
const cloudinary = require('../config/cloudinary');

// @desc    Get all support tickets
// @route   GET /api/v1/support
// @route   GET /api/v1/users/:userId/support
// @access  Private (user → own tickets, admin → all)
exports.getTickets = asyncHandler(async (req, res, next) => {
  let query;

  if (req.user.role === "admin") {
    // Admin can see all or by userId param
    query = req.params.userId
      ? SupportTicket.find({ user: req.params.userId })
      : SupportTicket.find();
  } else {
    // Normal users can only see their own
    query = SupportTicket.find({ user: req.user._id });
  }

  const tickets = await query
    .populate("user", "firstName lastName email phone")
    .populate("responses.user", "firstName lastName role");

  res.status(200).json({
    success: true,
    count: tickets.length,
    data: tickets,
  });
});



// @desc    Get a single support ticket
// @route   GET /api/v1/support/:id
// @access  Private (ticket owner or admin)
exports.getTicket = asyncHandler(async (req, res, next) => {
  const ticketId = req.params.id;

  if (!ticketId) {
    return next(new ErrorResponse("Ticket ID is required", 400));
  }

  if (!req.user || !req.user._id) {
    return next(new ErrorResponse("Authentication required", 401));
  }

  // Find the ticket and populate related user information.
  const ticket = await SupportTicket.findById(ticketId)
    .populate("user", "firstName lastName email phone profileImage")
    .populate("responses.user", "firstName lastName email role profileImage")
    .populate("assignedTo", "firstName lastName email");

  if (!ticket) {
    return next(
      new ErrorResponse(`No support ticket found with ID ${ticketId}`, 404)
    );
  }

  // Normalize IDs to strings to avoid ObjectId-versus-string mismatches.
  const ticketOwnerId =
    ticket.user?._id?.toString() ||
    ticket.user?.toString();

  const currentUserId = req.user._id.toString();

  // Permit only the ticket owner or an administrator.
  const isOwner =
    Boolean(ticketOwnerId) &&
    ticketOwnerId === currentUserId;

  const isAdmin = [
    "admin",
    "superadmin",
    "super-admin",
  ].includes(String(req.user.role || "").toLowerCase());

  if (!isOwner && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to access this ticket",
        403
      )
    );
  }

  return res.status(200).json({
    success: true,
    data: ticket,
  });
});



// @desc    Get a support ticket with its responses and attachments
// @route   GET /api/v1/support/:id
// @access  Private (ticket owner or admin)
exports.getTicketWithResponses = asyncHandler(async (req, res, next) => {
  const ticketId = req.params.id || req.params._id;

  if (!ticketId) {
    return next(new ErrorResponse("Ticket ID is required", 400));
  }

  if (!req.user || !req.user._id) {
    return next(new ErrorResponse("Authentication required", 401));
  }

  // Fetch the ticket and its related documents.
  const ticket = await SupportTicket.findById(ticketId)
    .populate({
      path: "user",
      select: "firstName lastName email phone profileImage",
    })
    .populate({
      path: "responses.user",
      select: "firstName lastName email profileImage role",
    })
    .populate({
      path: "assignedTo",
      select: "firstName lastName email",
    });

  if (!ticket) {
    return next(
      new ErrorResponse(
        `No support ticket found with ID ${ticketId}`,
        404
      )
    );
  }

  // Normalize the owner and authenticated-user IDs.
  // This supports both populated and unpopulated ticket.user values.
  const ticketOwnerId =
    ticket.user?._id?.toString() ||
    ticket.user?.toString();

  const currentUserId = req.user._id.toString();

  const isOwner =
    Boolean(ticketOwnerId) &&
    ticketOwnerId === currentUserId;

  const isAdmin = [
    "admin",
    "superadmin",
    "super-admin",
  ].includes(String(req.user.role || "").toLowerCase());

  // Enforce object-level authorization before returning ticket details.
  if (!isOwner && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to view this ticket",
        403
      )
    );
  }

  // Safely format ticket images for the frontend.
  const formattedImages = (ticket.images || []).map((img) => {
    const imageUrl = img.secure_url || img.url;

    let thumbnail = imageUrl;

    if (img.public_id && img.secure_url) {
      thumbnail = cloudinary.url(img.public_id, {
        width: 200,
        height: 200,
        crop: "fill",
        quality: "auto",
        fetch_format: "auto",
      });
    }

    return {
      ...(
        typeof img.toObject === "function"
          ? img.toObject()
          : img
      ),
      public_id: img.public_id,
      url: imageUrl,
      thumbnail,
    };
  });

  // Safely format responses and their attachments.
  const formattedResponses = (ticket.responses || []).map(
    (response) => {
      const responseData =
        typeof response.toObject === "function"
          ? response.toObject()
          : response;

      const formattedAttachments = (
        response.attachments || []
      ).map((attachment) => {
        const attachmentUrl =
          attachment.secure_url || attachment.url;

        let thumbnail = attachmentUrl;

        if (
          attachment.public_id &&
          attachment.secure_url
        ) {
          thumbnail = cloudinary.url(
            attachment.public_id,
            {
              width: 200,
              height: 200,
              crop: "fill",
              quality: "auto",
              fetch_format: "auto",
            }
          );
        }

        return {
          ...(
            typeof attachment.toObject === "function"
              ? attachment.toObject()
              : attachment
          ),
          public_id: attachment.public_id,
          url: attachmentUrl,
          thumbnail,
        };
      });

      return {
        ...responseData,
        attachments: formattedAttachments,
      };
    }
  );

  // Convert the Mongoose document to a plain object and replace
  // the image/response properties with their formatted versions.
  const formattedTicket = {
    ...ticket.toObject(),
    images: formattedImages,
    responses: formattedResponses,
  };

  return res.status(200).json({
    success: true,
    data: formattedTicket,
  });
});


exports.createTicket = asyncHandler(async (req, res, next) => {
  try {
    const { subject, description, category } = req.body;
    
    if (!req.user || !req.user._id) {
      return next(new ErrorResponse("Not authorized to create a ticket", 401));
    }

    // Validate required fields
    if (!subject || !description || !category) {
      return next(new ErrorResponse("Subject, description and category are required", 400));
    }

    // Handle uploaded images
    const images = req.files ? req.files.map((file) => ({
      public_id: file.filename || file.public_id,
      url: file.path,
      secure_url: file.path,
      original_filename: file.originalname,
      format: file.format,
      bytes: file.size,
      created_at: new Date().toISOString()
    })) : [];

    // Create ticket data
    const ticketData = {
      user: req.user._id,
      subject,
      description,
      category,
      images
    };

    const ticket = await SupportTicket.create(ticketData);

    // Populate user info
    await ticket.populate('user', 'firstName lastName email phone');

    // ✅ SMS NOTIFICATION: Send ticket created notification to user
    try {
      const user = await User.findById(req.user._id);
      if (user && user.phone && user.phoneVerified) {
        await NotificationService.sendNotification(
          user.phone,
          `Support ticket #${ticket.ticketId} created successfully. Subject: "${subject}". We'll get back to you soon.`,
          "support_ticket_created",
          {
            userId: user._id,
            ticketId: ticket._id,
            ticketNumber: ticket.ticketId,
            subject: subject,
            category: category,
          }
        );
      }
    } catch (smsError) {
      console.error("Ticket creation SMS failed:", smsError);
    }

    // ✅ SMS NOTIFICATION: Send alert to admins about new ticket
    try {
      if (process.env.SEND_ADMIN_ALERTS === "true") {
        const admins = await User.find({
          role: "admin",
          phoneVerified: true,
        }).select("phone");
        const adminPhones = admins
          .filter((admin) => admin.phone)
          .map((admin) => admin.phone);

        if (adminPhones.length > 0) {
          const userName = user ? `${user.firstName} ${user.lastName}` : "A user";
          await NotificationService.sendBulkPromotionalSMS(
            adminPhones,
            `📢 New Support Ticket! ${userName} created ticket #${ticket.ticketId}: "${subject}" (${category})`
          );
        }
      }
    } catch (adminSmsError) {
      console.error("Admin alert SMS failed:", adminSmsError);
    }

    res.status(201).json({
      success: true,
      data: ticket
    });

  } catch (error) {
    console.error('Error creating ticket:', error);
    next(error);
  }
});


exports.addResponse = asyncHandler(async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findById(req.params._id || req.params.id);

    if (!ticket) {
      return next(
        new ErrorResponse(`No ticket with the id of ${req.params._id || req.params.id}`, 404)
      );
    }

    const isOwner = ticket.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin' || req.user.role === 'super-admin';

    if (!isOwner && !isAdmin) {
      return next(
        new ErrorResponse(`User ${req.user._id} not authorized to respond`, 401)
      );
    }

    // Only truly closed tickets block replies. Resolved tickets can be
    // reopened by the owner, and admins can always reply.
    if (ticket.status === 'closed' && !isAdmin) {
      return next(new ErrorResponse('This ticket is closed. Please open a new ticket.', 400));
    }

    const attachments = req.files ? req.files.map((file) => ({
      public_id: file.filename || file.public_id,
      url: file.path,
      secure_url: file.path,
      original_filename: file.originalname,
      format: file.format,
      bytes: file.size,
      created_at: new Date().toISOString()
    })) : [];

    const response = {
      user: req.user._id,
      message: req.body.message || '',
      attachments,
      isAdminResponse: isAdmin,
      createdAt: Date.now(),
    };

    // Status transition rules
    if (isAdmin) {
      if (ticket.status === 'open') {
        ticket.status = 'in-progress';
        ticket.assignedTo = req.user._id;
      }
    } else {
      // Owner replied — if ticket was resolved, reopen to in-progress
      if (ticket.status === 'resolved') {
        ticket.status = 'in-progress';
      }
    }

    ticket.responses.push(response);
    ticket.updatedAt = Date.now();
    await ticket.save();

    await ticket.populate({
      path: 'responses.user',
      select: 'firstName lastName email profileImage role',
    });

    const newResponse = ticket.responses[ticket.responses.length - 1];

    res.status(200).json({
      success: true,
      message: 'Response added successfully',
      data: {
        response: newResponse,
        ticket: {
          _id: ticket._id,
          status: ticket.status,
          updatedAt: ticket.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Error adding response:', error);
    next(error);
  }
});


// @desc    Update ticket status
// @route   PUT /api/v1/support/:id/status
// @access  Private/Admin
// exports.updateTicketStatus = asyncHandler(async (req, res, next) => {
//   const ticket = await SupportTicket.findById(req.params.id);

//   if (!ticket) {
//     return next(new ErrorResponse(`No ticket with id ${req.params.id}`, 404));
//   }

//   if (req.user.role !== "admin") {
//     return next(new ErrorResponse("Only admins can update ticket status", 403));
//   }

//   ticket.status = req.body.status;
//   await ticket.save();

//   // ✅ SMS NOTIFICATION: Send ticket resolved notification to user
//   if (req.body.status === "resolved" && oldStatus !== "resolved") {
//     try {
//       const user = ticket.user;
//       // if (user && user.phone && user.phoneVerified) {
//       await NotificationService.sendSupportResolved(ticket, user);
//       // }
//     } catch (smsError) {
//       console.error("Ticket resolution SMS failed:", smsError);
//     }
//   }

//   // ✅ EMAIL NOTIFICATION: Send support resolved email
//   if (req.body.status === "resolved" && previousStatus !== "resolved") {
//     setTimeout(async () => {
//       try {
//         const user = await User.findById(ticket.user._id);
//         if (user) {
//           await emailService.sendSupportResolvedEmail(ticket, user);
//         }
//       } catch (emailError) {
//         console.error("Failed to send support resolved email:", emailError);
//       }
//     }, 0);
//   }

//   res.status(200).json({ success: true, data: ticket });
// });

// @desc    Update ticket status
// @route   PUT /api/v1/support/:id/status
// @access  Private/Admin
exports.updateTicketStatus = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can update ticket status', 403));
  }

  const { status } = req.body;
  const validStatuses = ['open', 'in-progress', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse('Invalid status value', 400));
  }

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) {
    return next(new ErrorResponse(`No ticket with id ${req.params.id}`, 404));
  }

  // ── FIX: capture previous status BEFORE overwriting ──
  const previousStatus = ticket.status;
  ticket.status = status;
  ticket.updatedAt = new Date();
  await ticket.save();

  // Notifications fired only on transition TO 'resolved'
  if (status === 'resolved' && previousStatus !== 'resolved') {
    try {
      const user = ticket.user?.email
        ? await User.findById(ticket.user._id || ticket.user)
        : null;
      await NotificationService.sendSupportResolved(ticket, user);
    } catch (smsError) {
      console.error('Ticket resolution SMS failed:', smsError);
    }

    setTimeout(async () => {
      try {
        const user = await User.findById(ticket.user?._id || ticket.user);
        if (user) {
          await emailService.sendSupportResolvedEmail(ticket, user);
        }
      } catch (emailError) {
        console.error('Failed to send support resolved email:', emailError);
      }
    }, 0);
  }

  await ticket.populate('user', 'firstName lastName email phone');
  await ticket.populate('responses.user', 'firstName lastName email');

  res.status(200).json({ success: true, data: { ticket } });
});

// @desc    Get ticket statistics
// @route   GET /api/v1/support/stats
// @access  Private/Admin
exports.getTicketStats = asyncHandler(async (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new ErrorResponse("Only admins can view ticket stats", 403));
  }

  const stats = await SupportTicket.aggregate([
    {
      $group: {
        _id: "$category",
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
        inProgress: {
          $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] },
        },
        resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
      },
    },
  ]);

  res.status(200).json({ success: true, data: stats });
});

// @desc    Close a ticket
// @route   PUT /api/support/tickets/:id/close
// @access  Private (ticket owner or admin)

exports.closeTicket = asyncHandler(async (req, res, next) => {
  // The route uses /:id/close, so read req.params.id
  const ticketId = req.params.id;

  if (!ticketId) {
    return next(new ErrorResponse('Ticket ID is required', 400));
  }

  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    return next(
      new ErrorResponse(`No ticket found with id of ${ticketId}`, 404)
    );
  }

  // Normalize IDs to strings before comparing them
  const ticketOwnerId =
    ticket.user?._id?.toString() || ticket.user?.toString();

  const currentUserId = req.user?._id?.toString();

  const isAdmin = ['admin', 'superadmin', 'super-admin'].includes(
    req.user?.role?.toLowerCase()
  );

  // Only the ticket owner or an administrator may close the ticket
  if (!isAdmin && (!currentUserId || ticketOwnerId !== currentUserId)) {
    return next(
      new ErrorResponse(
        'You are not authorized to close this ticket',
        403
      )
    );
  }

  // Avoid unnecessary updates if the ticket is already closed
  if (ticket.status === 'closed') {
    return res.status(200).json({
      success: true,
      message: 'Ticket is already closed',
      data: ticket,
    });
  }

  ticket.status = 'closed';
  await ticket.save();

  return res.status(200).json({
    success: true,
    message: 'Ticket closed successfully',
    data: ticket,
  });
});
