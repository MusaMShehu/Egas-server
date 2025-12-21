const SupportTicket = require("../../models/SupportTicket");
const User = require("../../models/User");
const asyncHandler = require("../../middleware/async");
const ErrorResponse = require("../../utils/errorResponse");
// const { uploadToCloudinary } = require('../utils/cloudinary');
const NotificationService = require("../../services/notificationService");
const emailService = require("../../services/emailService");

// @desc    Get all support tickets with filtering, sorting, and pagination
// @route   GET /api/v1/admin/support-tickets
// @access  Private/Admin
exports.getSupportTickets = asyncHandler(async (req, res, next) => {
  const {
    status,
    category,
    search,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build query object
  let query = {};

  // Filter by status
  if (status && status !== "all") {
    query.status = status;
  }

  // Filter by category
  if (category && category !== "all") {
    query.category = category;
  }

  // Search functionality
  if (search) {
    query.$or = [
      { ticketId: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  // Sort configuration
  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Execute query
  const tickets = await SupportTicket.find(query)
    .populate("user", "firstName lastName email phone")
    .populate("responses.user", "firstName lastName email")
    .sort(sortConfig)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await SupportTicket.countDocuments(query);

  res.status(200).json({
    success: true,
    count: tickets.length,
    total,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
    data: {
      tickets,
    },
  });
});

// @desc    Get single support ticket
// @route   GET /api/v1/admin/support-tickets/:id
// @access  Private/Admin
exports.getSupportTicket = asyncHandler(async (req, res, next) => {
  const ticket = await SupportTicket.findById(req.params.id)
    .populate("user", "firstName lastName email phone")
    .populate("responses.user", "firstName lastName email");

  if (!ticket) {
    return next(new ErrorResponse("Support ticket not found", 404));
  }

  res.status(200).json({
    success: true,
    data: {
      ticket,
    },
  });
});

// @desc    Update ticket status
// @route   PATCH /api/v1/admin/support-tickets/:id/status
// @access  Private/Admin
exports.updateTicketStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  // Validate status
  const validStatuses = ["open", "in-progress", "resolved", "closed"];
  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse("Invalid status value", 400));
  }

  const ticket = await SupportTicket.findByIdAndUpdate(
    req.params.id,
    {
      status,
      updatedAt: new Date(),
    },
    { new: true, runValidators: true }
  )
    .populate("user", "firstName lastName email phone")
    .populate("responses.user", "firstName lastName email");

  if (!ticket) {
    return next(new ErrorResponse("Support ticket not found", 404));
  }

  // ✅ SMS NOTIFICATION: Send ticket resolved notification to user
  if (req.body.status === "resolved" && oldStatus !== "resolved") {
    try {
      const user = ticket.user;
      // if (user && user.phone && user.phoneVerified) {
      await NotificationService.sendSupportResolved(ticket, user);
      // }
    } catch (smsError) {
      console.error("Ticket resolution SMS failed:", smsError);
    }
  }

  // ✅ EMAIL NOTIFICATION: Send support resolved email
  if (req.body.status === "resolved" && previousStatus !== "resolved") {
    setTimeout(async () => {
      try {
        const user = await User.findById(ticket.user._id);
        if (user) {
          await emailService.sendSupportResolvedEmail(ticket, user);
        }
      } catch (emailError) {
        console.error("Failed to send support resolved email:", emailError);
      }
    }, 0);
  }

  res.status(200).json({
    success: true,
    message: "Ticket status updated successfully",
    data: {
      ticket,
    },
  });
});

