/**
 * Tour.js — Guía de cada página del portal
 * =============================================================================
 * PROPOSITO:
 *   Explicar cada pagina del portal (administrador, empresa y medico) CUANDO LA
 *   PERSONA LO PIDE con el boton «Guía» de la barra superior (o la tecla ?).
 *   Ya NO se abre sola al entrar: el boton solo enciende un punto azul que late
 *   cuando esa pagina tiene una guia que la persona todavia no ha visto.
 *
 * COMO SE VE:
 *   1) Tarjeta de introduccion centrada: «Qué es esta página», «Para qué sirve»
 *      y «Cómo se usa», con la linea «N secciones · 1 minuto».
 *   2) «Ver sección por sección»: la pantalla se oscurece y un hueco resalta
 *      cada zona; el hueco se desliza de una seccion a la siguiente y la tarjeta
 *      lo acompana. Puntos clicables + barra de avance + «X / N».
 *   3) El ultimo paso resalta el propio boton «Guía».
 *   En el celular (<= 640 px) la tarjeta es una hoja inferior que no tapa la zona.
 *   Con «reducir movimiento» todo es directo (sin deslizamientos ni fundidos).
 *
 * TECLADO: flechas (anterior/siguiente), Enter (siguiente), Inicio/Fin, Escape
 *   (cerrar). El foco queda atrapado en la tarjeta y al cerrar vuelve al boton.
 *
 * FORMATO DE TOURS (clave = patron de ruta del router, ej. '#/admin/requests/:id'):
 *   {
 *     version: 2,                  // subirla hace que el punto azul vuelva a salir
 *     title: 'Operaciones',        // nombre de la pagina en la intro
 *     intro: { que, para, como },  // textos de la tarjeta de introduccion
 *     steps: [ paso, ... ],
 *   }
 *   Tambien se acepta el formato viejo (un arreglo de pasos, sin intro).
 *
 * UN PASO: { sel | panel | find, title, text, mobile?, variants?, optional? }
 *   - sel: selector CSS; con varios separados por coma gana el primero visible.
 *   - panel: texto del encabezado de la zona (sin importar tildes ni mayusculas;
 *     gana el encabezado VISIBLE exacto, luego el que empieza asi, luego el que
 *     lo contiene). Se resalta su .panel (o la seccion que lo contiene).
 *   - find: funcion que devuelve el elemento (casos especiales).
 *   - Sin zona: el paso sale centrado.
 *   - mobile: { lo que cambia en el celular (<= 768 px) }, ej. el menu lateral
 *     pasa a ser «Toca el botón de menú».
 *   - variants: [pasos alternativos]; gana el primero cuya zona existe (sirve
 *     para zonas que cambian segun el estado, como la cotizacion del medico).
 *   - optional: true o el motivo; la zona depende del estado o del tamano de
 *     pantalla, asi que no es un error que falte (el paso se salta en silencio).
 *   En desarrollo, un paso NO opcional sin zona deja un console.warn.
 *
 * AGREGAR GUIAS DESDE OTRO MODULO (ej. el panel de Eventos), sin editar este archivo:
 *   import { registerTours } from '../components/Tour.js';
 *   registerTours({
 *     '#/admin/events': { version: 1, title: 'Eventos', intro: { que, para, como }, steps: [...] },
 *   });
 *   El paso final (el boton «Guía») se agrega solo. Verificalo con
 *   `node scripts/verificar-guias.mjs`.
 *
 * PAGINAS SIN GUIA: se arma una intro automatica con .page-title/.page-subtitle
 *   y un paso por cada .panel__title visible: el boton nunca queda sin respuesta.
 *
 * ESTADO EN EL NAVEGADOR (localStorage, siempre dentro de try/catch):
 *   - cs_tour_seen  = { usuario: { ruta: version } } (el valor viejo `true` se lee
 *     como version 1). Se marca al ABRIR la intro. Solo controla el punto azul.
 *   - cs_guide_hint = { usuario: true }: el globo «¿Primera vez aquí?» sale una
 *     sola vez por usuario, se va a los 8 s o con cualquier clic.
 *   - cs_tour_off   = '1': sin punto ni globo (lo usan las grabaciones de video).
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

// ---------------------------------------------------------------------------
// Pasos compartidos
// ---------------------------------------------------------------------------

const SOLO_ESCRITORIO = 'en el celular esta barra se oculta';

const SIDEBAR = {
  sel: '.sidebar',
  title: 'Menú principal',
  text: 'Desde aquí te mueves por todas las secciones del portal. La sección en la que estás queda resaltada.',
  mobile: {
    sel: '.navbar__toggle',
    title: 'Menú',
    text: 'Toca el botón de menú (las tres rayas) para ver todas las secciones del portal.',
  },
};
const SEARCH = {
  sel: '.navbar__search-float',
  title: 'Buscador',
  text: 'Encuentra cualquier solicitud, caso, empresa o médico escribiendo su nombre o su código.',
  optional: SOLO_ESCRITORIO,
};
const BELL = {
  sel: '.navbar__icon-float--notify',
  title: 'Notificaciones',
  text: 'Aquí te avisamos cuando puedes actuar. El punto rojo indica que tienes algo nuevo.',
  optional: SOLO_ESCRITORIO,
};
const PROFILE = {
  sel: '.profile-menu__trigger',
  title: 'Tu cuenta',
  text: 'Toca tus iniciales para cambiar tu contraseña o cerrar sesión.',
};
const PROFILE_ADMIN = {
  ...PROFILE,
  text: 'Toca tus iniciales para entrar a Configuración, cambiar tu contraseña o cerrar sesión.',
};
const FAB_COMPANY = {
  sel: '.fab',
  title: 'Pedir un viaje',
  text: 'Este botón abre un formulario corto para pedir un viaje nuevo en segundos.',
};
const FAB_DOCTOR = {
  sel: '.fab',
  title: 'Nuevo caso',
  text: 'Este botón abre un formulario corto para registrar un paciente nuevo en segundos.',
};
const TIMELINE = (text) => ({ sel: '.timeline-panel', title: 'En qué va', text });

/** Ultimo paso de TODAS las guias: el propio boton. */
const GUIDE_STEP = {
  sel: '.navbar__guide',
  title: 'La guía, siempre a mano',
  text: 'Cuando tengas dudas en cualquier página, toca Guía. También la abres con la tecla ?.',
  mobile: { text: 'Cuando tengas dudas en cualquier página, toca este botón y te explicamos la página.' },
};

/** Mi convenio: la misma vista para empresa y medico, con textos propios. */
function partnerTour(kind) {
  const medico = kind === 'medico';
  const quien = medico ? 'tu consulta o tu clínica' : 'tu empresa';
  return {
    version: medico ? 1 : 2,
    title: 'Mi convenio',
    intro: {
      que: `Tu expediente como ${medico ? 'médico o clínica aliada' : 'empresa aliada'} de CS Travel Group.`,
      para: `Subir los documentos de ${quien}, firmar el acuerdo y, cuando lo aprobemos, compartir tu código, tu enlace y tu QR.`,
      como: 'Sigue los pasos del convenio de arriba abajo. Lo que subas queda guardado: puedes salir y volver cuando quieras.',
    },
    steps: [
      { sel: '.qb-page-hero, .page-header', title: 'Mi convenio', text: 'El estado de tu convenio y, cuando esté activo, cuántas solicitudes han llegado por tu enlace.' },
      { panel: 'Estado del convenio', title: 'En qué va tu convenio', text: 'Cada paso del proceso, desde el registro hasta que queda activo.', optional: true },
      { panel: 'Completa tu expediente', title: 'Tu expediente', text: 'Sube cada documento y firma el acuerdo aquí mismo, sin imprimir ni escanear. Todo queda guardado.', optional: true },
      { panel: 'Corrige tu expediente', title: 'Lo que hay que corregir', text: 'Reemplaza solo lo que está marcado y vuelve a enviarlo. Lo aprobado y tu firma se conservan.', optional: true },
      { panel: 'Tu expediente esta en revision', title: 'En revisión', text: 'Estamos verificando la información. Te avisamos por correo apenas terminemos.', optional: true },
      { panel: 'Todavia no tienes un convenio', title: 'Sin convenio', text: 'Si quieres ofrecer los beneficios de CS Travel Group, regístrate y completa tu expediente en línea.', optional: true },
      { panel: 'Tu codigo y enlace', title: 'Tu enlace y tu QR', text: 'Compártelo por WhatsApp o imprímelo: todo el que entre por aquí queda registrado como tuyo.', optional: true },
      { panel: 'Seguimiento', title: 'Resultados', text: 'Cuántas solicitudes llegaron por tu enlace cada mes.', optional: true },
      { panel: 'Documentos', title: 'Documentos', text: 'El acuerdo que firmaste y el material comercial para compartir con tu equipo y tu comunidad.' },
      PROFILE,
    ],
  };
}

// ---------------------------------------------------------------------------
// Guias por pagina
// ---------------------------------------------------------------------------

