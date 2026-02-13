// ChatBackend/controllers/chatController.js
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const { deleteFromCloudinary } = require('../utils/cloudinaryHelper');
const { decryptMessage } = require('../utils/encryption');
const CHAT_USER_SAFE_FIELDS = '-password -blockedUsers -refreshToken -email -createdAt -updatedAt';

// Get Metadata for a specific DM
exports.getChatDetails = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('participants', CHAT_USER_SAFE_FIELDS)
      .populate('admins', CHAT_USER_SAFE_FIELDS)
      .populate('lastMessage');
    
    if (!chat) return res.status(404).json({ msg: "Chat not found" });
    res.json(chat);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Create or fetch 1-on-1 Chat
exports.accessChat = async (req, res) => {
  const { userId } = req.body;
  let chat = await Chat.findOne({
    isGroup: false,
    participants: { $all: [req.user.id, userId] }
  }).populate('participants', '-password').populate('lastMessage');

  if (chat) {
    res.json(chat);
  } else {
    const newChat = new Chat({ isGroup: false, participants: [req.user.id, userId] });
    const savedChat = await newChat.save();
    const fullChat = await Chat.findById(savedChat._id).populate('participants', '-password');
    res.status(200).json(fullChat);
  }
};

// Create Group
exports.createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;
    let rawIds = req.body.participantIds || req.body['participantIds[]'];
    let participants = [];

    if (rawIds) {
      if (Array.isArray(rawIds)) {
        participants = rawIds;
      } else if (typeof rawIds === 'string') {
        if (rawIds.trim().startsWith('[')) {
           try { participants = JSON.parse(rawIds); } catch(e) { participants = [rawIds]; }
        } else {
           participants = [rawIds];
        }
      }
    }

    if (!participants.includes(req.user.id)) {
      participants.push(req.user.id);
    }

    const groupData = {
      isGroup: true,
      groupName: name,
      description: description || "",
      participants: participants,
      admins: [req.user.id]
    };

    if (req.file && req.file.path) {
      groupData.groupIcon = req.file.path;
    }

    const groupChat = new Chat(groupData);
    const savedGroup = await groupChat.save();
    
    const fullGroup = await Chat.findById(savedGroup._id)
      .populate('participants', '-password')
      .populate('admins', '-password');

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      fullGroup.participants.forEach(p => {
        // Notify each participant individually
        io.to(p._id.toString()).emit('new_group_added', fullGroup);
      });
    }

    res.status(200).json(fullGroup);
  } catch (err) {
    console.error("Create Group Error Details:", err);
    res.status(400).send(err.message || "Failed to create group");
  }
};

