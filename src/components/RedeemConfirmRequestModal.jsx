// src/components/RedeemConfirmRequestModal.jsx
// Modal en el dispositivo del MIEMBRO cuando el operador (o el POS de
// PROPER) solicita confirmar la entrega de un canje — FORMATO GENERAL:
// flat sin sombra, RewardIcon en cuadro de su categoría, kicker naranja,
// CTA BRAND_ORANGE. Extraído de App.jsx (división etapa 1, 12-ago-2026)
// sin cambios de lógica: la respuesta viaja por RPC con la sesión del
// miembro (SEC.C.3, respond_redemption_confirm).
import { useState } from 'react';
import RewardIcon from './ui/RewardIcon';
import { bento, BRAND_ORANGE, CAT_COLORS } from '../constants/styles';
import { respondRedemptionConfirm } from '../services';
import useBackLayer from '../hooks/useBackLayer';

export default function RedeemConfirmRequestModal({ pending, dark, fire, onClose, onConfirmed }) {
  // Una sola respuesta por solicitud (doble toque / volver + toque)
  const [busy, setBusy] = useState(false);
  const subTxt = dark ? 'rgba(255,255,255,.5)' : '#6E6E73'; // UX-33
  const respond = async (ok) => {
    if (busy) return;
    setBusy(true);
    // SEC.C.3: la respuesta viaja por RPC con la sesión del miembro.
    const res = await respondRedemptionConfirm(pending.redemptionId, ok);
    onClose();
    if (res.error) { fire(res.error, 'warn'); return; }
    if (!ok) { fire('Canje cancelado', 'info'); return; }
    fire('¡Canje confirmado!', 'success');
    // App: cierra el QR del premio si quedó abierto (pedido del
    // dueño 29-jul) y recarga los canjes cuando el POS entregue.
    onConfirmed();
  };
  // UX-15 (7-nov-2026): "volver" ya no SALE de la app con la solicitud del
  // POS en pantalla: equivale a Cancelar (el operador puede volver a
  // pedirla; dejarla sin respuesta lo tendría esperando el timeout).
  useBackLayer(true, () => respond(false));
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
      zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px', animation: 'ppFade .25s ease',
    }}>
      <div style={{
        background: dark ? '#101018' : '#fff',
        borderRadius: 24, width: '100%', maxWidth: 400, padding: '28px 22px',
        animation: 'pop .3s cubic-bezier(.32,1.2,.64,1)',
      }}>
        {/* Héroe: ícono SVG del premio en cuadro de su categoría */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
            background: CAT_COLORS[pending.reward?.cat] || '#5E5E63', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RewardIcon reward={pending.reward || { name: pending.rewardName }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: BRAND_ORANGE, marginBottom: 4 }}>
            Solicitud de Canje
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: dark ? '#fff' : '#0D0D0D', lineHeight: 1.2 }}>
            ¿Confirmás este canje?
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: subTxt, marginTop: 6 }}>
            El operador está listo para entregarte este premio
          </div>
        </div>

        {/* Detalle — filas flat con divisor */}
        <div style={{ background: dark ? 'rgba(255,255,255,.05)' : '#F5F5F7', borderRadius: 16, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingBottom: 12, marginBottom: 12,
            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.06)' : '#ECECEE'}`,
          }}>
            <span style={{ fontSize: 13, color: subTxt, fontWeight: 600, flexShrink: 0 }}>Premio</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: dark ? '#fff' : '#0D0D0D', flex: 1, minWidth: 0, textAlign: 'right', marginLeft: 12, overflowWrap: 'anywhere' }}>{pending.rewardName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: subTxt, fontWeight: 600 }}>Puntos a descontar</span>
            <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dark ? '#FF8A80' : bento.red }}>-{Number(pending.cost).toLocaleString('es-GT')} pts</span>
          </div>
        </div>

        {/* Botones — acción sólida naranja, cancelar flat */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => respond(false)} disabled={busy} style={{
            flex: 1, padding: 16, borderRadius: 14, border: 'none',
            background: dark ? 'rgba(255,255,255,.08)' : '#F5F5F7',
            color: dark ? '#ccc' : '#424242', opacity: busy ? .5 : 1,
            fontFamily: "'DM Sans'", fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
          }}>Cancelar</button>
          <button onClick={() => respond(true)} disabled={busy} aria-busy={busy} style={{
            flex: 2, padding: 16, borderRadius: 14, border: 'none',
            background: BRAND_ORANGE, color: '#fff', opacity: busy ? .75 : 1,
            fontFamily: "'DM Sans'", fontSize: 15, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
          }}>{busy ? 'Enviando…' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}
