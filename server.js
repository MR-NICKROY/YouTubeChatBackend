require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const User = require('./models/User');
// [NEW] Import Cleanup Function
const { cleanupExpiredStatuses } = require('./controllers/statusController');
// Routes
const groupRoutes = require('./routes/groupRoutes');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const userRoutes = require('./routes/userRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const statusRoutes = require('./routes/statusRoutes');

const app = express();
const server = http.createServer(app);

/* ====================== SOCKET CONFIG ====================== */
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});
app.set('io', io);
/* ====================== DB ====================== */
connectDB();
setInterval(() => {
  cleanupExpiredStatuses();
}, 60 * 1000);
/* ====================== MIDDLEWARE ====================== */
app.use(helmet());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

/* ====================== ROUTES ====================== */
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/status', statusRoutes);

/* ====================== PRESENCE STATE ====================== */
const onlineUsers = new Map();

/* ====================== SOCKET HELPERS ====================== */
const getOnlineUserIds = () => Array.from(onlineUsers.keys());

const markUserOnline = (userId, socketId) => {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, { sockets: new Set(), lastSeen: null });
  }
  onlineUsers.get(userId).sockets.add(socketId);
};

const markUserOfflineIfNoSockets = async (userId) => {
  const user = onlineUsers.get(userId);
  if (!user || user.sockets.size > 0) return;

  const lastSeen = new Date();
  onlineUsers.delete(userId);

  io.emit('status_change', {
    user_id: userId,
    status: 'offline',
    last_seen: lastSeen,
  });

  try {
    await User.findByIdAndUpdate(userId, { lastSeen });
  } catch (err) {
    console.error('Error updating lastSeen:', err);
  }
};


/* ====================== SOCKET LOGIC ====================== */
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  /* ---------- SETUP ---------- */
  socket.on('setup', (userData) => {
    try {
      const userId = userData?._id || userData?.id;
      if (!userId) return;

      socket.userId = userId;
      socket.join(userId);

      markUserOnline(userId, socket.id);

      // Sync presence
      socket.emit('online_users', getOnlineUserIds());

      // Notify others
      socket.broadcast.emit('status_change', {
        user_id: userId,
        status: 'online',
      });

      console.log(`User ${userId} online`);
    } catch (err) {
      console.error('Setup error:', err);
    }
  });

  /* ---------- JOIN CHAT ---------- */
  socket.on('join_chat', (roomId) => {
    if (roomId) socket.join(roomId);
  });

  /* ---------- NEW MESSAGE ---------- */
  socket.on('new_message', (msg) => {
    try {
      const chat = msg.chat;
      if (!chat?.participants) return;

      chat.participants.forEach((user) => {
        if (user._id === msg.sender._id) return;
        socket.to(user._id.toString()).emit('message_received', msg);
      });
    } catch (err) {
      console.error('new_message error:', err);
    }
  });

  /* ---------- REACTION UPDATES ---------- */
  socket.on('reaction_changed', (data) => {
    const { chatId } = data;
    if (chatId) {
      socket.to(chatId).emit('reaction_updated', data);
    }
  });

  /* ---------- TYPING ---------- */
  socket.on('typing', (room) => {
    socket.to(room).emit('typing', {
      chatId: room,
      userId: socket.userId,
    });
  });

  socket.on('stop_typing', (room) => {
    socket.to(room).emit('stop_typing', {
      chatId: room,
      userId: socket.userId,
    });
  });

  /* ---------- MESSAGE EDITED ---------- */
  socket.on('message_edited', ({ messageId, content, chatId }) => {
    socket.to(chatId).emit('message_edited', { 
      messageId, 
      content, // Send the encrypted/text content
      isEdited: true 
    });
  });

  /* ---------- MESSAGE DELETED (FIXED) ---------- */
  // Removed the React 'setMessages' code that was crashing the server
  socket.on('message_deleted_everyone', ({ messageId, chatId }) => {
    socket.to(chatId).emit('message_deleted_everyone', { messageId });
  });

  /* ---------- MESSAGE READ (NEW) ---------- */
  // Broadcasts when a user reads a message so others see blue ticks
  socket.on('message_read', ({ messageId, chatId, userId }) => {
    socket.to(chatId).emit('message_read', { messageId, userId });
  });

  /* ---------- MANUAL OFFLINE ---------- */
  socket.on('go_offline', async () => {
    const userId = socket.userId;
    if (!userId || !onlineUsers.has(userId)) return;

    const entry = onlineUsers.get(userId);
    entry.sockets.delete(socket.id);

    await markUserOfflineIfNoSockets(userId);
  });

  /* ---------- MANUAL ONLINE ---------- */
  socket.on('go_online', () => {
    const userId = socket.userId;
    if (!userId) return;

    markUserOnline(userId, socket.id);

    socket.broadcast.emit('status_change', {
      user_id: userId,
      status: 'online',
    });
  });

  /* ---------- DISCONNECT ---------- */
  socket.on('disconnect', async (reason) => {
    try {
      const userId = socket.userId;
      if (!userId || !onlineUsers.has(userId)) return;

      const entry = onlineUsers.get(userId);
      entry.sockets.delete(socket.id);

      await markUserOfflineIfNoSockets(userId);
      console.log(`Socket ${socket.id} disconnected (${reason})`);
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  });
});

/* ====================== SERVER ====================== */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});