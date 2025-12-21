// @desc    Send promotional email
// @route   POST /api/v1/email/promotional
// @access  Private/Admin
exports.sendPromotionalEmail = asyncHandler(async (req, res, next) => {
  const { subject, content, ctaLink, ctaText, recipientType, userIds } =
    req.body;

  if (!subject || !content) {
    return next(new ErrorResponse("Subject and content are required", 400));
  }

  let users = [];

  if (recipientType === "specific") {
    // Send to specific users
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return next(
        new ErrorResponse("User IDs are required for specific recipients", 400)
      );
    }
    users = await User.find({ _id: { $in: userIds } });
  } else if (recipientType === "all") {
    // Send to all active users
    users = await User.find({ isActive: true });
  } else if (recipientType === "subscribers") {
    // Send to users with active subscriptions
    users = await User.find({
      _id: { $in: await Subscription.distinct("userId", { status: "active" }) },
    });
  }

  if (users.length === 0) {
    return next(new ErrorResponse("No recipients found", 404));
  }

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      await emailService.sendPromotionalEmail(user, {
        title: subject,
        subtitle: "Special Offer!",
        content: content,
        ctaLink: ctaLink || `${process.env.APP_URL}/shop`,
        ctaText: ctaText || "Shop Now",
        terms: "Limited time offer. Terms and conditions apply.",
      });
      successCount++;
    } catch (error) {
      console.error(
        `Failed to send promotional email to ${user.email}:`,
        error
      );
      failCount++;
    }
  }

  res.status(200).json({
    success: true,
    message: `Promotional emails sent: ${successCount} successful, ${failCount} failed`,
    sent: successCount,
    failed: failCount,
  });
});

// @desc    Send newsletter email
// @route   POST /api/v1/email/newsletter
// @access  Private/Admin
exports.sendNewsletterEmail = asyncHandler(async (req, res, next) => {
  const { subject, content } = req.body;

  if (!subject || !content) {
    return next(new ErrorResponse("Subject and content are required", 400));
  }

  // Get all subscribed users (you'll need a newsletter subscription field in your User model)
  const users = await User.find({
    newsletterSubscribed: true,
    isActive: true,
  });

  if (users.length === 0) {
    return next(new ErrorResponse("No newsletter subscribers found", 404));
  }

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      await emailService.sendPromotionalEmail(user, {
        title: subject,
        subtitle: "Your Monthly Newsletter",
        content: content,
        ctaLink: `${process.env.APP_URL}/newsletter`,
        ctaText: "Read More",
        terms:
          "You are receiving this email because you subscribed to our newsletter.",
      });
      successCount++;
    } catch (error) {
      console.error(`Failed to send newsletter to ${user.email}:`, error);
      failCount++;
    }
  }

  res.status(200).json({
    success: true,
    message: `Newsletter sent: ${successCount} successful, ${failCount} failed`,
    sent: successCount,
    failed: failCount,
  });
});

// @desc    Subscribe to newsletter
// @route   POST /api/v1/auth/newsletter/subscribe
// @access  Private
exports.subscribeToNewsletter = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  if (user.newsletterSubscribed) {
    return res.status(200).json({
      success: true,
      message: "Already subscribed to newsletter",
    });
  }

  user.newsletterSubscribed = true;
  await user.save();

  // Send welcome newsletter email
  setTimeout(async () => {
    try {
      await emailService.sendNewsletterWelcomeEmail({
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        subscriptionDate: new Date(),
      });
    } catch (emailError) {
      console.error("Failed to send newsletter welcome email:", emailError);
    }
  }, 0);

  res.status(200).json({
    success: true,
    message: "Successfully subscribed to newsletter",
  });
});

// @desc    Unsubscribe from newsletter
// @route   POST /api/v1/auth/newsletter/unsubscribe
// @access  Private
exports.unsubscribeFromNewsletter = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  if (!user.newsletterSubscribed) {
    return res.status(200).json({
      success: true,
      message: "Already unsubscribed from newsletter",
    });
  }

  user.newsletterSubscribed = false;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Successfully unsubscribed from newsletter",
  });
});
