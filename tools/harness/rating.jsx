// Arnés de verificación visual del MODAL DE CALIFICACIÓN de una compra
// (OpRatingModal) con las tres preguntas del vehículo: carga asignada a,
// kilómetros recorridos y ¿llenaste el tanque? (22-sep-2026).
//   ?dark=1 · ?km=1 (con km menor a los últimos → aviso)
// Los vehículos llegan por window.__PP_MOCK_VEHICLES (plugin del config
// del arnés) — sin sesión de Supabase.
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      http://localhost:3100/tools/harness/rating.html
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
window.__PP_MOCK_VEHICLES = [
  { id: 'v1', vtype: 'moto', brand: 'Honda', model: 'Navi', plate: 'M033LDJ', km: 19120 },
  { id: 'v2', vtype: 'auto', brand: 'Toyota', model: 'Corolla', plate: 'P123ABC', km: 84500 },
];

const { default: OpRatingModal } = await import('../../src/components/OpRatingModal');

function Harness() {
  return (
    <div style={{ minHeight: '100vh', background: dark ? '#0D0D0F' : '#EEE' }}>
      <OpRatingModal
        dark={dark} sbConnected memberId="m1" fire={(m) => console.log('[toast]', m)}
        data={{ purchaseId: 'p1', operatorId: 'o1', operatorName: 'Juan Pérez', stationName: 'Turkaj I', points: 35, amount: 320 }}
        cfg={{ surveyDaily: 5, surveyPts: 3 }} mySurveyCount={0}
        surveyPending={null} setSurveyPending={() => {}} onClose={() => {}}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
if (q.get('km') === '1') setTimeout(() => {
  const inp = document.querySelector('input[inputmode="numeric"]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(inp, '18000'); inp.dispatchEvent(new Event('input', { bubbles: true }));
}, 600);
