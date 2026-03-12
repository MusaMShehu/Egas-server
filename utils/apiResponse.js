// utils/apiResponse.js

/**
 * Standard API response formatter
 */
class ApiResponse {
  /**
   * Success response
   */
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Error response
   */
  static error(res, message = 'Error', statusCode = 500, errors = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };
    
    if (errors) {
      response.errors = errors;
    }
    
    return res.status(statusCode).json(response);
  }

  /**
   * Created response (201)
   */
  static created(res, data = null, message = 'Resource created successfully') {
    return this.success(res, data, message, 201);
  }

  /**
   * Bad request response (400)
   */
  static badRequest(res, message = 'Bad request', errors = null) {
    return this.error(res, message, 400, errors);
  }

  /**
   * Unauthorized response (401)
   */
  static unauthorized(res, message = 'Unauthorized') {
    return this.error(res, message, 401);
  }

  /**
   * Forbidden response (403)
   */
  static forbidden(res, message = 'Forbidden') {
    return this.error(res, message, 403);
  }

  /**
   * Not found response (404)
   */
  static notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  /**
   * Validation error response (422)
   */
  static validationError(res, errors = null, message = 'Validation failed') {
    return this.error(res, message, 422, errors);
  }

  /**
   * Too many requests response (429)
   */
  static tooManyRequests(res, message = 'Too many requests', retryAfter = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };
    
    if (retryAfter) {
      response.retryAfter = retryAfter;
    }
    
    return res.status(429).json(response);
  }
}

/**
 * Response middleware to attach response methods to res object
 */
const responseMiddleware = (req, res, next) => {
  // Attach ApiResponse methods to res object for convenience
  res.success = (data, message, statusCode) => {
    return ApiResponse.success(res, data, message, statusCode);
  };
  
  res.error = (message, statusCode, errors) => {
    return ApiResponse.error(res, message, statusCode, errors);
  };
  
  res.created = (data, message) => {
    return ApiResponse.created(res, data, message);
  };
  
  res.badRequest = (message, errors) => {
    return ApiResponse.badRequest(res, message, errors);
  };
  
  res.unauthorized = (message) => {
    return ApiResponse.unauthorized(res, message);
  };
  
  res.forbidden = (message) => {
    return ApiResponse.forbidden(res, message);
  };
  
  res.notFound = (message) => {
    return ApiResponse.notFound(res, message);
  };
  
  res.validationError = (errors, message) => {
    return ApiResponse.validationError(res, errors, message);
  };
  
  res.tooManyRequests = (message, retryAfter) => {
    return ApiResponse.tooManyRequests(res, message, retryAfter);
  };
  
  next();
};

module.exports = {
  ApiResponse,
  responseMiddleware
};