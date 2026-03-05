// middleware/security.js
const crypto = require('crypto');
const ErrorResponse = require('../utils/errorResponse');

// Input sanitization
exports.sanitizeInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove any HTML tags and trim
        req.body[key] = req.body[key].replace(/<[^>]*>/g, '').trim();
      }
    });
  }
  next();
};

// Validate ObjectId
exports.validateObjectId = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (id && !id.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new ErrorResponse(`Invalid ${paramName} format`, 400));
  }
  next();
};

// Rate limiting for sensitive operations
const rateLimit = new Map();
exports.rateLimiter = (maxRequests = 5, windowMs = 60000) => (req, res, next) => {
  const key = `${req.user.id}-${req.path}`;
  const now = Date.now();
  const userRequests = rateLimit.get(key) || [];
  
  // Clean old requests
  const recentRequests = userRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return next(new ErrorResponse('Too many requests, please try again later', 429));
  }
  
  recentRequests.push(now);
  rateLimit.set(key, recentRequests);
  next();
};

// Audit logging
exports.auditLog = (action) => async (req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    // Log after response is sent
    setTimeout(async () => {
      try {
        await AuditLog.create({
          user: req.user.id,
          action,
          details: {
            method: req.method,
            path: req.path,
            body: req.body,
            query: req.query,
            params: req.params,
            responseStatus: res.statusCode
          },
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (error) {
        console.error('Audit log error:', error);
      }
    }, 0);
    
    originalJson.call(this, data);
  };
  next();
};