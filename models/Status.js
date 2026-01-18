const mongoose = require('mongoose');

const StatusSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['image', 'text'], default: 'image' }, // Text-only support can be added later
  imageUrl: { type: String, required: true }, // Cloudinary URL
  caption: { type: String, default: "" },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Status', StatusSchema);