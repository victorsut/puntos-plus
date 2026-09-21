// src/components/ui/SupportSheet.jsx
// Canal de ASISTENCIA Y AYUDA (4-ago-2026, antesala de F1): bottom
// sheet disponible desde el login y el Menú del cliente. El botón
// principal abre WhatsApp (wa.me); el número queda SIEMPRE visible
// con botón de llamada para dispositivos sin WhatsApp. El estado
// (disponible / fuera de horario) se calcula en TIEMPO REAL con la
// hora de Guatemala: lunes a viernes, 8:00 a.m. – 4:00 p.m.
// El número viene de cfg.supportPhone (program_config 'support',
// editable en Admin → Configuración vía set_support_phone).
import { useState, useEffect } from 'react';
import { bento, BRAND_ORANGE } from '../../constants/styles';
import { Whatsapp, Phone, Clock, Info } from './Icons';
import { phoneMask } from '../../lib/inputMasks';
import useBackLayer from '../../hooks/useBackLayer';
import { openTour } from '../../lib/tour';

// Hora REAL de Guatemala vía Intl (independiente de la zona del
// dispositivo — un cliente de viaje ve el horario correcto del negocio)
const isOpenNow = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala', weekday: 'short', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  const day = get('weekday');
  const hour = parseInt(get('hour'), 10);
  return !['Sat', 'Sun'].includes(day) && hour >= 8 && hour < 16;
};

// showTour (21-sep): muestra "Ver el tutorial de la app" — solo con
// sesión de cliente (Inicio y Menú); en el login no aplica.
export default function SupportSheet({ onClose, dark, phone, showTour = false }) {
  const num  = (phone || '49741067').replace(/\D/g, '');
  const ink  = dark ? '#fff' : '#0D0D0D';
  const sub  = dark ? 'rgba(255,255,255,.55)' : '#9E9E9E';
  const card = dark ? 'rgba(255,255,255,.07)' : '#F5F5F7';

  const [closing, setClosing] = useState(false);
  const close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 220); };
  useBackLayer(true, close);

  // Estado en vivo: se reevalúa cada minuto mientras el sheet está abierto
  const [open, setOpen] = useState(isOpenNow);
  useEffect(() => {
    const t = setInterval(() => setOpen(isOpenNow()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div onClick={close}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: closing ? 'ppFadeOut .2s ease forwards' : 'fadeIn .2s ease' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: dark ? '#16161A' : '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '24px 20px 36px', animation: closing ? 'slideDownOut .22s ease forwards' : 'slideUp .25s ease' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: BRAND_ORANGE, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Asistencia y ayuda</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: ink, marginBottom: 4 }}>¿Necesitas ayuda?</div>
        <div style={{ fontSize: 13, color: sub, marginBottom: 16 }}>Escríbenos y con gusto te atenderemos</div>

        {/* Estado en tiempo real + horario de atención */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: card, borderRadius: 16, padding: '13px 14px', marginBottom: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: open ? bento.green : bento.red, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: ink }}>
              {open ? 'Disponibles ahora' : 'Fuera de horario'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: sub, marginTop: 2 }}>
              <Clock /> Lunes a viernes · 8:00 a.m. – 4:00 p.m.
            </div>
          </div>
        </div>
        {!open && (
          <div style={{ fontSize: 12, color: sub, marginBottom: 10, paddingLeft: 4, lineHeight: 1.45 }}>
            Puedes escribirnos ahora — te responderemos en horario de atención.
          </div>
        )}

        {/* WhatsApp — acción principal */}
        <a href={`https://wa.me/502${num}`} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: bento.green, color: '#fff', borderRadius: 16, padding: 15, fontFamily: "'DM Sans'", fontSize: 14, fontWeight: 800, textDecoration: 'none', marginBottom: 10 }}>
          <Whatsapp /> Escribir por WhatsApp
        </a>

        {/* Tutorial interactivo (21-sep): se cierra la hoja y el gate
            lleva al inicio y arranca desde el primer paso */}
        {showTour && (
          <button onClick={() => { close(); setTimeout(openTour, 240); }} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            background: card, border: 'none', borderRadius: 16, padding: '13px 14px', marginBottom: 10,
            cursor: 'pointer', color: ink, fontFamily: "'DM Sans'",
          }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: BRAND_ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Info />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800 }}>Ver el tutorial de la app</span>
              <span style={{ display: 'block', fontSize: 12, color: sub, marginTop: 2 }}>Un recorrido de un minuto por lo básico</span>
            </span>
            <span style={{ fontSize: 20, color: sub, fontWeight: 700 }}>›</span>
          </button>
        )}

        {/* Sin WhatsApp: el número siempre visible + llamada directa */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: card, borderRadius: 16, padding: '13px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: sub, fontWeight: 600 }}>¿No tienes WhatsApp? Llámanos</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: ink, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              +502 {phoneMask.format(num)}
            </div>
          </div>
          <a href={`tel:+502${num}`} aria-label="Llamar"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: dark ? '#fff' : '#0D0D0D', color: dark ? '#0D0D0D' : '#fff', borderRadius: 12, padding: '10px 16px', fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 800, textDecoration: 'none', flexShrink: 0 }}>
            <Phone /> Llamar
          </a>
        </div>
      </div>
    </div>
  );
}
