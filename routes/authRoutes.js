const express = require('express');
const router = express.Router();
const { login, register, refreshToken } = require('../controllers/authController');
const upload = require('../middleware/uploadMiddleware'); // Import the upload middleware

// [FIX] Add upload.single('avatar') to parse multipart/form-data
router.post('/register', upload.single('avatar'), register);

router.post('/login', login);
router.post('/refresh-token', refreshToken);

module.exports = router;