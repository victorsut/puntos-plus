// src/hooks/useOnline.js
// UX-27 (7-nov-2026): estado de red del navegador (online/offline) para
// el chip "Sin conexión" del cliente. navigator.onLine false es fiable
// (sin interfaz); true solo significa "quizá" — por eso es un aviso, no
// una compuerta.
import { useEffect, useState } from 'react';

export default function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
