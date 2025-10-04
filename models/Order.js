const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  products: [{
    product: {
      type: mongoose.Schema.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1']
    },
    price: {
      type: Number,
      required: true
    }
  }],
  deliveryAddress: {
    type: String,
    required: true
  },
  deliveryOption: {
    type: String,
    enum: ['standard', 'express'],
    default: 'standard'
  },
  deliveryFee: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  // paymentMethod: {
  //   type: String,
  //   enum: ['wallet', 'card', 'transfer'],
  //   // required: true
  // },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['processing', 'shipped', 'in-transit', 'delivered', 'cancelled'],
    default: 'processing'
  },
  tracking: {
    status: String,
    location: String,
    progress: Number
  },
  deliveryDate: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate order ID before saving
orderSchema.pre('save', function(next) {
  if (!this.orderId) {
    this.orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);