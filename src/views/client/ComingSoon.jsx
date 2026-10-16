// src/views/client/ComingSoon.jsx
// Placeholder PRÓXIMAMENTE de una pestaña del cliente en BETA
// controlada (16-oct-2026): icono sobre el color del cuadro del inicio
// de la sección, rótulo naranja, título y texto. Ambos modos (las
// superficies siguen `dark`; el color del icono es identidad del
// tier y no cambia). `children` = contenido extra bajo el texto (p. ej.
// la lista de vehículos registrados). Sin botón "Volver al inicio": la
// vista es pestaña de la barra inferior (regla E1.26).
import { BRAND_ORANGE } from '../../constants/styles';

export default function ComingSoon({ dark, color, icon, title, text, tourId = null, children }) {
  const header = dark ? '#fff' : '#0D0D0D';
  const sub = dark ? 'rgba(255,255,255,.5)' : '#9E9E9E';
  return (
    <div data-tour={tourId || undefined} style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px 120px', textAlign: 'center' }}>
      <div className="pp-tile" style={{
        width: 96, height: 96, borderRadius: 24, background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: BRAND_ORANGE, textTransform: 'uppercase', marginBottom: 8 }}>
        Próximamente
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: header, lineHeight: 1.25, marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: sub, lineHeight: 1.6, maxWidth: 300 }}>
        {text}
      </div>
      {children}
    </div>
  );
}
