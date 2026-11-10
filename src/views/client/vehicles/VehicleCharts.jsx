// src/views/client/vehicles/VehicleCharts.jsx
// F6 E3e (2-sep-2026) — GRÁFICAS de telemetría en SVG puro (cero
// librerías, regla del proyecto). Dos formas elegidas por el trabajo
// del dato (método dataviz):
//   · TrendChart  — rendimiento km/gal POR TRAMO en el tiempo (línea,
//     serie única) con el PROMEDIO como referencia punteada.
//   · MonthBars   — gasto (Q) POR MES (barras, serie única, extremos
//     redondeados anclados a la línea base).
// Color de la serie VALIDADO con el validador de paleta (banda de
// luminosidad + contraste ≥3:1 sobre la superficie de cada modo):
// claro #3E6DC4 · oscuro #5A85D8. El texto SIEMPRE usa tinta de texto
// (ink/sub), nunca el color de la serie. Serie única → sin leyenda (el
// título de la tarjeta la nombra). Tap en una barra = burbuja con el
// detalle; en la línea, tap en un punto = panel fijo (9-nov). El
// "modo tabla" existe: el
// historial de cargas y las filas de consumo.
import { useState } from 'react';

const DATA_C = (dark) => (dark ? '#5A85D8' : '#3E6DC4');
const fmtN = (n, d = 1) => (+n).toLocaleString('en-US', { maximumFractionDigits: d });

// Barra con extremo superior redondeado (r) y base recta en y0
const barPath = (x, y, w, y0, r) => {
  const rr = Math.min(r, w / 2, Math.max(0, y0 - y));
  return `M${x} ${y0} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y0} Z`;
};

// ── Rendimiento por tramo (línea) ────────────────────────────
// 9-nov-2026 (pedido del dueño): hasta 10 puntos y SIN etiquetas sobre
// la línea — el detalle vive en un PANEL FIJO arriba de la gráfica que
// cambia según el punto tocado (por defecto, el último). El punto elegido
// se resalta con un anillo y una guía vertical; cada punto tiene una
// franja vertical completa como blanco de toque, así no se enciman.
// points: [{ label, v, km?, gal?, from?, kind? }]
const KIND_TXT = { full: 'de lleno a lleno', reserve: 'de reserva a reserva', approx: 'cálculo aproximado' };
export function TrendChart({ points: allPoints, avg, dark, ink, sub, surface }) {
  const points = (allPoints || []).slice(-10);
  const last = points.length - 1;
  const [selRaw, setSel] = useState(null);
  if (points.length < 2) return null;
  const sel = selRaw != null && selRaw <= last ? selRaw : last;
  const p = points[sel];
  const W = 320, H = 112, PL = 12, PR = 12, PT = 12, PB = 22;
  const vs = points.map(q => q.v);
  const lo = Math.min(...vs, avg), hi = Math.max(...vs, avg);
  const span = Math.max(hi - lo, 1);
  const y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / span);
  const x = (i) => PL + (W - PL - PR) * (i / last);
  const line = points.map((q, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(q.v).toFixed(1)}`).join(' ');
  const col = DATA_C(dark);
  const slotW = (W - PL - PR) / last;
  const diff = avg > 0 ? Math.round((p.v / avg - 1) * 100) : null;
  return (
    <div>
      {/* panel fijo: detalle del punto elegido + promedio */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, minHeight: 44, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: ink, fontFamily: "'DM Sans'" }}>
            {fmtN(p.v)} km/gal
            {diff != null && diff !== 0 && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: sub, marginLeft: 6 }}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}% vs prom.</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: sub, marginTop: 2, lineHeight: 1.4 }}>
            {p.from ? `${p.from} → ${p.label}` : p.label}
            {p.km != null && p.gal != null ? ` · ${fmtN(p.km, 0)} km con ${fmtN(p.gal, 2)} gal` : ''}
            {KIND_TXT[p.kind] ? ` · ${KIND_TXT[p.kind]}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: sub }}>Promedio</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: ink, marginTop: 2 }}>{fmtN(avg)}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
        aria-label={`Rendimiento de ${points.length} mediciones; seleccionada ${p.label}: ${fmtN(p.v)} km/gal`}>
        {/* referencia: promedio punteado (neutro, recesivo) */}
        <line x1={PL} x2={W - PR} y1={y(avg)} y2={y(avg)} stroke={sub} strokeWidth="1" strokeDasharray="3 4" opacity=".7" />
        <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} stroke={sub} strokeWidth="1" opacity=".25" />
        {/* guía vertical del punto elegido */}
        <line x1={x(sel)} x2={x(sel)} y1={PT - 4} y2={H - PB} stroke={sub} strokeWidth="1" opacity=".35" />
        <path d={line} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((q, i) => (
          <circle key={i} cx={x(i)} cy={y(q.v)} r={i === sel ? 5.5 : 3.5}
            fill={i === sel ? surface : col} stroke={col} strokeWidth={i === sel ? 3 : 0} />
        ))}
        {/* eje x: primera y última fecha */}
        <text x={PL} y={H - 6} fontSize="10" fontWeight="700" fill={sub} fontFamily="'DM Sans'">{points[0].label}</text>
        <text x={W - PR} y={H - 6} textAnchor="end" fontSize="10" fontWeight="700" fill={sub} fontFamily="'DM Sans'">{points[last].label}</text>
        {/* blancos de toque: una franja vertical por punto */}
        {points.map((q, i) => (
          <rect key={`t${i}`} x={x(i) - slotW / 2} y={0} width={slotW} height={H - PB + 6} fill="transparent"
            style={{ cursor: 'pointer' }} onClick={() => setSel(i)} />
        ))}
      </svg>
    </div>
  );
}

