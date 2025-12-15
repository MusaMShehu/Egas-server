const Product = require('../../models/Product');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const cloudinary = require('../../config/cloudinary');
const path = require('path');
const fs = require('fs');

// @desc    Get all products with advanced filtering
// @route   GET /api/v1/admin/products
// @access  Private/Admin
exports.getProducts = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single product
// @route   GET /api/v1/admin/products/:id
// @access  Private/Admin
exports.getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(
      new ErrorResponse(`No product with the id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: product
  });
});

// @desc    Create product
// @route   POST /api/v1/admin/products
// @access  Private/Admin
exports.createProduct = asyncHandler(async (req, res, next) => {
  // Add createdBy user
  req.body.createdBy = req.user.id;
  
  const product = await Product.create(req.body);

  // Log the action
  console.log(`Product created by admin ${req.user.id}: ${product.name}`);

  res.status(201).json({
    success: true,
    data: product
  });
});

// @desc    Update product
// @route   PUT /api/v1/admin/products/:id
// @access  Private/Admin
exports.updateProduct = asyncHandler(async (req, res, next) => {
  let product = await Product.findById(req.params.id);

  if (!product) {
    return next(
      new ErrorResponse(`No product with the id of ${req.params.id}`, 404)
    );
  }

  // Add updatedBy user
  req.body.updatedBy = req.user.id;
  req.body.updatedAt = Date.now();

  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  // Log the action
  console.log(`Product updated by admin ${req.user.id}: ${product.name}`);

  res.status(200).json({
    success: true,
    data: product
  });
});

// @desc    Delete product
// @route   DELETE /api/v1/admin/products/:id
// @access  Private/Admin
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(
      new ErrorResponse(`No product with the id of ${req.params.id}`, 404)
    );
  }

  // Delete associated image if it exists and is not default
  if (product.image && product.image !== 'default-product.jpg') {
    const imagePath = path.join(
      process.env.FILE_UPLOAD_PATH, 
      'products', 
      product.image
    );
    
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  // ✅ FIX: Mongoose v7 compatible
  await product.deleteOne();

  // Log the action
  console.log(`Product deleted by admin ${req.user.id}: ${product.name}`);

  res.status(200).json({
    success: true,
    data: {}
  });
});


// @desc    Bulk delete products
// @route   DELETE /api/v1/admin/products/bulk-delete
// @access  Private/Admin
exports.bulkDeleteProducts = asyncHandler(async (req, res, next) => {
  const { productIds } = req.body;

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return next(new ErrorResponse('Please provide an array of product IDs', 400));
  }

  const products = await Product.find({ _id: { $in: productIds } });

  // Delete images for all products
  for (const product of products) {
    if (product.image && product.image !== 'default-product.jpg') {
      const imagePath = path.join(
        process.env.FILE_UPLOAD_PATH,
        'products',
        product.image
      );
      
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
  }

  await Product.deleteMany({ _id: { $in: productIds } });

  // Log the action
  console.log(`Bulk delete by admin ${req.user.id}: ${productIds.length} products`);

  res.status(200).json({
    success: true,
    data: {
      deletedCount: productIds.length
    }
  });
});

// @desc    Toggle product status (active/inactive)
// @route   PATCH /api/v1/admin/products/:id/toggle-status
// @access  Private/Admin
exports.toggleProductStatus = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(
      new ErrorResponse(`No product with the id of ${req.params.id}`, 404)
    );
  }

  product.isActive = !product.isActive;
  product.updatedBy = req.user.id;
  product.updatedAt = Date.now();

  await product.save();

  res.status(200).json({
    success: true,
    data: product,
    message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`
  });
});