export const TOURS = {
  // ----------------------------- ADMINISTRADOR -----------------------------
  '#/admin/dashboard': {
    version: 2,
    title: 'Panel de control',
    intro: {
      que: 'Tu tablero de control de CS Travel Group: ingresos, pendientes y el estado de toda la operación en una sola vista.',
      para: 'Saber en segundos qué requiere tu atención hoy y cómo van el negocio y los aliados.',
      como: 'Empieza por la Cola de trabajo y toca una fila para abrirla. Las tarjetas de arriba resumen las cifras clave.',
    },
    steps: [
      SIDEBAR,
      { sel: '.doctor-kpi-row--primary', title: 'Cifras clave', text: 'Tu ingreso (el margen de CS Travel Group), lo que está por atender, la operación activa y el ahorro entregado a los clientes.' },
      { sel: '.doctor-kpi-row--secondary', title: 'Aliados y usuarios', text: 'Empresas y médicos activos, la tasa de cierre y las cuentas registradas. Toca «Tasa de cierre» para ver las operaciones que no se cerraron.' },
      { panel: 'Cola de trabajo', title: 'Cola de trabajo', text: 'Lo que requiere tu acción hoy: por cotizar, aprobar o pagar. Toca una fila para abrirla; si hay varias páginas, usa ‹ ›.' },
      { panel: 'Ingreso CS Travel Group', title: 'Ingreso por aliado', text: 'Cuánto margen deja cada empresa y cada médico aliado. Pasa el cursor o toca una barra para ver el valor exacto.' },
      { sel: '.doctor-status-floating', title: 'Estado de la operación', text: 'Cuántas solicitudes y casos hay en cada etapa, del envío a la finalización.' },
      { panel: 'Solicitudes recientes', title: 'Lo más reciente', text: 'Las últimas solicitudes que entraron. Toca una para abrirla.' },
      SEARCH, BELL, PROFILE_ADMIN,
    ],
  },
  '#/admin/requests': {
    version: 2,
    title: 'Operaciones',
    intro: {
      que: 'La lista completa de solicitudes de empresas y casos médicos, en un solo lugar.',
      para: 'Encontrar cualquier operación, ver en qué estado está y entrar a gestionarla.',
      como: 'Filtra o escribe un código, un cliente o una ruta; luego toca la fila para abrir el detalle y cotizar.',
    },
    steps: [
      { sel: '.page-header', title: 'Operaciones', text: 'Aquí se juntan las solicitudes de las empresas (REQ) y los casos de los médicos (MED).' },
      { sel: '.ops-table-panel .table-toolbar, .table-toolbar', title: 'Buscar y filtrar', text: 'Busca por código, cliente o ruta y filtra por tipo, estado y prioridad. Ordena por fecha de viaje o mayor valor; «Limpiar» quita los filtros.' },
      { sel: '#req-table', title: 'Listado', text: 'Toca cualquier fila para abrirla, cotizarla y cambiar su estado. Si hay muchas, pasa de página con ‹ › arriba a la derecha.' },
    ],
  },
  '#/admin/requests/:id': {
    version: 2,
    title: 'Detalle de la solicitud',
    intro: {
      que: 'La ficha completa de una solicitud de viaje de una empresa.',
      para: 'Revisar lo que pidió el cliente, armar la cotización y avanzar el estado.',
      como: 'Mira la línea de tiempo, revisa los datos del viaje y completa el panel de Gestión. Guarda los cambios al final.',
    },
    steps: [
      TIMELINE('La línea de tiempo muestra la etapa en la que está la solicitud.'),
      { panel: 'Datos del viaje', title: 'Datos del viaje', text: 'Lo que pidió el cliente: ruta, fechas, pasajeros y tipo de servicio.' },
      { panel: 'Costos y beneficios', title: 'Costos y beneficios', text: 'El costo del viaje, el ahorro del cliente y el retorno que genera para la empresa aliada.' },
      { panel: 'Gestion', title: 'Gestión', text: 'Arriba, lo que el cliente verá en su cotización; abajo, lo de uso interno (tu margen y observaciones), que nunca se le muestra. Al guardar la cotización, pasa sola a «cotización enviada».' },
      { sel: 'a[href^="#/admin/quotes?from=request"]', title: 'Itinerario en PDF', text: 'Abre el constructor de cotizaciones con los datos de esta solicitud para generar el itinerario en PDF.' },
    ],
  },
  '#/admin/medical-cases/:id': {
    version: 2,
    title: 'Detalle del caso médico',
    intro: {
      que: 'La ficha de un caso que envió un médico aliado para la logística del viaje de su paciente.',
      para: 'Cotizar el viaje del paciente y acompañar el caso hasta cerrarlo.',
      como: 'Sigue la indicación de «Siguiente paso», revisa los datos del paciente y arma la cotización al final de la página.',
    },
    steps: [
      { sel: '.case-nextstep', title: 'Siguiente paso', text: 'Te dice qué falta para avanzar este caso y quién debe actuar. Si te toca a ti, el botón te lleva directo.' },
      TIMELINE('La etapa en la que está el caso, del envío a la finalización.'),
      { panel: 'Datos del paciente', title: 'Datos del caso', text: 'El paciente, el procedimiento, las fechas y el nivel de apoyo que pidió el médico.' },
      { panel: 'Cotizacion logistica', title: 'Lo que ve el médico', text: 'Resumen de solo lectura de la cotización que recibe el médico: costo logístico, detalle y notas.' },
      { sel: '.inv', title: 'Inventario real de viajes', text: 'Busca vuelos y hoteles reales para estimar el costo base. Es una referencia: el costo final lo pones tú abajo.' },
      { panel: 'Cotizacion del viaje', title: 'Cotización del viaje', text: 'Aquí la armas: costo del viaje, precio de mercado y notas. Al guardar, el médico la ve en su panel, fija su margen y la aprueba.' },
    ],
  },
  '#/admin/kanban': {
    version: 2,
    title: 'Seguimiento operativo',
    intro: {
      que: 'Un tablero con una columna por etapa; cada tarjeta es una solicitud o un caso médico.',
      para: 'Ver todo el flujo de trabajo de un vistazo y mover cada operación a su siguiente etapa.',
      como: 'Arrastra una tarjeta a la columna vecina. Se avanza o se retrocede de a un paso, y al cancelar te pedimos el motivo.',
    },
    steps: [
      { sel: '.page-header', title: 'Seguimiento operativo', text: 'Las columnas van de «Solicitud enviada» a «Finalizada»; la última guarda las canceladas.' },
      { sel: '.toolbar--kanban, #kanban-search', title: 'Filtrar el tablero', text: 'Busca una tarjeta y filtra por tipo (solicitudes o casos) y por prioridad para concentrarte.' },
      {
        sel: '#kanban-board, .kanban-board',
        title: 'Arrastra para avanzar',
        text: 'Arrastra una tarjeta a la columna vecina para cambiar su estado. No se saltan etapas, y una cancelada solo se reabre a «Solicitud enviada».',
        mobile: { text: 'Cambia el estado con el selector de cada tarjeta. No se saltan etapas, y una cancelada solo se reabre a «Solicitud enviada».' },
      },
    ],
  },
  '#/admin/quotes': {
    version: 2,
    title: 'Cotizaciones',
    intro: {
      que: 'El constructor de cotizaciones tipo itinerario, con tu marca y listas para PDF.',
      para: 'Preparar propuestas claras para empresas y pacientes, y guardarlas para reutilizarlas.',
      como: 'Empieza por las pendientes; abre «Nueva cotización», completa los bloques y descarga el PDF.',
    },
    steps: [
      { sel: '.qb-page-hero', title: 'Resumen', text: 'Cuántas cotizaciones has creado, las de este mes, su valor total y las solicitudes que esperan cotización.' },
      { panel: 'Cotizaciones pendientes', title: 'Pendientes', text: 'Solicitudes que todavía no tienen cotización. Empieza por aquí: toca una para abrirla.', optional: true },
      { panel: 'Cotizaciones guardadas', title: 'Guardadas', text: 'Tus cotizaciones anteriores, para descargarlas de nuevo o reutilizarlas.' },
      { sel: '#qb-toggle', title: 'Nueva cotización', text: 'Abre el formulario para armar una cotización: bloques del itinerario, transporte, lo que incluye y el valor total.' },
    ],
  },
  '#/admin/codes': {
    version: 2,
    title: 'Códigos',
    intro: {
      que: 'Los códigos de referido y de descuento de las empresas y los médicos aliados.',
      para: 'Atribuir cada cliente a su aliado y, si aplica, darle un descuento.',
      como: 'Crea el código con «+ Nuevo código», asígnalo a su socio y actívalo o desactívalo desde la lista.',
    },
    steps: [
      { sel: '.page-header', title: 'Códigos', text: 'Cada código atribuye el cliente a un socio y, si lo configuras, le aplica un descuento.' },
      { sel: '#toggle-create', title: 'Crear código', text: 'Crea un código nuevo en cinco pasos: socio, código, tipo, descuento y estado.' },
      { sel: '#code-search, .table-toolbar', title: 'Buscar', text: 'Encuentra un código o a su socio, y filtra los activos e inactivos.' },
      { sel: '#codes-table', title: 'Listado', text: 'Activa o desactiva cada código, registra un referido con «+ Referido» o bórralo.' },
    ],
  },
  '#/admin/users': {
    version: 2,
    title: 'Usuarios',
    intro: {
      que: 'Todas las cuentas del portal: administradores, empresas y médicos.',
      para: 'Dar acceso a personas nuevas y controlar quién puede entrar.',
      como: 'Crea una cuenta con «+ Nuevo usuario»; busca o filtra para encontrar una y ábrela para editarla.',
    },
    steps: [
      { sel: '.page-header', title: 'Usuarios', text: 'Cada fila es una cuenta con su rol y su estado.' },
      { sel: '[data-action="open-user-modal"]', title: 'Nuevo usuario', text: 'Crea la cuenta y asígnale su rol. Al crear un usuario de empresa o de médico se crea también su ficha de aliado.' },
      { sel: '#user-search, .table-toolbar', title: 'Buscar y filtrar', text: 'Busca por nombre o correo y filtra por rol o estado.' },
      { sel: '#users-table', title: 'Listado', text: 'Abre un usuario para editar sus datos, cambiar su rol o desactivarlo.' },
    ],
  },
  '#/admin/users/:id': {
    version: 1,
    title: 'Ficha del usuario',
    intro: {
      que: 'La ficha de una cuenta del portal.',
      para: 'Corregir sus datos, cambiar su rol o su estado y revisar el correo de bienvenida.',
      como: 'Edita los campos y toca «Guardar cambios». «Desactivar» le quita el acceso sin borrar su historial.',
    },
    steps: [
      { sel: '.page-header', title: 'La cuenta', text: 'Su estado, su rol y la fecha en que se creó.' },
      { panel: 'Datos de acceso', title: 'Datos de acceso', text: 'Nombre, correo, rol, estado y observaciones internas. Guarda con «Guardar cambios».' },
      { sel: '#toggle-user-status', title: 'Activar o desactivar', text: 'Desactivar le quita el acceso al portal sin borrar nada; puedes volver a activarlo cuando quieras.' },
      { panel: 'Correo de bienvenida', title: 'Correo de bienvenida', text: 'El texto que recibe la persona con sus datos de acceso, listo para copiar.' },
    ],
  },
  '#/admin/companies': {
    version: 1,
    title: 'Empresas aliadas',
    intro: {
      que: 'La lista de empresas con las que trabaja CS Travel Group.',
      para: 'Consultar cada empresa aliada, su estado y sus métricas.',
      como: 'Busca o filtra y toca una empresa para abrir su ficha. Las empresas nuevas se crean desde Usuarios.',
    },
    steps: [
      { sel: '.page-header', title: 'Empresas aliadas', text: 'Todas las empresas registradas, activas e inactivas.' },
      { sel: '.page-header .btn--primary', title: 'Nueva empresa', text: 'Te lleva a Usuarios: al crear un usuario de tipo empresa se crea su ficha, así ninguna empresa queda sin cuenta.' },
      { sel: '#company-search, .table-toolbar', title: 'Buscar y filtrar', text: 'Busca por nombre, contacto, correo o código y filtra por estado.' },
      { sel: '#companies-table', title: 'Listado', text: 'Toca una empresa para ver su rentabilidad, sus referidos y sus solicitudes.' },
    ],
  },
  '#/admin/companies/:id': {
    version: 1,
    title: 'Ficha de la empresa',
    intro: {
      que: 'Todo sobre una empresa aliada: rentabilidad, referidos, solicitudes y datos.',
      para: 'Saber cuánto genera, a quién ha referido y qué viajes tiene en curso.',
      como: 'Recorre la página de arriba abajo; los datos editables están al final.',
    },
    steps: [
      { sel: '.page-header', title: 'Estado y código', text: 'Su estado, su código y el código de referido asignado. Desde aquí la activas, la desactivas o la eliminas.' },
      { panel: 'Rentabilidad del aliado', title: 'Rentabilidad', text: 'El ingreso que le genera a CS Travel Group frente al valor que se le retorna. Una alerta roja avisa si retorna más de lo que genera.' },
      { panel: 'Seguimiento de Referidos', title: 'Referidos', text: 'Las personas que llegaron por esta empresa. Con «+ Añadir» registras una nueva.' },
      { panel: 'Solicitudes de la empresa', title: 'Solicitudes', text: 'Sus viajes, con acceso a cada uno. Con «+ Crear solicitud» registras una a su nombre.' },
      { panel: 'Datos y metricas de la empresa', title: 'Datos y métricas', text: 'Datos de contacto y métricas de la empresa. Guarda al final del formulario.' },
    ],
  },
  '#/admin/doctors': {
    version: 1,
    title: 'Médicos y clínicas',
    intro: {
      que: 'La lista de médicos y clínicas aliadas que envían pacientes a CS Travel Group.',
      para: 'Consultar cada aliado médico, su estado y sus casos.',
      como: 'Busca o filtra y toca un médico para abrir su ficha. Los médicos nuevos se crean desde Usuarios.',
    },
    steps: [
      { sel: '.page-header', title: 'Médicos y clínicas', text: 'Todos los aliados médicos registrados, activos e inactivos.' },
      { sel: '.page-header .btn--primary', title: 'Nuevo médico', text: 'Te lleva a Usuarios: al crear un usuario de tipo médico se crea su ficha, así ninguno queda sin cuenta.' },
      { sel: '#doctor-search, .table-toolbar', title: 'Buscar y filtrar', text: 'Busca por nombre, clínica o especialidad y filtra por estado.' },
      { sel: '#doctor-table', title: 'Listado', text: 'Toca un médico para ver su rentabilidad, sus referidos y sus datos.' },
    ],
  },
  '#/admin/doctors/:id': {
    version: 1,
    title: 'Ficha del médico',
    intro: {
      que: 'Todo sobre un médico o clínica aliada: rentabilidad, referidos y datos.',
      para: 'Saber cuánto genera, a quién ha referido y mantener sus datos al día.',
      como: 'Recorre la página de arriba abajo; los datos editables están al final.',
    },
    steps: [
      { sel: '.page-header', title: 'Estado y código', text: 'Su estado, su código y el código de referido asignado. Desde aquí lo activas o lo desactivas.' },
      { panel: 'Rentabilidad del aliado', title: 'Rentabilidad', text: 'El ingreso que le genera a CS Travel Group frente al valor que se le retorna.' },
      { panel: 'Seguimiento de Referidos', title: 'Referidos', text: 'Las personas que llegaron por este médico. Con «+ Añadir» registras una nueva.' },
      { panel: 'Datos y metricas del medico', title: 'Datos y métricas', text: 'Datos de contacto, clínica, especialidad y cifras de sus casos. Guarda al final del formulario.' },
    ],
  },
  '#/admin/payments': {
    version: 2,
    title: 'Cobros y links de pago',
    intro: {
      que: 'Los cobros a clientes que pagan con un código corto o un enlace, aunque no tengan cuenta en el portal.',
      para: 'Cobrar, seguir cada pago y dejar lista la información para facturar.',
      como: 'Crea el cobro con «+ Nuevo cobro», envíale el enlace al cliente y revisa aquí su estado.',
    },
    steps: [
      { sel: '.qb-page-hero', title: 'Resumen', text: 'Cuánto está pendiente, cuánto se cobró y qué falta facturar.' },
      { sel: '#toggle-create', title: 'Nuevo cobro', text: 'Crea un cobro con concepto y valor. Te damos un código corto y un enlace para enviarle al cliente.' },
      { panel: 'Por facturar', title: 'Por facturar', text: 'Cobros ya pagados que esperan su factura electrónica. Toca «Registrar factura» cuando la emitas.', optional: true },
      { panel: 'Cierre contable', title: 'Cierre contable', text: 'Lo que necesita el contador: elige el mes y descarga el CSV. Solo se factura el servicio de intermediación; lo recibido para aerolíneas y hoteles es recaudo a favor de terceros.' },
      { panel: 'Cobros', title: 'Seguimiento', text: 'El estado de cada cobro. Copia el enlace, confirma una transferencia recibida o anúlalo.' },
    ],
  },
  '#/admin/allies': {
    version: 2,
    title: 'Aliados',
    intro: {
      que: 'La bandeja de las empresas, médicos y clínicas que se registraron como aliados.',
      para: 'Revisar su expediente, activar su convenio y hacerles seguimiento comercial.',
      como: 'Toca la cifra «Por revisar» para ver los expedientes pendientes y abre cada ficha para aprobarla o pedir correcciones.',
    },
    steps: [
      { sel: '.qb-page-hero', title: 'Cifras de la bandeja', text: '«Por revisar» son los expedientes que esperan tu revisión; toca una cifra para filtrar. También ves los créditos de firma que quedan y los seguimientos vencidos.' },
      { sel: '.table-toolbar', title: 'Filtros', text: 'Filtra por estado, origen, fechas, responsable o aliados sin actividad. «Exportar CSV» lo lleva todo a Excel.' },
      { sel: '.ally-mode', title: 'Lista, tablero o contratos', text: 'En «Tablero» mueves a los prospectos entre etapas arrastrándolos; en «Contratos» ves los acuerdos firmados.' },
      { sel: '#ally-list, #ally-board, #ally-contracts', title: 'Ficha de cada aliado', text: 'Abre uno para revisar su expediente: ves cada documento, lo apruebas o lo marcas para corregir y, con todo aprobado, activas su código y su QR. También lo llamas, dejas notas y programas la siguiente acción.' },
    ],
  },
  '#/admin/banners': {
    version: 2,
    title: 'Banners de promociones',
    intro: {
      que: 'La franja de promociones que aparece en Inicio, Empresas y Médicos del sitio.',
      para: 'Publicar promociones con fecha de inicio y fin, sin depender de nadie.',
      como: 'Crea el banner con sus dos imágenes y sus fechas: se publica y se retira solo.',
    },
    steps: [
      { sel: '.qb-page-hero', title: 'Banners de promociones', text: 'Cuántos banners están en línea, programados o vencidos.' },
      { sel: '#bn-toggle', title: 'Nuevo banner', text: 'Sube la imagen de escritorio y la de celular, el enlace y las fechas.' },
      { sel: '#bn-rows', title: 'Tus banners', text: 'Edita, pausa con «Desactivar» o elimina cada banner. Con varios vigentes, rotan en el orden que definas.' },
    ],
  },
  '#/admin/emails': {
    version: 2,
    title: 'Correos automáticos',
    intro: {
      que: 'Los correos que el portal envía solo en cada momento del proceso.',
      para: 'Elegir qué plantilla sale en cada evento y comprobar qué pasó con cada envío.',
      como: 'Revisa primero el estado de la conexión, asigna una plantilla a cada evento y envíate una prueba.',
    },
    steps: [
      { sel: '.qb-page-hero', title: 'Correos automáticos', text: 'Solicitud recibida, aprobada, contrato, bienvenida, recordatorios y pagos: cada uno sale solo.' },
      { panel: 'Estado de la conexion', title: 'Qué falta', text: 'Lo que está listo y lo que falta para que Brevo envíe. Mientras falte, cada intento queda registrado como «omitido».' },
      { panel: 'Eventos', title: 'Plantilla por evento', text: 'Elige la plantilla de Brevo para cada evento, actívalo y envíate una prueba antes.' },
      { panel: 'Registro de envios', title: 'Evidencia', text: 'Cada correo con su estado: entregado, abierto o rebotado. Sirve ante un «no me llegó».' },
    ],
  },
  '#/admin/settings': {
    version: 2,
    title: 'Configuración',
    intro: {
      que: 'Los datos legales de CS Travel Group que salen en las cotizaciones y los ajustes generales del portal.',
      para: 'Revisar el pie legal de las cotizaciones, la moneda y descargar el respaldo de la información.',
      como: 'Cada bloque tiene su propio botón. En el portal real los datos legales son fijos: solo cambias el asesor por defecto.',
    },
    steps: [
      { sel: '.page-header', title: 'Configuración', text: 'Datos legales de las cotizaciones, moneda y respaldo de la información.' },
      { panel: 'Datos legales', title: 'Datos legales y de marca', text: 'Nombre comercial, razón social, NIT y RNT: salen en el pie de cada cotización en PDF, iguales para todo el equipo.' },
      { panel: 'Moneda', title: 'Precios en dólares', text: 'El cobro siempre es en pesos (COP); esto solo muestra el equivalente aproximado en dólares, con la misma tasa para todos.' },
      { panel: 'Respaldo', title: 'Respaldo de la información', text: 'Descarga en un solo archivo todo lo que guarda el portal. Guárdalo con la fecha y no lo compartas: tiene datos personales.' },
    ],
  },

  // -------------------------------- EMPRESA --------------------------------
  '#/company/dashboard': {
    version: 2,
    title: 'Tu panel',
    intro: {
      que: 'El panel de tu empresa como aliada de CS Travel Group.',
      para: 'Ver el retorno que genera tu empresa, seguir a tus clientes referidos y compartir tu beneficio.',
      como: 'Mira tu retorno arriba, comparte tu código desde el Centro de beneficios y pide un viaje con el botón +.',
    },
    steps: [
      SIDEBAR,
      { panel: 'Retorno por', title: 'Tu retorno', text: 'Lo que tu empresa gana por los viajes de tu equipo y de tu comunidad, mes a mes. Toca una barra para ver el detalle.' },
      { panel: 'Ahorro de tu comunidad', title: 'Ahorro de tu comunidad', text: 'Cuánto ahorra tu comunidad con tarifas más económicas que las OTAs.' },
      { panel: 'Clientes referidos', title: 'Referidos en vivo', text: 'Las personas que llegaron por tu empresa y la etapa en la que va cada una.' },
      { panel: 'Centro de beneficios', title: 'Comparte tu beneficio', text: 'Tu código y tu enlace para compartir por WhatsApp o correo.' },
      { panel: 'Incentivos', title: 'Incentivos', text: 'Metas y premios que desbloquea tu empresa a medida que crece.' },
      { sel: '.partner-strip', title: 'Soporte', text: 'Tu línea directa con el equipo de CS Travel Group y tu enlace de referidos a mano.' },
      FAB_COMPANY, PROFILE,
    ],
  },
  '#/company/requests': {
    version: 2,
    title: 'Mis solicitudes',
    intro: {
      que: 'Todos los viajes que tu empresa le ha pedido a CS Travel Group.',
      para: 'Saber en qué va cada solicitud y entrar a aprobar o pagar su cotización.',
      como: 'Busca o filtra, toca una solicitud para ver su detalle y usa el botón + para pedir un viaje nuevo.',
    },
    steps: [
      { sel: '.cr-page-hero, .page-header', title: 'Resumen', text: 'Cuántas solicitudes tienes en total, cuántas están pendientes y cuántas activas.' },
      { panel: 'por estado', title: 'Por estado', text: 'Cuántas solicitudes tienes en cada etapa.' },
      { sel: '.cr-table-panel .table-toolbar, #cr-search', title: 'Buscar', text: 'Encuentra una solicitud por código, origen o destino y filtra por estado o tipo.' },
      { sel: '#cr-table', title: 'Detalle', text: 'Abre una solicitud para ver la cotización, aprobarla y pagarla.' },
      FAB_COMPANY,
    ],
  },
  '#/company/requests/new': {
    version: 2,
    title: 'Nueva solicitud',
    intro: {
      que: 'El formulario para pedirle un viaje a CS Travel Group.',
      para: 'Darnos lo necesario para preparar tu cotización.',
      como: 'Completa las secciones de arriba abajo y toca «Enviar solicitud». Te avisamos en la campana cuando esté cotizada.',
    },
    steps: [
      { panel: 'Detalles del viaje', title: 'Detalles del viaje', text: 'Marca uno o varios servicios (vuelo, hotel, traslados…) y completa la ruta, las fechas y los pasajeros.' },
      { panel: 'Datos del viajero', title: 'Viajero principal', text: 'Sus datos tal como aparecen en su documento de viaje (pasaporte o cédula).' },
      { panel: 'Servicios adicionales', title: 'Servicios adicionales', text: 'Lo que quieras sumar al viaje. Si te compartieron un código de referido, escríbelo aquí.' },
      { sel: '.nr-actions', title: 'Enviar', text: 'Al enviarla, nuestro equipo la recibe de inmediato y te avisamos cuando esté cotizada.' },
    ],
  },
  '#/company/requests/:id': {
    version: 2,
    title: 'Detalle de tu solicitud',
    intro: {
      que: 'La ficha de uno de tus viajes.',
      para: 'Ver en qué va, revisar la cotización, aprobarla y pagarla.',
      como: 'Sigue la línea de tiempo. Cuando la cotización esté lista, toca «Aprobar cotización»; después aparece el pago.',
    },
    steps: [
      TIMELINE('La etapa en la que va tu viaje. CS Travel Group gestiona cada paso y te avisa en la campana cuando puedes actuar.'),
      { sel: '#approve-request', title: 'Aprobar cotización', text: 'Cuando estés de acuerdo con la cotización, tócalo para que empecemos a gestionar tu viaje.', optional: true },
      { panel: 'Datos del viaje', title: 'Tu viaje', text: 'El resumen de lo que pediste.' },
      { panel: 'Costos y beneficios', title: 'Costos y ahorro', text: 'El valor de la cotización y cuánto ahorras frente a comprar por tu cuenta.' },
      { panel: 'Pago', title: 'Pago', text: 'Cuando apruebes la cotización, paga aquí de forma segura con tarjeta, PSE o transferencia.', optional: true },
    ],
  },
  '#/company/partner': partnerTour('empresa'),

  // --------------------------------- MEDICO ---------------------------------
  '#/doctor/partner': partnerTour('medico'),
  '#/doctor/dashboard': {
    version: 2,
    title: 'Tu panel',
    intro: {
      que: 'Tu panel como médico o clínica aliada de CS Travel Group.',
      para: 'Ver lo que ganas al acompañar a tus pacientes que viajan, decidir las cotizaciones pendientes y compartir tu código.',
      como: 'Empieza por «Pendientes»: ahí están los casos que esperan tu decisión. Registra un paciente nuevo con el botón +.',
    },
    steps: [
      SIDEBAR,
      { sel: '.gain-hero', title: 'Tus ganancias', text: 'Lo que llevas ganado y lo que viene en camino por cotizaciones todavía abiertas.' },
      { panel: 'Pendientes', title: 'Pendientes de tu decisión', text: 'Casos con una cotización lista que esperan tu decisión. Empieza siempre por aquí.' },
      { sel: '.doctor-kpi-row--trio', title: 'Indicadores', text: 'El valor total gestionado, lo que está en camino y el ticket promedio de tus casos.' },
      { panel: 'Ganancias por periodo', title: 'Ganancias por periodo', text: 'Tu ganancia por mes, día o año. Toca una barra para ver el desglose por paciente.' },
      { panel: 'Casos activos', title: 'Casos activos', text: 'Tus pacientes en curso y la etapa en la que va cada uno.' },
      { panel: 'Tus referidos', title: 'Tus referidos', text: 'Las personas que llegaron por tu código y lo que te han generado.' },
      { panel: 'Tus beneficios como aliado', title: 'Tus beneficios', text: 'Lo que ganas por ser aliado de CS Travel Group.' },
      { panel: 'Centro de beneficios', title: 'Tu código', text: 'Tu código de aliado y tu enlace para compartir por WhatsApp o correo.' },
      { sel: '.partner-strip', title: 'Soporte', text: 'Tu línea directa con el equipo de CS Travel Group, tu código y tu enlace de referidos.' },
      FAB_DOCTOR, PROFILE,
    ],
  },
  '#/doctor/cases': {
    version: 2,
    title: 'Mis casos médicos',
    intro: {
      que: 'Todos los pacientes que has enviado a CS Travel Group.',
      para: 'Saber en qué etapa va cada caso y cuáles esperan tu decisión.',
      como: 'Busca o filtra y toca un caso para abrirlo. Registra uno nuevo con «+ Nuevo caso».',
    },
    steps: [
      { sel: '.page-header [data-action="open-quick-create"]', title: 'Nuevo caso', text: 'Abre un formulario corto para registrar a un paciente y lo que necesita para viajar.' },
      { sel: '.cases-hero', title: 'Resumen', text: 'Tus casos en total, los activos y los que esperan tu decisión.' },
      { panel: 'por estado', title: 'Por estado', text: 'Cuántos casos tienes en cada etapa.' },
      { sel: '.cases-table-panel .table-toolbar, #case-search', title: 'Buscar', text: 'Encuentra un caso por código, paciente o destino y filtra por estado.' },
      { sel: '#cases-table', title: 'Detalle', text: 'Abre un caso para revisar la cotización, fijar tu margen y confirmar cuando el paciente apruebe.' },
    ],
  },
  '#/doctor/cases/new': {
    version: 2,
    title: 'Nuevo caso médico',
    intro: {
      que: 'El formulario para registrar a un paciente que necesita viajar.',
      para: 'Darnos lo necesario para cotizar la logística de su viaje.',
      como: 'Completa los campos y toca «Crear caso». Nosotros nos encargamos del resto y te avisamos cuando esté cotizado.',
    },
    steps: [
      { sel: '.page-header', title: 'Nuevo caso', text: 'Registra al paciente y lo que necesita para viajar.' },
      { sel: '#medical-case-form', title: 'Datos del caso', text: 'Solo lo necesario: ciudad de origen, fechas tentativas, acompañantes y nivel de apoyo.' },
      { sel: '#medical-case-form .form__actions', title: 'Crear caso', text: 'Al crearlo, CS Travel Group lo recibe de inmediato y prepara la cotización.' },
    ],
  },
  '#/doctor/cases/:id': {
    version: 2,
    title: 'Detalle del caso',
    intro: {
      que: 'La ficha de uno de tus pacientes y su viaje.',
      para: 'Revisar la cotización logística, fijar tu margen y confirmar cuando el paciente apruebe.',
      como: 'Cuando la cotización esté lista, ajusta tu margen, toca «Guardar y generar PDF» y, si el paciente acepta, «Paciente aprobó».',
    },
    steps: [
      TIMELINE('La etapa en la que va el caso. CS Travel Group gestiona cada paso y te avisa en la campana cuando puedes actuar.'),
      {
        sel: '.decision-center',
        title: 'Tu cotización',
        text: 'Mueve el control para fijar tu margen: ves al instante el precio al paciente, tu ganancia y su ahorro. Luego toca «Guardar y generar PDF».',
        variants: [
          { sel: '.panel--quote-summary', title: 'Cotización logística', text: 'El resumen de lo acordado. Descarga el PDF con el botón de arriba.' },
          { sel: '.case-detail-grid > .panel', title: 'Cotización en preparación', text: 'CS Travel Group está preparando la cotización. Te avisamos en la campana cuando esté lista.' },
        ],
      },
      { sel: '#approve-case, #margin-gate-chip', title: 'Paciente aprobó', text: 'Primero guarda tu margen. Cuando el paciente acepte, toca «Paciente aprobó» para que empecemos a gestionar el viaje.', optional: true },
      { panel: 'Datos del paciente', title: 'Datos del caso', text: 'La información del paciente y de su viaje.' },
    ],
  },
};

