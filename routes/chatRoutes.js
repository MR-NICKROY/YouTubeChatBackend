const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // [ADD THIS]
const { optimizeChatMedia } = require('../middleware/imageOptimizer');
const { 
  accessChat, fetchChats, getChatDetails,
  deleteChatHistory, setWallpaper, getChatMedia 
} = require('../controllers/chatController');

// Import message logic
const { allMessages, sendMessage, searchInChat } = require('../controllers/messageController');

// 1-on-1 Management
router.post('/dm', auth, accessChat);                 // POST /chats/dm
router.get('/dm/:chatId', auth, getChatDetails);      // GET /chats/dm/:chatId
router.delete('/dm/:chatId', auth, deleteChatHistory);// DELETE /chats/dm/:chatId
router.patch('/dm/:chatId/wallpaper', auth, setWallpaper); //ZXPATCH /chats/dm/:chatId/wallpaper

// General Chat Listing
router.get('/', auth, fetchChats);                    // GET /chats

// Message Operations via Chat ID
router.get('/:chatId/messages', auth, allMessages);   // GET /chats/:chatId/messages

// [NEW] Match List: POST /chats/:chatId/messages
 router.post('/:chatId/messages', auth, upload.single('file'), optimizeChatMedia, sendMessage);

// Search & Media
router.get('/:chatId/search', auth, searchInChat);    // GET /chats/:chatId/search
router.get('/:chatId/media', auth, getChatMedia);     // GET /chats/:chatId/media

module.exports = router;