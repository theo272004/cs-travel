/**
 * RegisterView.js
 * =============================================================================
 * PROPOSITO:
 *   Registro de una empresa como ALIADA sin salir del portal. Sustituye el
 *   salto a la landing cstravelgroup.com/aliados desde el login.
 *
 * DISENO:
 *   Mismo fondo y cabecera del login. Debajo, un panel horizontal:
 *     - izquierda: el programa en una mirada,
 *     - derecha: primero un recorrido corto para CONOCER el programa (a quien
 *       le das el beneficio, cuanto recibe tu empresa, como es el proceso y
 *       que documentos vas a necesitar) y al final el formulario. Lo que se
 *       elige en el recorrido (canal, tipo de persona) llega ya marcado al
 *       formulario: nada se pregunta dos veces. Quien ya lo conoce lo salta.
 *
 * QUE SE PIDE (y que NO):
 *   Solo lo necesario para crear el acceso temporal y llamar a quien decide:
 *   tipo de persona, empresa, NIT, tamano, canal de interes y los datos del
 *   decisor, mas las autorizaciones de Habeas Data (Ley 1581 de 2012) y
 *   Terminos. Los documentos y la firma del acuerdo van despues, en el
 *   expediente del portal (CompanyPartnerView). Asi el primer paso toma dos
 *   minutos.
 *
 * DATOS:
 *   Portal real (/portal-app/): POST /api/aliados/solicitud, el mismo contrato
 *   que el formulario de la landing; la solicitud llega a la bandeja de Aliados.
 *   Demo (GitHub Pages): se guarda en localStorage y aparece en la bandeja de
 *   Aliados del admin demo.
 * =============================================================================
 */

import logoCs from '../assets/logo-cs.png';
import { isValidEmail, isNotEmpty } from '../utils/validators.js';
import { isDeployedBundle } from '../utils/env.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { TIERS } from '../components/AlliedValue.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { PERSON_TYPES, ACCESS_DAYS, requiredDocs } from '../utils/allyOnboarding.js';
import { renderFlightRoute, createFlight, tween, prefersReducedMotion, EASE_FLIGHT, FLIGHT_STOPS } from '../components/AllyFlight.js';

/** Version de los textos legales aceptados (igual a la de la landing). */
const CONSENT_VERSION = '2026-09-17';

/** Clave donde el demo guarda las solicitudes (la lee AdminAlliesView). */
export const DEMO_ALLY_REQUESTS_KEY = 'cs_travel_demo_ally_requests';

const SITE = 'https://www.cstravelgroup.com';

const CHANNELS = [
  { value: 'ejecutivo', label: 'Ejecutivo', hint: 'Viajes de la alta dirección', gets: 'Tarifas mayoristas netas, sin cargos de agencia, también para su familia.' },
  { value: 'comunidad', label: 'Comunidad', hint: 'Clientes y red de la empresa', gets: 'Un enlace con tu código: tarifas por debajo de las plataformas de reserva y promociones.' },
  { value: 'colaboradores', label: 'Colaboradores', hint: 'Beneficio para el equipo', gets: 'Tarifas preferenciales y financiación sin intereses para sus viajes personales.' },
];

// Paradas del simulador: volumen neto quincenal de la red (COP).
const SIM_STOPS = [5e6, 10e6, 15e6, 20e6, 30e6, 45e6, 55e6, 80e6, 100e6, 120e6, 150e6, 200e6];
const tierFor = (v) => TIERS.find((t) => v <= t.max) || TIERS[TIERS.length - 1];

const EMPLOYEES = [
  ['1-10', '1 a 10'],
  ['11-50', '11 a 50'],
  ['51-200', '51 a 200'],
  ['201-500', '201 a 500'],
  ['500+', 'Más de 500'],
];

/** Codigo de origen (?ref= o ?origen=) que trae al aliado: base de comisiones. */
function readOrigin() {
  const hashQuery = window.location.hash.split('?')[1] || '';
  const params = new URLSearchParams(hashQuery || window.location.search);
  return (params.get('ref') || params.get('origen') || '').trim().slice(0, 40);
}

