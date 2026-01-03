const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { encryptMessage, decryptMessage } = require('../utils/encryption');

// Helper: Deep Decrypt
const decryptAndFormat = (msg) => {
  if (!msg) return null;
  const msgObj = msg.toObject ? msg.toObject() : msg;
  if (msgObj.content) {
    try { msgObj.content = decryptMessage(msgObj.content); } catch (e) {}
  }
  if (msgObj.replyTo && msgObj.replyTo.content) {
    try { msgObj.replyTo.content = decryptMessage(msgObj.replyTo.content); } catch (e) {}
  }
  return msgObj;
};

// Send Message
exports.sendMessage = async (req, res) => {
  // [UPDATED] Check req.params.chatId (for POST /chats/:chatId/messages)
  const chatId = req.body.chatId || req.params.chatId;
  const { content, type, fileUrl, replyTo, waveform } = req.body;

  try {
    const encryptedContent = content ? encryptMessage(content) : "";
    const finalFileUrl = fileUrl || (req.file ? req.file.path : "");
    let newMessage = {
      sender: req.user.id,
      content: encryptedContent,
      chat: chatId,
      type: type || 'text',
     fileUrl: finalFileUrl,
      replyTo: replyTo || null,
      waveform: waveform || [],
      readBy: [req.user.id] 
    };
    let message = await Message.create(newMessage);
    message = await message.populate('sender', 'username avatar');
   message = await message.populate({
      path: 'chat',
      populate: {
        path: 'participants',
        select: 'username avatar email'
      }
    });
    message = await message.populate('replyTo');
    
    await Chat.findByIdAndUpdate(chatId, { lastMessage: message });
    res.json(decryptAndFormat(message));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// [UPDATED] Fetch Messages (Pagination)
exports.allMessages = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const messages = await Message.find({ chat: req.params.chatId })
      .populate('sender', 'username avatar email')
      .populate('replyTo')
      .sort({ createdAt: -1 }) // Newest first for pagination
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Reverse back to chronological order
    const decryptedMessages = messages.map(msg => decryptAndFormat(msg)).reverse();
    res.json(decryptedMessages);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Delete Message
exports.deleteMessage = async (req, res) => {
  const { mode } = req.query; 
  try {
    if (mode === 'delete_for_everyone') {
      const msg = await Message.findByIdAndUpdate(req.params.messageId, {
        isDeleted: true,
        content: encryptMessage("This message was deleted"),
        fileUrl: ""
      }, { new: true }).populate('replyTo');
      res.json(decryptAndFormat(msg));
    } else {
      await Message.findByIdAndUpdate(req.params.messageId, {
        $addToSet: { deletedFor: req.user.id }
      });
      res.json({ msg: "Message deleted for me" });
    }
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Edit Message
exports.editMessage = async (req, res) => {
  const { content } = req.body;
  try {
    const encrypted = encryptMessage(content);
    const msg = await Message.findByIdAndUpdate(req.params.messageId, {
       content: encrypted
    }, { new: true }).populate('replyTo');
    res.json(decryptAndFormat(msg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Forward Message
exports.forwardMessage = async (req, res) => {
  const { messageId, targetChatIds } = req.body;
  try {
    const originalMsg = await Message.findById(messageId);
    const promises = targetChatIds.map(chatId => {
      return Message.create({
        sender: req.user.id,
        content: originalMsg.content, // Already encrypted
        chat: chatId,
        type: originalMsg.type,
        fileUrl: originalMsg.fileUrl,
        forwarded: true
      });
    });
    await Promise.all(promises);
    res.json({ msg: "Forwarded successfully" });
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Reactions
exports.addReaction = async (req, res) => {
  const { emoji } = req.body;
  try {
    const msg = await Message.findByIdAndUpdate(req.params.messageId, {
      $push: { reactions: { user: req.user.id, emoji } }
    }, { new: true }).populate('sender', 'username avatar').populate('replyTo');
    res.json(decryptAndFormat(msg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

exports.removeReaction = async (req, res) => {
  try {
    const msg = await Message.findByIdAndUpdate(req.params.messageId, {
      $pull: { reactions: { user: req.user.id } }
    }, { new: true }).populate('sender', 'username avatar').populate('replyTo');
    res.json(decryptAndFormat(msg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// Starred
exports.toggleStarMessage = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId);
    const isStarred = msg.starredBy.includes(req.user.id);
    let updatedMsg;
    if (isStarred) {
      updatedMsg = await Message.findByIdAndUpdate(req.params.messageId, { $pull: { starredBy: req.user.id } }, { new: true });
    } else {
      updatedMsg = await Message.findByIdAndUpdate(req.params.messageId, { $addToSet: { starredBy: req.user.id } }, { new: true });
    }
    updatedMsg = await updatedMsg.populate('sender', 'username avatar').populate('replyTo');
    res.json(decryptAndFormat(updatedMsg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

exports.getStarredMessages = async (req, res) => {
  try {
    const messages = await Message.find({ starredBy: req.user.id })
      .populate('sender', 'username avatar').populate('chat').populate('replyTo');
    const decrypted = messages.map(msg => decryptAndFormat(msg));
    res.json(decrypted);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// [NEW] Pin/Unpin
exports.pinMessage = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId);
    const updatedMsg = await Message.findByIdAndUpdate(req.params.messageId, {
      isPinned: !msg.isPinned
    }, { new: true });
    res.json(decryptAndFormat(updatedMsg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// [NEW] Mark Read
exports.markMessageRead = async (req, res) => {
  try {
    const msg = await Message.findByIdAndUpdate(req.params.messageId, {
      $addToSet: { readBy: req.user.id }
    }, { new: true }).populate('readBy', 'username avatar');
    res.json(decryptAndFormat(msg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// [NEW] Get Read Info
exports.getMessageReadInfo = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId).populate('readBy', 'username avatar lastSeen');
    res.json(msg.readBy);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// [NEW] Search in Chat (Decryption aware)
exports.searchInChat = async (req, res) => {
  const { chatId } = req.params;
  const { query } = req.query;
  if(!query) return res.json([]);
  try {
    const messages = await Message.find({ chat: chatId });
    const results = messages
      .map(msg => decryptAndFormat(msg))
      .filter(msg => msg.content && msg.content.toLowerCase().includes(query.toLowerCase()));
    res.json(results);
  } catch (err) {
    res.status(500).send(err.message);
  }
};

// [NEW] Media Gallery
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

// exports.deleteMessage = require('./messageController').deleteMessage;
// exports.editMessage = require('./messageController').editMessage;
// exports.forwardMessage = require('./messageController').forwardMessage;
// exports.addReaction = require('./messageController').addReaction;
// exports.removeReaction = require('./messageController').removeReaction;
// exports.toggleStarMessage = require('./messageController').toggleStarMessage;
// exports.getStarredMessages = require('./messageController').getStarredMessages;
// exports.pinMessage = require('./messageController').pinMessage;
// exports.markMessageRead = require('./messageController').markMessageRead;
// exports.getMessageReadInfo = require('./messageController').getMessageReadInfo;
// exports.searchInChat = require('./messageController').searchInChat
// exports.getChatMedia = require('./messageController').getChatMedia;