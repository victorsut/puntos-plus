// src/lib/fuelEconomy.js
// F6 E3f (21-sep-2026) — RENDIMIENTO "DE LLENO A LLENO".
// Espejo exacto del algoritmo server-side de list_my_vehicle_stats
// (migración 20260921b): el servidor da el titular por vehículo; este
// módulo calcula las VENTANAS para la gráfica y el historial con las
// mismas reglas, para que ambos digan lo mismo.
//
// Regla: entre dos llenados completos con km recorridos (anclas), todo
// el combustible cargado después de la primera ancla hasta la segunda
// inclusive es exactamente lo consumido. Las cargas parciales no se
// miden solas: se suman a la siguiente ventana.

export const FULL_TANK_RATIO = 0.85; // inferencia: ≥85 % del tanque = lleno
export const MIN_WINDOW_KM = 10;     // ventanas más cortas no son medibles

// ¿Quedó lleno? Respuesta del socio (true/false) o inferencia por tanque.
export function isFullLoad(load, tankGal) {
  if (load.full_tank === true) return true;
  if (load.full_tank === false) return false;
  return +tankGal > 0 && +load.gallons >= FULL_TANK_RATIO * +tankGal;
}

// ¿La marca de lleno fue inferida (no la dio el socio)?
export const isInferredFull = (load, tankGal) =>
  load.full_tank == null && isFullLoad(load, tankGal);

// Ventanas de lleno a lleno de UN vehículo. `loads` en cualquier orden.
// Devuelve [{ endId, startId, km, gal, kmgal, from, to }] cronológico;
// `kmgal` va asociado a la carga que CIERRA la ventana (endId).
export function fuelWindows(loads, tankGal) {
  const rows = [...(loads || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const out = [];
  let anchor = null, gal = 0;
  for (const l of rows) {
    gal += +l.gallons || 0;
    if (l.km_reading == null || !isFullLoad(l, tankGal)) continue;
    if (anchor && l.km_reading - anchor.km_reading >= MIN_WINDOW_KM && gal > 0) {
      const km = l.km_reading - anchor.km_reading;
      out.push({
        endId: l.id, startId: anchor.id, km, gal: +gal.toFixed(2),
        kmgal: +(km / gal).toFixed(1), from: anchor.created_at, to: l.created_at,
      });
    }
    anchor = l; gal = 0;
  }
  return out;
}

// Estimador de respaldo (sin ninguna ancla): primera → última lectura de
// km, con los galones cargados después de la primera hasta la última.
// Error de ± un tanque en los extremos; se etiqueta como "estimado".
export function fuelEstimate(loads) {
  const rows = [...(loads || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const withKm = rows.filter(l => l.km_reading != null);
  if (withKm.length < 2) return null;
  const first = withKm[0], last = withKm[withKm.length - 1];
  const km = last.km_reading - first.km_reading;
  if (!(km > 0)) return null;
  const t0 = new Date(first.created_at), t1 = new Date(last.created_at);
  const gal = rows.filter(l => new Date(l.created_at) > t0 && new Date(l.created_at) <= t1)
    .reduce((s, l) => s + (+l.gallons || 0), 0);
  return gal > 0 ? +(km / gal).toFixed(1) : null;
}

// Resumen del vehículo: titular ponderado, método y tendencia.
// La tendencia (última ventana vs promedio ponderado) solo se emite
// con ≥3 ventanas: con dos, cualquier diferencia grita sin razón.
export function fuelSummary(loads, tankGal) {
  const windows = fuelWindows(loads, tankGal);
  if (windows.length > 0) {
    const sumKm = windows.reduce((s, w) => s + w.km, 0);
    const sumGal = windows.reduce((s, w) => s + w.gal, 0);
    const kmPerGal = +(sumKm / sumGal).toFixed(1);
    const last = windows[windows.length - 1].kmgal;
    const trendPct = windows.length >= 3 && kmPerGal > 0
      ? Math.round(((last - kmPerGal) / kmPerGal) * 100) : null;
    return { method: 'full', kmPerGal, windows, last, trendPct };
  }
  const est = fuelEstimate(loads);
  return { method: est ? 'estimate' : null, kmPerGal: est, windows, last: null, trendPct: null };
}
