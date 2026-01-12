// subscriptionSyncMiddleware.js
const Delivery = require('../models/Delivery');
const Subscription = require('../models/Subscription');

const autoSyncDeliveries = async (req, res, next) => {
  try {
    // This middleware runs after subscription updates
    const subscription = await Subscription.findById(req.params.id);
    
    if (subscription && ['paused', 'active'].includes(subscription.status)) {
      // Find all deliveries for this subscription
      const deliveries = await Delivery.find({
        subscriptionId: subscription._id,
        status: { $in: ['pending', 'assigned', 'accepted', 'out_for_delivery', 'paused'] }
      });

      let updatedCount = 0;
      
      for (const delivery of deliveries) {
        const shouldBePaused = subscription.status === 'paused';
        const currentlyPaused = delivery.status === 'paused';
        
        if (shouldBePaused && !currentlyPaused) {
          // Pause delivery
          delivery.status = 'paused';
          delivery.pausedAt = subscription.pausedAt;
          delivery.originalDeliveryDate = delivery.deliveryDate;
          await delivery.save();
          updatedCount++;
        } else if (!shouldBePaused && currentlyPaused) {
          // Resume delivery with date extension
          const totalPauseDuration = calculateTotalPauseDuration(subscription.pauseHistory);
          delivery.status = 'pending';
          delivery.deliveryDate = new Date(
            (delivery.originalDeliveryDate || delivery.deliveryDate).getTime() + totalPauseDuration
          );
          delivery.resumedAt = new Date();
          delivery.pausedAt = null;
          await delivery.save();
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        console.log(`🔄 Auto-synced ${updatedCount} deliveries for subscription ${subscription._id}`);
      }
    }
  } catch (error) {
    console.error('Auto-sync error:', error);
    // Don't block the request if sync fails
  }
  
  next();
};

module.exports = autoSyncDeliveries;