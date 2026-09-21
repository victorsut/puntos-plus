// src/lib/tour.js
// TUTORIAL INTERACTIVO del cliente (21-sep-2026, pedido del dueño):
// marca de "tutorial pendiente" + bus de apertura manual.
//
// Regla del dueño: el tutorial aparece (1) al terminar de crear la
// cuenta y (2) cada vez que se ABRE SESIÓN del cliente en el
// dispositivo — no en cada apertura de la app con sesión guardada.
// ClientTourGate detecta la transición authScreen → 'logged' (login o
// registro; la restauración desde localStorage no cuenta porque ya
// arranca en 'logged') y deja la marca; se consume al terminar u omitir.
// Reapertura manual: botón en Asistencia y ayuda → openTour().
const KEY = 'pp_tour_pending';
export const TOUR_EVENT = 'pp:tour-open';

export function markTourPending() {
  try { localStorage.setItem(KEY, '1'); } catch { /* sin storage */ }
}
export function isTourPending() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function clearTourPending() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
// Abre el tutorial desde cualquier parte (SupportSheet). El gate
// escucha el evento, lleva al inicio y arranca desde el primer paso.
export function openTour() {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT));
}
