// Arnés de la pantalla VEHÍCULOS completa (9-nov-2026, pedido del dueño):
// los cuadros sin dato se OCULTAN (nada de "—") y van apareciendo a
// medida que la ficha y las cargas se llenan; vacío → invitaciones.
//   ?s=empty   → vehículo recién agregado: sin km, aceite, servicio ni cargas
//   ?s=partial → km y aceite, 1 carga sin km (pista "completa…" + nota de rendimiento)
//   ?s=full    → ficha completa y 7 cargas con km (todos los cuadros)
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
const veh = sc === 'empty' ? { ...base }
  : sc === 'partial' ? { ...base, km: 45200, oil_type: '15W-40' }
  : { ...base, km: 46010, oil_type: '15W-40', tank_gal: 13.2, next_service: '2026-12-15', next_service_km: 50000, last_fuel_at: '2026-11-06' };

const L = (id, day, gallons, amount, km, full) => ({
  id, source: 'turkaj', created_at: `2026-${day}T20:00:00.000Z`, station_name: 'Turkaj I', fuel_type: 'regular',
  gallons, amount, vehicle_id: veh.id, km_reading: km, full_tank: full, at_reserve: false, gap_before: null,
});
const loads = sc === 'empty' ? []
  : sc === 'partial' ? [L('a1', '11-06', 6.1, 190, null, null)]
  : [L('f7', '11-06', 9.8, 305, 46010, true), L('f6', '10-30', 5.0, 156, 45700, false), L('f5', '10-24', 9.6, 299, 45480, true),
     L('f4', '10-17', 4.2, 131, 45200, false), L('f3', '10-10', 10.1, 314, 44990, true), L('f2', '10-03', 6.0, 187, 44700, false),
     L('f1', '09-26', 9.9, 308, 44400, true)];

const s = fuelSummary(loads, veh.tank_gal, veh.vtype);
window.__PP_MOCK_STATS = loads.length ? {
  [veh.id]: {
    fuel_count: loads.length, total_gallons: +loads.reduce((a, l) => a + l.gallons, 0).toFixed(2),
    total_amount: loads.reduce((a, l) => a + l.amount, 0), km_per_gal: s.kmPerGal, km_per_gal_method: s.method,
    km_per_day: sc === 'full' ? 39 : null, trend_pct: s.trendPct, excluded: s.excluded, anchors: [...s.anchors],
    windows: s.allWindows.map(w => ({ start_id: w.startId, end_id: w.endId, km: w.km, gal: w.gal, kmgal: w.kmgal, from: w.from, to: w.to, kind: w.kind, grade: w.grade })),
  },
} : {};
window.__PP_MOCK_LOADS = loads;
window.__PP_MOCK_EVENTS = [];

const ctx = { cTier: { name: 'ORO' }, dark, fire: (m) => console.log('[toast]', m), cfg: {}, vehicleFocus: null, setVehicleFocus: () => {} };

createRoot(document.getElementById('root')).render(
  <div style={{ background: dark ? '#0D0D0F' : '#fff', maxWidth: 420, margin: '0 auto' }}>
    <VehiclesHome ctx={ctx} vehicles={[veh]} setVehicles={() => {}} />
  </div>,
);
