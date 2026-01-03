require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const groupRoutes = require('./routes/groupRoutes');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const userRoutes = require('./routes/userRoutes');
const mediaRoutes = require('./routes/mediaRoutes');

// App Config
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

connectDB();

app.use(helmet());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/media', mediaRoutes);

// Socket Logic
const userStatusMap = new Map(); // Stores: userId -> { status, lastSeen, socketId }

io.on('connection', (socket) => {
  console.log('Connected to socket.io:', socket.id);

  // User Setup & Status = Online
  socket.on('setup', (userData) => {
    socket.join(userData.id);
    // FIX: Store socket.id to identify who disconnects later
    userStatusMap.set(userData.id, { 
      status: 'online', 
      lastSeen: new Date(), 
      socketId: socket.id 
    });
    
    io.emit('status_change', { user_id: userData.id, status: 'online' });
    socket.emit('connected');
  });

  socket.on('join_chat', (room) => {
    socket.join(room);
    console.log('User Joined Room: ' + room);
  });

  socket.on('new_message', (newMessageRecieved) => {
    let chat = newMessageRecieved.chat;
    if (!chat.participants) return console.log('Chat.participants not defined');

    chat.participants.forEach((user) => {
      if (user._id == newMessageRecieved.sender._id) return;
     socket.in(String(user._id)).emit('message_received', newMessageRecieved);
    });
  });
  
  // Handle Status Requests
  socket.on('get_user_status', ({ target_user_id }) => {
    const status = userStatusMap.get(target_user_id) || { status: 'offline', lastSeen: null };
    socket.emit('receive_user_status', status);
  });

  socket.on('disconnect', () => {
    // FIX: Find the specific user who owns this socket.id
    for (let [userId, data] of userStatusMap.entries()) {
      if (data.socketId === socket.id) {
        userStatusMap.set(userId, { status: 'offline', lastSeen: new Date(), socketId: null });
        io.emit('status_change', { user_id: userId, status: 'offline', last_seen: new Date() });
        console.log(`User ${userId} disconnected`);
        break; // Stop loop once found
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});