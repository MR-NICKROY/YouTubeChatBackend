const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');

// [NEW] Get Metadata for a specific DM
exports.getChatDetails = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('participants', '-password')
      .populate('admins', '-password')
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
  const { name, users } = req.body;
  const participants = typeof users === 'string' ? JSON.parse(users) : users;
  participants.push(req.user.id);

  const groupChat = new Chat({
    isGroup: true,
    groupName: name,
    participants: participants,
    admins: [req.user.id]
  });

  const savedGroup = await groupChat.save();
  const fullGroup = await Chat.findById(savedGroup._id).populate('participants', '-password');
  res.status(200).json(fullGroup);
};

// Fetch all chats

// Soft Delete
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

// Groups: Add Participants
exports.addToGroup = async (req, res) => {
  const { userId } = req.body;
  // [UPDATED] Check req.params.groupId first (from URL), then req.body.chatId
  const chatId = req.params.groupId || req.body.chatId;

  const added = await Chat.findByIdAndUpdate(chatId, { $addToSet: { participants: userId } }, { new: true })
    .populate("participants", "-password").populate("admins", "-password");

  if (!added) return res.status(404).json({ msg: "Chat Not Found" });
  res.json(added);
};

// Groups: Remove Participant
exports.removeFromGroup = async (req, res) => {
  const { userId } = req.body;
  // [UPDATED] Check req.params.groupId first (from URL), then req.body.chatId
  const chatId = req.params.groupId || req.body.chatId;

  const removed = await Chat.findByIdAndUpdate(chatId, { $pull: { participants: userId, admins: userId } }, { new: true })
    .populate("participants", "-password").populate("admins", "-password");

  if (!removed) return res.status(404).json({ msg: "Chat Not Found" });
  res.json(removed);
};

// Groups: Edit Info
exports.updateGroupInfo = async (req, res) => {
  const { groupName, description, groupIcon } = req.body;
  const updateData = {};
  if (groupName) updateData.groupName = groupName;
  if (description) updateData.description = description;
  if (req.file && req.file.path) updateData.groupIcon = req.file.path;
  else if (groupIcon) updateData.groupIcon = groupIcon;

  const updatedChat = await Chat.findByIdAndUpdate(req.params.groupId, updateData, { new: true });
  res.json(updatedChat);
};

// Groups: Leave Group
exports.leaveGroup = async (req, res) => {
  try {
    await Chat.findByIdAndUpdate(req.params.groupId, { $pull: { participants: req.user.id, admins: req.user.id } });
    const user = await User.findById(req.user.id);
    await Message.create({
      chat: req.params.groupId,
      content: `${user.username} left the group`,
      type: "text",
      sender: req.user.id
    });
    res.json({ msg: "You left the group" });
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Toggle Admin
exports.toggleAdmin = async (req, res) => {
  const { userId } = req.body;
  const chatId = req.params.groupId; // From URL
  try {
    const chat = await Chat.findById(chatId);
    if (!chat.isGroup) return res.status(400).json({ msg: "Not a group chat" });
    if (chat.admins.includes(userId)) {
      await Chat.findByIdAndUpdate(chatId, { $pull: { admins: userId } });
      res.json({ msg: "User demoted" });
    } else {
      await Chat.findByIdAndUpdate(chatId, { $addToSet: { admins: userId } });
      res.json({ msg: "User promoted to Admin" });
    }
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Toggle Permissions
exports.togglePermissions = async (req, res) => {
  const { permissions } = req.body;
  const chatId = req.params.groupId; // From URL
  try {
    const chat = await Chat.findByIdAndUpdate(chatId, { $set: { permissions: permissions } }, { new: true });
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
// [UPDATED] Fetch all chats with "Deleted..." logic
exports.fetchChats = async (req, res) => {
  try {
    let chats = await Chat.find({ participants: { $elemMatch: { $eq: req.user.id } } })
      .populate('participants', '-password')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    // Process chats to handle "Soft Delete" preview
    chats = chats.map(chat => {
      const chatObj = chat.toObject();
      const userSetting = chatObj.userSettings?.find(s => s.user.toString() === req.user.id);

      if (userSetting && userSetting.deletedAt) {
        // If last message is older than deletedAt time, show "Deleted..." or hide it
if (chatObj.lastMessage && new Date(chatObj.lastMessage.createdAt) < new Date(userSetting.deletedAt)){
            chatObj.lastMessage = { content: "Deleted..." }; // Replaces preview
        }
      }
      return chatObj;
    });

    res.json(chats);
  } catch (err) {
    res.status(500).send("Error fetching chats");
  }
};

// exports.getChatDetails = require('./chatController').getChatDetails;
// exports.accessChat = require('./chatController').accessChat;
// exports.createGroup = require('./chatController').createGroup;
// exports.deleteChatHistory = require('./chatController').deleteChatHistory;
// exports.setWallpaper = require('./chatController').setWallpaper;
// exports.addToGroup = require('./chatController').addToGroup;
// exports.removeFromGroup = require('./chatController').removeFromGroup;
// exports.updateGroupInfo = require('./chatController').updateGroupInfo;
// exports.leaveGroup = require('./chatController').leaveGroup;
// exports.toggleAdmin = require('./chatController').toggleAdmin;
// exports.togglePermissions = require('./chatController').togglePermissions;
// exports.getChatMedia = require('./chatController').getChatMedia;
// exports.fetchChats = require('./chatController').fetchChats;