// src/views/client/RaffleSoon.jsx
// Placeholder PRÓXIMAMENTE de la pestaña Rifa (beta controlada,
// 16-oct-2026). Icono del boleto sobre el rojo de la rifa (mismo de la
// hoja de confirmación de compra).
import ComingSoon from './ComingSoon';
import { bento } from '../../constants/styles';
import { TicketStarIcon } from '../../components/ui/BentoIcons';

export default function RaffleSoon({ dark }) {
  return (
    <ComingSoon
      dark={dark} color={bento.red} icon={<TicketStarIcon size={52} />}
      title="Rifa mensual"
      text="Muy pronto podrás cambiar tus puntos por boletos y participar cada mes por premios."
    />
  );
}
