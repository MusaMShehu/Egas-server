const multer = require('multer');
const path = require('path');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// For direct Cloudinary upload (recommended)
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'egas/temp', // Temporary folder for uploads
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 400, height: 400, crop: 'limit' }],
        resource_type: 'auto'
    }
});

// For local storage first (if needed)
const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/temp/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

// Create multer instance
const upload = multer({
    storage: storage, // Use CloudinaryStorage for direct upload
    // storage: diskStorage, // Use diskStorage if you want to save locally first
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

module.exports = {
    uploadProfile: upload.single('profileImage'), // Use single for profile picture
    uploadProduct: upload.array('images', 5), // For multiple product images
    uploadSupport: upload.array('attachments', 3) // For support attachments
};