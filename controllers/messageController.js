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

  try {
    const encryptedContent = content ? encryptMessage(content) : "";
    const finalFileUrl = fileUrl || (req.file ? req.file.path : "");

    if (!type) {
      if (finalFileUrl) {
        if (finalFileUrl.match(/\.(gif)$/i)) type = 'gif';
        else if (finalFileUrl.match(/\.(mp4|mov|avi)$/i)) type = 'video';
        else if (finalFileUrl.match(/\.(mp3|wav|m4a|aac)$/i)) type = 'voice'; 
        else type = 'image';
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
      if (['video', 'audio', 'voice'].includes(msg.type)) resourceType = 'video';
      if (msg.type === 'file') resourceType = 'raw';
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
    
    res.json(decryptAndFormat(updatedMsg));
  } catch (err) {
    res.status(400).send(err.message);
  }
};

// =====================================================================
// EDIT MESSAGE (Added Missing Function)
// =====================================================================
exports.editMessage = async (req, res) => {
  const { content } = req.body;
  try {
    const msg = await Message.findById(req.params.messageId);
    if (!msg) return res.status(404).json({ msg: "Message not found" });
    
    // Check ownership
    if (msg.sender.toString() !== req.user.id) {
      return res.status(401).json({ msg: "You can only edit your own messages" });
    }

    // Optional: Time limit check (e.g. 15 mins)
    // const timeDiff = Date.now() - new Date(msg.createdAt).getTime();
    // if(timeDiff > 15 * 60 * 1000) return res.status(400).json({msg: "Edit time limit exceeded"});

    const encryptedContent = encryptMessage(content);
    
    const updatedMsg = await Message.findByIdAndUpdate(
      req.params.messageId, 
      { 
        content: encryptedContent, 
        type: 'text', 
        isEdited: true 
      }, 
      { new: true }
    ).populate('replyTo'); 

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
    await Promise.all(promises);
    res.json({ msg: "Forwarded successfully" });
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

// [FIXED] Mark Message Read
exports.markMessageRead = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.user.id;

    const originalMsg = await Message.findById(messageId);
    if (!originalMsg) return res.status(404).json({ msg: "Message not found" });

    // [LOGIC CHECK] Prevent sender from marking their own message as read
    if (originalMsg.sender.toString() === userId) {
      return res.status(400).json({ msg: "Cannot mark your own message as read" });
    }

    // Add user to readBy array
    const msg = await Message.findByIdAndUpdate(messageId, {
      $addToSet: { readBy: userId }
    }, { new: true })
    .populate('readBy', 'username avatar')
    .populate('sender', 'username avatar'); // Return sender info too

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
      // Added 'gif' to the list of types
      type: { $in: ['image', 'video', 'gif'] },
      isDeleted: false
    })
    .select('fileUrl type createdAt sender content') // Added content just in case
    .sort({ createdAt: -1 });
    
    res.json(messages);
  } catch (err) {
    res.status(400).send(err.message);
  }
};