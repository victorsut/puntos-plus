// src/components/RedeemConfirmSheet.jsx
// Bottom-sheet de confirmación de canje (el miembro revisa el premio,
// su descripción, dónde es válido — D17 — y el saldo antes/después).
// Vive a nivel raíz para escapar del overflow:hidden del lienzo.
// Extraído de App.jsx (división etapa 1, 12-ago-2026) sin cambios.
import { useEffect, useRef } from 'react';
import RewardIcon from './ui/RewardIcon';
import { bento, BRAND_ORANGE, CAT_COLORS, CAT_LABELS } from '../constants/styles';
import { rewardLocationNames } from '../lib/rewardLocations';

export default function RedeemConfirmSheet({ data, me, dark, closing, stations, stores, onClose, onConfirm, busy = false }) {
  // UX-03: mientras `busy` la hoja no se cierra ni acepta otro toque. El
  // ref cubre los toques que llegan en el MISMO tick, antes de que React
  // vuelva a pintar con busy=true (el estado del padre llega tarde).
  const firedRef = useRef(false);
  // UX-33: gris legible en modo claro (#9E9E9E daba 2.7:1)
  const subTxt = dark ? 'rgba(255,255,255,.5)' : '#6E6E73';
  useEffect(() => { if (!busy) firedRef.current = false; }, [busy, data]);
  const guardedClose = () => { if (!busy && !firedRef.current) onClose(); };
  const confirm = () => {
    if (busy || firedRef.current) return;
    firedRef.current = true;
    onConfirm(data.reward);
  };
  return (
    <div onClick={guardedClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: closing ? 'ppFadeOut .22s ease forwards' : 'ppFade .2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: dark ? '#0D0D1A' : '#fff',
        borderRadius: '24px 24px 0 0',
        width: '100%', maxWidth: 480, padding: '12px 24px 40px',
        maxHeight: '88vh', overflowY: 'auto',
        animation: closing ? 'slideDownOut .22s ease-in forwards' : 'slideUp .3s cubic-bezier(.32,1.2,.64,1)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: dark ? 'rgba(255,255,255,.2)' : '#E0E0E0', margin: '0 auto 20px' }} />

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {/* Ícono SVG del premio en cuadro de color de su categoría
              (FORMATO GENERAL — sin emojis) */}
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 10px',
            background: CAT_COLORS[data.reward.cat] || '#5E5E63', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RewardIcon reward={data.reward} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: dark ? '#fff' : '#0D0D0D', marginBottom: 4 }}>
            Confirmar Canje
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: subTxt }}>Revisa los detalles antes de confirmar</div>
        </div>

        {/* Detalle largo del premio (rewards.description — qué
            servicio o bien se adquiere con el canje) */}
        {data.reward.description && (
          <div style={{
            background: dark ? 'rgba(255,255,255,.05)' : '#F5F5F7',
            borderRadius: 16, padding: '14px 16px', marginBottom: 12, textAlign: 'left',
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: subTxt, marginBottom: 6 }}>
              Detalle del premio
            </div>
            <div style={{
              maxHeight: 130, overflowY: 'auto',
              fontSize: 12.5, fontWeight: 600, lineHeight: 1.6, whiteSpace: 'pre-line',
              color: dark ? '#CFCFCF' : '#48484A',
            }}>
              {data.reward.description}
            </div>
          </div>
        )}

        {/* D17: dónde es válido el premio (null = todas las estaciones,
            no se muestra nada — comportamiento histórico) */}
        {(() => {
          const locNames = rewardLocationNames(data.reward, stations, stores);
          return locNames && (
            <div style={{
              background: dark ? 'rgba(255,255,255,.05)' : '#F5F5F7',
              borderRadius: 16, padding: '14px 16px', marginBottom: 12, textAlign: 'left',
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: subTxt, marginBottom: 6 }}>
                Válido únicamente en
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.6, color: dark ? '#CFCFCF' : '#48484A' }}>
                {locNames.join(' · ')}
              </div>
            </div>
          );
        })()}

        <div style={{ background: dark ? 'rgba(255,255,255,.05)' : '#F5F5F7', borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}>
          {[
            { l: 'Premio',          v: data.reward.name, bold: true },
            { l: 'Categoría',       v: CAT_LABELS[data.reward.cat] || data.reward.cat || '—' },
            { l: 'Costo',           v: `${data.cost.toLocaleString('es-GT')} pts`, large: true, red: true },
            { l: 'Saldo actual',    v: `${me.points.toLocaleString('es-GT')} pts` },
            { l: 'Saldo tras canje',v: `${(me.points - data.cost).toLocaleString('es-GT')} pts`, green: true },
          ].map((row, i, arr) => (
            <div key={row.l} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingBottom: i < arr.length - 1 ? 12 : 0,
              borderBottom: i < arr.length - 1 ? `1px solid ${dark ? 'rgba(255,255,255,.06)' : '#ECECEE'}` : 'none',
              marginBottom: i < arr.length - 1 ? 12 : 0,
            }}>
              <span style={{ fontSize: 13, color: subTxt, fontWeight: 600, flexShrink: 0 }}>{row.l}</span>
              {/* UX-44: nombres largos se parten a la derecha sin romper la fila */}
              <span style={{
                fontSize: row.large ? 18 : 13,
                fontWeight: row.bold || row.large ? 800 : 700,
                fontVariantNumeric: 'tabular-nums',
                flex: 1, minWidth: 0, textAlign: 'right', marginLeft: 12, overflowWrap: 'anywhere',
                color: row.red ? bento.red : row.green ? bento.green : (dark ? '#fff' : '#0D0D0D'),
              }}>{row.v}</span>
            </div>
          ))}
        </div>

        {/* UX-17: qué pasa al confirmar y dónde se entrega */}
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.55, color: dark ? 'rgba(255,255,255,.65)' : '#6E6E73', textAlign: 'center', margin: '-6px 4px 16px' }}>
          Al confirmar se descuentan los puntos y aparece tu <strong style={{ color: dark ? '#fff' : '#0D0D0D' }}>código QR</strong>.
          El premio se entrega en la estación mostrando ese código; también queda en Canjes → pendientes.
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={guardedClose} disabled={busy} style={{
            flex: 1, padding: 16, borderRadius: 14, border: 'none',
            background: dark ? 'rgba(255,255,255,.08)' : '#F5F5F7',
            color: dark ? '#ccc' : '#424242', opacity: busy ? .5 : 1,
            fontFamily: "'DM Sans'", fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
          }}>Cancelar</button>
          <button onClick={confirm} disabled={busy} aria-busy={busy} style={{
            flex: 2, padding: 16, borderRadius: 14, border: 'none',
            background: BRAND_ORANGE, color: '#fff', opacity: busy ? .75 : 1,
            fontFamily: "'DM Sans'", fontSize: 15, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
          }}>{busy ? 'Procesando…' : 'Confirmar Canje'}</button>
        </div>
      </div>
    </div>
  );
}
