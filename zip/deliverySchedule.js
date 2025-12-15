// @desc    Generate delivery schedules from subscriptions
// @route   POST /api/v1/deliveries/generate-schedules
// @access  Private/Admin
exports.generateDeliverySchedules = asyncHandler(async (req, res, next) => {
  const { daysAhead = 7 } = req.body;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + parseInt(daysAhead));

  // Get active subscriptions
  const activeSubscriptions = await Subscription.find({
    status: "active",
    endDate: { $gte: startDate },
  }).populate("userId", "firstName lastName phone address");

  let generatedCount = 0;
  const errors = [];

  for (const subscription of activeSubscriptions) {
    try {
      const deliveryDates = calculateDeliveryDates(
        subscription,
        startDate,
        endDate
      );

      for (const deliveryDate of deliveryDates) {
        // Check if delivery already exists for this date
        const existingDelivery = await Delivery.findOne({
          subscriptionId: subscription._id,
          deliveryDate: {
            $gte: new Date(deliveryDate.setHours(0, 0, 0, 0)),
            $lt: new Date(deliveryDate.setHours(23, 59, 59, 999)),
          },
        });

        if (!existingDelivery) {
          await Delivery.create({
            subscriptionId: subscription._id,
            userId: subscription.userId._id,
            deliveryDate: deliveryDate,
            scheduledDate: deliveryDate,
            status: "pending",
            address: subscription.userId.address,
            customerPhone: subscription.userId.phone,
            customerName: `${subscription.userId.firstName} ${subscription.userId.lastName}`,
            planDetails: {
              planName: subscription.planName,
              size: subscription.size,
              frequency: subscription.frequency,
              price: subscription.price,
            },
          });
          generatedCount++;
        }
      }
    } catch (error) {
      errors.push({
        subscriptionId: subscription._id,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `Generated ${generatedCount} delivery schedules`,
    generatedCount,
    errors,
  });
});

// Helper function to calculate delivery dates
const calculateDeliveryDates = (subscription, startDate, endDate) => {
  const dates = [];
  let currentDate = new Date(subscription.startDate);

  while (currentDate <= endDate) {
    if (currentDate >= startDate) {
      dates.push(new Date(currentDate));
    }

    // Calculate next delivery date based on frequency
    switch (subscription.frequency) {
      case "Daily":
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case "Weekly":
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case "Bi-Weekly":
        currentDate.setDate(currentDate.getDate() + 14);
        break;
      case "Monthly":
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case "One-Time":
        currentDate = new Date(endDate); // Break loop for one-time
        break;
      default:
        currentDate.setDate(currentDate.getDate() + 30); // Default monthly
    }
  }

  return dates;
};