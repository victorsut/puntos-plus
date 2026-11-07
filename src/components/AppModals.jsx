// src/components/AppModals.jsx
// Capa de MODALES DE NIVEL RAÍZ — extraída de App.jsx en la división
// del 15-ago-2026 (regla de 500 líneas), lógica VERBATIM: los sheets
// y modales que escapan del overflow:hidden del lienzo (confirmación
// de canje desde operador, sheet de canje, sheet de compra, QR del
// miembro, ganador de rifa, bono de día especial), el Toast global y
// el aviso de nueva versión. El estado del modal de GANADOR DE RIFA
// (raffleWin + su efecto R1b.4) también vive acá: este componente es
// su único consumidor. Los estados de cierre animado (rcClosing /
// qrClosing) y sus close* QUEDAN en App.jsx porque el botón físico de
// volver (useBackLayer) los registra allá.
import { useState, useEffect } from 'react';
import { sb } from '../lib/supabaseClient';
import { markRaffleWinnerSeen } from '../services';
import SpecialDayBonusModal from './SpecialDayBonusModal';
import UpdateAvailable from './UpdateAvailable';
import Toast from './ui/Toast';
import RaffleWinnerModal from './RaffleWinnerModal';
import RedeemConfirmRequestModal from './RedeemConfirmRequestModal';
import RedeemConfirmSheet from './RedeemConfirmSheet';
import PurchaseConfirmSheet from './PurchaseConfirmSheet';
import ClientQrSheet from './ClientQrSheet';
import ClientTourGate from './tour/ClientTourGate';
import OpRatingModal from './OpRatingModal';
import SurveyResultModal from './SurveyResultModal';
import RewardQrSheet from '../views/client/RewardQrSheet';
import useBackLayer from '../hooks/useBackLayer';
import { rewardLocationNames } from '../lib/rewardLocations';
import { homeColors } from '../constants/styles';
import { markRatingSeen } from '../lib/ratingSeen';

