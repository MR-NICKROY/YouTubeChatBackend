const cloudinary = require('../config/cloudinary');
const stream = require('stream');

// Helper to parse Cloudinary URL
const parseCloudinaryUrl = (url) => {
  try {
    const regex = /\/([a-z]+)\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i;
    const matches = url.match(regex);
    if (!matches || matches.length < 3) return null;
    return {
      resource_type: matches[1],
      public_id: matches[2]
    };
  } catch (error) {
    console.error("Error parsing Cloudinary URL:", error);
    return null;
  }
};

// [NEW] Helper to Upload Buffer to Cloudinary
const uploadToCloudinary = (buffer, folder = 'chat-app') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folder, resource_type: "auto" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    
    // Create a stream from the buffer and pipe it to Cloudinary
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream.pipe(uploadStream);
  });
};

// Function to delete file from Cloudinary
const deleteFromCloudinary = async (fileUrl) => {
  if (!fileUrl) return { success: false, msg: "No URL provided" };
  
  const fileData = parseCloudinaryUrl(fileUrl);
  if (!fileData) return { success: false, msg: "Invalid Cloudinary URL" };

  try {
    const result = await cloudinary.uploader.destroy(fileData.public_id, {
      resource_type: fileData.resource_type
    });

    if (result.result === 'ok' || result.result === 'not found') {
      return { success: true, result };
    } else {
      return { success: false, result };
    }
  } catch (error) {
    console.error("Cloudinary Delete Error:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { deleteFromCloudinary, uploadToCloudinary };