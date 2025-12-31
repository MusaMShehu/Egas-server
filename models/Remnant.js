const mongoose = require('mongoose');

const remnantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // Only one active remnant per user
  },
  userName: {
    type: String,
  },
  userPhone: {
    type: String,
  },
  accumulatedKg: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'pending_confirmation', 'completed', 'cancelled'],
    default: 'pending_confirmation',
  },
  partialDeliveries: [{
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true
    },
    originalKg: Number,
    delivered: Number,
    remaining: Number,
    date: Date,
    confirmed: {
      type: Boolean,
      default: false
    }
  }],
  deliveryRequests: [{
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery'
    },
    requestedKg: Number,
    date: Date,
    status: {
      type: String,
      enum: ['pending', 'delivered', 'cancelled'],
      default: 'pending'
    }
  }],
  deliveredFromRemnant: {
    type: Number,
    default: 0
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
  }
}, {
  timestamps: true
});

// Virtual for total eligible kg (confirmed + pending)
remnantSchema.virtual('totalEligibleKg').get(function() {
  return this.accumulatedKg;
});

// Virtual for pending confirmation kg
remnantSchema.virtual('pendingConfirmationTotal').get(function() {
  return this.partialDeliveries
    .filter(pd => !pd.customerConfirmed)
    .reduce((sum, pd) => sum + pd.remainingKg, 0);
});

// Middleware to update calculated fields before save
remnantSchema.pre('save', function(next) {
  // Update pending confirmation kg
  this.pendingConfirmationKg = this.partialDeliveries
    .filter(pd => !pd.customerConfirmed)
    .reduce((sum, pd) => sum + pd.remainingKg, 0);
  
  // Update confirmed kg
  this.confirmedKg = this.partialDeliveries
    .filter(pd => pd.customerConfirmed)
    .reduce((sum, pd) => sum + pd.remainingKg, 0);
  
  // Update status based on conditions
  if (this.pendingConfirmationKg > 0 && !this.customerConfirmation.confirmed) {
    this.status = 'pending_confirmation';
  } else if (this.accumulatedKg >= this.minimumDeliveryKg) {
    this.status = 'active';
  } else if (this.accumulatedKg === 0) {
    this.status = 'completed';
  }
  
  // Update user info from User model (if needed)
  // This would typically be populated via controller
  
  next();
});

// Static method to find or create remnant for user
remnantSchema.statics.findOrCreateForUser = async function(userId, userInfo = {}) {
  let remnant = await this.findOne({ userId });
  
  if (!remnant) {
    remnant = await this.create({
      userId,
      userName: userInfo.userName || `${userInfo.firstName} ${userInfo.lastName}`,
      userPhone: userInfo.phone,
      status: 'pending_confirmation'
    });
  }
  
  return remnant;
};

// Method to add partial delivery
remnantSchema.methods.addPartialDelivery = async function(deliveryId, data) {
  this.partialDeliveries.push({
    deliveryId,
    originalOrderKg: data.originalKg,
    deliveredKg: data.delivered,
    remainingKg: data.remaining,
    agentNotes: data.notes,
    customerConfirmed: false
  });
  
  // Update accumulated kg
  this.accumulatedKg += data.remaining;
  
  // Add notification
  this.notifications.push({
    type: 'partial_delivery_added',
    message: `${data.delivered}kg delivered, ${data.remaining}kg added to remnant`,
    deliveryId,
    read: false
  });
  
  return this.save();
};

// Method to confirm partial deliveries
remnantSchema.methods.confirmPartialDeliveries = async function(notes = '') {
  // Mark all pending partial deliveries as confirmed
  this.partialDeliveries.forEach(pd => {
    if (!pd.customerConfirmed) {
      pd.customerConfirmed = true;
      pd.confirmedAt = new Date();
    }
  });
  
  // Update customer confirmation
  this.customerConfirmation = {
    confirmed: true,
    confirmedAt: new Date(),
    customerNotes: notes,
    confirmedBy: this.userId
  };
  
  // Add notification
  this.notifications.push({
    type: 'confirmation_required',
    message: 'Remnant entries confirmed',
    read: false
  });
  
  return this.save();
};

// Method to request delivery from remnant
remnantSchema.methods.requestDelivery = async function(deliveryId, requestedKg) {
  if (requestedKg > this.accumulatedKg) {
    throw new Error(`Cannot request ${requestedKg}kg, only ${this.accumulatedKg}kg available`);
  }
  
  if (requestedKg < this.minimumDeliveryKg) {
    throw new Error(`Minimum ${this.minimumDeliveryKg}kg required for delivery`);
  }
  
  this.remnantDeliveries.push({
    deliveryId,
    requestedKg,
    deliveryStatus: 'pending'
  });
  
  this.accumulatedKg -= requestedKg;
  this.totalDeliveredFromRemnant += requestedKg;
  
  // Add notification
  this.notifications.push({
    type: 'delivery_requested',
    message: `Requested ${requestedKg}kg delivery from remnant`,
    deliveryId,
    read: false
  });
  
  return this.save();
};

// Indexes for faster queries
remnantSchema.index({ userId: 1, status: 1 });
remnantSchema.index({ accumulatedKg: 1 });
remnantSchema.index({ lastUpdated: -1 });
remnantSchema.index({ 'partialDeliveries.deliveryId': 1 });
remnantSchema.index({ 'remnantDeliveries.deliveryId': 1 });
remnantSchema.index({ 'customerConfirmation.confirmed': 1 });

module.exports = mongoose.model('Remnant', remnantSchema);