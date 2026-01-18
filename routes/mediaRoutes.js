const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { optimizeChatMedia } = require('../middleware/imageOptimizer');
const { 
  getTrendingGifs, 
  secureDownload, 
  deleteMedia 
} = require('../controllers/mediaController');

// Generic Upload Route (POST /media/upload)
router.post('/upload', auth, upload.single('file'), optimizeChatMedia, (req, res) => {
    res.json({
        fileUrl: req.file.path,
        mimeType: req.file.mimetype,
        size: req.file.size
    });
});

// [NEW] Voice Note Upload (POST /media/voice)
// Reuses upload logic, but strictly for audio.
router.post('/voice', auth, upload.single('file'), optimizeChatMedia, (req, res) => {
    // In a real app, you might use ffmpeg here to generate waveform data
    // For now, we return the URL so the client can send it via POST /messages
    if (!req.file.mimetype.startsWith('audio')) {
        return res.status(400).json({ msg: "File is not an audio file" });
    }
    res.json({
        fileUrl: req.file.path,
        mimeType: req.file.mimetype,
        size: req.file.size
    });
});
router.post('/delete', auth, deleteMedia);
router.get('/gifs/trending', auth, getTrendingGifs);
router.get('/download', auth, secureDownload);

module.exports = router;