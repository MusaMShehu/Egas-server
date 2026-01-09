// const Delivery = require("../models/Delivery");
// const User = require("../models/User");
// const ErrorResponse = require("../utils/errorResponse");

// /**
//  * Enhanced Delivery Schedule Generator
//  * Generates delivery schedules for subscriptions based on frequency and type
//  * Uses specific number of deliveries per frequency: 5 for weekly, 3 for bi-weekly, 30 for daily, 12 for monthly, and 1 for one-time/emergency
//  */
// const generateDeliverySchedules = async (subscription, options = {}) => {
//   try {
//     const {
//       overrideExisting = false,
//       maxDeliveries = 10000, // Safety limit
//       logProgress = true
//     } = options;

//     // Validate subscription
//     if (!subscription || !subscription._id) {
//       throw new Error("Invalid subscription provided");
//     }

//     if (!subscription.userId) {
//       throw new Error("Subscription missing user ID");
//     }

//     const user = await User.findById(subscription.userId);
//     if (!user) {
//       throw new Error("User not found for subscription");
//     }

//     const deliverySchedules = [];
//     const startDate = new Date(subscription.startDate);
    
//     // For one-time and emergency plans, only create one delivery
//     if (subscription.frequency === "One-Time" || subscription.planType === "one-time" || subscription.planType === "emergency") {
//       if (logProgress) {
//         console.log(`🔄 Generating one-time delivery for subscription ${subscription._id}`);
//       }

//       const existingDelivery = await checkExistingDelivery(subscription._id, startDate);
      
//       if (!existingDelivery || overrideExisting) {
//         const deliveryData = createDeliveryData(subscription, user, startDate);
//         deliverySchedules.push(deliveryData);
//       } else if (logProgress) {
//         console.log(`⏭️  Delivery already exists for one-time subscription ${subscription._id}`);
//       }
//     } else {
//       // For recurring plans - generate specific number of deliveries
//       let numberOfDeliveries;
//       let daysBetweenDeliveries;
      
//       switch (subscription.frequency) {
//         case 'Bi-weekly':
//           numberOfDeliveries = 3;
//           daysBetweenDeliveries = 14;
//           break;
//         case 'Weekly':
//           numberOfDeliveries = 5;
//           daysBetweenDeliveries = 7;
//           break;
//         case 'Monthly':
//           numberOfDeliveries = 1;
//           daysBetweenDeliveries = 30;
//           break;
//         case 'Daily':
//           numberOfDeliveries = 30;
//           daysBetweenDeliveries = 1;
//           break;
//         default:
//           numberOfDeliveries = 1;
//           daysBetweenDeliveries = 1;
//       }

//       if (logProgress) {
//         console.log(`🔄 Generating ${numberOfDeliveries} deliveries for subscription ${subscription._id} (${subscription.frequency})`);
//       }

//       // Generate deliveries starting from subscription start date
//       for (let i = 0; i < numberOfDeliveries; i++) {
//         const deliveryDate = new Date(startDate);
//         deliveryDate.setDate(deliveryDate.getDate() + (i * daysBetweenDeliveries));
        
//         const existingDelivery = await checkExistingDelivery(subscription._id, deliveryDate);
        
//         if (!existingDelivery || overrideExisting) {
//           const deliveryData = createDeliveryData(subscription, user, deliveryDate);
//           deliverySchedules.push(deliveryData);
//         }
//       }
//     }

//     // Save delivery schedules
//     let createdDeliveries = [];
//     if (deliverySchedules.length > 0) {
//       createdDeliveries = await Delivery.insertMany(deliverySchedules);
      
//       if (logProgress) {
//         console.log(`✅ Generated ${createdDeliveries.length} delivery schedules for subscription ${subscription._id}`);
//       }
//     } else if (logProgress) {
//       console.log(`⏭️  No new deliveries generated for subscription ${subscription._id}`);
//     }

//     return {
//       success: true,
//       count: createdDeliveries.length,
//       deliveries: createdDeliveries,
//       subscriptionId: subscription._id
//     };
//   } catch (error) {
//     console.error('❌ Error generating delivery schedules:', error);
//     throw new ErrorResponse(`Delivery schedule generation failed: ${error.message}`, 500);
//   }
// };

// /**
//  * Check if delivery already exists for a specific date
//  * @param {String} subscriptionId - Subscription ID
//  * @param {Date} deliveryDate - Delivery date to check
//  * @returns {Promise<Object|null>} Existing delivery or null
//  */
// const checkExistingDelivery = async (subscriptionId, deliveryDate) => {
//   const deliveryStart = new Date(deliveryDate);
//   deliveryStart.setHours(0, 0, 0, 0);
  
//   const deliveryEnd = new Date(deliveryDate);
//   deliveryEnd.setHours(23, 59, 59, 999);

//   return await Delivery.findOne({
//     subscriptionId: subscriptionId,
//     deliveryDate: { 
//       $gte: deliveryStart, 
//       $lte: deliveryEnd 
//     }
//   });
// };

// /**
//  * Create delivery data object
//  * @param {Object} subscription - Subscription object
//  * @param {Object} user - User object
//  * @param {Date} deliveryDate - Delivery date
//  * @returns {Object} Delivery data object
//  */
// const createDeliveryData = (subscription, user, deliveryDate) => {
//   return {
//     subscriptionId: subscription._id,
//     userId: subscription.userId,
//     deliveryDate: new Date(deliveryDate),
//     scheduledDate: new Date(deliveryDate),
//     status: 'pending',
//     address: user.address || 'Address not provided',
//     customerPhone: user.phone || 'Phone not provided',
//     customerName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
//     planDetails: {
//       planName: subscription.planName,
//       size: subscription.size,
//       frequency: subscription.frequency,
//       price: subscription.price
//     }
//   };
// };

