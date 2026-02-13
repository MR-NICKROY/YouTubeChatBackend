// ChatBackend/middleware/imageOptimizer.js
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
    // Compress if larger than 5MB
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
    console.error("Avatar Optimization Error:", error);
    res.status(500).json({ msg: 'Avatar processing failed', error: error.message });
  }
};

exports.optimizeChatMedia = async (req, res, next) => {
  if (!req.file) return next();

  try {
    let bufferToUpload = req.file.buffer;
    let folder = 'chat-app-files';
    let resourceType = 'raw'; // Default to raw for safety (docs, zips)

    const mime = req.file.mimetype;

    // 1. HANDLE IMAGES
    if (mime.startsWith('image/')) {
        resourceType = 'image';
        folder = 'chat-app-messages';

        // Only compress standard formats. Skip SVG/ICO/GIF to avoid corruption/animation loss
        if (!mime.includes('svg') && !mime.includes('ico') && !mime.includes('gif')) {
            bufferToUpload = await sharp(req.file.buffer)
                .resize({ width: 1280, withoutEnlargement: true })
                .jpeg({ quality: 70 })
                .toBuffer();
        }
    } 
    // 2. HANDLE VIDEO & AUDIO
    // Cloudinary uses 'video' resource_type for both video and audio files
    else if (mime.startsWith('video/') || mime.startsWith('audio/')) {
        resourceType = 'video';
        folder = 'chat-app-media';
    }
    // 3. HANDLE DOCUMENTS (PDF, DOC, ETC)
    // We keep resourceType = 'raw' (set above)
    else {
        resourceType = 'raw';
        folder = 'chat-app-docs';
    }

    // Upload to Cloudinary with explicit type
    const result = await uploadToCloudinary(bufferToUpload, folder, resourceType);
    
    // Attach result to req.file for the controller
    req.file.path = result.secure_url;
    req.file.size = result.bytes;
    req.file.mimetype = mime;
    
    next();
  } catch (error) {
    console.error("Media Optimization Error:", error);
    res.status(500).json({ msg: 'File upload failed', error: error.message });
  }
};