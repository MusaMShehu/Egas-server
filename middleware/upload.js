const multer = require("multer");
const path = require("path");
const fs = require("fs");

// allowed types
const allowedImages = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

// dynamic storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {

    // ✅ fallback if no folder is specified
    let folder = "others";

    // middleware injects req.uploadFolder
    if (req.uploadFolder) {
      folder = req.uploadFolder;
    }

    const uploadPath = path.join(__dirname, `../uploads/${folder}`);

    // ✅ ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

// ********** File Filter **********
const fileFilter = (req, file, cb) => {
  if (allowedImages.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPG, PNG, WEBP allowed."), false);
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});
