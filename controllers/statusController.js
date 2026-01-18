const Status = require('../models/Status');
const fs = require('fs');
const path = require('path');
const { deleteFromCloudinary } = require('../utils/cloudinaryHelper'); //

const STATUS_FILE_PATH = path.join(__dirname, '../status.json');

// Helper: Update status.json
const updateStatusFile = (data) => {
  let statuses = [];
  if (fs.existsSync(STATUS_FILE_PATH)) {
    try {
      const fileData = fs.readFileSync(STATUS_FILE_PATH, 'utf8');
      statuses = fileData ? JSON.parse(fileData) : [];
    } catch (err) {
      console.error("Error reading status.json", err);
    }
  }
  statuses.push(data);
  fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(statuses, null, 2));
};

// Helper: Remove from status.json
const removeFromStatusFile = (statusId) => {
  if (fs.existsSync(STATUS_FILE_PATH)) {
    try {
      const fileData = fs.readFileSync(STATUS_FILE_PATH, 'utf8');
      let statuses = JSON.parse(fileData);
      // Filter out the deleted status
      statuses = statuses.filter(s => s.id !== statusId);
      fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(statuses, null, 2));
    } catch (err) {
      console.error("Error updating status.json", err);
    }
  }
};

// [NEW] Robust Cleanup Function (Called by server.js)
exports.cleanupExpiredStatuses = async () => {
  try {
    const now = new Date();
    // Find all statuses where 'expiresAt' has passed
    const expiredStatuses = await Status.find({ expiresAt: { $lt: now } }); //

    if (expiredStatuses.length > 0) {
      console.log(`[Status Cleanup] Found ${expiredStatuses.length} expired statuses.`);
      
      for (const status of expiredStatuses) {
        // 1. Delete from Cloudinary
        if (status.imageUrl) {
          await deleteFromCloudinary(status.imageUrl);
        }

        // 2. Delete from MongoDB
        await Status.findByIdAndDelete(status._id);

        // 3. Delete from status.json (Your Requirement)
        removeFromStatusFile(status._id.toString());
        
        console.log(`[Status Cleanup] Successfully deleted status: ${status._id}`);
      }
    }
  } catch (err) {
    console.error("[Status Cleanup] Error:", err);
  }
};

exports.createStatus = async (req, res) => {
  try {
    const { caption } = req.body;
    
    if (!req.file || !req.file.mimetype.startsWith('image')) {
      return res.status(400).json({ msg: "Please upload an image or GIF." });
    }

    // Save to Database
    const newStatus = new Status({
      user: req.user.id,
      imageUrl: req.file.path,
      caption: caption,
      // Expires in 1 minute
      expiresAt: new Date(Date.now() + 60000) 
    });

    const savedStatus = await newStatus.save();
    await savedStatus.populate('user', 'name avatar');

    // Save metadata to status.json
    const statusLog = {
      id: savedStatus._id.toString(),
      url: req.file.path,
      text: caption || "",
      uploadTime: new Date().toISOString(),
      deleteTime: new Date(Date.now() + 60000).toISOString()
    };
    updateStatusFile(statusLog);

    // [NOTE] setTimeout removed. Cleanup is now handled by server.js interval.
    
    res.json(savedStatus);

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.getStatuses = async (req, res) => {
  try {
    // Only return valid (non-expired) statuses
    const statuses = await Status.find({ expiresAt: { $gt: new Date() } })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(statuses);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// Manual Delete
exports.deleteStatus = async (req, res) => {
  try {
    const status = await Status.findById(req.params.statusId);
    if (!status) return res.status(404).json({ msg: "Status not found" });

    if (status.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: "Not authorized to delete this status" });
    }

    await deleteFromCloudinary(status.imageUrl);
    await Status.findByIdAndDelete(req.params.statusId);
    
    // Ensure it's removed from JSON too
    removeFromStatusFile(req.params.statusId);

    res.json({ msg: "Status deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};