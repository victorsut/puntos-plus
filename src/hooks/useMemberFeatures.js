// src/hooks/useMemberFeatures.js
// Beta de secciones (16-oct-2026): qué pestañas del cliente están
// habilitadas para el socio logueado — { vehicles, raffle } — según
// el SERVER (get_my_features). `null` mientras se consulta (las vistas
// pintan un spinner, nunca el placeholder por un parpadeo); sin
// servidor o sin la migración queda TODO bloqueado (fail closed).
// Se vuelve a preguntar al cambiar de socio o al volver la app al
// frente (el admin pudo habilitarlo entre medio; el vencimiento de un
// probador también se evalúa en el servidor en cada consulta).
import { useEffect, useState } from 'react';
import { getMyFeatures, LOCKED_FEATURES } from '../services/featureService';

export default function useMemberFeatures({ meId, loggedIn }) {
  const [features, setFeatures] = useState(null);
  const ready = loggedIn && !!meId && !String(meId).startsWith('temp-');

  useEffect(() => {
    if (!ready) { setFeatures(null); return; }
    let alive = true;
    const load = () => {
      getMyFeatures().then(({ data }) => {
        if (!alive) return;
        const f = data?.ok ? data.features : null;
        setFeatures(f ? { vehicles: f.vehicles === true, raffle: f.raffle === true } : LOCKED_FEATURES);
      });
    };
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [ready, meId]);

  return ready ? features : null;
}