// @desc    Add response to ticket
// @route   POST /api/v1/admin/support-tickets/:id/respond
// @access  Private/Admin
exports.addResponse = asyncHandler(async (req, res, next) => {
  const { message } = req.body;
  const adminUser = req.user;

  if (!message || !message.trim()) {
    return next(new ErrorResponse("Response message is required", 400));
  }

  // Handle file uploads
  let attachmentUrls = [];
  if (req.files && req.files.length > 0) {
    for (let file of req.files) {
      const uploadResult = await uploadToCloudinary(file);
      attachmentUrls.push(uploadResult.secure_url);
    }
  }

  const responseData = {
    message: message.trim(),
    user: adminUser._id,
    attachments: attachmentUrls,
    createdAt: new Date(),
  };

  const ticket = await SupportTicket.findByIdAndUpdate(
    req.params.id,
    {
      $push: { responses: responseData },
      $set: {
        updatedAt: new Date(),
        // If ticket was closed and admin responds, reopen it
        status: "in-progress",
      },
    },
    { new: true, runValidators: true }
  )
    .populate("user", "firstName lastName email phone")
    .populate("responses.user", "firstName lastName email");

  if (!ticket) {
    return next(new ErrorResponse("Support ticket not found", 404));
  }

  // TODO: Send email notification to user about new response

  res.status(200).json({
    success: true,
    message: "Response added successfully",
    data: {
      ticket,
    },
  });
});

// @desc    Get ticket statistics
// @route   GET /api/v1/admin/support-tickets/stats/overview
// @access  Private/Admin
exports.getTicketStats = asyncHandler(async (req, res, next) => {
  const stats = await SupportTicket.aggregate([
    {
      $facet: {
        totalTickets: [{ $count: "count" }],
        ticketsByStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],
        ticketsByCategory: [
          {
            $group: {
              _id: "$category",
              count: { $sum: 1 },
            },
          },
        ],
        recentTickets: [
          {
            $sort: { createdAt: -1 },
          },
          {
            $limit: 5,
          },
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "user",
            },
          },
          {
            $unwind: "$user",
          },
          {
            $project: {
              ticketId: 1,
              subject: 1,
              status: 1,
              category: 1,
              createdAt: 1,
              "user.firstName": 1,
              "user.lastName": 1,
              "user.email": 1,
            },
          },
        ],
        responseStats: [
          {
            $project: {
              responseCount: { $size: { $ifNull: ["$responses", []] } },
              hasAttachments: {
                $gt: [{ $size: { $ifNull: ["$attachments", []] } }, 0],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalResponses: { $sum: "$responseCount" },
              ticketsWithAttachments: {
                $sum: { $cond: ["$hasAttachments", 1, 0] },
              },
              avgResponsesPerTicket: { $avg: "$responseCount" },
            },
          },
        ],
      },
    },
  ]);

  // Format the response
  const formattedStats = {
    total: stats[0].totalTickets[0]?.count || 0,
    byStatus: stats[0].ticketsByStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    byCategory: stats[0].ticketsByCategory.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    recentTickets: stats[0].recentTickets,
    responseStats: stats[0].responseStats[0] || {
      totalResponses: 0,
      ticketsWithAttachments: 0,
      avgResponsesPerTicket: 0,
    },
  };

  res.status(200).json({
    success: true,
    data: {
      stats: formattedStats,
    },
  });
});

