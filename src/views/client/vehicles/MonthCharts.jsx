// src/views/client/vehicles/MonthCharts.jsx
// 9-nov-2026 (pedido del dueño) — CONSUMO POR MES en un solo cuadro con
// CARRUSEL de gráficas: Gasto (Q) · Galones · Km recorridos. Tres barras
// por mes en un mismo eje mezclarían unidades distintas (Q, gal, km) y la
// escala de una aplastaría a las otras; por eso cada serie tiene su
// gráfica y se cambia con las pestañas o deslizando (useSwipeTrack, el
// mismo gesto del carrusel de vehículos y de la rifa).
//
// Km por mes: entre dos lecturas consecutivas de km recorridos, la
// distancia se REPARTE entre los meses según los días que caen en cada
// uno (una carga el 3-oct con lectura previa el 27-sep reparte 4/6 a
// septiembre y 2/6 a octubre). No depende de llenados ni de cargas sin
// registrar: el km del tablero es acumulado.
import { useMemo, useState } from 'react';
import { BRAND_ORANGE } from '../../../constants/styles';
import useSwipeTrack from '../../../hooks/useSwipeTrack';
import { MonthBars } from './VehicleCharts';
import { fmtN, fmtMonth } from './fuelFmt';

const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const entryFor = (acc, d) => {
  const k = keyOf(d);
  if (!acc.has(k)) {
    acc.set(k, {
      label: fmtMonth(d.toISOString()),
      short: d.toLocaleDateString('es-GT', { month: 'short' }).replace('.', ''),
      n: 0, gal: 0, amt: 0, km: 0,
    });
  }
  return acc.get(k);
};

// Meses (más reciente primero, máx. 6) con cargas, galones, Q y km
export function monthlyUsage(loads) {
  const acc = new Map();
  for (const l of loads) {
    const e = entryFor(acc, new Date(l.created_at));
    e.n++; e.gal += +l.gallons || 0; e.amt += +l.amount || 0;
  }
  const reads = loads.filter(l => l.km_reading != null)
    .map(l => ({ t: new Date(l.created_at).getTime(), km: +l.km_reading }))
    .sort((a, b) => a.t - b.t);
  for (let i = 1; i < reads.length; i++) {
    const a = reads[i - 1], b = reads[i];
    const dist = b.km - a.km;
    if (!(dist > 0) || b.t <= a.t) continue;
    // reparto por tramos de calendario entre a.t y b.t
    let t = a.t;
    while (t < b.t) {
      const d = new Date(t);
      const next = Math.min(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), b.t);
      entryFor(acc, d).km += dist * (next - t) / (b.t - a.t);
      t = next;
    }
  }
  return [...acc.entries()].sort((x, y) => y[0].localeCompare(x[0])).slice(0, 6).map(x => x[1]);
}

const SERIES = [
  { k: 'amt', tab: 'Gasto', fmt: (v) => `Q${fmtN(v, 0)}` },
  { k: 'gal', tab: 'Galones', fmt: (v) => `${fmtN(v)} gal` },
  { k: 'km', tab: 'Km recorridos', fmt: (v) => `${fmtN(v, 0)} km` },
];

export default function MonthCharts({ loads, dark, ink, sub, cardBg }) {
  const months = useMemo(() => monthlyUsage(loads), [loads]);
  // la pestaña de km solo existe si hay km repartidos en algún mes
  const series = SERIES.filter(s => s.k !== 'km' || months.some(m => m.km >= 1));
  const [idx, setIdx] = useState(0);
  const cur = Math.min(idx, series.length - 1);
  const swipe = useSwipeTrack({ count: series.length, idx: cur, setIdx });
  if (!months.length) return null;
  const asc = [...months].reverse();

  return (
    <div style={{ background: cardBg, borderRadius: 17, padding: '12px 14px 8px', marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: sub, marginBottom: 8 }}>Consumo por mes</div>
      {months.length >= 2 ? (
        <>
          {/* pestañas: nombran la serie y cambian la gráfica */}
          <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {series.map((s, i) => (
              <button key={s.k} role="tab" aria-selected={i === cur} onClick={() => swipe.go(i)} style={{
                padding: '7px 11px', minHeight: 32, borderRadius: 20, border: 'none', cursor: 'pointer',
                background: i === cur ? (dark ? '#fff' : '#0D0D0D') : (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)'),
                color: i === cur ? (dark ? '#0D0D0D' : '#fff') : sub,
                fontFamily: "'DM Sans'", fontSize: 11.5, fontWeight: 800, transition: 'background .2s, color .2s',
              }}>{s.tab}</button>
            ))}
          </div>
          <div {...swipe.handlers} style={swipe.viewportStyle}>
            <div ref={swipe.trackRef} style={swipe.trackStyle}>
              {series.map((s, i) => (
                <div key={s.k} style={swipe.slideStyle(i)} aria-hidden={i !== cur}>
                  <MonthBars months={asc} metric={s.k} fmt={s.fmt} dark={dark} ink={ink} sub={sub} />
                </div>
              ))}
            </div>
          </div>
          {/* puntos: pista de que se puede deslizar */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, margin: '4px 0 2px' }}>
            {series.map((s, i) => (
              <span key={s.k} style={{
                width: i === cur ? 14 : 5, height: 5, borderRadius: 3, transition: 'width .25s ease',
                background: i === cur ? BRAND_ORANGE : (dark ? 'rgba(255,255,255,.25)' : '#D5D5D8'),
              }} />
            ))}
          </div>
        </>
      ) : months.map(m => (
        // un solo mes: fila simple con todo el detalle
        <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '5px 0' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{m.label}</span>
          <span style={{ fontSize: 12, color: sub, fontWeight: 600, textAlign: 'right' }}>
            {m.n} carga{m.n === 1 ? '' : 's'} · {fmtN(m.gal)} gal{m.km >= 1 ? ` · ${fmtN(m.km, 0)} km` : ''} · <span style={{ color: ink, fontWeight: 800 }}>Q{fmtN(m.amt, 0)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
