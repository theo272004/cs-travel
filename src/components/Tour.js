/**
 * Tour.js
 * =============================================================================
 * PROPOSITO:
 *   Recorrido guiado de cada pagina del portal (administrador, empresa y
 *   medico). La primera vez que una persona entra a una pagina se le muestra
 *   un paso a paso corto que resalta cada zona y explica para que sirve. Se
 *   puede repetir cuando quiera desde el menu de perfil ("Ver recorrido").
 *
 * COMO FUNCIONA:
 *   - TOURS: pasos por ruta (el patron del router, ej. '#/admin/requests/:id').
 *   - Cada paso apunta a una zona con `sel` (selector CSS; si hay varios
 *     separados por coma, gana el primero visible) o con `panel` (el panel cuyo
 *     titulo contiene ese texto: sobrevive a cambios de maquetacion).
 *   - Si la zona no existe o no se ve (ej. el menu lateral en el celular), el
 *     paso se salta. Un paso sin zona se muestra centrado.
 *   - "Ya visto" se guarda por usuario y por pagina en el navegador. Si el
 *     navegador no deja guardar, el recorrido simplemente vuelve a salir.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

// ---------------------------------------------------------------------------
// Pasos por pagina
// ---------------------------------------------------------------------------

const SIDEBAR = { sel: '.sidebar', title: 'Menú principal', text: 'Desde aquí te mueves por todas las secciones del portal. La sección en la que estás queda resaltada.' };
const SEARCH = { sel: '.navbar__search-float', title: 'Buscador', text: 'Encuentra cualquier solicitud, caso, empresa o médico escribiendo su nombre o código.' };
const BELL = { sel: '.navbar__icon-float--notify', title: 'Notificaciones', text: 'Aquí te avisamos de cambios importantes. El punto rojo indica que tienes algo nuevo.' };
const PROFILE = { sel: '.profile-menu__trigger', title: 'Tu perfil', text: 'Cambia tu contraseña, activa la verificación en dos pasos, repite este recorrido o cierra sesión.' };
const FAB = { sel: '.fab', title: 'Crear rápido', text: 'Este botón abre un formulario corto para crear una nueva solicitud en segundos.' };

export const TOURS = {
  // ----------------------------- ADMINISTRADOR -----------------------------
  '#/admin/dashboard': [
    { title: 'Bienvenido a tu panel', text: 'Te mostramos en un minuto cómo está organizado el portal. Puedes saltar el recorrido cuando quieras.' },
    SIDEBAR,
    { panel: 'Cola de trabajo', title: 'Cola de trabajo', text: 'Lo que requiere tu acción hoy, ordenado por urgencia. Haz clic en una fila para ver el detalle sin salir del panel.' },
    { panel: 'Ingreso CS Travel', title: 'Ingresos por empresa', text: 'Cuánto genera cada cliente. Usa las flechas para recorrer el listado completo.' },
    { panel: 'Estado de la operacion', title: 'Estado de la operación', text: 'Cuántas solicitudes y casos hay en cada etapa del proceso.' },
    { panel: 'Solicitudes recientes', title: 'Lo más reciente', text: 'Las últimas solicitudes que entraron, con acceso directo a cada una.' },
    SEARCH, BELL, PROFILE,
  ],
  '#/admin/requests': [
    { sel: '.page-title', title: 'Operaciones', text: 'Todas las solicitudes de empresas y los casos médicos en un solo lugar.' },
    { sel: '#req-search, .table-toolbar', title: 'Buscar y filtrar', text: 'Filtra por estado o escribe un código, empresa o destino para encontrarla rápido.' },
    { sel: '#req-table, .table-wrapper', title: 'Listado', text: 'Haz clic en cualquier fila para abrir la solicitud, cotizarla y cambiar su estado.' },
  ],
  '#/admin/requests/:id': [
    { panel: 'Datos del viaje', title: 'Datos del viaje', text: 'Lo que pidió el cliente: ruta, fechas, pasajeros y tipo de servicio.' },
    { panel: 'Costos y beneficios', title: 'Costos y beneficios', text: 'El costo del viaje y el retorno que genera para la empresa aliada.' },
    { panel: 'Gestion', title: 'Gestión', text: 'Aquí actualizas el estado, cargas la cotización y dejas notas para el cliente.' },
  ],
  '#/admin/medical-cases': [
    { sel: '.page-title', title: 'Casos médicos', text: 'Todos los casos que envían los médicos aliados.' },
    { sel: '.table-toolbar', title: 'Buscar y filtrar', text: 'Encuentra un caso por paciente, código o estado.' },
    { sel: '.table-wrapper', title: 'Listado', text: 'Abre un caso para cotizar la logística y acompañar al paciente.' },
  ],
  '#/admin/medical-cases/:id': [
    { panel: 'Datos del paciente', title: 'Datos del caso', text: 'La información del paciente y del viaje que envió el médico.' },
    { panel: 'Cotización', title: 'Cotización', text: 'Arma aquí la cotización logística; el médico la ve y la aprueba desde su panel.' },
  ],
  '#/admin/kanban': [
    { sel: '.page-title', title: 'Seguimiento operativo', text: 'Cada tarjeta es una solicitud o caso, en la columna de su estado.' },
    { sel: '#kanban-search, .toolbar--kanban', title: 'Filtrar el tablero', text: 'Busca una tarjeta o filtra por tipo para concentrarte.' },
    { sel: '#kanban-board, .kanban-board', title: 'Arrastra para avanzar', text: 'Arrastra una tarjeta a otra columna para cambiar su estado. En el celular usa el selector de cada tarjeta.' },
  ],
  '#/admin/quotes': [
    { sel: '.page-title', title: 'Cotizaciones', text: 'Crea cotizaciones profesionales en PDF con tu marca.' },
    { panel: 'Cotizaciones pendientes', title: 'Pendientes', text: 'Solicitudes que esperan una cotización. Empieza por aquí.' },
    { sel: '#qb-toggle', title: 'Nueva cotización', text: 'Abre el formulario para armar una cotización desde cero.' },
    { panel: 'Cotizaciones guardadas', title: 'Guardadas', text: 'Tus cotizaciones anteriores, para descargarlas o reutilizarlas.' },
  ],
  '#/admin/codes': [
    { sel: '.page-title', title: 'Códigos', text: 'Códigos de referido y de descuento para empresas y médicos aliados.' },
    { sel: '#toggle-create', title: 'Crear código', text: 'Crea un código nuevo y asígnalo a su dueño.' },
    { sel: '#code-search, .table-toolbar', title: 'Buscar', text: 'Encuentra un código o filtra los activos e inactivos.' },
    { sel: '#codes-table', title: 'Listado', text: 'Activa, desactiva o copia cada código desde aquí.' },
  ],
  '#/admin/users': [
    { sel: '.page-title', title: 'Usuarios', text: 'Todas las cuentas del portal: administradores, empresas y médicos.' },
    { sel: '.table-toolbar', title: 'Buscar y filtrar', text: 'Filtra por rol o estado, o busca por nombre o correo.' },
    { sel: '#users-table', title: 'Listado', text: 'Abre un usuario para ver su actividad, editarlo o desactivarlo.' },
  ],
  '#/admin/payments': [
    { sel: '.qb-page-hero', title: 'Cobros y links de pago', text: 'Cuánto está pendiente, cuánto se cobró y qué falta facturar.' },
    { sel: '#toggle-create', title: 'Nuevo cobro', text: 'Crea un cobro con concepto y valor. Te damos un código corto y un enlace para enviarle al cliente.' },
    { sel: '#charge-rows', title: 'Seguimiento', text: 'El estado de cada cobro. Copia el enlace, confirma una transferencia o anúlalo.' },
  ],
  '#/admin/allies': [
    { sel: '.qb-page-hero', title: 'Solicitudes de aliados', text: 'Las empresas que pidieron acceso en /aliados. El contador rojo te avisa de seguimientos vencidos.' },
    { sel: '.table-toolbar', title: 'Filtros', text: 'Filtra por estado, origen, fechas, responsable o contactos sin actividad. Exporta todo a Excel con «Exportar CSV».' },
    { sel: '.ally-mode', title: 'Lista o tablero', text: 'Cambia a «Tablero» para mover a los prospectos entre etapas arrastrándolos.' },
    { sel: '#ally-list, #ally-board', title: 'Ficha de cada aliado', text: 'Haz clic en uno para llamarlo, dejar notas, programar la siguiente acción, aprobarlo y activar su código y QR.' },
  ],
  '#/admin/banners': [
    { sel: '.qb-page-hero', title: 'Banners de promociones', text: 'La franja que aparece en Inicio, Empresas y Médicos. Aquí ves cuántos están en línea, programados o vencidos.' },
    { sel: '#bn-toggle', title: 'Nuevo banner', text: 'Sube la imagen de escritorio y la de celular, el enlace y las fechas. Se publica y se retira sola.' },
    { sel: '#bn-rows', title: 'Tus banners', text: 'Edita, pausa con «Desactivar» o elimina cada banner. Con varios vigentes, rotan en el orden que definas.' },
  ],
  '#/admin/emails': [
    { sel: '.qb-page-hero', title: 'Correos automáticos', text: 'Los correos que salen solos en cada momento: solicitud recibida, aprobada, contrato, bienvenida, recordatorios y pagos.' },
    { panel: 'Estado de la conexión', title: 'Qué falta', text: 'Lo que está listo y lo que falta para que Brevo envíe. Mientras falte, cada intento queda registrado como «omitido».' },
    { panel: 'Eventos', title: 'Plantilla por evento', text: 'Elige la plantilla de Brevo para cada evento, actívalo y envíate una prueba antes.' },
    { panel: 'Registro de envíos', title: 'Evidencia', text: 'Cada correo con su estado: entregado, abierto o rebotado. Sirve ante un «no me llegó».' },
  ],
  '#/admin/settings': [
    { sel: '.page-title', title: 'Configuración', text: 'Los datos que aparecen en tus cotizaciones y la tasa del dólar.' },
    { panel: 'Datos legales', title: 'Datos legales', text: 'Razón social, NIT y datos de contacto que salen en cada PDF.' },
    { panel: 'Moneda', title: 'Precios en dólares', text: 'Define la tasa para mostrar el equivalente en USD. El cobro siempre es en pesos.' },
  ],

  // -------------------------------- EMPRESA --------------------------------
  '#/company/dashboard': [
    { title: 'Bienvenido a tu panel', text: 'Aquí ves el retorno que genera tu empresa con CS Travel. Te lo mostramos en un minuto.' },
    SIDEBAR,
    { panel: 'Retorno por', title: 'Tu retorno', text: 'Lo que tu empresa gana por los viajes de tu equipo y tu comunidad, mes a mes.' },
    { panel: 'Clientes referidos', title: 'Referidos en vivo', text: 'Las personas que llegaron por tu empresa y en qué etapa van.' },
    { panel: 'Centro de beneficios', title: 'Comparte tu beneficio', text: 'Tu código y tu enlace para compartir por WhatsApp o correo.' },
    { panel: 'Incentivos', title: 'Incentivos', text: 'Metas y premios que desbloquea tu empresa a medida que crece.' },
    FAB, PROFILE,
  ],
  '#/company/requests': [
    { sel: '.page-title', title: 'Mis solicitudes', text: 'Todos los viajes que has pedido y en qué estado van.' },
    { panel: 'por estado', title: 'Resumen', text: 'Cuántas solicitudes tienes en cada etapa.' },
    { sel: '#cr-search, .table-toolbar', title: 'Buscar', text: 'Encuentra una solicitud por código o destino.' },
    { sel: '#cr-table', title: 'Detalle', text: 'Abre una solicitud para ver la cotización, aprobarla y pagarla.' },
    FAB,
  ],
  '#/company/requests/new': [
    { sel: '.page-title, .nr-page-hero', title: 'Nueva solicitud', text: 'Cuéntanos qué viaje necesitas. Con estos datos te enviamos la cotización.' },
    { sel: '.nr-checks', title: 'Servicios', text: 'Marca todo lo que necesitas: vuelo, hotel, traslados, tours...' },
    { sel: '.nr-actions', title: 'Enviar', text: 'Al enviarla, nuestro equipo la recibe de inmediato y te avisamos cuando esté cotizada.' },
  ],
  '#/company/requests/:id': [
    { panel: 'Datos del viaje', title: 'Tu viaje', text: 'El resumen de lo que pediste.' },
    { panel: 'Costos y beneficios', title: 'Costos y ahorro', text: 'El valor de la cotización y cuánto ahorras frente a comprar por tu cuenta.' },
    { panel: 'Pago', title: 'Pago', text: 'Cuando apruebes la cotización, paga aquí de forma segura.' },
  ],
  '#/company/partner': [
    { sel: '.qb-page-hero', title: 'Mi convenio', text: 'Tu expediente como aliado: estado, código, enlace y resultados.' },
    { panel: 'Estado del convenio', title: 'En qué va tu convenio', text: 'Cada paso del proceso, desde la solicitud hasta que queda activo.' },
    { panel: 'Tu código y enlace', title: 'Tu enlace y tu QR', text: 'Compártelo con tu equipo o imprímelo: todo el que entre por aquí queda registrado como tuyo.' },
    { panel: 'Seguimiento', title: 'Resultados', text: 'Cuántas solicitudes llegaron por tu enlace cada mes.' },
  ],

  // --------------------------------- MEDICO ---------------------------------
  '#/doctor/dashboard': [
    { title: 'Bienvenido, doctor', text: 'Así funciona tu panel para acompañar a tus pacientes que viajan. Toma un minuto.' },
    SIDEBAR,
    { sel: '.decision-hero', title: 'Pendiente de tu decisión', text: 'Casos con una cotización lista esperando tu aprobación. Empieza siempre por aquí.' },
    { panel: 'Ganancias por periodo', title: 'Tus ganancias', text: 'Lo que generas por cada paciente, por mes o por año.' },
    { panel: 'Casos activos', title: 'Casos activos', text: 'Tus pacientes en curso y en qué etapa va cada uno.' },
    { panel: 'Tus beneficios', title: 'Tus beneficios', text: 'Tu código de aliado y cómo compartirlo.' },
    FAB, PROFILE,
  ],
  '#/doctor/cases': [
    { sel: '.page-title', title: 'Mis casos', text: 'Todos los pacientes que has enviado a CS Travel.' },
    { panel: 'por estado', title: 'Resumen', text: 'Cuántos casos tienes en cada etapa.' },
    { sel: '#case-search, .table-toolbar', title: 'Buscar', text: 'Encuentra un caso por paciente o código.' },
    { sel: '#cases-table', title: 'Detalle', text: 'Abre un caso para revisar y aprobar la cotización del viaje.' },
    FAB,
  ],
  '#/doctor/cases/new': [
    { sel: '.page-title', title: 'Nuevo caso', text: 'Registra al paciente y lo que necesita para viajar. Nosotros nos encargamos del resto.' },
    { sel: 'form', title: 'Datos del caso', text: 'Solo lo necesario: ciudad de origen, fechas tentativas, acompañantes y nivel de apoyo.' },
  ],
  '#/doctor/cases/:id': [
    { panel: 'Datos del paciente', title: 'Datos del caso', text: 'La información del paciente y su viaje.' },
    { panel: 'Cotización', title: 'Cotización', text: 'Revisa la propuesta logística y apruébala para que empecemos a gestionar.' },
  ],
};

// ---------------------------------------------------------------------------
// Estado "ya visto" (por usuario y por pagina)
// ---------------------------------------------------------------------------

const SEEN_KEY = 'cs_tour_seen';

function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; }
}

function markSeen(userId, route) {
  try {
    const all = readSeen();
    all[userId] = { ...(all[userId] || {}), [route]: true };
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch { /* sin almacenamiento: el recorrido volvera a salir, no pasa nada */ }
}

