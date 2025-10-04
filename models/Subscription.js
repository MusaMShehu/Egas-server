const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  planName: { 
    type: String, 
    required: true 
  },
  size: String,
  frequency: { 
    type: String, 
    required: true 
  },
  price: { 
    type: Number, 
    required: true 
  },
  reference: { 
    type: String, 
    required: true 
  },
  order: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order' 
  },
  status: { 
    type: String, 
    enum: ['active', 'cancelled', 'expired', 'pending'], 
    default: 'active' 
  },
  startDate: { 
    type: Date, 
    required: true 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  cancelledAt: Date
}, { 
  timestamps: true 
});

subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ endDate: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);