// src/components/ui/FantasticArt.jsx
// F6 TANDA 9 (2-sep-2026) — micro bus / moto taxi / camión ligero.
// Cuerpo recoloreable por bandas PLANAS (regla E1.19: el sombreado ya
// viene codificado en las bandas de la referencia); cada banda extra
// recolorea con shade(color, delta). GENERADO por gen-arts-mix.cjs —
// regenerar con el arnés, no editar a mano. Vectorizada de
// REFERENCIAS INTERFAZ/VEHÍCULOS/MOTOS/OSBORNE, FANTASTIC.png.
import { shade } from './vehicleArtUtils.js';
import { FANTASTIC_TRACE as T } from './fantasticTrace.js';

export default function FantasticArt({ uid, color }) {
  return (
    <g>
      <ellipse cx={120} cy={132} rx={100} ry={8} fill="rgba(0,0,0,.20)" />
      <g transform="translate(27 8.8) scale(0.121)">
        <path d={T.deep} fill={"#131415"} fillRule="evenodd" />
        <path d={T.dark2} fill={"#222224"} fillRule="evenodd" />
        <path d={T.char} fill={"#2B2B2D"} fillRule="evenodd" />
        <path d={T.mid} fill={"#424244"} fillRule="evenodd" />
        <path d={T.gray} fill={"#8C8B8D"} fillRule="evenodd" />
        <path d={T.silver} fill={"#B4B3B5"} fillRule="evenodd" />
        <path d={T.light} fill={"#D2D2D4"} fillRule="evenodd" />
        <path d={T.xlight} fill={"#E5E5E7"} fillRule="evenodd" />
        <path d={T.bE} fill={shade(color, -38)} fillRule="evenodd" />
        <path d={T.bD} fill={shade(color, -20)} fillRule="evenodd" />
        <path d={T.blue} fill={color} fillRule="evenodd" />
        <path d={T.bA} fill={shade(color, 4)} fillRule="evenodd" />
        <path d={T.tailred} fill={"#CD1714"} fillRule="evenodd" />
        <path d={T.lens} fill={"#F4DCAC"} fillRule="evenodd" />
        <path d={T.bright} fill={"#FAFAFA"} fillRule="evenodd" />
      </g>
    </g>
  );
}