// /**
//  * Calculate next delivery date based on frequency
//  * @param {Date} currentDate - Current delivery date
//  * @param {String} frequency - Delivery frequency
//  * @returns {Date} Next delivery date
//  */
// const calculateNextDeliveryDate = (currentDate, frequency) => {
//   const nextDate = new Date(currentDate);
  
//   switch (frequency) {
//     case 'Daily':
//       nextDate.setDate(nextDate.getDate() + 1);
//       break;
//     case 'Weekly':
//       nextDate.setDate(nextDate.getDate() + 7);
//       break;
//     case 'Bi-Weekly':
//       nextDate.setDate(nextDate.getDate() + 14);
//       break;
//     case 'Monthly':
//       nextDate.setMonth(nextDate.getMonth() + 1);
//       break;
//     default:
//       nextDate.setMonth(nextDate.getMonth() + 1);
//   }
  
//   return nextDate;
// };

// /**
//  * Generate delivery schedules for multiple subscriptions
//  * @param {Array} subscriptions - Array of subscription objects
//  * @param {Object} options - Configuration options
//  * @returns {Promise<Object>} Batch generation results
//  */
// const generateBatchDeliverySchedules = async (subscriptions, options = {}) => {
//   try {
//     const results = {
//       totalProcessed: 0,
//       totalGenerated: 0,
//       successes: [],
//       errors: []
//     };

//     for (const subscription of subscriptions) {
//       try {
//         const result = await generateDeliverySchedules(subscription, {
//           ...options,
//           logProgress: false // Reduce noise in batch processing
//         });

//         results.totalProcessed++;
//         results.totalGenerated += result.count;
//         results.successes.push({
//           subscriptionId: subscription._id,
//           generated: result.count,
//           status: 'success'
//         });

//         if (options.logProgress) {
//           console.log(`✅ Processed subscription ${subscription._id}: ${result.count} deliveries`);
//         }
//       } catch (error) {
//         results.totalProcessed++;
//         results.errors.push({
//           subscriptionId: subscription._id,
//           error: error.message,
//           status: 'failed'
//         });

//         if (options.logProgress) {
//           console.error(`❌ Failed to process subscription ${subscription._id}:`, error.message);
//         }
//       }
//     }

//     if (options.logProgress) {
//       console.log(`🎉 Batch processing complete: ${results.totalGenerated} deliveries generated across ${results.successes.length} subscriptions, ${results.errors.length} failures`);
//     }

//     return results;
//   } catch (error) {
//     console.error('❌ Batch delivery generation failed:', error);
//     throw new ErrorResponse(`Batch delivery generation failed: ${error.message}`, 500);
//   }
// };

// /**
//  * Remove all delivery schedules for a subscription
//  * @param {String} subscriptionId - Subscription ID
//  * @returns {Promise<Object>} Deletion result
//  */
// const removeDeliverySchedules = async (subscriptionId) => {
//   try {
//     const result = await Delivery.deleteMany({ subscriptionId: subscriptionId });
//     console.log(`🗑️  Removed ${result.deletedCount} delivery schedules for subscription ${subscriptionId}`);
//     return {
//       success: true,
//       deletedCount: result.deletedCount,
//       subscriptionId: subscriptionId
//     };
//   } catch (error) {
//     console.error('❌ Error removing delivery schedules:', error);
//     throw new ErrorResponse(`Failed to remove delivery schedules: ${error.message}`, 500);
//   }
// };

// module.exports = {
//   generateDeliverySchedules,
//   generateBatchDeliverySchedules,
//   removeDeliverySchedules,
//   calculateNextDeliveryDate,
//   checkExistingDelivery
// };






// const Delivery = require("../models/Delivery");
// const User = require("../models/User");
// const ErrorResponse = require("../utils/errorResponse");

// /**
//  * Enhanced Delivery Schedule Generator
//  * Generates delivery schedules for subscriptions based on frequency and type
//  * Takes subscription period and pause/resume functionality into account
//  */
// const generateDeliverySchedules = async (subscription, options = {}) => {
//   try {
//     const {
//       overrideExisting = false,
//       maxDeliveries = 10000, // Safety limit
//       logProgress = true,
//       isResume = false // Flag to indicate if this is a resume operation
//     } = options;

//     // Validate subscription
//     if (!subscription || !subscription._id) {
//       throw new Error("Invalid subscription provided");
//     }

//     if (!subscription.userId) {
//       throw new Error("Subscription missing user ID");
//     }

//     const user = await User.findById(subscription.userId);
//     if (!user) {
//       throw new Error("User not found for subscription");
//     }

//     const deliverySchedules = [];
//     let startDate = new Date(subscription.startDate);
//     const endDate = new Date(subscription.endDate);
    
//     // If resuming, adjust start date based on pause history
//     if (isResume && subscription.pauseHistory && subscription.pauseHistory.length > 0) {
//       const totalPauseDurationMs = calculateTotalPauseDuration(subscription.pauseHistory);
//       startDate = new Date(startDate.getTime() + totalPauseDurationMs);
      
//       if (logProgress) {
//         console.log(`🔄 Adjusted start date by ${totalPauseDurationMs / (1000 * 60 * 60 * 24)} days due to pause history`);
//       }
//     }
    
//     // For one-time and emergency plans, only create one delivery
//     if (subscription.frequency === "One-Time" || subscription.planType === "one-time" || subscription.planType === "emergency") {
//       if (logProgress) {
//         console.log(`🔄 Generating one-time delivery for subscription ${subscription._id}`);
//       }

//       const existingDelivery = await checkExistingDelivery(subscription._id, startDate);
      
//       if (!existingDelivery || overrideExisting) {
//         const deliveryData = createDeliveryData(subscription, user, startDate);
//         deliverySchedules.push(deliveryData);
//       } else if (logProgress) {
//         console.log(`⏭️  Delivery already exists for one-time subscription ${subscription._id}`);
//       }
//     } else {
//       // For recurring plans - generate deliveries within subscription period
//       if (logProgress) {
//         console.log(`🔄 Generating deliveries for subscription ${subscription._id} (${subscription.frequency}) from ${startDate.toDateString()} to ${endDate.toDateString()}`);
//       }

