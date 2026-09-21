// Arnés de verificación visual de RENDIMIENTO Y CONSUMO (E3f, 21-sep-2026):
// VehicleFuel con los datos REALES de la Navi de Ezer (7 cargas, tanque
// 1.0 gal) — el caso que disparó el algoritmo de lleno a lleno.
//   ?dark=1  ·  ?hist=1 (historial abierto)  ·  ?reg=1 (formulario manual)
//   ?old=1   → simula el cálculo por tramo anterior (solo para comparar
//              en consola: imprime los tramos viejos vs las ventanas nuevas)
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      http://localhost:3100/tools/harness/fuel.html?hist=1
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import VehicleFuel from '../../src/views/client/vehicles/VehicleFuel';
import { fuelSummary } from '../../src/lib/fuelEconomy';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';

const navi = {
  id: 'v-navi', vtype: 'moto', brand: 'Honda', model: 'Navi', plate: 'M033LDJ',
  color: '#E53935', km: 19360, tank_gal: 1.0, fuel_pref: 'regular',
};
const L = (id, day, gallons, amount, km, extra = {}) => ({
  id, source: 'manual', created_at: `2026-${day}T20:00:00.000Z`, station_id: null, station_name: null,
  fuel_type: null, gallons, amount, vehicle_id: navi.id, km_reading: km, full_tank: null, ...extra,
});
// Cargas reales (BD, 21-sep-2026). La primera fue en Turkaj sin km.
const loads = [
  L('l7', '09-20', 0.90, 42, 19360),
  L('l6', '09-19', 0.21, 10, 19330),
  L('l5', '09-14', 0.87, 40, 19211),
  L('l4', '09-09', 0.77, 35, 19095),
  L('l3', '09-02', 0.94, 39, 18893),
  L('l2', '08-24', 0.48, 20, 18860, { source: 'turkaj', station_name: 'Turkaj II', fuel_type: 'regular' }),
  L('l1', '08-19', 0.80, 30, null, { source: 'turkaj', station_name: 'Turkaj I', fuel_type: 'regular' }),
];

// Estadísticas como las daría el servidor (mismo algoritmo)
const s = fuelSummary(loads, navi.tank_gal);
const stats = {
  [navi.id]: {
    fuel_count: loads.length,
    total_gallons: +loads.reduce((a, l) => a + l.gallons, 0).toFixed(2),
    total_amount: loads.reduce((a, l) => a + l.amount, 0),
    km_per_gal: s.kmPerGal, km_per_gal_method: s.method, km_per_gal_windows: s.windows.length,
    km_per_gal_last: s.last, km_per_day: 18.5,
  },
};
console.log('[fuel] ventanas de lleno a lleno:', s.windows, '→ titular', s.kmPerGal, 'km/gal (', s.method, ')');
if (q.get('old') === '1') {
  // tramo por carga (algoritmo anterior): km desde la lectura previa / galones de esta carga
  const asc = [...loads].reverse(); let prev = null;
  for (const l of asc) {
    if (l.km_reading == null) continue;
    if (prev) console.log('[fuel] tramo viejo', l.created_at.slice(5, 10), ((l.km_reading - prev) / l.gallons).toFixed(1), 'km/gal');
    prev = l.km_reading;
  }
}

function Harness() {
  useEffect(() => {
    if (q.get('hist') === '1') setTimeout(() => { [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Historial de cargas'))?.click(); }, 150);
    if (q.get('reg') === '1') setTimeout(() => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '+ Registrar consumo')?.click(); }, 150);
  }, []);
  return (
    <div style={{ minHeight: '100vh', background: dark ? '#0D0D0F' : '#fff', padding: '16px 18px 40px', maxWidth: 384, margin: '0 auto', boxSizing: 'border-box' }}>
      <VehicleFuel dark={dark} fire={(m) => console.log('[toast]', m)} vehicles={[navi]} vehicle={navi}
        stats={stats} onStatsDirty={() => {}} preload={loads} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