// Soft Delete (Individual Clear)
exports.deleteChatHistory = async (req, res) => {
  try {
    await Chat.findByIdAndUpdate(req.params.chatId, { $pull: { userSettings: { user: req.user.id } } });
    await Chat.findByIdAndUpdate(req.params.chatId, { $push: { userSettings: { user: req.user.id, deletedAt: new Date() } } });
    res.json({ msg: "Chat cleared successfully" });
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Set Wallpaper
exports.setWallpaper = async (req, res) => {
  const { wallpaper } = req.body;
  try {
    const updated = await Chat.updateOne(
      { _id: req.params.chatId, "userSettings.user": req.user.id },
      { $set: { "userSettings.$.wallpaper": wallpaper } }
    );
    if (updated.modifiedCount === 0) {
       await Chat.findByIdAndUpdate(req.params.chatId, { $push: { userSettings: { user: req.user.id, wallpaper: wallpaper } } });
    }
    res.json({ msg: "Wallpaper updated" });
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Add to Group
exports.addToGroup = async (req, res) => {
  let { participantIds } = req.body;
  const chatId = req.params.groupId || req.body.chatId;

  if (!Array.isArray(participantIds)) {
     participantIds = participantIds ? [participantIds] : [];
  }

  if (participantIds.length === 0) return res.status(400).json({ msg: "No participants provided" });

  try {
    const added = await Chat.findByIdAndUpdate(
      chatId, 
      { $addToSet: { participants: { $each: participantIds } } }, 
      { new: true }
    )
    .populate("participants", "-password")
      .populate("participants", "-password")
    .populate("admins", "-password");

    if (!added) return res.status(404).json({ msg: "Chat Not Found" });

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      // 1. Notify existing group members of the update (participant list change)
      io.to(chatId).emit('group_updated', added);

      // 2. Notify ONLY the new participants that they were added
      participantIds.forEach(newUserId => {
        io.to(newUserId.toString()).emit('added_to_group', added);
      });
    }

    res.json(added);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Remove from Group
exports.removeFromGroup = async (req, res) => {
  let { participantIds } = req.body;
  const chatId = req.params.groupId || req.body.chatId;

  if (!Array.isArray(participantIds)) {
     participantIds = participantIds ? [participantIds] : [];
  }

  if (participantIds.length === 0) return res.status(400).json({ msg: "No participants provided" });

  try {
    const removed = await Chat.findByIdAndUpdate(
      chatId, 
      { $pull: { participants: { $in: participantIds }, admins: { $in: participantIds } } }, 
      { new: true }
    )
    .populate("participants", "-password")
      .populate("participants", "-password")
    .populate("admins", "-password");

    if (!removed) return res.status(404).json({ msg: "Chat Not Found" });

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      // 1. Notify remaining group members
      io.to(chatId).emit('group_updated', removed);

      // 2. Notify removed user(s)
      participantIds.forEach(removedUserId => {
        io.to(removedUserId.toString()).emit('removed_from_group', { chatId, groupName: removed.groupName });
      });
    }

    res.json(removed);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Update Group Info
exports.updateGroupInfo = async (req, res) => {
  const { groupName, description, groupIcon } = req.body;
  try {
      const currentGroup = await Chat.findById(req.params.groupId);
      if(!currentGroup) return res.status(404).json({msg: "Group not found"});

      const updateData = {};
      if (groupName) updateData.groupName = groupName;
      if (description) updateData.description = description;

      if (req.file && req.file.path) {
        if (currentGroup.groupIcon && currentGroup.groupIcon.includes('cloudinary')) {
            await deleteFromCloudinary(currentGroup.groupIcon);
        }
        updateData.groupIcon = req.file.path;
      } 
      else if (groupIcon === "") {
         if (currentGroup.groupIcon) await deleteFromCloudinary(currentGroup.groupIcon);
         updateData.groupIcon = "";
      }

      const updatedChat = await Chat.findByIdAndUpdate(req.params.groupId, updateData, { new: true })
        .populate('participants', '-password')
        .populate('admins', '-password');

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.groupId).emit('group_updated', updatedChat);
    }

      res.json(updatedChat);
  } catch (err) {
      res.status(400).send(err.message);
  }
};

// Leave Group
exports.leaveGroup = async (req, res) => {
  try {
    // [FIX] We need to fetch the chat *after* update to broadcast the new participant list
    const updatedChat = await Chat.findById(req.params.groupId)
      .populate('participants', '-password')
      .populate('admins', '-password');

    const user = await User.findById(req.user.id);
    await Message.create({
      chat: req.params.groupId,
      content: `${user.name} left the group`,
      type: "text",
      sender: req.user.id
    });

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.groupId).emit('group_updated', updatedChat);
      io.to(req.params.groupId).emit('user_left_group', { chatId: req.params.groupId, userId: req.user.id, name: user.name });
    }

    res.json({ msg: "You left the group" });
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Toggle Admin
exports.toggleAdmin = async (req, res) => {
  const { userId } = req.body;
  const chatId = req.params.groupId; 
  try {
    const chat = await Chat.findById(chatId);
    if (!chat.isGroup) return res.status(400).json({ msg: "Not a group chat" });
    
    let updateQuery;
    if (chat.admins.includes(userId)) {
      updateQuery = { $pull: { admins: userId } };
    } else {
      updateQuery = { $addToSet: { admins: userId } };
    }

    const updatedChat = await Chat.findByIdAndUpdate(chatId, updateQuery, { new: true })
      .populate('participants', '-password')
      .populate('admins', '-password');

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(chatId).emit('group_updated', updatedChat);
    }

    res.json(updatedChat);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// [FIXED] Toggle Permissions with Live Socket Event
exports.togglePermissions = async (req, res) => {
  const { permission, enabled } = req.body; 
  const chatId = req.params.groupId;
  
  try {
    const updateQuery = {};
    updateQuery[`permissions.${permission}`] = enabled;

    const chat = await Chat.findByIdAndUpdate(chatId, { $set: updateQuery }, { new: true })
      .populate('participants', '-password')
      .populate('admins', '-password');

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(chatId).emit('group_permissions_updated', chat);
    }

    res.json(chat);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

exports.getChatMedia = async (req, res) => {
  try {
    const messages = await Message.find({ 
      chat: req.params.chatId, 
      type: { $in: ['image', 'video', 'file', 'voice'] },
      isDeleted: false
    }).select('fileUrl type createdAt sender').sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Fetch All Chats
exports.fetchChats = async (req, res) => {
  try {
    const chats = await Chat.find({ participants: { $elemMatch: { $eq: req.user.id } } })
      .populate('participants', CHAT_USER_SAFE_FIELDS)
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    const chatsWithCounts = await Promise.all(chats.map(async (chat) => {
      const chatObj = chat.toObject();
      const userSetting = chatObj.userSettings?.find(s => s.user.toString() === req.user.id);

      if (userSetting && userSetting.deletedAt) {
        if (chatObj.lastMessage && new Date(chatObj.lastMessage.createdAt) < new Date(userSetting.deletedAt)){
            chatObj.lastMessage = { content: "Deleted..." };
        }
      }

      if (chatObj.lastMessage && chatObj.lastMessage.content && chatObj.lastMessage.content !== "Deleted...") {
        try {
           chatObj.lastMessage.content = decryptMessage(chatObj.lastMessage.content);
        } catch (e) {}
      }

      delete chatObj.createdAt;
      delete chatObj.updatedAt;

      // Count unread messages
      const unreadCount = await Message.countDocuments({
        chat: chat._id,
        sender: { $ne: req.user.id },
        isDeleted: false,
        readBy: { $ne: req.user.id }
      });
      chatObj.unreadCount = unreadCount;

      return chatObj;
    }));

    res.json(chatsWithCounts);
  } catch (err) {
    res.status(500).send("Error fetching chats");
  }
};

// Request Delete
exports.requestDeleteChat = async (req, res) => {
  const { chatId } = req.body;
  const userId = req.user.id;
  try {
    const chat = await Chat.findById(chatId).populate("participants", "name");
    if (!chat) return res.status(404).json({ msg: "Chat not found" });
    const otherUser = chat.participants.find(p => p._id.toString() !== userId);
    if (!otherUser) return res.status(400).json({ msg: "No participant found" });
    const io = req.app.get('io');
    if (io) {
        io.to(otherUser._id.toString()).emit('delete_chat_request', {
            chatId,
            requesterName: req.user.name,
            requesterId: userId
        });
    }
    res.json({ msg: "Request sent" });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

// Respond Delete
exports.respondDeleteChat = async (req, res) => {
  const { chatId, accept, requesterId } = req.body;
  const userId = req.user.id; 
  try {
    const io = req.app.get('io');
    if (accept) {
      await Message.deleteMany({ chat: chatId });
      if (io) {
          io.to(userId).emit('chat_history_cleared', { chatId });
          io.to(requesterId).emit('chat_history_cleared', { chatId });
          io.to(chatId).emit('chat_history_cleared', { chatId });
      }
      res.json({ msg: "Chat history deleted" });
    } else {
      if (io) {
          io.to(requesterId).emit('delete_chat_rejected', { chatId });
      }
      res.json({ msg: "Request rejected" });
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
};
