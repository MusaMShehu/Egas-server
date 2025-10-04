const Cart = require("../models/Cart");
const Product = require("../models/Product");
const asyncHandler = require ("../middleware/async");
const user = require ("../models/User");

// ✅ Get user's cart
exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id })
    .populate("items.product");
    if (!cart) {
      return res.json({ items: [] });
    }
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch cart", error: error.message });
  }
};

// ✅ Add item to cart
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const product = await Product.findById(productId);

    if (!product) return res.status(404).json({ message: "Product not found" });

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity || 1;
    } else {
      cart.items.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: quantity || 1,
        image: product.image,
      });
    }

    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: "Failed to add to cart", error: error.message });
  }
};

// ✅ Update cart (quantities, remove items, etc.)
exports.updateCart = async (req, res) => {
  try {
    const { updates } = req.body;
    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    updates.forEach(update => {
      const itemIndex = cart.items.findIndex(item => item.product.toString() === update.productId);
      if (itemIndex > -1) {
        if (update.quantity <= 0) {
          cart.items.splice(itemIndex, 1); 
        } else {
          cart.items[itemIndex].quantity = update.quantity;
        }
      }
    });

    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: "Failed to update cart", error: error.message });
  }
};

// // ✅ Clear cart (after checkout or manually)
// exports.clearCart = async (req, res) => {
//   try {
//     await Cart.findOneAndUpdate({ user: req.user.id }, { items: [] });
//     res.json({ message: "Cart cleared" });
//   } catch (error) {
//     res.status(500).json({ message: "Failed to clear cart", error: error.message });
//   }
// };



// ✅ Remove single item
exports.removeFromCart = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    return next(new ErrorResponse('Cart not found', 404));
  }

  cart.items = cart.items.filter(
    (item) => item.product.toString() !== productId
  );

  await cart.save();
  res.status(200).json({ success: true, data: cart });
});

// ✅ Clear entire cart
exports.clearCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = [];
    await cart.save();

    res.json(cart);
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({ message: "Server error" });
  }
};
