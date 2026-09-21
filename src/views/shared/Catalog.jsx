// src/views/shared/Catalog.jsx
// R1b.4 — Pestaña CANJES (catálogo de premios) con FORMATO GENERAL:
// fondo claro de la app, título centrado + puntos disponibles, chips de
// categoría en filas con wrap (sin barra de desplazamiento), cards flat
// sin borde con el ícono SVG del premio (RewardIcon — sin emojis) sobre
// un cuadro de color sólido por categoría. BLACK conserva su galaxia.
import { useState, useEffect, Fragment } from 'react';
import { bento, BRAND_ORANGE, CAT_LABELS, CAT_COLORS, homeColors, clientMainBg } from '../../constants/styles';
import RewardIcon from '../../components/ui/RewardIcon';
import ChipScroller from '../../components/ui/ChipScroller';
import HistorySheet from '../client/HistorySheet';
import { Clock, Lock } from '../../components/ui/Icons';
import { meetsMinTier, tierRank } from '../../lib/tierSystem';
import { originFromEvent } from '../../lib/motionOrigin';
import { rewardLocationNames } from '../../lib/rewardLocations';

export default function Catalog(ctx) {
  const { rewards, me, gT, cfg, cTier, catF, setCatF, redeem, setRedeemConfirm, client = true, redeemedList, activityLog, dark: modeDark, showQR, catPendingSignal, rewardQrCloseSignal, stations = [], stores = [] } = ctx;
  // El modo claro/oscuro solo aplica a la vista del cliente — en el
  // panel admin el catálogo conserva su presentación clara actual.
  const dark = client && !!modeDark;
  const t    = me ? gT(me.gallons) : gT(0);
  const visible = (rewards || []).filter(r => r.active !== false);
  // Solo categorías CON premios activos (4-ago, pedido del dueño): una
  // categoría vacía no aparece hasta que el admin le asigne un premio.
  // El orden lo sigue marcando CAT_LABELS (estable entre renders).
  const usedCats = new Set(visible.map(r => r.cat));
  const cats = ['todos', ...Object.keys(CAT_LABELS).filter(c => usedCats.has(c))];
  const inCat = catF === 'todos' ? visible : visible.filter(r => r.cat === catF);
  // Recalibración C5 (19-sep): premios disponibles DESDE un nivel. El
  // socio ve ARRIBA los que ya puede canjear por su nivel y AL FINAL,
  // bloqueados, los de los niveles siguientes (pedido del dueño) —
  // ordenados por cercanía: primero PLATINO, luego BLACK. El panel admin
  // (client=false) no bloquea nada. El servidor valida igual.
  const isLocked = (r) => client && !!me && !meetsMinTier(t.name, r.minTier);
  const unlocked = inCat.filter(r => !isLocked(r));
  const locked = inCat.filter(isLocked).sort((a, b) => tierRank(a.minTier) - tierRank(b.minTier));
  const filtered = [...unlocked, ...locked];

  // Si la categoría filtrada se queda sin premios (se desactivó el
  // último desde admin), el filtro cae a Todos — su chip ya no existe.
  useEffect(() => {
    if (catF !== 'todos' && !usedCats.has(catF)) setCatF('todos');
  }, [catF, rewards]); // eslint-disable-line react-hooks/exhaustive-deps

  // Canjes PENDIENTES de usar (reloj arriba-derecha → HistorySheet ya
  // filtrado, mismo patrón del Historial de Canjes).
  const [pendSheet, setPendSheet] = useState(null); // { origin } | null

  // Deep-link de notificación de premio (type 'reward'): la señal del
  // ctx abre los pendientes sin tap (origin null → animación centrada).
  useEffect(() => {
    if (client && catPendingSignal) setPendSheet({ origin: null });
  }, [client, catPendingSignal]);
  const myRedeemed = (client && me) ? (redeemedList || []).filter(rd => rd.memberId === me.id) : [];
  const pendingCount = myRedeemed.filter(r => !r.collected).length;
  const myActs = me ? (activityLog?.[me.id] || []) : [];

  const isBlack = (cTier?.name || 'ORO') === 'BLACK';
  const headerTxt = dark ? '#fff' : '#0D0D0D';
  const subTxt = dark ? 'rgba(255,255,255,.55)' : '#6E6E73';
  const surface = dark ? 'rgba(255,255,255,.06)' : '#fff';
  const good = dark ? '#7CD98F' : bento.green;

  // 4-sep (pedido del dueño): título + categorías PEGAJOSOS al desplazar
  // los premios. El lienzo raíz de la app lleva overflow-x hidden (es un
  // "scroll container" que nunca se desplaza), así que sticky contra la
  // ventana no funciona: en el cliente esta vista se convierte en su
  // PROPIO contenedor de scroll FIJO al viewport (como HistorySheet) y el
  // bloque se pega adentro; overscroll-behavior contain evita que el
  // desplazamiento se encadene al documento y esconda los títulos. El fondo del bloque es sólido (galaxia/página) para que los
  // premios no se vean a través.
  const stickyBg = (dark || (client && isBlack)) ? clientMainBg(cTier?.name, true) : bento.pageBg;
  return (
    <div style={{
      paddingBottom: 100, minHeight: '100vh',
      background: (dark || (client && isBlack)) ? 'transparent' : bento.pageBg,
      // cliente: FIJO al viewport como HistorySheet (bottom 55 = BottomNav):
      // el documento ya no se desplaza y solo los premios se mueven adentro
      ...(client ? {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 55, margin: '0 auto', maxWidth: 480,
        minHeight: 0, boxSizing: 'border-box', overflowY: 'auto', overflowX: 'hidden',
        overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', paddingBottom: 32,
      } : {}),
    }}>
      <div style={client ? { position: 'sticky', top: 0, zIndex: 2, background: stickyBg } : undefined}>
      {/* Header centrado (formato de las ventanas del track) + reloj de
          canjes pendientes de usar arriba-derecha */}
      <div style={{ padding: '18px 16px 4px', textAlign: 'center', position: 'relative' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: headerTxt }}>
          Catálogo de Premios
        </div>
        {client && me && (
          <div data-tour="cat-points" style={{ fontSize: 11, fontWeight: 600, color: subTxt, marginTop: 1 }}>
            Tenés <span style={{ fontWeight: 800, color: good, fontVariantNumeric: 'tabular-nums' }}>{me.points} pts</span> para canjear
          </div>
        )}
        {client && me && (
          <button data-tour="cat-pending" onClick={(e) => setPendSheet({ origin: originFromEvent(e) })} aria-label="Canjes pendientes" style={{
            position: 'absolute', right: 10, top: 12,
            width: 40, height: 40, border: 'none', cursor: 'pointer', padding: 0,
            borderRadius: 12, background: 'none', color: headerTxt,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Clock />
            {pendingCount > 0 && (
              <span style={{
                position: 'absolute', top: 3, right: 3,
                minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px',
                background: bento.red, color: '#fff',
                fontSize: 9.5, fontWeight: 800, lineHeight: '16px',
                fontFamily: "'DM Sans'", boxSizing: 'border-box',
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Filtros por categoría — chips desplazables sin barra visible
          (ChipScroller: desvanecido en bordes = hay más) */}
      <div data-tour="cat-chips"><ChipScroller padding="10px 14px 16px">
        {cats.map(c => {
          const on = catF === c;
          return (
            <button key={c} onClick={() => setCatF(c)} style={{
              padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: on ? BRAND_ORANGE : (dark ? 'rgba(255,255,255,.08)' : '#fff'),
              color: on ? '#fff' : (dark ? 'rgba(255,255,255,.75)' : '#3A3A3C'),
              fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              transition: 'background .2s, color .2s',
            }}>
              {c === 'todos' ? 'Todos' : CAT_LABELS[c] || c}
            </button>
          );
        })}
      </ChipScroller></div>
      </div>

      {/* Grid de premios — cards flat sin borde */}
      <div style={{ padding: '0 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {filtered.map((r, i) => {
          const catColor = CAT_COLORS[r.cat] || '#5E5E63';
          // El descuento de canje por nivel se ELIMINÓ (recalibración C1):
          // la config lo trae en 0 y el costo es el de lista para todos.
          const cost     = client && me ? Math.round(r.pts * (1 - (t.redeemDisc || 0))) : r.pts;
          const lockedR  = isLocked(r);
          const canAfford = client && me && !lockedR ? me.points >= cost : false;
          const firstLocked = lockedR && i === unlocked.length;
          return (<Fragment key={r.id}>
            {firstLocked && (
              <div style={{
                gridColumn: '1 / -1', marginTop: unlocked.length ? 10 : 0,
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase', color: subTxt,
              }}>
                <Lock size={13} /> Disponibles en los siguientes niveles
              </div>
            )}
            <div className="pp-tile" data-tour={i === 0 ? "cat-reward" : undefined} onClick={() => {
              if (!client || !canAfford) return;
              if (setRedeemConfirm) setRedeemConfirm({ reward: r, cost });
              else redeem(r);
            }} style={{
              animationDelay: `${Math.min(i, 12) * 40}ms`,
              background: surface, borderRadius: 20, padding: '18px 14px 16px', textAlign: 'center',
              cursor: client && canAfford ? 'pointer' : 'default',
              opacity: client && !canAfford ? .55 : 1,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14, margin: '0 auto 10px',
                background: catColor, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RewardIcon reward={r} />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: dark ? '#E0E0E0' : '#0D0D0D', marginBottom: 6, lineHeight: 1.3 }}>
                {r.name}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: canAfford ? good : subTxt }}>
                {cost} pts
              </div>
              {lockedR && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
                  padding: '3px 9px', borderRadius: 8,
                  background: dark ? 'rgba(255,255,255,.12)' : '#0D0D0D', color: '#fff',
                  fontSize: 9, fontWeight: 800, letterSpacing: .4,
                }}>
                  <Lock size={10} /> DESDE {r.minTier}
                </div>
              )}
              {!lockedR && t.redeemDisc > 0 && cost < r.pts && (
                <div style={{ fontSize: 10, color: dark ? '#90CAF9' : bento.blue, fontWeight: 700, marginTop: 2 }}>
                  -{Math.round(t.redeemDisc * 100)}% ({r.pts} pts)
                </div>
              )}
              {/* D17: si el premio está restringido, dónde es válido
                  (sin restricción no se muestra nada) */}
              {(() => {
                const locNames = rewardLocationNames(r, stations, stores);
                return locNames && (
                  <div style={{ fontSize: 9.5, color: subTxt, fontWeight: 700, marginTop: 4, lineHeight: 1.4 }}>
                    Solo en: {locNames.join(' · ')}
                  </div>
                );
              })()}
            </div>
          </Fragment>);
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: subTxt, fontSize: 13, fontWeight: 700 }}>
          No hay premios en esta categoría
        </div>
      )}

      {/* Canjes pendientes de usar (HistorySheet ya filtrado) */}
      {pendSheet && (
        <HistorySheet
          type="canjes"
          initialPending
          origin={pendSheet.origin}
          tint={homeColors(cTier?.name || 'ORO').redeems}
          accent={homeColors(cTier?.name || 'ORO').redeems}
          accentInk={homeColors(cTier?.name || 'ORO').redeemsInk}
          onClose={() => setPendSheet(null)}
          acts={myActs}
          redeemed={myRedeemed}
          tierName={cTier?.name || 'ORO'}
          dark={dark}
          qrOverlayOpen={showQR}
          rewardQrCloseSignal={rewardQrCloseSignal}
        />
      )}
    </div>
  );
}
