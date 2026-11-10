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
// set_my_fuel_load_state / set_my_fuel_load_gap (E3h). Si la migración
// no está ejecutada, la sección no aparece (la app no rompe — precedente E2).
import { useEffect, useMemo, useState } from 'react';
import { BRAND_ORANGE, bento } from '../../../constants/styles';
import { VEHICLE_TYPES } from '../../../components/ui/VehicleIcons';
import { assignPurchaseVehicle, deleteMyFuelLog, listMyFuelHistory, listMyVehicleEvents, setMyFuelLoadState, setMyFuelLoadGap } from '../../../services/vehicleService';
import { fuelSummary, serverSummary, isFullLoad, isInferredFull, tankStateParams, APPROX_LOADS } from '../../../lib/fuelEconomy';
import { TrendChart } from './VehicleCharts';
import MonthCharts from './MonthCharts';
import FuelLogForm from './FuelLogForm';
import FuelHistoryRow from './FuelHistoryRow';
import FuelEventRow from './FuelEventRow';
import FuelInvite from './FuelInvite';
import { fmtN, fmtDay } from './fuelFmt';
import { friendlyError } from '../../../lib/netError';
import { readVehicleSnapshot, writeVehicleSnapshot } from '../../../lib/vehicleSnapshot';

// RPC inexistente (migración pendiente / arnés sin backend) → la sección
// no aparece; cualquier OTRO fallo (red, timeout) se avisa con reintento (UX-08).
const rpcMissing = (error) => /PGRST202|42883|does not exist|Could not find the function/i.test(`${error?.code || ''} ${error?.message || ''}`);

