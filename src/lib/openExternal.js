// src/lib/openExternal.js
// UX-45 (7-nov-2026): algunos webviews devuelven null en window.open (o lo
// bloquean en silencio) — si no se abrió una ventana se navega en la misma
// pestaña, que siempre funciona (WhatsApp wa.me, encuesta de Shell…).
export function openExternal(url) {
  let win = null;
  try { win = window.open(url, '_blank', 'noopener'); } catch { win = null; }
  if (!win) { try { window.location.href = url; } catch { /* nada */ } }
  return !!win;
}
