// Arnés de verificación visual de la BETA de secciones (16-oct-2026):
// placeholders PRÓXIMAMENTE de Vehículos (con y sin vehículos
// registrados) y Rifa, y el cuadro VEHÍCULO del inicio bloqueado, en
// los 3 niveles y ambos modos.
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import VehiclesSoon from '../../src/views/client/VehiclesSoon';
import RaffleSoon from '../../src/views/client/RaffleSoon';
import VehicleBentoTile from '../../src/views/client/home/VehicleBentoTile';
import { homeTileColors, clientMainBg } from '../../src/constants/styles';

const Panel = ({ tier, dark, children, label }) => (
  <div style={{ width: 390, background: clientMainBg(tier, dark), color: dark ? '#fff' : '#000', flexShrink: 0 }}>
    <div style={{ fontSize: 11, fontWeight: 800, padding: '8px 12px 0', opacity: .7 }}>{label}</div>
    {children}
  </div>
);

const cTier = (name) => ({ name });
const meWith = { id: 'x', vehicles: [{ type: 'moto', plate: 'M673JSH' }, { type: 'picop', plate: 'P123ABC' }] };
const meNone = { id: 'y', vehicles: [] };

createRoot(document.getElementById('root')).render(
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, background: '#333', padding: 8 }}>
    <Panel tier="ORO" dark={false} label="ORO claro · Vehículos con registrados">
      <VehiclesSoon cTier={cTier('ORO')} me={meWith} dark={false} />
    </Panel>
    <Panel tier="PLATINO" dark={true} label="PLATINO oscuro · Vehículos sin registrados">
      <VehiclesSoon cTier={cTier('PLATINO')} me={meNone} dark={true} />
    </Panel>
    <Panel tier="ORO" dark={false} label="ORO claro · Rifa">
      <RaffleSoon dark={false} />
    </Panel>
    <Panel tier="BLACK" dark={true} label="BLACK · Rifa">
      <RaffleSoon dark={true} />
    </Panel>
    <Panel tier="ORO" dark={false} label="Cuadro Vehículo bloqueado / habilitado sin vehículos / cargando">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, padding: 12 }}>
        <VehicleBentoTile me={meNone} htp={homeTileColors('ORO', false)} onOpen={() => {}} enabled={false} />
        <VehicleBentoTile me={meNone} htp={homeTileColors('PLATINO', false)} onOpen={() => {}} enabled={true} />
        <VehicleBentoTile me={meNone} htp={homeTileColors('BLACK', true)} onOpen={() => {}} enabled={false} />
        <VehicleBentoTile me={meNone} htp={homeTileColors('BLACK', false)} onOpen={() => {}} enabled={null} />
      </div>
    </Panel>
  </div>
);
// Uso: npx vite --config tools/harness/vite.harness.config.js
//      msedge --headless=new --screenshot=soon.png --window-size=1620,1400 --virtual-time-budget=15000 http://localhost:3100/tools/harness/soon.html
