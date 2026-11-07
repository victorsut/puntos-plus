// Arnés de verificación visual de la TARJETA DE NIVEL (TierCardBento) en
// los tres niveles (UX-34, 7-nov-2026: PLATINO con tinta oscura, ORO con
// sombra suave bajo el texto) + cifras con formato (UX-38) + tarjeta de
// avisos push con contexto (UX-28, PushPromptCard: se muestra si el
// navegador soporta push y el permiso está en 'default').
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      http://localhost:3100/tools/harness/tiercard.html?dark=1
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import TierCardBento from '../../src/components/ui/TierCardBento';
import PushPromptCard from '../../src/components/ui/PushPromptCard';
import { makeTier } from '../../src/lib/tierSystem';
import { clientMainBg } from '../../src/constants/styles';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
const Panel = ({ tier, gal, points, label }) => {
  const cTier = makeTier(gal);
  return (
    <div style={{ width: 390, background: clientMainBg(tier, dark), paddingBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, padding: '8px 16px 0', color: dark ? '#fff' : '#000', opacity: .7 }}>{label}</div>
      <TierCardBento me={{ points, gallons: gal }} cTier={cTier} dark={dark} onOpenDetail={() => {}} onPointsTap={() => {}} />
    </div>
  );
};
createRoot(document.getElementById('root')).render(
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#333', padding: 8, width: 390, boxSizing: 'content-box' }}>
    <Panel tier="ORO" gal={92.6} points={12345} label="ORO · 92.6 gal → muestra 92 / 150 (faltan 58)" />
    <Panel tier="PLATINO" gal={310.2} points={2480} label={`PLATINO · ${dark ? 'blanco (modo oscuro)' : 'tinta oscura (modo claro)'}`} />
    <Panel tier="BLACK" gal={640} points={15890} label="BLACK · galaxia" />
    <div style={{ width: 390, background: clientMainBg('ORO', dark), paddingBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, padding: '8px 16px 0', color: dark ? '#fff' : '#000', opacity: .7 }}>UX-28 · PushPromptCard (si el permiso está en default)</div>
      <PushPromptCard memberId="x" dark={dark} fire={(m, t) => console.log('[toast]', t || '', m)} />
    </div>
  </div>
);
