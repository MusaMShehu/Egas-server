const Delivery = require("../models/Delivery");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");

/**
 * Enhanced Delivery Schedule Generator
 * Generates delivery schedules for subscriptions based on frequency and type
 */
const generateDeliverySchedules = async (subscription, options = {}) => {
  try {
    const {
      overrideExisting = false,
      maxDeliveries = 100, // Safety limit
      logProgress = true
    } = options;

    // Validate subscription
    if (!subscription || !subscription._id) {
      throw new Error("Invalid subscription provided");
    }

    if (!subscription.userId) {
      throw new Error("Subscription missing user ID");
    }

    const user = await User.findById(subscription.userId);
    if (!user) {
      throw new Error("User not found for subscription");
    }

    const deliverySchedules = [];
    const startDate = new Date(subscription.startDate);
    const endDate = new Date(subscription.endDate);
    
    // Validate dates
    if (startDate > endDate) {
      throw new Error("Subscription start date cannot be after end date");
    }

    let currentDate = new Date(startDate);
    let deliveryCount = 0;

    // For one-time plans, only create one delivery
    if (subscription.frequency === "One-Time" || subscription.planType === "one-time" || subscription.planType === "emergency") {
      if (logProgress) {
        console.log(`🔄 Generating one-time delivery for subscription ${subscription._id}`);
      }

      const existingDelivery = await checkExistingDelivery(subscription._id, startDate);
      
      if (!existingDelivery || overrideExisting) {
        const deliveryData = createDeliveryData(subscription, user, startDate);
        deliverySchedules.push(deliveryData);
        deliveryCount++;
      } else if (logProgress) {
        console.log(`⏭️  Delivery already exists for one-time subscription ${subscription._id}`);
      }
    } else {
      // For recurring plans
      if (logProgress) {
        console.log(`🔄 Generating recurring deliveries for subscription ${subscription._id} (${subscription.frequency})`);
      }

      while (currentDate <= endDate && deliveryCount < maxDeliveries) {
        const existingDelivery = await checkExistingDelivery(subscription._id, currentDate);
        
        if (!existingDelivery || overrideExisting) {
          const deliveryData = createDeliveryData(subscription, user, new Date(currentDate));
          deliverySchedules.push(deliveryData);
          deliveryCount++;
        }

        // Calculate next delivery date
        currentDate = calculateNextDeliveryDate(currentDate, subscription.frequency);
        
        // Safety check to prevent infinite loops
        if (deliveryCount >= maxDeliveries) {
          console.warn(`⚠️  Reached maximum delivery limit (${maxDeliveries}) for subscription ${subscription._id}`);
          break;
        }
      }
    }

    // Save delivery schedules
    let createdDeliveries = [];
    if (deliverySchedules.length > 0) {
      createdDeliveries = await Delivery.insertMany(deliverySchedules);
      
      if (logProgress) {
        console.log(`✅ Generated ${createdDeliveries.length} delivery schedules for subscription ${subscription._id}`);
      }
    } else if (logProgress) {
      console.log(`⏭️  No new deliveries generated for subscription ${subscription._id}`);
    }

    return {
      success: true,
      count: createdDeliveries.length,
      deliveries: createdDeliveries,
      subscriptionId: subscription._id
    };
  } catch (error) {
    console.error('❌ Error generating delivery schedules:', error);
    throw new ErrorResponse(`Delivery schedule generation failed: ${error.message}`, 500);
  }
};

/**
 * Check if delivery already exists for a specific date
 * @param {String} subscriptionId - Subscription ID
 * @param {Date} deliveryDate - Delivery date to check
 * @returns {Promise<Object|null>} Existing delivery or null
 */
