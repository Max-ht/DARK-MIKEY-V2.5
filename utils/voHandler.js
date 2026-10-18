/**
 * utils/voHandler.js
 * Point d'entrée "vue unique" utilisé par index.js (Auto-VV).
 * Réexporte la logique de utils/viewOnceHandler.js (source unique, partagée avec /vv)
 * et ajoute les petits utilitaires utiles à l'interception automatique.
 */
const viewOnce = require('./viewOnceHandler');

/** Retourne le contenu média déballé d'un message à vue unique (ou null). */
function getViewOnceContent(msg) {
  try {
    if (!msg?.message || !viewOnce.isViewOnce(msg)) return null;
    return viewOnce.unwrap(msg.message) || null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  isViewOnce: viewOnce.isViewOnce,
  unwrap: viewOnce.unwrap,
  processAndForward: viewOnce.processAndForward,
  getViewOnceContent,
};