export default function AppModals({
  ctx, toast,
  rcClosing, closeRedeemConfirm,
  qrClosing, closeQR,
  setRewardQrCloseSignal, reloadMyRedemptions,
  specialBonusModal, setSpecialBonusModal,
  crossYearWins, setCrossYearWins,
}) {
  const {
    me, isC, dark, fire, cTier, gT, cfg,
    stations, stores, rewards, redeem, addPurchase,
    raffleCal, setRaffleCal,
    pendingRedeemConfirm, setPendingRedeemConfirm,
    redeemConfirm, setRedeemConfirm,
    purchaseConfirm, setPurchaseConfirm,
    showQR,
    pendingOpRating, setPendingOpRating, sbConnected, mySurveyCount,
    surveyPending, setSurveyPending, surveyResult, setSurveyResult,
  } = ctx;
  // Paleta del cuadro Encuesta según el nivel (paso 2 del modal de calificación)
  const hp = me ? homeColors(cTier.name) : null;

  // UX-17 (7-nov-2026): recién hecho el canje se abre su QR acá mismo —
  // antes solo había un toast y el código vivía detrás del reloj del
  // catálogo o de la fila "VER QR ›" del historial.
  const [newQr, setNewQr] = useState(null);
  const [newQrClosing, setNewQrClosing] = useState(false);
  const closeNewQr = () => {
    if (newQrClosing) return;
    setNewQrClosing(true);
    setTimeout(() => { setNewQr(null); setNewQrClosing(false); }, 220);
  };
  useBackLayer(!!newQr, closeNewQr);
  // Si abre su Código QR principal, no encimar dos códigos (regla 25-jul)
  useEffect(() => { if (showQR) { setNewQr(null); setNewQrClosing(false); } }, [showQR]);
  const newQrLocations = (() => {
    if (!newQr) return null;
    const rw = (rewards || []).find(r => r.id === newQr.rewardId);
    return rw ? rewardLocationNames(rw, stations, stores) : null;
  })();

  // R1b.4 Rifa — modal de ganador: si el sorteo (draw_due_raffles) me
  // marcó ganador de una rifa que aún no he visto, felicitar UNA vez.
  // La marca de "visto" vive en el SERVIDOR (winner_seen_at — fix
  // 25-jul: con solo localStorage reaparecía en cada dispositivo);
  // localStorage queda como guarda instantánea secundaria.
  const [raffleWin, setRaffleWin] = useState(null);
  useEffect(() => {
    if (!me?.id || (!raffleCal.length && !crossYearWins.length)) return;
    try {
      // Rifa multi-año (8-ago): el pool incluye las sorteadas de OTROS
      // años (la de diciembre se sortea en enero del año siguiente y ya
      // no vive en los 12 slots del año en curso — sin esto el ganador
      // nunca veía su felicitación al cruzar el año).
      const pool = [...raffleCal, ...crossYearWins];
      const win = pool.find(r => r?.winnerId === me.id && r.drawnAt && r.dbId
        && !r.winnerSeenAt
        && !localStorage.getItem(`pp_rafwin_${r.dbId}`));
      if (win) setRaffleWin(win);
    } catch { /* localStorage no disponible */ }
  }, [me?.id, raffleCal, crossYearWins]);

  return (
    <>
      {/* ── Modal confirmación de canje desde operador (dispositivo del
          MIEMBRO) — RedeemConfirmRequestModal responde por RPC ── */}
      {pendingRedeemConfirm && isC && me && (
        <RedeemConfirmRequestModal
          pending={pendingRedeemConfirm}
          dark={dark}
          fire={fire}
          onClose={() => setPendingRedeemConfirm(null)}
          onConfirmed={() => {
            // Pedido del dueño (29-jul): si el QR del premio quedó
            // abierto tras el escaneo, cerrarlo al confirmar.
            setRewardQrCloseSignal(s => s + 1);
            // La entrega se concreta en el POS un instante después
            // (poll de 2s + RPC): recargar los canjes para que el
            // pendiente pase a RECOGIDO sin reabrir la app.
            setTimeout(reloadMyRedemptions, 6000);
          }}
        />
      )}

      {/* ── Sheet confirmación de canje (nivel raíz) ── */}
      {redeemConfirm && isC && me && (
        <RedeemConfirmSheet
          data={redeemConfirm}
          me={me}
          dark={dark}
          closing={rcClosing}
          stations={stations}
          stores={stores}
          busy={ctx.actionBusy === 'redeem'}
          onClose={closeRedeemConfirm}
          // UX-03: la hoja queda ABIERTA (botones deshabilitados) mientras
          // la RPC viaja y cierra al terminar — antes cerraba al instante y
          // el catálogo seguía tocable durante el canje.
          onConfirm={async (reward) => {
            const entry = await redeem(reward);
            closeRedeemConfirm();
            // UX-17: el QR del canje nuevo entra cuando la hoja terminó de irse
            if (entry && entry.code) setTimeout(() => setNewQr(entry), 240);
          }}
        />
      )}

      {/* ── UX-17: QR del canje recién hecho (portal al body, UX-16) ── */}
      {newQr && isC && me && (
        <RewardQrSheet
          item={newQr}
          closing={newQrClosing}
          onClose={closeNewQr}
          dark={dark}
          dateLabel="Hoy"
          locations={newQrLocations}
          fresh
        />
      )}

      {/* ── Sheet confirmación de compra (nivel raíz, escapa overflow:hidden) ── */}
      {purchaseConfirm && (
        <PurchaseConfirmSheet
          data={purchaseConfirm}
          gT={gT}
          cfg={cfg}
          onClose={() => setPurchaseConfirm(null)}
          addPurchase={addPurchase}
        />
      )}

      {/* ── Sheet del código QR del miembro (botón central) ── */}
      {showQR && isC && me && (
        <ClientQrSheet
          me={me}
          tierName={cTier.name}
          dark={dark}
          closing={qrClosing}
          onClose={closeQR}
        />
      )}

      {/* ── Modal post-compra (Realtime): estrellas + invitación a la
          encuesta Shell de la estación de la compra. UX-06 (7-nov): en la
          RAÍZ — antes solo en ClientHome y la compra pasaba inadvertida si
          el socio estaba en Canjes/Rifa/Vehículos/Menú. key = nueva compra
          reinicia el paso interno del modal. ── */}
      {pendingOpRating && isC && me && (
        <OpRatingModal
          key={pendingOpRating.purchaseId || 'compra'}
          data={pendingOpRating}
          // UX-14: cerrado = visto; el chequeo de compras recientes al
          // volver al frente no lo vuelve a abrir (también cubre el
          // deep-link de la notificación, que no pasa por Realtime).
          onClose={() => { markRatingSeen(pendingOpRating.purchaseId); setPendingOpRating(null); }}
          dark={dark}
          memberId={me.id}
          sbConnected={sbConnected}
          fire={fire}
          cfg={cfg}
          mySurveyCount={mySurveyCount}
          accent={hp.survey}
          accentInk={hp.surveyInk || '#fff'}
          surveyPending={surveyPending}
          setSurveyPending={setSurveyPending}
        />
      )}

      {/* ── Resultado de la encuesta — persistente hasta que el cliente lo
          cierre (éxito · no completada · en espera por red · fallida) ── */}
      {surveyResult && isC && me && (
        <SurveyResultModal
          result={surveyResult}
          onClose={() => setSurveyResult(null)}
          dark={dark}
        />
      )}

      {/* Toast (FORMATO GENERAL — severidad e ícono en Toast.jsx) */}
      <Toast toast={toast} dark={isC && dark} />

      {/* ── Modal de ganador de la rifa mensual (R1b.4) ── */}
      {raffleWin && isC && me && (
        <RaffleWinnerModal
          cal={raffleWin}
          name={me.name}
          stations={stations}
          isBlack={dark}
          onClose={() => {
            // Marca de visto en el SERVIDOR (cross-device) + localStorage
            // como guarda instantánea. Reflejar en raffleCal local para
            // que el efecto no lo re-encuentre antes del próximo fetch.
            try { localStorage.setItem(`pp_rafwin_${raffleWin.dbId}`, '1'); } catch { /* noop */ }
            // SEC.C.4: raffle_calendar perdió la escritura abierta (el
            // premio y hasta el winner_id eran editables) — el RPC solo
            // deja al GANADOR marcar su propia felicitación.
            if (sb) markRaffleWinnerSeen(raffleWin.dbId);
            setRaffleCal(p => p.map(r => r?.dbId === raffleWin.dbId
              ? { ...r, winnerSeenAt: new Date().toISOString() } : r));
            // Rifa multi-año: la ganada puede vivir en el pool de otros años
            setCrossYearWins(p => p.map(r => r?.dbId === raffleWin.dbId
              ? { ...r, winnerSeenAt: new Date().toISOString() } : r));
            setRaffleWin(null);
          }}
        />
      )}

      {/* ── Modal celebrativo de bono por día especial (FB.6.2c) ── */}
      <SpecialDayBonusModal
        open={specialBonusModal.open}
        events={specialBonusModal.events}
        bonus={specialBonusModal.bonus}
        memberName={specialBonusModal.memberName}
        tier={me ? cTier : null}
        dark={dark}
        onClose={() => setSpecialBonusModal(prev => ({ ...prev, open: false }))}
      />

      {/* ── Tutorial interactivo del cliente (21-sep): al crear la cuenta
          y al abrir sesión; reapertura desde Asistencia y ayuda ── */}
      <ClientTourGate ctx={ctx} />

      {/* Aviso de nueva version disponible (Service Worker) */}
      <UpdateAvailable />
    </>
  );
}
