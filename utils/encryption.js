const CryptoJS = require('crypto-js');

const encryptMessage = (text) => {
  return CryptoJS.AES.encrypt(text, process.env.MESSAGE_SECRET_KEY).toString();
};

const decryptMessage = (cipherText) => {
  const bytes = CryptoJS.AES.decrypt(cipherText, process.env.MESSAGE_SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

module.exports = { encryptMessage, decryptMessage };