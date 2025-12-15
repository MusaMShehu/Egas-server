const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Storage configuration for different folders
const storageOptions = (folder) => {
    return new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: `egas/${folder}`,
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            transformation: [{ width: 800, height: 800, crop: 'limit' }],
            quality: 'auto:good'
        }
    });
};

// Middleware for different upload types
const profileUpload = multer({ 
    storage: storageOptions('profiles'),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const productUpload = multer({ 
    storage: storageOptions('products'),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const supportUpload = multer({ 
    storage: storageOptions('support'),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = {
    profileUpload,
    productUpload,
    supportUpload
};