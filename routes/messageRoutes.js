const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { optimizeChatMedia } = require('../middleware/imageOptimizer');
const { sendMessage, allMessages, deleteMessage, editMessage, forwardMessage, addReaction, removeReaction, toggleStarMessage, getStarredMessages, pinMessage, markMessageRead, getMessageReadInfo, searchInChat, getChatMedia } = require('../controllers/messageController');

// Standard Send
router.post('/', auth, upload.single('file'), optimizeChatMedia, sendMessage);

// Reply Route: Mapped so 'replyTo' in controller gets the ID
router.post('/:messageId/reply', auth, upload.single('file'), optimizeChatMedia, (req, res, next) => {
    req.body.replyTo = req.params.messageId; 
    next();
}, sendMessage);

// ... (Rest of your routes) ...
router.get('/starred', auth, getStarredMessages);
router.post('/forward', auth, forwardMessage);
router.delete('/:messageId', auth, deleteMessage);
router.put('/:messageId', auth, editMessage);
router.post('/:messageId/star', auth, toggleStarMessage);
router.put('/:messageId/reaction', auth, addReaction);
router.delete('/:messageId/reaction', auth, removeReaction);
router.post('/:messageId/pin', auth, pinMessage);
router.post('/:messageId/read', auth, markMessageRead);
router.get('/:messageId/info', auth, getMessageReadInfo);
router.get('/:chatId/media', auth, getChatMedia);
module.exports = router;