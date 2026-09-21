// src/views/client/vehicles/FuelHistoryRow.jsx
// Fila del HISTORIAL DE CARGAS (extraída de VehicleFuel.jsx el
// 21-sep-2026, regla de 500 líneas). Muestra la carga, su vehículo,
// los km recorridos y — E3f — su papel en el rendimiento de lleno a
// lleno: si CIERRA una ventana trae su km/gal; si es parcial, avisa
// que se suma al siguiente llenado. El estado "tanque lleno" es una
// pastilla tappable que abre tres opciones (Sí / No / No sé) para
// corregirlo desde el historial (compras: ventana de 30 días;
// manuales: siempre). Conserva el editor de reasignación y el borrado
// de manuales.
import { BRAND_ORANGE } from '../../../constants/styles';
import { FUEL_LABELS } from '../../../constants/config';
import { fmtN, fmtDay, fullTankLabel } from './fuelFmt';

export default function FuelHistoryRow({
  l, dark, ink, sub, cardBg,
  name, dot, fuelMismatch, vehicles, vehName,
  win, isFull, inferred,
  canReassign, canMarkFull,
  editOpen, onToggleEdit, onReassign, busy,
  delArmed, onDel,
  fullOpen, onToggleFullOpen, onSetFull,
}) {
  const soft = dark ? 'rgba(255,255,255,.1)' : '#fff';
  const line = `1px solid ${dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.07)'}`;
  const iconBtn = (active) => ({
    width: 30, height: 30, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
    background: active ? BRAND_ORANGE : soft, color: active ? '#fff' : sub,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  const opt = (on) => ({
    padding: '7px 11px', borderRadius: 11, border: 'none', cursor: 'pointer',
    background: on ? (dark ? '#fff' : '#0D0D0D') : soft,
    color: on ? (dark ? '#0D0D0D' : '#fff') : ink,
    fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 700,
  });

  // línea 2: origen · km · papel en el rendimiento
  // (textos cortos: la línea se recorta con puntos suspensivos en 360px)
  const role = win ? `${win.kmgal} km/gal`
    : l.km_reading != null ? (isFull ? 'Inicia la medición' : 'Parcial → al próximo llenado')
    : null;
  const fullLabel = fullTankLabel(l.full_tank, inferred);

  return (
    <div style={{ background: cardBg, borderRadius: 15, padding: '11px 13px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: ink }}>
            {fmtDay(l.created_at)}
            <span style={{ color: sub, fontWeight: 600 }}> · {fmtN(l.gallons, 2)} gal · Q{fmtN(l.amount, 0)}</span>
          </div>
          {/* se permite partir en dos líneas: el km/gal de la ventana es
              lo importante y con nowrap quedaba recortado en 360px */}
          <div style={{ fontSize: 10.5, color: sub, fontWeight: 600, marginTop: 2, lineHeight: 1.45 }}>
            {[l.source === 'manual' ? 'Registro manual' : l.station_name, l.km_reading != null ? `${fmtN(l.km_reading, 0)} km` : null]
              .filter(Boolean).join(' · ') || '—'}
            {role && <span style={{ color: win ? ink : sub, fontWeight: win ? 800 : 600 }}> · {role}</span>}
            {/* E3d: combustible DISTINTO al habitual del vehículo
                asignado = probable carga mal asignada */}
            {fuelMismatch && (
              <span style={{ color: '#E65100', fontWeight: 700 }}> · {FUEL_LABELS[l.fuel_type] || l.fuel_type} ≠ su habitual, ¿de otro vehículo?</span>
            )}
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 120,
          fontSize: 10.5, fontWeight: 800, color: name ? ink : '#E65100',
          background: dark ? 'rgba(255,255,255,.08)' : '#fff', borderRadius: 20, padding: '5px 9px',
        }}>
          {dot && <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flexShrink: 0 }} />}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || 'Sin vehículo'}</span>
        </span>
        {l.source === 'manual' && (
          <button aria-label="Borrar registro" onClick={onDel} style={{
            ...iconBtn(false), background: delArmed ? '#C62828' : soft, color: delArmed ? '#fff' : sub,
          }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.8 10h6.4L12 4M6.7 7v4.5M9.3 7v4.5" />
            </svg>
          </button>
        )}
        {canReassign && vehicles.length > 0 && (
          <button aria-label="Corregir vehículo" onClick={onToggleEdit} style={iconBtn(editOpen)}>
            <svg width="14" height="14" viewBox="0 0 16 16"><path d="M11.3 1.7a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L5.8 13.2 2 14l.8-3.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>

      {/* E3f: pastilla del estado "tanque lleno" (tap = corregir) */}
      {l.vehicle_id && (
        <div style={{ marginTop: 7 }}>
          <button onClick={canMarkFull ? onToggleFullOpen : undefined} aria-label="Estado del tanque" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 20,
            border: 'none', cursor: canMarkFull ? 'pointer' : 'default',
            background: isFull ? (dark ? 'rgba(129,199,132,.16)' : 'rgba(46,125,50,.10)') : soft,
            color: isFull ? (dark ? '#81C784' : '#2E7D32') : sub,
            fontFamily: "'DM Sans'", fontSize: 10.5, fontWeight: 800,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: isFull ? (dark ? '#81C784' : '#2E7D32') : sub, opacity: l.full_tank == null && !inferred ? .4 : 1 }} />
            {fullLabel}{canMarkFull ? ' ›' : ''}
          </button>
        </div>
      )}
      {fullOpen && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: line }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: sub, marginBottom: 7 }}>¿Quedó el tanque lleno con esta carga?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {[{ v: true, t: 'Sí, lleno' }, { v: false, t: 'No, parcial' }, { v: null, t: 'No sé' }].map(o => (
              <button key={String(o.v)} disabled={busy} onClick={() => onSetFull(o.v)}
                style={{ ...opt(l.full_tank === o.v), opacity: busy ? .6 : 1 }}>{o.t}</button>
            ))}
          </div>
        </div>
      )}

      {editOpen && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: line }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: sub, marginBottom: 7 }}>¿A qué vehículo pertenece esta carga?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {vehicles.map(x => (
              <button key={x.id} disabled={busy} onClick={() => onReassign(x.id)} style={{
                ...opt(x.id === l.vehicle_id), display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 12, opacity: busy ? .6 : 1,
              }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: x.color || '#9E9E9E' }} />
                {vehName(x.id)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
