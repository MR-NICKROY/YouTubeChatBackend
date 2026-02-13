require('dotenv').config();
const express = require('express');
const http = require('http');
const wsLib = require('ws');
const { WebSocketServer } = wsLib;
const { randomUUID } = require('crypto');
const connectDB = require('./config/db');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const User = require('./models/User');
const { cleanupExpiredStatuses } = require('./controllers/statusController');

// Routes
const groupRoutes = require('./routes/groupRoutes');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const userRoutes = require('./routes/userRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const statusRoutes = require('./routes/statusRoutes');
const pairingRoutes = require('./routes/pairingRoutes');

const app = express();
const server = http.createServer(app);

/* ====================== WEBSOCKET CONFIG ====================== */
const wss = new WebSocketServer({ server });
const roomMembers = new Map();

const parseMessage = (raw) => {
  try {
    return JSON.parse(raw.toString());
  } catch (err) {
    return null;
  }
};

const normalizeId = (value) => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'object') {
    const nestedId =
      value._id ??
      value.id ??
      value.chatId ??
      value.roomId ??
      value.userId ??
      value.pairingId;

    if (nestedId !== undefined && nestedId !== null) {
      return normalizeId(nestedId);
    }

    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
      const asString = value.toString();
      if (asString && asString !== '[object Object]') {
        return asString;
      }
    }
  }

  return null;
};

const sendEvent = (client, event, data) => {
  if (client.readyState !== wsLib.OPEN) return;

  try {
    client.send(JSON.stringify({ event, data }));
  } catch (err) {
    console.error(`Failed to send event "${event}":`, err);
  }
};

const joinRoom = (client, roomId) => {
  const roomKey = normalizeId(roomId);
  if (!roomKey) return;

  if (!roomMembers.has(roomKey)) {
    roomMembers.set(roomKey, new Set());
  }

  roomMembers.get(roomKey).add(client);
  client.rooms.add(roomKey);
};

const leaveRoom = (client, roomId) => {
  const roomKey = normalizeId(roomId);
  if (!roomKey || !roomMembers.has(roomKey)) return;

  const members = roomMembers.get(roomKey);
  members.delete(client);

  if (members.size === 0) {
    roomMembers.delete(roomKey);
  }

  client.rooms.delete(roomKey);
};

const leaveAllRooms = (client) => {
  Array.from(client.rooms).forEach((roomId) => leaveRoom(client, roomId));
};

const broadcastAll = (event, data, excludeClient = null) => {
  wss.clients.forEach((client) => {
    if (excludeClient && client === excludeClient) return;
    sendEvent(client, event, data);
  });
};

const broadcastRoom = (roomId, event, data, excludeClient = null) => {
  const roomKey = normalizeId(roomId);
  if (!roomKey) return;

  const members = roomMembers.get(roomKey);
  if (!members) return;

  members.forEach((client) => {
    if (excludeClient && client === excludeClient) return;
    sendEvent(client, event, data);
  });
};

const io = {
  emit(event, data) {
    broadcastAll(event, data);
  },
  to(roomId) {
    return {
      emit(event, data) {
        broadcastRoom(roomId, event, data);
      },
    };
  },
};

app.set('io', io);

/* ====================== DB ====================== */
connectDB();
setInterval(() => {
  cleanupExpiredStatuses(io);
}, 60 * 1000);

/* ====================== MIDDLEWARE ====================== */
app.use(helmet());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
// [NEW] Serve static files from userIcon folder
app.use('/userIcon', express.static('userIcon'));

/* ====================== ROUTES ====================== */
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/pairing', pairingRoutes);

/* ====================== PRESENCE STATE ====================== */
const onlineUsers = new Map();

/* ====================== WEBSOCKET HELPERS ====================== */
const getOnlineUserIds = () => Array.from(onlineUsers.keys());

const markUserOnline = (userId, connectionId) => {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;

  if (!onlineUsers.has(normalizedUserId)) {
    onlineUsers.set(normalizedUserId, { sockets: new Set(), lastSeen: null });
  }

  onlineUsers.get(normalizedUserId).sockets.add(connectionId);
};

