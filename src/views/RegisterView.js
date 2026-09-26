/**
 * RegisterView.js
 * =============================================================================
 * PROPOSITO:
 *   Registro de un ALIADO (empresa o medico/clinica) sin salir del portal.
 *   Sustituye la landing cstravelgroup.com/aliados.
 *
 * DISENO: "el vuelo del aliado"
 *   El registro se recorre como un vuelo. El panel azul (izquierda) es la
 *   pantalla y nunca desaparece; la derecha son los controles. Cada paso mueve
 *   las tres cosas a la vez, como una sola toma: la escena del panel entra con
 *   un barrido vertical, la pantalla de la derecha con uno lateral y el avion
 *   (el mismo del hero de cstravelgroup.com) vuela a la siguiente parada:
 *
 *     Perfil ─ Beneficio ─ Retorno|Ganancia ─ Proceso ─ Requisitos ─ Registro
 *
 *   La primera parada pregunta quien se registra, porque de eso dependen los
 *   beneficios, el simulador y el formulario:
 *     - empresa: retorno por tramos del Anexo A (25% a 40%),
 *     - medico o clinica: su margen sobre el costo logistico de cada paciente
 *       (lo que ya muestra el panel del medico; sugerido 15%).
 *   Lo que se elige en el recorrido llega marcado al formulario. En el
 *   formulario el panel muestra el pase de abordaje, que se llena mientras se
 *   escribe. Al enviar: el formulario se esconde detras del panel, el pase
 *   queda al centro, se sella y el avion despega.
 *
 * QUE SE PIDE (y que NO):
 *   Solo lo necesario para crear el acceso temporal y llamar a quien decide.
 *   Los documentos y la firma van despues, en el expediente del portal.
 *
 * DATOS:
 *   Portal real (/portal-app/): POST /api/aliados/solicitud (contrato en
 *   docs/PLAN-ALTA-ALIADOS.md). Demo: localStorage, lo ve el admin demo.
 * =============================================================================
 */

import logoCs from '../assets/logo-cs.png';
import { isValidEmail, isNotEmpty } from '../utils/validators.js';
import { isDeployedBundle } from '../utils/env.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { TIERS } from '../components/AlliedValue.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { PERSON_TYPES, ACCESS_DAYS, requiredDocs } from '../utils/allyOnboarding.js';
import { renderFlightRoute, createFlight, tween, prefersReducedMotion, EASE_FLIGHT } from '../components/AllyFlight.js';

/** Version de los textos legales aceptados (igual a la de la landing). */
const CONSENT_VERSION = '2026-09-17';

/** Clave donde el demo guarda las solicitudes (la lee AdminAlliesView). */
export const DEMO_ALLY_REQUESTS_KEY = 'cs_travel_demo_ally_requests';

const SITE = 'https://www.cstravelgroup.com';

// ---------------------------------------------------------------------------
// Contenido por tipo de aliado
// ---------------------------------------------------------------------------

export const ALLY_TYPES = {
  empresa: {
    label: 'Empresa',
    hint: 'Beneficios de viaje para tus directivos, tu equipo o tu comunidad.',
    stops: ['Perfil', 'Beneficio', 'Retorno', 'Proceso', 'Requisitos', 'Registro'],
    passNo: 'EMPRESA',
  },
  medico: {
    label: 'Médico o clínica',
    hint: 'Logística de viaje completa para tus pacientes, con tu margen.',
    stops: ['Perfil', 'Beneficio', 'Ganancia', 'Proceso', 'Requisitos', 'Registro'],
    passNo: 'MÉDICO',
  },
};

const CHANNELS = [
  { value: 'ejecutivo', label: 'Ejecutivo', hint: 'Viajes de la alta dirección', gets: 'Tarifas mayoristas netas, sin cargos de agencia, también para su familia.' },
  { value: 'comunidad', label: 'Comunidad', hint: 'Clientes y red de la empresa', gets: 'Un enlace con tu código: tarifas por debajo de las plataformas de reserva y promociones.' },
  { value: 'colaboradores', label: 'Colaboradores', hint: 'Beneficio para el equipo', gets: 'Tarifas preferenciales y financiación sin intereses para sus viajes personales.' },
];
const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label]));

// Como trabaja el medico: define el tipo de persona del expediente.
const PRACTICES = [
  { value: 'natural', label: 'Médico independiente', hint: 'Consulta propia, a tu nombre', gets: 'Refieres a tus pacientes con tu enlace y ganas tu margen en cada viaje.' },
  { value: 'juridica', label: 'Clínica o centro médico', hint: 'IPS, clínica o grupo médico', gets: 'Tus pacientes viajan con todo resuelto: vuelos, hospedaje cerca de la clínica y traslados.' },
];

const EMPLOYEES = [
  ['1-10', '1 a 10'],
  ['11-50', '11 a 50'],
  ['51-200', '51 a 200'],
  ['201-500', '201 a 500'],
  ['500+', 'Más de 500'],
];

// Simulador de empresas: volumen neto quincenal de la red (COP).
const SIM_STOPS = [5e6, 10e6, 15e6, 20e6, 30e6, 45e6, 55e6, 80e6, 100e6, 120e6, 150e6, 200e6];
const SIM_START = SIM_STOPS.indexOf(20e6);
const tierFor = (v) => TIERS.find((t) => v <= t.max) || TIERS[TIERS.length - 1];

// Simulador de medicos: costo logistico del viaje y margen (sugerido 15%,
// igual que el panel del medico).
const MED_COST = { min: 1e6, max: 20e6, step: 5e5, start: 6e6 };
const MED_MARGIN = { min: 5, max: 25, start: 15 };

