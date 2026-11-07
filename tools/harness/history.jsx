// Arnés de verificación visual del historial (4-sep-2026): filtros
// compactos (fila única de períodos + embudo de tipo con menú).
//   ?type=compras|canjes  ·  ?dark=1  ·  ?open=1 (menú abierto)
//   ?filter=canje (tipo preseleccionado)
//   ?qr=1 (abre el QR del canje pendiente, UX-16/18) · ?bar=1 (barra inferior
//   falsa z 100 como la BottomNav: el sheet del QR debe quedar ENCIMA)
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      http://localhost:3100/tools/harness/history.html?type=compras&open=1
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import HistorySheet from '../../src/views/client/HistorySheet';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
const type = q.get('type') || 'compras';

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
const d = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const acts = [
  { type: 'compra', desc: 'Compra 2.4 gal súper · Q108', pts: 10, date: today, station: 'Turkaj I' },
  { type: 'canje', desc: 'Café americano', pts: -40, date: d(2) },
  { type: 'rifa', desc: 'Compró 1 boleto de rifa', pts: -5, date: d(3) },
  { type: 'encuesta', desc: 'Encuesta de satisfacción', pts: 3, date: d(5) },
  { type: 'compra', desc: 'Compra 5.1 gal regular · Q214', pts: 21, date: d(12) },
  { type: 'evento', desc: 'Bono de cumpleaños', pts: 25, date: d(40) },
  { type: 'compra', desc: 'Compra 3.0 gal diésel · Q144', pts: 14, date: d(70) },
  { type: 'registro', desc: 'Bienvenida', pts: 15, date: d(400) },
  // ?long=1 → 40 compras más (una por semana) para probar el bloque pegajoso
  ...(q.get('long') === '1' ? Array.from({ length: 40 }, (_, i) => ({ type: 'compra', desc: `Compra ${(1 + i % 5).toFixed(1)} gal regular · Q${60 + i}`, pts: 6 + (i % 5), date: d(7 * (i + 1)) })) : []),
];
const redeemed = [
  { id: 'r1', rewardId: 'rw1', reward: { name: 'Café americano', cat: 'shell' }, cost: 40, date: d(2), collected: false, code: 'TK-1234' },
  { id: 'r2', name: 'Lavado básico', cost: 120, date: d(20), collected: true },
  { id: 'r3', name: 'Gorra Turkaj', cost: 200, date: d(80), collected: true },
];

function Harness() {
  useEffect(() => {
    if (q.get('open') === '1' || q.get('filter')) setTimeout(() => document.querySelector('[aria-label="Filtrar por tipo"]')?.click(), 200);
    if (q.get('chip')) setTimeout(() => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === q.get('chip'))?.click(); }, 150);
    if (q.get('scroll')) setTimeout(() => { const el = document.querySelector('.pp-grow'); if (el) el.scrollTop = +q.get('scroll'); }, 400);
    if (q.get('filter')) setTimeout(() => { [...document.querySelectorAll('[role=menuitemradio]')].find(b => b.textContent.trim().toLowerCase().startsWith(q.get('filter')))?.click(); }, 500);
    if (q.get('qr') === '1') setTimeout(() => { [...document.querySelectorAll('div')].reverse().find(el => el.textContent.includes('TK-1234') && el.textContent.includes('VER QR'))?.click(); }, 500);
  }, []);
  return (
    <HistorySheet
      type={type} onClose={() => {}} acts={acts} redeemed={redeemed}
      tierName={dark ? 'BLACK' : 'ORO'} dark={dark}
      accent={dark ? '#D8A94E' : undefined} accentInk={dark ? '#141417' : undefined}
      rewards={[{ id: 'rw1', station_ids: ['s2'], store_ids: ['t1'] }]}
      stations={[{ id: 's2', name: 'Turkaj II' }]} stores={[{ id: 't1', name: 'Betel' }]}
    />
  );
}
document.body.style.background = dark ? '#0B0B0D' : '#F5F5F7';
createRoot(document.getElementById('root')).render(<div style={{ width: 390, height: 800 }}><Harness /></div>);
if (q.get('bar') === '1') {
  const bar = document.createElement('div');
  bar.textContent = 'BARRA INFERIOR (z 100)';
  Object.assign(bar.style, { position: 'fixed', left: 0, right: 0, bottom: 0, height: '55px', zIndex: 100, background: '#0D0D0D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 });
  document.body.appendChild(bar);
}
