const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "" },
  about: { type: String, default: "Hey there! I am using ChatApp." },
  lastSeen: { type: Date, default: Date.now },
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  refreshToken: { type: String } 
}, { timestamps: true });

// [FIXED] Added 'return' and removed 'next' parameter for async/await compatibility
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return; // <--- CRITICAL FIX: Stop if password unchanged

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('User', userSchema);