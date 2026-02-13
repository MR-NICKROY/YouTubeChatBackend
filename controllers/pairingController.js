const PairingSession = require('../models/PairingSession');
const User = require('../models/User');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// [FIX] Changed expiresIn from '15m' to '1d' (1 Day)
const generateTokens = (id) => {
  const accessToken = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  // Refresh token isn't strictly needed for this flow if access is 1d, but good to keep
  const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// 1. Web: Init Pairing Session
exports.initPairing = async (req, res) => {
  try {
    const pairingId = crypto.randomUUID();
    const code = crypto.randomInt(100000, 999999).toString();
    const deviceInfo = req.headers['user-agent'] || 'Unknown';

    await PairingSession.create({
      pairingId,
      code,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 Minutes
      deviceInfo
    });

    res.json({ pairingId, code, expiresIn: 120 });
  } catch (err) {
    console.error("Init Pairing Error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
};

// 2. Mobile: Confirm Code (Authenticated)
exports.confirmPairing = async (req, res) => {
  const { code } = req.body;
  const userId = req.user.id; 

  try {
    const session = await PairingSession.findOne({ 
      code, 
      status: 'WAITING',
      expiresAt: { $gt: new Date() } 
    });

    if (!session) {
      return res.status(404).json({ msg: "Invalid or expired code" });
    }

    if (session.attempts >= 3) {
        session.status = 'EXPIRED';
        await session.save();
        return res.status(429).json({ msg: "Too many failed attempts" });
    }

    session.userId = userId;
    session.status = 'CONFIRMED';
    await session.save();

    const user = await User.findById(userId).select('name avatar email');

    const io = req.app.get('io');
    if (io) {
      io.to(session.pairingId).emit('pairing_status', { 
        status: 'CONFIRMED',
        msg: 'Device paired successfully',
        user: { name: user.name, avatar: user.avatar } 
      });
    }

    res.json({ success: true, msg: "Device paired successfully" });
  } catch (err) {
    console.error("Confirm Pairing Error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
};

// 3. Web: Check Status & Get Tokens
exports.checkPairingStatus = async (req, res) => {
  const { pairingId } = req.body;

  try {
    const session = await PairingSession.findOne({ pairingId });

    if (!session) return res.status(404).json({ msg: "Session not found" });

    if (session.status === 'EXPIRED' || new Date() > session.expiresAt) {
      return res.status(400).json({ msg: "Code expired" });
    }

    if (session.status === 'USED') {
       return res.status(400).json({ msg: "Code already used" });
    }

    if (session.status === 'WAITING') {
      return res.status(202).json({ status: 'WAITING' });
    }

    if (session.status === 'CONFIRMED' && session.userId) {
      // [FIX] Generates the 1-Day Token
      const { accessToken, refreshToken } = generateTokens(session.userId);
      const user = await User.findById(session.userId).select('-password');

      session.status = 'USED';
      await session.save();

      await User.findByIdAndUpdate(session.userId, { refreshToken });

      return res.json({
        success: true,
        token: accessToken,
        refreshToken,
        user
      });
    }

    res.status(400).json({ msg: "Invalid state" });
  } catch (err) {
    console.error("Check Pairing Error:", err);
    res.status(500).json({ msg: "Server Error" });
  }
};