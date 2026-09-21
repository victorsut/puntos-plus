// src/views/client/vehicles/fuelFmt.js
// Formateadores compartidos de la sección Rendimiento y consumo
// (VehicleFuel, FuelLogForm, FuelHistoryRow) — división E3f, 21-sep-2026.
export const fmtN = (n, d = 1) => (+n).toLocaleString('en-US', { maximumFractionDigits: d });
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
export const fmtMonth = (iso) => {
  const t = new Date(iso).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Etiqueta del estado "tanque lleno" de una carga (E3f).
//   full: true/false/null (respuesta del socio) · inferred: lleno por
//   tamaño (≥85 % del tanque) cuando no hubo respuesta.
export function fullTankLabel(full, inferred) {
  if (full === true) return 'Tanque lleno';
  if (full === false) return 'Carga parcial';
  return inferred ? 'Lleno (por tamaño)' : '¿Quedó lleno?';
}
