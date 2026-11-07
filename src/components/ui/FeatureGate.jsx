// src/components/ui/FeatureGate.jsx
// Compuerta de una pestaña del cliente en BETA controlada (16-oct-2026).
// `features` viene del ctx (hooks/useMemberFeatures): null = aún se
// consulta al servidor → spinner (nunca un parpadeo del placeholder);
// false → `soon` (PRÓXIMAMENTE); true → la vista real. UX-25 (7-nov):
// `features.error` (sin red y sin respuesta previa) → "No pudimos
// verificar tu acceso · Reintentar" en vez del placeholder (fail closed
// se mantiene: la vista real no se abre).
import LogoSpinner from './LogoSpinner';
import { BRAND_ORANGE } from '../../constants/styles';

export default function FeatureGate({ features, feature, dark, soon, children }) {
  if (!features) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LogoSpinner size={44} dark={dark} />
      </div>
    );
  }
  if (features[feature]) return children;
  if (features.error) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 28px 120px', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: dark ? '#fff' : '#0D0D0D', marginBottom: 8 }}>No pudimos verificar tu acceso</div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.6, color: dark ? 'rgba(255,255,255,.55)' : '#6E6E73', maxWidth: 300, marginBottom: 18 }}>
          Sin conexión con el servidor. Revisa tu internet y vuelve a intentar.
        </div>
        <button onClick={() => features.retry?.()} style={{
          padding: '13px 22px', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: BRAND_ORANGE, color: '#fff', fontFamily: "'DM Sans'", fontSize: 14, fontWeight: 800,
        }}>Reintentar</button>
      </div>
    );
  }
  return soon;
}