//       // Calculate days between deliveries based on frequency
//       let daysBetweenDeliveries;
      
//       switch (subscription.frequency) {
//         case 'Bi-weekly':
//           daysBetweenDeliveries = 14;
//           break;
//         case 'Weekly':
//           daysBetweenDeliveries = 7;
//           break;
//         case 'Monthly':
//           daysBetweenDeliveries = 30;
//           break;
//         case 'Daily':
//           daysBetweenDeliveries = 1;
//           break;
//         default:
//           daysBetweenDeliveries = 30; // Default to monthly
//       }

//       // Generate deliveries starting from adjusted start date
//       // Stop when we reach or exceed the end date
//       let deliveryDate = new Date(startDate);
//       let deliveryCount = 0;
      
//       while (deliveryDate <= endDate && deliveryCount < maxDeliveries) {
//         // Skip if delivery date is during a pause period
//         if (!isDeliveryDuringPause(deliveryDate, subscription.pauseHistory)) {
//           const existingDelivery = await checkExistingDelivery(subscription._id, deliveryDate);
          
//           if (!existingDelivery || overrideExisting) {
//             const deliveryData = createDeliveryData(subscription, user, new Date(deliveryDate));
//             deliverySchedules.push(deliveryData);
//           }
//         } else if (logProgress) {
//           console.log(`  ⏸️  Skipping delivery on ${deliveryDate.toDateString()} - falls in pause period`);
//         }
        
//         // Calculate next delivery date
//         const nextDate = calculateNextDeliveryDate(deliveryDate, subscription.frequency);
//         deliveryDate = nextDate;
//         deliveryCount++;
        
//         if (logProgress && deliveryCount % 10 === 0) {
//           console.log(`  ... generated ${deliveryCount} delivery dates so far`);
//         }
//       }

//       if (logProgress) {
//         console.log(`  Generated ${deliverySchedules.length} delivery dates within subscription period`);
//       }
//     }

//     // Save delivery schedules
//     let createdDeliveries = [];
//     if (deliverySchedules.length > 0) {
//       createdDeliveries = await Delivery.insertMany(deliverySchedules);
      
//       if (logProgress) {
//         console.log(`✅ Generated ${createdDeliveries.length} delivery schedules for subscription ${subscription._id}`);
//       }
//     } else if (logProgress) {
//       console.log(`⏭️  No new deliveries generated for subscription ${subscription._id}`);
//     }

//     return {
//       success: true,
//       count: createdDeliveries.length,
//       deliveries: createdDeliveries,
//       subscriptionId: subscription._id
//     };
//   } catch (error) {
//     console.error('❌ Error generating delivery schedules:', error);
//     throw new ErrorResponse(`Delivery schedule generation failed: ${error.message}`, 500);
//   }
// };

// /**
//  * Pause all deliveries for a subscription
//  * @param {String} subscriptionId - Subscription ID
//  * @param {Date} pauseDate - Date when subscription was paused
//  * @returns {Promise<Object>} Pause result
//  */
// const pauseDeliveries = async (subscriptionId, pauseDate) => {
//   try {
//     // Find all pending/assigned/accepted/out_for_delivery deliveries
//     const deliveries = await Delivery.find({
//       subscriptionId: subscriptionId,
//       status: { $in: ['pending', 'assigned', 'accepted', 'out_for_delivery'] },
//       deliveryDate: { $gte: pauseDate } // Only future deliveries
//     });

//     if (deliveries.length === 0) {
//       return {
//         success: true,
//         pausedCount: 0,
//         message: 'No deliveries to pause'
//       };
//     }

//     // Update deliveries to paused status
//     const updatePromises = deliveries.map(delivery => 
//       Delivery.findByIdAndUpdate(delivery._id, {
//         status: 'paused',
//         originalDeliveryDate: delivery.deliveryDate, // Save original date
//         pausedAt: pauseDate
//       })
//     );

//     await Promise.all(updatePromises);

//     console.log(`⏸️  Paused ${deliveries.length} deliveries for subscription ${subscriptionId}`);
    
//     return {
//       success: true,
//       pausedCount: deliveries.length,
//       deliveries: deliveries.map(d => d._id)
//     };
//   } catch (error) {
//     console.error('❌ Error pausing deliveries:', error);
//     throw new ErrorResponse(`Failed to pause deliveries: ${error.message}`, 500);
//   }
// };

// /**
//  * Resume deliveries for a subscription
//  * @param {Object} subscription - Subscription object with pause history
//  * @param {Date} resumeDate - Date when subscription was resumed
//  * @returns {Promise<Object>} Resume result
//  */
// const resumeDeliveries = async (subscription, resumeDate) => {
//   try {
//     const subscriptionId = subscription._id;
    
//     // Calculate total pause duration
//     const totalPauseDurationMs = calculateTotalPauseDuration(subscription.pauseHistory);
    
//     // Find all paused deliveries for this subscription
//     const pausedDeliveries = await Delivery.find({
//       subscriptionId: subscriptionId,
//       status: 'paused'
//     });

//     if (pausedDeliveries.length === 0) {
//       return {
//         success: true,
//         resumedCount: 0,
//         message: 'No paused deliveries to resume'
//       };
//     }

//     const updateResults = [];
//     const deletePromises = [];
//     const createPromises = [];

//     for (const delivery of pausedDeliveries) {
//       // Calculate new delivery date (original date + pause duration)
//       const originalDate = delivery.originalDeliveryDate || delivery.deliveryDate;
//       const newDeliveryDate = new Date(originalDate.getTime() + totalPauseDurationMs);
      
