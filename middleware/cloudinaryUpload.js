const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary storage for product images
const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'egas/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ width: 800, height: 600, crop: 'fill' }],
    public_id: (req, file) => {
      const productId = req.params.id || 'product';
      const timestamp = Date.now();
      const sanitizedProductId = productId.toString().replace(/[^a-zA-Z0-9]/g, '_');
      return `product_${sanitizedProductId}_${timestamp}`;
    }
  }
});

// Upload middleware for product photos
const upload = multer({
  storage: productStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Please upload only image files'), false);
    }
  }
});

module.exports = upload;