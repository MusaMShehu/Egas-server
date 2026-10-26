// const multer = require('multer');
// const { CloudinaryStorage } = require('multer-storage-cloudinary');
// const cloudinary = require('../config/cloudinary');

// // Storage configuration for different folders
// const storageOptions = (folder) => {
//     return new CloudinaryStorage({
//         cloudinary: cloudinary,
//         params: {
//             folder: `egas/${folder}`,
//             allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
//             transformation: [{ width: 800, height: 800, crop: 'limit' }],
//             quality: 'auto:good'
//         }
//     });
// };

// // Middleware for different upload types
// const profileUpload = multer({ 
//     storage: storageOptions('profiles'),
//     limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
// });

// const productUpload = multer({ 
//     storage: storageOptions('products'),
//     limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
// });

// const supportUpload = multer({ 
//     storage: storageOptions('support'),
//     limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
// });


// const supportResponseUpload = multer({
//     storage: (req, file, cb) => {
//         const ticketId = req.params._id || 'general';
//         const storage = new CloudinaryStorage({
//             cloudinary: cloudinary,
//             params: {
//                 folder: `egas/support/ticket_${ticketId}/responses`,
//                 allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx'],
//                 transformation: [{ width: 800, height: 800, crop: 'limit' }],
//                 quality: 'auto:good',
//                 resource_type: 'auto',
//                 public_id: `response_${Date.now()}_${Math.random().toString(36).substring(7)}`
//             }
//         });
//         cb(null, storage);
//     },
//     limits: { fileSize: 5 * 1024 * 1024 }
// });



// module.exports = {
//     profileUpload,
//     productUpload,
//     supportUpload,
//     supportResponseUpload
// };











const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PRODUCT_SIZE = 10 * 1024 * 1024; // 10 MB

const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

const RESPONSE_FORMATS = [
  ...IMAGE_FORMATS,
  'pdf',
  'doc',
  'docx',
];

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const RESPONSE_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Validate uploads before sending them to Cloudinary.
 */
const createFileFilter = (allowedMimeTypes) => {
  return (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(
        new Error(
          `Unsupported file type: ${file.mimetype}`
        )
      );
    }

    cb(null, true);
  };
};

/**
 * Create a valid Cloudinary storage engine.
 */
const storageOptions = (folder) => {
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `egas/${folder}`,
      allowed_formats: IMAGE_FORMATS,
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
      ],
      quality: 'auto:good',
    },
  });
};

/**
 * Profile image uploads.
 */
const profileUpload = multer({
  storage: storageOptions('profiles'),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
  },
  fileFilter: createFileFilter(IMAGE_MIME_TYPES),
});

/**
 * Product image uploads.
 */
const productUpload = multer({
  storage: storageOptions('products'),
  limits: {
    fileSize: MAX_PRODUCT_SIZE,
    files: 10,
  },
  fileFilter: createFileFilter(IMAGE_MIME_TYPES),
});

/**
 * Support ticket image uploads.
 */
const supportUpload = multer({
  storage: storageOptions('support'),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 5,
  },
  fileFilter: createFileFilter(IMAGE_MIME_TYPES),
});

/**
 * Support response attachments.
 *
 * IMPORTANT:
 * `storage` must be a storage-engine instance, not a callback.
 *
 * CloudinaryStorage supports a params function, which allows
 * the folder and upload options to depend on the incoming request.
 */
const supportResponseStorage = new CloudinaryStorage({
  cloudinary,

  params: async (req, file) => {
    const ticketId = req.params._id || req.params.id || 'general';
    const isImage = IMAGE_MIME_TYPES.has(file.mimetype);

    return {
      folder: `egas/support/ticket_${ticketId}/responses`,

      allowed_formats: RESPONSE_FORMATS,

      resource_type: 'auto',

      // Apply image transformations only to image attachments.
      ...(isImage
        ? {
            transformation: [
              {
                width: 800,
                height: 800,
                crop: 'limit',
              },
            ],
            quality: 'auto:good',
          }
        : {}),

      public_id: `response_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    };
  },
});

const supportResponseUpload = multer({
  storage: supportResponseStorage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 5,
  },
  fileFilter: createFileFilter(RESPONSE_MIME_TYPES),
});

module.exports = {
  profileUpload,
  productUpload,
  supportUpload,
  supportResponseUpload,
};
