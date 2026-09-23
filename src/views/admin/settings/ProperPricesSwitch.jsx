// src/views/admin/settings/ProperPricesSwitch.jsx
// 23-sep-2026 — "Adoptar precios de PROPER": bloque dentro de la tarjeta
// Precios de Combustible. PROPER no manda el precio unitario, pero de
// cada factura acreditada por la API el servidor deriva
// fuel_amount / gallons (galones con 5 decimales → precio exacto) y lo
// guarda en fuel_price_observations por estación × combustible. Con el
// interruptor ENCENDIDO, dos facturas seguidas que coinciden al centavo
// actualizan el precio vigente (global o de la estación según el modo
// D4) con auditoría "PROPER (API)". Nace APAGADO (decisión del dueño:
// se enciende al operar con PROPER). Al encenderlo, el servidor adopta
// de inmediato lo que ya esté confirmado y devuelve los precios nuevos.
import { useState, useEffect, useCallback } from 'react';
import { sMono } from '../../../constants/styles';
import { setFuelPricesAuto, listFuelPriceObservations } from '../../../services/adminRpcServices';
// `fuels` llega por prop desde FuelPricesCard (evita el import circular).

const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
};

export default function ProperPricesSwitch({ cfg, setCfg, setStations, loggedAdmin, fire, cardHint, border, fuels = [] }) {
  const FUELS = fuels;
  const [saving, setSaving] = useState(false);
  const [obs, setObs] = useState([]);
  const enabled = !!cfg.fuelPricesAuto;

  const load = useCallback(async () => {
    const { data } = await listFuelPriceObservations();
    setObs(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (saving) return;
    if (!loggedAdmin?.id) { fire('Error: sesion admin no disponible. Cerra sesion y volve a ingresar.', 'error'); return; }
    const next = !enabled;
    setSaving(true);
    const { data, error } = await setFuelPricesAuto(next, {
      adminId: loggedAdmin.id, adminName: loggedAdmin.name, adminEmail: loggedAdmin.email,
    });
    setSaving(false);
    if (error) { fire('Error: ' + error.message, 'error'); return; }
    if (data?.error) { fire(data.error, 'error'); return; }
    // El servidor devuelve los precios resultantes (por si adoptó al encender).
    setCfg(p => ({
      ...p,
      fuelPricesAuto: !!data?.enabled,
      ...(data?.fuel_prices ? { fuelPrices: data.fuel_prices } : {}),
    }));
    if (Array.isArray(data?.stations) && setStations) {
      const byId = Object.fromEntries(data.stations.map(s => [s.id, s.fuel_prices || null]));
      setStations(prev => (prev || []).map(s => (s.id in byId ? { ...s, fuelPrices: byId[s.id] } : s)));
    }
    const n = Array.isArray(data?.adopted) ? data.adopted.length : 0;
    fire(next
      ? (n > 0
        ? `Precios de PROPER activados — se adoptaron ${n} precio${n === 1 ? '' : 's'} ya confirmado${n === 1 ? '' : 's'}`
        : 'Precios de PROPER activados — se actualizarán con las próximas facturas')
      : 'Precios de PROPER apagados — los precios solo cambian a mano', 'success');
    load();
  };

  const fuelName = (k) => FUELS.find(f => f.k === k)?.name || k;
  const fuelColor = (k) => FUELS.find(f => f.k === k)?.color || '#E0E0E0';

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#E0E0E0' }}>Adoptar precios de PROPER</div>
          <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
            {enabled
              ? 'Cada factura acreditada por la API actualiza el precio (tras 2 facturas seguidas iguales)'
              : 'Apagado — el precio de cada factura de PROPER se registra, pero no se aplica'}
          </div>
        </div>
        <button onClick={toggle} disabled={saving} style={{
          padding: '8px 16px', borderRadius: 20, border: 'none', flexShrink: 0,
          background: saving ? '#3A3A3A' : enabled ? 'rgba(46,125,50,.25)' : 'rgba(255,255,255,.08)',
          color: saving ? '#777' : enabled ? '#69F0AE' : '#9E9E9E',
          fontFamily: "'DM Sans'", fontWeight: 800, fontSize: 12,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>
          {saving ? '...' : enabled ? 'ACTIVADO' : 'APAGADO'}
        </button>
      </div>

      {obs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...cardHint, marginBottom: 2 }}>Últimos precios recibidos de PROPER</div>
          {obs.map((o, i) => {
            const confirmed = (o.streak || 0) >= 2;
            const applied = o.adopted_price != null && +o.adopted_price === +o.price;
            return (
              <div key={o.station_id + o.fuel_type} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '6px 0', borderBottom: i < obs.length - 1 ? `1px solid ${border}` : 'none', fontSize: 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: fuelColor(o.fuel_type), fontWeight: 700 }}>{fuelName(o.fuel_type)}</span>
                  <span style={{ color: '#9E9E9E' }}> · {o.station}</span>
                  <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>
                    {fmtWhen(o.seen_at)} · {confirmed ? `confirmado (${o.streak} facturas)` : 'a la espera de una 2ª factura'}
                    {applied ? ' · aplicado' : ''}
                  </div>
                </div>
                <span style={{ color: applied ? '#69F0AE' : '#fff', fontWeight: 800, ...sMono, flexShrink: 0 }}>
                  Q{(+o.price || 0).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ height: 1, background: border, margin: '10px 0 8px' }} />
    </div>
  );
}
