// src/views/client/vehicles/FuelEventRow.jsx
// F6 E3g (21-sep-2026, pedido del dueño): fila de MOVIMIENTO del
// vehículo en el Historial del vehículo — servicio realizado, alta,
// edición de datos y silencio de recordatorios (tabla vehicle_events,
// RPC list_my_vehicle_events). Se intercala con las cargas por fecha;
// visualmente es más liviana (icono en cuadro + una línea) para que
// las cargas sigan siendo lo principal.
import { FUEL_LABELS } from '../../../constants/config';
import { VEHICLE_TYPES } from '../../../components/ui/VehicleIcons';
import { fmtN, fmtDay } from './fuelFmt';

const FIELD = {
  vtype: 'Tipo', brand: 'Marca', model: 'Modelo', version: 'Versión', color: 'Color', plate: 'Placa',
  km: 'Km recorridos', oil_type: 'Aceite', next_service: 'Próximo servicio',
  next_service_km: 'Próximo servicio (km)', tank_gal: 'Tanque', fuel_pref: 'Combustible habitual',
};
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const val = (k, v) => {
  if (v == null || v === '') return '—';
  if (k === 'km' || k === 'next_service_km') return `${fmtN(v, 0)} km`;
  if (k === 'tank_gal') return `${fmtN(v)} gal`;
  if (k === 'fuel_pref') return FUEL_LABELS[v] || v;
  if (k === 'next_service') return fmtDate(v);
  if (k === 'vtype') return VEHICLE_TYPES.find(t => t.k === v)?.label || v;
  return String(v);
};

// Título + detalle por tipo de evento
export function describeEvent(e) {
  const d = e.data || {};
  switch (e.event_type) {
    case 'service': {
      const next = [d.next_service ? `el ${fmtDate(d.next_service)}` : null,
        d.next_service_km != null ? `a los ${fmtN(d.next_service_km, 0)} km` : null].filter(Boolean).join(' o ');
      return {
        title: 'Servicio realizado',
        detail: [d.km != null ? `${fmtN(d.km, 0)} km` : null, next ? `Próximo ${next}` : null].filter(Boolean).join(' · ') || null,
        tone: 'green',
      };
    }
    case 'created':
      return { title: 'Vehículo agregado', detail: [d.brand, d.model].filter(Boolean).join(' ') || null, tone: 'blue' };
    case 'alerts_muted':
      return { title: d.muted ? 'Recordatorios silenciados' : 'Recordatorios activados', detail: null, tone: 'gray' };
    case 'updated': {
      const ch = d.changes || {};
      const parts = Object.keys(ch).filter(k => FIELD[k]).map(k => `${FIELD[k]} ${val(k, ch[k].to)}`);
      return { title: 'Datos actualizados', detail: parts.join(' · ') || null, tone: 'gray' };
    }
    default:
      return { title: e.event_type, detail: null, tone: 'gray' };
  }
}

const TONES = {
  green: { light: ['rgba(46,125,50,.10)', '#2E7D32'], dark: ['rgba(129,199,132,.16)', '#81C784'] },
  blue:  { light: ['rgba(21,101,192,.10)', '#1565C0'], dark: ['rgba(100,181,246,.16)', '#64B5F6'] },
  gray:  { light: ['#fff', '#757575'], dark: ['rgba(255,255,255,.1)', 'rgba(255,255,255,.6)'] },
};

function Icon({ type }) {
  const p = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (type === 'service') return <svg {...p}><path d="M10.5 2.5a3.5 3.5 0 0 1 3 5.2L7 14.2l-1.8-1.8 6.5-6.5a1.4 1.4 0 0 0-2-2L3.2 10.5 1.8 9 8.3 2.5a3.5 3.5 0 0 1 2.2 0Z" /></svg>;
  if (type === 'created') return <svg {...p}><path d="M8 3v10M3 8h10" /></svg>;
  if (type === 'alerts_muted') return <svg {...p}><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11ZM6.5 14h3" /></svg>;
  return <svg {...p}><path d="M11.3 1.7a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L5.8 13.2 2 14l.8-3.8Z" /></svg>;
}

export default function FuelEventRow({ e, dark, ink, sub, cardBg, name, dot }) {
  const { title, detail, tone } = describeEvent(e);
  const [bg, fg] = TONES[tone][dark ? 'dark' : 'light'];
  return (
    <div style={{ background: cardBg, borderRadius: 15, padding: '9px 13px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 10, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon type={e.event_type} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: ink }}>
          {fmtDay(e.created_at)}<span style={{ color: sub, fontWeight: 600 }}> · {title}</span>
        </div>
        {detail && <div style={{ fontSize: 10.5, color: sub, fontWeight: 600, marginTop: 1, lineHeight: 1.45 }}>{detail}</div>}
      </div>
      {name && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 120, flexShrink: 0,
          fontSize: 10.5, fontWeight: 800, color: ink,
          background: dark ? 'rgba(255,255,255,.08)' : '#fff', borderRadius: 20, padding: '5px 9px',
        }}>
          {dot && <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flexShrink: 0 }} />}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </span>
      )}
    </div>
  );
}