function validate(data) {
  const errors = {};
  if (!PERSON_TYPES[data.personType]) errors.personType = 'Elige el tipo de persona.';
  if (!isNotEmpty(data.company)) errors.company = data.personType === 'natural' ? 'Escribe el nombre del negocio.' : 'Escribe el nombre de la empresa.';
  const nit = data.nit.replace(/[\s.]/g, '');
  if (!/^\d{6,10}(-?\d)?$/.test(nit)) errors.nit = 'Revisa el NIT (ej. 900123456-7).';
  if (!data.employees) errors.employees = 'Selecciona un rango.';
  if (!data.channel) errors.channel = 'Elige el canal que más te interesa.';
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
    company: data.company,
    nit: data.nit,
    contactName: data.contactName,
    position: data.position,
    phone: data.phone,
    email: data.email,
    employees: data.employees,
    channel: data.channel,
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
// El vuelo del aliado
// ---------------------------------------------------------------------------
// El registro se recorre como un vuelo: el panel azul (izquierda) es la
// pantalla y nunca desaparece; la derecha son los controles. Cada paso mueve
// las tres cosas a la vez, como una sola toma: la escena del panel entra con un
// barrido vertical, la pantalla de la derecha con uno lateral y el avion vuela
// a la siguiente parada de la ruta. Al enviar, el formulario se esconde detras
// del panel, el pase de abordaje queda al centro, se sella y el avion despega.

const STEP_FORM = 4;
const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label]));

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

