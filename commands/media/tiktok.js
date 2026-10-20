/**
 * TikTok Downloader — /tiktok
 * APIs : cobalt.tools (open source) → tikwm.com → ssstik → princetechn
 */
const axios = require('axios');
const config = require('../../config');

async function tryApi(fn) {
  try { return await fn(); } catch { return null; }
}

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'media',
  description: 'Télécharger une vidéo TikTok',
  usage: '/tiktok <lien TikTok>',

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const input = (args.join(' ') || '').trim();
    const urlMatch = input.match(/https?:\/\/\S+tiktok\S*/i)
      || input.match(/https?:\/\/vm\.tiktok\S*/i)
      || input.match(/https?:\/\/vt\.tiktok\S*/i);
    const url = urlMatch ? urlMatch[0] : input;

    if (!url || !/tiktok|vm\.tiktok|vt\.tiktok/i.test(url)) {
      return sock.sendMessage(chatId, {
        text: '❌ *Usage :* /tiktok <lien TikTok>\n_Ex : /tiktok https://vt.tiktok.com/ZSgj..._'
      }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { text: '⏳ Téléchargement TikTok...' }, { quoted: msg });

    let videoUrl = null, title = '';

    // ── API 1 : cobalt.tools (open source, sans pub, sans watermark) ──
    const cobalt = await tryApi(async () => {
      const { data } = await axios.post('https://api.cobalt.tools/api/json', {
        url, vCodec: 'h264', vQuality: 'max', isNoTTWatermark: true, isTTFullAudio: false
      }, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; DARK-MIKEY/2.3)' },
        timeout: 20000
      });
      return data;
    });
    if (cobalt?.url) { videoUrl = cobalt.url; title = ''; }

    // ── API 2 : tikwm.com ──
    if (!videoUrl) {
      const tikwm = await tryApi(async () => {
        const { data } = await axios.get('https://www.tikwm.com/api/', {
          params: { url, hd: 1 },
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' },
          timeout: 25000
        });
        return data;
      });
      if (tikwm?.data?.play)   { videoUrl = tikwm.data.play;   title = tikwm.data.title || ''; }
      if (tikwm?.data?.hdplay) { videoUrl = tikwm.data.hdplay; title = tikwm.data.title || ''; }
    }

    // ── API 3 : siputzx ──
    if (!videoUrl) {
      const sip = await tryApi(async () => {
        const { data } = await axios.get(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`, { timeout: 25000 });
        return data;
      });
      if (sip?.data?.video || sip?.data?.play) {
        videoUrl = sip.data.video || sip.data.play;
        title = sip.data.title || '';
      }
    }

    // ── API 4 : princetechn ──
    if (!videoUrl) {
      const pt = await tryApi(async () => {
        const { data } = await axios.get(`https://api.princetechn.com/tiktok?url=${encodeURIComponent(url)}`, { timeout: 25000 });
        return data;
      });
      if (pt?.url || pt?.data?.url) videoUrl = pt.url || pt.data.url;
    }

    if (!videoUrl) {
      return sock.sendMessage(chatId, {
        text: '❌ Impossible de télécharger cette vidéo TikTok.\n_Tous les services sont indisponibles ou le compte est privé._'
      }, { quoted: msg });
    }

    try {
      const { data: buf } = await axios.get(videoUrl, {
        responseType: 'arraybuffer', timeout: 120000,
        maxContentLength: 64 * 1024 * 1024,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' }
      });
      const caption = title
        ? `🎵 *${title.slice(0, 100)}*\n\n📥 *${config.botName}*`
        : `🎵 *Vidéo TikTok*\n\n📥 *${config.botName}*`;
      await sock.sendMessage(chatId, { video: Buffer.from(buf), caption, mimetype: 'video/mp4' }, { quoted: msg });
    } catch (err) {
      console.error('[tiktok dl]', err.message);
      await sock.sendMessage(chatId, { text: '❌ Vidéo trop lourde ou lien expiré.' }, { quoted: msg });
    }
  }
};
