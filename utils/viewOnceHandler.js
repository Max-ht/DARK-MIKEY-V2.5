/**
 * utils/viewOnceHandler.js
 * Logique partagée /vv (manuel) et /autovv (auto).
 * Utilise downloadMediaMessage (avec reuploadRequest) pour l'autovv,
 * et downloadContentFromMessage pour le /vv (quotedMessage).
 */
const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const tg = require('./telegram');

function isViewOnce(msg) {
  const m = msg?.message;
  if (!m) return false;
  return !!(
    m.viewOnceMessageV2 ||
    m.viewOnceMessageV2Extension ||
    m.viewOnceMessage ||
    m?.imageMessage?.viewOnce ||
    m?.videoMessage?.viewOnce ||
    m?.audioMessage?.viewOnce
  );
}

function unwrap(m) {
  if (!m) return m;
  if (m.viewOnceMessageV2Extension) return m.viewOnceMessageV2Extension.message || m;
  if (m.viewOnceMessageV2) return m.viewOnceMessageV2.message || m;
  if (m.viewOnceMessage) return m.viewOnceMessage.message || m;
  return m;
}

function findMedia(msgObj) {
  if (!msgObj) return { actualMsg: null, mtype: null };
  const types = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
  for (const t of types) {
    if (msgObj[t]) return { actualMsg: msgObj, mtype: t };
  }
  return { actualMsg: null, mtype: null };
}

async function downloadAuto(sock, rawMsg) {
  // Méthode 1 : downloadMediaMessage avec reuploadRequest (gère les vues uniques)
  try {
    const buf = await downloadMediaMessage(
      rawMsg,
      'buffer',
      {},
      { reuploadRequest: sock.updateMediaMessage }
    );
    if (buf && buf.length > 0) return buf;
  } catch (e1) {
    console.error('[VH] downloadMediaMessage failed:', e1.message);
  }

  // Méthode 2 : downloadContentFromMessage sur le contenu déballé
  const unwrapped = unwrap(rawMsg.message);
  const { actualMsg, mtype } = findMedia(unwrapped);
  if (actualMsg && mtype) {
    const mediaInfo = actualMsg[mtype];
    if (mediaInfo?.mediaKey?.length) {
      const stream = await downloadContentFromMessage(mediaInfo, mtype.replace('Message', ''));
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    }
  }

  throw new Error('Média non disponible (clé vide). WhatsApp a peut-être déjà expiré ce contenu.');
}

async function downloadManual(quotedMsgObj) {
  const unwrapped = unwrap(quotedMsgObj);
  const { actualMsg, mtype } = findMedia(unwrapped);
  if (!actualMsg || !mtype) throw new Error('Type de média non reconnu.');
  const mediaInfo = actualMsg[mtype];
  const stream = await downloadContentFromMessage(mediaInfo, mtype.replace('Message', ''));
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { buffer: Buffer.concat(chunks), actualMsg, mtype };
}

async function processAndForward(sock, rawMsg, quotedMsgObj, senderJid, sourceChat, groupName, originalCaption) {
  const selfJid = String(sock.user.id).split(':')[0] + '@s.whatsapp.net';
  const _rawUser = String(senderJid || '').split('@')[0].split(':')[0];
  const _isLid   = String(senderJid || '').includes('@lid');
  // Si LID (identifiant interne), on affiche le nom si disponible, sinon ID court
  const senderNum = _isLid ? _rawUser.slice(-6) + '(LID)' : _rawUser;
  const where = groupName ? ('groupe *' + groupName + '*') : 'discussion privée';
  const infoLine = '👁️ *Vue unique* de *+' + senderNum + '* (' + where + ')';
  const caption = originalCaption ? (infoLine + '\n\n📝 ' + originalCaption) : infoLine;

  try {
    if (quotedMsgObj) {
      // Mode /vv manuel
      const { buffer, actualMsg, mtype } = await downloadManual(quotedMsgObj);
      const mediaInfo = actualMsg[mtype];
      await sendMedia(sock, selfJid, buffer, mtype, caption, mediaInfo);
    } else {
      // Mode autovv
      const buffer = await downloadAuto(sock, rawMsg);
      // Déterminer le type depuis le message déballé
      const unwrapped = unwrap(rawMsg.message);
      const { mtype } = findMedia(unwrapped);
      const guessedType = mtype || 'imageMessage'; // fallback image
      const mediaInfo = unwrapped?.[guessedType] || {};
      await sendMedia(sock, selfJid, buffer, guessedType, caption, mediaInfo);
    }
    return true;
  } catch (err) {
    await sock.sendMessage(selfJid, { text: '❌ ' + infoLine + '\n\nErreur : ' + err.message }, {});
    return false;
  }
}

async function sendMedia(sock, destJid, buffer, mtype, caption, mediaInfo) {
  const tgType = mtype.startsWith('image') ? 'image' : mtype.startsWith('video') ? 'video' : mtype.startsWith('audio') ? 'audio' : 'document';

  if (mtype === 'imageMessage') {
    await sock.sendMessage(destJid, { image: buffer, caption }, {});
    await tg.sendMedia(buffer, 'image', caption, 'image.jpg').catch(() => {});
  } else if (mtype === 'videoMessage') {
    await sock.sendMessage(destJid, { video: buffer, caption }, {});
    await tg.sendMedia(buffer, 'video', caption, 'video.mp4').catch(() => {});
  } else if (mtype === 'audioMessage') {
    const ptt = mediaInfo?.ptt ?? true;
    await sock.sendMessage(destJid, { audio: buffer, ptt, mimetype: 'audio/ogg; codecs=opus' }, {});
    await tg.sendText(caption).catch(() => {});
    await tg.sendMedia(buffer, 'audio', caption, 'audio.ogg').catch(() => {});
  } else {
    await sock.sendMessage(destJid, { document: buffer, caption, mimetype: mediaInfo?.mimetype || 'application/octet-stream' }, {});
    await tg.sendMedia(buffer, 'document', caption, 'file').catch(() => {});
  }
}

module.exports = { isViewOnce, processAndForward, unwrap };
