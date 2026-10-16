// src/components/ui/CruiserArt.jsx
// F6 TANDA 9 (2-sep-2026) — micro bus / moto taxi / camión ligero.
// Cuerpo recoloreable por bandas PLANAS (regla E1.19: el sombreado ya
// viene codificado en las bandas de la referencia); cada banda extra
// recolorea con shade(color, delta). GENERADO por gen-arts-mix.cjs —
// regenerar con el arnés, no editar a mano. Vectorizada de
// REFERENCIAS INTERFAZ/VEHÍCULOS/MOTOS/MOVESA, CRUSIER.png.
import { shade } from './vehicleArtUtils.js';
import { CRUISER_TRACE as T } from './cruiserTrace.js';

export default function CruiserArt({ uid, color }) {
  return (
    <g>
      <ellipse cx={120} cy={132} rx={100} ry={8} fill="rgba(0,0,0,.20)" />
      <g transform="translate(26.6 10.4) scale(0.1204)">
        <path d={T.deep} fill={"#16191B"} fillRule="evenodd" />
        <path d={T.dark2} fill={"#222426"} fillRule="evenodd" />
        <path d={T.char} fill={"#2E3133"} fillRule="evenodd" />
        <path d={T.mid} fill={"#494C50"} fillRule="evenodd" />
        <path d={T.gray} fill={"#7C7C7C"} fillRule="evenodd" />
        <path d={T.silver} fill={"#B0AFAF"} fillRule="evenodd" />
        <path d={T.light} fill={"#C6C5C5"} fillRule="evenodd" />
        <path d={T.xlight} fill={"#DDDCDC"} fillRule="evenodd" />
        <path d={T.bF} fill={shade(color, -47)} fillRule="evenodd" />
        <path d={T.bE} fill={shade(color, -37)} fillRule="evenodd" />
        <path d={T.blue} fill={color} fillRule="evenodd" />
        <path d={T.bA} fill={shade(color, 36)} fillRule="evenodd" />
        <path d={T.tailred} fill={"#CD1B18"} fillRule="evenodd" />
        <path d={T.amber} fill={"#F78B10"} fillRule="evenodd" />
        <path d={T.bright} fill={"#F5F4F4"} fillRule="evenodd" />
      </g>
    </g>
  );
}
