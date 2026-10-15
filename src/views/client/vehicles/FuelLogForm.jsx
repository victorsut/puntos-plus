// src/views/client/vehicles/FuelLogForm.jsx
// F6 E3b/E3f — registro MANUAL de consumo (cargas fuera de Turkaj),
// extraído de VehicleFuel.jsx el 21-sep-2026 (regla de 500 líneas).
// Campos: galones, precio, KILÓMETROS RECORRIDOS (vocabulario del
// dueño: no "odómetro") y la pregunta ¿llenaste el tanque? — ancla del
// rendimiento de lleno a lleno (una carga parcial se suma a la
// siguiente ventana, nunca se mide sola).
import { useState } from 'react';
import { BRAND_ORANGE } from '../../../constants/styles';
import { addMyFuelLog } from '../../../services/vehicleService';
import { kmReadingProblem, TANK_STATES } from '../../../lib/fuelEconomy';
import { fmtN } from './fuelFmt';

const EMPTY = { gal: '', amt: '', km: '', state: null, gap: false };

// lastKm / lastAt: última lectura de km conocida del vehículo y su fecha
// (E3h: una lectura menor o disparada se BLOQUEA; el servidor la
// rechaza igual en assert_vehicle_km).
export default function FuelLogForm({ dark, ink, sub, cardBg, vehicle, vehName, lastKm, lastAt = null, fire, onSaved, onCancel }) {
  const [rg, setRg] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const kmIn = rg.km === '' ? null : parseInt(rg.km, 10);
  const galIn = rg.gal === '' ? null : parseFloat(rg.gal);
  const kmErr = kmReadingProblem(kmIn, lastKm, lastAt);

  const save = async () => {
    if (saving) return;
    const gal = parseFloat(rg.gal);
    if (!(gal > 0)) { fire('Ingresa los galones cargados', 'warn'); return; }
    if (kmErr) { fire(kmErr, 'warn'); return; }
    const amt = rg.amt === '' ? null : parseFloat(rg.amt);
    const km = rg.km === '' ? null : parseInt(rg.km, 10);
    setSaving(true);
    const { data, error } = await addMyFuelLog({ vehicleId: vehicle.id, gallons: gal, amount: amt, km, tankState: rg.state, gapBefore: rg.gap || null });
    setSaving(false);
    if (error || !data?.ok) { fire('No se pudo registrar: ' + (error?.message || 'error'), 'error'); return; }
    setRg(EMPTY);
    fire('Consumo registrado', 'success');
    onSaved?.();
  };

  // E3h: los km se BLOQUEAN (kmErr, arriba); los galones siguen como
  // guarda SUAVE — un tanque mal capturado en la ficha no debe impedir
  // registrar una carga real
  const warns = [];
  if (kmErr) warns.push(kmErr);
  if (galIn != null && vehicle.tank_gal > 0 && galIn > vehicle.tank_gal) {
    warns.push(`Ojo: los galones superan la capacidad de tu tanque (${fmtN(vehicle.tank_gal)} gal).`);
  }

  const chip = (on) => ({
    padding: '8px 11px', borderRadius: 11, cursor: 'pointer', whiteSpace: 'nowrap',
    border: on ? `1.5px solid ${BRAND_ORANGE}` : `1.5px solid ${dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.12)'}`,
    background: on ? (dark ? 'rgba(221,29,33,.16)' : '#FDECEA') : 'transparent',
    color: on ? (dark ? '#FF8A80' : '#C62828') : ink,
    fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 800,
  });

  return (
    <div style={{ background: cardBg, borderRadius: 17, padding: '13px 14px', marginTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: sub }}>
        Registrar consumo · {vehName}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {[
          { k: 'gal', label: 'Galones', ph: '8.5', mode: 'decimal' },
          { k: 'amt', label: 'Precio (Q)', ph: '320', mode: 'decimal' },
          { k: 'km', label: 'Km recorridos', ph: '45900', mode: 'numeric' },
        ].map(f => (
          <div key={f.k} style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginBottom: 4 }}>{f.label}</div>
            <input value={rg[f.k]} inputMode={f.mode} placeholder={f.ph}
              onChange={e => {
                // decimal: dígitos + UN punto (galones 8.5, precio 319.90)
                let v = e.target.value.replace(f.mode === 'numeric' ? /[^0-9]/g : /[^0-9.]/g, '');
                if (f.mode !== 'numeric') {
                  const i = v.indexOf('.');
                  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
                }
                v = v.slice(0, f.mode === 'numeric' ? 7 : 8);
                setRg(prev => ({ ...prev, [f.k]: v }));
              }}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 10px', borderRadius: 12,
                border: 'none', background: dark ? 'rgba(255,255,255,.1)' : '#fff', color: ink,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, outline: 'none',
              }} />
          </div>
        ))}
      </div>

      {/* E3h: UNA pregunta, tres respuestas (dueño, 15-oct): lleno = nivel
          conocido después de cargar; reserva = nivel conocido antes de
          cargar (segunda referencia); parcial = ninguna de las dos */}
      <div style={{ fontSize: 10, fontWeight: 700, color: sub, marginTop: 12, marginBottom: 4 }}>¿Cómo fue la carga?</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {TANK_STATES.map(o => (
          <button key={o.v} onClick={() => setRg(p => ({ ...p, state: p.state === o.v ? null : o.v }))}
            style={{ ...chip(rg.state === o.v), padding: '10px 4px', whiteSpace: 'normal', lineHeight: 1.2, fontSize: 11.5 }}>{o.t}</button>
        ))}
      </div>
      {/* Carga sin registrar antes: reinicia la medición (no es otra
          pregunta — es una marca opcional de bajo peso visual) */}
      <button onClick={() => setRg(p => ({ ...p, gap: !p.gap }))} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: 0,
        border: 'none', background: 'transparent', cursor: 'pointer',
        fontFamily: "'DM Sans'", fontSize: 10.5, fontWeight: 700, color: rg.gap ? BRAND_ORANGE : sub,
      }}>
        <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${rg.gap ? BRAND_ORANGE : sub}`, background: rg.gap ? BRAND_ORANGE : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9 }}>{rg.gap ? '✓' : ''}</span>
        Cargué en otro lado y no lo registré
      </button>
      <div style={{ fontSize: 10.5, color: sub, fontWeight: 600, lineHeight: 1.5, marginTop: 8 }}>
        Medimos de un tanque lleno al siguiente (o de una reserva a la siguiente): las cargas
        parciales se suman a la siguiente referencia. Si llegaste en reserva <b>y</b> lo llenaste,
        marca "Tanque lleno". Los km recorridos son los que marca tu tablero.
      </div>
      {warns.map(w => (
        <div key={w} style={{ fontSize: 10.5, color: '#E65100', fontWeight: 700, lineHeight: 1.5, marginTop: 6 }}>{w}</div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => { setRg(EMPTY); onCancel?.(); }} disabled={saving} style={{
          flex: 1, padding: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: dark ? 'rgba(255,255,255,.1)' : '#fff', color: ink,
          fontFamily: "'DM Sans'", fontSize: 12.5, fontWeight: 700,
        }}>Cancelar</button>
        <button onClick={save} disabled={saving || !!kmErr} style={{
          flex: 1.4, padding: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: saving || kmErr ? (dark ? '#3A3A3A' : '#BDBDBD') : BRAND_ORANGE, color: '#fff',
          fontFamily: "'DM Sans'", fontSize: 12.5, fontWeight: 800,
        }}>{saving ? 'Guardando…' : 'Guardar consumo'}</button>
      </div>
    </div>
  );
}
