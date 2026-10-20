/**
 * TikTok Downloader — /tiktok
 * Approche mobile scraping (moins bloquée depuis les serveurs cloud)
 */
const axios = require('axios');
const config = require('../../config');

// Headers qui imitent un vrai navigateur mobile
const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Origin': 'https://ssstik.io',
  'Referer': 'https://ssstik.io/',
};

async function tryGet(url, params, headers = {}, timeout = 20000) {
  try {
    const { data } = await axios.get(url, {
      params, headers: { ...MOBILE_HEADERS, ...headers }, timeout
    });
    return data;
  } catch { return null; }
}

async function tryPost(url, body, headers = {}, timeout = 20000) {
  try {
    const { data } = await axios.post(url, body, {
      headers: { ...MOBILE_HEADERS, ...headers,
        'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json'
      }, timeout
    });
    return data;
  } catch { return null; }
}

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'media',
  description: 'Télécharger une vidéo TikTok',
  usage: '/tiktok <lien TikTok>',

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const input = args.join(' ').trim();
    const urlMatch = input.match(/https?:\/\/\S*(tiktok|vm\.tiktok|vt\.tiktok)\S*/i);
    const url = urlMatch ? urlMatch[0] : input;

    if (!url || !/(tiktok)/i.test(url)) {
      return sock.sendMessage(chatId, {
        text: '❌ *Usage :* /tiktok <lien TikTok>\n_Ex : /tiktok https://vt.tiktok.com/ZSgj..._'
      }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { text: '⏳ Téléchargement TikTok...' }, { quoted: msg });

    let videoUrl = null, title = '';

    // API 1 : tikwm avec User-Agent mobile
    const r1 = await tryGet('https://www.tikwm.com/api/', { url, hd: 1 });
    if (r1?.data?.hdplay || r1?.data?.play) {
      videoUrl = r1.data.hdplay || r1.data.play;
      title = r1.data.title || '';
    }

    // API 2 : musicaldown (POST form)
    if (!videoUrl) {
      const token = await tryGet('https://musicaldown.com/', {}, {
        'Referer': 'https://musicaldown.com/'
      });
      if (token) {
        const r2 = await tryPost('https://musicaldown.com/api/add',
          `id=${encodeURIComponent(url)}&locale=fr_FR&tt=ZGVsYXk=`,
          { 'Referer': 'https://musicaldown.com/', 'Origin': 'https://musicaldown.com' }
        );
        if (r2?.links?.[0]?.href) {
          videoUrl = r2.links[0].href;
          title = r2.title || '';
        }
      }
    }

    // API 3 : ssstik (POST form)
    if (!videoUrl) {
      const r3 = await tryPost(
        'https://ssstik.io/abc?url=dl',
        `id=${encodeURIComponent(url)}&locale=fr&tt=ZGVsYXk=`,
        { 'HX-Request': 'true', 'HX-Target': 'target', 'Origin': 'https://ssstik.io' }
      );
      if (typeof r3 === 'string') {
        const match = r3.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/);
        if (match) videoUrl = match[1];
      }
    }

    // API 4 : cobalt.tools
    if (!videoUrl) {
      const r4 = await tryPost('https://api.cobalt.tools/api/json',
        { url, vCodec: 'h264', vQuality: 'max', isNoTTWatermark: true },
        { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      );
      if (r4?.url) videoUrl = r4.url;
    }

    // API 5 : siputzx
    if (!videoUrl) {
      const r5 = await tryGet(`https://api.siputzx.my.id/api/d/tiktok`, { url });
      const dl = r5?.data?.video || r5?.data?.play || r5?.url;
      if (dl) { videoUrl = dl; title = r5?.data?.title || ''; }
    }

    if (!videoUrl) {
      return sock.sendMessage(chatId, {
        text: '❌ Impossible de télécharger ce TikTok.\n_Essaie avec un autre lien, ou colle directement l\'URL complète (pas le lien court)._'
      }, { quoted: msg });
    }

    try {
      const { data: buf } = await axios.get(videoUrl, {
        responseType: 'arraybuffer', timeout: 120000,
        maxContentLength: 64 * 1024 * 1024,
        headers: { ...MOBILE_HEADERS, 'Referer': 'https://www.tiktok.com/' }
      });
      const caption = title
        ? `🎵 *${title.slice(0, 100)}*\n\n📥 *${config.botName}*`
        : `🎵 *Vidéo TikTok*\n\n📥 *${config.botName}*`;
      await sock.sendMessage(chatId, {
        video: Buffer.from(buf), caption, mimetype: 'video/mp4'
      }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(chatId, {
        text: '❌ Vidéo trop lourde ou lien expiré.\n_' + err.message + '_'
      }, { quoted: msg });
    }
  }
};
