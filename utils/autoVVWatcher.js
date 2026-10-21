/**
 * utils/autoVVWatcher.js
 * SYSTÈME 2 + SYSTÈME 3 du plan autovv.
 *
 * Système 2 : surveille chaque message entrant d'une discussion où autovv est
 *             activé (Système 1 = autoVVStore) et détecte les vues uniques.
 * Système 3 : pour chaque vue unique détectée, exécute EXACTEMENT le code de
 *             la commande /vv (commands/general/viewonce.js), en lui donnant
 *             un faux "message de réponse" (contextInfo.quotedMessage) qui
 *             pointe vers le média — donc c'est 100% le même chemin que si
 *             l'utilisateur avait tapé /vv à la main, mais en silence.
 */
const { isViewOnce, unwrap } = require('./viewOnceHandler');
const autoVVStore = require('./autoVVStore');

function normJid(jid) {
  if (!jid) return '';
  const [user, domain] = String(jid).split('@');
  return user.split(':')[0] + (domain ? '@' + domain : '');
}

/**
 * Construit un faux message "réponse à une vue unique", exactement dans le
 * format que lit commands/general/viewonce.js (ctx.quotedMessage, ctx.stanzaId,
 * ctx.participant), puis appelle son execute().
 */
async function triggerVVInBackground(sock, viewonceCmd, rawMsg) {
  const sourceChat = rawMsg.key.remoteJid;
  const stanzaId = rawMsg.key.id;
  const participant = rawMsg.key.participant || undefined; // présent seulement en groupe

  const fakeMsg = {
    key: {
      remoteJid: sourceChat,
      fromMe: false,
      id: 'AUTOVV-' + stanzaId,
    },
    message: {
      extendedTextMessage: {
        text: '',
        contextInfo: {
          stanzaId,
          participant,
          remoteJid: sourceChat,
          quotedMessage: rawMsg.message, // le média vue unique original
        }
      }
    },
    pushName: rawMsg.pushName,
  };

  await viewonceCmd.execute(sock, fakeMsg);
}

/**
 * Point d'entrée appelé pour CHAQUE message entrant depuis index.js.
 * Ne fait rien si : message du bot lui-même, discussion non activée dans
 * autoVVStore, ou message qui n'est pas une vue unique.
 */
async function watch(sock, rawMsg, viewonceCmd) {
  try {
    const from = rawMsg.key.remoteJid;
    if (!from) return;
    if (rawMsg.key.fromMe) return;

    // Système 1 : la discussion doit être stockée comme activée
    if (!autoVVStore.isEnabled(normJid(from))) return;

    // Système 2 : ce message est-il une vue unique ?
    if (!isViewOnce(rawMsg)) return;

    // Système 3 : exécuter /vv en arrière-plan, sans réponse visible dans la discussion
    await triggerVVInBackground(sock, viewonceCmd, rawMsg);
  } catch (e) {
    console.error('[autoVVWatcher]', e.message);
  }
}

module.exports = { watch };
