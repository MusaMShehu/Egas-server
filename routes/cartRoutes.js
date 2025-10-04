const express = require("express");
const { getCart, addToCart, updateCart, removeFromCart, clearCart } = require("../controllers/cartController");
const { protect } = require("../middleware/auth"); 

const router = express.Router();

router.get("/", protect, getCart);
router.post("/add", protect, addToCart);
router.put("/update", protect, updateCart);
router.delete('/remove/:id', protect, removeFromCart);
router.delete('/clear', protect, clearCart);

module.exports = router;