const PERKS = {
  empresa: [
    { key: 'empresa', title: 'Tu empresa', text: 'Un retorno por cada reserva de tu red, pagado cada quincena y visible en tu dashboard.', icon: '<path d="M3 19h18" /><path d="M7 19v-5" /><path d="M12 19V9" /><path d="M17 19V5" />' },
    { key: 'ejecutivo', title: 'Directivos', text: 'Tarifas mayoristas netas, sin cargos de agencia, también para su familia.', icon: '<path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8Z" />' },
    { key: 'colaboradores', title: 'Colaboradores', text: 'Tarifas preferenciales y financiación sin intereses para sus viajes personales.', icon: '<circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6" /><path d="M18 14.3c1.6.7 2.7 2.3 3 4.7" />' },
    { key: 'comunidad', title: 'Clientes y comunidad', text: 'Un enlace con tu código: tarifas bajo las plataformas de reserva y promociones.', icon: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />' },
  ],
  // Los beneficios que ya muestra el panel del medico.
  medico: [
    { key: 'natural', title: 'Ingreso por cada paciente', text: 'Defines tu margen y ganas en cada viaje que coordinamos, sin cambiar tu práctica.', icon: '<path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />' },
    { key: 'link', title: 'Tu enlace de afiliado', text: 'Cada paciente que llega por ti queda acreditado a tu nombre.', icon: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />' },
    { key: 'juridica', title: 'Nosotros operamos todo', text: 'Vuelos, hospedaje, traslados y seguros, de principio a fin y bajo tu marca.', icon: '<rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 20V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v15" />' },
    { key: 'paciente', title: 'Mejor experiencia', text: 'Tu paciente recibe tratamiento y viaje resueltos: eleva tu reputación y lo fideliza.', icon: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />' },
  ],
};

const ICONS = {
  empresa: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-4h6v4" /><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01" /></svg>',
  medico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v6a4 4 0 0 0 8 0V3" /><path d="M10 13v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></svg>',
};

const PLANE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" transform="rotate(90 12 12)" /></svg>';

const STEP_FORM = 5;

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

/** Codigo de origen (?ref= o ?origen=) que trae al aliado: base de comisiones. */
function readOrigin() {
  const hashQuery = window.location.hash.split('?')[1] || '';
  const params = new URLSearchParams(hashQuery || window.location.search);
  return (params.get('ref') || params.get('origen') || '').trim().slice(0, 40);
}

function validate(data) {
  const errors = {};
  const medico = data.allyType === 'medico';
  if (!PERSON_TYPES[data.personType]) errors.personType = medico ? 'Elige cómo trabajas.' : 'Elige el tipo de persona.';
  if (!isNotEmpty(data.company)) errors.company = medico ? 'Escribe el nombre de tu consulta o de la clínica.' : 'Escribe el nombre de la empresa.';
  const nit = data.nit.replace(/[\s.]/g, '');
  if (!/^\d{6,10}(-?\d)?$/.test(nit)) errors.nit = data.personType === 'natural' ? 'Revisa el número (ej. 1045678912).' : 'Revisa el NIT (ej. 900123456-7).';
  if (medico) {
    if (!isNotEmpty(data.specialty)) errors.specialty = 'Escribe tu especialidad.';
  } else {
    if (!data.employees) errors.employees = 'Selecciona un rango.';
    if (!data.channel) errors.channel = 'Elige el canal que más te interesa.';
  }
  if (!isNotEmpty(data.contactName)) errors.contactName = 'Escribe el nombre.';
  if (!isNotEmpty(data.position)) errors.position = 'Escribe el cargo.';
  if (!isValidEmail(data.email)) errors.email = 'Revisa el correo.';
  if (data.phone.replace(/\D/g, '').length < 7) errors.phone = 'Revisa el número.';
  return errors;
}

async function submitRequest(data) {
  if (isDeployedBundle()) {
    const res = await fetch('/api/aliados/solicitud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || 'No pudimos registrar tu solicitud. Intenta de nuevo.');
    return { cuentaCreada: Boolean(out.cuentaCreada), cuentaExistente: Boolean(out.cuentaExistente) };
  }

  // Demo: la solicitud queda en este navegador y la ve el admin demo, con el
  // acceso temporal ya creado, igual que en el portal real.
  const now = new Date().toISOString();
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(DEMO_ALLY_REQUESTS_KEY) || '[]');
  } catch {
    list = [];
  }
  list.unshift({
    id: `reg-${Date.now()}`,
    allyType: data.allyType,
    company: data.company,
    nit: data.nit,
    contactName: data.contactName,
    position: data.position,
    phone: data.phone,
    email: data.email,
    employees: data.employees,
    channel: data.channel,
    specialty: data.specialty,
    personType: data.personType,
    origin: data.origin,
    status: 'registrado',
    documents: [],
    signature: null,
    tags: [],
    owner: '',
    notes: [],
    history: [{ at: now, by: 'registro', from: '', to: 'registrado' }],
    memberId: 'demo',
    createdAt: now,
    accessExpiresAt: new Date(Date.now() + ACCESS_DAYS * 86400000).toISOString(),
  });
  localStorage.setItem(DEMO_ALLY_REQUESTS_KEY, JSON.stringify(list.slice(0, 20)));
  await new Promise((resolve) => setTimeout(resolve, 450));
  return { cuentaCreada: true, cuentaExistente: false };
}

// ---------------------------------------------------------------------------
// Piezas del panel
// ---------------------------------------------------------------------------

function renderDocList(personType) {
  return requiredDocs(personType).map((d) => `
    <li>
      <strong>${escapeHtml(d.title)}</strong>
      <span>${d.images ? 'PDF o fotos de ambas caras' : 'PDF'}${d.maxAgeDays ? ` · expedido hace ${d.maxAgeDays} días o menos` : ''}</span>
    </li>`).join('');
}

/** Tarjetas de documentos en abanico (escena de requisitos). */
function renderDocFan(personType) {
  return requiredDocs(personType).map((d, i) => `
    <li style="--i:${i}">
      <span class="scene-docs__icon" aria-hidden="true">PDF</span>
      <strong>${escapeHtml(d.title)}</strong>
    </li>`).join('');
}

const perkList = (type) => PERKS[type].map((p) => `
  <li data-perk="${p.key}">
    <svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg>
    <strong>${p.title}</strong>
    <span>${p.text}</span>
  </li>`).join('');

/** Escenas del panel azul, una por parada de la ruta. */
function renderScenes() {
  const start = tierFor(SIM_STOPS[SIM_START]);
  const gain = MED_COST.start * (MED_MARGIN.start / 100);
  return `
    <div class="register__stage">
      <section class="register__scene is-active" data-scene="0">
        <p class="register__eyebrow">Programa de aliados CS Travel</p>
        <h1 class="register__title" id="register-title">Los viajes de tu red, convertidos en ingresos</h1>
        <p class="register__lead">
          Empresas y médicos le dan a su red un servicio de viaje completo y reciben un ingreso
          por cada reserva. Nosotros operamos todo. Cuéntanos quién eres y te mostramos tu programa.
        </p>
        <div class="scene-profiles">
          ${Object.entries(ALLY_TYPES).map(([key, t]) => `
            <div class="scene-profile" data-profile="${key}">
              <span class="scene-profile__icon">${ICONS[key]}</span>
              <strong>${key === 'empresa' ? 'Empresas' : 'Médicos y clínicas'}</strong>
              <span>${t.hint}</span>
            </div>`).join('')}
        </div>
        <ul class="register__terms" aria-label="Condiciones">
          <li>Sin inversión inicial</li>
          <li>Sin mínimos de volumen</li>
          <li>Sin permanencia</li>
        </ul>
      </section>

      <section class="register__scene" data-scene="1" inert>
        <p class="register__eyebrow" data-for="empresa">CS Allied Value Partnership</p>
        <p class="register__eyebrow" data-for="medico">Aliado médico</p>
        <h2 class="register__title" data-for="empresa">Tu empresa viaja con retorno</h2>
        <h2 class="register__title" data-for="medico">Tu consulta, con el viaje resuelto</h2>
        <p class="register__lead" data-for="empresa">
          Un programa de bienestar empresarial y fidelización: le das a tu red beneficios de viaje
          reales y tu empresa genera un ingreso adicional.
        </p>
        <p class="register__lead" data-for="medico">
          Refieres a tu paciente y armamos toda la logística del viaje médico. Tú defines tu margen,
          el paciente paga el valor final y tú ganas en cada caso.
        </p>
        <ul class="register__perks" data-for="empresa" aria-label="Beneficios por público">${perkList('empresa')}</ul>
        <ul class="register__perks" data-for="medico" aria-label="Beneficios para médicos">${perkList('medico')}</ul>
      </section>

      <section class="register__scene" data-scene="2" inert>
        <p class="register__eyebrow" data-for="empresa">Tu retorno</p>
        <p class="register__eyebrow" data-for="medico">Tu ganancia</p>
        <div class="scene-return" data-for="empresa">
          <p class="scene-return__pct"><strong id="scene-pct">${Math.round(start.pct * 100)}</strong><span>%</span></p>
          <p class="scene-return__tier">Tramo <strong id="scene-tier">${start.name}</strong></p>
          <p class="scene-return__lead">de nuestra utilidad neta por cada viaje que compra tu red, liquidado cada quincena.</p>
        </div>
        <div class="scene-ladder" data-for="empresa" role="img" aria-label="Tramos de retorno: 25, 30, 35 y 40 por ciento">
          ${TIERS.map((t) => `
            <div class="scene-ladder__col ${t.key === start.key ? 'is-current' : ''}" data-ladder="${t.key}" style="--h:${Math.round((t.pct / 0.4) * 100)}%">
              <span class="scene-ladder__bar"><em>${Math.round(t.pct * 100)}%</em></span>
              <span class="scene-ladder__name">${t.name}</span>
            </div>`).join('')}
        </div>
        <div class="scene-return" data-for="medico">
          <p class="scene-return__pct scene-return__pct--money"><strong id="scene-gain">${formatCurrency(gain)}</strong></p>
          <p class="scene-return__tier">por paciente, con tu margen de <strong id="scene-margin">${MED_MARGIN.start}%</strong></p>
          <p class="scene-return__lead">sobre el costo logístico de su viaje. Cada caso tiene un tope para que tu paciente siga pagando menos que en el mercado.</p>
        </div>
        <div class="scene-split" data-for="medico" aria-hidden="true">
          <div class="scene-split__bar">
            <span class="scene-split__cost" id="split-cost" style="flex-grow:100"><em>Costo del viaje</em></span>
            <span class="scene-split__gain" id="split-gain" style="flex-grow:${MED_MARGIN.start}"><em>Tú</em></span>
          </div>
          <p class="scene-split__total">El paciente paga <strong id="split-total">${formatCurrency(MED_COST.start + gain)}</strong></p>
        </div>
      </section>

      <section class="register__scene" data-scene="3" inert>
        <p class="register__eyebrow">El proceso</p>
        <h2 class="register__title">Todo en línea. Sin papeleo.</h2>
        <div class="scene-facts">
          <div><strong>2 min</strong><span>para registrarte, sin documentos</span></div>
          <div><strong>${ACCESS_DAYS} días</strong><span>para completar tu expediente</span></div>
          <div><strong>100%</strong><span>en línea: subes, firmas y listo</span></div>
        </div>
        <p class="register__lead">Cada paso te llega por correo. Si algo falta, te decimos exactamente qué.</p>
      </section>

      <section class="register__scene" data-scene="4" inert>
        <p class="register__eyebrow">Requisitos</p>
        <h2 class="register__title">Tu expediente, desde el celular.</h2>
        <ul class="scene-docs" id="scene-docs">${renderDocFan('juridica')}</ul>
        <p class="register__lead">Todo queda en PDF. La cédula también puede ir en fotos: las convertimos por ti.</p>
      </section>

      <section class="register__scene" data-scene="5" inert>
        <div class="pass-wrap" id="pass-wrap">
          <article class="pass" id="register-pass" aria-label="Tu pase de abordaje">
            <header class="pass__head">
              <img src="${logoCs}" alt="" class="pass__logo" />
              <span class="pass__kind">Pase de abordaje</span>
              <span class="pass__no">CS · ${new Date().getFullYear()} · <span id="pass-no">ALIADO</span></span>
            </header>
            <div class="pass__route">
              <div><strong>COL</strong><span>Colombia</span></div>
              <span class="pass__plane">${PLANE_ICON}</span>
              <div class="pass__to"><strong>MUNDO</strong><span id="pass-to">Tu red</span></div>
            </div>
            <dl class="pass__grid">
              <div class="pass__wide"><dt>Aliado</dt><dd data-pass="company" data-empty="Tu empresa">Tu empresa</dd></div>
              <div><dt>NIT</dt><dd data-pass="nit" data-empty="—">—</dd></div>
              <div class="pass__wide"><dt>Pasajero</dt><dd data-pass="contactName" data-empty="Quien decide">Quien decide</dd></div>
              <div><dt>Clase</dt><dd data-pass="clase" data-empty="—">—</dd></div>
              <div><dt>Tipo</dt><dd data-pass="personType" data-empty="—">Jurídica</dd></div>
              <div><dt>Puerta</dt><dd>Portal</dd></div>
              <div><dt>Asiento</dt><dd>01A</dd></div>
            </dl>
            <div class="pass__tear" aria-hidden="true"></div>
            <footer class="pass__stub">
              <div>
                <span class="pass__label">Estado</span>
                <strong class="pass__status" id="pass-status">Por confirmar</strong>
              </div>
              <span class="pass__barcode" aria-hidden="true"></span>
            </footer>
            <span class="pass__stamp" aria-hidden="true">Confirmado</span>
            <span class="pass__shine" aria-hidden="true"></span>
          </article>
        </div>

        <div class="register__after" id="register-after" hidden>
          <h2 tabindex="-1" id="register-after-title">¡Bienvenido a bordo!</h2>
          <p id="register-done-lead">Quedaste registrado y ya creamos tu acceso al portal.</p>
          <ol class="register__steps" id="register-done-steps">
            <li><strong>Revisa tu correo</strong><span>Te enviamos un enlace para crear tu contraseña.</span></li>
            <li><strong>Completa tu expediente</strong><span>Documentos y firma en una sola pantalla. Tienes ${ACCESS_DAYS} días.</span></li>
            <li><strong>Revisión y activación</strong><span>Te avisamos por correo y se activa tu enlace.</span></li>
          </ol>
          <a href="#/login" class="btn btn--primary">Ir al inicio de sesión</a>
        </div>
      </section>
    </div>`;
}

const pickButtons = (items, attr) => items.map((c) => `
  <button type="button" class="register__pick" ${attr}="${c.value}" aria-pressed="false">
    <strong>${c.label}</strong>
    <span class="register__pick-hint">${c.hint}</span>
    <span class="register__pick-gets">${c.gets}</span>
  </button>`).join('');

function renderIntro() {
  return `
    <div class="register__intro" id="register-intro">
      <div class="register__intro-top">
        <span class="register__step-label" id="register-step-label">Paso 1 de 6 · Perfil</span>
        <button type="button" class="register__skip" data-intro-skip hidden>Ya lo conozco: registrarme</button>
      </div>

      <div class="register__slides" aria-live="polite">
        <section class="register__slide is-active" data-slide="0">
          <h2>¿Quién se registra?</h2>
          <p class="register__slide-lead">Los beneficios cambian según quién eres. Elige y seguimos.</p>
          <div class="register__profiles">
            ${Object.entries(ALLY_TYPES).map(([key, t]) => `
              <button type="button" class="register__profile" data-pick-ally="${key}" aria-pressed="false">
                <span class="register__profile-icon">${ICONS[key]}</span>
                <strong>${t.label}</strong>
                <span>${t.hint}</span>
              </button>`).join('')}
          </div>
        </section>

        <section class="register__slide" data-slide="1" inert>
          <h2 data-for="empresa">¿A quién le quieres dar el beneficio?</h2>
          <h2 data-for="medico">¿Cómo trabajas?</h2>
          <p class="register__slide-lead" data-for="empresa">Elige por dónde empezar. Luego puedes abrirlo a los demás.</p>
          <p class="register__slide-lead" data-for="medico">Así preparamos tu convenio y tus requisitos.</p>
          <div class="register__picks" data-for="empresa">${pickButtons(CHANNELS, 'data-pick-channel')}</div>
          <div class="register__picks" data-for="medico">${pickButtons(PRACTICES, 'data-pick-practice')}</div>
        </section>

        <section class="register__slide" data-slide="2" inert>
          <h2 data-for="empresa">Cuánto recibe tu empresa</h2>
          <h2 data-for="medico">Cuánto ganas por paciente</h2>
          <p class="register__slide-lead" data-for="empresa">Mueve el control: el porcentaje sube con el volumen de cada quincena.</p>
          <p class="register__slide-lead" data-for="medico">Mueve los controles con un caso real de tu consulta.</p>
          <div class="register__sim" data-for="empresa">
            <label for="sim-volume" class="register__sim-label">Utilidad neta que genera tu red en una quincena</label>
            <output class="register__sim-volume" id="sim-volume-out" for="sim-volume">${formatCurrency(SIM_STOPS[SIM_START])}</output>
            <input type="range" id="sim-volume" min="0" max="${SIM_STOPS.length - 1}" step="1" value="${SIM_START}" />
            <p class="register__sim-result">Tu empresa recibiría <strong id="sim-return">${formatCurrency(SIM_STOPS[SIM_START] * tierFor(SIM_STOPS[SIM_START]).pct)}</strong> esa quincena.</p>
          </div>
          <div class="register__sim" data-for="medico">
            <label for="sim-cost" class="register__sim-label">Costo logístico del viaje de tu paciente</label>
            <output class="register__sim-volume" id="sim-cost-out" for="sim-cost">${formatCurrency(MED_COST.start)}</output>
            <input type="range" id="sim-cost" min="${MED_COST.min}" max="${MED_COST.max}" step="${MED_COST.step}" value="${MED_COST.start}" />
            <label for="sim-margin" class="register__sim-label">Tu margen <span class="register__sim-hint">(sugerido 15%)</span></label>
            <output class="register__sim-volume register__sim-volume--sm" id="sim-margin-out" for="sim-margin">${MED_MARGIN.start}%</output>
            <input type="range" id="sim-margin" min="${MED_MARGIN.min}" max="${MED_MARGIN.max}" step="1" value="${MED_MARGIN.start}" />
          </div>
          <p class="register__fine" data-for="empresa">Tramos del Anexo A del acuerdo, por volumen neto quincenal. Sin inversión, sin mínimos y sin permanencia.</p>
          <p class="register__fine" data-for="medico">Valores de ejemplo con tus propios números. El tope del margen de cada caso lo define la tarifa de mercado.</p>
        </section>

        <section class="register__slide" data-slide="3" inert>
          <h2>Cómo es el proceso</h2>
          <p class="register__slide-lead">Lo único que te pedimos al principio son dos minutos.</p>
          <ol class="register__timeline">
            <li><strong>Te registras</strong><span>Los datos básicos, sin documentos.</span></li>
            <li><strong>Recibes tu acceso temporal</strong><span>Al instante, por correo. Tienes ${ACCESS_DAYS} días para completar el expediente.</span></li>
            <li><strong>Completas tu expediente</strong><span>Subes los documentos y firmas el acuerdo, en una sola pantalla.</span></li>
            <li><strong>Revisamos</strong><span>Verificamos los documentos y te avisamos por correo.</span></li>
            <li><strong>Activamos tu convenio</strong><span>Recibes tu enlace y tu QR para compartir.</span></li>
          </ol>
        </section>

        <section class="register__slide" data-slide="4" inert>
          <h2>Qué vas a necesitar</h2>
          <p class="register__slide-lead">No lo necesitas para registrarte, pero sí para activar el convenio.</p>
          <div class="register__person register__person--compact" role="radiogroup" aria-label="Tipo de persona">
            ${Object.entries(PERSON_TYPES).map(([value, p]) => `
              <button type="button" class="register__person-option" data-pick-person="${value}" aria-pressed="${value === 'juridica'}">
                <strong>${p.label}</strong>
                <span>${p.hint}</span>
              </button>`).join('')}
          </div>
          <ul class="register__doclist" id="intro-docs">${renderDocList('juridica')}</ul>
          <p class="register__fine">Los certificados de la Cámara de Comercio y del banco deben ser recientes para confirmar que la información sigue vigente.</p>
        </section>
      </div>

      <div class="register__intro-nav">
        <button type="button" class="btn btn--ghost" data-intro-prev hidden>Atrás</button>
        <button type="button" class="btn btn--primary" data-intro-next disabled><span>Elige una opción</span></button>
      </div>
    </div>`;
}

const field = (id, label, input) => `
  <div class="form__group">
    <label for="${id}" class="form__label">${label}</label>
    ${input}
    <small class="form__error" data-error-for="${id}"></small>
  </div>`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : ms));

