// Arnés de la CONFIRMACIÓN DE SERVICIO (ServiceConfirmSheet) — UX-07
// (7-nov-2026): el km "al hacerlo" se valida con kmReadingProblem.
//   ?km=520000 (dedazo → aviso "¿Sobra un dígito?" y Guardar bloqueado)
//   ?km=51000  (menor que la ficha, fecha de hoy → aviso "menores que tu última lectura")
//   ?km=40000  (menor que el servicio anterior → aviso)
//   ?dark=1 · sin ?km → formulario limpio con el km de la ficha (52,000)
// Consola: [toast] … al tocar Guardar (el arnés lo toca solo con ?km).
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
const { default: ServiceConfirmSheet } = await import('../../src/views/client/vehicles/ServiceConfirmSheet');

const vehicle = {
  id: 'v1', vtype: 'auto', brand: 'Toyota', model: 'Corolla', plate: 'P123ABC',
  km: 52000, km_updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  last_service: '2026-05-01', last_service_km: 47000, next_service: '2026-11-01', next_service_km: 52000,
};
createRoot(document.getElementById('root')).render(
  <div style={{ minHeight: '100vh', background: dark ? '#0D0D0F' : '#EEE' }}>
    <ServiceConfirmSheet vehicle={vehicle} dark={dark} fire={(m, t) => console.log('[toast]', t || '', m)}
      onClose={() => console.log('[close]')} onSaved={(v) => console.log('[saved]', JSON.stringify(v))} />
  </div>,
);
setTimeout(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sí, ya lo hice')?.click();
  const km = q.get('km');
  if (!km) return;
  setTimeout(() => {
    const input = [...document.querySelectorAll('input')].find(i => i.inputMode === 'numeric');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, km);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar servicio')?.click(), 300);
  }, 400);
}, 600);