const PERKS = [
  { key: 'empresa', title: 'Tu empresa', text: 'Un retorno por cada reserva de tu red, pagado cada quincena y visible en tu dashboard.', icon: '<path d="M3 19h18" /><path d="M7 19v-5" /><path d="M12 19V9" /><path d="M17 19V5" />' },
  { key: 'ejecutivo', title: 'Directivos', text: 'Tarifas mayoristas netas, sin cargos de agencia, también para su familia.', icon: '<path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8Z" />' },
  { key: 'colaboradores', title: 'Colaboradores', text: 'Tarifas preferenciales y financiación sin intereses para sus viajes personales.', icon: '<circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6" /><path d="M18 14.3c1.6.7 2.7 2.3 3 4.7" />' },
  { key: 'comunidad', title: 'Clientes y comunidad', text: 'Un enlace con tu código: tarifas bajo las plataformas de reserva y promociones.', icon: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />' },
];

const PLANE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" transform="rotate(90 12 12)" /></svg>';

/** Escenas del panel azul, una por parada de la ruta. */
function renderScenes() {
  const start = tierFor(SIM_STOPS[SIM_START]);
  return `
    <div class="register__stage">
      <section class="register__scene is-active" data-scene="0">
        <p class="register__eyebrow">CS Allied Value Partnership</p>
        <h1 class="register__title" id="register-title">Tu empresa viaja con retorno</h1>
        <p class="register__lead">
          Un programa de bienestar empresarial y fidelización: le das a tu red beneficios
          de viaje reales y tu empresa genera un ingreso adicional. Nosotros asumimos toda la
          gestión: cotización, reservas, pagos, logística y servicio al cliente.
        </p>
        <ul class="register__perks" aria-label="Beneficios por público">
          ${PERKS.map((p) => `
            <li data-perk="${p.key}">
              <svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg>
              <strong>${p.title}</strong>
              <span>${p.text}</span>
            </li>`).join('')}
        </ul>
        <ul class="register__terms" aria-label="Condiciones">
          <li>Sin inversión inicial</li>
          <li>Sin mínimos de volumen</li>
          <li>Sin permanencia</li>
        </ul>
      </section>

      <section class="register__scene" data-scene="1" inert>
        <p class="register__eyebrow">Tu retorno</p>
        <div class="scene-return">
          <p class="scene-return__pct"><strong id="scene-pct">${Math.round(start.pct * 100)}</strong><span>%</span></p>
          <p class="scene-return__tier">Tramo <strong id="scene-tier">${start.name}</strong></p>
          <p class="scene-return__lead">de nuestra utilidad neta por cada viaje que compra tu red, liquidado cada quincena.</p>
        </div>
        <div class="scene-ladder" role="img" aria-label="Tramos de retorno: 25, 30, 35 y 40 por ciento">
          ${TIERS.map((t) => `
            <div class="scene-ladder__col ${t.key === start.key ? 'is-current' : ''}" data-ladder="${t.key}" style="--h:${Math.round((t.pct / 0.4) * 100)}%">
              <span class="scene-ladder__bar"><em>${Math.round(t.pct * 100)}%</em></span>
              <span class="scene-ladder__name">${t.name}</span>
            </div>`).join('')}
        </div>
      </section>

      <section class="register__scene" data-scene="2" inert>
        <p class="register__eyebrow">El proceso</p>
        <h2 class="register__title">Todo en línea. Sin papeleo.</h2>
        <div class="scene-facts">
          <div><strong>2 min</strong><span>para registrarte, sin documentos</span></div>
          <div><strong>${ACCESS_DAYS} días</strong><span>para completar tu expediente</span></div>
          <div><strong>100%</strong><span>en línea: subes, firmas y listo</span></div>
        </div>
        <p class="register__lead">Cada paso te llega por correo. Si algo falta, te decimos exactamente qué.</p>
      </section>

      <section class="register__scene" data-scene="3" inert>
        <p class="register__eyebrow">Requisitos</p>
        <h2 class="register__title">Tu expediente, desde el celular.</h2>
        <ul class="scene-docs" id="scene-docs">${renderDocFan('juridica')}</ul>
        <p class="register__lead">Todo queda en PDF. La cédula también puede ir en fotos: las convertimos por ti.</p>
      </section>

      <section class="register__scene" data-scene="4" inert>
        <div class="pass-wrap">
        <article class="pass" id="register-pass" aria-label="Pase de abordaje de tu empresa">
          <header class="pass__head">
            <img src="${logoCs}" alt="" class="pass__logo" />
            <span class="pass__kind">Pase de abordaje</span>
            <span class="pass__no">CS · ${new Date().getFullYear()} · ALIADO</span>
          </header>
          <div class="pass__route">
            <div><strong>COL</strong><span>Colombia</span></div>
            <span class="pass__plane">${PLANE_ICON}</span>
            <div class="pass__to"><strong>MUNDO</strong><span>Tu red</span></div>
          </div>
          <dl class="pass__grid">
            <div class="pass__wide"><dt>Aliado</dt><dd data-pass="company" data-empty="Tu empresa">Tu empresa</dd></div>
            <div><dt>NIT</dt><dd data-pass="nit" data-empty="—">—</dd></div>
            <div class="pass__wide"><dt>Pasajero</dt><dd data-pass="contactName" data-empty="Quien decide">Quien decide</dd></div>
            <div><dt>Clase</dt><dd data-pass="channel" data-empty="Tu canal">Tu canal</dd></div>
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
        </article>
        </div>

        <div class="register__after" id="register-after" hidden>
          <h2 tabindex="-1" id="register-after-title">¡Bienvenido a bordo!</h2>
          <p id="register-done-lead">Tu empresa quedó registrada y ya creamos tu acceso al portal.</p>
          <ol class="register__steps" id="register-done-steps">
            <li><strong>Revisa tu correo</strong><span>Te enviamos un enlace para crear tu contraseña.</span></li>
            <li><strong>Completa tu expediente</strong><span>Documentos y firma en una sola pantalla. Tienes ${ACCESS_DAYS} días.</span></li>
            <li><strong>Revisión y activación</strong><span>Te avisamos por correo y se activa tu código.</span></li>
          </ol>
          <a href="#/login" class="btn btn--primary">Ir al inicio de sesión</a>
        </div>
      </section>
    </div>`;
}

const SIM_START = SIM_STOPS.indexOf(20e6);

function renderIntro() {
  return `
    <div class="register__intro" id="register-intro">
      <div class="register__intro-top">
        <span class="register__step-label" id="register-step-label">Paso 1 de 5 · Beneficio</span>
        <button type="button" class="register__skip" data-intro-skip>Ya lo conozco: registrarme</button>
      </div>

      <div class="register__slides" aria-live="polite">
        <section class="register__slide is-active" data-slide="0">
          <h2>¿A quién le quieres dar el beneficio?</h2>
          <p class="register__slide-lead">Elige por dónde empezar. Luego puedes abrirlo a los demás.</p>
          <div class="register__picks">
            ${CHANNELS.map((c) => `
              <button type="button" class="register__pick" data-pick-channel="${c.value}" aria-pressed="false">
                <strong>${c.label}</strong>
                <span class="register__pick-hint">${c.hint}</span>
                <span class="register__pick-gets">${c.gets}</span>
              </button>`).join('')}
          </div>
        </section>

        <section class="register__slide" data-slide="1" inert>
          <h2>Cuánto recibe tu empresa</h2>
          <p class="register__slide-lead">
            Mueve el control: el porcentaje sube con el volumen de cada quincena.
          </p>
          <div class="register__sim">
            <label for="sim-volume" class="register__sim-label">Utilidad neta que genera tu red en una quincena</label>
            <output class="register__sim-volume" id="sim-volume-out" for="sim-volume">${formatCurrency(SIM_STOPS[SIM_START])}</output>
            <input type="range" id="sim-volume" min="0" max="${SIM_STOPS.length - 1}" step="1" value="${SIM_START}" />
            <p class="register__sim-result">Tu empresa recibiría <strong id="sim-return">${formatCurrency(SIM_STOPS[SIM_START] * tierFor(SIM_STOPS[SIM_START]).pct)}</strong> esa quincena.</p>
          </div>
          <p class="register__fine">Tramos del Anexo A del acuerdo, por volumen neto quincenal. Sin inversión, sin mínimos y sin permanencia.</p>
        </section>

        <section class="register__slide" data-slide="2" inert>
          <h2>Cómo es el proceso</h2>
          <p class="register__slide-lead">Lo único que te pedimos al principio son dos minutos.</p>
          <ol class="register__timeline">
            <li><strong>Te registras</strong><span>Los datos básicos de tu empresa, sin documentos.</span></li>
            <li><strong>Recibes tu acceso temporal</strong><span>Al instante, por correo. Tienes ${ACCESS_DAYS} días para completar el expediente.</span></li>
            <li><strong>Completas tu expediente</strong><span>Subes los documentos y firmas el acuerdo, en una sola pantalla.</span></li>
            <li><strong>Revisamos</strong><span>Verificamos los documentos y te avisamos por correo.</span></li>
            <li><strong>Activamos tu convenio</strong><span>Recibes tu código, tu enlace y tu QR para compartir.</span></li>
          </ol>
        </section>

        <section class="register__slide" data-slide="3" inert>
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
        <button type="button" class="btn btn--primary" data-intro-next><span>Siguiente</span></button>
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

        <section class="register" aria-labelledby="register-title">
          <aside class="register__info">
            ${renderScenes()}
            <div class="register__foot">
              ${renderFlightRoute()}
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
                <button type="button" class="register__back" data-intro-reopen>← Volver a conocer el programa</button>
                <h2>Registra tu empresa</h2>
                <p>Tu pase de abordaje se va llenando mientras escribes.</p>
              </div>

              <fieldset class="register__group">
                <legend>Tu empresa</legend>
                <div class="register__person" role="radiogroup" aria-label="Tipo de persona">
                  ${Object.entries(PERSON_TYPES).map(([value, p]) => `
                    <label class="register__person-option">
                      <input type="radio" name="personType" value="${value}" />
                      <strong>${p.label}</strong>
                      <span>${p.hint}</span>
                    </label>`).join('')}
                </div>
                <small class="form__error" data-error-for="personType"></small>
                <div class="register__grid">
                  ${field('company', 'Razón social', '<input id="company" name="company" class="form__input" autocomplete="organization" placeholder="Empresa S.A.S." />')}
                  ${field('nit', 'NIT', '<input id="nit" name="nit" class="form__input" inputmode="numeric" placeholder="900123456-7" />')}
                  ${field('employees', 'Colaboradores', `
                    <select id="employees" name="employees" class="form__input">
                      <option value="">Seleccionar...</option>
                      ${EMPLOYEES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
                    </select>`)}
                </div>
                <div class="register__channels" role="radiogroup" aria-labelledby="channel-label">
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
                  ${field('email', 'Correo corporativo', '<input id="email" name="email" type="email" class="form__input" autocomplete="email" placeholder="nombre@empresa.com" />')}
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
    const stepLabel = document.getElementById('register-step-label');
    const origin = readOrigin();
    const picks = { channel: '', personType: 'juridica' };
    let current = 0;
    let boarding = false;

    // Terminada la entrada del panel, los cambios de pantalla arrancan sin su retardo.
    setTimeout(() => panel.classList.add('is-settled'), prefersReducedMotion() ? 0 : 1100);

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
      prevBtn.hidden = i === 0;
      nextBtn.querySelector('span').textContent = i === slides.length - 1 ? 'Registrar mi empresa' : 'Siguiente';
      stepLabel.textContent = `Paso ${i + 1} de ${FLIGHT_STOPS.length} · ${FLIGHT_STOPS[i]}`;
    };

    const go = (i) => {
      if (boarding || i === current || i < 0 || i > STEP_FORM) return;
      const dir = i > current ? 'next' : 'prev';
      if (i === STEP_FORM) prepareForm();
      showScene(i, dir);
      showSide(i, dir);
      flight.goTo(i);
      current = i;
      // En una columna el panel queda arriba: se sube a el para ver el cambio
      // de escena y el vuelo, con los controles justo debajo.
      if (!window.matchMedia('(min-width: 961px)').matches && panel.getBoundingClientRect().top < 0) {
        panel.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
      if (i === STEP_FORM) form.querySelector('#company').focus({ preventScroll: true });
    };

    const flight = createFlight(info.querySelector('[data-flight]'), { onStop: go });

    // --- Lo que se elige en el recorrido se ve en el panel ------------------

    const paintPerk = () => {
      info.querySelectorAll('[data-perk]').forEach((li) => li.classList.toggle('is-picked', li.dataset.perk === picks.channel));
    };

    intro.addEventListener('click', (event) => {
      const channel = event.target.closest('[data-pick-channel]');
      if (channel) {
        picks.channel = channel.dataset.pickChannel;
        intro.querySelectorAll('[data-pick-channel]').forEach((b) => b.setAttribute('aria-pressed', String(b === channel)));
        paintPerk();
        return;
      }
      const person = event.target.closest('[data-pick-person]');
      if (person) {
        picks.personType = person.dataset.pickPerson;
        intro.querySelectorAll('[data-pick-person]').forEach((b) => b.setAttribute('aria-pressed', String(b === person)));
        document.getElementById('intro-docs').innerHTML = renderDocList(picks.personType);
        document.getElementById('scene-docs').innerHTML = renderDocFan(picks.personType);
      }
    });

    // Simulador: el control esta a la derecha; el porcentaje y los tramos,
    // grandes en el panel.
    const sim = document.getElementById('sim-volume');
    const pctEl = document.getElementById('scene-pct');
    let pctShown = Number(pctEl.textContent);
    let pctTween = null;
    const paintSim = () => {
      const volume = SIM_STOPS[Number(sim.value)];
      const tier = tierFor(volume);
      document.getElementById('sim-volume-out').textContent = `${formatCurrency(volume)}${volume === SIM_STOPS[SIM_STOPS.length - 1] ? ' o más' : ''}`;
      document.getElementById('sim-return').textContent = formatCurrency(volume * tier.pct);
      document.getElementById('scene-tier').textContent = tier.name;
      info.querySelectorAll('[data-ladder]').forEach((el) => el.classList.toggle('is-current', el.dataset.ladder === tier.key));
      sim.style.setProperty('--fill', `${(Number(sim.value) / (SIM_STOPS.length - 1)) * 100}%`);
      const target = Math.round(tier.pct * 100);
      if (target !== pctShown) {
        pctTween?.cancel();
        const from = pctShown;
        pctTween = tween(420, (t) => 1 - (1 - t) ** 3, (e) => {
          pctShown = Math.round(from + (target - from) * e);
          pctEl.textContent = pctShown;
        });
      }
    };
    sim.addEventListener('input', paintSim);
    paintSim();

    // --- Pase de abordaje en vivo ---------------------------------------------

    const pass = document.getElementById('register-pass');
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

    // En el formulario, persona natural no tiene "razon social" sino negocio.
    const applyPersonType = (pt) => {
      const label = form.querySelector('label[for="company"]');
      const input = form.querySelector('#company');
      if (label) label.textContent = pt === 'natural' ? 'Nombre del negocio' : 'Razón social';
      if (input) input.placeholder = pt === 'natural' ? 'Tu negocio' : 'Empresa S.A.S.';
      setPass('personType', PERSON_TYPES[pt]?.label.replace('Persona ', ''));
      const empty = pt === 'natural' ? 'Tu negocio' : 'Tu empresa';
      const dd = pass.querySelector('[data-pass="company"]');
      if (!dd.classList.contains('is-filled')) { dd.dataset.empty = empty; dd.textContent = empty; }
    };

    /** Lo elegido en el recorrido llega marcado al formulario y al pase. */
    function prepareForm() {
      if (picks.channel) form.querySelector(`input[name="channel"][value="${picks.channel}"]`).checked = true;
      if (!form.querySelector('input[name="personType"]:checked')) {
        form.querySelector(`input[name="personType"][value="${picks.personType}"]`).checked = true;
      }
      const pt = form.querySelector('input[name="personType"]:checked').value;
      applyPersonType(pt);
      const ch = form.querySelector('input[name="channel"]:checked')?.value;
      setPass('channel', CHANNEL_LABEL[ch]);
    }

    form.addEventListener('input', (event) => {
      const { name, value } = event.target;
      if (['company', 'nit', 'contactName'].includes(name)) setPass(name, value);
      // Al corregir un campo, su error desaparece.
      const el = form.querySelector(`[data-error-for="${name}"]`);
      if (el) el.textContent = '';
      event.target.closest('.register__check')?.classList.remove('is-error');
    });
    form.addEventListener('change', (event) => {
      if (event.target.name === 'personType') applyPersonType(event.target.value);
      if (event.target.name === 'channel') setPass('channel', CHANNEL_LABEL[event.target.value]);
    });

    // --- Navegacion ------------------------------------------------------------

    nextBtn.addEventListener('click', () => go(current + 1));
    prevBtn.addEventListener('click', () => go(current - 1));
    intro.querySelector('[data-intro-skip]').addEventListener('click', () => go(STEP_FORM));
    form.querySelector('[data-intro-reopen]').addEventListener('click', () => go(STEP_FORM - 1));

    // --- Despegue ----------------------------------------------------------------

    /**
     * Como en una sola toma: el formulario se esconde detras del panel, el
     * panel (con el pase) queda al centro, se sella y el avion despega.
     */
    const board = async (resultado) => {
      boarding = true;
      const reduce = prefersReducedMotion();
      const desktop = window.matchMedia('(min-width: 961px)').matches;
      const EASE = EASE_FLIGHT;
      const pr = panel.getBoundingClientRect();
      const ir = info.getBoundingClientRect();

      if (resultado?.cuentaExistente) {
        document.getElementById('register-done-lead').textContent = 'Tu empresa quedó registrada. Este correo ya tenía acceso al portal: entra con tu contraseña de siempre.';
        document.getElementById('register-done-steps').firstElementChild.innerHTML = '<strong>Entra al portal</strong><span>Con la contraseña que ya tienes.</span>';
      }

      info.style.minHeight = `${Math.round(ir.height)}px`;
      panel.classList.add('is-boarding');
      form.inert = true;
      const opts = (duration, delay = 0) => ({ duration: reduce ? 0 : duration, delay: reduce ? 0 : delay, easing: EASE, fill: 'forwards' });

      if (desktop) {
        const dx = (pr.left + pr.width / 2) - (ir.left + ir.width / 2);
        const moves = [
          main.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-22%) scale(0.94)', opacity: 0 }], opts(640)),
          info.animate([
            { transform: 'none', borderRadius: '0px', boxShadow: '0 0 0 rgba(0, 20, 52, 0)' },
            { transform: `translateX(${dx}px)`, borderRadius: '28px', boxShadow: '0 30px 80px rgba(0, 20, 52, 0.38)' },
          ], opts(900, 80)),
          panel.animate([
            { backgroundColor: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.76)', boxShadow: '0 28px 70px rgba(0, 20, 52, 0.28)' },
            { backgroundColor: 'rgba(255, 255, 255, 0)', borderColor: 'rgba(255, 255, 255, 0)', boxShadow: '0 0 0 rgba(0, 20, 52, 0)' },
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
      const after = document.getElementById('register-after');
      after.hidden = false;
      document.getElementById('register-after-title').focus({ preventScroll: true });
    };

    // --- Envio -------------------------------------------------------------------

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (boarding) return;
      alert.hidden = true;
      form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));

      const raw = Object.fromEntries(new FormData(form).entries());
      const data = {
        personType: raw.personType || '',
        company: String(raw.company || '').trim(),
        nit: String(raw.nit || '').trim(),
        employees: raw.employees || '',
        channel: raw.channel || '',
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
