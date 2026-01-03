const multer = require('multer');

// Setup Memory Storage
const storage = multer.memoryStorage();

// Define File Filter
const fileFilter = (req, file, cb) => {
  // Allow Images, Videos, Docs, and AUDIO (Voice Notes)
  // We check the mimetype to ensure it's a supported format
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mpeg|mp3|wav|ogg|m4a/;
  
  const isMimeTypeValid = allowedTypes.test(file.mimetype) || 
                          file.mimetype.startsWith('image/') || 
                          file.mimetype.startsWith('video/') ||
                          file.mimetype.startsWith('audio/') || 
                          file.mimetype.startsWith('application/');
  
  if (isMimeTypeValid) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only Images, Videos, Audio, and Docs are allowed.'), false);
  }
};

// Initialize Multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (important for Video/Audio)
  },
  fileFilter: fileFilter
});

module.exports = upload;