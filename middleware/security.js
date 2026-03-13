const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const helmet = require('helmet');
const cors = require('cors');
const { redisClient } = require('../config/redis');

// ==================== CORS Configuration ====================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'https://egas-ng.onrender.com',
  'https://www.egas.com.ng'
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'), false);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-api-key', "x-request-id"]
};

// ==================== Rate Limiting Factory ====================

const createRateLimiter = (windowMs, max, message, keyPrefix = 'rl') => {
  // Get the ipKeyGenerator helper from rateLimit
  const { ipKeyGenerator } = rateLimit;
  
  const baseOptions = {
    windowMs,
    max,
    message: {
      success: false,
      message: message || 'Too many requests, please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,  // Disable the `X-RateLimit-*` headers
    // Use the helper function to properly handle IPv6
    keyGenerator: (req) => {
      // Use user ID if authenticated
      if (req.user && req.user._id) {
        return `user:${req.user._id}`;
      }
      // Otherwise use the proper IP key generator
      return ipKeyGenerator(req);
    },
    // Handler when rate limit is exceeded
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: message || 'Too many requests, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    // Skip failed requests (optional)
    skipFailedRequests: false,
    // Skip successful requests (optional)
    skipSuccessfulRequests: false
  };

  // Try to use Redis store if Redis is connected
  if (redisClient && redisClient.isConnected && redisClient.getRawClient()) {
    try {
      const rawClient = redisClient.getRawClient();
      
      // For rate-limit-redis v4+, we need to use sendCommand
      baseOptions.store = new RedisStore({
        // Use sendCommand for ioredis
        sendCommand: (...args) => rawClient.call(...args),
        prefix: keyPrefix,
        // Reset expiry on each request (good for sliding window)
        resetExpiryOnChange: true,
      });
      
      console.log(`✅ Redis rate limiter configured: ${keyPrefix} (${max} requests/${windowMs}ms)`);
    } catch (error) {
      console.error(`❌ Failed to create Redis store for ${keyPrefix}:`, error.message);
      console.log(`⚠️ Using memory store fallback for: ${keyPrefix}`);
      // Don't set store - it will use the default memory store
    }
  } else {
    console.log(`⚠️ Using memory store for rate limiter: ${keyPrefix} (Redis not connected)`);
    // Don't set store - it will use the default memory store
  }

  return rateLimit(baseOptions);
};

// ==================== Specific Rate Limiters ====================
// Authentication rate limiter (strict)
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5,              // 5 attempts
  'Too many authentication attempts. Please try again after 15 minutes.',
  'rl:auth'
);

// General API rate limiter
const apiLimiter = createRateLimiter(
  60 * 1000,      // 1 minute
  100,            // 100 requests
  'Too many requests. Please slow down.',
  'rl:api'
);

// SMS rate limiter (prevent SMS abuse)
const smsLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  5,              // 5 SMS
  'SMS limit exceeded. Please try again later.',
  'rl:sms'
);

// Wallet operations rate limiter
const walletLimiter = createRateLimiter(
  60 * 1000,      // 1 minute
  10,             // 10 operations
  'Wallet operation limit exceeded. Please try again later.',
  'rl:wallet'
);

// Admin operations rate limiter (stricter)
const adminLimiter = createRateLimiter(
  60 * 1000,      // 1 minute
  30,             // 30 requests
  'Admin operation limit exceeded.',
  'rl:admin'
);

// ==================== Helmet Security Configuration ====================
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'", 
        "https://js.paystack.co",
        "https://checkout.paystack.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "https://res.cloudinary.com"],
      connectSrc: [
        "'self'", 
        process.env.BASE_URL, 
        process.env.FRONTEND_URL,
        "https://api.paystack.co",
        "https://api.sendchamp.com"
      ].filter(Boolean),
      frameSrc: ["'self'", "https://checkout.paystack.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  hidePoweredBy: true,
  noSniff: true,
  ieNoOpen: true,
  xssFilter: true,
});

// ==================== Input Sanitization ====================
/**
 * Custom input sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove HTML tags and trim
        req.body[key] = req.body[key].replace(/<[^>]*>/g, '').trim();
      }
    });
  }
  next();
};

// ==================== API Key Authentication ====================
/**
 * API key authentication for admin routes
 */
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key is required'
    });
  }
  
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      message: 'Invalid API key'
    });
  }
  
  next();
};

// ==================== Request Size Limiter ====================
/**
 * Limit request body size
 */
const requestSizeLimiter = (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (contentLength > maxSize) {
    return res.status(413).json({
      success: false,
      message: 'Request entity too large'
    });
  }
  
  next();
};

// ==================== Security Headers ====================
/**
 * Additional security headers
 */
const securityHeaders = (req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

// ==================== Export Middlewares ====================
module.exports = {
  // CORS
  cors: cors(corsOptions),
  corsOptions,
  
  // Rate Limiters
  authLimiter,
  apiLimiter,
  smsLimiter,
  walletLimiter,
  adminLimiter,
  
  // Security
  helmet: helmetConfig,
  securityHeaders,
  
  // Sanitization

 
  // mongoSanitize: mongoSanitize({
  //   replaceWith: '_',
  //   onSanitize: ({ req, key }) => {
  //     console.warn(`⚠️ Potential NoSQL injection detected at ${req.path}`);
  //   },
  //   reqQuery: false
  // }),
  xss: xss(),
  hpp: hpp({
    whitelist: [
      'price',
      'rating',
      'createdAt',
      'limit',
      'page',
      'sort',
      'fields',
      'category',
      'status'
    ],
  }),
  sanitizeInput,
  
  // Authentication
  apiKeyAuth,
  
  // Utility
  requestSizeLimiter,
  
  // Export the factory function for custom rate limiters
  createRateLimiter,
};