//       // If new date is in the past, delete this delivery
//       if (newDeliveryDate < resumeDate) {
//         deletePromises.push(Delivery.findByIdAndDelete(delivery._id));
//         continue;
//       }
      
//       // Update delivery with new date and status
//       const updatedDelivery = await Delivery.findByIdAndUpdate(
//         delivery._id,
//         {
//           status: 'pending',
//           deliveryDate: newDeliveryDate,
//           scheduledDate: newDeliveryDate,
//           originalDeliveryDate: null, // Clear after rescheduling
//           pausedAt: null
//         },
//         { new: true }
//       );

//       updateResults.push({
//         deliveryId: delivery._id,
//         oldDate: originalDate,
//         newDate: newDeliveryDate,
//         daysExtended: totalPauseDurationMs / (1000 * 60 * 60 * 24)
//       });
//     }

//     // Execute all delete and create operations
//     await Promise.all(deletePromises);
    
//     // Generate new deliveries for any gaps created by the pause
//     const generationResult = await generateDeliverySchedules(subscription, {
//       logProgress: false,
//       isResume: true // Flag to adjust dates based on pause
//     });

//     console.log(`▶️  Resumed ${updateResults.length} deliveries, deleted ${deletePromises.length}, created ${generationResult.count} new deliveries for subscription ${subscriptionId}`);
    
//     return {
//       success: true,
//       resumedCount: updateResults.length,
//       deletedCount: deletePromises.length,
//       newCount: generationResult.count,
//       updates: updateResults,
//       subscriptionId: subscriptionId
//     };
//   } catch (error) {
//     console.error('❌ Error resuming deliveries:', error);
//     throw new ErrorResponse(`Failed to resume deliveries: ${error.message}`, 500);
//   }
// };

// /**
//  * Check if delivery already exists for a specific date
//  * @param {String} subscriptionId - Subscription ID
//  * @param {Date} deliveryDate - Delivery date to check
//  * @returns {Promise<Object|null>} Existing delivery or null
//  */
// const checkExistingDelivery = async (subscriptionId, deliveryDate) => {
//   const deliveryStart = new Date(deliveryDate);
//   deliveryStart.setHours(0, 0, 0, 0);
  
//   const deliveryEnd = new Date(deliveryDate);
//   deliveryEnd.setHours(23, 59, 59, 999);

//   return await Delivery.findOne({
//     subscriptionId: subscriptionId,
//     deliveryDate: { 
//       $gte: deliveryStart, 
//       $lte: deliveryEnd 
//     }
//   });
// };

// /**
//  * Create delivery data object
//  * @param {Object} subscription - Subscription object
//  * @param {Object} user - User object
//  * @param {Date} deliveryDate - Delivery date
//  * @returns {Object} Delivery data object
//  */
// const createDeliveryData = (subscription, user, deliveryDate) => {
//   return {
//     subscriptionId: subscription._id,
//     userId: subscription.userId,
//     deliveryDate: new Date(deliveryDate),
//     scheduledDate: new Date(deliveryDate),
//     status: 'pending',
//     address: user.address || 'Address not provided',
//     customerPhone: user.phone || 'Phone not provided',
//     customerName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
//     planDetails: {
//       planName: subscription.planName,
//       size: subscription.size,
//       frequency: subscription.frequency,
//       price: subscription.price
//     },
//     subscriptionPeriod: subscription.subscriptionPeriod,
//     planType: subscription.planType
//   };
// };

// /**
//  * Calculate next delivery date based on frequency
//  * @param {Date} currentDate - Current delivery date
//  * @param {String} frequency - Delivery frequency
//  * @returns {Date} Next delivery date
//  */
// const calculateNextDeliveryDate = (currentDate, frequency) => {
//   const nextDate = new Date(currentDate);
  
//   switch (frequency) {
//     case 'Daily':
//       nextDate.setDate(nextDate.getDate() + 1);
//       break;
//     case 'Weekly':
//       nextDate.setDate(nextDate.getDate() + 7);
//       break;
//     case 'Bi-weekly':
//       nextDate.setDate(nextDate.getDate() + 14);
//       break;
//     case 'Monthly':
//       nextDate.setMonth(nextDate.getMonth() + 1);
//       break;
//     case 'One-Time':
//       // No next date for one-time deliveries
//       break;
//     default:
//       nextDate.setMonth(nextDate.getMonth() + 1);
//   }
  
//   return nextDate;
// };

// /**
//  * Calculate total pause duration from pause history
//  * @param {Array} pauseHistory - Array of pause/resume objects
//  * @returns {Number} Total pause duration in milliseconds
//  */
// const calculateTotalPauseDuration = (pauseHistory) => {
//   if (!pauseHistory || pauseHistory.length === 0) {
//     return 0;
//   }

//   let totalDuration = 0;
  
//   for (const pause of pauseHistory) {
//     if (pause.pausedAt && pause.resumedAt) {
//       totalDuration += (new Date(pause.resumedAt) - new Date(pause.pausedAt));
//     } else if (pause.durationMs) {
//       totalDuration += pause.durationMs;
//     }
//   }
  
//   return totalDuration;
// };

// /**
//  * Check if a delivery date falls within any pause period
//  * @param {Date} deliveryDate - Delivery date to check
//  * @param {Array} pauseHistory - Array of pause/resume objects
//  * @returns {Boolean} True if date is during a pause period
//  */
// const isDeliveryDuringPause = (deliveryDate, pauseHistory) => {
//   if (!pauseHistory || pauseHistory.length === 0) {
//     return false;
//   }

//   const date = new Date(deliveryDate);
  
//   for (const pause of pauseHistory) {
//     if (pause.pausedAt && pause.resumedAt) {
//       const pausedAt = new Date(pause.pausedAt);
//       const resumedAt = new Date(pause.resumedAt);
      
//       if (date >= pausedAt && date <= resumedAt) {
//         return true;
//       }
//     }
//   }
  
