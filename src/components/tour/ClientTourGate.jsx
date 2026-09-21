// src/components/tour/ClientTourGate.jsx
// Decide CUÁNDO se muestra el tutorial del cliente (21-sep-2026).
//   · Marca "pendiente" cuando authScreen pasa a 'logged' (login por
//     teléfono, passkey o Google, y el registro). La sesión restaurada
//     desde localStorage ya arranca en 'logged' → no dispara (regla del
//     dueño: solo al crear la cuenta y al abrir sesión, no en cada
//     apertura). OAuth re-emite SIGNED_IN al abrir, pero authScreen no
//     cambia, así que tampoco dispara.
//   · Arranca cuando el INICIO está visible (existe la tarjeta de
//     puntos, data-tour="pts-card") y tras una pausa para dejar pasar el
//     splash de monedas (~2 s) y el stagger de los cuadros.
//   · Reapertura manual: evento TOUR_EVENT (openTour() desde
//     Asistencia y ayuda) → lleva al inicio y muestra desde el paso 1.
// Se monta en AppModals (fuera del overflow del lienzo).
import { useEffect, useRef, useState } from 'react';
import ClientTour from './ClientTour';
import { TOUR_EVENT, clearTourPending, isTourPending, markTourPending } from '../../lib/tour';

const SETTLE_MS = 2600; // splash (~2 s) + entrada de los cuadros

export default function ClientTourGate({ ctx }) {
  const { me, isC, authScreen, cScr, setCScr, dark } = ctx;
  const [open, setOpen] = useState(false);
  const prevAuth = useRef(authScreen);

  // transición → 'logged' = acaba de abrir sesión o de registrarse
  useEffect(() => {
    if (prevAuth.current !== 'logged' && authScreen === 'logged' && isC) markTourPending();
    prevAuth.current = authScreen;
  }, [authScreen, isC]);

  // apertura manual (Asistencia y ayuda)
  useEffect(() => {
    const h = () => { setCScr?.('home'); setOpen(true); };
    window.addEventListener(TOUR_EVENT, h);
    return () => window.removeEventListener(TOUR_EVENT, h);
  }, [setCScr]);

  // apertura automática: pendiente + inicio visible + pausa de asentamiento
  useEffect(() => {
    if (open || !isC || !me?.id || authScreen !== 'logged' || !isTourPending()) return undefined;
    let seenAt = null;
    const t = setInterval(() => {
      const ready = !!document.querySelector('[data-tour="pts-card"]');
      if (!ready) { seenAt = null; return; }
      if (!seenAt) seenAt = Date.now();
      if (Date.now() - seenAt >= SETTLE_MS) { clearInterval(t); setOpen(true); }
    }, 300);
    return () => clearInterval(t);
  }, [open, isC, me?.id, authScreen, cScr]);

  if (!open || !isC || !me) return null;
  return <ClientTour dark={dark} onClose={() => { clearTourPending(); setOpen(false); }} />;
}
