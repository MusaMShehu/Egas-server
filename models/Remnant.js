// models/Remnant.js (Refactored)
const mongoose = require('mongoose');

const remnantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userName: {
    type: String,
    trim: true
  },
  userPhone: {
    type: String,
    trim: true
  },
  accumulatedKg: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: function(v) {
        return v >= 0;
      },
      message: 'Accumulated kg cannot be negative'
    }
  },
  status: {
    type: String,
    enum: ['no_record', 'pending_confirmation', 'active', 'completed', 'cancelled'],
    default: 'no_record',
    index: true
  },
  partialDeliveries: [{
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true
    },
    originalKg: {
      type: Number,
      required: true,
      min: 0
    },
    delivered: {
      type: Number,
      required: true,
      min: 0
    },
    remaining: {
      type: Number,
      required: true,
      min: 0
    },
    date: {
      type: Date,
      default: Date.now
    },
    confirmed: {
      type: Boolean,
      default: false
    },
    confirmedAt: Date,
    agentNotes: String
  }],
  deliveryRequests: [{
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery'
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription'
    },
    requestedKg: {
      type: Number,
      required: true,
      min: 0
    },
    date: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'assigned', 'delivered', 'confirmed', 'cancelled', 'failed'],
      default: 'pending'
    },
    deliveredAt: Date,
    confirmedAt: Date,
    customerConfirmed: {
      type: Boolean,
      default: false
    }
  }],
  deliveredFromRemnant: {
    type: Number,
    default: 0,
    min: 0
  },
  customerConfirmation: {
    confirmed: {
      type: Boolean,
      default: false
    },
    confirmedAt: Date,
    customerNotes: String,
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
remnantSchema.index({ userId: 1, status: 1 });
remnantSchema.index({ accumulatedKg: 1 });
remnantSchema.index({ 'partialDeliveries.confirmed': 1 });
remnantSchema.index({ 'deliveryRequests.status': 1 });

// Virtual for total pending confirmation
remnantSchema.virtual('pendingConfirmationTotal').get(function() {
  return this.partialDeliveries
    .filter(pd => !pd.confirmed)
    .reduce((sum, pd) => sum + pd.remaining, 0);
});

// Virtual for total confirmed
remnantSchema.virtual('confirmedTotal').get(function() {
  return this.partialDeliveries
    .filter(pd => pd.confirmed)
    .reduce((sum, pd) => sum + pd.remaining, 0);
});

// Virtual for pending delivery requests
remnantSchema.virtual('pendingRequests').get(function() {
  return this.deliveryRequests.filter(r => 
    ['pending', 'assigned'].includes(r.status)
  );
});

// Method to check if can request delivery
remnantSchema.methods.canRequestDelivery = function() {
  return (
    this.status === 'active' &&
    this.customerConfirmation?.confirmed &&
    this.accumulatedKg >= 6 &&
    this.partialDeliveries.every(pd => pd.confirmed)
  );
};

// Method to get delivery eligibility
remnantSchema.methods.getDeliveryEligibility = function() {
  const unconfirmedPartial = this.partialDeliveries.filter(pd => !pd.confirmed);
  
  return {
    canRequest: this.canRequestDelivery(),
    accumulatedKg: this.accumulatedKg,
    unconfirmedCount: unconfirmedPartial.length,
    unconfirmedKg: unconfirmedPartial.reduce((sum, pd) => sum + pd.remaining, 0),
    needsConfirmation: unconfirmedPartial.length > 0 || !this.customerConfirmation?.confirmed,
    minimumRequired: 6,
    shortage: this.accumulatedKg < 6 ? 6 - this.accumulatedKg : 0
  };
};

// Pre-save middleware
remnantSchema.pre('save', function(next) {
  // Update status based on conditions
  if (this.partialDeliveries.some(pd => !pd.confirmed)) {
    this.status = 'pending_confirmation';
  } else if (this.accumulatedKg === 0 && this.status !== 'no_record') {
    this.status = 'completed';
  } else if (this.status === 'pending_confirmation' && 
             this.partialDeliveries.every(pd => pd.confirmed) &&
             this.customerConfirmation?.confirmed) {
    this.status = 'active';
  }
  
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('Remnant', remnantSchema);


// const mongoose = require('mongoose');

// const remnantSchema = new mongoose.Schema({
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//     unique: true, // Only one active remnant per user
//     index: true
//   },
//   userName: {
//     type: String,
//     trim: true
//   },
//   userPhone: {
//     type: String,
//   },
//   accumulatedKg: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   status: {
//     type: String,
//     enum: ['active', 'pending_confirmation', 'completed', 'cancelled'],
//     default: 'active',
//   },
//   partialDeliveries: [{
//     deliveryId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Delivery',
//       required: true
//     },
//     originalKg: Number,
//     delivered: Number,
//     remaining: Number,
//     date: Date,
//     confirmed: {
//       type: Boolean,
//       default: false
//     }
//   }],
//   deliveryRequests: [{
//     deliveryId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Delivery'
//     },
//     requestedKg: Number,
//     date: Date,
//     status: {
//       type: String,
//       enum: ['pending', 'delivered', 'cancelled'],
//       default: 'pending'
//     }
//   }],
//   deliveredFromRemnant: {
//     type: Number,
//     default: 0
//   },
//   customerConfirmation: {
//     confirmed: {
//       type: Boolean,
//       default: false
//     },
//     confirmedAt: Date,
//     customerNotes: String,
//     confirmedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User'
//     }
//   },
//   lastUpdated: {
//     type: Date,
//     default: Date.now
//   }
// }, {
//   timestamps: true
// });

// // Virtual for total eligible kg (confirmed + pending)
// remnantSchema.virtual('totalEligibleKg').get(function() {
//   return this.accumulatedKg;
// });

// // Virtual for pending confirmation kg
// remnantSchema.virtual('pendingConfirmationTotal').get(function() {
//   return this.partialDeliveries
//     .filter(pd => !pd.customerConfirmed)
//     .reduce((sum, pd) => sum + pd.remainingKg, 0);
// });

// // Middleware to update calculated fields before save
// remnantSchema.pre('save', function(next) {
//   // Update pending confirmation kg
//   this.pendingConfirmationKg = this.partialDeliveries
//     .filter(pd => !pd.customerConfirmed)
//     .reduce((sum, pd) => sum + pd.remainingKg, 0);
  
//   // Update confirmed kg
//   this.confirmedKg = this.partialDeliveries
//     .filter(pd => pd.customerConfirmed)
//     .reduce((sum, pd) => sum + pd.remainingKg, 0);
  
//   // Update status based on conditions
//   if (this.pendingConfirmationKg > 0 && !this.customerConfirmation.confirmed) {
//     this.status = 'pending_confirmation';
//   } else if (this.accumulatedKg >= this.minimumDeliveryKg) {
//     this.status = 'active';
//   } else if (this.accumulatedKg === 0) {
//     this.status = 'completed';
//   }
  
//   // Update user info from User model (if needed)
//   // This would typically be populated via controller
  
//   next();
// });

// // Static method to find or create remnant for user
// remnantSchema.statics.findOrCreateForUser = async function(userId, userInfo = {}) {
//   let remnant = await this.findOne({ userId });
  
//   if (!remnant) {
//     remnant = await this.create({
//       userId,
//       userName: userInfo.userName || `${userInfo.firstName} ${userInfo.lastName}`,
//       userPhone: userInfo.phone,
//       status: 'pending_confirmation'
//     });
//   }
  
//   return remnant;
// };

// // Method to add partial delivery
// remnantSchema.methods.addPartialDelivery = async function(deliveryId, data) {
//   this.partialDeliveries.push({
//     deliveryId,
//     originalOrderKg: data.originalKg,
//     deliveredKg: data.delivered,
//     remainingKg: data.remaining,
//     agentNotes: data.notes,
//     customerConfirmed: false
//   });
  
//   // Update accumulated kg
//   this.accumulatedKg += data.remaining;
  
//   // Add notification
//   this.notifications.push({
//     type: 'partial_delivery_added',
//     message: `${data.delivered}kg delivered, ${data.remaining}kg added to remnant`,
//     deliveryId,
//     read: false
//   });
  
//   return this.save();
// };

// // Method to confirm partial deliveries
// remnantSchema.methods.confirmPartialDeliveries = async function(notes = '') {
//   // Mark all pending partial deliveries as confirmed
//   this.partialDeliveries.forEach(pd => {
//     if (!pd.customerConfirmed) {
//       pd.customerConfirmed = true;
//       pd.confirmedAt = new Date();
//     }
//   });
  
//   // Update customer confirmation
//   this.customerConfirmation = {
//     confirmed: true,
//     confirmedAt: new Date(),
//     customerNotes: notes,
//     confirmedBy: this.userId
//   };
  
//   // Add notification
//   this.notifications.push({
//     type: 'confirmation_required',
//     message: 'Remnant entries confirmed',
//     read: false
//   });
  
//   return this.save();
// };

// // Method to request delivery from remnant
// remnantSchema.methods.requestDelivery = async function(deliveryId, requestedKg) {
//   if (requestedKg > this.accumulatedKg) {
//     throw new Error(`Cannot request ${requestedKg}kg, only ${this.accumulatedKg}kg available`);
//   }
  
//   if (requestedKg < this.minimumDeliveryKg) {
//     throw new Error(`Minimum ${this.minimumDeliveryKg}kg required for delivery`);
//   }
  
//   this.remnantDeliveries.push({
//     deliveryId,
//     requestedKg,
//     deliveryStatus: 'pending'
//   });
  
//   this.accumulatedKg -= requestedKg;
//   this.totalDeliveredFromRemnant += requestedKg;
  
//   // Add notification
//   this.notifications.push({
//     type: 'delivery_requested',
//     message: `Requested ${requestedKg}kg delivery from remnant`,
//     deliveryId,
//     read: false
//   });
  
//   return this.save();
// };

// // Indexes for faster queries
// remnantSchema.index({ userId: 1, status: 1 });
// remnantSchema.index({ accumulatedKg: 1 });
// remnantSchema.index({ lastUpdated: -1 });
// remnantSchema.index({ 'partialDeliveries.deliveryId': 1 });
// remnantSchema.index({ 'remnantDeliveries.deliveryId': 1 });
// remnantSchema.index({ 'customerConfirmation.confirmed': 1 });

// module.exports = mongoose.model('Remnant', remnantSchema);