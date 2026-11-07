// src/components/RewardInfoSheet.jsx
// UX-19 (7-nov-2026): ficha de SOLO LECTURA de un premio que el socio
// todavía no puede canjear — por puntos ("Te faltan 120 pts") o por
// nivel mínimo ("Disponible desde PLATINO: 150 galones acumulados;
// llevás 92"). Antes el catálogo ignoraba el toque y la descripción solo
// existía dentro de la hoja de confirmación. Portal al body: el catálogo
// es un contenedor fixed y la BottomNav taparía la hoja (regla UX-16).
import { createPortal } from 'react-dom';
import BottomSheet from './ui/BottomSheet';
import RewardIcon from './ui/RewardIcon';
import { Lock } from './ui/Icons';
import { bento, BRAND_ORANGE, CAT_COLORS, CAT_LABELS } from '../constants/styles';
import { rewardLocationNames } from '../lib/rewardLocations';

const fmt = (n, d = 0) => (Number(n) || 0).toLocaleString('es-GT', { maximumFractionDigits: d });
const tierGal = (cfg, tier) => cfg?.tiers?.[String(tier || '').toLowerCase()]?.gal ?? null;

export default function RewardInfoSheet({ data, me, cfg, dark, stations = [], stores = [], onClose }) {
  const { reward: r, cost, locked } = data;
  const ink = dark ? '#fff' : '#0D0D0D';
  const sub = dark ? 'rgba(255,255,255,.55)' : '#6E6E73';
  const box = dark ? 'rgba(255,255,255,.05)' : '#F5F5F7';
  const missingPts = Math.max(0, cost - (me.points || 0));
  const minGal = locked ? tierGal(cfg, r.minTier) : null;
  const missingGal = minGal != null ? Math.max(0, Math.ceil(minGal - (me.gallons || 0))) : null;
  const locs = rewardLocationNames(r, stations, stores);

  return createPortal(
    <BottomSheet dark={dark} onClose={onClose}>
      {(close) => (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 10px',
            background: CAT_COLORS[r.cat] || '#5E5E63', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RewardIcon reward={r} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: ink, lineHeight: 1.25 }}>{r.name}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: sub, marginTop: 4 }}>
            {CAT_LABELS[r.cat] || r.cat || 'Premio'} · {fmt(cost)} pts
          </div>

          {/* Por qué todavía no: nivel mínimo o puntos que faltan */}
          <div style={{
            marginTop: 16, borderRadius: 16, padding: '14px 16px', textAlign: 'left',
            background: locked ? (dark ? 'rgba(255,255,255,.08)' : '#0D0D0D') : (dark ? 'rgba(217,164,11,.18)' : '#FAF1DC'),
            color: locked ? '#fff' : (dark ? '#FFD54F' : '#7A5A00'),
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800 }}>
              {locked && <Lock size={14} />}
              {locked ? `Disponible desde ${r.minTier}` : `Te faltan ${fmt(missingPts)} pts`}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, marginTop: 4, opacity: .9 }}>
              {locked
                ? (minGal != null
                  ? `${r.minTier} se alcanza con ${fmt(minGal)} galones acumulados. Llevás ${fmt(me.gallons, 1)}${missingGal > 0 ? `: te faltan ${fmt(missingGal)}` : ''}.`
                  : `Este premio es para socios de nivel ${r.minTier} en adelante.`)
                : `Tenés ${fmt(me.points)} pts y cuesta ${fmt(cost)}. Cada carga en Turkaj suma puntos.`}
            </div>
          </div>

          {r.description && (
            <div style={{ background: box, borderRadius: 16, padding: '14px 16px', marginTop: 12, textAlign: 'left' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: sub, marginBottom: 6 }}>
                Detalle del premio
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 12.5, fontWeight: 600, lineHeight: 1.6, whiteSpace: 'pre-line', color: dark ? '#CFCFCF' : '#48484A' }}>
                {r.description}
              </div>
            </div>
          )}

          {locs && (
            <div style={{ background: box, borderRadius: 16, padding: '14px 16px', marginTop: 12, textAlign: 'left' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: sub, marginBottom: 6 }}>
                Válido únicamente en
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.6, color: dark ? '#CFCFCF' : '#48484A' }}>
                {locs.join(' · ')}
              </div>
            </div>
          )}

          <button onClick={() => close()} style={{
            width: '100%', marginTop: 18, padding: 16, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: locked ? (dark ? 'rgba(255,255,255,.1)' : '#F5F5F7') : BRAND_ORANGE,
            color: locked ? ink : '#fff', fontFamily: "'DM Sans'", fontSize: 15, fontWeight: 800,
          }}>
            Entendido
          </button>
          {!locked && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: sub, marginTop: 10 }}>
              {missingPts > 0 ? `Vale Q${fmt(cost * (cfg?.pointValue || 0.1), 0)} aprox.` : ''}
            </div>
          )}
          <div style={{ height: 0, color: bento.red }} />
        </div>
      )}
    </BottomSheet>,
    document.body,
  );
}
