// src/views/client/vehicles/VehicleFuel.jsx
// F6 E3a (2-sep-2026, pedido del dueño) — RENDIMIENTO Y CONSUMO del
// vehículo activo: indicadores, gráfica de rendimiento por llenado,
// consumo por mes, registro manual (FuelLogForm) e HISTORIAL DE CARGAS
// (FuelHistoryRow) con editor de reasignación.
//
// E3f (21-sep-2026, reporte del dueño con la Navi de Ezer): el
// rendimiento se calcula DE LLENO A LLENO (src/lib/fuelEconomy.js,
// espejo del algoritmo server-side de list_my_vehicle_stats): entre
// dos llenados completos con km recorridos, todo el combustible
// cargado en medio (parciales incluidas) es lo consumido. Antes, un
// tramo por carga daba 567 km/gal tras Q10 y 33 km/gal al llenar.
// Vocabulario: "kilómetros recorridos", nunca "odómetro".
//
// Datos: list_my_fuel_history + assign_purchase_vehicle +
// set_my_fuel_load_full. Si la migración no está ejecutada, la sección
// no aparece (la app no rompe — precedente E2).
import { useEffect, useMemo, useState } from 'react';
import { BRAND_ORANGE } from '../../../constants/styles';
import { VEHICLE_TYPES } from '../../../components/ui/VehicleIcons';
import { assignPurchaseVehicle, deleteMyFuelLog, listMyFuelHistory, setMyFuelLoadFull } from '../../../services/vehicleService';
import { fuelSummary, fuelWindows, isFullLoad, isInferredFull } from '../../../lib/fuelEconomy';
import { MonthBars, TrendChart } from './VehicleCharts';
import FuelLogForm from './FuelLogForm';
import FuelHistoryRow from './FuelHistoryRow';
import { fmtN, fmtDay, fmtMonth } from './fuelFmt';