//   return false;
// };

// /**
//  * Generate delivery schedules for multiple subscriptions
//  * @param {Array} subscriptions - Array of subscription objects
//  * @param {Object} options - Configuration options
//  * @returns {Promise<Object>} Batch generation results
//  */
// const generateBatchDeliverySchedules = async (subscriptions, options = {}) => {
//   try {
//     const results = {
//       totalProcessed: 0,
//       totalGenerated: 0,
//       successes: [],
//       errors: []
//     };

//     for (const subscription of subscriptions) {
//       try {
//         const result = await generateDeliverySchedules(subscription, {
//           ...options,
//           logProgress: false // Reduce noise in batch processing
//         });

//         results.totalProcessed++;
//         results.totalGenerated += result.count;
//         results.successes.push({
//           subscriptionId: subscription._id,
//           generated: result.count,
//           status: 'success'
//         });

//         if (options.logProgress) {
//           console.log(`✅ Processed subscription ${subscription._id}: ${result.count} deliveries`);
//         }
//       } catch (error) {
//         results.totalProcessed++;
//         results.errors.push({
//           subscriptionId: subscription._id,
//           error: error.message,
//           status: 'failed'
//         });

//         if (options.logProgress) {
//           console.error(`❌ Failed to process subscription ${subscription._id}:`, error.message);
//         }
//       }
//     }

//     if (options.logProgress) {
//       console.log(`🎉 Batch processing complete: ${results.totalGenerated} deliveries generated across ${results.successes.length} subscriptions, ${results.errors.length} failures`);
//     }

//     return results;
//   } catch (error) {
//     console.error('❌ Batch delivery generation failed:', error);
//     throw new ErrorResponse(`Batch delivery generation failed: ${error.message}`, 500);
//   }
// };

// /**
//  * Remove all delivery schedules for a subscription
//  * @param {String} subscriptionId - Subscription ID
//  * @returns {Promise<Object>} Deletion result
//  */
// const removeDeliverySchedules = async (subscriptionId) => {
//   try {
//     const result = await Delivery.deleteMany({ subscriptionId: subscriptionId });
//     console.log(`🗑️  Removed ${result.deletedCount} delivery schedules for subscription ${subscriptionId}`);
//     return {
//       success: true,
//       deletedCount: result.deletedCount,
//       subscriptionId: subscriptionId
//     };
//   } catch (error) {
//     console.error('❌ Error removing delivery schedules:', error);
//     throw new ErrorResponse(`Failed to remove delivery schedules: ${error.message}`, 500);
//   }
// };

// /**
//  * Regenerate deliveries for a subscription (useful when subscription is updated)
//  * @param {Object} subscription - Subscription object
//  * @param {Object} options - Configuration options
//  * @returns {Promise<Object>} Regeneration result
//  */
// const regenerateDeliverySchedules = async (subscription, options = {}) => {
//   try {
//     const { logProgress = true } = options;
    
//     if (logProgress) {
//       console.log(`🔄 Regenerating deliveries for subscription ${subscription._id}`);
//     }
    
//     // First remove existing deliveries
//     const removalResult = await removeDeliverySchedules(subscription._id);
    
//     // Then generate new ones
//     const generationResult = await generateDeliverySchedules(subscription, {
//       ...options,
//       overrideExisting: true
//     });
    
//     return {
//       success: true,
//       removed: removalResult.deletedCount,
//       generated: generationResult.count,
//       subscriptionId: subscription._id
//     };
//   } catch (error) {
//     console.error('❌ Error regenerating delivery schedules:', error);
//     throw new ErrorResponse(`Failed to regenerate delivery schedules: ${error.message}`, 500);
//   }
// };

// /**
//  * Get all deliveries for a subscription with pause information
//  * @param {String} subscriptionId - Subscription ID
//  * @returns {Promise<Array>} Array of deliveries
//  */
// const getSubscriptionDeliveries = async (subscriptionId) => {
//   return await Delivery.find({ subscriptionId: subscriptionId })
//     .sort({ deliveryDate: 1 });
// };

// module.exports = {
//   generateDeliverySchedules,
//   generateBatchDeliverySchedules,
//   removeDeliverySchedules,
//   calculateNextDeliveryDate,
//   checkExistingDelivery,
//   regenerateDeliverySchedules,
//   pauseDeliveries,
//   resumeDeliveries,
//   getSubscriptionDeliveries,
//   calculateTotalPauseDuration
// };




const Delivery = require("../models/Delivery");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");

/**
 * Enhanced Delivery Schedule Generator
 * Generates delivery schedules for subscriptions based on frequency and type
 * Takes subscription period and pause/resume functionality into account
 * NEW: Matches subscription price calculation with initial extra delivery + regular deliveries
 */
