// src/components/tour/ClientTour.jsx
// TUTORIAL INTERACTIVO (coach marks) de la vista cliente — 21-sep-2026,
// pedido del dueño: "manual de uso de lo más importante, con modales,
// flechas e indicaciones sobre los botones principales; avanzar,
// retroceder y omitir". Ampliado el mismo día a ~30 pasos que recorren
// TODAS las pestañas (Inicio, Canjes, Rifa, Vehículos, Promociones,
// Menú): cada paso puede pedir una pantalla (`screen` = cScr) y el
// motor la abre antes de medir.
//
// Cómo funciona: capa fija oscura con un FOCO recortado (máscara SVG)
// sobre el elemento del paso (data-tour="…"), anillo naranja pulsante,
// y una tarjeta con flecha que se coloca debajo o encima del elemento
// según el espacio. Las posiciones se MIDEN en vivo (getBoundingClient-
// Rect) porque el layout cambia con la pantalla y el tamaño; se re-miden
// al redimensionar o desplazar, y si el elemento está fuera de la vista
// se hace scroll hacia él. Si el elemento NO existe (socio sin vehículos,
// sin rifa del mes…) el paso se SALTA solo en la dirección en que se
// venía. Botón físico de volver = omitir. Al terminar vuelve al Inicio.
// Se monta desde ClientTourGate (AppModals, fuera del overflow del
// lienzo) con zIndex por encima de la barra inferior (100) y las hojas (500).
import { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND_ORANGE } from '../../constants/styles';
import useBackLayer from '../../hooks/useBackLayer';
import { TOUR_STEPS } from './tourSteps';

const PAD = 8;          // holgura del foco alrededor del elemento
const GAP = 16;         // separación entre foco y tarjeta (incluye la flecha)
const CARD_W = 300;
const CLOSE_MS = 200;
const FIND_TRIES = 60;  // × 50 ms = 3 s (las pestañas son chunks lazy)

