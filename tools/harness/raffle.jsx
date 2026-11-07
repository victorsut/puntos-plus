// Arnés de verificación visual de la vista RIFA con carrusel de meses
// (4-sep-2026). Monta ClientRaffle con un ctx simulado: 9 meses, premios
// con y sin imagen, ganadores y participantes. Sin Supabase.
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      http://localhost:3100/tools/harness/raffle.html?month=7&dark=1
//   ?nav=1 → monta la BottomNav real del cliente (misma jerarquía que
//            App.jsx: pantalla y barra hermanas) · ?buy=1 → abre el sheet
//            "Confirmar compra" (+1) — caso "compra en rifa.jpeg" de
//            POR CORREGIR (16-oct-2026): el sheet debe cubrir la barra.
//   ?nopub=1 → el mes actual sin rifa publicada (UX-20: sin "Valorado en Q0"
//            ni compra; tarjeta "aún no está publicada")
//   ?dec=1  → simula enero con diciembre del año anterior en crossYearWins
//            (UX-21: diciembre va de primero y el mes actual queda en idx 1)
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import ClientRaffle from '../../src/views/client/ClientRaffle';
import BottomNav from '../../src/components/ui/BottomNav';
import { House, Gift, TicketStar, Car } from '../../src/components/ui/Icons';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
const curMonth = 8; // septiembre
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const raffleCal = months.map((m, i) => ({
  m, name: i <= curMonth ? ['Tanque lleno', 'Casco', 'Llantas', 'Cambio de aceite', 'Combo lavado', 'Bocina', 'Tanque lleno', 'Casco', 'Llantas'][i] : null,
  icon: '🎁', img: null, v: `Q${(i + 1) * 100}`, cost: (i + 1) * 100, winnerId: i < curMonth && i !== 3 ? `u${i}` : null,
  // UX-20: ?nopub=1 → el mes actual NO tiene fila en raffle_calendar
  dbId: q.get('nopub') === '1' && i === curMonth ? null : `rf${i}`,
  year: 2026, ticketPts: null,
}));
const rafData = months.map((_, i) => ({
  participants: i > curMonth || i === 3 ? [] : [
    { cid: 'me', name: 'Víctor', tickets: 2 + i, avatar: null },
    { cid: `u${i}`, name: 'Ezer M.', tickets: 3, avatar: null },
    { cid: 'x', name: 'Fernando M.', tickets: 1, avatar: null },
    ...Array.from({ length: 25 }, (_, k) => ({ cid: 'p' + i + '_' + k, name: 'Socio ' + (k + 1), tickets: 1 + (k % 4), avatar: null })),
  ],
}));
const dec = q.get('dec') === '1';
const ctx = {
  me: { id: 'me', points: 120 }, cfg: { ticketPts: 5 }, cTier: { name: dark ? 'BLACK' : 'ORO' },
  raffleCal, rafData, buyTickets: () => {}, curMonth: dec ? 0 : curMonth, custs: [], dark,
  crossYearWins: dec ? [{ m: 'Diciembre', name: 'Moto 125cc', icon: '🏍️', img: null, v: 'Q12,000', cost: 12000, winnerId: 'u3', dbId: 'rfdec', month: 12, year: new Date().getFullYear() - 1 }] : [],
};

// ?month=N → arranca en ese mes (el arnés no puede arrastrar)
const start = q.get('month');
const navItems = [
  { id: 'home', label: 'Inicio', icon: <House /> },
  { id: 'cat', label: 'Canjes', icon: <Gift /> },
  { id: 'qr', label: '', icon: null, isQR: true },
  { id: 'raf', label: 'Rifa', icon: <TicketStar /> },
  { id: 'veh', label: 'Vehículos', icon: <Car /> },
];
const Wrapped = () => {
  const c = { ...ctx };
  return (
    <>
      <ClientRaffle {...c} />
      {q.get('nav') === '1' && <BottomNav items={navItems} current="raf" onSelect={() => {}} view="client" tierName={ctx.cTier.name} dark={dark} />}
    </>
  );
};
if (q.get('buy') === '1') setTimeout(() => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '+1')?.click(); }, 700);
document.body.style.background = dark ? '#0B0B0D' : '#F7F7F9';
if (q.get('scroll')) setTimeout(() => { const el = document.querySelector('#root > div > div'); if (el) el.scrollTop = +q.get('scroll'); }, 600);
createRoot(document.getElementById('root')).render(<div style={{ width: 390 }}><Wrapped /></div>);
if (start != null) {
  // simular el tap en ‹ hasta llegar al mes pedido (usa el mismo go() del hook)
  setTimeout(() => {
    const n = curMonth - Number(start);
    for (let i = 0; i < n; i++) document.querySelector('[aria-label="Mes anterior"]')?.click();
  }, 300);
}