export const RegisterView = {
  async render() {
    return `
      <div class="login login--register">
        <a href="${SITE}/" class="login__masthead" target="_blank" rel="noopener noreferrer" aria-label="CS Travel Group - sitio principal">
          <img src="${logoCs}" alt="" class="login__masthead-logo" />
          <div>
            <p class="login__masthead-name">CS Travel Group</p>
            <p class="login__masthead-subtitle">Plataforma de viajes corporativos</p>
          </div>
        </a>

        <section class="register" data-ally="empresa" aria-labelledby="register-title">
          <aside class="register__info">
            ${renderScenes()}
            <div class="register__foot">
              ${renderFlightRoute(ALLY_TYPES.empresa.stops)}
              <div class="register__contact">
                <a href="mailto:info.cstravelgroup@gmail.com">info.cstravelgroup@gmail.com</a>
                <a href="https://wa.me/573146103599" target="_blank" rel="noopener">WhatsApp +57 314 610 3599</a>
              </div>
            </div>
          </aside>

          <div class="register__main">
            ${renderIntro()}

            <form id="register-form" class="register__form" novalidate hidden>
              <div class="register__head">
                <button type="button" class="register__back" data-intro-reopen>← Volver al recorrido</button>
                <h2 data-for="empresa">Registra tu empresa</h2>
                <h2 data-for="medico">Regístrate como médico</h2>
                <p>Tu pase de abordaje se va llenando mientras escribes. <button type="button" class="register__change" data-change-ally>¿No eres <span data-for="empresa">empresa</span><span data-for="medico">médico</span>? Cambiar</button></p>
              </div>

              <fieldset class="register__group">
                <legend><span data-for="empresa">Tu empresa</span><span data-for="medico">Tu consulta</span></legend>
                <div class="register__person" role="radiogroup" aria-label="Tipo de persona">
                  ${Object.entries(PERSON_TYPES).map(([value, p]) => `
                    <label class="register__person-option">
                      <input type="radio" name="personType" value="${value}" />
                      <strong data-for="empresa">${p.label}</strong>
                      <strong data-for="medico">${PRACTICES.find((x) => x.value === value).label}</strong>
                      <span>${p.hint}</span>
                    </label>`).join('')}
                </div>
                <small class="form__error" data-error-for="personType"></small>
                <div class="register__grid">
                  ${field('company', 'Razón social', '<input id="company" name="company" class="form__input" autocomplete="organization" placeholder="Empresa S.A.S." />')}
                  ${field('nit', 'NIT', '<input id="nit" name="nit" class="form__input" inputmode="numeric" placeholder="900123456-7" />')}
                  <div data-for="empresa">${field('employees', 'Colaboradores', `
                    <select id="employees" name="employees" class="form__input">
                      <option value="">Seleccionar...</option>
                      ${EMPLOYEES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
                    </select>`)}</div>
                  <div data-for="medico">${field('specialty', 'Especialidad', '<input id="specialty" name="specialty" class="form__input" maxlength="80" placeholder="Ej. cirugía plástica" />')}</div>
                </div>
                <div class="register__channels" data-for="empresa" role="radiogroup" aria-labelledby="channel-label">
                  <span class="form__label" id="channel-label">Canal de interés</span>
                  <div class="register__channel-list">
                    ${CHANNELS.map((c) => `
                      <label class="register__channel">
                        <input type="radio" name="channel" value="${c.value}" />
                        <strong>${c.label}</strong>
                        <span>${c.hint}</span>
                      </label>`).join('')}
                  </div>
                  <small class="form__error" data-error-for="channel"></small>
                </div>
              </fieldset>

              <fieldset class="register__group">
                <legend>Quién decide</legend>
                <div class="register__grid register__grid--four">
                  ${field('contactName', 'Nombre completo', '<input id="contactName" name="contactName" class="form__input" autocomplete="name" />')}
                  ${field('position', 'Cargo', '<input id="position" name="position" class="form__input" autocomplete="organization-title" placeholder="Gerente, director..." />')}
                  ${field('email', 'Correo', '<input id="email" name="email" type="email" class="form__input" autocomplete="email" placeholder="nombre@empresa.com" />')}
                  ${field('phone', 'Celular / WhatsApp', '<input id="phone" name="phone" type="tel" class="form__input" autocomplete="tel" placeholder="+57 300 000 0000" />')}
                </div>
              </fieldset>

              <!-- Trampa para bots: los humanos no la ven. -->
              <input type="text" name="website" class="register__trap" tabindex="-1" autocomplete="off" aria-hidden="true" />

              <div class="register__consents">
                <label class="register__check">
                  <input type="checkbox" name="data_consent" value="si" />
                  <span>Autorizo a CS Travel Group Colombia S.A.S. el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 para gestionar esta solicitud, según la <a href="${SITE}/privacidad/" target="_blank" rel="noopener">Política de Tratamiento de Datos</a>.</span>
                </label>
                <label class="register__check">
                  <input type="checkbox" name="terms_consent" value="si" />
                  <span>He leído y acepto los <a href="${SITE}/terminos/" target="_blank" rel="noopener">Términos y Condiciones</a>.</span>
                </label>
              </div>

              <div class="form__alert" id="register-alert" role="alert" hidden></div>

              <div class="register__actions">
                <button type="submit" class="btn btn--primary register__submit" id="register-submit"><span>Enviar solicitud</span></button>
                <p>¿Ya eres aliado? <a href="#/login">Inicia sesión</a></p>
              </div>
            </form>
          </div>
        </section>
      </div>
    `;
  },

  async afterRender() {
    const panel = document.querySelector('.register');
    const info = panel.querySelector('.register__info');
    const main = panel.querySelector('.register__main');
    const form = document.getElementById('register-form');
    const alert = document.getElementById('register-alert');
    const submitBtn = document.getElementById('register-submit');
    const intro = document.getElementById('register-intro');
    const slides = [...intro.querySelectorAll('[data-slide]')];
    const scenes = [...info.querySelectorAll('[data-scene]')];
    const prevBtn = intro.querySelector('[data-intro-prev]');
    const nextBtn = intro.querySelector('[data-intro-next]');
    const skipBtn = intro.querySelector('[data-intro-skip]');
    const stepLabel = document.getElementById('register-step-label');
    const pass = document.getElementById('register-pass');
    const origin = readOrigin();
    const picks = { ally: '', channel: '', personType: 'juridica', practice: '' };
    let current = 0;
    let boarding = false;

    // Terminada la entrada del panel, los cambios de pantalla arrancan sin su retardo.
    setTimeout(() => panel.classList.add('is-settled'), prefersReducedMotion() ? 0 : 1100);

    const type = () => ALLY_TYPES[picks.ally || 'empresa'];

    // --- Escenas y pantallas -------------------------------------------------

    /** Cambia la escena del panel con barrido vertical (hacia abajo si avanza). */
    const showScene = (i, dir) => {
      scenes.forEach((s, k) => {
        s.classList.remove('is-leaving');
        if (k === i) return;
        if (s.classList.contains('is-active')) {
          s.classList.remove('is-active');
          s.classList.add('is-leaving');
          s.dataset.dir = dir;
          s.addEventListener('animationend', () => s.classList.remove('is-leaving'), { once: true });
        }
        s.inert = true;
      });
      const next = scenes[i];
      next.dataset.dir = dir;
      next.inert = false;
      next.classList.remove('is-active');
      void next.offsetWidth; // reinicia la animacion de entrada
      next.classList.add('is-active');
    };

    const paintNav = () => {
      const i = current;
      if (i === STEP_FORM) return;
      prevBtn.hidden = i === 0;
      skipBtn.hidden = i === 0; // lo unico imprescindible es saber quien se registra
      const needsPick = i === 0 && !picks.ally;
      nextBtn.disabled = needsPick;
      nextBtn.querySelector('span').textContent = needsPick ? 'Elige una opción' : i === slides.length - 1 ? 'Registrarme' : 'Siguiente';
      stepLabel.textContent = `Paso ${i + 1} de ${type().stops.length} · ${type().stops[i]}`;
    };

    /** Cambia la pantalla de la derecha (recorrido o formulario). */
    const showSide = (i, dir) => {
      if (i === STEP_FORM) {
        intro.hidden = true;
        form.hidden = false;
        form.dataset.dir = dir;
        return;
      }
      form.hidden = true;
      intro.hidden = false;
      slides.forEach((s, k) => {
        const on = k === i;
        if (on && !s.classList.contains('is-active')) {
          s.dataset.dir = dir;
          s.classList.add('is-active');
        }
        if (!on) s.classList.remove('is-active');
        s.inert = !on;
      });
    };

    const go = (i) => {
      if (boarding || i === current || i < 0 || i > STEP_FORM) return;
      if (i > 0 && !picks.ally) return; // primero, quien se registra
      const dir = i > current ? 'next' : 'prev';
      if (i === STEP_FORM) prepareForm();
      showScene(i, dir);
      showSide(i, dir);
      flight.goTo(i);
      current = i;
      paintNav();
      // En una columna el panel queda arriba: se sube a el para ver el cambio
      // de escena y el vuelo, con los controles justo debajo.
      if (!window.matchMedia('(min-width: 961px)').matches && panel.getBoundingClientRect().top < 0) {
        panel.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
      if (i === STEP_FORM) form.querySelector('#company').focus({ preventScroll: true });
    };

    const flight = createFlight(info.querySelector('[data-flight]'), { onStop: go });

    // --- Quien se registra --------------------------------------------------

    const setPersonType = (pt) => {
      picks.personType = pt;
      intro.querySelectorAll('[data-pick-person]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pickPerson === pt)));
      document.getElementById('intro-docs').innerHTML = renderDocList(pt);
      document.getElementById('scene-docs').innerHTML = renderDocFan(pt);
    };

    const setAlly = (key) => {
      const changed = picks.ally !== key;
      picks.ally = key;
      panel.dataset.ally = key;
      intro.querySelectorAll('[data-pick-ally]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pickAlly === key)));
      info.querySelectorAll('[data-profile]').forEach((el) => el.classList.toggle('is-picked', el.dataset.profile === key));
      flight.setLabels(type().stops);
      document.getElementById('pass-no').textContent = type().passNo;
      document.getElementById('pass-to').textContent = key === 'medico' ? 'Tus pacientes' : 'Tu red';
      if (changed && key === 'medico' && picks.practice) setPersonType(picks.practice);
      paintNav();
    };

    // Pasar el cursor por una opcion la enciende tambien en el panel.
    intro.addEventListener('pointerover', (event) => {
      const ally = event.target.closest('[data-pick-ally]')?.dataset.pickAlly;
      info.querySelectorAll('[data-profile]').forEach((el) => el.classList.toggle('is-preview', el.dataset.profile === ally));
      const perk = event.target.closest('[data-pick-channel], [data-pick-practice]');
      const key = perk?.dataset.pickChannel || perk?.dataset.pickPractice;
      info.querySelectorAll('[data-perk]').forEach((li) => li.classList.toggle('is-preview', li.dataset.perk === key));
    });
    intro.addEventListener('pointerleave', () => {
      info.querySelectorAll('.is-preview').forEach((el) => el.classList.remove('is-preview'));
    });

    const paintPerk = () => {
      const key = picks.ally === 'medico' ? picks.practice : picks.channel;
      info.querySelectorAll('[data-perk]').forEach((li) => li.classList.toggle('is-picked', li.dataset.perk === key));
    };

    intro.addEventListener('click', (event) => {
      const ally = event.target.closest('[data-pick-ally]');
      if (ally) {
        const first = !picks.ally;
        setAlly(ally.dataset.pickAlly);
        // La primera eleccion avanza sola: es la unica pregunta de esta pantalla.
        if (first) setTimeout(() => { if (current === 0) go(1); }, prefersReducedMotion() ? 0 : 380);
        return;
      }
      const channel = event.target.closest('[data-pick-channel]');
      if (channel) {
        picks.channel = channel.dataset.pickChannel;
        intro.querySelectorAll('[data-pick-channel]').forEach((b) => b.setAttribute('aria-pressed', String(b === channel)));
        paintPerk();
        return;
      }
      const practice = event.target.closest('[data-pick-practice]');
      if (practice) {
        picks.practice = practice.dataset.pickPractice;
        intro.querySelectorAll('[data-pick-practice]').forEach((b) => b.setAttribute('aria-pressed', String(b === practice)));
        setPersonType(picks.practice);
        paintPerk();
        return;
      }
      const person = event.target.closest('[data-pick-person]');
      if (person) setPersonType(person.dataset.pickPerson);
    });

    // --- Simuladores (control a la derecha, cifra grande en el panel) --------

    const countTo = (el, target, format = (n) => n) => {
      const from = Number(el.dataset.value ?? target);
      el.dataset.value = target;
      el.__tw?.cancel();
      el.__tw = tween(420, (t) => 1 - (1 - t) ** 3, (e) => { el.textContent = format(Math.round(from + (target - from) * e)); });
    };

    const sim = document.getElementById('sim-volume');
    const pctEl = document.getElementById('scene-pct');
    pctEl.dataset.value = pctEl.textContent;
    const paintSim = () => {
      const volume = SIM_STOPS[Number(sim.value)];
      const tier = tierFor(volume);
      document.getElementById('sim-volume-out').textContent = `${formatCurrency(volume)}${volume === SIM_STOPS[SIM_STOPS.length - 1] ? ' o más' : ''}`;
      document.getElementById('sim-return').textContent = formatCurrency(volume * tier.pct);
      document.getElementById('scene-tier').textContent = tier.name;
      info.querySelectorAll('[data-ladder]').forEach((el) => el.classList.toggle('is-current', el.dataset.ladder === tier.key));
      sim.style.setProperty('--fill', `${(Number(sim.value) / (SIM_STOPS.length - 1)) * 100}%`);
      countTo(pctEl, Math.round(tier.pct * 100));
    };
    sim.addEventListener('input', paintSim);
    paintSim();

    const cost = document.getElementById('sim-cost');
    const margin = document.getElementById('sim-margin');
    const gainEl = document.getElementById('scene-gain');
    gainEl.dataset.value = MED_COST.start * (MED_MARGIN.start / 100);
    const paintMed = () => {
      const c = Number(cost.value);
      const m = Number(margin.value);
      const gain = Math.round(c * (m / 100));
      document.getElementById('sim-cost-out').textContent = formatCurrency(c);
      document.getElementById('sim-margin-out').textContent = `${m}%`;
      document.getElementById('scene-margin').textContent = `${m}%`;
      document.getElementById('split-gain').style.flexGrow = m;
      document.getElementById('split-total').textContent = formatCurrency(c + gain);
      cost.style.setProperty('--fill', `${((c - MED_COST.min) / (MED_COST.max - MED_COST.min)) * 100}%`);
      margin.style.setProperty('--fill', `${((m - MED_MARGIN.min) / (MED_MARGIN.max - MED_MARGIN.min)) * 100}%`);
      countTo(gainEl, gain, formatCurrency);
    };
    cost.addEventListener('input', paintMed);
    margin.addEventListener('input', paintMed);
    paintMed();

    // --- Pase de abordaje en vivo ---------------------------------------------

    const setPass = (key, value) => {
      const dd = pass.querySelector(`[data-pass="${key}"]`);
      if (!dd) return;
      const text = String(value || '').trim() || dd.dataset.empty;
      if (dd.textContent === text) return;
      dd.textContent = text;
      dd.classList.toggle('is-filled', text !== dd.dataset.empty);
      dd.classList.remove('is-typing');
      void dd.offsetWidth;
      dd.classList.add('is-typing');
    };

    // Etiquetas del formulario segun quien se registra y como.
    const applyPersonType = (pt) => {
      const medico = picks.ally === 'medico';
      const natural = pt === 'natural';
      const label = form.querySelector('label[for="company"]');
      const input = form.querySelector('#company');
      label.textContent = medico ? (natural ? 'Nombre de tu consulta' : 'Razón social de la clínica') : (natural ? 'Nombre del negocio' : 'Razón social');
      input.placeholder = medico ? (natural ? 'Dra. Laura Pérez · Dermatología' : 'Clínica S.A.S.') : (natural ? 'Tu negocio' : 'Empresa S.A.S.');
      form.querySelector('label[for="nit"]').textContent = natural ? 'NIT o cédula' : 'NIT';
      form.querySelector('#position').placeholder = medico ? 'Médico, director médico...' : 'Gerente, director...';
      setPass('personType', medico ? (natural ? 'Independiente' : 'Clínica') : (natural ? 'Natural' : 'Jurídica'));
      const empty = medico ? 'Tu consulta' : natural ? 'Tu negocio' : 'Tu empresa';
      const dd = pass.querySelector('[data-pass="company"]');
      dd.dataset.empty = empty;
      if (!dd.classList.contains('is-filled')) dd.textContent = empty;
    };

    const paintClase = () => {
      if (picks.ally === 'medico') setPass('clase', form.querySelector('#specialty').value || 'Médico');
      else setPass('clase', CHANNEL_LABEL[form.querySelector('input[name="channel"]:checked')?.value]);
    };

    /** Lo elegido en el recorrido llega marcado al formulario y al pase. */
    function prepareForm() {
      if (picks.ally !== 'medico' && picks.channel) form.querySelector(`input[name="channel"][value="${picks.channel}"]`).checked = true;
      form.querySelector(`input[name="personType"][value="${picks.personType}"]`).checked = true;
      applyPersonType(picks.personType);
      paintClase();
    }

    form.addEventListener('input', (event) => {
      const { name, value } = event.target;
      if (['company', 'nit', 'contactName'].includes(name)) setPass(name, value);
      if (name === 'specialty') paintClase();
      // Al corregir un campo, su error desaparece.
      const el = form.querySelector(`[data-error-for="${name}"]`);
      if (el) el.textContent = '';
      event.target.closest('.register__check')?.classList.remove('is-error');
    });
    form.addEventListener('change', (event) => {
      if (event.target.name === 'personType') { picks.personType = event.target.value; applyPersonType(event.target.value); }
      if (event.target.name === 'channel') paintClase();
    });

    // El pase se inclina con el cursor, como una tarjeta de verdad.
    const wrap = document.getElementById('pass-wrap');
    if (window.matchMedia('(pointer: fine)').matches && !prefersReducedMotion()) {
      let raf = 0;
      wrap.addEventListener('pointermove', (event) => {
        const r = wrap.getBoundingClientRect();
        const x = (event.clientX - r.left) / r.width - 0.5;
        const y = (event.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          pass.style.setProperty('--tilt-x', `${(-y * 7).toFixed(2)}deg`);
          pass.style.setProperty('--tilt-y', `${(x * 9).toFixed(2)}deg`);
          pass.style.setProperty('--shine-x', `${((x + 0.5) * 100).toFixed(1)}%`);
          pass.classList.add('is-tilting');
        });
      });
      wrap.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        pass.classList.remove('is-tilting');
        pass.style.setProperty('--tilt-x', '0deg');
        pass.style.setProperty('--tilt-y', '0deg');
      });
    }

    // --- Navegacion ------------------------------------------------------------

    nextBtn.addEventListener('click', () => go(current + 1));
    prevBtn.addEventListener('click', () => go(current - 1));
    skipBtn.addEventListener('click', () => go(STEP_FORM));
    form.querySelector('[data-intro-reopen]').addEventListener('click', () => go(STEP_FORM - 1));
    form.querySelector('[data-change-ally]').addEventListener('click', () => go(0));

    // Flechas del teclado: avanzar y volver (fuera de los campos de texto).
    const onKey = (event) => {
      if (!document.body.contains(panel)) { document.removeEventListener('keydown', onKey); return; }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const tag = event.target.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target.isContentEditable) return;
      if (event.key === 'ArrowRight' && current < STEP_FORM) go(current + 1);
      if (event.key === 'ArrowLeft' && current > 0) go(current - 1);
    };
    document.addEventListener('keydown', onKey);

    paintNav();

    // --- Despegue ----------------------------------------------------------------

    /**
     * Como en una sola toma: el formulario se esconde detras del panel, el
     * panel (con el pase) queda al centro, se sella y el avion despega.
     */
    const board = async (resultado) => {
      boarding = true;
      const reduce = prefersReducedMotion();
      const desktop = window.matchMedia('(min-width: 961px)').matches;
      const pr = panel.getBoundingClientRect();
      const ir = info.getBoundingClientRect();

      if (resultado?.cuentaExistente) {
        document.getElementById('register-done-lead').textContent = 'Quedaste registrado. Este correo ya tenía acceso al portal: entra con tu contraseña de siempre.';
        document.getElementById('register-done-steps').firstElementChild.innerHTML = '<strong>Entra al portal</strong><span>Con la contraseña que ya tienes.</span>';
      }

      info.style.minHeight = `${Math.round(ir.height)}px`;
      panel.classList.add('is-boarding');
      form.inert = true;
      const opts = (duration, delay = 0) => ({ duration: reduce ? 0 : duration, delay: reduce ? 0 : delay, easing: EASE_FLIGHT, fill: 'forwards' });

      if (desktop) {
        const dx = (pr.left + pr.width / 2) - (ir.left + ir.width / 2);
        const panelStyle = getComputedStyle(panel);
        const moves = [
          main.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-22%) scale(0.94)', opacity: 0 }], opts(640)),
          info.animate([
            { transform: 'none', borderRadius: '0px', boxShadow: '0 0 0 rgba(0, 20, 52, 0)' },
            { transform: `translateX(${dx}px)`, borderRadius: '28px', boxShadow: '0 30px 80px rgba(0, 20, 52, 0.38)' },
          ], opts(900, 80)),
          panel.animate([
            { backgroundColor: panelStyle.backgroundColor, boxShadow: panelStyle.boxShadow },
            { backgroundColor: 'rgba(255, 255, 255, 0)', boxShadow: '0 0 0 rgba(0, 20, 52, 0)' },
          ], opts(380)),
        ];
        await Promise.all(moves.map((m) => m.finished));
        // Se fija el acomodo final (una columna centrada, que la hoja de
        // estilos pinta igual al ultimo cuadro) y se sueltan las animaciones:
        // el panel queda justo donde termino el viaje, aunque cambie el ancho.
        panel.style.setProperty('--boarded-width', `${Math.round(ir.width)}px`);
        panel.classList.add('is-boarded');
        moves.forEach((m) => m.cancel());
      } else {
        // Sube al pase mientras el formulario se desvanece: sin cuadro en blanco.
        info.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        await main.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px)' }], opts(520)).finished;
        panel.classList.add('is-boarded');
        await wait(200);
      }

      // Sello y despegue.
      pass.classList.add('is-confirmed');
      document.getElementById('pass-status').textContent = `Acceso temporal · ${ACCESS_DAYS} días`;
      await wait(420);
      await flight.takeOff();

      // La ruta se va con el avion y aparecen los proximos pasos.
      const foot = info.querySelector('.register__foot');
      await foot.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px)' }], opts(320)).finished;
      foot.hidden = true;
      document.getElementById('register-after').hidden = false;
      document.getElementById('register-after-title').focus({ preventScroll: true });
    };

    // --- Envio -------------------------------------------------------------------

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (boarding) return;
      alert.hidden = true;
      form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));

      const raw = Object.fromEntries(new FormData(form).entries());
      const medico = picks.ally === 'medico';
      const data = {
        allyType: medico ? 'medico' : 'empresa',
        personType: raw.personType || '',
        company: String(raw.company || '').trim(),
        nit: String(raw.nit || '').trim(),
        employees: medico ? '' : raw.employees || '',
        channel: medico ? '' : raw.channel || '',
        specialty: medico ? String(raw.specialty || '').trim() : '',
        contactName: String(raw.contactName || '').trim(),
        position: String(raw.position || '').trim(),
        email: String(raw.email || '').trim().toLowerCase(),
        phone: String(raw.phone || '').trim(),
      };

      const errors = validate(data);
      Object.entries(errors).forEach(([name, message]) => {
        const el = form.querySelector(`[data-error-for="${name}"]`);
        if (el) el.textContent = message;
      });

      let consentOk = true;
      form.querySelectorAll('.register__check input').forEach((box) => {
        box.closest('.register__check').classList.toggle('is-error', !box.checked);
        if (!box.checked) consentOk = false;
      });

      const firstError = Object.keys(errors)[0];
      if (firstError) {
        form.querySelector(`[name="${firstError}"]`)?.focus();
        return;
      }
      if (!consentOk) {
        alert.textContent = 'Marca las dos autorizaciones para enviar la solicitud.';
        alert.hidden = false;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.classList.add('is-loading');
      submitBtn.setAttribute('aria-label', 'Enviando…');
      try {
        // El giro dura al menos lo suficiente para leerse como un gesto, no un parpadeo.
        const [resultado] = await Promise.all([
          submitRequest({
            ...data,
            origin,
            website: raw.website || '',
            data_consent: 'si',
            terms_consent: 'si',
            consent_version: CONSENT_VERSION,
            landing_page: 'portal/registro',
            referrer: document.referrer || '',
          }),
          wait(750),
        ]);
        submitBtn.classList.replace('is-loading', 'is-sent');
        submitBtn.setAttribute('aria-label', 'Enviado');
        await wait(520);
        await board(resultado);
      } catch (error) {
        submitBtn.classList.remove('is-loading', 'is-sent');
        submitBtn.removeAttribute('aria-label');
        submitBtn.disabled = false;
        alert.textContent = error.message;
        alert.hidden = false;
      }
    });
  },
};
