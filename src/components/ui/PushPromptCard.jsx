// src/components/ui/PushPromptCard.jsx
// UX-28 (7-nov-2026): el permiso de notificaciones ya NO se pide a ciegas
// al entrar (una denegación en Chrome Android es permanente). Esta tarjeta
// explica para qué sirven y el permiso se pide solo al tocar "Activar".
// Aparece si el navegador soporta push, el permiso está en 'default', el
// tutorial ya terminó y no se pospuso en los últimos 7 días.
import { useState } from 'react';
import { Bell } from './Icons';
import { BRAND_ORANGE } from '../../constants/styles';
import { isPushSupported, subscribePush } from '../../lib/pushNotifications';
import { isTourPending } from '../../lib/tour';

const SNOOZE_KEY = 'pp_push_later';
const SNOOZE_MS = 7 * 24 * 3600 * 1000;
const snoozed = () => { try { return Date.now() - (+localStorage.getItem(SNOOZE_KEY) || 0) < SNOOZE_MS; } catch { return false; } };

export function shouldOfferPush() {
  if (!isPushSupported()) return false;
  if (Notification.permission !== 'default') return false;
  if (isTourPending()) return false;
  return !snoozed();
}

export default function PushPromptCard({ memberId, dark = false, fire = () => {} }) {
  const [show, setShow] = useState(() => shouldOfferPush());
  const [busy, setBusy] = useState(false);
  if (!show) return null;
  const later = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* sin storage */ } setShow(false); };
  const activate = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await subscribePush(memberId);
    setBusy(false);
    setShow(false);
    if (ok) fire('Avisos activados', 'success');
    else if (Notification.permission === 'denied') fire('Permiso denegado: puedes activarlo en los ajustes del navegador', 'warn');
  };
  const ink = dark ? '#fff' : '#0D0D0D';
  const sub = dark ? 'rgba(255,255,255,.6)' : '#6E6E73';
  return (
    <div style={{
      margin: '8px 16px 0', padding: '12px 14px', borderRadius: 16,
      background: dark ? 'rgba(255,255,255,.07)' : '#fff',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 11, background: BRAND_ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bell />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: ink, lineHeight: 1.3 }}>Activa los avisos</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: sub, lineHeight: 1.4, marginTop: 2 }}>
          Para calificar tus cargas, confirmar canjes y enterarte de la rifa.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={activate} disabled={busy} style={{
          padding: '9px 12px', borderRadius: 11, border: 'none', cursor: 'pointer', minHeight: 36,
          background: BRAND_ORANGE, color: '#fff', fontFamily: "'DM Sans'", fontSize: 12.5, fontWeight: 800, opacity: busy ? .7 : 1,
        }}>{busy ? 'Activando…' : 'Activar'}</button>
        <button onClick={later} style={{
          padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer', minHeight: 32,
          color: sub, fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 700,
        }}>Ahora no</button>
      </div>
    </div>
  );
}
