const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  
  // [FIX] Added 'file' to enum so documents don't cause validation errors
  type: { 
    type: String, 
    enum: ['text', 'image', 'video', 'audio', 'voice', 'gif', 'file'], 
    default: 'text' 
  },
  
  content: { type: String, default: "" }, 
  fileUrl: { type: String, default: "" },
  
  waveform: { type: [Number], default: [] }, // For voice notes
  
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  isDeleted: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },
  forwarded: { type: Boolean, default: false },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String }
  }],
  
  starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
// // ChatBackend/models/Message.js
// const mongoose = require('mongoose');

// const messageSchema = new mongoose.Schema({
//   sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  
//   // [FIX] Added 'file' to enum
//   type: { 
//     type: String, 
//     enum: ['text', 'image', 'video', 'audio', 'voice', 'gif', 'file'], 
//     default: 'text' 
//   },
//   content: { type: String, default: "" }, 
//   fileUrl: { type: String, default: "" },
//   fileName: { type: String }, // [OPTIONAL] Store original filename
//   fileSize: { type: Number }, // [OPTIONAL] Store file size
//    waveform: { type: [Number], default: [] }, // For voice notes
  
//   replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
//   isDeleted: { type: Boolean, default: false },
//   deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
//   isEdited: { type: Boolean, default: false },
  
//   // [FIX] Changed from isPinned (Boolean) to pinnedBy (Array)
//   pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

//   starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
//   readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
//   forwarded: { type: Boolean, default: false },
//   reactions: [
//     {
//       user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//       emoji: String,
//       createdAt: { type: Date, default: Date.now }
//     }
//   ]
// }, { timestamps: true });

// module.exports = mongoose.model('Message', messageSchema);