// src/lib/ratingSeen.js
// UX-14 (7-nov-2026): compras cuyo modal de calificación ya se mostró en
// ESTE dispositivo — lo marcan el canal Realtime, el chequeo al volver al
// frente (useMemberRealtime), el deep-link de la notificación y el cierre
// del modal (AppModals), para que el chequeo de compras recientes no lo
// vuelva a abrir. Últimos 30 ids en localStorage.
const SEEN_KEY = 'pp_rating_seen';

const readSeen = () => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
};

export const ratingSeen = (id) => !!id && readSeen().includes(id);

export const markRatingSeen = (id) => {
  if (!id) return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([id, ...readSeen().filter(x => x !== id)].slice(0, 30)));
  } catch { /* sin storage */ }
};
