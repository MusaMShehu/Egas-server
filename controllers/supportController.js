const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("../middleware/async");
const NotificationService = require("../services/notificationService");
const emailService = require("../services/emailService");
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

// @desc    Get single support ticket
// @route   GET /api/v1/support/:id
// @access  Private
exports.getTicket = asyncHandler(async (req, res, next) => {
  const ticket = await SupportTicket.findById(req.params.id)
    .populate("user", "firstName lastName email phone")
    .populate("responses.user", "firstName lastName role");

  if (!ticket) {
    return next(new ErrorResponse(`No ticket with id ${req.params.id}`, 404));
  }

  // Only owner or admin can access
  if (
    ticket.user._id.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    return next(new ErrorResponse("Not authorized to access this ticket", 401));
  }

  res.status(200).json({ success: true, data: ticket });
});


// Get Support Ticket with Responses
// Get Support Ticket with Responses
// Get Support Ticket with Responses
// Get Support Ticket with Responses
// exports.getTicketWithResponses = asyncHandler(async (req, res, next) => {
//   try {
//     const ticket = await SupportTicket.findById(req.params._id)
//       .populate({
//         path: 'user',
//         select: 'firstName lastName email phone profileImage'
//       })
//       .populate({
//         path: 'responses.user',
//         select: 'firstName lastName email profileImage role'
//       })
//       .populate({
//         path: 'assignedTo',
//         select: 'firstName lastName email'
//       });

//     if (!ticket) {
//       return next(
//         new ErrorResponse(`No ticket with the id of ${req.params._id}`, 404)
//       );
//     }

//     // Check authorization
//     if (ticket.user._id.toString() !== req.user._id && req.user.role !== "admin") {
//       return next(
//         new ErrorResponse(`Not authorized to view this ticket`, 401)
//       );
//     }

//     // Format attachments for frontend
//     const formattedTicket = {
//       ...ticket.toObject(),
//       images: ticket.images.map(img => ({
//         url: img.secure_url || img.url,
//         public_id: img.public_id,
//         thumbnail: cloudinary.url(img.public_id, {
//           width: 200,
//           height: 200,
//           crop: 'fill',
//           quality: 'auto'
//         })
//       })),
//       responses: ticket.responses.map(response => ({
//         ...response.toObject(),
//         attachments: response.attachments.map(att => ({
//           url: att.secure_url || att.url,
//           public_id: att.public_id,
//           thumbnail: cloudinary.url(att.public_id, {
//             width: 200,
//             height: 200,
//             crop: 'fill',
//             quality: 'auto'
//           })
//         }))
//       }))
//     };

//     res.status(200).json({
//       success: true,
//       data: formattedTicket
//     });

//   } catch (error) {
//     console.error('Error fetching ticket:', error);
//     next(error);
//   }
// });




exports.getTicketWithResponses = asyncHandler(async (req, res, next) => {
  try {
    const ticketId = req.params._id || req.params.id;
    const ticket = await SupportTicket.findById(ticketId)
      .populate({
        path: 'user',
        select: 'firstName lastName email phone profileImage'
      })
      .populate({
        path: 'responses.user',
        select: 'firstName lastName email profileImage role'
      })
      .populate({
        path: 'assignedTo',
        select: 'firstName lastName email'
      });

    if (!ticket) {
      return next(
        new ErrorResponse(`No ticket with the id of ${ticketId}`, 404)
      );
    }

    // Check authorization
    if (ticket.user._id.toString() !== req.user._id && req.user.role !== "admin") {
      return next(
        new ErrorResponse(`Not authorized to view this ticket`, 401)
      );
    }

    // Format images and attachments for frontend
    const formattedTicket = {
      ...ticket.toObject(),
      images: ticket.images.map(img => ({
        public_id: img.public_id,
        url: img.secure_url || img.url,
        thumbnail: img.secure_url ? cloudinary.url(img.public_id, {
          width: 200,
          height: 200,
          crop: 'fill',
          quality: 'auto'
        }) : img.url
      })),
      responses: ticket.responses.map(response => ({
        ...response.toObject(),
        attachments: response.attachments.map(att => ({
          public_id: att.public_id,
          url: att.secure_url || att.url,
          thumbnail: att.secure_url ? cloudinary.url(att.public_id, {
            width: 200,
            height: 200,
            crop: 'fill',
            quality: 'auto'
          }) : att.url
        }))
      }))
    };

    res.status(200).json({
      success: true,
      data: formattedTicket
    });

  } catch (error) {
    console.error('Error fetching ticket:', error);
    next(error);
  }
});


