// src/components/UpdateAvailable.jsx
// ============================================================
// Banner que avisa cuando hay una version nueva de la app
// disponible (nuevo Service Worker en espera). Al pulsar
// "Recargar" se activa el SW nuevo y se recarga la pagina.
// ============================================================

import { useState, useEffect } from 'react';
import { setUpdateAvailableCallback, applyUpdate } from '../lib/swRegistration';
import { BRAND_ORANGE } from '../constants/styles';
import { Refresh } from './ui/Icons';

export default function UpdateAvailable() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setUpdateAvailableCallback(() => setVisible(true));
  }, []);

  if (!visible) return null;

  // FORMATO GENERAL: misma píldora flat de los toasts (Toast.jsx) —
  // disco de color con ícono SVG + texto + acción, sin emojis ni sombra.
  return (
    <div style={{
      position: 'fixed',
      // UX-26 (7-nov-2026): encima de la BottomNav (antes tapaba el botón QR)
      bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      background: '#0D0D0D',
      color: '#fff',
      padding: '10px 10px 10px 10px',
      borderRadius: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      maxWidth: '90vw',
      fontFamily: "'DM Sans'",
      fontSize: 13.5,
      fontWeight: 700,
      animation: 'slideUpFade 400ms ease-out',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: BRAND_ORANGE, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Refresh />
      </div>
      <span style={{ flex: 1 }}>Nueva versión disponible</span>
      {/* UX-26: posponer (p. ej. a mitad del registro — recargar lo borraría) */}
      <button onClick={() => setVisible(false)} aria-label="Actualizar después" style={{
        background: 'none', color: 'rgba(255,255,255,.75)', border: 'none', padding: '8px 6px',
        fontFamily: "'DM Sans'", fontWeight: 700, cursor: 'pointer', fontSize: 13, flexShrink: 0,
      }}>Después</button>
      <button
        onClick={applyUpdate}
        style={{
          background: '#fff',
          color: '#0D0D0D',
          border: 'none',
          padding: '8px 14px',
          borderRadius: 10,
          fontFamily: "'DM Sans'",
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        Recargar
      </button>
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
