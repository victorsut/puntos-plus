// src/components/ui/OfflineChip.jsx
// UX-27 (7-nov-2026): píldora fija arriba "Sin conexión" mientras el
// navegador reporta offline. Solo informa (los guardas de canje/compra ya
// usan navigator.onLine); desaparece sola al volver la red.
import useOnline from '../../hooks/useOnline';

export default function OfflineChip() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" style={{
      position: 'fixed', top: 'calc(10px + env(safe-area-inset-top, 0px))', left: '50%', transform: 'translateX(-50%)',
      zIndex: 9000, padding: '7px 14px', borderRadius: 20,
      background: '#0D0D0D', color: '#fff', fontFamily: "'DM Sans'", fontSize: 12.5, fontWeight: 800,
      display: 'flex', alignItems: 'center', gap: 8, animation: 'ppFade .25s ease', pointerEvents: 'none',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: '#FF8A80' }} />
      Sin conexión · algunos datos pueden estar desactualizados
    </div>
  );
}