// @desc    Create support ticket
// @route   POST /api/v1/support
// @access  Private
// exports.createTicket = asyncHandler(async (req, res, next) => {
//   if (!req.user || !req.user._id) {
//     return next(new ErrorResponse("Not authorized to create a ticket", 401));
//   }

//   // Collect text fields from body
//   const { subject, description, category } = req.body;

//   // Collect uploaded files (if any)
//   const attachments = req.files
//     ? req.files.map((file) => `/uploads/support/${file.filename}`)
//     : [];

//   // Create ticket data
//   const ticketData = {
//     user: req.user._id,
//     subject,
//     description,
//     category,
//     attachments,
//   };

//   const ticket = await SupportTicket.create(ticketData);

//   // ✅ SMS NOTIFICATION: Send ticket created notification to user
//   try {
//     const user = await User.findById(req.user._id);
//     if (user && user.phone && user.phoneVerified) {
//       await NotificationService.sendNotification(
//         user.phone,
//         `Support ticket #${
//           ticket.ticketNumber || ticket._id
//         } created successfully. Subject: "${subject}". We'll get back to you soon.`,
//         "support_ticket_created",
//         {
//           userId: user._id,
//           ticketId: ticket._id,
//           ticketNumber:
//             ticket.ticketNumber || `TKT-${ticket._id.toString().slice(-6)}`,
//           subject: subject,
//           category: category,
//         }
//       );
//     }
//   } catch (smsError) {
//     console.error("Ticket creation SMS failed:", smsError);
//     // Don't fail ticket creation if SMS fails
//   }

//   // ✅ SMS NOTIFICATION: Send alert to admins about new ticket (optional)
//   try {
//     if (process.env.SEND_ADMIN_ALERTS === "true") {
//       const admins = await User.find({
//         role: "admin",
//         phoneVerified: true,
//       }).select("phone");
//       const adminPhones = admins
//         .filter((admin) => admin.phone)
//         .map((admin) => admin.phone);

//       if (adminPhones.length > 0) {
//         const user = await User.findById(req.user._id).select(
//           "firstName lastName"
//         );
//         const userName = user ? `${user.firstName} ${user.lastName}` : "A user";

//         await NotificationService.sendBulkPromotionalSMS(
//           adminPhones,
//           `📢 New Support Ticket! ${userName} created ticket #${
//             ticket.ticketNumber || ticket._id
//           }: "${subject}" (${category})`
//         );
//       }
//     }
//   } catch (adminSmsError) {
//     console.error("Admin alert SMS failed:", adminSmsError);
//   }

//   res.status(201).json({
//     success: true,
//     data: ticket,
//   });
// });




// exports.createTicket = asyncHandler(async (req, res) => {
//   try {
//     const images =
//       req.files?.map((file) => ({
//         public_id: file.public_id,
//         url: file.path,
//         secure_url: file.path.replace("http://", "https://"),
//       })) || [];

//     const ticket = new SupportTicket({
//       userId: req.userId,
//       subject: req.body.subject,
//       message: req.body.message,
//       images: images,
//     });

//     await ticket.save();

//     // ✅ SMS NOTIFICATION: Send ticket created notification to user
//     try {
//       const user = await User.findById(req.user._id);
//       if (user && user.phone && user.phoneVerified) {
//         await NotificationService.sendNotification(
//           user.phone,
//           `Support ticket #${
//             ticket.ticketNumber || ticket._id
//           } created successfully. Subject: "${subject}". We'll get back to you soon.`,
//           "support_ticket_created",
//           {
//             userId: user._id,
//             ticketId: ticket._id,
//             ticketNumber:
//               ticket.ticketNumber || `TKT-${ticket._id.toString().slice(-6)}`,
//             subject: subject,
//             category: category,
//           }
//         );
//       }
//     } catch (smsError) {
//       console.error("Ticket creation SMS failed:", smsError);
//       // Don't fail ticket creation if SMS fails
//     }

