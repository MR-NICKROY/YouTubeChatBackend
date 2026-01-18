const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { uploadToCloudinary } = require('../utils/cloudinaryHelper'); // Import helper

// Helper: Generate Both Tokens
const generateTokens = (id) => {
  // Access Token: Short life (15 mins)
  const accessToken = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  // Refresh Token: Long life (7 days)
  const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  // Multer middleware populates req.body and req.file
  const { name, email, phone, password, about } = req.body;
  
  try {
    let user = await User.findOne({ phone });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    // Handle Avatar Upload
    let avatarUrl = "";
    if (req.file) {
      try {
        // Upload the file buffer to Cloudinary
        const uploadResult = await uploadToCloudinary(req.file.buffer, "user_avatars");
        avatarUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Avatar upload failed:", uploadError);
        // Continue registration but without avatar, or fail. Here we continue.
      }
    }

    // Create User
    user = new User({ 
      name, 
      email, 
      phone, 
      password, 
      about, 
      avatar: avatarUrl 
    });
    
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token to DB
    user.refreshToken = refreshToken;
    // Use findByIdAndUpdate to avoid triggering hooks unnecessarily
    await User.findByIdAndUpdate(user._id, { refreshToken });

    res.json({ token: accessToken, refreshToken, user });
  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).send(err.message);
  }
};

exports.login = async (req, res) => {
  const { phone, password } = req.body;
  try {
    const user = await User.findOne({ phone });
    
    // Check password
    if (user && (await bcrypt.compare(password, user.password))) {
      const { accessToken, refreshToken } = generateTokens(user._id);

      // [FIX] Use findByIdAndUpdate to strictly update ONLY the refresh token
      // This prevents any accidental schema validation errors or password re-hashing
      await User.findByIdAndUpdate(user._id, { refreshToken });

      res.json({
        token: accessToken,
        refreshToken: refreshToken, 
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          about: user.about,
        },
      });
    } else {
      res.status(401).json({ msg: 'Invalid credentials' });
    }
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).send(err.message);
  }
};

// Refresh Token Logic
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ msg: 'No token provided' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ msg: 'Invalid refresh token' });
    }

    // Issue NEW Access Token
    const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    
    res.json({ token: accessToken });
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(403).json({ msg: 'Invalid or expired token' });
  }
};