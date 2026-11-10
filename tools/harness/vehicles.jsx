// Arnés de la pantalla VEHÍCULOS completa (9-nov-2026, pedido del dueño):
// los cuadros sin dato se OCULTAN (nada de "—") y van apareciendo a
// medida que la ficha y las cargas se llenan; vacío → invitaciones.
//   ?s=empty   → vehículo recién agregado: sin km, aceite, servicio ni cargas
//   ?s=partial → km y aceite, 1 carga sin km (pista "completa…" + nota de rendimiento)
//   ?s=full    → ficha completa y 7 cargas con km (todos los cuadros)
//   ?s=navi    → las 14 cargas reales de la Navi (moto, tanque 1 gal) al 6-nov
//   ?gap=1     → con ?s=navi: la carga del 14-sep marcada "no registré" (corrección del 9-nov)
//   ?pt=N      → toca el punto N de Rendimiento por llenado (panel fijo)
//   ?tab=1|2   → abre la pestaña Galones / Km recorridos de Consumo por mes
//   ?off=1     → SIN CONEXIÓN (10-nov): foto guardada en el celular del 9-nov y el servidor
//                no responde → aviso + datos de la foto en solo lectura
//   ?dark=1
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      http://localhost:3100/tools/harness/vehicles.html?s=empty
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import VehiclesHome from '../../src/views/client/vehicles/VehiclesHome';
import { fuelSummary } from '../../src/lib/fuelEconomy';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
const sc = q.get('s') || 'empty';

const base = { id: 'v1', vtype: 'liviano', brand: 'Toyota', model: 'Corolla', plate: 'P123ABC', color: '#1E88E5' };
const navi = sc === 'navi';
const veh = navi ? { id: 'v1', vtype: 'moto', brand: 'Honda', model: 'Navi', plate: 'M033LDJ', color: '#E53935', km: 20132, tank_gal: 1.0, oil_type: '10W-30', last_fuel_at: '2026-11-06' }
  : sc === 'empty' ? { ...base }
  : sc === 'partial' ? { ...base, km: 45200, oil_type: '15W-40' }
  : { ...base, km: 46010, oil_type: '15W-40', tank_gal: 13.2, next_service: '2026-12-15', next_service_km: 50000, last_fuel_at: '2026-11-06' };

const L = (id, day, gallons, amount, km, full) => ({
  id, source: 'turkaj', created_at: `2026-${day}T20:00:00.000Z`, station_name: 'Turkaj I', fuel_type: 'regular',
  gallons, amount, vehicle_id: veh.id, km_reading: km, full_tank: full, at_reserve: false, gap_before: null,
});
const N = (id, at, gallons, amount, km, full) => ({ id, source: 'manual', created_at: at + ':00Z', station_name: null, fuel_type: null,
  gallons, amount, vehicle_id: 'v1', km_reading: km, full_tank: full, at_reserve: null, gap_before: null });
const loads = navi ? [
  N('n14', '2026-11-06T18:32', 0.78, 28, 20132, true), N('n13', '2026-11-01T19:44', 0.81, 29, 20021, true),
  N('n12', '2026-10-26T16:09', 0.79, 30.05, 19913, true), N('n11', '2026-10-20T22:12', 0.85, 32.2, 19806, true),
  N('n10', '2026-10-14T00:36', 0.74, 28.04, 19686, true), N('n9', '2026-10-03T03:15', 0.81, 30.1, 19590, true),
  N('n8', '2026-09-27T20:46', 0.83, 40, 19481, true), N('n7', '2026-09-20T21:48', 0.90, 42, 19360, true),
  N('n6', '2026-09-19T02:14', 0.21, 10, 19330, false), N('n5', '2026-09-14T22:17', 0.87, 40, 19211, true),
  N('n4', '2026-09-09T23:02', 0.77, 35, 19095, null), N('n3', '2026-09-02T21:42', 0.94, 39, 18893, true),
  { ...N('n2', '2026-08-24T15:40', 0.48, 20, 18860, null), source: 'turkaj', station_name: 'Turkaj II' },
  { ...N('n1', '2026-08-19T17:12', 0.80, 30, null, null), source: 'turkaj', station_name: 'Turkaj I' },
] : sc === 'empty' ? []
  : sc === 'partial' ? [L('a1', '11-06', 6.1, 190, null, null)]
  : [L('f7', '11-06', 9.8, 305, 46010, true), L('f6', '10-30', 5.0, 156, 45700, false), L('f5', '10-24', 9.6, 299, 45480, true),
     L('f4', '10-17', 4.2, 131, 45200, false), L('f3', '10-10', 10.1, 314, 44990, true), L('f2', '10-03', 6.0, 187, 44700, false),
     L('f1', '09-26', 9.9, 308, 44400, true)];

if (q.get('gap') === '1') { const l = loads.find(x => x.id === 'n5'); if (l) l.gap_before = true; }
const s = fuelSummary(loads, veh.tank_gal, veh.vtype);
window.__PP_MOCK_STATS = loads.length ? {
  [veh.id]: {
    fuel_count: loads.length, total_gallons: +loads.reduce((a, l) => a + l.gallons, 0).toFixed(2),
    total_amount: loads.reduce((a, l) => a + l.amount, 0), km_per_gal: s.kmPerGal, km_per_gal_method: s.method,
    km_per_day: sc === 'full' ? 39 : navi ? 16 : null, trend_pct: s.trendPct, excluded: s.excluded, anchors: [...s.anchors],
    windows: s.allWindows.map(w => ({ start_id: w.startId, end_id: w.endId, km: w.km, gal: w.gal, kmgal: w.kmgal, from: w.from, to: w.to, kind: w.kind, grade: w.grade })),
  },
} : {};
window.__PP_MOCK_LOADS = loads;
window.__PP_MOCK_EVENTS = [];

const ctx = { cTier: { name: 'ORO' }, dark, fire: (m) => console.log('[toast]', m), cfg: {}, vehicleFocus: null, setVehicleFocus: () => {}, me: { id: 'm1' } };
const off = q.get('off') === '1';
try { localStorage.removeItem('pp_veh_snap_m1'); } catch { /* noop */ }
if (off) {
  const at = '2026-11-09T20:32:00.000Z';
  localStorage.setItem('pp_veh_snap_m1', JSON.stringify({ vehicles: [veh], vehiclesAt: at, stats: window.__PP_MOCK_STATS, statsAt: at,
    loads: { rows: loads, editable_days: 30 }, loadsAt: at, at }));
  window.__PP_MOCK_OFFLINE = true; window.__PP_MOCK_FUEL_FAIL = true;
}

const tab = +q.get('tab');
const pt = q.get('pt');
if (pt != null) setTimeout(() => { document.querySelectorAll('svg[role="img"] rect')[+pt]?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, 700);
if (tab) setTimeout(() => { document.querySelectorAll('[role="tab"]')[tab]?.click(); }, 600);
setTimeout(() => { const el = document.querySelector('[role="tablist"]'); el?.scrollIntoView({ block: 'center' }); }, 900);

createRoot(document.getElementById('root')).render(
  <div style={{ background: dark ? '#0D0D0F' : '#fff', maxWidth: 420, margin: '0 auto' }}>
    <VehiclesHome ctx={ctx} vehicles={[veh]} setVehicles={() => {}} vehiclesOfflineAt={off ? '2026-11-09T20:32:00.000Z' : null} />
  </div>,
);
