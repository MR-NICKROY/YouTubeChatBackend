// ChatBackend/models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  type: { 
    type: String, 
    enum: ['text', 'image', 'video', 'audio', 'file', 'gif', 'voice', 'sticker'], 
    default: 'text' 
  },
  content: { type: String, default: "" }, 
  fileUrl: { type: String, default: "" },
  waveform: { type: [Number], default: [] }, 
  
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  isDeleted: { type: Boolean, default: false },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isEdited: { type: Boolean, default: false },
  
  // [FIX] Changed from isPinned (Boolean) to pinnedBy (Array)
  pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  forwarded: { type: Boolean, default: false },
  reactions: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      emoji: String,
      createdAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);