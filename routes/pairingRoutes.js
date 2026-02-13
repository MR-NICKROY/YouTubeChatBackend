const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); // Existing middleware
const { 
  initPairing, 
  confirmPairing, 
  checkPairingStatus 
} = require('../controllers/pairingController');

// Web calls this to get the QR/Code
router.get('/code', initPairing);

// Web calls this to swap Pairing ID for JWT (after socket confirmation)
router.post('/check', checkPairingStatus);

// Mobile calls this to approve the login
router.post('/confirm', auth, confirmPairing);

module.exports = router;