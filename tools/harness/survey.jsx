// Arnés de useSurveyFlow — UX-04 (7-nov-2026): el crédito de la encuesta
// NO se pierde si el reclamo falla por red. Siembra una encuesta pendiente
// ya cumplida (openedAt hace 2 min) y un doSurvey falso que falla por red
// las primeras N veces (?fails=N, defecto 2) y luego acredita.
//   ?fails=N · ?dark=1 · ?business=1 (el fallo es de NEGOCIO: no reintenta)
// Consola: [harness] intento k → red|negocio|ok · estado pendiente · modal.
// Resultado esperado con fails=2: 3 intentos, pendiente due entre ellos,
// modal 'retry' una vez y al final 'success' con pendiente null.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef } from 'react';
import '../../src/styles/global.css';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';
const FAILS = q.has('fails') ? +q.get('fails') : 2;
const BUSINESS = q.get('business') === '1';
localStorage.setItem('pp_survey_pending', JSON.stringify({ openedAt: Date.now() - 120000, stationName: 'Turkaj I' }));

const { default: useSurveyFlow } = await import('../../src/hooks/useSurveyFlow');
const { default: SurveyResultModal } = await import('../../src/components/SurveyResultModal');

// Acorta la pausa entre reintentos para la prueba (el hook usa 15 s):
// se adelanta lastTry al vencer el modal — ver abajo.
let attempts = 0;
async function fakeDoSurvey() {
  attempts += 1;
  await new Promise(r => setTimeout(r, 150));
  if (attempts <= FAILS) {
    console.log(`[harness] intento ${attempts} → ${BUSINESS ? 'negocio' : 'red'}`);
    return BUSINESS ? { ok: false } : { ok: false, network: true };
  }
  console.log(`[harness] intento ${attempts} → ok`);
  return { ok: true, pts: 10, count: 1, limit: 5, bonusTicket: false };
}

function Harness() {
  const { surveyPending, setSurveyPending, surveyResult, setSurveyResult } =
    useSurveyFlow({ me: { id: 'm1' }, doSurvey: fakeDoSurvey, setShowSurveys: () => {} });
  const shown = useRef(new Set());
  useEffect(() => {
    console.log('[harness] pendiente:', surveyPending ? JSON.stringify({ due: !!surveyPending.due, attempts: surveyPending.attempts || 0 }) : 'null');
    // Adelantar el reloj del reintento (RETRY_GAP 15 s → inmediato en el arnés)
    if (surveyPending?.due && Date.now() - surveyPending.lastTry < 14000) {
      setTimeout(() => setSurveyPending({ ...surveyPending, lastTry: Date.now() - 20000 }), 300);
    }
  }, [surveyPending, setSurveyPending]);
  useEffect(() => {
    if (surveyResult && !shown.current.has(surveyResult.type)) {
      shown.current.add(surveyResult.type);
      console.log('[harness] modal:', surveyResult.type);
    }
  }, [surveyResult]);
  return (
    <div style={{ minHeight: '100vh', background: dark ? '#0D0D0F' : '#EEE', padding: 16, color: dark ? '#fff' : '#000', fontSize: 13 }}>
      <div>intentos: <b>{attempts}</b> · pendiente: <b>{surveyPending ? (surveyPending.due ? 'due' : 'esperando') : 'null'}</b> · modal: <b>{surveyResult?.type || '—'}</b></div>
      {surveyResult && <SurveyResultModal result={surveyResult} dark={dark} onClose={() => setSurveyResult(null)} />}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
