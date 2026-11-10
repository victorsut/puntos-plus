// src/views/client/vehicles/FuelInvite.jsx
// 9-nov-2026 (pedido del dueño): el vehículo activo aún no tiene cargas →
// en lugar de seis cuadros con "—", una invitación a empezar a registrar.
// Los indicadores aparecen solos a medida que llegan cargas y km.
import { BRAND_ORANGE } from '../../../constants/styles';

export default function FuelInvite({ dark, ink, sub, cardBg, others = false }) {
  return (
    <div style={{ background: cardBg, borderRadius: 17, padding: '16px 16px 15px', marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden style={{
          width: 34, height: 34, borderRadius: 11, flexShrink: 0, color: BRAND_ORANGE,
          background: dark ? 'rgba(250,84,8,.16)' : 'rgba(250,84,8,.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* bomba de combustible */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 22V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v17" /><path d="M2 22h13" /><path d="M6 8h5" />
            <path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8.5L18 5.5" />
          </svg>
        </span>
        <div style={{ fontSize: 14, fontWeight: 800, color: ink }}>Empieza a medir tu consumo</div>
      </div>
      <div style={{ fontSize: 12, color: sub, fontWeight: 600, lineHeight: 1.55, marginTop: 9 }}>
        Carga en Turkaj y, al calificar tu compra, elige este vehículo y anota tus km recorridos.
        ¿Cargaste en otro lado? Regístralo abajo. Con tus cargas verás aquí el rendimiento,
        el costo por km, la autonomía y tu consumo por mes.
        {others && <> Ya tienes cargas en otros vehículos: ábrelas en el <b style={{ color: ink }}>Historial</b> y asígnale a este las que le correspondan.</>}
      </div>
    </div>
  );
}