// ── Consumo por mes (barras) ─────────────────────────────────
// 9-nov-2026: `metric` elige la serie (amt Q · gal · km) y `fmt` su
// etiqueta — MonthCharts las muestra en carrusel. Un mes en 0 (p. ej.
// sin lecturas de km) queda sin barra ni valor, solo con su nombre.
const fmtQ = (v) => `Q${fmtN(v, 0)}`;
export function MonthBars({ months, dark, ink, sub, metric = 'amt', fmt = fmtQ }) {
  const [sel, setSel] = useState(null);
  if (!months || months.length < 2) return null;
  const W = 320, H = 132, PB = 20, PT = 30;
  const n = months.length;
  const maxV = Math.max(...months.map(m => m[metric] || 0), 1);
  const slot = W / n;
  const bw = Math.min(38, slot - 14);
  const y = (v) => PT + (H - PT - PB) * (1 - v / maxV);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <line x1="0" x2={W} y1={H - PB} y2={H - PB} stroke={sub} strokeWidth="1" opacity=".25" />
      {months.map((m, i) => {
        const v = m[metric] || 0;
        const bx = slot * i + (slot - bw) / 2;
        const by = y(v);
        return (
          <g key={m.label} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
            <rect x={slot * i} y={PT - 8} width={slot} height={H - PT - PB + 8 + PB} fill="transparent" />
            {v > 0 && <path d={barPath(bx, by, bw, H - PB, 4)} fill={DATA_C(dark)} opacity={sel == null || sel === i ? 1 : 0.45} />}
            {/* valor en tinta de texto sobre la barra */}
            {v > 0 && (
              <text x={bx + bw / 2} y={by - 5} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={ink} fontFamily="'DM Sans'">
                {fmt(v)}
              </text>
            )}
            <text x={bx + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill={sub} fontFamily="'DM Sans'">{m.short}</text>
          </g>
        );
      })}
      {/* burbuja del mes tocado: el mes completo (cargas, gal, Q, km) */}
      {sel != null && (
        <text x={W / 2} y={12} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={ink} fontFamily="'DM Sans'">
          {months[sel].label}: {months[sel].n} carga{months[sel].n === 1 ? '' : 's'} · {fmtN(months[sel].gal)} gal · Q{fmtN(months[sel].amt, 0)}{months[sel].km > 0 ? ` · ${fmtN(months[sel].km, 0)} km` : ''}
        </text>
      )}
    </svg>
  );
}
