// ChatBackend/controllers/messageController.js
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { encryptMessage, decryptMessage } = require('../utils/encryption');
const { deleteFromCloudinary } = require('../utils/cloudinaryHelper');

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

// =====================================================================
// SEND MESSAGE
// =====================================================================
exports.sendMessage = async (req, res) => {
  const chatId = req.body.chatId || req.params.chatId;
  let { content, type, fileUrl, replyTo, waveform } = req.body;

  if (!chatId) {
    return res.status(400).json({ msg: "Chat ID is required" });
  }

  try {
    const encryptedContent = content ? encryptMessage(content) : "";
    const finalFileUrl = fileUrl || (req.file ? req.file.path : "");

    // [LOGIC] Determine Type
    // 1. If 'type' is provided by frontend, use it.
    // 2. If not, infer from file extension.
    if (!type) {
      if (finalFileUrl) {
        if (finalFileUrl.match(/\.(gif)$/i)) type = 'gif';
        else if (finalFileUrl.match(/\.(mp4|mov|avi|mkv|webm)$/i)) type = 'video';
        else if (finalFileUrl.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)) type = 'audio'; // Changed to audio by default for files
        else if (finalFileUrl.match(/\.(jpg|jpeg|png|webp|bmp|heic)$/i)) type = 'image';
        else type = 'file'; 
      } else {
        type = 'text';
      }
    }

    let newMessageData = {
      sender: req.user.id,
      chat: chatId,
      type: type,
      content: encryptedContent, 
      fileUrl: finalFileUrl,     
      replyTo: replyTo || null,  
      waveform: waveform || [],
      readBy: [] 
    };

    let message = await Message.create(newMessageData);

    message = await message.populate([
      { path: 'sender', select: 'name username avatar phone' },
      { 
        path: 'replyTo', 
        select: 'content type fileUrl sender', 
        populate: { path: 'sender', select: 'name username avatar' }
      },
      {
        path: 'chat',
        populate: { path: 'participants', select: 'username avatar email name' }
      }
    ]);

    await Chat.findByIdAndUpdate(chatId, { lastMessage: message });

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(chatId).emit('new_message', decryptAndFormat(message));
    }

    res.json(decryptAndFormat(message));
  } catch (err) {
    console.error("SendMessage Error:", err);
    res.status(400).send(err.message);
  }
};

