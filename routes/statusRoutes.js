const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { optimizeChatMedia } = require('../middleware/imageOptimizer');
const { createStatus, getStatuses, deleteStatus } = require('../controllers/statusController');

// POST /api/status - Upload
router.post('/', auth, upload.single('file'), optimizeChatMedia, createStatus);

// GET /api/status - Feed
router.get('/', auth, getStatuses);

// DELETE /api/status/:statusId - Manual Delete [NEW]
router.delete('/:statusId', auth, deleteStatus);

module.exports = router;