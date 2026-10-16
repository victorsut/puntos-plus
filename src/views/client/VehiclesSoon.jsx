// src/views/client/VehiclesSoon.jsx
// Placeholder PRÓXIMAMENTE de la pestaña Vehículos (beta controlada,
// 16-oct-2026 — vuelve el de F6 E1 sobre el ComingSoon genérico). Lista
// los vehículos ya registrados del socio (espejo members.vehicles del
// wizard), como antes del rollout.
import ComingSoon from './ComingSoon';
import { homeColors } from '../../constants/styles';
import { CarIcon } from '../../components/ui/BentoIcons';
import { VEHICLE_TYPES } from '../../components/ui/VehicleIcons';
import { plateMask } from '../../lib/inputMasks';

export default function VehiclesSoon({ cTier, me, dark }) {
  const header = dark ? '#fff' : '#0D0D0D';
  const sub = dark ? 'rgba(255,255,255,.5)' : '#9E9E9E';
  const vehicles = Array.isArray(me?.vehicles) ? me.vehicles : [];
  const typeInfo = k => VEHICLE_TYPES.find(t => t.k === k) || VEHICLE_TYPES[0];
  // Placas antiguas pueden traer separadores propios — solo se formatea
  // la que encaja completa en el patrón L 123 ABC
  const fmtPlate = p => {
    const raw = plateMask.clean(p || '');
    return raw.length === 7 ? plateMask.format(raw) : (p || '');
  };

  return (
    <ComingSoon
      dark={dark} color={homeColors(cTier?.name).vehicle} icon={<CarIcon size={52} />}
      title="Tus vehículos, con superpoderes"
      text="Estamos construyendo la gestión de tus vehículos: servicios, kilometraje y alertas de mantenimiento."
    >
      {vehicles.length > 0 && (
        <div style={{ width: '100%', maxWidth: 340, marginTop: 26, textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: sub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Registrados ({vehicles.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vehicles.map((v, i) => {
              const t = typeInfo(v.type);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: dark ? 'rgba(255,255,255,.08)' : '#F5F5F7', borderRadius: 16, padding: '12px 14px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: dark ? 'rgba(255,255,255,.12)' : '#0D0D0D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <t.Icon size={22} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: header }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: sub, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{fmtPlate(v.plate)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ComingSoon>
  );
}
