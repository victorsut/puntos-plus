import base from '../../vite.config.js';

// Arnés: `window.__PP_MOCK_VEHICLES` (lo define rating.jsx) hace que
// listMyVehicles devuelva vehículos sembrados sin sesión de Supabase;
// `window.__PP_MOCK_FUEL_FAIL` (fuel.jsx?err=1) hace que listMyFuelHistory
// falle como si no hubiera red (UX-08). Solo aplica en este config
// (nunca en el build de producción).
const mockVehicles = {
  name: 'pp-harness-mock-vehicles',
  transform(code, id) {
    if (!id.split('\\').join('/').endsWith('src/services/vehicleService.js')) return null;
    code = code.replace(
      'export async function listMyFuelHistory(limit = 40)',
      'export async function listMyFuelHistory(limit = 40) {\n  if (typeof window !== "undefined" && window.__PP_MOCK_FUEL_FAIL) return { data: null, error: { message: "Sin conexión. Revisá tu internet e intentá de nuevo.", network: true } };\n  return listMyFuelHistory_real(limit);\n}\nasync function listMyFuelHistory_real(limit = 40)',
    );
    // vehicles.jsx (9-nov): telemetría y movimientos sembrados sin sesión
    code = code.replace(
      'export async function listMyVehicleStats()',
      'export async function listMyVehicleStats() {\n  if (typeof window !== "undefined" && window.__PP_MOCK_OFFLINE) return { data: null, error: { message: "Failed to fetch", network: true } };\n  if (typeof window !== "undefined" && window.__PP_MOCK_STATS) return { data: { ok: true, stats: window.__PP_MOCK_STATS }, error: null };\n  return listMyVehicleStats_real();\n}\nasync function listMyVehicleStats_real()',
    );
    code = code.replace(
      'export async function listMyVehicleEvents(',
      'export async function listMyVehicleEvents(o) {\n  if (typeof window !== "undefined" && window.__PP_MOCK_OFFLINE) return { data: null, error: { message: "Failed to fetch", network: true } };\n  if (typeof window !== "undefined" && window.__PP_MOCK_STATS) return { data: { ok: true, events: window.__PP_MOCK_EVENTS || [] }, error: null };\n  return listMyVehicleEvents_real(o);\n}\nasync function listMyVehicleEvents_real(',
    );
    code = code.replace(
      'return listMyFuelHistory_real(limit);',
      'if (typeof window !== "undefined" && window.__PP_MOCK_LOADS) return { data: { ok: true, loads: window.__PP_MOCK_LOADS, editable_days: 30 }, error: null };\n  return listMyFuelHistory_real(limit);',
    );
    return code.replace(
      'export async function listMyVehicles()',
      'export async function listMyVehicles() {\n  if (typeof window !== "undefined" && window.__PP_MOCK_VEHICLES) return { data: { ok: true, beta: true, vehicles: window.__PP_MOCK_VEHICLES }, error: null };\n  return listMyVehicles_real();\n}\nasync function listMyVehicles_real()',
    );
  },
};

export default {
  ...base,
  plugins: [...(base.plugins || []), mockVehicles],
  server: { ...base.server, port: 3100, strictPort: true, open: false },
};
