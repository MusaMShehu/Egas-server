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


const supportResponseUpload = multer({
    storage: (req, file, cb) => {
        const ticketId = req.params._id || 'general';
        const storage = new CloudinaryStorage({
            cloudinary: cloudinary,
            params: {
                folder: `egas/support/ticket_${ticketId}/responses`,
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx'],
                transformation: [{ width: 800, height: 800, crop: 'limit' }],
                quality: 'auto:good',
                resource_type: 'auto',
                public_id: `response_${Date.now()}_${Math.random().toString(36).substring(7)}`
            }
        });
        cb(null, storage);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});



module.exports = {
    profileUpload,
    productUpload,
    supportUpload,
    supportResponseUpload
};