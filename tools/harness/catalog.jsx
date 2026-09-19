// Arnés de verificación visual de la pestaña CANJES (Catalog, cliente)
// con título + categorías PEGAJOSOS (4-sep-2026).
//   ?dark=1  ·  ?scroll=N (desplaza la lista de premios)
//   ?recal=1&tier=ORO|PLATINO|BLACK  catálogo recalibrado (19-sep) con premios
//            de nivel mínimo: los bloqueados van AL FINAL de la lista
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      http://localhost:3100/tools/harness/catalog.html?scroll=600
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import Catalog from '../../src/views/shared/Catalog';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
const cats = ['combustible', 'servicio', 'merch', 'cultural', 'shell', 'premium'];
const rewards = Array.from({ length: 18 }, (_, i) => ({
  id: 'r' + i, name: ['Café americano', 'Lavado básico', 'Gorra', 'Tanque lleno', 'Cambio de aceite', 'Camisa'][i % 6] + ' ' + (i + 1),
  pts: 40 + i * 25, cat: cats[i % cats.length], icon: '🎁', active: true, desc: 'Premio de prueba',
}));

// Recalibración (19-sep): precios nuevos + premios con nivel mínimo
const tierQ = (q.get('tier') || (dark ? 'BLACK' : 'ORO')).toUpperCase();
const recal = [
  ['Vale Q10 Combustible', 100, 'combustible', null], ['Lavado Premium Interior', 400, 'servicio', 'PLATINO'],
  ['Lavado Estandar', 150, 'servicio', null], ['Kit Shell Premium', 650, 'shell', 'BLACK'],
  ['Vale Q25 Combustible', 250, 'combustible', null], ['Lavado VIP + Shampoo Cera', 250, 'servicio', null],
  ['Cambio de aceite', 900, 'servicio', 'PLATINO'], ['Vale Q50 Combustible', 500, 'combustible', null],
  ['Vale Q100 Combustible', 1000, 'combustible', null],
].map(([name, pts, cat, minTier], i) => ({ id: 'c' + i, name, pts, cat, minTier, icon: '🎁', active: true }));

function Harness() {
  const [catF, setCatF] = useState('todos');
  const ctx = {
    rewards: q.get('recal') ? recal : rewards, me: { id: 'me', points: 300, gallons: 20 }, gT: () => ({ name: tierQ, redeemDisc: 0 }),
    cfg: { qPerPt: 10 }, cTier: { name: tierQ }, catF, setCatF,
    redeem: () => {}, setRedeemConfirm: () => {}, client: true, redeemedList: [], activityLog: [],
    dark, showQR: false, stations: [], stores: [],
  };
  return <Catalog {...ctx} />;
}
document.body.style.background = dark ? '#0B0B0D' : '#F7F7F9';
if (q.get('scroll')) setTimeout(() => { const el = document.querySelector('#root > div > div'); if (el) el.scrollTop = +q.get('scroll'); }, 600);
createRoot(document.getElementById('root')).render(<div style={{ width: 390 }}><Harness /></div>);
