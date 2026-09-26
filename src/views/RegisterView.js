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
// Recorrido "Conocer": cuatro pantallas antes del formulario
// ---------------------------------------------------------------------------

const INTRO_STEPS = ['Beneficio', 'Retorno', 'Proceso', 'Requisitos'];

function renderDocList(personType) {
  return requiredDocs(personType).map((d) => `
    <li>
      <strong>${escapeHtml(d.title)}</strong>
      <span>${d.images ? 'PDF o fotos de ambas caras' : 'PDF'}${d.maxAgeDays ? ` · expedido hace ${d.maxAgeDays} días o menos` : ''}</span>
    </li>`).join('');
}

function renderIntro() {
  const start = SIM_STOPS.indexOf(20e6);
  return `
    <div class="register__intro" id="register-intro">
      <div class="register__intro-top">
        <ol class="register__dots" aria-label="Pasos para conocer el programa">
          ${INTRO_STEPS.map((s, i) => `<li><button type="button" data-intro-go="${i}" class="${i === 0 ? 'is-active' : ''}" aria-label="${s}"><span>${s}</span></button></li>`).join('')}
        </ol>
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
            Por cada viaje que compra tu red, tu empresa recibe un porcentaje de nuestra utilidad neta.
            El porcentaje sube con el volumen de cada quincena.
          </p>
          <div class="register__sim">
            <label for="sim-volume" class="register__sim-label">Utilidad neta que genera tu red en una quincena</label>
            <output class="register__sim-volume" id="sim-volume-out" for="sim-volume">${formatCurrency(SIM_STOPS[start])}</output>
            <input type="range" id="sim-volume" min="0" max="${SIM_STOPS.length - 1}" step="1" value="${start}" />
            <div class="register__tiers">
              ${TIERS.map((t) => `
                <div class="register__tier" data-tier="${t.key}" style="--tier:${t.color}">
                  <strong>${Math.round(t.pct * 100)}%</strong>
                  <span>${t.name}</span>
                </div>`).join('')}
            </div>
            <p class="register__sim-result">Tu empresa recibiría <strong id="sim-return">${formatCurrency(SIM_STOPS[start] * tierFor(SIM_STOPS[start]).pct)}</strong> esa quincena.</p>
          </div>
          <p class="register__fine">Tramos del Anexo A del acuerdo, por volumen neto quincenal. Sin inversión, sin mínimos y sin permanencia.</p>
        </section>

        <section class="register__slide" data-slide="2" inert>
          <h2>Cómo es el proceso</h2>
          <p class="register__slide-lead">Todo en línea. Lo único que te pedimos al principio son dos minutos.</p>
          <ol class="register__timeline">
            <li><strong>Te registras</strong><span>Los datos básicos de tu empresa, sin documentos.</span></li>
            <li><strong>Recibes tu acceso temporal</strong><span>Al instante, por correo. Tienes ${ACCESS_DAYS} días para completar el expediente.</span></li>
            <li><strong>Completas tu expediente</strong><span>Subes los documentos y firmas el acuerdo, en una sola pantalla.</span></li>
            <li><strong>Revisamos</strong><span>Verificamos los documentos y te avisamos por correo. Si algo falta, te decimos exactamente qué.</span></li>
            <li><strong>Activamos tu convenio</strong><span>Recibes tu código, tu enlace y tu QR para compartir.</span></li>
          </ol>
        </section>

        <section class="register__slide" data-slide="3" inert>
          <h2>Qué vas a necesitar</h2>
          <p class="register__slide-lead">No lo necesitas para registrarte, pero sí para activar el convenio. Tenlo a mano.</p>
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
            <p class="register__eyebrow">CS Allied Value Partnership</p>
            <h1 class="register__title" id="register-title">Tu empresa viaja con retorno</h1>
            <p class="register__lead">
              Un programa de bienestar empresarial y fidelización: le das a tu red beneficios
              de viaje reales y tu empresa genera un ingreso adicional. Nosotros asumimos toda la
              gestión: cotización, reservas, pagos, logística y servicio al cliente.
            </p>

            <ul class="register__perks" aria-label="Beneficios por público">
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19h18" /><path d="M7 19v-5" /><path d="M12 19V9" /><path d="M17 19V5" /></svg>
                <strong>Tu empresa</strong>
                <span>Un retorno por cada reserva de tu red, pagado cada quincena y visible en tu dashboard.</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8Z" /></svg>
                <strong>Directivos</strong>
                <span>Tarifas mayoristas netas, sin cargos de agencia, también para su familia.</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6" /><path d="M18 14.3c1.6.7 2.7 2.3 3 4.7" /></svg>
                <strong>Colaboradores</strong>
                <span>Tarifas preferenciales y financiación sin intereses para sus viajes personales.</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
                <strong>Clientes y comunidad</strong>
                <span>Un enlace con tu código: tarifas bajo las plataformas de reserva y promociones.</span>
              </li>
            </ul>

            <ul class="register__terms" aria-label="Condiciones">
              <li>Sin inversión inicial</li>
              <li>Sin mínimos de volumen</li>
              <li>Sin permanencia</li>
            </ul>

            <div class="register__contact">
              <a href="mailto:info.cstravelgroup@gmail.com">info.cstravelgroup@gmail.com</a>
              <a href="https://wa.me/573146103599" target="_blank" rel="noopener">WhatsApp +57 314 610 3599</a>
            </div>
          </aside>

          <div class="register__main">
            ${renderIntro()}

            <form id="register-form" class="register__form" novalidate hidden>
              <div class="register__head">
                <button type="button" class="register__back" data-intro-reopen>← Volver a conocer el programa</button>
                <h2>Registra tu empresa</h2>
                <p>Tu acceso temporal llega al instante, por correo.</p>
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
                <button type="submit" class="btn btn--primary" id="register-submit"><span>Enviar solicitud</span></button>
                <p>¿Ya eres aliado? <a href="#/login">Inicia sesión</a></p>
              </div>
            </form>

            <div class="register__done" id="register-done" role="status" aria-live="polite" hidden>
              <span class="register__done-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              </span>
              <h2>Registro recibido</h2>
              <p id="register-done-lead">Tu empresa quedó registrada y ya creamos tu acceso al portal.</p>
              <ol class="register__steps register__steps--light" id="register-done-steps">
                <li><strong>Revisa tu correo</strong><span>Te enviamos un enlace para crear tu contraseña.</span></li>
                <li><strong>Completa tu expediente</strong><span>Subes los documentos y firmas el acuerdo en una sola pantalla. Tienes ${ACCESS_DAYS} días.</span></li>
                <li><strong>Revisión y activación</strong><span>Verificamos los documentos y te avisamos por correo; ahí queda activo tu código.</span></li>
              </ol>
              <a href="#/login" class="btn btn--ghost">Ir al inicio de sesión</a>
            </div>
          </div>
        </section>
      </div>
    `;
  },

  async afterRender() {
    const form = document.getElementById('register-form');
    const alert = document.getElementById('register-alert');
    const submitBtn = document.getElementById('register-submit');
    const done = document.getElementById('register-done');
    const origin = readOrigin();

    // --- Recorrido "Conocer" ---
    const intro = document.getElementById('register-intro');
    const slides = [...intro.querySelectorAll('[data-slide]')];
    const dots = [...intro.querySelectorAll('[data-intro-go]')];
    const prevBtn = intro.querySelector('[data-intro-prev]');
    const nextBtn = intro.querySelector('[data-intro-next]');
    const picks = { channel: '', personType: 'juridica' };
    let current = 0;

    const go = (i) => {
      if (i === current || i < 0 || i >= slides.length) return;
      // Todas las pantallas ocupan la misma celda: el panel mide lo de la mas
      // alta y no salta al cambiar de paso. La inactiva queda inerte.
      slides[current].classList.remove('is-active');
      slides[current].inert = true;
      slides[i].dataset.dir = i > current ? 'next' : 'prev';
      slides[i].inert = false;
      slides[i].classList.add('is-active'); // al aplicarse, la animacion de entrada arranca sola
      current = i;
      dots.forEach((d, k) => {
        d.classList.toggle('is-active', k === i);
        d.classList.toggle('is-done', k < i);
      });
      prevBtn.hidden = i === 0;
      nextBtn.querySelector('span').textContent = i === slides.length - 1 ? 'Registrar mi empresa' : 'Siguiente';
    };

    // En el formulario, persona natural no tiene "razon social" sino negocio.
    const applyPersonType = (pt) => {
      const label = form.querySelector('label[for="company"]');
      const input = form.querySelector('#company');
      if (label) label.textContent = pt === 'natural' ? 'Nombre del negocio' : 'Razón social';
      if (input) input.placeholder = pt === 'natural' ? 'Tu negocio' : 'Empresa S.A.S.';
    };

    const openForm = () => {
      // Lo que eligio en el recorrido llega marcado: nada se pregunta dos veces.
      if (picks.channel) form.querySelector(`input[name="channel"][value="${picks.channel}"]`).checked = true;
      form.querySelector(`input[name="personType"][value="${picks.personType}"]`).checked = true;
      applyPersonType(picks.personType);
      intro.hidden = true;
      form.hidden = false;
      form.querySelector('#company').focus({ preventScroll: true });
    };

    nextBtn.addEventListener('click', () => (current < slides.length - 1 ? go(current + 1) : openForm()));
    prevBtn.addEventListener('click', () => go(current - 1));
    dots.forEach((d) => d.addEventListener('click', () => go(Number(d.dataset.introGo))));
    intro.querySelector('[data-intro-skip]').addEventListener('click', openForm);
    form.querySelector('[data-intro-reopen]').addEventListener('click', () => {
      form.hidden = true;
      intro.hidden = false;
    });

    intro.addEventListener('click', (event) => {
      const channel = event.target.closest('[data-pick-channel]');
      if (channel) {
        picks.channel = channel.dataset.pickChannel;
        intro.querySelectorAll('[data-pick-channel]').forEach((b) => b.setAttribute('aria-pressed', String(b === channel)));
        return;
      }
      const person = event.target.closest('[data-pick-person]');
      if (person) {
        picks.personType = person.dataset.pickPerson;
        intro.querySelectorAll('[data-pick-person]').forEach((b) => b.setAttribute('aria-pressed', String(b === person)));
        document.getElementById('intro-docs').innerHTML = renderDocList(picks.personType);
      }
    });

    // Simulador: tramo y retorno de la quincena segun el volumen neto de la red.
    const sim = document.getElementById('sim-volume');
    const paintSim = () => {
      const volume = SIM_STOPS[Number(sim.value)];
      const tier = tierFor(volume);
      document.getElementById('sim-volume-out').textContent = `${formatCurrency(volume)}${volume === SIM_STOPS[SIM_STOPS.length - 1] ? ' o más' : ''}`;
      document.getElementById('sim-return').textContent = formatCurrency(volume * tier.pct);
      intro.querySelectorAll('[data-tier]').forEach((el) => el.classList.toggle('is-current', el.dataset.tier === tier.key));
      sim.style.setProperty('--fill', `${(Number(sim.value) / (SIM_STOPS.length - 1)) * 100}%`);
    };
    sim.addEventListener('input', paintSim);
    paintSim();

    form.addEventListener('change', (event) => {
      if (event.target.name === 'personType') applyPersonType(event.target.value);
    });

    // Al corregir un campo, su error desaparece.
    form.addEventListener('input', (event) => {
      const name = event.target.name;
      const el = form.querySelector(`[data-error-for="${name}"]`);
      if (el) el.textContent = '';
      event.target.closest('.register__check')?.classList.remove('is-error');
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
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

      try {
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Enviando...';
        const resultado = await submitRequest({
          ...data,
          origin,
          website: raw.website || '',
          data_consent: 'si',
          terms_consent: 'si',
          consent_version: CONSENT_VERSION,
          landing_page: 'portal/registro',
          referrer: document.referrer || '',
        });
        if (resultado && resultado.cuentaExistente) {
          const lead = document.getElementById('register-done-lead');
          const pasos = document.getElementById('register-done-steps');
          if (lead) lead.textContent = 'Tu empresa quedó registrada. Este correo ya tenía acceso al portal, así que entra con tu contraseña de siempre.';
          if (pasos) pasos.firstElementChild.innerHTML = '<strong>Entra al portal</strong><span>Con la contraseña que ya tienes.</span>';
        }
        form.hidden = true;
        done.hidden = false;
        done.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (error) {
        alert.textContent = error.message;
        alert.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = 'Enviar solicitud';
      }
    });
  },
};
