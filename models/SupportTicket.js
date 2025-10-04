const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  ticketId: {
    type: String,
    // required: true,
    unique: true
  },
  subject: {
    type: String,
    required: [true, 'Please provide ticket subject'],
    maxlength: [100, 'Subject cannot exceed 100 characters']
  },
  category: {
    type: String,
    enum: ['delivery', 'payment', 'product', 'account', 'other'],
    required: true
  },
  description: {
    type: String,
    required: [true, 'Please provide ticket description']
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open'
  },
  attachments: [String],
  responses: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    message: String,
    attachments: [String],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

// Generate ticket ID before saving
supportTicketSchema.pre('save', function(next) {
  if (!this.ticketId) {
    this.ticketId = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  next();
});

supportTicketSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);