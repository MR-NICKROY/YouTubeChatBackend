const mongoose = require('mongoose');

const PairingSessionSchema = new mongoose.Schema({
  pairingId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  }, // The hidden UUID known only to the web browser
  
  code: { 
    type: String, 
    required: true, 
    index: true 
  }, // The 6-digit code shown on screen
  
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  }, // Filled when mobile user confirms
  
  status: { 
    type: String, 
    enum: ['WAITING', 'CONFIRMED', 'USED', 'EXPIRED'], 
    default: 'WAITING' 
  },
  
  attempts: { type: Number, default: 0 }, // Security: Anti-brute-force
  
  deviceInfo: { type: String, default: 'Unknown Web Client' },
  
  expiresAt: { 
    type: Date, 
    required: true,
    index: { expires: '5m' } // Auto-delete from DB after 5 minutes (TTL)
  }
}, { timestamps: true });

module.exports = mongoose.model('PairingSession', PairingSessionSchema);