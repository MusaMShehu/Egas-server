const { cloudinary, uploadPresets } = require('../config/cloudinary');
const multer = require('multer');
const { storage, uploadConfig } = require('../config/cloudinary');

const upload = multer(uploadConfig);

class UploadService {
  constructor() {
    this.uploadMiddleware = upload;
  }

  // Single image upload
  async uploadSingleImage(file, preset = 'default') {
    try {
      const presetConfig = uploadPresets[preset] || {};
      
      const result = await cloudinary.uploader.upload(file.path, {
        folder: presetConfig.folder || 'egas_uploads',
        transformation: presetConfig.transformation,
        allowed_formats: presetConfig.allowed_formats,
        public_id: `img_${Date.now()}`
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        created_at: result.created_at
      };
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  // Multiple images upload
  async uploadMultipleImages(files, preset = 'default') {
    const uploadPromises = files.map(file => 
      this.uploadSingleImage(file, preset)
    );
    return Promise.all(uploadPromises);
  }

  // Delete image
  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        return { success: true, message: 'Image deleted successfully' };
      } else {
        return { success: false, message: 'Failed to delete image' };
      }
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  // Optimize image URL
  getOptimizedImageUrl(publicId, options = {}) {
    const defaultOptions = {
      width: options.width || 800,
      height: options.height || 600,
      crop: options.crop || 'fill',
      quality: 'auto',
      fetch_format: 'auto'
    };

    return cloudinary.url(publicId, defaultOptions);
  }

  // Get responsive image srcset
  getResponsiveSrcset(publicId, sizes = [300, 600, 900, 1200]) {
    return sizes.map(size => 
      `${cloudinary.url(publicId, { width: size, crop: 'scale', quality: 'auto' })} ${size}w`
    ).join(', ');
  }
}

module.exports = new UploadService();