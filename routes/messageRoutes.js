const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { optimizeChatMedia } = require('../middleware/imageOptimizer');
const { 
  sendMessage, deleteMessage, editMessage, 
  forwardMessage, addReaction, removeReaction, 
  toggleStarMessage, getStarredMessages,
  pinMessage, markMessageRead, getMessageReadInfo
} = require('../controllers/messageController');

// Standard Send (if not using /chats/:chatId/messages)
router.post('/', auth, upload.single('file'), optimizeChatMedia, sendMessage);

// Forward, Delete, Edit
router.post('/forward', auth, forwardMessage);
router.delete('/:messageId', auth, deleteMessage);
router.put('/:messageId', auth, editMessage);

// Interactions
router.post('/:messageId/star', auth, toggleStarMessage);
router.put('/:messageId/reaction', auth, addReaction);
router.delete('/:messageId/reaction', auth, removeReaction);

// [FIX] Match List: GET /messages/starred (Removed /all)
router.get('/starred', auth, getStarredMessages);

// Features
router.post('/:messageId/pin', auth, pinMessage);
router.post('/:messageId/read', auth, markMessageRead);
router.get('/:messageId/info', auth, getMessageReadInfo);

// [NEW] Reply Route: POST /messages/:messageId/reply
router.post('/:messageId/reply', auth, upload.single('file'), optimizeChatMedia, (req, res, next) => {
    req.body.replyTo = req.params.messageId;
    next();
}, sendMessage);

module.exports = router;