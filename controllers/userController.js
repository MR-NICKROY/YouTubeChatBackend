const User = require('../models/User');
const { deleteFromCloudinary } = require('../utils/cloudinaryHelper');

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').populate('blockedUsers', 'name avatar');
    res.json(user);
  } catch (err) { res.status(500).send('Server Error'); }
};

exports.updateProfile = async (req, res) => {
  const { name, status, avatar, phone } = req.body;
  
  try {
    const currentUser = await User.findById(req.user.id);
    const updateFields = {};
    
    if (name) updateFields.name = name;
    if (status) updateFields.about = status; // Map 'status' to 'about'
    if (phone) updateFields.phone = phone;

    if (req.file && req.file.path) {
      if (currentUser.avatar && currentUser.avatar.includes('cloudinary')) {
         await deleteFromCloudinary(currentUser.avatar); 
      }
      updateFields.avatar = req.file.path;
    } else if (avatar) {
      if (avatar === "" && currentUser.avatar) await deleteFromCloudinary(currentUser.avatar);
      updateFields.avatar = avatar;
    }

    const user = await User.findByIdAndUpdate(req.user.id, { $set: updateFields }, { new: true }).select('-password');

    // [NEW] BROADCAST UPDATE TO ALL CLIENTS
    // This allows other users (friends/contacts) to see the changes immediately
    const io = req.app.get('io');
    if (io) {
      io.emit('user_updated', user); 
    }

    res.json(user);
  } catch (err) { 
    console.error("Update Profile Error:", err);
    res.status(500).send('Server Error'); 
  }
};
exports.searchUsers = async (req, res) => {
  const keyword = req.query.search ? {
      $or: [
        { name: { $regex: req.query.search, $options: 'i' } },
        { phone: { $regex: req.query.search, $options: 'i' } },
      ],
    } : {};
  try {
    const users = await User.find(keyword).find({ _id: { $ne: req.user.id } }).select('-password');
    res.json(users);
  } catch (err) { res.status(500).send('Server Error'); }
};

// [FIXED] Updated to accept 'userId' to match Frontend API
exports.blockUser = async (req, res) => { 
  const { userId, userIdToBlock } = req.body; 
  const targetId = userId || userIdToBlock; // Handle both cases for safety

  if (!targetId) return res.status(400).json({ msg: "User ID is required" });

  try {
    const user = await User.findByIdAndUpdate(
      req.user.id, 
      { $addToSet: { blockedUsers: targetId } }, 
      { new: true }
    ).select('-password');
    res.json(user.blockedUsers);
  } catch (err) { res.status(500).send('Server Error'); }
};

// [FIXED] Updated to accept 'userId' to match Frontend API
exports.unblockUser = async (req, res) => { 
  const { userId, userIdToUnblock } = req.body;
  const targetId = userId || userIdToUnblock; // Handle both cases for safety

  if (!targetId) return res.status(400).json({ msg: "User ID is required" });

  try {
    const user = await User.findByIdAndUpdate(
      req.user.id, 
      { $pull: { blockedUsers: targetId } }, 
      { new: true }
    ).select('-password');
    res.json(user.blockedUsers);
  } catch (err) { res.status(500).send('Server Error'); }
};

exports.getBlockList = async (req, res) => { 
  try {
    const user = await User.findById(req.user.id).populate('blockedUsers', 'name avatar phone about');
    res.json(user.blockedUsers);
  } catch (err) { res.status(500).send('Server Error'); }
};
// [FIX] Added missing function
exports.getLastSeen = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('lastSeen');
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json({ lastSeen: user.lastSeen });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};