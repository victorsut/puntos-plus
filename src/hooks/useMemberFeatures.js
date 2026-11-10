// src/hooks/useMemberFeatures.js
// Beta de secciones (16-oct-2026): qué pestañas del cliente están
// habilitadas para el socio logueado — { vehicles, raffle } — según
// el SERVER (get_my_features). `null` mientras se consulta (las vistas
// pintan un spinner, nunca el placeholder por un parpadeo); sin
// servidor o sin la migración queda TODO bloqueado (fail closed).
// Se vuelve a preguntar al cambiar de socio o al volver la app al
// frente (el admin pudo habilitarlo entre medio; el vencimiento de un
// probador también se evalúa en el servidor en cada consulta).
// UX-25 (7-nov-2026): un fallo de RED ya no se ve como "te quitaron la
// función": se usa la última respuesta conocida del servidor (caché de
// sesión por socio) y, si no hay ninguna, todo sigue bloqueado pero con
// `error: true` + `retry()` para que FeatureGate ofrezca Reintentar.
import { useEffect, useRef, useState } from 'react';
import { getMyFeatures, LOCKED_FEATURES } from '../services/featureService';

// 10-nov-2026 (Vehículos sin conexión): la última respuesta también vive
// en localStorage para que la PWA abierta SIN red (sessionStorage vacío)
// no bloquee la pestaña; solo decide qué se PINTA — el servidor sigue
// validando cada escritura. Se borra al cerrar sesión (clearFeaturesCache).
const cacheKey = (id) => `pp_features_${id}`;
const readCache = (id) => {
  try { return JSON.parse(sessionStorage.getItem(cacheKey(id)) || localStorage.getItem(cacheKey(id)) || 'null'); } catch { return null; }
};
const writeCache = (id, f) => {
  try { sessionStorage.setItem(cacheKey(id), JSON.stringify(f)); localStorage.setItem(cacheKey(id), JSON.stringify(f)); } catch { /* sin storage */ }
};
export function clearFeaturesCache() {
  try {
    for (const st of [localStorage, sessionStorage]) {
      for (let i = st.length - 1; i >= 0; i--) { const k = st.key(i); if (k && k.startsWith('pp_features_')) st.removeItem(k); }
    }
  } catch { /* noop */ }
}

export default function useMemberFeatures({ meId, loggedIn }) {
  const [features, setFeatures] = useState(null);
  const ready = loggedIn && !!meId && !String(meId).startsWith('temp-');
  const loadRef = useRef(() => {});

  useEffect(() => {
    if (!ready) { setFeatures(null); return undefined; }
    let alive = true;
    const load = () => {
      getMyFeatures().then(({ data }) => {
        if (!alive) return;
        const f = data?.ok ? data.features : null;
        if (f) {
          const next = { vehicles: f.vehicles === true, raffle: f.raffle === true };
          writeCache(meId, next);
          setFeatures(next);
          return;
        }
        // Respuesta de negocio sin features (migración pendiente) o fallo
        // de red: última conocida si existe; si no, bloqueado con error.
        const cached = readCache(meId);
        setFeatures(cached ? { ...cached, stale: true } : { ...LOCKED_FEATURES, error: true });
      });
    };
    loadRef.current = load;
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [ready, meId]);

  if (!ready || !features) return null;
  return { ...features, retry: () => loadRef.current() };
}
