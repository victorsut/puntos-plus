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
import { fmtN } from './fuelFmt';

const EMPTY = { gal: '', amt: '', km: '', full: null };

export default function FuelLogForm({ dark, ink, sub, cardBg, vehicle, vehName, lastKm, fire, onSaved, onCancel }) {
  const [rg, setRg] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const gal = parseFloat(rg.gal);
    if (!(gal > 0)) { fire('Ingresa los galones cargados', 'warn'); return; }
    const amt = rg.amt === '' ? null : parseFloat(rg.amt);
    const km = rg.km === '' ? null : parseInt(rg.km, 10);
    setSaving(true);
    const { data, error } = await addMyFuelLog({ vehicleId: vehicle.id, gallons: gal, amount: amt, km, fullTank: rg.full });
    setSaving(false);
    if (error || !data?.ok) { fire('No se pudo registrar: ' + (error?.message || 'error'), 'error'); return; }
    setRg(EMPTY);
    fire('Consumo registrado', 'success');
    onSaved?.();
  };

  const kmIn = rg.km === '' ? null : parseInt(rg.km, 10);
  const galIn = rg.gal === '' ? null : parseFloat(rg.gal);
  // E3d: guardas SUAVES de calidad de datos (no bloquean) — un dedazo
  // en los km o los galones envenena la telemetría
  const warns = [];
  if (kmIn != null && lastKm > 0 && kmIn < lastKm) {
    warns.push(`Ojo: los km son menores que los últimos que reportaste (${fmtN(lastKm, 0)} km) — revísalos si es un error.`);
  }
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

      {/* E3f: ¿quedó el tanque lleno? */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: ink, marginRight: 2 }}>¿Llenaste el tanque?</span>
        {[{ v: true, t: 'Sí, quedó lleno' }, { v: false, t: 'No, fue parcial' }].map(o => (
          <button key={String(o.v)} onClick={() => setRg(p => ({ ...p, full: p.full === o.v ? null : o.v }))}
            style={chip(rg.full === o.v)}>{o.t}</button>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: sub, fontWeight: 600, lineHeight: 1.5, marginTop: 8 }}>
        El rendimiento se mide de un tanque lleno al siguiente: las cargas parciales
        se suman a la siguiente vez que llenes. Los km recorridos son los que marca tu tablero.
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
        <button onClick={save} disabled={saving} style={{
          flex: 1.4, padding: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: saving ? (dark ? '#3A3A3A' : '#BDBDBD') : BRAND_ORANGE, color: '#fff',
          fontFamily: "'DM Sans'", fontSize: 12.5, fontWeight: 800,
        }}>{saving ? 'Guardando…' : 'Guardar consumo'}</button>
      </div>
    </div>
  );
}
