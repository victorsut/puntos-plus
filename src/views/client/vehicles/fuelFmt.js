// src/views/client/vehicles/fuelFmt.js
// Formateadores compartidos de la sección Rendimiento y consumo
// (VehicleFuel, FuelLogForm, FuelHistoryRow) — división E3f, 21-sep-2026.
export const fmtN = (n, d = 1) => (+n).toLocaleString('en-US', { maximumFractionDigits: d });
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
export const fmtMonth = (iso) => {
  const t = new Date(iso).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Etiqueta del estado del tanque de una carga (E3h: una pregunta, tres
// respuestas). state: 'full' | 'reserve' | 'partial' | null · inferred:
// lleno por tamaño (≥85 % del tanque) cuando no se dijo "lleno".
export function tankStateLabel(state, inferred) {
  if (state === 'full') return 'Tanque lleno';
  if (state === 'reserve') return inferred ? 'En reserva · lleno por tamaño' : 'Llegué en reserva';
  if (state === 'partial') return 'Carga parcial';
  return inferred ? 'Lleno (por tamaño)' : '¿Cómo fue la carga?';
}
