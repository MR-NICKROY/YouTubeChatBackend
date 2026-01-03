const sharp = require('sharp');
const cloudinary = require('../config/cloudinary');

const uploadToCloudinary = (buffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folder, resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

exports.optimizeAvatar = async (req, res, next) => {
  if (!req.file) return next();
  // Avatars must be images
  if (!req.file.mimetype.startsWith('image')) return next();

  try {
    let finalBuffer = req.file.buffer;
    if (req.file.size > 5 * 1024 * 1024) {
      finalBuffer = await sharp(req.file.buffer)
        .resize({ width: 800 })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
    const result = await uploadToCloudinary(finalBuffer, 'chat-app-avatars', 'image');
    req.file.path = result.secure_url;
    next();
  } catch (error) {
    res.status(500).json({ msg: 'Avatar processing failed', error: error.message });
  }
};

exports.optimizeChatMedia = async (req, res, next) => {
  if (!req.file) return next();

  try {
    // 1. If it's an IMAGE, compress it
    if (req.file.mimetype.startsWith('image')) {
      const compressedBuffer = await sharp(req.file.buffer)
        .resize({ width: 1280, withoutEnlargement: true })
        .jpeg({ quality: 60 })
        .toBuffer();

      const result = await uploadToCloudinary(compressedBuffer, 'chat-app-messages', 'image');
      req.file.path = result.secure_url;
    } 
    // 2. If it's VIDEO/AUDIO/PDF, upload directly without compression
    else {
      // 'auto' lets Cloudinary detect if it's video, audio, or raw file
      const result = await uploadToCloudinary(req.file.buffer, 'chat-app-files', 'auto');
      req.file.path = result.secure_url;
    }
    
    // Pass metadata to controller
    req.file.size = req.file.size;
    req.file.mimetype = req.file.mimetype;
    
    next();
  } catch (error) {
    res.status(500).json({ msg: 'File upload failed', error: error.message });
  }
};