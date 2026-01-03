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

// Match List: POST /groups
router.post('/', auth, createGroup);

// Match List: PATCH /groups/:groupId/info
router.patch('/:groupId/info', auth, upload.single('groupIcon'), optimizeAvatar, updateGroupInfo);

// Match List: POST /groups/:groupId/participants
router.post('/:groupId/participants', auth, addToGroup);

// Match List: DELETE /groups/:groupId/participants
router.delete('/:groupId/participants', auth, removeFromGroup);

// Match List: DELETE /groups/:groupId/leave
router.delete('/:groupId/leave', auth, leaveGroup);

// Match List: PATCH /groups/:groupId/admin
router.patch('/:groupId/admin', auth, toggleAdmin);

// Match List: PATCH /groups/:groupId/permissions
router.patch('/:groupId/permissions', auth, togglePermissions);

module.exports = router;