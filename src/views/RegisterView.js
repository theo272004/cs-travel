/**
 * RegisterView.js
 * =============================================================================
 * PROPOSITO:
 *   Registro de una empresa como ALIADA sin salir del portal. Sustituye el
 *   salto a la landing cstravelgroup.com/aliados desde el login.
 *
 * DISENO:
 *   Mismo fondo y cabecera del login. Debajo, un panel horizontal:
 *     - izquierda: lo que la empresa necesita saber (resumen de la landing),
 *     - derecha: el formulario corto de solicitud.
 *
 * QUE SE PIDE (y que NO):
 *   Solo lo necesario para evaluar la solicitud y llamar a quien decide:
 *   empresa, NIT, tamano, canal de interes y los datos del decisor, mas las
 *   autorizaciones de Habeas Data (Ley 1581 de 2012) y Terminos.
 *   Los documentos (RUT, camara de comercio, cedula del representante legal y
 *   certificacion bancaria) y la contrasena se piden DESPUES de la aprobacion,
 *   al firmar el acuerdo en el portal. Asi el primer paso toma dos minutos.
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

/** Version de los textos legales aceptados (igual a la de la landing). */
const CONSENT_VERSION = '2026-09-17';

/** Clave donde el demo guarda las solicitudes (la lee AdminAlliesView). */
export const DEMO_ALLY_REQUESTS_KEY = 'cs_travel_demo_ally_requests';

const SITE = 'https://www.cstravelgroup.com';

const CHANNELS = [
  { value: 'ejecutivo', label: 'Ejecutivo', hint: 'Viajes de la alta dirección' },
  { value: 'comunidad', label: 'Comunidad', hint: 'Clientes y red de la empresa' },
  { value: 'colaboradores', label: 'Colaboradores', hint: 'Beneficio para el equipo' },
];

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
  if (!isNotEmpty(data.company)) errors.company = 'Escribe el nombre de la empresa.';
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
    return;
  }

  // Demo: la solicitud queda en este navegador y la ve el admin demo.
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
    origin: data.origin,
    status: 'pendiente',
    tags: [],
    owner: '',
    notes: [],
    history: [{ at: now, by: 'formulario', from: '', to: 'pendiente' }],
    memberId: '',
    createdAt: now,
  });
  localStorage.setItem(DEMO_ALLY_REQUESTS_KEY, JSON.stringify(list.slice(0, 20)));
  await new Promise((resolve) => setTimeout(resolve, 450));
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
            <p class="register__eyebrow">Programa de aliados</p>
            <h1 class="register__title" id="register-title">Tu empresa viaja con retorno</h1>
            <p class="register__lead">
              Ahorro frente a las plataformas de reserva, soporte 24/7 y un retorno por cada
              viaje que tu empresa y su red hacen con nosotros. Todo desde este portal.
            </p>

            <ol class="register__steps">
              <li><strong>Envías la solicitud</strong><span>Dos minutos, sin documentos.</span></li>
              <li><strong>Te contactamos</strong><span>En menos de un día hábil.</span></li>
              <li><strong>Firmas y activamos</strong><span>Firmas el acuerdo en línea y cargas los documentos.</span></li>
            </ol>

            <div class="register__docs">
              <p>Ten a mano para la activación</p>
              <ul>
                <li>RUT</li>
                <li>Cámara de Comercio</li>
                <li>Cédula del representante legal</li>
                <li>Certificación bancaria de la empresa</li>
              </ul>
            </div>

            <div class="register__contact">
              <a href="mailto:info.cstravelgroup@gmail.com">info.cstravelgroup@gmail.com</a>
              <a href="https://wa.me/573146103599" target="_blank" rel="noopener">WhatsApp +57 314 610 3599</a>
            </div>
          </aside>

          <div class="register__main">
            <form id="register-form" class="register__form" novalidate>
              <div class="register__head">
                <h2>Registra tu empresa</h2>
                <p>Revisamos cada solicitud y te contactamos para activar el acceso.</p>
              </div>

              <fieldset class="register__group">
                <legend>Tu empresa</legend>
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
              <h2>Solicitud recibida</h2>
              <p>Tu solicitud quedó registrada y está <strong>pendiente de aprobación</strong>. Nuestro equipo ya recibió el aviso.</p>
              <ol class="register__steps register__steps--light">
                <li><strong>Te contactamos</strong><span>Para conocer a tu empresa.</span></li>
                <li><strong>Aprobamos el acceso</strong><span>Te llega un correo para crear tu contraseña.</span></li>
                <li><strong>Firmas el acuerdo</strong><span>En línea, aquí mismo, y activamos tus beneficios.</span></li>
              </ol>
              <a href="#/login" class="btn btn--ghost">Volver al inicio de sesión</a>
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
        await submitRequest({
          ...data,
          origin,
          website: raw.website || '',
          data_consent: 'si',
          terms_consent: 'si',
          consent_version: CONSENT_VERSION,
          landing_page: 'portal/registro',
          referrer: document.referrer || '',
        });
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