//     // ✅ SMS NOTIFICATION: Send alert to admins about new ticket (optional)
//     try {
//       if (process.env.SEND_ADMIN_ALERTS === "true") {
//         const admins = await User.find({
//           role: "admin",
//           phoneVerified: true,
//         }).select("phone");
//         const adminPhones = admins
//           .filter((admin) => admin.phone)
//           .map((admin) => admin.phone);

//         if (adminPhones.length > 0) {
//           const user = await User.findById(req.user._id).select(
//             "firstName lastName"
//           );
//           const userName = user
//             ? `${user.firstName} ${user.lastName}`
//             : "A user";

//           await NotificationService.sendBulkPromotionalSMS(
//             adminPhones,
//             `📢 New Support Ticket! ${userName} created ticket #${
//               ticket.ticketNumber || ticket._id
//             }: "${subject}" (${category})`
//           );
//         }
//       }
//     } catch (adminSmsError) {
//       console.error("Admin alert SMS failed:", adminSmsError);
//     }

//     res.status(201).json(ticket);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });




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





// @desc    Add response to ticket
// @route   PUT /api/v1/support/:id/response
// @access  Private
// exports.addResponse = asyncHandler(async (req, res, next) => {
//   let ticket = await SupportTicket.findById(req.params._id);

//   if (!ticket) {
//     return next(
//       new ErrorResponse(`No ticket with the id of ${req.params._id}`, 404)
//     );
//   }

//   // Only ticket owner or admin can reply
//   if (ticket.user.toString() !== req.user._id && req.user.role !== "admin") {
//     return next(
//       new ErrorResponse(`User ${req.user._id} not authorized to respond`, 401)
//     );
//   }

//   // If admin replies and ticket is "open", move it to "in-progress"
//   if (req.user.role === "admin" && ticket.status === "open") {
//     ticket.status = "in-progress";
//   }

//   // Collect attachments (if any uploaded)
//   const attachments = req.files
//     ? req.files.map((file) => `/uploads/support/${file.filename}`)
//     : [];

//   // Push response
//   ticket.responses.push({
//     user: req.user._id,
//     message: req.body.message,
//     attachments,
//   });

//   await ticket.save();

//   res.status(200).json({
//     success: true,
//     data: ticket,
//   });
// });



