// src/lib/fuelEconomy.js
// F6 E3f (21-sep-2026) — RENDIMIENTO "DE LLENO A LLENO".
// E3h (15-oct-2026) — el SERVIDOR (list_my_vehicle_stats, migración
// 20261015) es la única fuente del titular y de las ventanas; este
// módulo es su ESPEJO para (a) el arnés de vista previa sin backend y
// (b) el respaldo si la RPC aún no devuelve `windows`. Cualquier
// cambio al algoritmo va en AMBOS lados con las mismas constantes.
//
// Reglas:
//   · Cadena LLENO: ancla = km + lleno (dicho o inferido ≥85 % del
//     tanque). Ventana A→B: km B−A; galones de las cargas DESPUÉS de A
//     hasta B inclusive (parciales incluidas).
//   · Cadena RESERVA: ancla = km + "llegué en reserva". Ventana R1→R2:
//     km R2−R1; galones desde R1 INCLUSIVE hasta antes de R2. Se
//     descarta si se solapa con una ventana de lleno (más precisa).
//   · Ventana < MIN_WINDOW_KM: ni cierra ni mueve el ancla; se ARRASTRA.
//   · gap_before (cargué en otro lado y no lo registré): reinicia.
//   · grade: exact | inferred | implausible (> tope por tipo, o con ≥3
//     ventanas fuera de [0.5, 1.5] × mediana). Las implausibles no
//     entran al titular ni a la tendencia.
//   · Titular = Σkm/Σgal de las confiables. Tendencia = última vs
//     promedio de la base (exactas si ≥3; si no confiables si ≥3).

export const FULL_TANK_RATIO = 0.85; // inferencia: ≥85 % del tanque = lleno
export const MIN_WINDOW_KM = 10;     // ventanas más cortas se arrastran
export const KM_JUMP_BASE = 1500;    // tope por dedazo: última lectura + 1,500 km…
export const KM_PER_DAY_MAX = 500;   // …+ 500 km por día transcurrido
export const OUTLIER_HI = 1.5, OUTLIER_LO = 0.5, OUTLIER_MIN_WINDOWS = 3;
export const KMGAL_CAP = { moto: 250, mototaxi: 150, liviano: 90, picop: 60, camion_ligero: 45, microbus: 45, camion: 25, otro: 250 };

// ¿Quedó lleno? Respuesta del socio (true/false) o inferencia por tanque.
export function isFullLoad(load, tankGal) {
  if (load.full_tank === true) return true;
  if (load.full_tank === false) return false;
  return +tankGal > 0 && +load.gallons >= FULL_TANK_RATIO * +tankGal;
}

// ¿La marca de lleno fue inferida (no la dio el socio)?
export const isInferredFull = (load, tankGal) =>
  load.full_tank == null && isFullLoad(load, tankGal);

// ── Estado del tanque: UNA pregunta, tres respuestas ──────────
// 'full' (quedó lleno) · 'reserve' (llegué en reserva) · 'partial' · null
export const TANK_STATES = [
  { v: 'full', t: 'Tanque lleno' },
  { v: 'reserve', t: 'Llegué en reserva' },
  { v: 'partial', t: 'Carga parcial' },
];
export function tankStateOf(l) {
  if (l.full_tank === true) return 'full';
  if (l.at_reserve === true) return 'reserve';
  if (l.full_tank === false) return 'partial';
  return null;
}
// Par (full_tank, at_reserve) que guarda el servidor para cada estado
export function tankStateParams(state) {
  if (state === 'full') return { full_tank: true, at_reserve: null };
  if (state === 'reserve') return { full_tank: null, at_reserve: true };
  if (state === 'partial') return { full_tank: false, at_reserve: false };
  return { full_tank: null, at_reserve: null };
}

const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mkWin = (a, b, gal, kind, grade) => {
  const km = b.km_reading - a.km_reading;
  return { startId: a.id, endId: b.id, km, gal: +gal.toFixed(2), kmgal: +(km / gal).toFixed(1), from: a.created_at, to: b.created_at, kind, grade };
};

