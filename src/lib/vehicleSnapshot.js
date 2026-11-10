// src/lib/vehicleSnapshot.js
// Vehículos SIN CONEXIÓN (10-nov-2026, pedido del dueño): las últimas
// estadísticas se pueden consultar aunque no haya internet. Cada vez que
// la pestaña baja datos del servidor se guarda una "foto" en el celular
// (por socio): ficha de los vehículos, telemetría de list_my_vehicle_stats
// y el historial de cargas (base de los indicadores y del consumo por
// mes). Sin red, la vista pinta esa foto en SOLO LECTURA con un aviso y la
// fecha de la última actualización. Es solo caché de lectura: el servidor
// sigue siendo la única fuente y nada se escribe sin conexión.
// Se borra al cerrar sesión (clearVehicleSnapshots).

const PREFIX = 'pp_veh_snap_';
const keyOf = (memberId) => `${PREFIX}${memberId}`;
const validId = (id) => !!id && !String(id).startsWith('temp-');

export function readVehicleSnapshot(memberId) {
  if (!validId(memberId)) return null;
  try {
    const raw = localStorage.getItem(keyOf(memberId));
    const snap = raw ? JSON.parse(raw) : null;
    return snap && typeof snap === 'object' ? snap : null;
  } catch { return null; }
}

// part: 'vehicles' | 'stats' | 'loads' — cada parte lleva su propia fecha;
// `at` es la de la actualización más reciente.
export function writeVehicleSnapshot(memberId, part, value) {
  if (!validId(memberId)) return;
  try {
    const prev = readVehicleSnapshot(memberId) || {};
    const now = new Date().toISOString();
    const next = { ...prev, [part]: value, [`${part}At`]: now, at: now };
    localStorage.setItem(keyOf(memberId), JSON.stringify(next));
  } catch { /* sin storage (privado/lleno): solo se pierde el modo sin conexión */ }
}

export function clearVehicleSnapshots() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* noop */ }
}

// "9 nov, 14:32" — fecha de la foto para el aviso
export function fmtSnapshotAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('es-GT', { day: 'numeric', month: 'short' }).replace('.', '');
  const time = d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${time}`;
}