const wasSeen = (userId, route) => Boolean(readSeen()[userId]?.[route]);

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  if (r.right <= 0 || r.left >= window.innerWidth) return false; // ej. menu lateral oculto en movil
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function findTarget(step) {
  if (step.panel) {
    const needle = step.panel.toLowerCase();
    const heading = [...document.querySelectorAll('.panel__title, .page-title, h2, h3')]
      .find((h) => h.textContent.toLowerCase().includes(needle));
    const box = heading?.closest('.panel, section, .card') || heading;
    return isVisible(box) ? box : null;
  }
  if (step.sel) {
    for (const sel of step.sel.split(',')) {
      const el = document.querySelector(sel.trim());
      if (isVisible(el)) return el;
    }
    return null;
  }
  return null;
}

let active = null;

function closeTour(completed = true) {
  if (!active) return;
  const { root, onKey, onReflow, userId, route } = active;
  root.remove();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onReflow);
  window.removeEventListener('scroll', onReflow, true);
  if (completed) markSeen(userId, route);
  active = null;
}

function place(root, target) {
  const spot = root.querySelector('.tour__spot');
  const card = root.querySelector('.tour__card');
  const [dimTop, dimBottom, dimLeft, dimRight] = root.querySelectorAll('.tour__dim');
  const pad = 8;
  const W = window.innerWidth;
  const H = window.innerHeight;
  // Capa oscura en cuatro piezas alrededor del hueco (una sombra gigante no se
  // pinta igual en todos los navegadores).
  const dim = (t, l, w, h) => `top:${t}px;left:${l}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;`;
  if (!target) {
    spot.style.cssText = 'display:none;';
    dimTop.style.cssText = dim(0, 0, W, H);
    dimBottom.style.cssText = dimLeft.style.cssText = dimRight.style.cssText = 'display:none;';
    card.style.top = `${Math.max(16, window.innerHeight / 2 - card.offsetHeight / 2)}px`;
    card.style.left = `${Math.max(16, window.innerWidth / 2 - card.offsetWidth / 2)}px`;
    return;
  }
  const r = target.getBoundingClientRect();
  const top = Math.max(4, r.top - pad);
  const left = Math.max(4, r.left - pad);
  const width = Math.min(window.innerWidth - left - 4, r.width + pad * 2);
  const height = Math.min(window.innerHeight - top - 4, r.height + pad * 2);
  spot.style.cssText = `top:${top}px;left:${left}px;width:${width}px;height:${height}px;`;
  dimTop.style.cssText = dim(0, 0, W, top);
  dimBottom.style.cssText = dim(top + height, 0, W, H - top - height);
  dimLeft.style.cssText = dim(top, 0, left, height);
  dimRight.style.cssText = dim(top, left + width, W - left - width, height);

  // Tarjeta: debajo de la zona si cabe; si no, encima; si tampoco, abajo fija.
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  let ct = top + height + 12;
  if (ct + ch > window.innerHeight - 12) ct = top - ch - 12;
  if (ct < 12) ct = window.innerHeight - ch - 16;
  let cl = left;
  if (cl + cw > window.innerWidth - 12) cl = window.innerWidth - cw - 12;
  card.style.top = `${Math.max(12, ct)}px`;
  card.style.left = `${Math.max(12, cl)}px`;
}

