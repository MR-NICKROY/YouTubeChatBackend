const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['text', 'image', 'video', 'file', 'gif', 'voice'], default: 'text' },
  content: { type: String, default: "" }, // Encrypted text or Caption
  fileUrl: { type: String, default: "" }, // URL for Image/Video/Audio/GIF
  
  // [NEW] Voice Note Data
  waveform: [{ type: Number }], // Array of amplitudes for the audio visualizer

  // Read Receipts
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Interactions
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String, required: true }
  }],
  
  // Metadata
  isDeleted: { type: Boolean, default: false }, // "Delete for everyone"
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // "Delete for me"
  
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  forwarded: { type: Boolean, default: false },
  
  isPinned: { type: Boolean, default: false },
  starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);