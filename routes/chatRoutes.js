// ChatBackend/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); 
const { optimizeChatMedia } = require('../middleware/imageOptimizer');
const { 
  accessChat, fetchChats, getChatDetails,
  deleteChatHistory, setWallpaper, getChatMedia,
  requestDeleteChat, 
  respondDeleteChat
} = require('../controllers/chatController');

// Import message logic
const { allMessages, sendMessage, searchInChat } = require('../controllers/messageController');

/* ============================
   CHAT MANAGEMENT (Group & DM)
   ============================ */

// Create or Access 1-on-1 Chat
router.post('/', auth, accessChat);                 

// Get All Chats (Main Screen)
router.get('/', auth, fetchChats);                    

// Get Chat Details (Generic - Works for Group & DM)
router.get('/:chatId', auth, getChatDetails);      

// Delete History (Soft Delete for User)
router.delete('/:chatId', auth, deleteChatHistory);

// Set Wallpaper
router.patch('/:chatId/wallpaper', auth, setWallpaper); 

/* ============================
   MUTUAL DELETE HISTORY
   ============================ */
router.post('/delete-request', auth, requestDeleteChat);
router.post('/delete-respond', auth, respondDeleteChat);

/* ============================
   MESSAGE OPERATIONS
   ============================ */

// Get Messages
router.get('/:chatId/messages', auth, allMessages);   

// Send Message (Text/Media)
router.post('/:chatId/messages', auth, upload.single('file'), optimizeChatMedia, sendMessage);

// Search & Media
router.get('/:chatId/search', auth, searchInChat);    
router.get('/:chatId/media', auth, getChatMedia);     

module.exports = router;