/**
 * registerTours()
 * Agrega o reemplaza guias desde otro modulo (ej. el panel de Eventos) sin
 * editar este archivo. Acepta el formato nuevo ({ version, title, intro, steps })
 * o el viejo (arreglo de pasos). Si la ruta que se esta viendo cambia, el boton
 * Guia se actualiza al momento.
 * @param {Record<string, object|Array>} map - { '#/ruta': guia }
 */
export function registerTours(map) {
  if (!map || typeof map !== 'object') return;
  Object.entries(map).forEach(([route, tour]) => {
    if (tour) TOURS[route] = tour;
  });
  if (current.route && map[current.route]) updateGuideButton(current.route, current.user);
}

// ---------------------------------------------------------------------------
// Estado en el navegador ("ya visto", globo de primera vez, interruptor)
// ---------------------------------------------------------------------------

const SEEN_KEY = 'cs_tour_seen';
const HINT_KEY = 'cs_guide_hint';
const OFF_KEY = 'cs_tour_off';

const userKey = (user) => String(user?.id || user?.email || 'anon');

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: no pasa nada */ }
}

/** Version vista de una pagina: el `true` de antes cuenta como version 1. */
function seenVersion(uid, route) {
  const value = readJson(SEEN_KEY)[uid]?.[route];
  if (value === true) return 1;
  return Number(value) || 0;
}
function markSeen(uid, route, version) {
  const all = readJson(SEEN_KEY);
  all[uid] = { ...(all[uid] || {}), [route]: Math.max(version, seenVersion(uid, route)) };
  writeJson(SEEN_KEY, all);
}
const hintShown = (uid) => Boolean(readJson(HINT_KEY)[uid]);
function markHint(uid) {
  const all = readJson(HINT_KEY);
  all[uid] = true;
  writeJson(HINT_KEY, all);
}

