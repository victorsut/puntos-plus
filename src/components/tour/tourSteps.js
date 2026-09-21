// src/components/tour/tourSteps.js
// Pasos del tutorial interactivo del cliente. `target` es el valor del
// atributo data-tour del elemento que se resalta (null = tarjeta
// centrada sin foco). Textos cortos a propósito: el dueño pidió "lo
// más básico", no un manual detallado. Todos los pasos viven en la
// pantalla de INICIO (encabezado, tarjeta, cuadros y barra inferior).
export const TOUR_STEPS = [
  {
    id: 'welcome', target: null,
    title: '¡Bienvenido a Puntos Plus!',
    text: 'Te mostramos lo básico en un minuto. Puedes omitirlo y volver a verlo cuando quieras desde Asistencia y ayuda.',
  },
  {
    id: 'pts', target: 'pts-card',
    title: 'Tu nivel y tus puntos',
    text: 'Aquí ves tu nivel, los galones que llevas acumulados y tus puntos. Toca los puntos para ir directo a Canjes.',
  },
  {
    id: 'qr', target: 'nav-qr',
    title: 'Tu código QR',
    text: 'Muéstralo en cada carga de combustible: así se acreditan tus puntos.',
  },
  {
    id: 'cat', target: 'nav-cat',
    title: 'Canjes',
    text: 'Cambia tus puntos por vales de combustible y premios.',
  },
  {
    id: 'raf', target: 'nav-raf',
    title: 'Rifa',
    text: 'Compra boletos con tus puntos y participa en el sorteo del mes.',
  },
  {
    id: 'veh', target: 'nav-veh',
    title: 'Vehículos',
    text: 'Registra tus vehículos y sigue su rendimiento, sus cargas y sus servicios.',
  },
  {
    id: 'promos', target: 'tile-promos',
    title: 'Promociones',
    text: 'Ofertas y puntos extra vigentes. Desliza el cuadro para ver más.',
  },
  {
    id: 'survey', target: 'tile-survey',
    title: 'Encuesta de satisfacción',
    text: 'Responde la encuesta de tu estación y gana puntos.',
  },
  {
    id: 'bell', target: 'header-bell',
    title: 'Notificaciones',
    text: 'Aquí llegan tus avisos: puntos acreditados, premios y recordatorios.',
  },
  {
    id: 'menu', target: 'header-menu',
    title: 'Menú',
    text: 'Tu cuenta, niveles y beneficios, términos y el modo claro u oscuro.',
  },
  {
    id: 'help', target: 'header-help',
    title: 'Asistencia y ayuda',
    text: 'Escríbenos por WhatsApp cuando quieras. Desde aquí también puedes volver a ver este tutorial.',
  },
];
