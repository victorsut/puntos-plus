// src/components/ui/FeatureGate.jsx
// Compuerta de una pestaña del cliente en BETA controlada (16-oct-2026).
// `features` viene del ctx (hooks/useMemberFeatures): null = aún se
// consulta al servidor → spinner (nunca un parpadeo del placeholder);
// false → `soon` (PRÓXIMAMENTE); true → la vista real.
import LogoSpinner from './LogoSpinner';

export default function FeatureGate({ features, feature, dark, soon, children }) {
  if (!features) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LogoSpinner size={44} dark={dark} />
      </div>
    );
  }
  return features[feature] ? children : soon;
}
