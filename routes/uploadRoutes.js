const express = require('express');
const router = express.Router();
const { uploadSingle, uploadMultiple, uploadFields } = require('../middleware/uploadMiddleware');

// Single file upload
router.post('/upload-profile', uploadSingle('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Multiple files upload
router.post('/upload-products', uploadMultiple('images', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const files = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      path: file.path,
      mimetype: file.mimetype
    }));

    res.json({
      success: true,
      message: 'Files uploaded successfully',
      files: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Multiple fields upload
router.post('/upload-multiple-fields', 
  uploadFields([
    { name: 'avatar', maxCount: 1 },
    { name: 'gallery', maxCount: 4 }
  ]), 
  (req, res) => {
    try {
      res.json({
        success: true,
        message: 'Files uploaded successfully',
        avatar: req.files.avatar ? req.files.avatar[0] : null,
        gallery: req.files.gallery || []
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

module.exports = router;