// `preload`: datos iniciales para el arnés de vista previa (sin backend);
// en producción no se pasa y el historial baja por list_my_fuel_history.
export default function VehicleFuel({ dark, fire, vehicles, vehicle, stats, onStatsDirty, preload = null }) {
  const [loads, setLoads] = useState(preload);    // null=cargando · false=sin RPC · []=vacío
  const [editableDays, setEditableDays] = useState(30);
  const [editingId, setEditingId] = useState(null);   // fila con el editor de vehículo abierto
  const [fullOpenId, setFullOpenId] = useState(null); // fila con las opciones de tanque abiertas
  const [busyId, setBusyId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [reg, setReg] = useState(false);              // E3b: formulario de registro manual
  const [delLogArmed, setDelLogArmed] = useState(null); // id armado para borrar
  const [histOpen, setHistOpen] = useState(false);    // E3d: historial contraído por defecto

  const fetchLoads = () => listMyFuelHistory().then(({ data, error }) => {
    if (error || !data?.ok) { setLoads(false); return; }
    setLoads(Array.isArray(data.loads) ? data.loads : []);
    if (data.editable_days) setEditableDays(data.editable_days);
  });
  useEffect(() => {
    if (preload) return;
    let alive = true;
    listMyFuelHistory().then(({ data, error }) => {
      if (!alive) return;
      if (error || !data?.ok) { setLoads(false); return; }
      setLoads(Array.isArray(data.loads) ? data.loads : []);
      if (data.editable_days) setEditableDays(data.editable_days);
    });
    return () => { alive = false; };
  }, [preload]);

  const ink = dark ? '#fff' : '#0D0D0D';
  const sub = dark ? 'rgba(255,255,255,.5)' : '#9E9E9E';
  const cardBg = dark ? 'rgba(255,255,255,.07)' : '#F5F5F7';
  const lbl = { fontSize: 11, fontWeight: 800, color: sub, textTransform: 'uppercase', letterSpacing: 1 };

  const vehById = useMemo(() => {
    const m = {};
    for (const x of vehicles) m[x.id] = x;
    return m;
  }, [vehicles]);
  const vehName = (vid) => {
    const x = vehById[vid];
    if (!x) return null;
    return [x.brand, x.model].filter(Boolean).join(' ')
      || (VEHICLE_TYPES.find(t => t.k === x.vtype)?.label ?? 'Vehículo');
  };

  // E3f: ventanas de lleno a lleno de TODOS los vehículos (el historial
  // general las necesita) — indexadas por la carga que cierra la ventana
  const winByEnd = useMemo(() => {
    const out = {};
    if (!Array.isArray(loads)) return out;
    const byVeh = {};
    for (const l of loads) if (l.vehicle_id) (byVeh[l.vehicle_id] = byVeh[l.vehicle_id] || []).push(l);
    for (const [vid, rows] of Object.entries(byVeh)) {
      for (const w of fuelWindows(rows, vehById[vid]?.tank_gal)) out[w.endId] = w;
    }
    return out;
  }, [loads, vehById]);

  // filas del vehículo ACTIVO (resumen, consumo por mes, frecuencia)
  const mine = useMemo(
    () => (Array.isArray(loads) ? loads.filter(l => l.vehicle_id === vehicle?.id) : []),
    [loads, vehicle?.id]);
  const summary = useMemo(() => fuelSummary(mine, vehicle?.tank_gal), [mine, vehicle?.tank_gal]);
  const months = useMemo(() => {
    const acc = new Map();
    for (const l of mine) {
      const d = new Date(l.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const e = acc.get(k) || {
        label: fmtMonth(l.created_at),
        short: new Date(l.created_at).toLocaleDateString('es-GT', { month: 'short' }).replace('.', ''),
        n: 0, gal: 0, amt: 0,
      };
      e.n++; e.gal += +l.gallons || 0; e.amt += +l.amount || 0;
      acc.set(k, e);
    }
    return [...acc.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(x => x[1]);
  }, [mine]);
  // E3e: puntos de la gráfica — una por ventana de lleno a lleno
  const trendPoints = useMemo(
    () => summary.windows.map(w => ({ label: fmtDay(w.to), v: w.kmgal })),
    [summary]);

  // Titular: el cálculo local (mismo algoritmo, últimas 40 cargas) manda
  // sobre el del servidor para que la gráfica y el número coincidan; el
  // servidor es el respaldo (y la fuente para el resto de la app).
  const st = vehicle ? stats?.[vehicle.id] : null;
  const kmgal = summary.kmPerGal ?? st?.km_per_gal ?? null;
  const method = summary.method ?? st?.km_per_gal_method ?? null;
  const galCarga = st?.fuel_count > 0 ? st.total_gallons / st.fuel_count : null;
  const qGal = st?.total_gallons > 0 ? st.total_amount / st.total_gallons : null;
  const costoKm = qGal && kmgal > 0 ? qGal / kmgal : null;
  const frecuencia = useMemo(() => {
    if (mine.length < 2) return null;
    const days = (new Date(mine[0].created_at) - new Date(mine[mine.length - 1].created_at)) / 86400000;
    return days >= 1 ? Math.round(days / (mine.length - 1)) : null;
  }, [mine]);
  const costoMes = costoKm && st?.km_per_day > 0 ? costoKm * st.km_per_day * 30.4 : null;
  const autonomia = vehicle?.tank_gal > 0 && kmgal > 0 ? Math.round(vehicle.tank_gal * kmgal) : null;
  const hasKm = mine.some(l => l.km_reading != null);

  if (loads === false || !vehicle) return null; // migración pendiente o sin vehículo

  // Nota del indicador de rendimiento según el método y la tendencia
  // (E3d: caída ≥10 % vs tu promedio = aviso; solo con ≥3 ventanas)
  const trendPct = summary.trendPct;
  const n = summary.windows.length;
  const kmNote = trendPct != null
    ? `${trendPct >= 0 ? '▲' : '▼'} ${Math.abs(trendPct)}% vs tu promedio${trendPct <= -10 ? ' — revisa servicio, llantas o presión' : ''}`
    : method === 'full' ? `De lleno a lleno · ${n} medición${n === 1 ? '' : 'es'}`
    : method === 'estimate' ? 'Estimado — marca tus llenados completos para afinarlo'
    : hasKm ? 'Marca un llenado completo con tus km para medirlo'
    : 'Reporta tus km recorridos al calificar';

  const insights = [
    { k: 'kmgal', label: 'Rendimiento', value: kmgal ? `${fmtN(kmgal)} km/gal` : '—', note: kmNote, warn: trendPct != null && trendPct <= -10 },
    { k: 'costo', label: 'Costo por km', value: costoKm ? `Q${fmtN(costoKm, 2)}` : '—', note: costoKm ? `A Q${fmtN(qGal, 2)} el galón` : 'Necesita rendimiento' },
    { k: 'mes', label: 'Costo mensual', value: costoMes ? `~Q${fmtN(costoMes, 0)}` : '—', note: costoMes ? `A tu ritmo de ${fmtN(st.km_per_day, 0)} km/día` : 'Necesita rendimiento y ritmo' },
    { k: 'auto', label: 'Autonomía', value: autonomia ? `~${fmtN(autonomia, 0)} km` : '—', note: autonomia ? `Por tanque de ${fmtN(vehicle.tank_gal)} gal` : 'Agrega el tanque en Datos y ajustes' },
    { k: 'galc', label: 'Por carga', value: galCarga ? `${fmtN(galCarga)} gal` : '—', note: galCarga ? `Q${fmtN(st.total_amount / st.fuel_count, 0)} en promedio` : 'Aún sin cargas' },
    { k: 'frec', label: 'Frecuencia', value: frecuencia ? `Cada ${frecuencia} día${frecuencia === 1 ? '' : 's'}` : '—', note: frecuencia ? `${mine.length} cargas recientes` : 'Con 2+ cargas' },
  ];

  // 3-sep (pedido del dueño): el historial muestra SOLO las cargas del
  // vehículo seleccionado; "Ver todas" abre el historial general (todos
  // los vehículos + cargas sin asignar) — ahí vive el editor de reasignación.
  const visible = Array.isArray(loads) ? (showAll ? loads : mine) : [];
  const othersN = Array.isArray(loads) ? loads.length - mine.length : 0;
  useEffect(() => { setShowAll(false); }, [vehicle?.id]);
  const canEdit = (l) => (Date.now() - new Date(l.created_at)) / 86400000 <= editableDays;
  const lastKm = Math.max(vehicle.km || 0, ...mine.filter(l => l.km_reading != null).map(l => l.km_reading));

  // borrar un registro manual (doble tap — un manual equivocado
  // envenena la telemetría y debe poder corregirse)
  const delLog = async (l) => {
    if (delLogArmed !== l.id) { setDelLogArmed(l.id); setTimeout(() => setDelLogArmed(x => (x === l.id ? null : x)), 2500); return; }
    setDelLogArmed(null);
    const { error } = await deleteMyFuelLog(l.id);
    if (error) { fire('No se pudo borrar: ' + (error.message || 'error'), 'error'); return; }
    fire('Registro borrado', 'success');
    fetchLoads();
    onStatsDirty?.();
  };

  const reassign = async (l, vid) => {
    if (busyId) return;
    setBusyId(l.id);
    const prevVid = l.vehicle_id;
    setLoads(ls => ls.map(x => (x.id === l.id ? { ...x, vehicle_id: vid } : x))); // optimista
    const { error } = await assignPurchaseVehicle({ purchaseId: l.id, vehicleId: vid });
    setBusyId(null);
    setEditingId(null);
    if (error) {
      setLoads(ls => ls.map(x => (x.id === l.id ? { ...x, vehicle_id: prevVid } : x)));
      fire('No se pudo corregir: ' + (error.message || 'error'), 'error');
      return;
    }
    fire('Carga corregida', 'success');
    onStatsDirty?.();
  };

  // E3f: marcar/desmarcar tanque lleno desde el historial
  const setFull = async (l, full) => {
    if (busyId) return;
    setBusyId(l.id);
    const prev = l.full_tank;
    setLoads(ls => ls.map(x => (x.id === l.id ? { ...x, full_tank: full } : x))); // optimista
    const { error } = await setMyFuelLoadFull({ loadId: l.id, source: l.source, full });
    setBusyId(null);
    setFullOpenId(null);
    if (error) {
      setLoads(ls => ls.map(x => (x.id === l.id ? { ...x, full_tank: prev } : x)));
      fire('No se pudo guardar: ' + (error.message || 'error'), 'error');
      return;
    }
    fire(full === true ? 'Marcada como tanque lleno' : full === false ? 'Marcada como carga parcial' : 'Sin respuesta: se calcula por el tamaño de la carga', 'success');
    onStatsDirty?.();
  };

  return (
    <div style={{ marginTop: 22 }}>
      <div style={lbl}>Rendimiento y consumo</div>

      {/* Indicadores del vehículo activo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
        {insights.map(t => (
          <div key={t.k} style={{ background: cardBg, borderRadius: 17, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: sub }}>{t.label}</div>
            <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 5, color: t.warn ? '#E65100' : ink }}>{t.value}</div>
            <div style={{ fontSize: 10.5, color: t.warn ? '#E65100' : sub, fontWeight: 600, marginTop: 3 }}>{t.note}</div>
          </div>
        ))}
      </div>

      {/* E3e/E3f: rendimiento por llenado — una medición por ventana de
          lleno a lleno, con el promedio ponderado punteado (≥2 ventanas) */}
      {trendPoints.length >= 2 && (
        <div style={{ background: cardBg, borderRadius: 17, padding: '12px 14px 8px', marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: sub, marginBottom: 6 }}>Rendimiento por llenado</div>
          <TrendChart points={trendPoints} avg={summary.kmPerGal}
            dark={dark} ink={ink} sub={sub} surface={dark ? '#2A2A30' : '#F5F5F7'} />
        </div>
      )}

      {/* Consumo por mes (vehículo activo) — barras con ≥2 meses
          (tap en una barra = cargas y galones); con 1 mes, fila simple */}
      {months.length > 0 && (
        <div style={{ background: cardBg, borderRadius: 17, padding: '12px 14px 8px', marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: sub, marginBottom: 8 }}>Consumo por mes</div>
          {months.length >= 2 ? (
            <MonthBars months={[...months].reverse()} dark={dark} ink={ink} sub={sub} />
          ) : months.map(m => (
            <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{m.label}</span>
              <span style={{ fontSize: 12, color: sub, fontWeight: 600 }}>
                {m.n} carga{m.n === 1 ? '' : 's'} · {fmtN(m.gal)} gal · <span style={{ color: ink, fontWeight: 800 }}>Q{fmtN(m.amt, 0)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* E3b: registrar consumo MANUAL (carga fuera de Turkaj) */}
      {!reg ? (
        <button onClick={() => setReg(true)} style={{
          width: '100%', marginTop: 10, padding: 13, borderRadius: 15, cursor: 'pointer',
          border: `1.5px dashed ${dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.18)'}`,
          background: 'transparent', color: ink,
          fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 800,
        }}>+ Registrar consumo</button>
      ) : (
        <FuelLogForm dark={dark} ink={ink} sub={sub} cardBg={cardBg} vehicle={vehicle}
          vehName={vehName(vehicle.id)} lastKm={lastKm} fire={fire}
          onCancel={() => setReg(false)}
          onSaved={() => { setReg(false); fetchLoads(); onStatsDirty?.(); }} />
      )}

      {/* Historial de cargas del miembro + editor de reasignación.
          E3d: CONTRAÍDO por defecto (pedido del dueño — la vista del
          vehículo se saturaba); el encabezado despliega/contrae */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px' }}>
        <button onClick={() => setHistOpen(o => !o)} style={{
          border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 7,
        }}>
          <span style={lbl}>Historial de cargas{Array.isArray(loads) && loads.length > 0 ? ` (${showAll ? loads.length : mine.length})` : ''}</span>
          <svg width="13" height="13" viewBox="0 0 16 16" style={{ color: sub, transform: histOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>
            <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {histOpen && othersN > 0 && (
          <button onClick={() => setShowAll(s => !s)} style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
            color: BRAND_ORANGE, fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 800,
          }}>{showAll ? 'Solo este vehículo' : `Ver todas (${loads.length})`}</button>
        )}
      </div>

      {histOpen && Array.isArray(loads) && loads.length > 0 && !showAll && mine.length === 0 && (
        <div style={{ background: cardBg, borderRadius: 17, padding: '14px', fontSize: 12.5, color: sub, fontWeight: 600, lineHeight: 1.5 }}>
          Este vehículo aún no tiene cargas registradas. Toca <b style={{ color: BRAND_ORANGE }}>Ver todas</b> para revisar el historial general y asignarle alguna.
        </div>
      )}

      {loads === null && (
        <div style={{ fontSize: 12, color: sub, fontWeight: 600 }}>Cargando…</div>
      )}
      {Array.isArray(loads) && loads.length === 0 && (
        <div style={{ background: cardBg, borderRadius: 17, padding: '14px', fontSize: 12.5, color: sub, fontWeight: 600, lineHeight: 1.5 }}>
          Aquí verás cada carga de combustible con su rendimiento. Carga en Turkaj y califica tu compra para empezar.
        </div>
      )}

      {histOpen && visible.map(l => {
        const veh = vehById[l.vehicle_id];
        const tank = veh?.tank_gal;
        return (
          <FuelHistoryRow key={l.id} l={l} dark={dark} ink={ink} sub={sub} cardBg={cardBg}
            name={l.vehicle_id ? vehName(l.vehicle_id) : null} dot={veh?.color}
            fuelMismatch={l.source !== 'manual' && !!l.fuel_type && !!veh?.fuel_pref && l.fuel_type !== veh.fuel_pref}
            vehicles={vehicles} vehName={vehName}
            win={winByEnd[l.id]} isFull={!!l.vehicle_id && isFullLoad(l, tank)} inferred={!!l.vehicle_id && isInferredFull(l, tank)}
            canReassign={l.source !== 'manual' && canEdit(l)}
            canMarkFull={l.source === 'manual' || canEdit(l)}
            editOpen={editingId === l.id} onToggleEdit={() => { setEditingId(editingId === l.id ? null : l.id); setFullOpenId(null); }}
            onReassign={(vid) => reassign(l, vid)} busy={busyId === l.id}
            delArmed={delLogArmed === l.id} onDel={() => delLog(l)}
            fullOpen={fullOpenId === l.id} onToggleFullOpen={() => { setFullOpenId(fullOpenId === l.id ? null : l.id); setEditingId(null); }}
            onSetFull={(v) => setFull(l, v)} />
        );
      })}

      {histOpen && Array.isArray(loads) && loads.length > 0 && (
        <div style={{ fontSize: 10.5, color: sub, fontWeight: 600, lineHeight: 1.5, marginTop: 4 }}>
          ¿Una carga quedó en el vehículo equivocado o con el tanque mal marcado? Tócale el
          lápiz o la pastilla del tanque y corrígela (hasta {editableDays} días).
        </div>
      )}
    </div>
  );
}
