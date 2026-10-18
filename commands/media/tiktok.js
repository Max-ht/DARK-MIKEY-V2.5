/**
 * TikTok Downloader - /tiktok
 */
const axios = require('axios');
const config = require('../../config');

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'media',
  description: 'Télécharger une vidéo TikTok',
  usage: '/tiktok <lien TikTok>',

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const text = args.join(' ').trim()
      || msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || '';

    const urlMatch = text.match(/https?:\/\/[^\s]+tiktok[^\s]*/i)
      || text.match(/https?:\/\/vm\.tiktok[^\s]*/i)
      || text.match(/https?:\/\/vt\.tiktok[^\s]*/i);

    const url = urlMatch ? urlMatch[0] : text.trim();
    if (!url || !/tiktok/i.test(url)) {
      return sock.sendMessage(chatId, {
        text: '❌ *Utilisation :* /tiktok <lien TikTok>\n_Ex : /tiktok https://vt.tiktok.com/ZSgj..._'
      }, { quoted: msg });
    }

    try {
      await sock.sendMessage(chatId, { text: '⏳ Téléchargement TikTok en cours...' }, { quoted: msg });

      let videoUrl = null, title = '';

      // Méthode 1 : tikwm.com (très fiable, pas de clé)
      try {
        const { data } = await axios.get('https://www.tikwm.com/api/', {
          params: { url, hd: 1 },
          timeout: 30000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (data?.data?.play) {
          videoUrl = data.data.play;
          title = data.data.title || '';
        } else if (data?.data?.hdplay) {
          videoUrl = data.data.hdplay;
          title = data.data.title || '';
        }
      } catch (e1) { console.error('[tiktok tikwm]', e1.message); }

      // Méthode 2 : siputzx
      if (!videoUrl) {
        try {
          const { data } = await axios.get(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`, { timeout: 30000 });
          const dl = data?.data?.video || data?.data?.play || data?.url;
          if (dl) videoUrl = dl;
          title = data?.data?.title || '';
        } catch (e2) { console.error('[tiktok siputzx]', e2.message); }
      }

      // Méthode 3 : princetechn
      if (!videoUrl) {
        try {
          const { data } = await axios.get(`https://api.princetechn.com/tiktok?url=${encodeURIComponent(url)}`, { timeout: 30000 });
          const dl = data?.url || data?.data?.url;
          if (dl) videoUrl = dl;
        } catch (e3) { console.error('[tiktok princetechn]', e3.message); }
      }

      if (!videoUrl) {
        return sock.sendMessage(chatId, {
          text: '❌ Impossible de télécharger cette vidéo TikTok.\n_Essaie avec un autre lien, ou vérifie que le compte n\'est pas privé._'
        }, { quoted: msg });
      }

      // Télécharger le buffer vidéo
      const { data: buffer } = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 64 * 1024 * 1024,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' }
      });

      const caption = title
        ? `🎵 *${title.slice(0, 100)}*\n\n📥 Téléchargé par *${config.botName}*`
        : `🎵 *Vidéo TikTok*\n\n📥 Téléchargé par *${config.botName}*`;

      await sock.sendMessage(chatId, {
        video: Buffer.from(buffer),
        caption,
        mimetype: 'video/mp4'
      }, { quoted: msg });

    } catch (err) {
      console.error('[tiktok final]', err.message);
      await sock.sendMessage(chatId, {
        text: '❌ Erreur lors du téléchargement TikTok.\n_' + err.message + '_'
      }, { quoted: msg });
    }
  }
};
