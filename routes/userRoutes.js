const express = require('express');
const router = express.Router();

// [FIX] Correct Middleware Import (auth is the default export)
const auth = require('../middleware/authMiddleware'); 
const upload = require('../middleware/uploadMiddleware');
const { optimizeAvatar } = require('../middleware/imageOptimizer');

const { 
  getMe, 
  updateProfile, 
  searchUsers, 
  blockUser, 
  unblockUser,
  getBlockList,
  getLastSeen,
  getUserById
} = require('../controllers/userController');

// All routes are protected
router.get('/me', auth, getMe);

router.patch('/me', 
  auth, 
  upload.single('avatar'), 
  optimizeAvatar,          
  updateProfile            
);

router.get('/search', auth, searchUsers);
router.post('/block', auth, blockUser);
router.post('/unblock', auth, unblockUser);
router.get('/blocklist', auth, getBlockList);

// [NEW] Route for Last Seen
router.get('/:userId/last-seen', auth, getLastSeen);

// [NEW] Route for User Profile by ID (call screen lookup)
router.get('/:userId/profile', auth, getUserById);

// [NEW] Delete Account
const { deleteAccount } = require('../controllers/userController');
router.delete('/me', auth, deleteAccount);

module.exports = router;