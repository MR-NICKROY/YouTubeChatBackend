const User = require('../models/User');

// @desc    Get current user profile
// @route   GET /api/users/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').populate('blockedUsers', 'username avatar');
    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// @desc    Update user profile (Bio, Avatar, Name)
// @route   PATCH /api/users/me
exports.updateProfile = async (req, res) => {
  const { username, about, avatar } = req.body;

  // Build update object
  const updateFields = {};
  if (username) updateFields.username = username;
  if (about) updateFields.about = about;
  
  // --- FIX START ---
  // Priority: 1. New File Upload 2. String URL in body
  if (req.file && req.file.path) {
    updateFields.avatar = req.file.path;
  } else if (avatar) {
    updateFields.avatar = avatar;
  }
  // --- FIX END ---

  try {
    // new: true returns the updated document
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// @desc    Search all users (by name or email)
// @route   GET /api/users/search?search=john
exports.searchUsers = async (req, res) => {
  const keyword = req.query.search
    ? {
        $or: [
          { username: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  try {
    // Find users matching keyword, excluding the current logged-in user
    const users = await User.find(keyword).find({ _id: { $ne: req.user.id } }).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// @desc    Block a user
// @route   POST /api/users/block
exports.blockUser = async (req, res) => {
  const { userIdToBlock } = req.body;

  try {
    // Use $addToSet to avoid duplicate entries in the array
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { blockedUsers: userIdToBlock } },
      { new: true }
    ).select('-password');

    res.json(user.blockedUsers);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// @route   POST /api/users/unblock
exports.unblockUser = async (req, res) => {
  const { userIdToUnblock } = req.body;

  try {
    // Use $pull to remove the ID from the blockedUsers array
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { blockedUsers: userIdToUnblock } },
      { new: true }
    ).select('-password');

    res.json(user.blockedUsers);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};
// @desc    Get list of blocked users
// @route   GET /api/users/blocklist
exports.getBlockList = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('blockedUsers', 'username avatar email');
    res.json(user.blockedUsers);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};