// Recorrido cronológico de UN vehículo → { windows (con grade), anchors }
function walk(loads, tankGal, vtype) {
  const rows = [...(loads || [])].sort(byTime);
  const raw = [], anchors = new Set();
  let fA = null, fGal = 0, rA = null, rGal = 0;
  for (const l of rows) {
    const g = +l.gallons || 0;
    if (l.gap_before) { fA = null; fGal = 0; rA = null; rGal = 0; }
    const hasKm = l.km_reading != null;
    // RESERVA: cierra ANTES de sumar esta carga
    if (hasKm && l.at_reserve === true) {
      if (!rA) { rA = l; rGal = 0; anchors.add(l.id); }
      else if (l.km_reading - rA.km_reading >= MIN_WINDOW_KM) {
        if (rGal > 0) raw.push(mkWin(rA, l, rGal, 'reserve', 'exact'));
        rA = l; rGal = 0; anchors.add(l.id);
      }
    }
    rGal += g;
    // LLENO: la carga del ancla no cuenta; la que cierra sí
    fGal += g;
    if (hasKm && isFullLoad(l, tankGal)) {
      if (!fA) { fA = l; fGal = 0; anchors.add(l.id); }
      else if (l.km_reading - fA.km_reading >= MIN_WINDOW_KM) {
        if (fGal > 0) raw.push(mkWin(fA, l, fGal, 'full', isInferredFull(fA, tankGal) || isInferredFull(l, tankGal) ? 'inferred' : 'exact'));
        fA = l; fGal = 0; anchors.add(l.id);
      }
    }
  }
  // reserva solo donde no hay una ventana de lleno encima
  const fulls = raw.filter(w => w.kind === 'full');
  const kept = raw
    .filter(w => w.kind === 'full' || !fulls.some(f => new Date(f.from) < new Date(w.to) && new Date(f.to) > new Date(w.from)))
    .sort((a, b) => new Date(a.to) - new Date(b.to));
  // plausibilidad
  const cap = KMGAL_CAP[vtype] ?? KMGAL_CAP.otro;
  const med = kept.length >= OUTLIER_MIN_WINDOWS ? median(kept.map(w => w.kmgal)) : null;
  const windows = kept.map(w => ({
    ...w,
    grade: w.kmgal > cap || (med != null && (w.kmgal > OUTLIER_HI * med || w.kmgal < OUTLIER_LO * med)) ? 'implausible' : w.grade,
  }));
  return { windows, anchors };
}

export const fuelWindows = (loads, tankGal, vtype) => walk(loads, tankGal, vtype).windows;
export const fuelAnchors = (loads, tankGal, vtype) => walk(loads, tankGal, vtype).anchors;

// Estimador de respaldo (sin ninguna ventana confiable): primera →
// última lectura de km, con los galones cargados después de la primera
// hasta la última. Error de ± un tanque; se etiqueta como "estimado".
export function fuelEstimate(loads) {
  const rows = [...(loads || [])].sort(byTime);
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

// Titular, tendencia y conteos a partir de las ventanas (ya graduadas)
function summarize(allWindows, anchors, estimate) {
  const windows = allWindows.filter(w => w.grade !== 'implausible');
  const excluded = allWindows.length - windows.length;
  if (windows.length === 0) {
    return { method: estimate ? 'estimate' : null, kmPerGal: estimate, windows, allWindows, excluded, last: null, trendPct: null, anchors };
  }
  const sum = (ws, k) => ws.reduce((s, w) => s + w[k], 0);
  const kmPerGal = +(sum(windows, 'km') / sum(windows, 'gal')).toFixed(1);
  const exact = windows.filter(w => w.grade === 'exact');
  const base = exact.length >= OUTLIER_MIN_WINDOWS ? exact : windows.length >= OUTLIER_MIN_WINDOWS ? windows : null;
  let trendPct = null;
  if (base) {
    const avg = sum(base, 'km') / sum(base, 'gal');
    trendPct = Math.round(((base[base.length - 1].kmgal - avg) / avg) * 100);
  }
  return { method: 'full', kmPerGal, windows, allWindows, excluded, last: windows[windows.length - 1].kmgal, trendPct, anchors };
}

// Resumen LOCAL (arnés / respaldo): mismo resultado que el servidor.
export function fuelSummary(loads, tankGal, vtype = null) {
  const { windows, anchors } = walk(loads, tankGal, vtype);
  return summarize(windows, anchors, fuelEstimate(loads));
}

// Resumen desde la RPC list_my_vehicle_stats (E3h: trae `windows` y
// `anchors`). Devuelve null si la RPC es anterior (sin `windows`) para
// que el cliente caiga al cálculo local.
export function serverSummary(st) {
  if (!st || !Array.isArray(st.windows)) return null;
  const allWindows = st.windows.map(w => ({
    startId: w.start_id, endId: w.end_id, km: +w.km, gal: +w.gal, kmgal: +w.kmgal,
    from: w.from, to: w.to, kind: w.kind, grade: w.grade,
  }));
  const windows = allWindows.filter(w => w.grade !== 'implausible');
  return {
    method: st.km_per_gal_method ?? null,
    kmPerGal: st.km_per_gal ?? null,
    windows, allWindows,
    excluded: st.excluded ?? allWindows.length - windows.length,
    last: st.km_per_gal_last ?? null,
    trendPct: st.trend_pct ?? null,
    anchors: new Set(st.anchors || []),
  };
}

// E3h: validación de una lectura de km ANTES de enviarla (el servidor
// la repite en assert_vehicle_km con las mismas reglas y constantes).
// lastKm/lastAt = última lectura conocida del vehículo (y su fecha).
// Devuelve el mensaje de error o null si la lectura es válida.
const fmtKm = (n) => (+n).toLocaleString('en-US');
export function kmReadingProblem(km, lastKm, lastAt = null, at = Date.now()) {
  if (km == null || !(lastKm > 0)) return null;
  if (km < lastKm) return `Los km (${fmtKm(km)}) son menores que tu última lectura (${fmtKm(lastKm)}). Revisa el tablero.`;
  const days = lastAt ? Math.max(0, (new Date(at) - new Date(lastAt)) / 86400000) : 0;
  if (km > lastKm + KM_JUMP_BASE + KM_PER_DAY_MAX * days) {
    return `Los km (${fmtKm(km)}) están muy por encima de tu última lectura (${fmtKm(lastKm)}). ¿Sobra un dígito?`;
  }
  return null;
}
