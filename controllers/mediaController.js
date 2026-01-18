const axios = require('axios');
const { deleteFromCloudinary } = require('../utils/cloudinaryHelper');
// Get Trending GIFs from Giphy
exports.getTrendingGifs = async (req, res) => {
  try {
    const limit = 20;
    const apiKey = process.env.GIPHY_API_KEY;
    
    // Call Giphy API
    const response = await axios.get(`https://api.giphy.com/v1/gifs/trending`, {
      params: {
        api_key: apiKey,
        limit: limit,
        rating: 'g' // Optional: filter by rating
      }
    });

    // Extract just the URLs to send to frontend
    // We send 'original' url so it plays well, but you can choose 'fixed_height' for speed
    const gifUrls = response.data.data.map(gif => gif.images.original.url);
    
    res.json(gifUrls);
  } catch (err) {
    console.error("Giphy API Error:", err.message);
    res.status(500).send("Error fetching GIFs from Giphy");
  }
};

// Secure Download / Redirect (Optional helper)
exports.secureDownload = (req, res) => {
    const { fileUrl } = req.query; 
    if(!fileUrl) return res.status(400).send("No URL provided");
    res.redirect(fileUrl);
};

// [NEW] Manual Media Delete
exports.deleteMedia = async (req, res) => {
  const { fileUrl } = req.body;

  if (!fileUrl) {
    return res.status(400).json({ msg: "fileUrl is required in the request body" });
  }

  try {
    const response = await deleteFromCloudinary(fileUrl);
    
    if (response.success) {
      res.json({ msg: "File deleted successfully from Cloudinary", detail: response.result });
    } else {
      res.status(400).json({ msg: "Failed to delete file", detail: response.result || response.error });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error during file deletion");
  }
};