const checkExistingDelivery = async (subscriptionId, deliveryDate) => {
  const deliveryStart = new Date(deliveryDate);
  deliveryStart.setHours(0, 0, 0, 0);
  
  const deliveryEnd = new Date(deliveryDate);
  deliveryEnd.setHours(23, 59, 59, 999);

  return await Delivery.findOne({
    subscriptionId: subscriptionId,
    deliveryDate: { 
      $gte: deliveryStart, 
      $lte: deliveryEnd 
    }
  });
};

/**
 * Create delivery data object
 * @param {Object} subscription - Subscription object
 * @param {Object} user - User object
 * @param {Date} deliveryDate - Delivery date
 * @returns {Object} Delivery data object
 */
const createDeliveryData = (subscription, user, deliveryDate) => {
  return {
    subscriptionId: subscription._id,
    userId: subscription.userId,
    deliveryDate: new Date(deliveryDate),
    scheduledDate: new Date(deliveryDate),
    status: 'pending',
    address: user.address || 'Address not provided',
    customerPhone: user.phone || 'Phone not provided',
    customerName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
    planDetails: {
      planName: subscription.planName,
      size: subscription.size,
      frequency: subscription.frequency,
      price: subscription.price
    }
  };
};

/**
 * Calculate next delivery date based on frequency
 * @param {Date} currentDate - Current delivery date
 * @param {String} frequency - Delivery frequency
 * @returns {Date} Next delivery date
 */
const calculateNextDeliveryDate = (currentDate, frequency) => {
  const nextDate = new Date(currentDate);
  
  switch (frequency) {
    case 'Daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'Weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'Bi-Weekly':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'Monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
  }
  
  return nextDate;
};

/**
 * Generate delivery schedules for multiple subscriptions
 * @param {Array} subscriptions - Array of subscription objects
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Batch generation results
 */
const generateBatchDeliverySchedules = async (subscriptions, options = {}) => {
  try {
    const results = {
      totalProcessed: 0,
      totalGenerated: 0,
      successes: [],
      errors: []
    };

    for (const subscription of subscriptions) {
      try {
        const result = await generateDeliverySchedules(subscription, {
          ...options,
          logProgress: false // Reduce noise in batch processing
        });

        results.totalProcessed++;
        results.totalGenerated += result.count;
        results.successes.push({
          subscriptionId: subscription._id,
          generated: result.count,
          status: 'success'
        });

        if (options.logProgress) {
          console.log(`✅ Processed subscription ${subscription._id}: ${result.count} deliveries`);
        }
      } catch (error) {
        results.totalProcessed++;
        results.errors.push({
          subscriptionId: subscription._id,
          error: error.message,
          status: 'failed'
        });

        if (options.logProgress) {
          console.error(`❌ Failed to process subscription ${subscription._id}:`, error.message);
        }
      }
    }

    if (options.logProgress) {
      console.log(`🎉 Batch processing complete: ${results.totalGenerated} deliveries generated across ${results.successes.length} subscriptions, ${results.errors.length} failures`);
    }

    return results;
  } catch (error) {
    console.error('❌ Batch delivery generation failed:', error);
    throw new ErrorResponse(`Batch delivery generation failed: ${error.message}`, 500);
  }
};

/**
 * Remove all delivery schedules for a subscription
 * @param {String} subscriptionId - Subscription ID
 * @returns {Promise<Object>} Deletion result
 */
const removeDeliverySchedules = async (subscriptionId) => {
  try {
    const result = await Delivery.deleteMany({ subscriptionId: subscriptionId });
    console.log(`🗑️  Removed ${result.deletedCount} delivery schedules for subscription ${subscriptionId}`);
    return {
      success: true,
      deletedCount: result.deletedCount,
      subscriptionId: subscriptionId
    };
  } catch (error) {
    console.error('❌ Error removing delivery schedules:', error);
    throw new ErrorResponse(`Failed to remove delivery schedules: ${error.message}`, 500);
  }
};

module.exports = {
  generateDeliverySchedules,
  generateBatchDeliverySchedules,
  removeDeliverySchedules,
  calculateNextDeliveryDate,
  checkExistingDelivery
};