// =====================================================================
// ALL MESSAGES
// =====================================================================
exports.allMessages = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const messages = await Message.find({ chat: req.params.chatId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('sender', 'name avatar phone')
      .populate('reactions.user', 'name username avatar') 
      .populate({
        path: 'replyTo',
        select: 'content type fileUrl sender', 
        populate: { path: 'sender', select: 'name username avatar' }
      });

    const decryptedMessages = messages.map(msg => decryptAndFormat(msg)).reverse();
    res.json(decryptedMessages);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// =====================================================================
// DELETE MESSAGE
// =====================================================================
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.user.id;

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ msg: "Message not found" });

    // [SECURITY] Only sender can delete
    if (msg.sender.toString() !== userId) {
      return res.status(403).json({ msg: "You can only delete your own messages." });
    }

    if (msg.fileUrl) {
      let resourceType = 'image';
      // Cloudinary treats audio as 'video' resource_type
      if (['video', 'audio', 'voice'].includes(msg.type)) resourceType = 'video';
      // Files/Docs are usually 'raw'
      if (['file', 'document'].includes(msg.type)) resourceType = 'raw';

      try {
        await deleteFromCloudinary(msg.fileUrl, resourceType);
      } catch (e) {
        console.error("Cloudinary delete error:", e);
      }
    }

    const updatedMsg = await Message.findByIdAndUpdate(messageId, {
      isDeleted: true,
      content: encryptMessage("This message was deleted"),
      fileUrl: "",
      waveform: [],
      type: 'text',
      reactions: [] 
    }, { new: true }).populate('replyTo'); 
    
    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(msg.chat.toString()).emit('message_deleted_everyone', { messageId, chatId: msg.chat });
    }

    res.json(decryptAndFormat(updatedMsg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// =====================================================================
// EDIT MESSAGE
// =====================================================================
exports.editMessage = async (req, res) => {
  const { content } = req.body;
  try {
    const msg = await Message.findById(req.params.messageId);
    if (!msg) return res.status(404).json({ msg: "Message not found" });

    if (msg.sender.toString() !== req.user.id) {
      return res.status(401).json({ msg: "You can only edit your own messages" });
    }

    const encryptedContent = encryptMessage(content);
    
    const updatedMsg = await Message.findByIdAndUpdate(
      req.params.messageId, 
      { 
        content: encryptedContent, 
        // type: 'text', // [FIX] Don't force type change. Keep original (e.g. image with caption)
        isEdited: true 
      }, 
      { new: true }
    ).populate('replyTo'); 

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(msg.chat.toString()).emit('message_edited', decryptAndFormat(updatedMsg));
    }

    res.json(decryptAndFormat(updatedMsg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// =====================================================================
// FORWARD MESSAGE
// =====================================================================
exports.forwardMessage = async (req, res) => {
  const { messageId, targetChatIds } = req.body;
  try {
    const originalMsg = await Message.findById(messageId);
    if (!originalMsg) return res.status(404).json({msg: "Message not found"});

    const promises = targetChatIds.map(chatId => {
      return Message.create({
        sender: req.user.id,
        content: originalMsg.content,
        chat: chatId,
        type: originalMsg.type,
        fileUrl: originalMsg.fileUrl,
        forwarded: true,
        readBy: []
      });
    });
    const createdMessages = await Promise.all(promises);

    // [NEW] Populate and Emit Live Updates
    const io = req.app.get('io');

    // We need to populate each message to match the 'sendMessage' structure for the frontend
    const populatedMessages = await Message.populate(createdMessages, [
      { path: 'sender', select: 'name username avatar phone' },
      { path: 'replyTo', select: 'content type fileUrl sender', populate: { path: 'sender', select: 'name username avatar' } },
      { path: 'chat', populate: { path: 'participants', select: 'username avatar email name' } }
    ]);

    if (io) {
      populatedMessages.forEach(msg => {
        // Update last message for the chat
        Chat.findByIdAndUpdate(msg.chat._id, { lastMessage: msg._id }).exec();

        // Emit to the specific chat room
        io.to(msg.chat._id.toString()).emit('new_message', decryptAndFormat(msg));
      });
    }

    res.json({ msg: "Forwarded successfully", data: populatedMessages.map(decryptAndFormat) });
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// =====================================================================
// REACTION LOGIC
// =====================================================================
exports.addReaction = async (req, res) => {
  const { emoji } = req.body;
  try {
    await Message.findByIdAndUpdate(req.params.messageId, {
      $pull: { reactions: { user: req.user.id } }
    });

    const msg = await Message.findByIdAndUpdate(req.params.messageId, {
      $push: { reactions: { user: req.user.id, emoji } }
    }, { new: true })
    .populate('sender', 'username avatar')
    .populate('reactions.user', 'name username avatar');
    
    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.messageId).emit('reaction_updated', { messageId: req.params.messageId, reactions: msg.reactions });
      // Also broadcast to chat room just in case
      const fullMsg = await Message.findById(req.params.messageId);
      if (fullMsg) io.to(fullMsg.chat.toString()).emit('reaction_updated', { messageId: req.params.messageId, reactions: msg.reactions });
    }

    res.json(decryptAndFormat(msg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

exports.removeReaction = async (req, res) => {
  try {
    const msg = await Message.findByIdAndUpdate(req.params.messageId, {
      $pull: { reactions: { user: req.user.id } }
    }, { new: true })
    .populate('sender', 'username avatar')
    .populate('reactions.user', 'name username avatar');

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.messageId).emit('reaction_updated', { messageId: req.params.messageId, reactions: msg.reactions });
      // Also broadcast to chat room
      const fullMsg = await Message.findById(req.params.messageId);
      if (fullMsg) io.to(fullMsg.chat.toString()).emit('reaction_updated', { messageId: req.params.messageId, reactions: msg.reactions });
    }

    res.json(decryptAndFormat(msg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// =====================================================================
// OTHER ACTIONS (Star, Pin, Read)
// =====================================================================
exports.toggleStarMessage = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId);
    const isStarred = msg.starredBy.includes(req.user.id);
    let updatedMsg = await Message.findByIdAndUpdate(
      req.params.messageId, 
      isStarred ? { $pull: { starredBy: req.user.id } } : { $addToSet: { starredBy: req.user.id } }, 
      { new: true }
    ).populate('sender', 'username avatar');

    // [NEW] Emit Live Update (Sync across devices)
    const io = req.app.get('io');
    if (io) {
      // Star is usually personal, so we emit to the USER's room (for multi-device sync)
      io.to(req.user.id).emit('message_starred', {
        messageId: req.params.messageId,
        isStarred: !isStarred,
        chatId: msg.chat
      });
    }

    res.json(decryptAndFormat(updatedMsg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

exports.getStarredMessages = async (req, res) => {
  try {
    const messages = await Message.find({ starredBy: req.user.id })
      .populate('sender', 'username avatar')
      .populate('chat')
      .populate({ path: 'replyTo', populate: { path: 'sender' }});
    const decrypted = messages.map(msg => decryptAndFormat(msg));
    res.json(decrypted);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

exports.pinMessage = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.user.id;
    const msg = await Message.findById(messageId);
    
    const isPinnedByMe = msg.pinnedBy.includes(userId);
    let updatedMsg;
    if (isPinnedByMe) {
      updatedMsg = await Message.findByIdAndUpdate(messageId, { $pull: { pinnedBy: userId } }, { new: true }).populate('sender', 'username avatar');
    } else {
      updatedMsg = await Message.findByIdAndUpdate(messageId, { $addToSet: { pinnedBy: userId } }, { new: true }).populate('sender', 'username avatar');
    }
    res.json(decryptAndFormat(updatedMsg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

exports.markMessageRead = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.user.id;

    const originalMsg = await Message.findById(messageId);
    if (!originalMsg) return res.status(404).json({ msg: "Message not found" });

    if (originalMsg.sender.toString() === userId) {
      return res.status(400).json({ msg: "Cannot mark your own message as read" });
    }

    const msg = await Message.findByIdAndUpdate(messageId, {
      $addToSet: { readBy: userId }
    }, { new: true })
    .populate('readBy', 'username avatar')
    .populate('sender', 'username avatar');

    // [NEW] Emit Live Update
    const io = req.app.get('io');
    if (io) {
      io.to(originalMsg.chat.toString()).emit('message_read', { messageId, userId });
    }

    res.json(decryptAndFormat(msg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

exports.getMessageReadInfo = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId)
      .populate('readBy', 'username avatar lastSeen')
      .select('readBy sender'); 
    if (!msg) return res.status(404).json({ msg: "Message not found" });
    const readers = msg.readBy.filter(reader => reader._id.toString() !== msg.sender.toString());
    res.json(readers);
  } catch (err) {
    res.status(400).send(err.message);
  }
};

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

exports.getChatMedia = async (req, res) => {
  try {
    const messages = await Message.find({ 
      chat: req.params.chatId, 
      type: { $in: ['image', 'video', 'gif'] },
      isDeleted: false
    })
    .select('fileUrl type createdAt sender content') 
    .sort({ createdAt: -1 });
    
    res.json(messages);
  } catch (err) {
    res.status(400).send(err.message);
  }
};