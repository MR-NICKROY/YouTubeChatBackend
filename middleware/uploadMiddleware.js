const multer = require('multer');

// Setup Memory Storage
const storage = multer.memoryStorage();

// Define File Filter
const fileFilter = (req, file, cb) => {
  // Regex to check extensions
  const allowedExtensions = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|mp4|mpeg|mp3|wav|ogg|m4a/;
  
  // Check MIME type prefixes to be safe
  const isMimeTypeValid = 
    allowedExtensions.test(file.originalname.split('.').pop().toLowerCase()) || // Check extension
    file.mimetype.startsWith('image/') || 
    file.mimetype.startsWith('video/') ||
    file.mimetype.startsWith('audio/') || 
    file.mimetype.startsWith('text/') || // Allow .txt, .csv
    file.mimetype.startsWith('application/'); // Allow pdf, doc, zip, etc.
  
  if (isMimeTypeValid) {
    cb(null, true);
  } else {
    // This throws the error that leads to a 400 response
    cb(new Error('Invalid file type. Only Images, Videos, Audio, and Documents are allowed.'), false);
  }
};

// Initialize Multer
const upload = multer({
  storage: storage,
  limits: {
    // 50MB Backend Limit (Frontend will restrict to 5MB for docs, but we keep this high for videos)
    fileSize: 50 * 1024 * 1024, 
  },
  fileFilter: fileFilter
});

module.exports = upload;