// src/components/tour/tourSteps.js
// Pasos del tutorial interactivo del cliente (21-sep-2026; ampliado el
// mismo día a ~30 pasos a pedido del dueño: "un poco más extenso,
// explicando las opciones de cada pestaña").
//   target  → valor del atributo data-tour del elemento a resaltar
//             (null = tarjeta centrada sin foco)
//   screen  → pestaña donde vive el elemento (cScr): 'home' (por
//             defecto), 'cat', 'raf', 'veh', 'menu'. El motor la abre
//             antes de medir.
//   section → etiqueta corta que precede a "Paso N de M".
// Si el elemento no existe en esa cuenta (sin vehículos, sin premios,
// mes pasado en la rifa…) el motor salta el paso solo.
const S = (id, target, title, text, screen = 'home', section = 'Inicio') => ({ id, target, title, text, screen, section });

export const TOUR_STEPS = [
  // ── Inicio ──
  S('welcome', null, '¡Bienvenido a Puntos Plus!',
    'Te mostramos cómo funciona la app en unos dos minutos. Puedes omitirlo y volver a verlo cuando quieras desde Asistencia y ayuda.'),
  S('pts', 'pts-card', 'Tu nivel y tus puntos',
    'Tu nivel (ORO, PLATINO o BLACK), los galones que llevas para subir y tus puntos disponibles. Toca la tarjeta para ver los beneficios de cada nivel; toca los puntos para ir a Canjes.'),
  S('promos', 'tile-promos', 'Promociones',
    'Ofertas y puntos extra vigentes en las estaciones. Desliza el cuadro para pasar de una a otra y tócalo para ver todas.'),
  S('vehicle', 'tile-vehicle', 'Vehículo',
    'Tu vehículo principal con su ilustración. Desde aquí entras a Vehículos, donde llevas el control de cargas, rendimiento y servicios.'),
  S('wifi', 'tile-wifi', 'WiFi en las estaciones',
    'Internet gratis mientras cargas, desde nivel PLATINO. Al tocarlo ves la red y la clave de la estación más cercana.'),
  S('survey', 'tile-survey', 'Encuesta de satisfacción',
    'Responde la encuesta de la estación que visitaste y gana puntos. Hay un límite diario y la quinta te regala un boleto de rifa.'),
  S('location', 'tile-location', 'Ubicación',
    'Mapa con las estaciones Turkaj, su dirección y su horario.'),
  S('redeems', 'tile-redeems', 'Historial de canjes',
    'Tus premios canjeados. Los que aún no has recogido muestran un código QR: enséñalo en la estación para que te lo entreguen.'),
  S('purchases', 'tile-purchases', 'Historial de compras',
    'Todas tus cargas y cada movimiento de puntos, con filtros por tipo y por fecha.'),
  S('bell', 'header-bell', 'Notificaciones',
    'Aquí llegan tus avisos: puntos acreditados, premios listos, recordatorios de servicio y novedades.'),
  S('menu', 'header-menu', 'Menú',
    'Tu cuenta, los niveles y beneficios, las reglas y el modo claro u oscuro. Lo vemos al final.'),

  // ── Barra inferior ──
  S('qr', 'nav-qr', 'Tu código QR',
    'El botón más importante: muéstralo en cada carga de combustible para que se acrediten tus puntos.', 'home', 'Barra inferior'),
  S('nav-cat', 'nav-cat', 'Pestaña Canjes',
    'Aquí cambias tus puntos por premios. Entremos a verla.', 'home', 'Barra inferior'),

  // ── Canjes ──
  S('cat-points', 'cat-points', 'Tu saldo disponible',
    'Los puntos que puedes usar ahora mismo. Cada premio muestra cuántos cuesta.', 'cat', 'Canjes'),
  S('cat-chips', 'cat-chips', 'Categorías',
    'Filtra el catálogo: vales de combustible, servicios, tienda y más.', 'cat', 'Canjes'),
  S('cat-reward', 'cat-reward', 'Canjear un premio',
    'Toca un premio para canjearlo. Los de niveles superiores aparecen al final, bloqueados, hasta que subas de nivel.', 'cat', 'Canjes'),
  S('cat-pending', 'cat-pending', 'Canjes pendientes',
    'Los premios que canjeaste y aún no recoges, con su código para reclamarlos en la estación.', 'cat', 'Canjes'),

  // ── Rifa ──
  S('raf-prize', 'raf-prize', 'El premio del mes',
    'Cada mes se sortea un premio entre los boletos comprados. Aquí ves cuál es y cuántos boletos tienes.', 'raf', 'Rifa'),
  S('raf-buy', 'raf-buy', 'Comprar boletos',
    'Cada boleto cuesta unos pocos puntos y es una oportunidad más. Elige la cantidad y confirma.', 'raf', 'Rifa'),
  S('raf-header', 'raf-header', 'Meses anteriores',
    'Con las flechas cambias de mes para ver premios pasados y quién ganó.', 'raf', 'Rifa'),

  // ── Vehículos ──
  S('veh-empty', 'veh-empty-cta', 'Agrega tu primer vehículo',
    'Registra tu vehículo para llevar el control de sus cargas, su rendimiento y sus servicios.', 'veh', 'Vehículos'),
  S('veh-carousel', 'veh-carousel', 'Tus vehículos',
    'Tu vehículo con su ilustración. Si tienes varios, desliza para cambiar. El botón + agrega otro.', 'veh', 'Vehículos'),
  S('veh-service', 'veh-service', 'Próximo servicio',
    'Programa el servicio por fecha o por kilómetros y te avisamos con tiempo. Cuando lo hagas, confírmalo aquí.', 'veh', 'Vehículos'),
  S('veh-settings', 'veh-settings', 'Datos y ajustes',
    'Kilómetros recorridos, aceite, capacidad del tanque, combustible habitual y recordatorios.', 'veh', 'Vehículos'),
  S('veh-fuel', 'veh-fuel', 'Rendimiento y consumo',
    'Cuánto rinde tu vehículo (km por galón), cuánto te cuesta cada kilómetro y su consumo por mes. Se mide de un tanque lleno al siguiente: al calificar una carga, indica tus km y si llenaste el tanque.', 'veh', 'Vehículos'),
  S('veh-fuel-log', 'veh-fuel-log', 'Registrar consumo',
    'Si cargas fuera de Turkaj, anótalo aquí para que tu rendimiento siga completo.', 'veh', 'Vehículos'),
  S('veh-history', 'veh-history', 'Historial del vehículo',
    'Todas las cargas y los movimientos del vehículo: servicios realizados, cambios de datos y más.', 'veh', 'Vehículos'),

  // ── Menú ──
  S('menu-cuenta', 'menu-cuenta', 'Mi cuenta',
    'Tu nombre, teléfono, NIT para tus facturas, foto y contraseña.', 'menu', 'Menú'),
  S('menu-niveles', 'menu-niveles', 'Niveles y beneficios',
    'Qué gana cada nivel, cuántos galones necesitas para subir y cómo mantenerte activo.', 'menu', 'Menú'),
  S('menu-ayuda', 'menu-ayuda', 'Asistencia y ayuda',
    'Escríbenos por WhatsApp o llámanos. Desde aquí también puedes volver a ver este tutorial.', 'menu', 'Menú'),

  // ── Cierre ──
  S('done', null, '¡Eso es todo!',
    'Ya conoces lo esencial de Puntos Plus. Carga, muestra tu QR y disfruta tus premios. Este recorrido queda disponible en Asistencia y ayuda.'),
];
