// src/components/SplashIntro.jsx
// Animación de ENTRADA de la app — CONTROLADOR (10-nov-2026, pedido del
// dueño). La animación (lluvia de monedas PP 3D con estela y destello,
// moneda héroe con volteo, anillo naranja y wordmark PUNTOS PLUS; diseño
// del 15-ago sobre "REFERENCIAS INTERFAZ/idea intro.png") vive ahora en
// index.html como HTML + CSS puros: es LO PRIMERO que se pinta al abrir la
// app y se repite en bucle mientras baja el bundle y los datos del
// arranque. Antes estaba aquí, dentro del bundle, y mientras se descargaba
// solo se veía un isotipo estático.
//
// Este componente solo decide CUÁNDO retirarla:
// - cuando el arranque terminó (`ready`: datos de Supabase cargados) y ya
//   pasó al menos una pasada completa (MIN_MS), con fundido de salida;
// - un tap la salta en cualquier momento (evento de index.html);
// - tope de seguridad MAX_MS: nunca bloquea la app si el arranque se cuelga;
// - fuera de la vista cliente (`enabled` false) se retira de inmediato.
// La regla de cuándo APARECE (login en cada carga; con sesión, solo el
// arranque en frío — pp_splash_seen) la aplica index.html antes de pintar.
import { useEffect, useRef } from 'react';

const MIN_MS = 2400;   // una pasada completa de la coreografía
const MAX_MS = 9000;   // tope: la app nunca queda tapada
const FADE_MS = 380;   // fundido de salida (igual que el CSS de index.html)

export default function SplashIntro({ ready = false, enabled = true }) {
  const gone = useRef(false);

  const leave = (instant = false) => {
    if (gone.current) return;
    const el = document.getElementById('pp-splash');
    gone.current = true;
    if (!el) return;
    const remove = () => {
      el.remove();
      // index.html pinta el fondo perla para evitar el destello blanco;
      // al terminar se limpia para no asomar en el overscroll de la app
      try { document.documentElement.style.background = ''; } catch { /* noop */ }
    };
    if (instant) { remove(); return; }
    el.classList.add('pp-leaving');
    setTimeout(remove, FADE_MS);
  };

  // tap para saltar + tope de seguridad
  useEffect(() => {
    if (!document.getElementById('pp-splash')) { gone.current = true; return undefined; }
    if (window.__ppSplash?.skipped) { leave(); return undefined; }
    const onSkip = () => leave();
    window.addEventListener('pp-splash-skip', onSkip);
    const start = window.__ppSplash?.start || Date.now();
    const cap = setTimeout(() => leave(), Math.max(0, MAX_MS - (Date.now() - start)));
    return () => { window.removeEventListener('pp-splash-skip', onSkip); clearTimeout(cap); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // operador/admin: sin animación de entrada
  useEffect(() => { if (!enabled) leave(true); }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // arranque listo → esperar a completar la pasada mínima y salir
  useEffect(() => {
    if (!ready || gone.current) return undefined;
    const start = window.__ppSplash?.start || Date.now();
    const t = setTimeout(() => leave(), Math.max(0, MIN_MS - (Date.now() - start)));
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
