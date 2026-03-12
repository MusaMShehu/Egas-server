const Joi = require('joi');

// Password validation regex
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// Validation schemas
const schemas = {
  // Auth schemas
  register: Joi.object({
    firstName: Joi.string().min(2).max(50).required().trim(),
    lastName: Joi.string().min(2).max(50).required().trim(),
    email: Joi.string().email().required().lowercase().trim(),
    phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).required(),
    password: Joi.string()
      .min(8)
      .pattern(passwordRegex)
      .message('Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character')
      .required(),
    confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match'
    }),
    address: Joi.string().max(200).required().trim(),
    city: Joi.string().max(50).required().trim(),
    state: Joi.string().max(50).required().trim(),
    dob: Joi.date().max('now').optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    gps: Joi.string().optional(),
  }),

  login: Joi.object({
    email: Joi.string().email().required().lowercase().trim(),
    password: Joi.string().required(),
  }),

  updatePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(passwordRegex)
      .message('Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character')
      .required(),
    confirmPassword: Joi.any().valid(Joi.ref('newPassword')).required(),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required().lowercase().trim(),
  }),

  resetPassword: Joi.object({
    password: Joi.string()
      .min(8)
      .pattern(passwordRegex)
      .message('Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character')
      .required(),
    confirmPassword: Joi.any().valid(Joi.ref('password')).required(),
  }),

  // User profile schemas
  updateProfile: Joi.object({
    firstName: Joi.string().min(2).max(50).optional().trim(),
    lastName: Joi.string().min(2).max(50).optional().trim(),
    phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).optional(),
    address: Joi.string().max(200).optional().trim(),
    city: Joi.string().max(50).optional().trim(),
    state: Joi.string().max(50).optional().trim(),
    dob: Joi.date().max('now').optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    gpsCoordinates: Joi.object({
      type: Joi.string().valid('Point').default('Point'),
      coordinates: Joi.array().items(Joi.number()).length(2).required()
    }).optional(),
  }),

  updatePreferences: Joi.object({
    orderUpdates: Joi.boolean(),
    deliveryNotifications: Joi.boolean(),
    promotionalOffers: Joi.boolean(),
    newsletter: Joi.boolean(),
  }),

  // Order schemas
  createOrder: Joi.object({
    products: Joi.array().items(
      Joi.object({
        product: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
      })
    ).min(1).required(),
    deliveryOption: Joi.string().valid('standard', 'express').default('standard'),
    address: Joi.string().required().trim(),
    city: Joi.string().required().trim(),
    paymentMethod: Joi.string().valid('wallet', 'paystack').required(),
  }),

  updateOrder: Joi.object({
    deliveryOption: Joi.string().valid('standard', 'express'),
    deliveryAddress: Joi.string().trim(),
    orderStatus: Joi.string().valid('processing', 'in-transit', 'delivered', 'cancelled'),
  }).min(1),

  // Subscription schemas
  createSubscription: Joi.object({
    plan: Joi.string().required(),
    size: Joi.alternatives().try(
      Joi.string(),
      Joi.number()
    ).required(),
    frequency: Joi.string().valid('Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'One-Time', 'Emergency').required(),
    subscriptionPeriod: Joi.number().integer().min(1).max(12).default(1),
    customPlan: Joi.object({
      size: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
      frequency: Joi.string().valid('Daily', 'Weekly', 'Bi-weekly', 'Monthly').required(),
      subscriptionPeriod: Joi.number().integer().min(1).max(12).required(),
    }).optional(),
    paymentMethod: Joi.string().valid('wallet', 'paystack').required(),
  }),

  updateSubscription: Joi.object({
    status: Joi.string().valid('active', 'paused', 'cancelled'),
    frequency: Joi.string().valid('Daily', 'Weekly', 'Bi-weekly', 'Monthly'),
    size: Joi.alternatives().try(Joi.string(), Joi.number()),
  }).min(1),

  // Payment schemas
  initiateTopup: Joi.object({
    amount: Joi.number().positive().required(),
  }),

  // Support ticket schemas
  createTicket: Joi.object({
    subject: Joi.string().max(100).required().trim(),
    description: Joi.string().required().trim(),
    category: Joi.string().valid('delivery', 'payment', 'product', 'account', 'other').required(),
  }),

  addResponse: Joi.object({
    message: Joi.string().required().trim(),
  }),

  updateTicketStatus: Joi.object({
    status: Joi.string().valid('open', 'in-progress', 'resolved', 'closed').required(),
  }),

  // Product schemas (admin)
  createProduct: Joi.object({
    name: Joi.string().max(100).required().trim(),
    description: Joi.string().required().trim(),
    price: Joi.number().positive().required(),
    category: Joi.string().valid('gas', 'accessory').required(),
    stock: Joi.number().integer().min(0).required(),
    images: Joi.array().items(Joi.string()).optional(),
  }),

  updateProduct: Joi.object({
    name: Joi.string().max(100).trim(),
    description: Joi.string().trim(),
    price: Joi.number().positive(),
    category: Joi.string().valid('gas', 'accessory'),
    stock: Joi.number().integer().min(0),
    isActive: Joi.boolean(),
  }).min(1),
};

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      presence: 'required',
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }

    next();
  };
};

// Validate query parameters
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: error.details.map(d => d.message),
      });
    }

    next();
  };
};

// Validate MongoDB ObjectId
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    
    if (id && !objectIdPattern.test(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`,
      });
    }
    
    next();
  };
};

module.exports = {
  validate,
  validateQuery,
  validateObjectId,
  schemas,
};