const markUserOfflineIfNoSockets = async (userId) => {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return;

  const user = onlineUsers.get(normalizedUserId);
  if (!user || user.sockets.size > 0) return;

  const lastSeen = new Date();
  onlineUsers.delete(normalizedUserId);

  io.emit('status_change', {
    user_id: normalizedUserId,
    status: 'offline',
    last_seen: lastSeen,
  });

  try {
    await User.findByIdAndUpdate(normalizedUserId, { lastSeen });
  } catch (err) {
    console.error('Error updating lastSeen:', err);
  }
};

/* ====================== WEBSOCKET LOGIC ====================== */
wss.on('connection', (socket) => {
  socket.connectionId = randomUUID();
  socket.userId = null;
  socket.rooms = new Set();
  socket.isAlive = true;

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  console.log('WebSocket connected:', socket.connectionId);

  socket.on('message', async (rawMessage) => {
    const payload = parseMessage(rawMessage);
    if (!payload?.event) return;

    const event = payload.event;
    const data = payload.data;

    try {
      if (event === 'setup') {
        const userId = normalizeId(data?._id || data?.id);
        if (!userId) return;

        socket.userId = userId;
        joinRoom(socket, userId);

        markUserOnline(userId, socket.connectionId);

        sendEvent(socket, 'online_users', getOnlineUserIds());

        broadcastAll(
          'status_change',
          {
            user_id: userId,
            status: 'online',
          },
          socket
        );

        console.log(`User ${userId} online`);
        return;
      }

      if (event === 'join_chat') {
        const roomId = normalizeId(data?.chatId || data?.roomId || data);
        if (roomId) joinRoom(socket, roomId);
        return;
      }

      if (event === 'new_message') {
        const chat = data?.chat;
        const senderId = normalizeId(data?.sender?._id || data?.sender?.id);
        if (!chat?.participants || !senderId) return;

        chat.participants.forEach((user) => {
          const participantId = normalizeId(user?._id || user?.id || user);
          if (!participantId || participantId === senderId) return;
          broadcastRoom(participantId, 'message_received', data);
        });
        return;
      }

      if (event === 'reaction_changed') {
        const chatId = normalizeId(data?.chatId || data);
        if (chatId) {
          broadcastRoom(chatId, 'reaction_updated', data, socket);
        }
        return;
      }

      if (event === 'typing') {
        const room = normalizeId(data?.chatId || data?.roomId || data);
        if (room) {
          const participants = data?.participants;
          if (Array.isArray(participants) && participants.length > 0) {
            // If participants provided, broadcast to them directly (User Rooms)
            participants.forEach(p => {
              const pId = normalizeId(p._id || p.id || p);
              if (pId && pId !== socket.userId) {
                broadcastRoom(pId, 'typing', { chatId: room, userId: socket.userId }, socket);
              }
            });
          } else {
            // Fallback to Chat Room broadcast
            broadcastRoom(
              room,
              'typing',
              {
                chatId: room,
                userId: socket.userId,
              },
              socket
            );
          }
        }
        return;
      }

      if (event === 'stop_typing') {
        const room = normalizeId(data?.chatId || data?.roomId || data);
        if (room) {
          const participants = data?.participants;
          if (Array.isArray(participants) && participants.length > 0) {
            participants.forEach(p => {
              const pId = normalizeId(p._id || p.id || p);
              if (pId && pId !== socket.userId) {
                broadcastRoom(pId, 'stop_typing', { chatId: room, userId: socket.userId }, socket);
              }
            });
          } else {
            broadcastRoom(
              room,
              'stop_typing',
              {
                chatId: room,
                userId: socket.userId,
              },
              socket
            );
          }
        }
        return;
      }

      if (event === 'message_edited') {
        const chatId = normalizeId(data?.chatId || data);
        if (!chatId) return;

        broadcastRoom(
          chatId,
          'message_edited',
          {
            messageId: data?.messageId,
            content: data?.content,
            isEdited: true,
          },
          socket
        );
        return;
      }

      if (event === 'message_deleted_everyone') {
        const chatId = normalizeId(data?.chatId || data);
        if (!chatId) return;

        broadcastRoom(
          chatId,
          'message_deleted_everyone',
          { messageId: data?.messageId },
          socket
        );
        return;
      }

      if (event === 'message_read') {
        const chatId = normalizeId(data?.chatId || data);
        if (!chatId) return;

        broadcastRoom(
          chatId,
          'message_read',
          {
            messageId: data?.messageId,
            userId: normalizeId(data?.userId),
          },
          socket
        );
        return;
      }

      if (event === 'go_offline') {
        const userId = socket.userId;
        if (!userId || !onlineUsers.has(userId)) return;

        const entry = onlineUsers.get(userId);
        entry.sockets.delete(socket.connectionId);

        await markUserOfflineIfNoSockets(userId);
        return;
      }

      if (event === 'go_online') {
        const userId = socket.userId;
        if (!userId) return;

        markUserOnline(userId, socket.connectionId);

        broadcastAll(
          'status_change',
          {
            user_id: userId,
            status: 'online',
          },
          socket
        );
        return;
      }

      /* ====================== WEBRTC SIGNALING ====================== */
      if (event === 'call_user') {
        const { userToCall, signalData, from, callType, callerInfo } = data;
        const targetId = normalizeId(userToCall);
        if (targetId) {
          console.log(`Calling user ${targetId} from ${from}`);
          broadcastRoom(targetId, 'call_made', { signal: signalData, from, callType, callerInfo });
        }
        return;
      }

      if (event === 'make_answer') {
        const { signalData, to } = data;
        const targetId = normalizeId(to);
        if (targetId) {
          console.log(`Answering call to ${targetId}`);
          broadcastRoom(targetId, 'answer_made', { signal: signalData, from: socket.userId });
        }
        return;
      }

      if (event === 'ice_candidate') {
        const { candidate, to } = data;
        const targetId = normalizeId(to);
        if (targetId) {
          broadcastRoom(targetId, 'ice_candidate', { candidate, from: socket.userId });
        }
        return;
      }

      if (event === 'reject_call') {
        const { to } = data;
        const targetId = normalizeId(to);
        if (targetId) {
          broadcastRoom(targetId, 'call_rejected', { from: socket.userId });
        }
        return;
      }

      if (event === 'end_call') {
        const { to } = data;
        const targetId = normalizeId(to);
        if (targetId) {
          broadcastRoom(targetId, 'call_ended', { from: socket.userId });
        }
        return;
      }
    } catch (err) {
      console.error(`WebSocket event "${event}" failed:`, err);
    }
  });

  socket.on('close', async (code, reason) => {
    try {
      const userId = socket.userId;
      if (userId && onlineUsers.has(userId)) {
        const entry = onlineUsers.get(userId);
        entry.sockets.delete(socket.connectionId);
        await markUserOfflineIfNoSockets(userId);
      }

      leaveAllRooms(socket);
      console.log(`WebSocket ${socket.connectionId} disconnected (${code}:${reason.toString()})`);
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  });

  socket.on('error', (err) => {
    console.error(`WebSocket ${socket.connectionId} error:`, err);
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    if (!client.isAlive) {
      return client.terminate();
    }

    client.isAlive = false;
    client.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

/* ====================== SERVER ====================== */

/* ====================== WEBSOCKET SIGNALING HELPERS ====================== */
const sendToUser = (userId, event, data, excludeSocket = null) => {
  const normalizedId = normalizeId(userId);
  if (!normalizedId || !onlineUsers.has(normalizedId)) return;

  const userEntry = onlineUsers.get(normalizedId);
  if (!userEntry || !userEntry.sockets) return;

  wss.clients.forEach((client) => {
    if (
      client.readyState === wsLib.OPEN &&
      userEntry.sockets.has(client.connectionId) &&
      client !== excludeSocket
    ) {
      sendEvent(client, event, data);
    }
  });
};

/* ====================== SERVER ====================== */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
