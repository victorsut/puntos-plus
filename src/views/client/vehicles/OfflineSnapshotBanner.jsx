// src/views/client/vehicles/OfflineSnapshotBanner.jsx
// 10-nov-2026 (pedido del dueño): aviso de la pestaña Vehículos cuando lo
// que se ve es la última foto guardada en el celular (sin conexión). Dice
// de cuándo son los datos y ofrece Reintentar; al volver la red la vista
// se actualiza sola y el aviso desaparece.
import { fmtSnapshotAt } from '../../../lib/vehicleSnapshot';

export default function OfflineSnapshotBanner({ at, dark, onRetry }) {
  const when = fmtSnapshotAt(at);
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '11px 12px', borderRadius: 15,
      background: dark ? 'rgba(255,255,255,.08)' : '#EEF1F6', color: dark ? '#fff' : '#0D0D0D',
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: .7 }}>
        <path d="M2 2l20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.9a10 10 0 0 1 5.2-2.8" /><path d="M14 10.2a10 10 0 0 1 5 2.7" /><path d="M2 8.8a15 15 0 0 1 4.2-2.6" /><path d="M10.7 5a15 15 0 0 1 11.3 3.8" /><circle cx="12" cy="20" r="1" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>Sin conexión</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.45, marginTop: 2, opacity: .7 }}>
          Estos datos son del último registro guardado en tu celular{when ? ` (${when})` : ''}. Para hacer cambios necesitas conexión.
        </div>
      </div>
      <button onClick={onRetry} style={{
        padding: '8px 12px', minHeight: 36, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: dark ? '#fff' : '#0D0D0D', color: dark ? '#0D0D0D' : '#fff',
        fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 800,
      }}>Reintentar</button>
    </div>
  );
}
