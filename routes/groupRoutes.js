// ChatBackend/routes/groupRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { optimizeAvatar } = require('../middleware/imageOptimizer');

const { 
  createGroup, 
  addToGroup, 
  removeFromGroup, 
  leaveGroup, 
  updateGroupInfo,
  toggleAdmin, 
  togglePermissions 
} = require('../controllers/chatController');

// [FIX] Added upload middleware to handle FormData & Image
router.post('/', auth, upload.single('groupIcon'), optimizeAvatar, createGroup);

// Update Info
router.patch('/:groupId/info', auth, upload.single('groupIcon'), optimizeAvatar, updateGroupInfo);

// Participants
router.post('/:groupId/participants', auth, addToGroup);
router.delete('/:groupId/participants', auth, removeFromGroup);

// Other Actions
router.delete('/:groupId/leave', auth, leaveGroup);
router.patch('/:groupId/admin', auth, toggleAdmin);
router.patch('/:groupId/permissions', auth, togglePermissions);

module.exports = router;