// `preload` / `preloadEvents`: datos iniciales para el arnés de vista
// previa (sin backend); en producción no se pasan y bajan por RPC.
// 10-nov (sin conexión): `offline` = la vista pinta la foto del celular →
// solo lectura; `syncKey` cambia con Reintentar / al volver la red;
// `onLoadsOffline(fecha|null)` avisa al padre si las cargas vinieron de la foto.
export default function VehicleFuel({ dark, fire, vehicles, vehicle, stats, onStatsDirty, statsError = false, preload = null, preloadEvents = null,
  memberId = null, offline = false, syncKey = 0, onLoadsOffline }) {
  const [loads, setLoads] = useState(preload);    // null=cargando · false=sin RPC · []=vacío
  const [loadErr, setLoadErr] = useState(null);   // UX-08: fallo de carga (texto) — se ofrece Reintentar
  // E3g: movimientos del vehículo (servicios, alta, edición, silencio)
  // — se intercalan con las cargas en el Historial del vehículo. Si la
  // migración 20260921d no está, queda [] y el historial sigue igual.
  const [events, setEvents] = useState(preloadEvents || []);
  const fetchEvents = () => listMyVehicleEvents().then(({ data }) => {
    setEvents(data?.ok && Array.isArray(data.events) ? data.events : []);
  });
  // se recarga cuando cambia la ficha del vehículo activo (el padre
  // reemplaza el objeto al confirmar un servicio o editar datos)
  useEffect(() => { if (!preloadEvents) fetchEvents(); }, [preloadEvents, vehicle]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editableDays, setEditableDays] = useState(30);
  const [editingId, setEditingId] = useState(null);   // fila con el editor de vehículo abierto
  const [fullOpenId, setFullOpenId] = useState(null); // fila con las opciones de tanque abiertas
  const [busyId, setBusyId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [reg, setReg] = useState(false);              // E3b: formulario de registro manual
  const [delLogArmed, setDelLogArmed] = useState(null); // id armado para borrar
  const [histOpen, setHistOpen] = useState(false);    // E3d: historial contraído por defecto

  const applyLoads = ({ data, error }) => {
    if (error || !data?.ok) {
      if (error && rpcMissing(error)) { setLoads(false); return; }
      // 10-nov: sin red → las cargas de la última foto del celular
      const snap = error ? readVehicleSnapshot(memberId) : null;
      if (Array.isArray(snap?.loads?.rows)) {
        setLoadErr(null); setLoads(snap.loads.rows);
        if (snap.loads.editable_days) setEditableDays(snap.loads.editable_days);
        onLoadsOffline?.(snap.loadsAt || snap.at);
        return;
      }
      // UX-08: antes cualquier error ocultaba TODA la sección en silencio
      setLoadErr(friendlyError(error, 'No se pudo cargar tu consumo.'));
      setLoads(ls => (Array.isArray(ls) ? ls : null));
      return;
    }
    setLoadErr(null);
    setLoads(Array.isArray(data.loads) ? data.loads : []);
    if (data.editable_days) setEditableDays(data.editable_days);
    writeVehicleSnapshot(memberId, 'loads', { rows: Array.isArray(data.loads) ? data.loads : [], editable_days: data.editable_days || null });
    onLoadsOffline?.(null);
  };
  const fetchLoads = () => { setLoadErr(null); return listMyFuelHistory().then(applyLoads); };
  useEffect(() => {
    if (preload) return;
    let alive = true;
    listMyFuelHistory().then(res => { if (alive) applyLoads(res); });
    return () => { alive = false; };
  }, [preload]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reintentar / volvió la red: recargar cargas y movimientos
  useEffect(() => {
    if (preload || !syncKey) return;
    fetchLoads(); if (!preloadEvents) fetchEvents();
  }, [syncKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const offMsg = () => fire('Sin conexión: conéctate para hacer cambios', 'error');

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

  // E3h: el SERVIDOR (list_my_vehicle_stats) es la única fuente de las
  // ventanas y las anclas de TODOS los vehículos — recorre todas las
  // cargas y aparta las implausibles; el cálculo local (mismo algoritmo
  // sobre las últimas 40 cargas) queda solo de RESPALDO cuando la RPC
  // aún no trae `windows` (migración pendiente / arnés sin backend).
  const summaryOf = (vid, rows) => serverSummary(stats?.[vid]) ?? fuelSummary(rows, vehById[vid]?.tank_gal, vehById[vid]?.vtype);
  const { winByEnd, anchorIds } = useMemo(() => {
    const winByEnd = {}, anchorIds = new Set();
    if (!Array.isArray(loads)) return { winByEnd, anchorIds };
    const byVeh = {};
    for (const l of loads) if (l.vehicle_id) (byVeh[l.vehicle_id] = byVeh[l.vehicle_id] || []).push(l);
    for (const [vid, rows] of Object.entries(byVeh)) {
      const s = summaryOf(vid, rows);
      for (const w of s.allWindows) winByEnd[w.endId] = w;
      for (const id of s.anchors) anchorIds.add(id);
    }
    return { winByEnd, anchorIds };
  }, [loads, vehById, stats]); // eslint-disable-line react-hooks/exhaustive-deps

  // filas del vehículo ACTIVO (resumen, consumo por mes, frecuencia)
  const mine = useMemo(
    () => (Array.isArray(loads) ? loads.filter(l => l.vehicle_id === vehicle?.id) : []),
    [loads, vehicle?.id]);
  const summary = useMemo(() => summaryOf(vehicle?.id, mine), [mine, vehicle?.id, stats]); // eslint-disable-line react-hooks/exhaustive-deps
  // E3e: puntos de la gráfica — una por ventana de lleno a lleno
  const trendPoints = useMemo(
    () => summary.windows.map(w => ({ label: fmtDay(w.to), from: w.from ? fmtDay(w.from) : null, v: w.kmgal, km: w.km, gal: w.gal, kind: w.kind })),
    [summary]);

  // Titular: el del servidor (summary viene de stats cuando la RPC trae
  // ventanas); el resto de la tarjeta sigue leyendo stats directo.
  const st = vehicle ? stats?.[vehicle.id] : null;
  const kmgal = summary.kmPerGal ?? st?.km_per_gal ?? null;
  const method = summary.method ?? st?.km_per_gal_method ?? null;
  const galCarga = st?.fuel_count > 0 ? st.total_gallons / st.fuel_count : null;
  // Costo por km con el ÚLTIMO precio pagado (pedido del dueño 21-sep):
  // Q/gal de la carga más reciente del vehículo con monto y galones;
  // el promedio histórico queda solo de respaldo.
  const lastPriced = mine.find(l => +l.amount > 0 && +l.gallons > 0);
  const qGal = lastPriced ? +lastPriced.amount / +lastPriced.gallons
    : (st?.total_gallons > 0 ? st.total_amount / st.total_gallons : null);
  const costoKm = qGal && kmgal > 0 ? qGal / kmgal : null;
  const frecuencia = useMemo(() => {
    if (mine.length < 2) return null;
    const days = (new Date(mine[0].created_at) - new Date(mine[mine.length - 1].created_at)) / 86400000;
    return days >= 1 ? Math.round(days / (mine.length - 1)) : null;
  }, [mine]);
  const costoMes = costoKm && st?.km_per_day > 0 ? costoKm * st.km_per_day * 30.4 : null;
  const autonomia = vehicle?.tank_gal > 0 && kmgal > 0 ? Math.round(vehicle.tank_gal * kmgal) : null;
  const hasKm = mine.some(l => l.km_reading != null);

  // (el retorno "migración pendiente / sin vehículo" va al FINAL, después de
  // todos los hooks — UX-08: acá arriba violaba las Rules of Hooks y
  // tronaba el componente cuando la RPC fallaba tras el primer render)

  // Nota del indicador de rendimiento según el método y la tendencia
  // (E3d: caída ≥10 % vs tu promedio = aviso; solo con ≥3 ventanas)
  const trendPct = summary.trendPct;
  const n = summary.windows.length;
  // E3h: mediciones apartadas por implausibles (casi siempre una carga
  // sin registrar) — se avisa en la nota del indicador
  const excl = summary.excluded ? ` · ${summary.excluded} no contada${summary.excluded === 1 ? '' : 's'}: parece que faltó una carga` : '';
  // UX-24: sin respuesta del servidor el titular sale del cálculo local
  // (últimas 40 cargas) — se marca como provisional
  const provisional = statsError && !stats?.[vehicle?.id]?.windows;
  // Estimado: se muestra desde la SEGUNDA carga con km (decisión del
  // dueño: el socio quiere ver movimiento aunque aún no sea exacto)
  const kmLoads = mine.filter(l => l.km_reading != null).length;
  // E3i: tramos aproximados (sin lleno ni reserva) — se nombran como tales
  const nApprox = summary.nApprox || 0;
  const aprox = nApprox ? ` · ${nApprox} aprox.` : '';
  // UX-23 (7-nov-2026): lenguaje llano — "medido de lleno a lleno",
  // "cálculo aproximado con N cargas", nunca "referencia/tramo/apartada"
  const kmNote = (provisional ? 'Provisional (sin conexión) · ' : '') + (trendPct != null
    ? `${method === 'approx' ? 'Aprox. · ' : ''}${trendPct >= 0 ? '▲' : '▼'} ${Math.abs(trendPct)}% vs tu promedio${trendPct <= -10 ? ' — revisa servicio, llantas o presión' : ''}${excl}`
    : method === 'full' ? `Medido de lleno a lleno · ${n} medición${n === 1 ? '' : 'es'}${aprox}${excl}`
    : method === 'approx' ? `Cálculo aproximado con ${APPROX_LOADS}+ cargas · ${n} tramo${n === 1 ? '' : 's'} · llena el tanque para afinarlo${excl}`
    : method === 'estimate' ? `Estimado con ${kmLoads} cargas · llena el tanque para afinarlo${excl}`
    : hasKm ? 'Con tu próxima carga con km verás un estimado'
    : 'Reporta tus km recorridos al calificar');
  const [showHow, setShowHow] = useState(false); // UX-23: "¿Cómo se calcula?"
  // Sugerencia de LLENAR EL TANQUE (dueño, 21-sep): mientras no haya
  // medición exacta y ya existan cargas, se le explica cómo lograrla.
  const nudge = method !== 'full' && mine.length >= 2;

  // 9-nov-2026 (pedido del dueño): SOLO se muestran los indicadores que ya
  // tienen dato — nada de cuadros con "—". Van apareciendo a medida que el
  // socio registra cargas y km; sin ninguna carga, una invitación.
  const insights = [
    kmgal && { k: 'kmgal', label: 'Rendimiento', value: `${fmtN(kmgal)} km/gal`, note: kmNote, warn: trendPct != null && trendPct <= -10 },
    costoKm && { k: 'costo', label: 'Costo por km', value: `Q${fmtN(costoKm, 2)}`, note: `A Q${fmtN(qGal, 2)} el galón${lastPriced ? ' (última carga)' : ''}` },
    costoMes && { k: 'mes', label: 'Costo mensual', value: `~Q${fmtN(costoMes, 0)}`, note: `A tu ritmo de ${fmtN(st.km_per_day, 0)} km/día` },
    autonomia && { k: 'auto', label: 'Autonomía', value: `~${fmtN(autonomia, 0)} km`, note: `Por tanque de ${fmtN(vehicle.tank_gal)} gal` },
    galCarga && { k: 'galc', label: 'Por carga', value: `${fmtN(galCarga)} gal`, note: `Q${fmtN(st.total_amount / st.fuel_count, 0)} en promedio` },
    frecuencia && { k: 'frec', label: 'Frecuencia', value: `Cada ${frecuencia} día${frecuencia === 1 ? '' : 's'}`, note: `${mine.length} cargas recientes` },
  ].filter(Boolean);
  // sin cargas del vehículo activo (ya bajado el historial) → invitación
  const noData = Array.isArray(loads) && mine.length === 0;
  // qué falta para ver el rendimiento (antes era la nota del cuadro con "—");
  // con 2+ cargas lo cubre la sugerencia de llenar el tanque
  const kmHint = !kmgal && mine.length > 0 && !nudge ? kmNote : null;

  // 3-sep (pedido del dueño): el historial muestra SOLO las cargas del
  // vehículo seleccionado; "Ver todas" abre el historial general (todos
  // los vehículos + cargas sin asignar) — ahí vive el editor de reasignación.
  const visible = Array.isArray(loads) ? (showAll ? loads : mine) : [];
  const othersN = Array.isArray(loads) ? loads.length - mine.length : 0;
  // E3g: cargas + movimientos del vehículo en una sola línea de tiempo
  const visibleEvents = showAll ? events : events.filter(e => e.vehicle_id === vehicle?.id);
  const timeline = useMemo(() => [
    ...visible.map(l => ({ kind: 'load', at: new Date(l.created_at).getTime(), l })),
    ...visibleEvents.map(e => ({ kind: 'event', at: new Date(e.created_at).getTime(), e })),
  ].sort((a, b) => b.at - a.at), [visible, visibleEvents]);
  useEffect(() => { setShowAll(false); }, [vehicle?.id]);
  const canEdit = (l) => (Date.now() - new Date(l.created_at)) / 86400000 <= editableDays;
  // E3h: última lectura de km del vehículo (la mayor entre la ficha y
  // sus cargas) y su fecha — base del bloqueo de lecturas en el registro
  // manual (kmReadingProblem; el servidor repite la regla)
  const { lastKm, lastAt } = (() => {
    let lastKm = vehicle?.km || 0, lastAt = vehicle?.km_updated_at || null;
    for (const l of mine) {
      if (l.km_reading != null && l.km_reading >= lastKm) { lastKm = l.km_reading; lastAt = l.created_at; }
    }
    return { lastKm, lastAt };
  })();

  // borrar un registro manual (doble tap — un manual equivocado
  // envenena la telemetría y debe poder corregirse)
  const delLog = async (l) => {
    if (delLogArmed !== l.id) { setDelLogArmed(l.id); setTimeout(() => setDelLogArmed(x => (x === l.id ? null : x)), 8000); return; }
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

  // E3h: corregir desde el historial el estado del tanque (lleno /
  // reserva / parcial / no sé) o la marca de cargas sin registrar.
  // Optimista con reversión; al terminar se recarga la telemetría.
  const patchLoad = async (l, patch, call, okMsg) => {
    if (busyId) return;
    setBusyId(l.id);
    const prev = Object.fromEntries(Object.keys(patch).map(k => [k, l[k]]));
    setLoads(ls => ls.map(x => (x.id === l.id ? { ...x, ...patch } : x)));
    const { error } = await call();
    setBusyId(null);
    setFullOpenId(null);
    if (error) {
      setLoads(ls => ls.map(x => (x.id === l.id ? { ...x, ...prev } : x)));
      fire('No se pudo guardar: ' + (error.message || 'error'), 'error');
      return;
    }
    fire(okMsg, 'success');
    onStatsDirty?.();
  };
  const setState = (l, state) => patchLoad(l, tankStateParams(state),
    () => setMyFuelLoadState({ loadId: l.id, source: l.source, state }),
    state === 'full' ? 'Marcada como tanque lleno' : state === 'reserve' ? 'Marcada: llegaste en reserva'
      : state === 'partial' ? 'Marcada como carga parcial' : 'Sin respuesta: se calcula por el tamaño de la carga');
  const setGap = (l, gap) => patchLoad(l, { gap_before: gap },
    () => setMyFuelLoadGap({ loadId: l.id, source: l.source, gap }),
    gap ? 'Marcada: hubo cargas sin registrar — la medición reinicia aquí' : 'Quitada la marca de cargas sin registrar');

  if (loads === false || !vehicle) return null; // migración pendiente o sin vehículo

  return (
    <div style={{ marginTop: 22 }}>
      {/* El ancla del tutorial (paso "Rendimiento y consumo") cubre SOLO el
          título y los indicadores: el bloque completo (sugerencia, gráficas,
          botones) es más alto que la pantalla y tapaba la tarjeta del paso */}
      <div data-tour="veh-fuel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={lbl}>Rendimiento y consumo</div>
          {/* UX-23 (dueño, 7-nov): la explicación va detrás de un "?" rojo,
              discreto, junto al título — no como enlace entre los bloques */}
          <button onClick={() => setShowHow(h => !h)} aria-expanded={showHow} aria-label="¿Cómo se calcula?" style={{
            width: 18, height: 18, borderRadius: 9, border: `1.5px solid ${bento.red}`, padding: 0, cursor: 'pointer',
            background: showHow ? bento.red : 'transparent', color: showHow ? '#fff' : bento.red,
            fontFamily: "'DM Sans'", fontSize: 11.5, fontWeight: 800, lineHeight: '15px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>?</button>
        </div>
        {showHow && (
          <div style={{ background: cardBg, borderRadius: 15, padding: '12px 14px', marginTop: 8, fontSize: 11.5, color: ink, fontWeight: 600, lineHeight: 1.6 }}>
            <b>Medido de lleno a lleno:</b> entre dos cargas con "Tanque lleno" y km recorridos, dividimos los
            km entre todo el combustible que cargaste en medio. Lo mismo entre dos "Llegué en reserva".<br />
            <b>Cálculo aproximado:</b> si nunca llenas ni llegas a reserva, cada {APPROX_LOADS} cargas con km
            dan un tramo aproximado.<br />
            <b>No contada:</b> una medición muy fuera de lo normal se aparta — casi siempre faltó registrar una carga.<br />
            <b>Lleno deducido:</b> si no respondiste y cargaste casi todo el tanque, lo tomamos como lleno.
          </div>
        )}

        {/* Indicadores del vehículo activo — solo los que tienen dato;
            si quedan impares, el último ocupa el ancho completo */}
        {insights.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            {insights.map((t, i) => (
              <div key={t.k} style={{ background: cardBg, borderRadius: 17, padding: '12px 14px', gridColumn: insights.length % 2 && i === insights.length - 1 ? '1 / -1' : undefined }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: sub }}>{t.label}</div>
                <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 5, color: t.warn ? '#E65100' : ink }}>{t.value}</div>
                <div style={{ fontSize: 11.5, color: t.warn ? '#E65100' : sub, fontWeight: 600, marginTop: 3 }}>{t.note}</div>
              </div>
            ))}
          </div>
        )}

        {/* Sin cargas del vehículo: invitación a empezar a registrar */}
        {noData && <FuelInvite dark={dark} ink={ink} sub={sub} cardBg={cardBg} others={othersN > 0} />}

        {/* Hay cargas pero aún no alcanzan para el rendimiento: qué falta */}
        {kmHint && (
          <div style={{ fontSize: 11.5, color: sub, fontWeight: 600, lineHeight: 1.5, marginTop: 8 }}>{kmHint}.</div>
        )}
      </div>

      {/* Sugerencia para lograr la medición exacta */}
      {nudge && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: dark ? 'rgba(250,84,8,.12)' : 'rgba(250,84,8,.08)', borderRadius: 15, padding: '11px 13px', marginTop: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: BRAND_ORANGE, flexShrink: 0, marginTop: 5 }} />
          <div style={{ fontSize: 11.5, color: ink, fontWeight: 600, lineHeight: 1.5 }}>
            <b>Llena el tanque</b> la próxima vez y marca <b>"Tanque lleno"</b> junto con tus km recorridos
            (o marca <b>"Llegué en reserva"</b> cuando cargues con la aguja en reserva).
            Con dos referencias iguales medimos tu rendimiento exacto; mientras, ves un aproximado
            (cada {APPROX_LOADS} cargas con km forman un tramo).
          </div>
        </div>
      )}

      {/* E3e/E3f: rendimiento por llenado — una medición por ventana de
          lleno a lleno, con el promedio ponderado punteado (≥2 ventanas) */}
      {trendPoints.length >= 2 && (
        <div style={{ background: cardBg, borderRadius: 17, padding: '12px 14px 8px', marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: sub, marginBottom: 6 }}>{method === 'approx' ? 'Rendimiento aproximado por tramo' : 'Rendimiento por llenado'}</div>
          <TrendChart points={trendPoints} avg={summary.kmPerGal}
            dark={dark} ink={ink} sub={sub} surface={dark ? '#2A2A30' : '#F5F5F7'} />
        </div>
      )}

      {/* Consumo por mes (vehículo activo) — 9-nov: carrusel Gasto ·
          Galones · Km recorridos (MonthCharts); con 1 mes, fila simple */}
      <MonthCharts loads={mine} dark={dark} ink={ink} sub={sub} cardBg={cardBg} />

      {/* E3b: registrar consumo MANUAL (carga fuera de Turkaj) */}
      {!reg ? (
        <button data-tour="veh-fuel-log" onClick={() => (offline ? offMsg() : setReg(true))} style={{
          width: '100%', marginTop: 10, padding: 13, borderRadius: 15, cursor: 'pointer',
          border: `1.5px dashed ${dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.18)'}`,
          background: 'transparent', color: ink,
          fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 800,
        }}>+ Registrar consumo</button>
      ) : (
        <FuelLogForm dark={dark} ink={ink} sub={sub} cardBg={cardBg} vehicle={vehicle}
          vehName={vehName(vehicle.id)} lastKm={lastKm} lastAt={lastAt} fire={fire}
          onCancel={() => setReg(false)}
          onSaved={() => { setReg(false); fetchLoads(); onStatsDirty?.(); }} />
      )}

      {/* Historial de cargas del miembro + editor de reasignación.
          E3d: CONTRAÍDO por defecto (pedido del dueño — la vista del
          vehículo se saturaba); el encabezado despliega/contrae */}
      {/* sin cargas ni movimientos en ningún vehículo, el encabezado sobra */}
      {(!Array.isArray(loads) || timeline.length > 0 || othersN > 0) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px' }}>
        <button data-tour="veh-history" onClick={() => setHistOpen(o => !o)} style={{
          border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 7,
        }}>
          <span style={lbl}>Historial del vehículo{timeline.length > 0 ? ` (${timeline.length})` : ''}</span>
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
      )}

      {histOpen && Array.isArray(loads) && loads.length > 0 && !showAll && mine.length === 0 && (
        <div style={{ background: cardBg, borderRadius: 17, padding: '14px', fontSize: 12.5, color: sub, fontWeight: 600, lineHeight: 1.5 }}>
          Este vehículo aún no tiene cargas registradas. Toca <b style={{ color: BRAND_ORANGE }}>Ver todas</b> para revisar el historial general y asignarle alguna.
        </div>
      )}

      {histOpen && loads === null && !loadErr && (
        <div style={{ fontSize: 12, color: sub, fontWeight: 600 }}>Cargando…</div>
      )}
      {loadErr && (
        <div style={{ background: cardBg, borderRadius: 17, padding: '14px', fontSize: 12.5, color: sub, fontWeight: 600, lineHeight: 1.5 }}>
          {loadErr}
          <button onClick={fetchLoads} style={{
            display: 'block', marginTop: 10, padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: BRAND_ORANGE, color: '#fff', fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 800,
          }}>Reintentar</button>
        </div>
      )}

      {histOpen && timeline.map(item => {
        if (item.kind === 'event') {
          const e = item.e; const veh = vehById[e.vehicle_id];
          return <FuelEventRow key={`e-${e.id}`} e={e} dark={dark} ink={ink} sub={sub} cardBg={cardBg}
            name={showAll ? vehName(e.vehicle_id) : null} dot={veh?.color} />;
        }
        const l = item.l;
        const veh = vehById[l.vehicle_id];
        const tank = veh?.tank_gal;
        return (
          <FuelHistoryRow key={l.id} l={l} dark={dark} ink={ink} sub={sub} cardBg={cardBg}
            name={l.vehicle_id ? vehName(l.vehicle_id) : null} dot={veh?.color}
            fuelMismatch={l.source !== 'manual' && !!l.fuel_type && !!veh?.fuel_pref && l.fuel_type !== veh.fuel_pref}
            vehicles={vehicles} vehName={vehName}
            win={winByEnd[l.id]} anchor={anchorIds.has(l.id)}
            isFull={!!l.vehicle_id && isFullLoad(l, tank)} inferred={!!l.vehicle_id && isInferredFull(l, tank)}
            canReassign={!offline && l.source !== 'manual' && canEdit(l)}
            canMarkFull={!offline && (l.source === 'manual' || canEdit(l))}
            editOpen={editingId === l.id} onToggleEdit={() => { setEditingId(editingId === l.id ? null : l.id); setFullOpenId(null); }}
            onReassign={(vid) => reassign(l, vid)} busy={busyId === l.id}
            delArmed={delLogArmed === l.id} onDel={() => (offline ? offMsg() : delLog(l))} onDelCancel={() => setDelLogArmed(null)}
            fullOpen={fullOpenId === l.id} onToggleFullOpen={() => { setFullOpenId(fullOpenId === l.id ? null : l.id); setEditingId(null); }}
            onSetState={(v) => setState(l, v)} onSetGap={(v) => setGap(l, v)} />
        );
      })}

      {histOpen && !offline && Array.isArray(loads) && loads.length > 0 && (
        <div style={{ fontSize: 11.5, color: sub, fontWeight: 600, lineHeight: 1.5, marginTop: 4 }}>
          ¿Una carga quedó en el vehículo equivocado o con el tanque mal marcado? Tócale el
          lápiz o la pastilla del tanque y corrígela (hasta {editableDays} días).
        </div>
      )}
    </div>
  );
}