// @desc    Update product stock
// @route   PATCH /api/v1/admin/products/:id/stock
// @access  Private/Admin
exports.updateProductStock = asyncHandler(async (req, res, next) => {
  const { stock, operation = 'set' } = req.body; // operation: 'set', 'increment', 'decrement'

  if (typeof stock !== 'number' || stock < 0) {
    return next(new ErrorResponse('Please provide a valid stock number', 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(
      new ErrorResponse(`No product with the id of ${req.params.id}`, 404)
    );
  }

  let newStock = product.stock;

  switch (operation) {
    case 'set':
      newStock = stock;
      break;
    case 'increment':
      newStock = product.stock + stock;
      break;
    case 'decrement':
      newStock = Math.max(0, product.stock - stock);
      break;
    default:
      return next(new ErrorResponse('Invalid operation type', 400));
  }

  product.stock = newStock;
  product.updatedBy = req.user.id;
  product.updatedAt = Date.now();

  await product.save();

  res.status(200).json({
    success: true,
    data: product,
    message: `Stock updated successfully to ${newStock}`
  });
});

// @desc    Upload photo for product
// @route   PUT /api/v1/admin/products/:id/photo
// @access  Private/Admin
// exports.uploadProductPhoto = asyncHandler(async (req, res, next) => {
//   const product = await Product.findById(req.params.id);

//   if (!product) {
//     return next(
//       new ErrorResponse(`No product found with id ${req.params.id}`, 404)
//     );
//   }

//   // ✅ multer stores file in req.file
//   if (!req.file) {
//     return next(new ErrorResponse("Please upload an image file", 400));
//   }

//   const uploadDir = path.join(__dirname, "../../uploads/products");

//   // ✅ Create upload directory if missing
//   if (!fs.existsSync(uploadDir)) {
//     fs.mkdirSync(uploadDir, { recursive: true });
//   }

//   // ✅ old image cleanup
//   if (product.image && product.image !== "default-product.jpg") {
//     const oldPath = path.join(uploadDir, product.image);

//     if (fs.existsSync(oldPath)) {
//       fs.unlinkSync(oldPath);
//     }
//   }

//   // ✅ rename file to custom name
//   const extension = path.extname(req.file.originalname);
//   const fileName = `product_${product._id}${extension}`;
//   const finalPath = path.join(uploadDir, fileName);

//   // ✅ move multer temporary file
//   fs.renameSync(req.file.path, finalPath);

//   // ✅ update product
//   product.image = fileName;
//   await product.save();

//   res.status(200).json({
//     success: true,
//     message: "Photo uploaded successfully",
//     data: fileName,
//   });
// });



// Upload product images (admin only)
exports.uploadProductPhoto = asyncHandler(async (req, res) => {
    try {
        const images = req.files.map(file => ({
            public_id: file.public_id,
            url: file.path,
            secure_url: file.path.replace('http://', 'https://')
        }));
        
        res.json({
            success: true,
            images: images
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// Create product with images
exports.createProductWithImagge = asyncHandler(async (req, res) => {
    try {
        const product = new Product({
            ...req.body,
            createdBy: req.userId,
            images: req.body.images || []
        });
        
        await product.save();
        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// Delete product image  
exports.deleteProductImage = asyncHandler(async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Remove from Cloudinary
        await cloudinary.uploader.destroy(req.params.publicId);
        
        // Remove from product images
        product.images = product.images.filter(
            img => img.public_id !== req.params.publicId
        );
        
        await product.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// @desc    Get product analytics
// @route   GET /api/v1/admin/products/analytics/overview
// @access  Private/Admin
exports.getProductAnalytics = asyncHandler(async (req, res, next) => {
  const analytics = await Product.aggregate([
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        activeProducts: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        inactiveProducts: {
          $sum: { $cond: ['$isActive', 0, 1] }
        },
        totalStock: { $sum: '$stock' },
        lowStockProducts: {
          $sum: { $cond: [{ $lte: ['$stock', 10] }, 1, 0] }
        },
        averagePrice: { $avg: '$price' },
        maxPrice: { $max: '$price' },
        minPrice: { $min: '$price' }
      }
    }
  ]);

  const categoryStats = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        averagePrice: { $avg: '$price' },
        totalStock: { $sum: '$stock' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      overview: analytics[0] || {},
      categoryStats,
      timestamp: new Date().toISOString()
    }
  });
});