export default function ClientTour({ dark, cScr, setCScr, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);       // caja del objetivo en viewport
  const [ready, setReady] = useState(false);    // objetivo medido (o paso centrado)
  const [closing, setClosing] = useState(false);
  const [, setTick] = useState(0);              // re-render en resize
  const dir = useRef(1);                        // sentido de navegación (para saltar)
  const scrolled = useRef(false);
  const readyRef = useRef(false);               // espejo de `ready` para los listeners
  const step = TOUR_STEPS[i];
  const n = TOUR_STEPS.length;
  const last = i === n - 1;

  const finish = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { setCScr?.('home'); onClose(); }, CLOSE_MS);
  }, [closing, onClose, setCScr]);
  useBackLayer(true, finish);

  const go = (k) => { dir.current = k > i ? 1 : -1; setI(Math.max(0, Math.min(n - 1, k))); };

  // ── pantalla del paso: abrirla si no es la actual ──
  useEffect(() => {
    const want = step.screen || 'home';
    if (cScr !== want) setCScr?.(want);
  }, [i, step.screen, cScr, setCScr]);

  // ── medir el objetivo del paso (reintenta: chunks lazy, stagger de
  //    los cuadros, cambio de pantalla). Sin elemento → saltar el paso. ──
  useEffect(() => {
    let alive = true, tries = 0;
    scrolled.current = false;
    readyRef.current = false;
    setReady(false);
    const done = (r) => { setRect(r); readyRef.current = true; setReady(true); };
    const measure = () => {
      if (!alive) return;
      if (!step.target) { done(null); return; }
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) {
        if (tries++ < FIND_TRIES) { setTimeout(measure, 50); return; }
        // el elemento no existe en esta cuenta (p. ej. sin vehículos):
        // saltar en el sentido en que se venía; si no hay más, cerrar
        const next = i + dir.current;
        if (next < 0 || next >= n) finish(); else setI(next);
        return;
      }
      const r = el.getBoundingClientRect();
      const out = r.top < 0 || r.bottom > window.innerHeight;
      if (out && !scrolled.current) {
        scrolled.current = true;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        setTimeout(measure, 80);
        return;
      }
      done({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    measure();
    const onChange = () => { setTick(t => t + 1); if (readyRef.current) measure(); };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      alive = false;
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [i, step.target]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── geometría de la tarjeta ──
  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(CARD_W, vw - 32);
  let cardStyle, arrow = null;
  if (rect) {
    const cx = rect.x + rect.w / 2;
    const left = Math.max(16, Math.min(cx - cardW / 2, vw - cardW - 16));
    const below = vh - (rect.y + rect.h + PAD) > 240;   // ¿cabe debajo?
    cardStyle = below
      ? { left, top: rect.y + rect.h + PAD + GAP }
      : { left, bottom: vh - (rect.y - PAD) + GAP };
    arrow = { x: Math.max(18, Math.min(cx - left, cardW - 18)), up: below };
  } else {
    cardStyle = { left: (vw - cardW) / 2, top: '50%', transform: 'translateY(-50%)' };
  }

  const cardBg = dark ? '#16161A' : '#fff';
  const ink = dark ? '#fff' : '#0D0D0D';
  const sub = dark ? 'rgba(255,255,255,.6)' : '#6E6E73';
  const soft = dark ? 'rgba(255,255,255,.1)' : '#F2F2F5';
  const focus = rect ? { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + 2 * PAD, h: rect.h + 2 * PAD } : null;
  const section = step.section ? `${step.section} · ` : '';

  return (
    <div role="dialog" aria-label="Tutorial de la app" style={{
      position: 'fixed', inset: 0, zIndex: 700,
      animation: closing ? 'ppFadeOut .2s ease forwards' : 'ppFade .2s ease',
    }}>
      {/* Capa oscura con el foco recortado */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden="true">
        <defs>
          <mask id="pp-tour-mask">
            <rect width="100%" height="100%" fill="#fff" />
            {focus && <rect x={focus.x} y={focus.y} width={focus.w} height={focus.h} rx={18} fill="#000" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,.68)" mask="url(#pp-tour-mask)" />
      </svg>

      {/* Anillo naranja sobre el elemento */}
      {focus && (
        <div className="pp-tour-ring" style={{
          position: 'absolute', left: focus.x, top: focus.y, width: focus.w, height: focus.h,
          borderRadius: 18, border: `2.5px solid ${BRAND_ORANGE}`, boxSizing: 'border-box',
          pointerEvents: 'none', transition: 'left .3s ease, top .3s ease, width .3s ease, height .3s ease',
        }} />
      )}

      {/* Tarjeta del paso (oculta mientras se busca el objetivo tras
          cambiar de pantalla, para que no salte de lugar) */}
      {ready && (
        <div key={i} className="pp-pop" style={{
          position: 'absolute', width: cardW, ...cardStyle,
          background: cardBg, color: ink, borderRadius: 20, padding: '18px 18px 14px',
          boxShadow: '0 12px 40px rgba(0,0,0,.35)', fontFamily: "'DM Sans'",
        }}>
          {arrow && (
            <div style={{
              position: 'absolute', left: arrow.x - 9, width: 18, height: 18, background: cardBg,
              transform: 'rotate(45deg)', borderRadius: 3,
              ...(arrow.up ? { top: -9 } : { bottom: -9 }),
            }} />
          )}
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: BRAND_ORANGE, marginBottom: 6 }}>
            {section}Paso {i + 1} de {n}
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.2, marginBottom: 6 }}>{step.title}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: sub, fontWeight: 500 }}>{step.text}</div>

          {/* progreso */}
          <div style={{ display: 'flex', gap: 3, margin: '14px 0 12px' }}>
            {TOUR_STEPS.map((s, k) => (
              <span key={s.id} style={{
                height: 4, borderRadius: 2, flex: k === i ? 3 : 1,
                background: k <= i ? BRAND_ORANGE : soft, transition: 'flex .25s ease, background .25s ease',
              }} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!last && (
              <button onClick={finish} style={{
                border: 'none', background: 'transparent', color: sub, cursor: 'pointer', padding: '10px 6px',
                fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 700,
              }}>Omitir</button>
            )}
            <div style={{ flex: 1 }} />
            {i > 0 && (
              <button onClick={() => go(i - 1)} style={{
                border: 'none', background: soft, color: ink, cursor: 'pointer', padding: '10px 14px', borderRadius: 12,
                fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 800,
              }}>Atrás</button>
            )}
            <button onClick={() => (last ? finish() : go(i + 1))} style={{
              border: 'none', background: BRAND_ORANGE, color: '#fff', cursor: 'pointer', padding: '10px 16px', borderRadius: 12,
              fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 800,
            }}>{last ? '¡Listo!' : 'Siguiente'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