/**
 * startTour()
 * @param {string} route  - patron de ruta (clave de TOURS).
 * @param {object} user   - usuario de la sesion (para recordar "ya visto").
 * @returns {boolean} true si habia recorrido para esta pagina.
 */
export function startTour(route, user) {
  closeTour(false);
  const steps = (TOURS[route] || []).filter((s) => !s.sel && !s.panel ? true : Boolean(findTarget(s)));
  if (!steps.length) return false;

  const root = document.createElement('div');
  root.className = 'tour';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="tour__dim"></div><div class="tour__dim"></div><div class="tour__dim"></div><div class="tour__dim"></div>
    <div class="tour__spot"></div>
    <div class="tour__card" role="document">
      <p class="tour__count"></p>
      <h3 class="tour__title"></h3>
      <p class="tour__text"></p>
      <div class="tour__actions">
        <button type="button" class="tour__skip" data-tour="skip">Omitir</button>
        <span class="tour__spacer"></span>
        <button type="button" class="btn btn--ghost btn--sm" data-tour="prev">Anterior</button>
        <button type="button" class="btn btn--primary btn--sm" data-tour="next">Siguiente</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  let index = 0;
  const show = () => {
    const step = steps[index];
    const target = findTarget(step);
    root.querySelector('.tour__count').textContent = `Paso ${index + 1} de ${steps.length}`;
    root.querySelector('.tour__title').textContent = step.title;
    root.querySelector('.tour__text').innerHTML = escapeHtml(step.text);
    root.querySelector('[data-tour="prev"]').hidden = index === 0;
    root.querySelector('[data-tour="next"]').textContent = index === steps.length - 1 ? 'Entendido' : 'Siguiente';
    root.classList.toggle('tour--center', !target);
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    }
    requestAnimationFrame(() => place(root, target));
    root.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  };

  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-tour]')?.dataset.tour;
    if (action === 'skip') closeTour(true);
    if (action === 'prev' && index > 0) { index -= 1; show(); }
    if (action === 'next') {
      if (index >= steps.length - 1) closeTour(true);
      else { index += 1; show(); }
    }
  });

  const onKey = (event) => {
    if (event.key === 'Escape') closeTour(true);
    if (event.key === 'ArrowRight') root.querySelector('[data-tour="next"]').click();
    if (event.key === 'ArrowLeft' && index > 0) root.querySelector('[data-tour="prev"]').click();
  };
  const onReflow = () => requestAnimationFrame(() => place(root, findTarget(steps[index])));
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onReflow);
  window.addEventListener('scroll', onReflow, true);

  active = { root, onKey, onReflow, userId: String(user?.id || user?.email || 'anon'), route };
  show();
  return true;
}

/** Lo llama el router tras pintar cada pagina: arranca solo la primera vez. */
export function maybeStartTour(route, user) {
  if (!user || !TOURS[route]) return;
  if (wasSeen(String(user.id || user.email || 'anon'), route)) return;
  const hashAtStart = window.location.hash;
  // Pequena espera para que carguen graficos y datos asincronos de la vista.
  setTimeout(() => {
    if (window.location.hash !== hashAtStart || active) return;
    if (document.querySelector('.modal.is-open, .drawer-overlay.is-open')) return;
    startTour(route, user);
  }, 900);
}

/** Cierra el recorrido abierto (al cambiar de pagina). */
export function stopTour() {
  closeTour(false);
}