// @desc    Create new support ticket (Admin can create on behalf of user)
// @route   POST /api/v1/admin/support-tickets
// @access  Private/Admin
exports.createSupportTicket = asyncHandler(async (req, res, next) => {
  const {
    userId,
    subject,
    description,
    category = "other",
    priority = "medium",
  } = req.body;

  // Validate required fields
  if (!userId || !subject || !description) {
    return next(
      new ErrorResponse("User ID, subject, and description are required", 400)
    );
  }

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  // Handle file uploads for initial ticket
  let attachmentUrls = [];
  if (req.files && req.files.length > 0) {
    for (let file of req.files) {
      const uploadResult = await uploadToCloudinary(file);
      attachmentUrls.push(uploadResult.secure_url);
    }
  }

  // Create ticket
  const ticket = await SupportTicket.create({
    user: userId,
    subject,
    description,
    category,
    priority,
    attachments: attachmentUrls,
  });

  const populatedTicket = await SupportTicket.findById(ticket._id)
    .populate("user", "firstName lastName email phone")
    .populate("responses.user", "firstName lastName email");

  // ✅ SMS NOTIFICATION: Send ticket created notification to user
  try {
    const user = await User.findById(req.user._id);
    if (user && user.phone && user.phoneVerified) {
      await NotificationService.sendNotification(
        user.phone,
        `Support ticket #${
          ticket.ticketNumber || ticket._id
        } created successfully. Subject: "${subject}". We'll get back to you soon.`,
        "support_ticket_created",
        {
          userId: user._id,
          ticketId: ticket._id,
          ticketNumber:
            ticket.ticketNumber || `TKT-${ticket._id.toString().slice(-6)}`,
          subject: subject,
          category: category,
        }
      );
    }
  } catch (smsError) {
    console.error("Ticket creation SMS failed:", smsError);
    // Don't fail ticket creation if SMS fails
  }

  // ✅ SMS NOTIFICATION: Send alert to admins about new ticket (optional)
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
        const user = await User.findById(req.user._id).select(
          "firstName lastName"
        );
        const userName = user ? `${user.firstName} ${user.lastName}` : "A user";

        await NotificationService.sendBulkPromotionalSMS(
          adminPhones,
          `📢 New Support Ticket! ${userName} created ticket #${
            ticket.ticketNumber || ticket._id
          }: "${subject}" (${category})`
        );
      }
    }
  } catch (adminSmsError) {
    console.error("Admin alert SMS failed:", adminSmsError);
  }

  res.status(201).json({
    success: true,
    message: "Support ticket created successfully",
    data: {
      ticket: populatedTicket,
    },
  });
});

// @desc    Delete support ticket
// @route   DELETE /api/v1/admin/support-tickets/:id
// @access  Private/Admin
exports.deleteSupportTicket = asyncHandler(async (req, res, next) => {
  const ticket = await SupportTicket.findById(req.params.id);

  if (!ticket) {
    return next(new ErrorResponse("Support ticket not found", 404));
  }

  await SupportTicket.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: "Support ticket deleted successfully",
  });
});

// @desc    Bulk update ticket status
// @route   PATCH /api/v1/admin/support-tickets/bulk/status
// @access  Private/Admin
exports.bulkUpdateTicketStatus = asyncHandler(async (req, res, next) => {
  const { ticketIds, status } = req.body;

  if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
    return next(new ErrorResponse("Ticket IDs array is required", 400));
  }

  // Validate status
  const validStatuses = ["open", "in-progress", "resolved", "closed"];
  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse("Invalid status value", 400));
  }

  const result = await SupportTicket.updateMany(
    { _id: { $in: ticketIds } },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    }
  );

  // ✅ SMS NOTIFICATION: Send ticket resolved notification to user
  if (req.body.status === "resolved" && oldStatus !== "resolved") {
    try {
      const user = ticket.user;
      // if (user && user.phone && user.phoneVerified) {
      await NotificationService.sendSupportResolved(ticket, user);
      // }
    } catch (smsError) {
      console.error("Ticket resolution SMS failed:", smsError);
    }
  }

  // ✅ EMAIL NOTIFICATION: Send support resolved email
  if (req.body.status === "resolved" && previousStatus !== "resolved") {
    setTimeout(async () => {
      try {
        const user = await User.findById(ticket.user._id);
        if (user) {
          await emailService.sendSupportResolvedEmail(ticket, user);
        }
      } catch (emailError) {
        console.error("Failed to send support resolved email:", emailError);
      }
    }, 0);
  }

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} tickets updated to ${status} status`,
    data: {
      modifiedCount: result.modifiedCount,
    },
  });
});

// @desc    Get tickets by user ID
// @route   GET /api/v1/admin/support-tickets/user/:userId
// @access  Private/Admin
exports.getTicketsByUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  // Sort configuration
  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Execute query
  const tickets = await SupportTicket.find({ user: userId })
    .populate("user", "firstName lastName email phone")
    .populate("responses.user", "firstName lastName email")
    .sort(sortConfig)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await SupportTicket.countDocuments({ user: userId });

  res.status(200).json({
    success: true,
    count: tickets.length,
    total,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
    data: {
      tickets,
    },
  });
});
