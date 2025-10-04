const upload = require('../config/multerConfig');

// Single file upload middleware
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

// Multiple files upload middleware
const uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

// Specific field multiple files
const uploadFields = (fields) => {
  return (req, res, next) => {
    upload.fields(fields)(req, res, function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadFields
};