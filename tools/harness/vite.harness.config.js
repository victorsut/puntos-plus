import base from '../../vite.config.js';

// Arnés: `window.__PP_MOCK_VEHICLES` (lo define rating.jsx) hace que
// listMyVehicles devuelva vehículos sembrados sin sesión de Supabase.
// Solo aplica en este config (nunca en el build de producción).
const mockVehicles = {
  name: 'pp-harness-mock-vehicles',
  transform(code, id) {
    if (!id.split('\\').join('/').endsWith('src/services/vehicleService.js')) return null;
    return code.replace(
      'export async function listMyVehicles()',
      'export async function listMyVehicles() {\n  if (typeof window !== "undefined" && window.__PP_MOCK_VEHICLES) return { data: { ok: true, vehicles: window.__PP_MOCK_VEHICLES }, error: null };\n  return listMyVehicles_real();\n}\nasync function listMyVehicles_real()',
    );
  },
};

export default {
  ...base,
  plugins: [...(base.plugins || []), mockVehicles],
  server: { ...base.server, port: 3100, strictPort: true, open: false },
};
