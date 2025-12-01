// services/subscriptionExpirationService.js
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');

class SubscriptionExpirationService {
  
  static async checkAndExpireSubscriptions() {
    const now = new Date();
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    console.log(`🕐 Running subscription expiration check at ${now.toISOString()}`);
    
    try {
      const subscriptionsToExpire = await Subscription.find({
        status: { $in: ['active', 'paused'] },
        endDate: { $lt: oneDayAgo },
        $or: [
          { lastExpirationCheck: { $exists: false } },
          { lastExpirationCheck: { $lt: oneDayAgo } }
        ]
      });

      let expiredCount = 0;
      let errorCount = 0;

      for (const subscription of subscriptionsToExpire) {
        try {
          await subscription.expireSubscription();
          expiredCount++;
          
          console.log(`✅ Successfully marked subscription as expired: ${subscription._id}`);
        } catch (error) {
          console.error(`❌ Failed to expire subscription ${subscription._id}:`, error);
          errorCount++;
        }
      }

      const result = {
        totalProcessed: subscriptionsToExpire.length,
        expiredCount,
        errorCount,
        timestamp: now
      };

      console.log(`📊 Expiration check completed (deliveries preserved):`, result);
      return result;

    } catch (error) {
      console.error('❌ Fatal error in subscription expiration service:', error);
      throw error;
    }
  }

  /**
   * Force expire a specific subscription (admin function)
   */
  static async forceExpireSubscription(subscriptionId) {
    try {
      const subscription = await Subscription.findById(subscriptionId);
      
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      if (subscription.status === 'expired') {
        return { message: 'Subscription already expired', subscription };
      }

      await subscription.expireSubscription();
      
      return { 
        message: 'Subscription marked as expired successfully (deliveries preserved)', 
        subscription: await Subscription.findById(subscriptionId) 
      };
    } catch (error) {
      console.error(`❌ Error marking subscription ${subscriptionId} as expired:`, error);
      throw error;
    }
  }

  /**
   * Get expiration statistics
   */
  static async getExpirationStats() {
    const now = new Date();
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await Subscription.aggregate([
      {
        $facet: {
          totalSubscriptions: [
            { $count: "count" }
          ],
          expiredSubscriptions: [
            { $match: { status: "expired" } },
            { $count: "count" }
          ],
          dueForExpiration: [
            { 
              $match: { 
                status: { $in: ["active", "paused"] },
                endDate: { $lt: oneDayAgo }
              } 
            },
            { $count: "count" }
          ],
          recentlyExpired: [
            { 
              $match: { 
                status: "expired",
                expiredAt: { $gte: thirtyDaysAgo }
              } 
            },
            { $count: "count" }
          ],
          // Delivery statistics for expired subscriptions
          expiredWithDeliveries: [
            { 
              $match: { 
                status: "expired"
              } 
            },
            {
              $project: {
                hasDeliveries: { $gt: [{ $size: { $ifNull: ["$deliveries", []] } }, 0] }
              }
            },
            {
              $group: {
                _id: "$hasDeliveries",
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    const expiredWithDeliveries = stats[0]?.expiredWithDeliveries?.find(d => d._id === true)?.count || 0;
    const expiredWithoutDeliveries = stats[0]?.expiredWithDeliveries?.find(d => d._id === false)?.count || 0;

    return {
      total: stats[0]?.totalSubscriptions[0]?.count || 0,
      expired: stats[0]?.expiredSubscriptions[0]?.count || 0,
      dueForExpiration: stats[0]?.dueForExpiration[0]?.count || 0,
      recentlyExpired: stats[0]?.recentlyExpired[0]?.count || 0,
      expiredWithDeliveries,
      expiredWithoutDeliveries
    };
  }
}

module.exports = SubscriptionExpirationService;