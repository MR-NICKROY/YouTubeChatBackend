const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  isGroup: { type: Boolean, default: false },
  groupName: { type: String, default: "" },
  groupIcon: { type: String, default: "" },
  description: { type: String, default: "" },
  
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  
  // User-specific settings (Wallpaper, Soft Delete, etc.)
  // We use an array of objects to store per-user settings for this chat
  userSettings: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    wallpaper: { type: String, default: "" }, // Custom Wallpaper URL
    isArchived: { type: Boolean, default: false },
    isMuted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null } // For "Clearing" chat history locally
  }],
  
  // Group Permissions (Admin Only)
  permissions: {
    onlyAdminsCanSend: { type: Boolean, default: false },
    onlyAdminsCanEditInfo: { type: Boolean, default: false }
  }

}, { timestamps: true });

module.exports = mongoose.model('Chat', ChatSchema);