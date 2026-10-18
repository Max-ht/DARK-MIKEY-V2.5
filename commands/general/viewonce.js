/**
 * /vv /viewonce /bb - Révèle un message à vue unique
 * Accessible à tous (pas ownerOnly)
 */
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { processAndForward } = require('../../utils/viewOnceHandler');

module.exports = {
  name: 'viewonce',
  aliases: ['vv', 'bb', 'vueunique', 'read'],
  category: 'general',
  description: "Révèle un message à vue unique → envoyé dans Vous + Telegram",
  usage: '/vv (répondre à un message vue unique)',

  async execute(sock, msg) {
    const selfJid = jidNormalizedUser(sock.user.id);
    const sourceChat = msg.key.remoteJid;

    const ctx =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      msg.message?.audioMessage?.contextInfo ||
      msg.message?.buttonsResponseMessage?.contextInfo;

    if (!ctx?.quotedMessage || !ctx?.stanzaId) {
      return sock.sendMessage(selfJid, {
        text: '📌 Réponds à un message *vue unique* avec */vv* pour le révéler.'
      }, {});
    }

    const quotedMsg = ctx.quotedMessage;
    const hasVO =
      !!quotedMsg.viewOnceMessageV2 ||
      !!quotedMsg.viewOnceMessageV2Extension ||
      !!quotedMsg.viewOnceMessage ||
      !!quotedMsg?.imageMessage?.viewOnce ||
      !!quotedMsg?.videoMessage?.viewOnce ||
      !!quotedMsg?.audioMessage?.viewOnce;

    if (!hasVO) {
      return sock.sendMessage(selfJid, {
        text: "❌ Ce message n'est pas un message à vue unique."
      }, {});
    }

    // ── Correction du numéro expéditeur ──
    let senderJid;
    if (sourceChat.endsWith('@g.us')) {
      // Groupe : l'expéditeur est dans ctx.participant
      senderJid = ctx.participant || ctx.remoteJid || sourceChat;
    } else {
      // Privé : l'expéditeur est TOUJOURS l'autre personne = sourceChat
      // (jamais le bot lui-même)
      senderJid = sourceChat;
    }

    let groupName = null;
    if (sourceChat.endsWith('@g.us')) {
      try { const meta = await sock.groupMetadata(sourceChat); groupName = meta.subject; }
      catch { groupName = 'Groupe'; }
    }

    const unwrapped = quotedMsg.viewOnceMessageV2?.message
      || quotedMsg.viewOnceMessageV2Extension?.message
      || quotedMsg.viewOnceMessage?.message
      || quotedMsg;

    let originalCaption = '';
    for (const t of ['imageMessage','videoMessage','audioMessage','documentMessage']) {
      if (unwrapped[t]?.caption) { originalCaption = unwrapped[t].caption; break; }
    }

    try {
      await processAndForward(sock, msg, quotedMsg, senderJid, sourceChat, groupName, originalCaption);
    } catch (err) {
      console.error('[/vv]', err.message);
      await sock.sendMessage(selfJid, { text: '❌ Erreur : ' + err.message }, {});
    }
  }
};
