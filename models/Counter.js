const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // counter key
    seq: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false }
);

module.exports = mongoose.models.Counter || mongoose.model('Counter', counterSchema);