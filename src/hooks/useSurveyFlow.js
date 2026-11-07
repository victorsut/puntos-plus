// src/hooks/useSurveyFlow.js
// Flujo de la Encuesta de Satisfacción (extraído de ClientHome en la
// división 14-ago): encuesta pendiente persistida en localStorage
// pp_survey_pending, reclamo de puntos y modal de resultado.
//
// La espera se asume completada tras SURVEY_WAIT segundos en la página
// de Shell (el cliente NO ve el tiempo — sin contadores). Compartida
// entre SurveyStationsModal y OpRatingModal (paso 2). Persiste en
// localStorage: en móvil el SO suele RECARGAR la PWA mientras el
// cliente pasa el tiempo en Shell; sin persistencia el estado moría y
// los puntos nunca se otorgaban.
//
// UX-06 (7-nov-2026): el hook vive en App.jsx (raíz) y los modales en
// AppModals — antes vivían en ClientHome y solo resolvían en la pestaña
// Inicio. UX-04: la pendiente se borra SOLO cuando el servidor acredita;
// si el reclamo falla por RED queda marcada `due` y se reintenta sola
// (foco / visibilidad / intervalo, con pausa RETRY_GAP, hasta
// MAX_ATTEMPTS). Antes se borraba ANTES de llamar a la RPC y un fallo
// al volver de Shell perdía los puntos con solo un toast de 3 s.
import { useState, useEffect, useRef, useCallback } from 'react';
import { SURVEY_WAIT } from '../constants/config';

const RETRY_GAP = 15000;  // ms mínimos entre reintentos automáticos
const MAX_ATTEMPTS = 12;  // luego se rinde con modal "failed" (asistencia)

export default function useSurveyFlow({ me, doSurvey, setShowSurveys }) {
  // { openedAt, stationName, due?, attempts?, lastTry? }
  const [surveyPending, setSurveyPendingState] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem('pp_survey_pending'));
      return (p && typeof p.openedAt === 'number') ? p : null;
    } catch { return null; }
  });
  const setSurveyPending = useCallback((p) => {
    setSurveyPendingState(p);
    try {
      if (p) localStorage.setItem('pp_survey_pending', JSON.stringify(p));
      else localStorage.removeItem('pp_survey_pending');
    } catch { /* storage no disponible (in-app browsers) */ }
  }, []);

  // Resultado de la encuesta — modal PERSISTENTE (14-ago): el toast se
  // perdía cuando la recarga de la PWA reclamaba los puntos durante el
  // boot. Tipos: success · early · retry (UX-04) · failed (UX-04).
  const [surveyResult, setSurveyResult] = useState(null);
  const claimingRef = useRef(false);
  const claimSurvey = useCallback(async (p) => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    try {
      const res = await doSurvey();
      if (res?.ok) {
        setSurveyPending(null);
        setSurveyResult({ type: 'success', pts: res.pts, count: res.count, limit: res.limit, bonus: res.bonusTicket });
        return;
      }
      const attempts = (p?.attempts || 0) + 1;
      if (res?.network && attempts < MAX_ATTEMPTS) {
        // Sin red: conservar el crédito y reintentar; avisar UNA vez.
        setSurveyPending({ ...p, due: true, attempts, lastTry: Date.now() });
        if (attempts === 1) setSurveyResult({ type: 'retry' });
      } else {
        setSurveyPending(null);
        if (res?.network) setSurveyResult({ type: 'failed' });
        // Error de negocio (límite diario, sesión…): doSurvey ya mostró su toast.
      }
    } finally { claimingRef.current = false; }
  }, [doSurvey, setSurveyPending]);

  // Resolución de la espera — NO depende de un único evento (14-ago):
  // en la app instalada (TWA) volver de la pestaña de Shell NO dispara
  // visibilitychange (la página nunca se marcó hidden) y el reclamo
  // quedaba congelado hasta cambiar de app y volver. Tres vías:
  //  · visibilitychange→visible: reclama o CANCELA por vuelta temprana
  //    (única señal confiable de "el cliente volvió antes de tiempo");
  //  · focus + intervalo de 1s (suspendido por el SO en background,
  //    despierta al volver): SOLO reclaman al cumplirse el tiempo —
  //    sin señal de visibilidad no se puede saber si volvió antes,
  //    así que la espera simplemente corre hasta otorgar los puntos.
  // Con `due` (reclamo fallido por red) las tres vías REINTENTAN.
  useEffect(() => {
    if (!surveyPending || !me?.id) return;
    let done = false;
    const resolve = (allowEarlyCancel) => {
      if (done) return;
      if (surveyPending.due) {
        if (Date.now() - (surveyPending.lastTry || 0) < RETRY_GAP) return;
        done = true;
        claimSurvey(surveyPending); // actualiza surveyPending → el efecto se rearma
        return;
      }
      const elapsed = Math.floor((Date.now() - surveyPending.openedAt) / 1000);
      if (elapsed >= SURVEY_WAIT) {
        done = true;
        setShowSurveys(false);
        claimSurvey(surveyPending);
      } else if (allowEarlyCancel) {
        done = true;
        setSurveyPending(null);
        setShowSurveys(false);
        setSurveyResult({ type: 'early' });
      }
    };
    const onVis = () => { if (document.visibilityState === 'visible') resolve(true); };
    const onFocus = () => resolve(false);
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') resolve(false);
    }, 1000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [surveyPending, me?.id, claimSurvey, setShowSurveys, setSurveyPending]);

  // Resolución al montar (con la sesión ya lista): si la PWA se recargó
  // mientras el cliente estaba en Shell, la encuesta RESTAURADA (la que
  // existía en el primer render — nunca una recién creada por un tap)
  // SIEMPRE se resuelve: puntos si cumplió el tiempo, reintento si quedó
  // `due`, modal de "no completada" si volvió antes. Nunca queda una
  // espera atascada en silencio (causa del reporte del 14-ago).
  // No espera sbConnected: basta la sesión del miembro.
  const resumeSurveyRef = useRef(surveyPending);
  useEffect(() => {
    const p = resumeSurveyRef.current;
    if (!p || !me?.id || me.id.startsWith('temp-')) return;
    resumeSurveyRef.current = null; // una sola vez
    if (surveyPending !== p) return; // ya la resolvió el handler de visibilidad
    setShowSurveys(false);
    const elapsed = Math.floor((Date.now() - p.openedAt) / 1000);
    if (p.due || elapsed >= SURVEY_WAIT) claimSurvey(p);
    else { setSurveyPending(null); setSurveyResult({ type: 'early' }); }
  }, [surveyPending, me?.id, claimSurvey, setShowSurveys, setSurveyPending]);

  return { surveyPending, setSurveyPending, surveyResult, setSurveyResult };
}
