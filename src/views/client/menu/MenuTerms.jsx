// src/views/client/menu/MenuTerms.jsx
// Términos y Condiciones (FORMATO GENERAL): numeración en naranja de
// marca, texto plano sin emojis. Los textos legales son los aprobados
// en R1a — no editarlos sin pedirlo el dueño. 19-sep-2026 (pedido del
// dueño, recalibración C8): acumulación POR GALÓN, sin descuento de
// canje por nivel y premios disponibles desde un nivel. Las tasas NO se
// escriben acá (son editables en el admin): el texto remite a la app.
// 10-nov-2026 (pedido del dueño, revisión legal docs/ANALISIS-LEGAL.html):
// mayoría de edad, rifa con bases, aviso previo de 15 días, PROPER como
// encargado, Google/Apple no patrocinan, encuestas y calificaciones.
import { BRAND_ORANGE } from '../../../constants/styles';
import { SectionHeader } from './menuUi';

import { TERMS_UPDATED } from '../../../constants/config';
// Exportados (11-ago): el visor de términos del REGISTRO (TermsSheet)
// usa estos mismos textos — una sola fuente, sin copias.
export const TERMS_SECS = [
  {
    title: 'OBJETO',
    body: 'Los presentes Términos y Condiciones regulan el uso del programa de fidelización Puntos Plus ("el Programa"), disponible a través de su aplicación web progresiva oficial, y la relación entre el operador del Programa y el usuario. Puntos Plus es una plataforma de fidelización independiente en la que Gasolineras Turkaj I, II y III de Chichicastenango participan como comercio afiliado. Al acceder y utilizar el Programa, el usuario acepta expresamente haber leído, comprendido y adherirse a los presentes términos, así como a las leyes vigentes de la República de Guatemala.',
  },
  {
    title: 'DESCRIPCIÓN DEL PROGRAMA',
    body: 'Puntos Plus es un programa de lealtad que permite a los clientes de las estaciones afiliadas (Gasolineras Turkaj I, II y III en Chichicastenango, Guatemala) acumular puntos por compras de combustible y canjearlos por premios, descuentos y beneficios exclusivos. La participación en el Programa es voluntaria y gratuita.',
  },
  {
    title: 'INDEPENDENCIA DE MARCA',
    body: 'Puntos Plus es una aplicación y plataforma ajena a Shell Guatemala. El Programa no es operado, patrocinado ni avalado por Shell Guatemala ni por sus franquiciantes, y aplica únicamente en las gasolineras Turkaj de Chichicastenango. Google y Apple tampoco patrocinan ni participan en el Programa, sus promociones o sus rifas. Las marcas de terceros visibles en las estaciones pertenecen a sus respectivos titulares.',
  },
  {
    title: 'REGISTRO Y MEMBRESÍA',
    body: 'El Programa está dirigido a personas mayores de 18 años. Para participar, el usuario debe registrarse proporcionando su nombre completo, Documento Personal de Identificación (DPI), número de teléfono y fecha de nacimiento. El usuario garantiza que la información proporcionada es verídica y exacta. Cada persona física puede tener una única cuenta activa. El Programa se reserva el derecho de suspender cuentas con información incorrecta, duplicadas o de menores de edad.',
  },
  {
    title: 'ACUMULACIÓN DE PUNTOS',
    body: 'Los puntos se acumulan por cada galón de combustible comprado en las estaciones afiliadas Turkaj I, II y III, según la tasa de puntos por galón vigente para el nivel del miembro (ORO, PLATINO o BLACK), publicada en la sección Niveles de la aplicación. El resultado de cada compra se redondea al punto entero más cercano y no depende del precio del combustible. Los puntos se asignan al momento de registrar la compra mediante el código QR personal del miembro; una compra que no se registre en ese momento no acumula puntos. El Programa puede otorgar puntos adicionales en eventos especiales, días festivos o aniversarios, según lo determine en cada momento y de forma diferenciada por nivel. Los puntos no tienen valor monetario y no son transferibles entre miembros.',
  },
  {
    title: 'NIVELES DE MEMBRESÍA',
    body: 'El Programa cuenta con tres niveles basados en el consumo acumulado de galones: ORO (0 a 149 galones), PLATINO (150 a 499 galones) y BLACK (500 galones o más). Cada nivel otorga beneficios diferenciados, incluyendo una mayor tasa de puntos por galón y el acceso a premios disponibles únicamente a partir de ciertos niveles. El nivel se calcula automáticamente con base en el historial de compras registradas en el Programa.',
  },
  {
    title: 'CANJE DE PUNTOS',
    body: 'Los puntos acumulados pueden canjearse por premios del catálogo disponible en la aplicación, sujetos a disponibilidad. El canje requiere la confirmación del miembro a través de la aplicación y la presencia física del miembro en la estación al momento de recibir el premio. Los premios canjeados no son reembolsables ni transferibles. El costo en puntos de cada premio es el mismo para todos los niveles; algunos premios están disponibles únicamente a partir de los niveles PLATINO o BLACK. El Programa puede actualizar el catálogo y el costo en puntos de los premios; los canjes ya realizados no se ven afectados.',
  },
  {
    title: 'RIFA MENSUAL',
    body: 'Cuando esté disponible, el Programa realiza una rifa mensual entre los miembros participantes. El premio, su valor, el costo de cada boleto en puntos y la fecha del sorteo se publican en la sección Rifa de la aplicación antes de que inicie la venta de boletos. Los boletos se obtienen con puntos o de forma gratuita en los casos que el Programa indique en la aplicación (por ejemplo, al completar las encuestas del día). La participación es voluntaria y cada boleto da una oportunidad de ganar. El ganador se elige al azar entre todos los boletos del mes, después de su cierre, y se le notifica en la aplicación. El premio se entrega en una de las estaciones afiliadas, presentando el código de canje, dentro del plazo indicado en la aplicación; no es canjeable por dinero ni transferible, y su entrega queda sujeta a los impuestos y requisitos que establezca la ley guatemalteca. Los puntos utilizados en la compra de boletos no son reembolsables.',
  },
  {
    title: 'ENCUESTAS Y CALIFICACIONES',
    body: 'El Programa puede invitar al miembro a calificar la atención recibida en cada compra y a completar encuestas de satisfacción, con los beneficios que se indiquen en la aplicación. Las calificaciones y encuestas son voluntarias y se usan para mejorar el servicio de las estaciones afiliadas. El límite diario de encuestas con beneficio se indica en la aplicación.',
  },
  {
    title: 'INACTIVIDAD Y DEGRADACIÓN',
    body: 'El Programa monitorea la actividad de los miembros. La inactividad prolongada puede resultar en la degradación del nivel del miembro o la pérdida de puntos acumulados, según las reglas de inactividad vigentes disponibles en la sección correspondiente de la aplicación. La aplicación avisa al miembro antes de que su nivel baje o de que pierda puntos por inactividad. La activación de estas reglas y cualquier cambio en ellas se anunciarán en la aplicación con al menos 15 días de anticipación.',
  },
  {
    title: 'PRIVACIDAD Y PROTECCIÓN DE DATOS',
    body: 'Puntos Plus recopila y procesa los datos personales del usuario con el único fin de operar el Programa de fidelización. Los datos no serán vendidos. Solo se comparten con las estaciones afiliadas y con los proveedores necesarios para operar el Programa (como el sistema de facturación PROPER de las estaciones y los servicios de alojamiento y base de datos), o cuando lo exija la ley. El detalle de los datos que se recopilan y de su uso está en la Política de Privacidad publicada en puntosplus.vercel.app/privacidad.html. El usuario puede corregir sus datos y eliminar su cuenta en cualquier momento desde la aplicación (Menú → Mi Cuenta) o a través de los canales de contacto del Programa.',
  },
  {
    title: 'MODIFICACIONES AL PROGRAMA',
    body: 'El Programa puede modificar, suspender o cancelar sus beneficios, reglas o catálogo de premios. Los cambios que reduzcan los beneficios del miembro, o la suspensión o cancelación del Programa, se anunciarán en la aplicación con al menos 15 días de anticipación. Las promociones temporales y la disponibilidad de premios pueden cambiar sin ese plazo. Los canjes ya realizados no se ven afectados. El uso continuado del Programa después de que un cambio entre en vigor implica su aceptación; si el miembro no está de acuerdo, puede dejar de usar el Programa y eliminar su cuenta.',
  },
  {
    title: 'PROPIEDAD INTELECTUAL',
    body: 'La aplicación Puntos Plus, su diseño, marca, logotipos, contenidos y código fuente son propiedad exclusiva de la plataforma Puntos Plus. Las marcas y nombres comerciales de las estaciones afiliadas (Gasolineras Turkaj) y de terceros pertenecen a sus respectivos titulares. Las marcas y modelos de vehículos disponibles en la aplicación se mencionan únicamente para que el usuario identifique su propio vehículo; su uso no implica afiliación, patrocinio ni aval de los fabricantes. Las ilustraciones de vehículos son representaciones genéricas propias del Programa, sin logotipos ni emblemas de terceros. El usuario no podrá reproducir, copiar, distribuir ni modificar ningún elemento de la aplicación sin autorización expresa y por escrito.',
  },
  {
    title: 'LIMITACIÓN DE RESPONSABILIDAD',
    body: 'El Programa no será responsable por fallas técnicas de la aplicación, interrupciones del servicio, pérdida de datos por causas de fuerza mayor o cualquier perjuicio indirecto derivado del uso del Programa. La responsabilidad máxima del Programa frente al usuario se limita al valor en puntos de los beneficios directamente afectados.',
  },
  {
    title: 'JURISDICCIÓN',
    body: 'Los presentes Términos y Condiciones se rigen por las leyes de la República de Guatemala. Cualquier controversia derivada de su interpretación o cumplimiento será sometida a los tribunales competentes del municipio de Chichicastenango, Quiché, Guatemala, renunciando las partes a cualquier otro fuero que pudiere corresponderles.',
  },
  {
    title: 'CONTACTO',
    body: 'Para consultas, reclamos o solicitudes relacionadas con el Programa, el usuario puede comunicarse en cualquiera de las tres estaciones afiliadas ubicadas en Chichicastenango, Guatemala, o a través de los canales de contacto habilitados en la aplicación.',
  },
];

export default function MenuTerms({ TH, onBack }) {
  return (
    <>
      <SectionHeader title="Términos y Condiciones" sub="Aplica en Gasolineras Turkaj, Chichicastenango" onBack={onBack} TH={TH} />
      {TERMS_SECS.map((s, i) => (
        <div key={i} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: BRAND_ORANGE, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            {String(i + 1).padStart(2, '0')}. {s.title}
          </div>
          <div style={{ fontSize: 13, color: TH.text, lineHeight: 1.7 }}>
            {s.body}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 24, padding: '14px 16px', borderRadius: 16, background: TH.surface }}>
        <div style={{ fontSize: 11, color: TH.sub, textAlign: 'center', lineHeight: 1.6 }}>
          Al utilizar Puntos Plus aceptas estos términos y condiciones.<br />
          Última actualización: {TERMS_UPDATED}
        </div>
      </div>
    </>
  );
}
