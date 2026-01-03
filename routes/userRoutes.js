const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); 
// --- ADD THESE TWO LINES ---
const upload = require('../middleware/uploadMiddleware');
const { optimizeAvatar } = require('../middleware/imageOptimizer');
// ---------------------------
const { 
  getMe, 
  updateProfile, 
  searchUsers, 
  blockUser, 
  unblockUser,
  getBlockList 
} = require('../controllers/userController');

// All routes here are protected by JWT (auth middleware)
router.get('/me', auth, getMe);

router.patch('/me', 
  auth, 
  upload.single('avatar'), // Now 'upload' is defined
  optimizeAvatar,          // Now 'optimizeAvatar' is defined
  updateProfile            
);

router.get('/search', auth, searchUsers);
router.post('/block', auth, blockUser);
router.post('/unblock', auth, unblockUser); // <--- Add this lin
router.get('/blocklist', auth, getBlockList);

module.exports = router;