exports.addResponse = asyncHandler(async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findById(req.params._id || req.params.id);

    if (!ticket) {
      return next(
        new ErrorResponse(`No ticket with the id of ${req.params._id || req.params.id}`, 404)
      );
    }

    // Only ticket owner or admin can reply
    if (ticket.user.toString() !== req.user._id && req.user.role !== "admin") {
      return next(
        new ErrorResponse(`User ${req.user._id} not authorized to respond`, 401)
      );
    }

    // Handle uploaded attachments
    const attachments = req.files ? req.files.map((file) => ({
      public_id: file.filename || file.public_id,
      url: file.path,
      secure_url: file.path,
      original_filename: file.originalname,
      format: file.format,
      bytes: file.size,
      created_at: new Date().toISOString()
    })) : [];

    // Create response object
    const response = {
      user: req.user._id,
      message: req.body.message || '',
      attachments: attachments,
      isAdminResponse: req.user.role === "admin",
      createdAt: Date.now()
    };

    // If admin replies and ticket is "open", move it to "in-progress"
    if (req.user.role === "admin" && ticket.status === "open") {
      ticket.status = "in-progress";
      ticket.assignedTo = req.user._id;
    }

    // Push response to ticket
    ticket.responses.push(response);
    ticket.updatedAt = Date.now();

    await ticket.save();

    // Populate user details for response
    await ticket.populate({
      path: 'responses.user',
      select: 'firstName lastName email profileImage role'
    });

    // Get the newly added response
    const newResponse = ticket.responses[ticket.responses.length - 1];

    res.status(200).json({
      success: true,
      message: 'Response added successfully',
      data: {
        response: newResponse,
        ticket: {
          _id: ticket._id,
          status: ticket.status,
          updatedAt: ticket.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error adding response:', error);
    next(error);
  }
});



// exports.addResponse = asyncHandler(async (req, res, next) => {
//   try {
//     const ticket = await SupportTicket.findById(req.params._id);

//     if (!ticket) {
//       return next(
//         new ErrorResponse(`No ticket with the id of ${req.params._id}`, 404)
//       );
//     }

//     // Only ticket owner or admin can reply
//     if (ticket.user.toString() !== req.user._id && req.user.role !== "admin") {
//       return next(
//         new ErrorResponse(`User ${req.user._id} not authorized to respond`, 401)
//       );
//     }

//     // If admin replies and ticket is "open", move it to "in-progress"
//     if (req.user.role === "admin" && ticket.status === "open") {
//       ticket.status = "in-progress";
//     }

//     // Handle file uploads to Cloudinary
//     let attachments = [];
//     if (req.files && req.files.length > 0) {
//       try {
//         // Upload each file to Cloudinary
//         const uploadPromises = req.files.map(file => {
//           return cloudinary.uploader.upload(file.path, {
//             folder: `egas/support/ticket_${ticket._id}/responses`,
//             transformation: [
//               { width: 800, height: 800, crop: 'limit' },
//               { quality: 'auto:good' }
//             ],
//             public_id: `response_${Date.now()}_${Math.random().toString(36).substring(7)}`,
//             resource_type: 'auto'
//           });
//         });

//         // Wait for all uploads to complete
//         const uploadResults = await Promise.all(uploadPromises);
        
//         // Format attachments for database
//         attachments = uploadResults.map(result => ({
//           public_id: result.public_id,
//           url: result.secure_url,
//           secure_url: result.secure_url,
//           original_filename: result.original_filename,
//           format: result.format,
//           bytes: result.bytes,
//           created_at: result.created_at
//         }));

//         // Clean up temporary files if they exist
//         if (req.files[0].path && !req.files[0].path.includes('cloudinary')) {
//           const fs = require('fs');
//           req.files.forEach(file => {
//             if (fs.existsSync(file.path)) {
//               fs.unlinkSync(file.path);
//             }
//           });
//         }

//       } catch (uploadError) {
//         console.error('Cloudinary upload failed:', uploadError);
//         return next(
//           new ErrorResponse('Failed to upload attachments. Please try again.', 500)
//         );
//       }
//     }

//     // Create response object
//     const response = {
//       user: req.user._id,
//       message: req.body.message || '',
//       attachments: attachments,
//       isAdminResponse: req.user.role === "admin",
//       createdAt: Date.now()
//     };

//     // Push response to ticket
//     ticket.responses.push(response);

//     // If admin responds and ticket is not resolved, update status
//     if (req.user.role === "admin" && ticket.status !== "resolved") {
//       ticket.status = "in-progress";
//       ticket.assignedTo = req.user._id;
//     }

//     // Update ticket last updated timestamp
//     ticket.updatedAt = Date.now();

//     await ticket.save();

//     // Populate user details for response
//     await ticket.populate({
//       path: 'responses.user',
//       select: 'firstName lastName email profileImage role'
//     });

//     // Get the newly added response (last one)
//     const newResponse = ticket.responses[ticket.responses.length - 1];

//     res.status(200).json({
//       success: true,
//       message: 'Response added successfully',
//       data: {
//         response: newResponse,
//         ticket: {
//           _id: ticket._id,
//           status: ticket.status,
//           updatedAt: ticket.updatedAt
//         }
//       }
//     });

//   } catch (error) {
//     console.error('Error adding response:', error);
//     next(error);
//   }
// });

// @desc    Update ticket status
// @route   PUT /api/v1/support/:id/status
// @access  Private/Admin
exports.updateTicketStatus = asyncHandler(async (req, res, next) => {
  const ticket = await SupportTicket.findById(req.params.id);

  if (!ticket) {
    return next(new ErrorResponse(`No ticket with id ${req.params.id}`, 404));
  }

  if (req.user.role !== "admin") {
    return next(new ErrorResponse("Only admins can update ticket status", 403));
  }

  ticket.status = req.body.status;
  await ticket.save();

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

  res.status(200).json({ success: true, data: ticket });
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
  const ticket = await SupportTicket.findById(req.params._id);

  if (!ticket) {
    return next(
      new ErrorResponse(`No ticket found with id of ${req.params._id}`, 404)
    );
  }

  // Only ticket owner or admin can close it
  if (ticket.user.toString() !== req.user._id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(
        `User ${req.user._id} not authorized to close this ticket`,
        401
      )
    );
  }

  // Update status to "closed"
  ticket.status = "closed";
  ticket.updatedAt = new Date();
  await ticket.save();

  res.status(200).json({
    success: true,
    data: ticket,
  });
});
