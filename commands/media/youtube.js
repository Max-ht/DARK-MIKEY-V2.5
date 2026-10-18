/**
 * /ytmp4 - Télécharger une vidéo YouTube
 * /ytmp3 - Télécharger l'audio d'une vidéo YouTube
 */
const axios = require('axios');
const ytSearch = require('yt-search');
const config = require('../../config');

const YT_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

async function downloadYT(url, format) {
  const apis = [
    `https://api.siputzx.my.id/api/d/yt${format}?url=${encodeURIComponent(url)}`,
    `https://api.princetechn.com/yt${format}?url=${encodeURIComponent(url)}`,
  ];
  let lastErr;
  for (const api of apis) {
    try {
      const { data } = await axios.get(api, { timeout: 45000 });
      // Différentes structures de réponse
      const dlUrl = data?.url || data?.download_url || data?.data?.download_url || data?.data?.url || data?.link;
      if (dlUrl && typeof dlUrl === 'string' && dlUrl.startsWith('http')) {
        return { url: dlUrl, title: data?.title || data?.data?.title || 'YouTube' };
      }
    } catch (e) { lastErr = e; }
  }
  throw new Error(lastErr?.message || 'Service de téléchargement indisponible');
}

async function searchYT(query) {
  const { videos } = await ytSearch(query);
  return videos?.[0] || null;
}

async function execute(sock, msg, args, extra, format) {
  const chatId = msg.key.remoteJid;
  const input = args.join(' ').trim();
  if (!input) return extra.reply(`❌ *Usage :* ${config.prefix}${format} <URL ou titre>`);

  try {
    await extra.reply(`⏳ Téléchargement ${format === 'ytmp4' ? 'vidéo' : 'audio'} en cours...`);

    let url = input;
    let title = '';

    if (!YT_RE.test(input)) {
      await extra.reply('🔍 Recherche YouTube...');
      const result = await searchYT(input);
      if (!result) return extra.reply('❌ Aucun résultat trouvé.');
      url = result.url;
      title = result.title;
    }

    const { url: dlUrl, title: apiTitle } = await downloadYT(url, format === 'ytmp4' ? 'mp4' : 'mp3');
    const finalTitle = title || apiTitle || 'YouTube';

    const { data: buffer } = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: 64 * 1024 * 1024 });
    const buf = Buffer.from(buffer);

    if (format === 'ytmp4') {
      await sock.sendMessage(chatId, {
        video: buf,
        caption: `🎬 *${finalTitle}*\n\n📥 Téléchargé par *${config.botName}*`
      }, { quoted: msg });
    } else {
      await sock.sendMessage(chatId, {
        audio: buf,
        ptt: false,
        mimetype: 'audio/mpeg',
      }, { quoted: msg });
      await sock.sendMessage(chatId, { text: `🎵 *${finalTitle}*\n\n📥 Téléchargé par *${config.botName}*` }, {});
    }
  } catch (err) {
    console.error('[youtube]', err.message);
    await extra.reply(`❌ Erreur : ${err.message}`);
  }
}

module.exports = {
  name: 'ytmp4',
  aliases: ['yt', 'ytvideo', 'youtube'],
  category: 'media',
  description: 'Télécharger une vidéo YouTube',
  usage: '/ytmp4 <URL ou titre>',
  execute: (sock, msg, args, extra) => execute(sock, msg, args, extra, 'ytmp4'),

  subCommands: [{
    name: 'ytmp3',
    aliases: ['ytaudio', 'ytmusic'],
    category: 'media',
    description: 'Télécharger l\'audio d\'une vidéo YouTube',
    usage: '/ytmp3 <URL ou titre>',
    execute: (sock, msg, args, extra) => execute(sock, msg, args, extra, 'ytmp3'),
  }]
};