/**
 * Interruptor para no mostrar el punto ni el globo en este navegador (grabaciones
 * de demostracion). La guia se sigue abriendo con el boton.
 * Se enciende con: localStorage.setItem('cs_tour_off', '1')
 */
function tourApagado() {
  try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const DEV = Boolean(import.meta.env.DEV); // Vite lo reemplaza por false en el bundle
const media = (query) => {
  try { return window.matchMedia(query).matches; } catch { return false; }
};
/** Celular: el menu lateral pasa a cajon (mismo corte que main.css). */
const isMobile = () => media('(max-width: 768px)');
/** Hoja inferior en vez de tarjeta flotante. */
const isSheet = () => media('(max-width: 640px)');
const reducedMotion = () => media('(prefers-reduced-motion: reduce)');

/** Texto comparable: sin tildes, en minusculas y con espacios simples. */
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Ventanas que, abiertas, impiden abrir la guia con la tecla ?. */
const OPEN_MODAL = [
  '.modal-overlay.is-open', '.cst-modal-overlay.is-open', '.drawer-overlay.is-open',
  '.info-modal-overlay.is-open', '.cmd-overlay.is-open', '.modal.is-open',
].join(', ');

/** true si hay un modal, cajon o buscador abierto. */
export function hasOpenModal() {
  return Boolean(document.querySelector(OPEN_MODAL));
}

function isVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  if (r.right <= 0 || r.left >= window.innerWidth) return false; // ej. menu lateral oculto en el celular
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** El elemento (o un ancestro) esta fijo en pantalla: no se puede desplazar hasta el. */
function isPinned(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const pos = getComputedStyle(node).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Buscar la zona de cada paso
// ---------------------------------------------------------------------------

const HEADINGS = '.panel__title, .page-title, .nr-section__header, h2, h3, summary';

/** Primer encabezado VISIBLE que coincide (exacto > empieza por > contiene). */
function findByHeading(text) {
  const app = document.getElementById('app');
  if (!app) return null;
  const needle = norm(text);
  const heads = [...app.querySelectorAll(HEADINGS)].filter(isVisible);
  const texts = heads.map((h) => norm(h.textContent));
  let i = texts.findIndex((t) => t === needle);
  if (i < 0) i = texts.findIndex((t) => t.startsWith(needle));
  if (i < 0) i = texts.findIndex((t) => t.includes(needle));
  if (i < 0) return null;
  const head = heads[i];
  const box = head.closest('.panel, .doctor-status-floating')
    || head.closest('section, article, .card, details')
    || head;
  return isVisible(box) ? box : null;
}

function findTarget(step) {
  try {
    if (typeof step.find === 'function') {
      const el = step.find();
      return isVisible(el) ? el : null;
    }
    if (step.panel) return findByHeading(step.panel);
    if (step.sel) {
      for (const part of step.sel.split(',')) {
        for (const el of document.querySelectorAll(part.trim())) {
          if (!el.closest('.cs-guide') && isVisible(el)) return el;
        }
      }
    }
  } catch { /* selector invalido: el paso se salta */ }
  return null;
}

/** Aplica la variante de celular del paso (si la tiene). */
const forDevice = (step) => (isMobile() && step.mobile ? { ...step, ...step.mobile } : step);
const hasZone = (step) => Boolean(step.sel || step.panel || step.find);

/**
 * locate(): la zona de un paso ahora mismo.
 * @returns {{ step: object, el: Element|null } | null} null = el paso se salta.
 */
function locate(step) {
  const options = [step, ...(step.variants || [])].map(forDevice);
  for (const option of options) {
    if (!hasZone(option)) return { step: option, el: null };
    const el = findTarget(option);
    if (el) return { step: option, el };
  }
  return null;
}

const zoneLabel = (step) => {
  const s = forDevice(step);
  if (s.panel) return `panel «${s.panel}»`;
  if (s.sel) return s.sel;
  return s.find ? 'find()' : 'centrado';
};

// ---------------------------------------------------------------------------
// Definicion de la guia de una ruta (formato nuevo, viejo o automatica)
// ---------------------------------------------------------------------------

function pageName() {
  const app = document.getElementById('app');
  const title = app && [...app.querySelectorAll('.page-title')].find(isVisible);
  if (!title) return '';
  // Sin el saludo de los paneles ("Buenas noches, ...").
  const copy = title.cloneNode(true);
  copy.querySelectorAll('.page-title__greet').forEach((n) => n.remove());
  return clean(copy.textContent);
}

function pageSubtitle() {
  const app = document.getElementById('app');
  const sub = app && [...app.querySelectorAll('.page-subtitle')].find(isVisible);
  return clean(sub?.textContent);
}

/** Guia armada con lo que hay en pantalla, para rutas sin entrada en TOURS. */
function autoTour() {
  const name = pageName() || 'Esta página';
  const app = document.getElementById('app');
  const seen = new Set();
  const steps = [];
  for (const head of app ? app.querySelectorAll('.content .panel__title') : []) {
    const title = clean(head.textContent);
    const key = norm(title);
    if (!title || seen.has(key) || !isVisible(head)) continue;
    seen.add(key);
    steps.push({ panel: title, title, text: `La sección «${title}» de esta página.` });
    if (steps.length >= 8) break;
  }
  return {
    version: 1,
    title: name,
    auto: true,
    intro: {
      que: pageSubtitle() || `La página «${name}» del portal.`,
      para: 'Consultar y gestionar la información de esta parte del portal.',
      como: steps.length
        ? 'Toca «Ver sección por sección» y te mostramos cada parte, una por una.'
        : 'Revisa la información de arriba abajo; los botones de cada bloque hacen lo que dicen.',
    },
    steps,
  };
}

function getTourDef(route) {
  const raw = TOURS[route];
  if (!raw) return null;
  if (Array.isArray(raw)) return { version: 1, title: '', intro: null, steps: raw };
  return {
    version: Number(raw.version) || 1,
    title: raw.title || '',
    intro: raw.intro || null,
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    noGuideStep: Boolean(raw.noGuideStep),
  };
}

// ---------------------------------------------------------------------------
// Iconos (trazo, heredan el color)
// ---------------------------------------------------------------------------

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${d}</svg>`;
const ICON = {
  guide: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.3a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.5-2.7 4.2"/><path d="M12 17.6h.01"/>'),
  what: svg('<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9h17"/><path d="M8 13.5h8M8 16.5h5"/>'),
  why: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'),
  how: svg('<path d="M9 11V5.8a1.8 1.8 0 0 1 3.6 0V11"/><path d="M12.6 10.2V9a1.8 1.8 0 0 1 3.6 0v2"/><path d="M16.2 10.6a1.8 1.8 0 0 1 3.3 1v2.6a6.8 6.8 0 0 1-6.8 6.8h-1.1a5.5 5.5 0 0 1-4-1.7l-3-3.2a1.8 1.8 0 0 1 2.6-2.5L9 15.8"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  prev: svg('<path d="m14.5 6-6 6 6 6"/>'),
  next: svg('<path d="m9.5 6 6 6-6 6"/>'),
};

// ---------------------------------------------------------------------------
// Motor de la guia
// ---------------------------------------------------------------------------

let active = null;               // guia abierta
let current = { route: '', user: null }; // pagina que se esta viendo (para el boton)

/** true mientras la guia esta abierta. */
export function isGuideOpen() {
  return Boolean(active);
}

const minutes = (n) => {
  const m = Math.max(1, Math.round((n * 8) / 60));
  return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
};

function introHtml(meta) {
  const block = (icon, tone, title, text) => `
    <div class="cs-guide__block cs-guide__block--${tone}">
      <span class="cs-guide__block-icon">${icon}</span>
      <div>
        <h3 class="cs-guide__block-title">${title}</h3>
        <p class="cs-guide__block-text">${escapeHtml(text)}</p>
      </div>
    </div>`;
  return `
    <header class="cs-guide__hero">
      <span class="cs-guide__hero-badge">${ICON.guide}</span>
      <div class="cs-guide__hero-text">
        <p class="cs-guide__eyebrow">Guía de esta página</p>
        <h2 class="cs-guide__title" id="cs-guide-title">${escapeHtml(meta.title)}</h2>
      </div>
    </header>
    <div class="cs-guide__intro" id="cs-guide-text">
      ${block(ICON.what, 'what', 'Qué es esta página', meta.intro.que)}
      ${block(ICON.why, 'why', 'Para qué sirve', meta.intro.para)}
      ${block(ICON.how, 'how', 'Cómo se usa', meta.intro.como)}
    </div>
    <p class="cs-guide__meta">${ICON.clock}<span>${meta.total} ${meta.total === 1 ? 'sección' : 'secciones'} · ${minutes(meta.total)}</span></p>`;
}

function stepHtml(meta, step, index) {
  return `
    <p class="cs-guide__head">
      <span class="cs-guide__count">${index} / ${meta.total}</span>
      <span class="cs-guide__page">${escapeHtml(meta.title)}</span>
    </p>
    <h2 class="cs-guide__title" id="cs-guide-title">${escapeHtml(step.title || '')}</h2>
    <p class="cs-guide__text" id="cs-guide-text">${escapeHtml(step.text || '')}</p>`;
}

/** Reinicia una animacion CSS de entrada (quita y vuelve a poner la clase). */
function replay(el, ...classes) {
  el.classList.remove('is-enter', 'is-fwd', 'is-back');
  void el.offsetWidth; // fuerza el reflujo para que la animacion vuelva a correr
  el.classList.add(...classes);
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Posicion del hueco y de la tarjeta para la zona actual.
 * Sin zona: hueco de tamano cero en el centro (asi, al pasar de la intro al
 * primer paso, el hueco "se abre" desde el centro).
 */
function computeLayout(a) {
  const W = document.documentElement.clientWidth || window.innerWidth;
  const H = window.innerHeight;
  const { card } = a;
  const sheet = isSheet();
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const target = a.target && a.target.isConnected ? a.target : null;
  const pad = sheet ? 4 : 6;

  // Hoja inferior: arriba si la zona fija esta en la mitad baja (ej. el boton +).
  let sheetTop = false;
  if (sheet && target) {
    const r = target.getBoundingClientRect();
    sheetTop = isPinned(target) && r.top + r.height / 2 > H / 2;
  }
  a.root.classList.toggle('is-sheet-top', sheetTop);

  if (!target) {
    return {
      spot: { top: H / 2, left: W / 2, width: 0, height: 0 },
      card: sheet ? null : { top: Math.max(16, (H - ch) / 2), left: Math.max(12, (W - cw) / 2) },
    };
  }

  const r = target.getBoundingClientRect();
  let top = r.top - pad;
  let left = r.left - pad;
  let width = r.width + pad * 2;
  let height = r.height + pad * 2;
  // El hueco no pasa debajo de la hoja (ni la hoja lo tapa).
  const minTop = sheet && sheetTop ? ch + 24 : 4;
  const maxBottom = sheet && !sheetTop ? H - ch - 24 : H - 4;
  if (top < minTop) { height -= minTop - top; top = minTop; }
  if (top + height > maxBottom) height = maxBottom - top;
  if (left < 0) { width += left; left = 0; }
  if (left + width > W) width = W - left;
  // El borde del hueco copia la redondez de la zona (+ el margen), y queda
  // recto en los lados que tocan el borde de la pantalla (ej. el menu lateral).
  const base = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
  const rad = base ? base + pad : 8;
  const atLeft = left <= 1;
  const atRight = left + width >= W - 1;
  const atTop = top <= minTop + 1 && r.top - pad < minTop;
  const atBottom = top + height >= maxBottom - 1 && r.bottom + pad > maxBottom;
  const radius = [
    atTop || atLeft ? 0 : rad,
    atTop || atRight ? 0 : rad,
    atBottom || atRight ? 0 : rad,
    atBottom || atLeft ? 0 : rad,
  ].map((v) => `${v}px`).join(' ');
  const spot = { top, left, width: Math.max(0, width), height: Math.max(0, height), radius };
  if (sheet) return { spot, card: null };

  // Tarjeta: debajo, encima, a la derecha o a la izquierda de la zona; si no
  // cabe en ninguna parte, en la esquina inferior derecha.
  const gap = 14;
  const m = 12;
  const clampX = (x) => Math.min(Math.max(m, x), W - cw - m);
  const clampY = (y) => Math.min(Math.max(m, y), H - ch - m);
  const bottom = spot.top + spot.height;
  const right = spot.left + spot.width;
  let pos;
  if (bottom + gap + ch <= H - m) pos = { top: bottom + gap, left: clampX(spot.left) };
  else if (spot.top - gap - ch >= m) pos = { top: spot.top - gap - ch, left: clampX(spot.left) };
  else if (right + gap + cw <= W - m) pos = { top: clampY(spot.top), left: right + gap };
  else if (spot.left - gap - cw >= m) pos = { top: clampY(spot.top), left: spot.left - gap - cw };
  else pos = { top: H - ch - 20, left: W - cw - 20 };
  return { spot, card: pos };
}

function applyLayout(a, L) {
  const [dTop, dBottom, dLeft, dRight] = a.dims;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const { top, left, width, height } = L.spot;
  const box = (el, t, l, w, h) => {
    el.style.top = `${t}px`;
    el.style.left = `${l}px`;
    el.style.width = `${Math.max(0, w)}px`;
    el.style.height = `${Math.max(0, h)}px`;
  };
  // Capa oscura en cuatro piezas alrededor del hueco.
  box(dTop, 0, 0, W, top);
  box(dBottom, top + height, 0, W, H - top - height);
  box(dLeft, top, 0, left, height);
  box(dRight, top, left + width, W - left - width, height);
  box(a.spot, top, left, width, height);
  a.spot.style.borderRadius = L.spot.radius || '';
  a.spot.classList.toggle('is-empty', width < 2 || height < 2);
  if (L.card) {
    a.card.style.top = `${L.card.top}px`;
    a.card.style.left = `${L.card.left}px`;
  } else {
    a.card.style.top = '';
    a.card.style.left = '';
  }
  a.layout = L;
}

/**
 * Desliza hueco y tarjeta desde donde estaban hasta la zona nueva. Cada cuadro
 * se mide la zona EN VIVO, asi el deslizamiento acompana el desplazamiento
 * suave de la pagina y termina justo sobre la zona.
 */
function animateTo(a, { moveCard }) {
  cancelAnimationFrame(a.raf);
  const from = a.layout;
  const duration = !from || reducedMotion() ? 0 : 460;
  const t0 = performance.now();
  a.tweening = duration > 0;
  a.spot.classList.remove('is-landed');
  const frame = (now) => {
    if (active !== a) return;
    const live = computeLayout(a);
    const k = duration ? Math.min(1, (now - t0) / duration) : 1;
    if (k < 1) {
      const e = ease(k);
      const s = {
        top: lerp(from.spot.top, live.spot.top, e),
        left: lerp(from.spot.left, live.spot.left, e),
        width: lerp(from.spot.width, live.spot.width, e),
        height: lerp(from.spot.height, live.spot.height, e),
        radius: live.spot.radius,
      };
      const c = moveCard && from.card && live.card
        ? { top: lerp(from.card.top, live.card.top, e), left: lerp(from.card.left, live.card.left, e) }
        : live.card;
      applyLayout(a, { spot: s, card: c });
      a.raf = requestAnimationFrame(frame);
      return;
    }
    a.tweening = false;
    applyLayout(a, live);
    if (a.target && !reducedMotion()) a.spot.classList.add('is-landed');
  };
  a.raf = requestAnimationFrame(frame);
}

/** Desplaza la pagina para que la zona quede a la vista (bajo la barra superior). */
function bringIntoView(a, el) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const H = window.innerHeight;
  const sheet = isSheet();
  const ch = a.card.offsetHeight;
  // Zonas fijas o pegadas (barra superior, boton +): solo se desplaza si de
  // verdad quedaron fuera de la pantalla (en el celular la barra no se pega).
  if (isPinned(el)) {
    if (r.top >= 0 && r.bottom <= H) return;
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 8), behavior: reducedMotion() ? 'auto' : 'smooth' });
    return;
  }
  const nav = document.querySelector('.navbar');
  const navBottom = nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0;
  const top = navBottom + 12;
  const bottom = sheet ? H - ch - 30 : H - 16;
  const avail = bottom - top;
  if (r.top >= top && r.bottom <= bottom && (sheet || r.bottom + ch + 28 <= H || r.top - ch - 28 >= 0)) return;
  let delta;
  if (!sheet && r.height + ch + 28 <= avail) delta = r.top - (top + (avail - (r.height + ch + 28)) / 2);
  else if (r.height <= avail) delta = r.top - (top + (avail - r.height) / 2);
  else delta = r.top - top;
  if (Math.abs(delta) < 2) return;
  window.scrollTo({ top: window.scrollY + delta, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function show(a, index, { dir = 1 } = {}) {
  const prevMode = a.root.dataset.mode;
  a.index = index;
  const isIntro = index === 0;
  const entry = isIntro ? null : a.steps[index - 1];
  const hit = entry ? locate(entry) : null;
  const step = hit?.step || (entry ? forDevice(entry) : null);
  a.target = hit?.el || null;
  a.root.dataset.mode = isIntro ? 'intro' : 'step';

  // Contenido
  a.body.innerHTML = isIntro ? introHtml(a.meta) : stepHtml(a.meta, step, index);
  a.card.setAttribute('aria-describedby', 'cs-guide-text');
  a.live.textContent = isIntro
    ? `Guía de ${a.meta.title}. ${a.meta.total} secciones.`
    : `${step.title}, sección ${index} de ${a.meta.total}`;

  // Navegacion
  a.prev.hidden = isIntro;
  a.dismiss.hidden = !isIntro;
  const last = index === a.meta.total;
  a.nextLabel.textContent = isIntro ? 'Ver sección por sección' : last ? 'Entendido' : 'Siguiente';
  a.nextIcon.hidden = last && !isIntro;
  if (isIntro && document.activeElement === a.prev) a.next.focus({ preventScroll: true });
  a.progress.style.transform = `scaleX(${a.meta.total ? index / a.meta.total : 0})`;
  a.dotButtons.forEach((dot, i) => {
    dot.classList.toggle('is-done', i < index);
    dot.classList.toggle('is-current', i === index);
    if (i === index) dot.setAttribute('aria-current', 'step');
    else dot.removeAttribute('aria-current');
  });

  // Animaciones: la tarjeta entra de nuevo si cambia de modo; si no, solo su
  // contenido se funde y se desplaza en la direccion del paso.
  const modeChanged = prevMode !== a.root.dataset.mode;
  if (modeChanged) replay(a.card, 'is-enter');
  else replay(a.body, dir < 0 ? 'is-back' : 'is-fwd');

  requestAnimationFrame(() => {
    if (active !== a) return;
    bringIntoView(a, a.target);
    animateTo(a, { moveCard: !modeChanged });
  });
}

function go(a, index, dir) {
  const next = Math.min(Math.max(0, index), a.meta.total);
  if (next === a.index) return;
  show(a, next, { dir: dir ?? (next > a.index ? 1 : -1) });
}

function closeTour({ immediate = false, restoreFocus = true } = {}) {
  const a = active;
  if (!a) return;
  active = null;
  cancelAnimationFrame(a.raf);
  window.removeEventListener('keydown', a.onKey, true);
  window.removeEventListener('resize', a.onReflow);
  window.removeEventListener('scroll', a.onReflow, true);
  document.removeEventListener('focusin', a.onFocusIn, true);
  document.documentElement.classList.remove('cs-guide-open');
  if (restoreFocus) {
    const back = document.querySelector('.navbar__guide') || (a.returnFocus?.isConnected ? a.returnFocus : null);
    back?.focus({ preventScroll: true });
  }
  if (immediate || reducedMotion()) {
    a.root.remove();
    return;
  }
  a.root.classList.remove('is-in');
  a.root.classList.add('is-out');
  setTimeout(() => a.root.remove(), 220);
}

/**
 * startTour() / openGuide()
 * Abre la guia de la pagina actual en su tarjeta de introduccion.
 * @param {string} route - patron de ruta (clave de TOURS).
 * @param {object} user  - usuario de la sesion (para el punto "ya visto").
 * @param {{ returnFocus?: Element }} [opts]
 * @returns {boolean} true si se abrio.
 */
export function startTour(route, user, { returnFocus = null } = {}) {
  closeTour({ immediate: true, restoreFocus: false });
  document.querySelector('.guide-hint')?.remove();
  const def = getTourDef(route) || autoTour();
  const title = def.title || pageName() || 'Esta página';
  const intro = def.intro || autoTour().intro;

  // Solo los pasos cuya zona existe ahora (los demas se saltan).
  const all = def.noGuideStep ? def.steps : [...def.steps, GUIDE_STEP];
  const steps = all.filter((step) => {
    if (locate(step)) return true;
    if (DEV && !step.optional) {
      console.warn(`[Guía] ${route}: se salta «${forDevice(step).title}» porque no se encontró su zona (${zoneLabel(step)}).`);
    }
    return false;
  });
  if (!steps.length && !intro) return false;

  const uid = userKey(user);
  markSeen(uid, route, def.version || 1);
  markHint(uid);
  const dotEl = document.querySelector('.navbar__guide-dot');
  if (dotEl) dotEl.hidden = true;
  document.querySelector('.navbar__guide')?.classList.remove('has-news');

  const total = steps.length;
  const root = document.createElement('div');
  root.className = 'cs-guide';
  root.dataset.mode = ''; // el primer show() cuenta como cambio de modo: la tarjeta entra
  root.innerHTML = `
    <div class="cs-guide__dim"></div><div class="cs-guide__dim"></div><div class="cs-guide__dim"></div><div class="cs-guide__dim"></div>
    <div class="cs-guide__spot" aria-hidden="true"></div>
    <section class="cs-guide__card" role="dialog" aria-modal="true" aria-labelledby="cs-guide-title" aria-describedby="cs-guide-text" tabindex="-1">
      <div class="cs-guide__progress" aria-hidden="true"><span></span></div>
      <button type="button" class="cs-guide__close" data-guide="close" aria-label="Cerrar guía">${ICON.close}</button>
      <div class="cs-guide__body"></div>
      <p class="cs-guide__sr" aria-live="polite" aria-atomic="true"></p>
      <div class="cs-guide__footer">
        <div class="cs-guide__dots" role="group" aria-label="Pasos de la guía">
          ${['Introducción', ...steps.map((s) => forDevice(s).title)].map((t, i) => `
            <button type="button" class="cs-guide__dot" data-go="${i}" aria-label="${i === 0 ? 'Ir a la introducción' : `Ir al paso ${i}: ${escapeHtml(t || '')}`}"></button>`).join('')}
        </div>
        <div class="cs-guide__nav">
          <button type="button" class="cs-guide__prev" data-guide="prev" aria-label="Paso anterior">${ICON.prev}</button>
          <button type="button" class="btn btn--ghost cs-guide__dismiss" data-guide="close">Cerrar</button>
          <button type="button" class="btn btn--primary cs-guide__next" data-guide="next"><span class="cs-guide__next-label">Siguiente</span><span class="cs-guide__next-icon">${ICON.next}</span></button>
        </div>
      </div>
    </section>`;
  document.body.appendChild(root);

  const a = {
    root,
    route,
    steps,
    meta: { title, intro, total },
    index: 0,
    target: null,
    layout: null,
    raf: 0,
    tweening: false,
    returnFocus: returnFocus || document.activeElement,
    dims: [...root.querySelectorAll('.cs-guide__dim')],
    spot: root.querySelector('.cs-guide__spot'),
    card: root.querySelector('.cs-guide__card'),
    body: root.querySelector('.cs-guide__body'),
    live: root.querySelector('.cs-guide__sr'),
    progress: root.querySelector('.cs-guide__progress span'),
    prev: root.querySelector('[data-guide="prev"]'),
    dismiss: root.querySelector('.cs-guide__dismiss'),
    next: root.querySelector('[data-guide="next"]'),
    nextLabel: root.querySelector('.cs-guide__next-label'),
    nextIcon: root.querySelector('.cs-guide__next-icon'),
    dotButtons: [...root.querySelectorAll('.cs-guide__dot')],
  };

  root.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-go]');
    if (dot) { go(a, Number(dot.dataset.go)); return; }
    const action = event.target.closest('[data-guide]')?.dataset.guide;
    if (action === 'close') closeTour();
    if (action === 'prev') go(a, a.index - 1, -1);
    if (action === 'next') {
      if (a.index >= a.meta.total) closeTour();
      else go(a, a.index + 1, 1);
    }
  });

  // Teclado: flechas, Enter, Inicio/Fin, Escape y foco atrapado en la tarjeta.
  a.onKey = (event) => {
    if (active !== a) return;
    const onButton = event.target.closest?.('button, a, input, select, textarea');
    switch (event.key) {
      case 'Escape': event.preventDefault(); closeTour(); break;
      case 'ArrowRight':
        event.preventDefault();
        if (a.index >= a.meta.total) closeTour(); else go(a, a.index + 1, 1);
        break;
      case 'ArrowLeft': event.preventDefault(); go(a, a.index - 1, -1); break;
      case 'Home': event.preventDefault(); go(a, 0, -1); break;
      case 'End': event.preventDefault(); go(a, a.meta.total, 1); break;
      case 'Enter':
        if (onButton) return; // el boton enfocado hace lo suyo
        event.preventDefault();
        if (a.index >= a.meta.total) closeTour(); else go(a, a.index + 1, 1);
        break;
      case 'Tab': {
        const items = [...a.card.querySelectorAll('button:not([hidden]):not([disabled])')]
          .filter((b) => b.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        const inside = a.card.contains(document.activeElement);
        if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); lastItem.focus(); }
        else if (!event.shiftKey && (document.activeElement === lastItem || !inside)) { event.preventDefault(); first.focus(); }
        break;
      }
      default:
    }
  };
  a.onFocusIn = (event) => {
    if (active === a && !a.card.contains(event.target)) a.next.focus({ preventScroll: true });
  };
  let pending = false;
  a.onReflow = () => {
    if (pending || a.tweening) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (active === a && !a.tweening) applyLayout(a, computeLayout(a));
    });
  };
  window.addEventListener('keydown', a.onKey, true);
  window.addEventListener('resize', a.onReflow);
  window.addEventListener('scroll', a.onReflow, true);
  document.addEventListener('focusin', a.onFocusIn, true);

  active = a;
  document.documentElement.classList.add('cs-guide-open');
  show(a, 0);
  applyLayout(a, computeLayout(a));
  a.next.focus({ preventScroll: true });
  // La capa oscura entra con fundido (el cuadro siguiente activa la transicion).
  requestAnimationFrame(() => root.classList.add('is-in'));
  return true;
}

/** Alias con nombre claro para otros modulos. */
export const openGuide = startTour;

/** Cierra la guia abierta sin mover el foco (al cambiar de pagina). */
export function stopTour() {
  closeTour({ immediate: true, restoreFocus: false });
  clearTimeout(hintTimers.show);
  clearTimeout(hintTimers.hide);
}

// ---------------------------------------------------------------------------
// Boton «Guía»: punto azul y globo de primera vez
// ---------------------------------------------------------------------------

const hintTimers = { show: 0, hide: 0 };

function removeHint() {
  clearTimeout(hintTimers.hide);
  const hint = document.querySelector('.guide-hint');
  if (!hint) return;
  if (reducedMotion()) { hint.remove(); return; }
  hint.classList.add('is-out');
  setTimeout(() => hint.remove(), 200);
}

function showHint(uid) {
  const btn = document.querySelector('.navbar__guide');
  const host = btn?.closest('.navbar__right');
  if (!btn || !host || !isVisible(btn) || active || hasOpenModal() || hintShown(uid)) return;
  markHint(uid);
  const hint = document.createElement('div');
  hint.className = 'guide-hint';
  hint.setAttribute('role', 'status');
  hint.innerHTML = isMobile()
    ? '<strong>¿Primera vez aquí?</strong> Toca este botón y te mostramos esta página.'
    : '<strong>¿Primera vez aquí?</strong> Toca <b>Guía</b> y te mostramos esta página.';
  host.appendChild(hint);
  // La flecha del globo apunta al centro del boton.
  const hostRect = host.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const right = Math.max(0, hostRect.right - btnRect.right);
  hint.style.right = `${right}px`;
  hint.style.setProperty('--arrow-right', `${btnRect.width / 2 - 7}px`);
  const dismiss = () => {
    document.removeEventListener('pointerdown', dismiss, true);
    document.removeEventListener('keydown', dismiss, true);
    removeHint();
  };
  document.addEventListener('pointerdown', dismiss, true);
  document.addEventListener('keydown', dismiss, true);
  hintTimers.hide = setTimeout(dismiss, 8000);
}

/**
 * updateGuideButton()
 * Lo llama el router tras pintar cada pagina con barra superior. NO abre nada:
 * enciende el punto azul si esta pagina (o su version) no se ha visto y, una
 * sola vez por usuario, muestra el globo «¿Primera vez aquí?».
 */
export function updateGuideButton(route, user) {
  current = { route, user };
  clearTimeout(hintTimers.show);
  clearTimeout(hintTimers.hide);
  const btn = document.querySelector('.navbar__guide');
  if (!btn || !user) return;
  const uid = userKey(user);
  const off = tourApagado();
  const version = getTourDef(route)?.version || 1;
  const news = !off && seenVersion(uid, route) < version;
  const dot = btn.querySelector('.navbar__guide-dot');
  if (dot) dot.hidden = !news;
  btn.classList.toggle('has-news', news);
  btn.setAttribute('aria-label', news ? 'Guía de esta página (nueva)' : 'Guía de esta página');
  if (!off && !hintShown(uid)) {
    hintTimers.show = setTimeout(() => showHint(uid), 900);
  }
}

// ---------------------------------------------------------------------------
// Verificacion (scripts/verificar-guias.mjs)
// ---------------------------------------------------------------------------

/**
 * auditGuide()
 * Revisa, sin abrir nada, que zonas de la guia de una ruta se encuentran en la
 * pantalla actual. Lo usa scripts/verificar-guias.mjs.
 * @returns {{ route, hasTour, version, steps: Array<{ title, zone, found, optional }> }}
 */
export function auditGuide(route = current.route) {
  const def = getTourDef(route);
  const tour = def || autoTour();
  const all = tour.noGuideStep ? tour.steps : [...tour.steps, GUIDE_STEP];
  return {
    route,
    hasTour: Boolean(def),
    version: tour.version || 1,
    steps: all.map((step) => ({
      title: forDevice(step).title,
      zone: zoneLabel(step),
      found: Boolean(locate(step)),
      optional: step.optional || false,
    })),
  };
}

// Solo en desarrollo: la instancia que usa la app (con lo registrado mediante
// registerTours) queda a mano para scripts/verificar-guias.mjs.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__csGuide = { TOURS, auditGuide };
}