const generateDeliverySchedules = async (subscription, options = {}) => {
  try {
    const {
      overrideExisting = false,
      maxDeliveries = 10000, // Safety limit
      logProgress = true,
      isResume = false // Flag to indicate if this is a resume operation
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
    let startDate = new Date(subscription.startDate);
    const endDate = new Date(subscription.endDate);
    
    // If resuming, adjust start date based on pause history
    if (isResume && subscription.pauseHistory && subscription.pauseHistory.length > 0) {
      const totalPauseDurationMs = calculateTotalPauseDuration(subscription.pauseHistory);
      startDate = new Date(startDate.getTime() + totalPauseDurationMs);
      
      if (logProgress) {
        console.log(`🔄 Adjusted start date by ${totalPauseDurationMs / (1000 * 60 * 60 * 24)} days due to pause history`);
      }
    }
    
    // For one-time and emergency plans, only create one delivery
    if (subscription.frequency === "One-Time" || subscription.planType === "one-time" || subscription.planType === "emergency") {
      if (logProgress) {
        console.log(`🔄 Generating one-time delivery for subscription ${subscription._id}`);
      }

      const existingDelivery = await checkExistingDelivery(subscription._id, startDate);
      
      if (!existingDelivery || overrideExisting) {
        const deliveryData = createDeliveryData(subscription, user, startDate);
        deliveryData.isInitialDelivery = true;
        deliveryData.sequenceNumber = 1;
        deliveryData.totalSequences = 1;
        deliverySchedules.push(deliveryData);
      } else if (logProgress) {
        console.log(`⏭️  Delivery already exists for one-time subscription ${subscription._id}`);
      }
    } else {
      // For recurring plans - generate deliveries based on frequency with initial extra delivery
      if (logProgress) {
        console.log(`🔄 Generating deliveries for subscription ${subscription._id} (${subscription.frequency}) from ${startDate.toDateString()} to ${endDate.toDateString()}`);
      }

      // Determine deliveries per month based on frequency
      let deliveriesPerMonth = 0;
      let daysBetweenDeliveries = 0;
      
      switch (subscription.frequency) {
        case "Daily":
          deliveriesPerMonth = 30;
          daysBetweenDeliveries = 1;
          break;
        case "Weekly":
          deliveriesPerMonth = 4;
          daysBetweenDeliveries = 7;
          break;
        case "Bi-weekly":
          deliveriesPerMonth = 2;
          daysBetweenDeliveries = 14;
          break;
        case "Monthly":
          deliveriesPerMonth = 1;
          daysBetweenDeliveries = 30;
          break;
        default:
          deliveriesPerMonth = 1;
          daysBetweenDeliveries = 30;
      }

      // Calculate total number of deliveries needed
      let totalDeliveries = 0;
      
      if (subscription.subscriptionPeriod === 1) {
        // First month only: deliveries per month + 1 extra initial delivery
        totalDeliveries = deliveriesPerMonth + 1;
      } else {
        // Multiple months: First month has extra delivery, subsequent months have regular deliveries
        totalDeliveries = (deliveriesPerMonth + 1) + (deliveriesPerMonth * (subscription.subscriptionPeriod - 1));
      }

      if (logProgress) {
        console.log(`  Deliveries per month: ${deliveriesPerMonth}`);
        console.log(`  Total deliveries needed: ${totalDeliveries} (including initial extra delivery)`);
      }

      let currentDate = new Date(startDate);
      let sequenceNumber = 1;

      // Add initial delivery (Day 1) - This is the extra delivery
      const existingInitial = await checkExistingDelivery(subscription._id, currentDate);
      
      if (!existingInitial || overrideExisting) {
        const deliveryData = createDeliveryData(subscription, user, new Date(currentDate));
        deliveryData.isInitialDelivery = true;
        deliveryData.sequenceNumber = sequenceNumber;
        deliveryData.totalSequences = totalDeliveries;
        deliverySchedules.push(deliveryData);
      }
      
      sequenceNumber++;

      // Add regular deliveries based on frequency
      for (let i = 0; i < totalDeliveries - 1; i++) {
        // Calculate next delivery date based on frequency
        let nextDate = new Date(currentDate);
        
        if (subscription.frequency === "Monthly") {
          nextDate.setMonth(nextDate.getMonth() + 1);
        } else {
          nextDate.setDate(nextDate.getDate() + daysBetweenDeliveries);
        }
        
        currentDate = nextDate;
        
        // Skip if delivery date is past end date
        if (currentDate > endDate) {
          if (logProgress) {
            console.log(`  ⏭️  Stopping: Delivery date ${currentDate.toDateString()} exceeds subscription end date ${endDate.toDateString()}`);
          }
          break;
        }

        // Skip if delivery date is during a pause period
        if (isDeliveryDuringPause(currentDate, subscription.pauseHistory)) {
          if (logProgress) {
            console.log(`  ⏸️  Skipping delivery on ${currentDate.toDateString()} - falls in pause period`);
          }
          continue;
        }

        // Check if delivery already exists
        const existingDelivery = await checkExistingDelivery(subscription._id, currentDate);
        
        if (!existingDelivery || overrideExisting) {
          const deliveryData = createDeliveryData(subscription, user, new Date(currentDate));
          deliveryData.sequenceNumber = sequenceNumber;
          deliveryData.totalSequences = totalDeliveries;
          deliverySchedules.push(deliveryData);
        }
        
        sequenceNumber++;
        
        // Safety check to prevent infinite loops
        if (sequenceNumber > maxDeliveries) {
          if (logProgress) {
            console.warn(`⚠️  Reached maximum delivery limit (${maxDeliveries}) for subscription ${subscription._id}`);
          }
          break;
        }
      }

      if (logProgress) {
        console.log(`  Generated ${deliverySchedules.length} delivery dates within subscription period`);
        
        // Log delivery breakdown
        if (deliverySchedules.length > 0) {
          const initialDeliveries = deliverySchedules.filter(d => d.isInitialDelivery).length;
          const regularDeliveries = deliverySchedules.length - initialDeliveries;
          console.log(`    - Initial deliveries: ${initialDeliveries}`);
          console.log(`    - Regular deliveries: ${regularDeliveries}`);
          
          // Show first and last delivery dates
          const firstDate = deliverySchedules[0].deliveryDate;
          const lastDate = deliverySchedules[deliverySchedules.length - 1].deliveryDate;
          console.log(`    - First delivery: ${firstDate.toDateString()}`);
          console.log(`    - Last delivery: ${lastDate.toDateString()}`);
        }
      }
    }

    // Save delivery schedules
    let createdDeliveries = [];
    if (deliverySchedules.length > 0) {
      createdDeliveries = await Delivery.insertMany(deliverySchedules);
      
      if (logProgress) {
        console.log(`✅ Generated ${createdDeliveries.length} delivery schedules for subscription ${subscription._id}`);
        
        // Summary log
        const subscriptionPeriod = subscription.subscriptionPeriod || 1;
        const frequency = subscription.frequency;
        
        console.log(`📊 Delivery Summary for ${subscription.planName}:`);
        console.log(`   - Frequency: ${frequency}`);
        console.log(`   - Period: ${subscriptionPeriod} month(s)`);
        console.log(`   - Total deliveries generated: ${createdDeliveries.length}`);
        
        // Breakdown by frequency
        switch (frequency) {
          case "Daily":
            console.log(`   - Deliveries per month: 30`);
            console.log(`   - Including: 1 initial extra delivery on day 1`);
            console.log(`   - Expected: ${subscriptionPeriod === 1 ? "31 deliveries (30 + 1 initial)" : `${(30 + 1) + (30 * (subscriptionPeriod - 1))} deliveries (First: 31, Subsequent: 30/month)`}`);
            break;
          case "Weekly":
            console.log(`   - Deliveries per month: 4`);
            console.log(`   - Including: 1 initial extra delivery on day 1`);
            console.log(`   - Expected: ${subscriptionPeriod === 1 ? "5 deliveries (4 + 1 initial)" : `${(4 + 1) + (4 * (subscriptionPeriod - 1))} deliveries (First: 5, Subsequent: 4/month)`}`);
            break;
          case "Bi-weekly":
            console.log(`   - Deliveries per month: 2`);
            console.log(`   - Including: 1 initial extra delivery on day 1`);
            console.log(`   - Expected: ${subscriptionPeriod === 1 ? "3 deliveries (2 + 1 initial)" : `${(2 + 1) + (2 * (subscriptionPeriod - 1))} deliveries (First: 3, Subsequent: 2/month)`}`);
            break;
          case "Monthly":
            console.log(`   - Deliveries per month: 1`);
            console.log(`   - Including: 1 initial extra delivery on day 1`);
            console.log(`   - Expected: ${subscriptionPeriod === 1 ? "2 deliveries (1 + 1 initial)" : `${(1 + 1) + (1 * (subscriptionPeriod - 1))} deliveries (First: 2, Subsequent: 1/month)`}`);
            break;
        }
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
 * Pause all deliveries for a subscription
 * @param {String} subscriptionId - Subscription ID
 * @param {Date} pauseDate - Date when subscription was paused
 * @returns {Promise<Object>} Pause result
 */
const pauseDeliveries = async (subscriptionId, pauseDate) => {
  try {
    // Find all pending/assigned/accepted/out_for_delivery deliveries
    const deliveries = await Delivery.find({
      subscriptionId: subscriptionId,
      status: { $in: ['pending', 'assigned', 'accepted', 'out_for_delivery'] },
      deliveryDate: { $gte: pauseDate } // Only future deliveries
    });

    if (deliveries.length === 0) {
      return {
        success: true,
        pausedCount: 0,
        message: 'No deliveries to pause'
      };
    }

    // Update deliveries to paused status
    const updatePromises = deliveries.map(delivery => 
      Delivery.findByIdAndUpdate(delivery._id, {
        status: 'paused',
        originalDeliveryDate: delivery.deliveryDate, // Save original date
        pausedAt: pauseDate
      })
    );

    await Promise.all(updatePromises);

    console.log(`⏸️  Paused ${deliveries.length} deliveries for subscription ${subscriptionId}`);
    
    return {
      success: true,
      pausedCount: deliveries.length,
      deliveries: deliveries.map(d => d._id)
    };
  } catch (error) {
    console.error('❌ Error pausing deliveries:', error);
    throw new ErrorResponse(`Failed to pause deliveries: ${error.message}`, 500);
  }
};

/**
 * Resume deliveries for a subscription
 * @param {Object} subscription - Subscription object with pause history
 * @param {Date} resumeDate - Date when subscription was resumed
 * @returns {Promise<Object>} Resume result
 */
const resumeDeliveries = async (subscription, resumeDate) => {
  try {
    const subscriptionId = subscription._id;
    
    // Calculate total pause duration
    const totalPauseDurationMs = calculateTotalPauseDuration(subscription.pauseHistory);
    
    // Find all paused deliveries for this subscription
    const pausedDeliveries = await Delivery.find({
      subscriptionId: subscriptionId,
      status: 'paused'
    });

    if (pausedDeliveries.length === 0) {
      return {
        success: true,
        resumedCount: 0,
        message: 'No paused deliveries to resume'
      };
    }

    const updateResults = [];
    const deletePromises = [];
    const createPromises = [];

    for (const delivery of pausedDeliveries) {
      // Calculate new delivery date (original date + pause duration)
      const originalDate = delivery.originalDeliveryDate || delivery.deliveryDate;
      const newDeliveryDate = new Date(originalDate.getTime() + totalPauseDurationMs);
      
      // If new date is in the past, delete this delivery
      if (newDeliveryDate < resumeDate) {
        deletePromises.push(Delivery.findByIdAndDelete(delivery._id));
        continue;
      }
      
      // Update delivery with new date and status
      const updatedDelivery = await Delivery.findByIdAndUpdate(
        delivery._id,
        {
          status: 'pending',
          deliveryDate: newDeliveryDate,
          scheduledDate: newDeliveryDate,
          originalDeliveryDate: null, // Clear after rescheduling
          pausedAt: null
        },
        { new: true }
      );

      updateResults.push({
        deliveryId: delivery._id,
        oldDate: originalDate,
        newDate: newDeliveryDate,
        daysExtended: totalPauseDurationMs / (1000 * 60 * 60 * 24)
      });
    }

    // Execute all delete and create operations
    await Promise.all(deletePromises);
    
    // Generate new deliveries for any gaps created by the pause
    const generationResult = await generateDeliverySchedules(subscription, {
      logProgress: false,
      isResume: true // Flag to adjust dates based on pause
    });

    console.log(`▶️  Resumed ${updateResults.length} deliveries, deleted ${deletePromises.length}, created ${generationResult.count} new deliveries for subscription ${subscriptionId}`);
    
    return {
      success: true,
      resumedCount: updateResults.length,
      deletedCount: deletePromises.length,
      newCount: generationResult.count,
      updates: updateResults,
      subscriptionId: subscriptionId
    };
  } catch (error) {
    console.error('❌ Error resuming deliveries:', error);
    throw new ErrorResponse(`Failed to resume deliveries: ${error.message}`, 500);
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
      planType: subscription.planType,
      size: subscription.size,
      frequency: subscription.frequency,
      subscriptionPeriod: subscription.subscriptionPeriod,
      price: subscription.price
    },
    subscriptionPeriod: subscription.subscriptionPeriod,
    planType: subscription.planType,
    isInitialDelivery: false,
    sequenceNumber: 0,
    totalSequences: 0
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
    case 'Bi-weekly':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'Monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'One-Time':
      // No next date for one-time deliveries
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
  }
  
  return nextDate;
};

/**
 * Calculate total pause duration from pause history
 * @param {Array} pauseHistory - Array of pause/resume objects
 * @returns {Number} Total pause duration in milliseconds
 */
const calculateTotalPauseDuration = (pauseHistory) => {
  if (!pauseHistory || pauseHistory.length === 0) {
    return 0;
  }

  let totalDuration = 0;
  
  for (const pause of pauseHistory) {
    if (pause.pausedAt && pause.resumedAt) {
      totalDuration += (new Date(pause.resumedAt) - new Date(pause.pausedAt));
    } else if (pause.durationMs) {
      totalDuration += pause.durationMs;
    }
  }
  
  return totalDuration;
};

/**
 * Check if a delivery date falls within any pause period
 * @param {Date} deliveryDate - Delivery date to check
 * @param {Array} pauseHistory - Array of pause/resume objects
 * @returns {Boolean} True if date is during a pause period
 */
const isDeliveryDuringPause = (deliveryDate, pauseHistory) => {
  if (!pauseHistory || pauseHistory.length === 0) {
    return false;
  }

  const date = new Date(deliveryDate);
  
  for (const pause of pauseHistory) {
    if (pause.pausedAt && pause.resumedAt) {
      const pausedAt = new Date(pause.pausedAt);
      const resumedAt = new Date(pause.resumedAt);
      
      if (date >= pausedAt && date <= resumedAt) {
        return true;
      }
    }
  }
  
  return false;
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

/**
 * Regenerate deliveries for a subscription (useful when subscription is updated)
 * @param {Object} subscription - Subscription object
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Regeneration result
 */
const regenerateDeliverySchedules = async (subscription, options = {}) => {
  try {
    const { logProgress = true } = options;
    
    if (logProgress) {
      console.log(`🔄 Regenerating deliveries for subscription ${subscription._id}`);
    }
    
    // First remove existing deliveries
    const removalResult = await removeDeliverySchedules(subscription._id);
    
    // Then generate new ones
    const generationResult = await generateDeliverySchedules(subscription, {
      ...options,
      overrideExisting: true
    });
    
    return {
      success: true,
      removed: removalResult.deletedCount,
      generated: generationResult.count,
      subscriptionId: subscription._id
    };
  } catch (error) {
    console.error('❌ Error regenerating delivery schedules:', error);
    throw new ErrorResponse(`Failed to regenerate delivery schedules: ${error.message}`, 500);
  }
};

/**
 * Get all deliveries for a subscription with pause information
 * @param {String} subscriptionId - Subscription ID
 * @returns {Promise<Array>} Array of deliveries
 */
const getSubscriptionDeliveries = async (subscriptionId) => {
  return await Delivery.find({ subscriptionId: subscriptionId })
    .sort({ deliveryDate: 1 });
};

/**
 * Calculate expected number of deliveries for a subscription
 * @param {Object} subscription - Subscription object
 * @returns {Object} Delivery calculation result
 */
const calculateExpectedDeliveries = (subscription) => {
  const frequency = subscription.frequency;
  const period = subscription.subscriptionPeriod || 1;
  
  let deliveriesPerMonth = 0;
  
  switch (frequency) {
    case "Daily":
      deliveriesPerMonth = 30;
      break;
    case "Weekly":
      deliveriesPerMonth = 4;
      break;
    case "Bi-weekly":
      deliveriesPerMonth = 2;
      break;
    case "Monthly":
      deliveriesPerMonth = 1;
      break;
    case "One-Time":
    case "Emergency":
      return {
        totalDeliveries: 1,
        deliveriesPerMonth: 1,
        hasInitialExtra: false,
        breakdown: "1 delivery total"
      };
    default:
      deliveriesPerMonth = 1;
  }
  
  let totalDeliveries = 0;
  let breakdown = "";
  
  if (period === 1) {
    totalDeliveries = deliveriesPerMonth + 1;
    breakdown = `${deliveriesPerMonth + 1} deliveries (${deliveriesPerMonth} regular + 1 initial extra)`;
  } else {
    totalDeliveries = (deliveriesPerMonth + 1) + (deliveriesPerMonth * (period - 1));
    breakdown = `${totalDeliveries} deliveries total\n- Month 1: ${deliveriesPerMonth + 1} (${deliveriesPerMonth} regular + 1 initial)\n- Subsequent months: ${deliveriesPerMonth} per month`;
  }
  
  return {
    totalDeliveries,
    deliveriesPerMonth,
    hasInitialExtra: true,
    breakdown
  };
};

module.exports = {
  generateDeliverySchedules,
  generateBatchDeliverySchedules,
  removeDeliverySchedules,
  calculateNextDeliveryDate,
  checkExistingDelivery,
  regenerateDeliverySchedules,
  pauseDeliveries,
  resumeDeliveries,
  getSubscriptionDeliveries,
  calculateTotalPauseDuration,
  calculateExpectedDeliveries
};