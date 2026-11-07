// src/lib/netError.js — errores de red en lenguaje del socio (UX-02/03/09, 7-nov-2026).
//
// Supabase/fetch devuelven "TypeError: Failed to fetch", "Load failed",
// "NetworkError when attempting to fetch resource", timeouts, etc. Nada de
// eso debe llegar a la pantalla: se traduce a un mensaje claro y el resto
// (mensajes de NEGOCIO que ya vienen en español desde las RPCs) pasa igual.

export const OFFLINE_MSG = 'Sin conexión. Revisá tu internet e intentá de nuevo.';

const NET_RE = /failed to fetch|load failed|networkerror|network request failed|fetch failed|timeout|timed out|ECONNRESET|ENOTFOUND|net::ERR_|aborted|AbortError/i;

/** true si el error parece de red/transporte (no de negocio). */
export function isNetworkError(err) {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = typeof err === 'string' ? err : (err.message || err.details || '');
  const name = err?.name || '';
  return NET_RE.test(msg) || name === 'AbortError';
}

/**
 * Mensaje para mostrar al socio: el de negocio tal cual, el de red traducido,
 * y el fallback cuando no hay mensaje útil.
 */
export function friendlyError(err, fallback = 'Algo salió mal. Intentá de nuevo.') {
  if (isNetworkError(err)) return OFFLINE_MSG;
  const msg = typeof err === 'string' ? err : err?.message;
  if (!msg) return fallback;
  // Mensajes técnicos de PostgREST/Postgres que no son de negocio (los de
  // negocio salen de RAISE con texto en español; PostgREST pone su código
  // en err.code, p. ej. PGRST202 "Could not find the function…")
  if (/^PGRST/.test(err?.code || '')) return fallback;
  if (/^(PGRST|[0-9A-Z]{5}:)|permission denied|function .* does not exist|Could not find the function|schema cache|JSON object requested|invalid input syntax/i.test(msg)) return fallback;
  return msg;
}
