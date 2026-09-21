// Arnés de verificación visual del TUTORIAL INTERACTIVO (21-sep-2026):
// réplica simplificada del inicio del cliente (encabezado con sus 3
// botones, tarjeta de puntos, cuadros y barra inferior) con las mismas
// anclas data-tour, y el motor ClientTour montado encima.
//   ?step=N (0..10) paso inicial · ?dark=1 · ?short=1 (viewport corto)
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      http://localhost:3100/tools/harness/tour.html?step=2
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import ClientTour from '../../src/components/tour/ClientTour';
import { TOUR_STEPS } from '../../src/components/tour/tourSteps';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
const start = Math.max(0, Math.min(TOUR_STEPS.length - 1, parseInt(q.get('step') || '0', 10)));

const ink = dark ? '#fff' : '#0D0D0D';
const tile = (id, color, title, sub, style = {}) => (
  <div data-tour={id} className="pp-tile" style={{ background: color, color: '#fff', borderRadius: 20, padding: 16, minHeight: 96, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', ...style }}>
    <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase' }}>{title}</div>
    <div style={{ fontSize: 11.5, opacity: .9 }}>{sub}</div>
  </div>
);
const hbtn = (id, label) => (
  <button data-tour={id} aria-label={label} style={{ width: 42, height: 42, border: 'none', background: 'none', color: ink, fontSize: 18 }}>{label[0]}</button>
);
const nbtn = (id, label) => (
  <button data-tour={id} style={{ flex: 1, background: 'none', border: 'none', color: ink, fontSize: 10.5, fontWeight: 700, padding: '4px 0' }}>■<br />{label}</button>
);

// El motor arranca en el paso 0; para el arnés forzamos el paso inicial
// avanzando con el botón "Siguiente" tras montar.
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ minHeight: '100vh', background: dark ? '#0D0D0F' : '#fff', color: ink, fontFamily: "'DM Sans'", maxWidth: 480, margin: '0 auto', paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 6px' }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 800 }}>¡Hola, Ezer!</div>
        {hbtn('header-help', 'Ayuda')}{hbtn('header-bell', 'Notificaciones')}{hbtn('header-menu', 'Menú')}
      </div>
      <div data-tour="pts-card" className="pp-tile" style={{ margin: '12px 16px 0', borderRadius: 20, padding: '18px 20px', background: dark ? '#2A2A30' : '#8E8E93', color: '#fff', display: 'flex' }}>
        <div style={{ flex: 1 }}><div>Nivel <b>PLATINO</b></div><div style={{ height: 7, background: 'rgba(255,255,255,.3)', borderRadius: 4, margin: '12px 0 8px' }} /><div style={{ fontSize: 12.5 }}>173 / 500 gal</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 44, fontWeight: 800 }}>576</div><div style={{ fontSize: 12, fontWeight: 800 }}>PUNTOS</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, padding: '12px 16px 0' }}>
        {tile('tile-promos', '#C62828', 'Promociones', 'Descubre ofertas', { aspectRatio: '1 / 1' })}
        {tile('tile-vehicle', '#A07A20', 'Vehículo', 'Administra tus vehículos', { aspectRatio: '1 / 1' })}
        {tile('tile-wifi', '#4A52A3', 'WiFi', 'Conéctate gratis')}
        {tile('tile-survey', '#F0E1A4', 'Encuesta de Satisfacción', '0/5 hoy · +3 pts', { color: '#8F6E1C' })}
        {tile('tile-map', '#2E7D32', 'Ubicación', 'Ubica nuestras estaciones')}
        {tile('tile-redeems', '#00897B', 'Historial de Canjes', '9 canjes')}
        {tile('tile-purchases', '#37474F', 'Historial de Compras', 'Todos tus movimientos', { gridColumn: '1 / -1', minHeight: 64 })}
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, height: 64, background: dark ? '#16161A' : '#fff', borderTop: '1px solid rgba(0,0,0,.08)', display: 'flex', alignItems: 'center', zIndex: 100 }}>
        {nbtn('nav-home', 'Inicio')}{nbtn('nav-cat', 'Canjes')}
        <button data-tour="nav-qr" style={{ flex: 1, background: 'none', border: 'none', marginTop: -26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: ink, fontSize: 10.5, fontWeight: 700 }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#0D0D0D', border: '3px solid #fff' }} />Código QR
        </button>
        {nbtn('nav-raf', 'Rifa')}{nbtn('nav-veh', 'Vehículos')}
      </div>
      {open && <ClientTour dark={dark} onClose={() => setOpen(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
// avanzar al paso pedido (?step=N) con clics en "Siguiente"
if (start > 0) {
  let k = 0;
  const tick = () => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Siguiente');
    if (btn && k < start) { btn.click(); k++; }
    if (k < start) setTimeout(tick, 120);
  };
  setTimeout(tick, 400);
}
