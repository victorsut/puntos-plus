// ============================================================
// Puntos Plus — Tier System (Utilidades de Nivel)
// ============================================================
// Lógica pura de cálculo de niveles. Sin dependencia de React.
// ============================================================

import { DEFAULT_CONFIG, GALAXY_BG } from '../constants/config';

// Meta de la barra de progreso al llegar a BLACK (23-jul-2026; ajustada
// a 1000 el 25-jul-2026 por el dueño): sin nivel siguiente, la barra
// sigue siendo un atractivo avanzando de 500 hacia la meta. Al
// superarla, la barra queda llena.
const BLACK_GOAL_GAL = 1000;

/**
 * Calcula el objeto de nivel completo a partir de galones y config.
 * @param {number} gal - Galones acumulados
 * @param {object} [cfg] - Configuración del programa (opcional)
 * @returns {object} Tier object con nombre, colores, descuentos, etc.
 */
export function makeTier(gal, cfg = DEFAULT_CONFIG) {
  const pt = cfg.tiers.platino;
  const bk = cfg.tiers.black;
  const or = cfg.tiers.oro;

  if (gal >= bk.gal) {
    return {
      name: 'BLACK',
      color: '#FFF',
      bg: '#000',
      discount: bk.discGal ?? 0,
      redeemDisc: bk.discRedeem ?? 0,
      wifi: 'Ilimitado',
      bath: true, // retirado de la UI (dueño 11-ago-2026) — sin consumidores, queda por compatibilidad

      evtPts: bk.evtPts,
      ptsPerGal: bk.ptsPerGal ?? null,
      qPerPt: bk.qPerPt ?? cfg.qPerPt ?? 10,
      next: null,
      rem: 0,
      icon: '🖤',
      grad: GALAXY_BG,
      base: bk.gal,
      target: BLACK_GOAL_GAL,
    };
  }

  if (gal >= pt.gal) {
    return {
      name: 'PLATINO',
      color: '#1A1A1A',
      bg: '#E0E0E0',
      discount: pt.discGal ?? 0,
      redeemDisc: pt.discRedeem ?? 0,
      wifi: 'Ilimitado',
      bath: true,
      evtPts: pt.evtPts,
      ptsPerGal: pt.ptsPerGal ?? null,
      qPerPt: pt.qPerPt ?? cfg.qPerPt ?? 10,
      next: 'BLACK',
      rem: +(bk.gal - gal).toFixed(1),
      icon: '💎',
      grad: 'linear-gradient(135deg,#E0E0E0 0%,#BDBDBD 50%,#E0E0E0 100%)',
      base: pt.gal,
      target: bk.gal,
    };
  }

  return {
    name: 'ORO',
    color: '#000',
    bg: '#FBBC04',
    discount: 0,
    redeemDisc: 0,
    wifi: 'Ilimitado',
    bath: false,
    evtPts: or.evtPts,
    ptsPerGal: or.ptsPerGal ?? null,
    qPerPt: or.qPerPt ?? cfg.qPerPt ?? 10,
    next: 'PLATINO',
    rem: +(pt.gal - gal).toFixed(1),
    icon: '🟡',
    grad: 'linear-gradient(135deg,#FBBC04 0%,#FFD540 50%,#FBBC04 100%)',
    base: 0,
    target: pt.gal,
  };
}

// ── RECALIBRACIÓN (19-sep-2026): puntos POR GALÓN ─────────────
// La fuente de verdad es el RPC register_purchase_core; esto es solo
// para TEXTOS y VISTAS PREVIAS. Mientras la config no traiga ptsPerGal
// (migración 20260919b sin ejecutar) todo cae al esquema anterior.
const TIER_RANK = { ORO: 1, PLATINO: 2, BLACK: 3 };
export const tierRank = (name) => TIER_RANK[String(name || 'ORO').toUpperCase()] || 1;

// ¿El nivel del socio alcanza el nivel mínimo del premio?
export const meetsMinTier = (tierName, minTier) => !minTier || tierRank(tierName) >= tierRank(minTier);

// ¿Existe algún premio activo que se desbloquea en este nivel o antes?
// Solo entonces se anuncia "premios exclusivos" como beneficio (sin
// premios con nivel mínimo, la línea sería una promesa vacía).
export const tierHasExclusives = (tierName, rewards) =>
  (rewards || []).some(r => r.active !== false && r.minTier && tierRank(r.minTier) <= tierRank(tierName));

// "3.5 pts por galón" (sin ceros de más: 4.0 → "4")
export function earnLabel(tier, cfg) {
  if (tier?.ptsPerGal) return `${+Number(tier.ptsPerGal).toFixed(2)} pts por galón`;
  return `1 pt por cada Q${tier?.qPerPt ?? cfg?.qPerPt ?? 10}`;
}

// Precio vigente del combustible (espejo de fuel_price_for del servidor)
export function fuelPriceFor(cfg, station, fuel) {
  const own = cfg?.fuelPricesPerStation ? +station?.fuelPrices?.[fuel] : 0;
  return own > 0 ? own : (+cfg?.fuelPrices?.[fuel] || +cfg?.fuelPrices?.regular || 0);
}

// Vista previa de los puntos BASE de una compra por monto (app del
// operador): galones = monto / precio (2 decimales) × tasa, redondeado.
export function estimatePoints(amount, tier, cfg, price) {
  const amt = +amount || 0;
  if (tier?.ptsPerGal) {
    if (!(price > 0)) return 0;
    return Math.round((Math.round((amt / price) * 100) / 100) * tier.ptsPerGal);
  }
  return Math.floor(amt / (tier?.qPerPt ?? cfg?.qPerPt ?? 10));
}

/**
 * Progreso porcentual hacia el siguiente nivel
 */
export function tierProgress(gal, tier) {
  // Sin nivel siguiente pero con meta (BLACK → BLACK_GOAL_GAL): la
  // barra sigue avanzando; sin meta, llena.
  if (!tier.next && tier.target <= tier.base) return 100;
  return Math.min(((gal - tier.base) / (tier.target - tier.base)) * 100, 100);
}

/**
 * Días de inactividad desde la última compra
 */
export function daysInactive(lastBuyDate) {
  if (!lastBuyDate) return 0;
  return Math.floor((Date.now() - new Date(lastBuyDate).getTime()) / 86400000);
}

