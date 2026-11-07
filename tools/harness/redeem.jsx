// Arnés del SHEET DE CONFIRMACIÓN DE CANJE (RedeemConfirmSheet) — UX-03
// (7-nov-2026): con ?busy=1 la hoja queda en "Procesando…" con los botones
// deshabilitados (estado mientras la RPC viaja al servidor).
//   ?dark=1 · ?busy=1 · ?clicks=1 (simula tres toques seguidos en Confirmar
//   y escribe en consola cuántas veces llegó onConfirm)
//   ?request=1 monta RedeemConfirmRequestModal (solicitud del POS); con
//   ?back=1 dispara history.back() a los 900 ms (UX-15 → equivale a Cancelar:
//   escribe "[close]" y el toast "Canje cancelado" o el error sin sesión)
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/styles/global.css';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';

const { default: RedeemConfirmSheet } = await import('../../src/components/RedeemConfirmSheet');
const { default: RedeemConfirmRequestModal } = await import('../../src/components/RedeemConfirmRequestModal');

window.__confirms = 0;
function Harness() {
  const [busy, setBusy] = useState(q.get('busy') === '1');
  const [count, setCount] = useState(0);
  const onConfirm = () => {
    // Mismo contrato que AppModals: la hoja queda busy hasta que la RPC
    // termina. A propósito SIN candado propio: la prueba de 3 toques mide
    // la protección del sheet (ref) — debe llegar UNA sola vez.
    window.__confirms += 1; setCount(c => c + 1); setBusy(true);
    setTimeout(() => setBusy(false), 2500);
  };
  if (q.get('request') === '1') {
    return (
      <div style={{ minHeight: '100vh', background: dark ? '#0D0D0F' : '#EEE' }}>
        <RedeemConfirmRequestModal
          dark={dark} fire={(m, t) => console.log('[toast]', t || '', m)}
          pending={{ redemptionId: 'rd1', rewardName: 'Lavado VIP + Shampoo Cera', cost: 250, reward: { name: 'Lavado VIP + Shampoo Cera', cat: 'servicio' } }}
          onClose={() => console.log('[close] modal cerrado')} onConfirmed={() => console.log('[confirmed]')}
        />
      </div>
    );
  }
  return (
    <div style={{ minHeight: '100vh', background: dark ? '#0D0D0F' : '#EEE' }}>
      <div style={{ padding: 16, fontSize: 13, color: dark ? '#fff' : '#000' }}>onConfirm llamado: <b id="count">{count}</b> veces</div>
      <RedeemConfirmSheet
        dark={dark} busy={busy} me={{ points: 300 }} stations={[]} stores={[]}
        data={{ reward: { id: 'r1', name: 'Lavado VIP + Shampoo Cera', cat: 'servicio', description: 'Lavado exterior e interior con shampoo y cera.' }, cost: 250 }}
        onClose={() => console.log('[close]')} onConfirm={onConfirm}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
if (q.get('back') === '1') setTimeout(() => { console.log('[harness] history.back()'); history.back(); }, 900);
if (q.get('clicks') === '1') setTimeout(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /Confirmar Canje|Procesando/.test(b.textContent));
  btn.click(); btn.click(); btn.click();
  setTimeout(() => console.log('[harness] confirmaciones tras 3 toques:', window.__confirms), 300);
}, 800);
