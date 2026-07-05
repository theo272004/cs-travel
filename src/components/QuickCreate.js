/**
 * QuickCreate.js
 * =============================================================================
 * PROPOSITO:
 *   Creacion rapida de solicitudes (empresa) y casos medicos (medico) desde
 *   cualquier pantalla, mediante un boton flotante "+" (FAB) en la esquina
 *   inferior que abre una ventana flotante (modal) con el formulario.
 *
 * EXPORTA:
 *   - RequestFormFields() / MedicalCaseFormFields(): campos del formulario
 *     (reutilizados tambien por las vistas de pagina completa /new).
 *   - bindRequestForm() / bindMedicalCaseForm(): validacion + envio.
 *   - QuickCreate(role): HTML del FAB + modal segun el rol.
 *   - bindQuickCreate(role): enlaza apertura/cierre y el submit del modal.
 *
 *   El router incluye QuickCreate() en el layout autenticado y llama a
 *   bindQuickCreate() despues de cada render.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { companyService } from '../services/companyService.js';
import { requestService } from '../services/requestService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { validateRequestForm, validateMedicalCaseForm } from '../utils/validators.js';
import { navigate } from '../router/router.js';
import { codeService } from '../services/codeService.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { showToast } from '../utils/toast.js';

/**
 * Conecta el campo "Código de referido" con los códigos REALES que creó el admin:
 * carga los activos y los pone como opciones (no texto libre). Si el admin no ha
 * creado ninguno, queda "No hay códigos disponibles" -> no se puede anotar uno
 * inválido. Ver [[codes-referral-discount]].
 */
async function fillReferralCodes(form) {
  const sel = form.querySelector('select[name="referralCode"]');
  if (!sel) return;
  let codes = [];
  try { codes = (await codeService.getAll()).filter((c) => c.status === 'active'); } catch {}
  if (!codes.length) {
    sel.innerHTML = '<option value="">— No hay códigos disponibles —</option>';
    return;
  }
  const label = (c) => (!(Number(c.discountValue) > 0) ? 'sin descuento' : (c.discountType === 'fixed' ? formatCurrency(c.discountValue) : `${c.discountValue}%`));
  sel.innerHTML = '<option value="">— Sin código —</option>' +
    codes.map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.code)} · ${label(c)}${c.ownerName ? ' · ' + escapeHtml(c.ownerName) : ''}</option>`).join('');
}

/** Tipos de solicitud marcados (multi-selección con checkboxes name="requestType"). */
export function selectedRequestTypes(form) {
  return [...form.querySelectorAll('input[name="requestType"]:checked')].map((c) => c.value);
}

/**
 * Muestra/oculta los campos del formulario de solicitud según el/los tipo(s)
 * elegido(s). Un grupo con `data-types="vuelo paquete"` solo aparece si alguno
 * de esos tipos está marcado. Sin nada marcado se muestran todos (estado inicial
 * neutro). Además adapta etiquetas (p. ej. en "Hotel" la fecha de ida pasa a ser
 * "Entrada (check-in)"). Reutilizada por la versión modal y la de página.
 */
export function wireRequestTypeConditional(form) {
  const checks = [...form.querySelectorAll('input[name="requestType"]')];
  if (!checks.length) return;

  const apply = () => {
    const sel = checks.filter((c) => c.checked).map((c) => c.value);
    const any = sel.length > 0;

    form.querySelectorAll('[data-types]').forEach((group) => {
      const types = (group.getAttribute('data-types') || '').split(/\s+/).filter(Boolean);
      const show = !any || types.some((t) => sel.includes(t));
      group.hidden = !show;
    });

    // Etiquetas que cambian de significado según el servicio.
    const onlyHotel = any && sel.every((t) => t === 'hotel');
    const setLabel = (attr, text) => {
      const el = form.querySelector(`[${attr}]`);
      if (el) el.textContent = text;
    };
    setLabel('data-label-date', onlyHotel ? 'Entrada (check-in) *' : 'Fecha de ida *');
    setLabel('data-label-return', onlyHotel ? 'Salida (check-out)' : 'Fecha de regreso');
    setLabel('data-label-destination', onlyHotel ? 'Ciudad / destino del hotel *' : 'Destino *');
  };

  checks.forEach((c) => c.addEventListener('change', apply));
  apply();
}

/* ---------------------------------------------------------------------------
 * Campos de formulario compartidos (sin <form> ni ids, para poder coexistir
 * la version "pagina" y la version "modal" sin colisiones).
 * ------------------------------------------------------------------------- */

export function RequestFormFields() {
  return `
    <div class="form__group form__group--full">
      <label class="form__label">Tipo de solicitud * <span class="form__hint-inline">(elige uno o varios)</span></label>
      <div class="checkbox-row" data-request-types>
        <label class="checkbox"><input type="checkbox" name="requestType" value="vuelo" /> <span>Vuelo</span></label>
        <label class="checkbox"><input type="checkbox" name="requestType" value="hotel" /> <span>Hotel</span></label>
        <label class="checkbox"><input type="checkbox" name="requestType" value="tour" /> <span>Tour / excursión</span></label>
        <label class="checkbox"><input type="checkbox" name="requestType" value="paquete" /> <span>Paquete turístico</span></label>
        <label class="checkbox"><input type="checkbox" name="requestType" value="traslado" /> <span>Traslado</span></label>
        <label class="checkbox"><input type="checkbox" name="requestType" value="sim" /> <span>SIM / eSIM</span></label>
        <label class="checkbox"><input type="checkbox" name="requestType" value="evento" /> <span>Evento</span></label>
        <label class="checkbox"><input type="checkbox" name="requestType" value="otro" /> <span>Otro</span></label>
      </div>
      <small class="form__error" data-error-for="requestType"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Número de personas *</label>
      <input type="number" name="peopleCount" class="form__input" min="1" value="1" />
      <small class="form__error" data-error-for="peopleCount"></small>
    </div>
    <div class="form__group" data-types="vuelo paquete">
      <label class="form__label">Clase del viaje *</label>
      <select name="travelClass" class="form__input">
        <option value="turista">Turista</option>
        <option value="ejecutiva">Ejecutiva / Business</option>
      </select>
      <small class="form__error" data-error-for="travelClass"></small>
    </div>
    <div class="form__group">
      <label class="form__label" data-label-date>Fecha de ida *</label>
      <input type="date" name="travelDate" class="form__input" />
      <small class="form__error" data-error-for="travelDate"></small>
    </div>
    <div class="form__group">
      <label class="form__label" data-label-return>Fecha de regreso</label>
      <input type="date" name="returnDate" class="form__input" />
      <small class="form__error" data-error-for="returnDate"></small>
    </div>
    <div class="form__group" data-types="vuelo paquete traslado">
      <label class="form__label">Origen *</label>
      <input type="text" name="origin" class="form__input" placeholder="Ciudad de salida" />
      <small class="form__error" data-error-for="origin"></small>
    </div>
    <div class="form__group">
      <label class="form__label" data-label-destination>Destino *</label>
      <input type="text" name="destination" class="form__input" placeholder="Ciudad de llegada" />
      <small class="form__error" data-error-for="destination"></small>
    </div>
    <div class="form__group" data-types="hotel paquete">
      <label class="form__label">Habitaciones</label>
      <input type="number" name="roomsCount" class="form__input" min="1" placeholder="Ej. 2" />
    </div>
    <div class="form__group" data-types="hotel paquete">
      <label class="form__label">Categoría del hotel</label>
      <select name="hotelCategory" class="form__input">
        <option value="">Indiferente</option>
        <option value="3★">3 estrellas</option>
        <option value="4★">4 estrellas</option>
        <option value="5★">5 estrellas</option>
        <option value="boutique">Boutique</option>
      </select>
    </div>
    <div class="form__group form__group--full">
      <span class="form__label">Datos del viajero principal</span>
      <p class="form__hint">Como aparecen en el documento de viaje (pasaporte o cédula).</p>
    </div>
    <div class="form__group">
      <label class="form__label">Nombres</label>
      <input type="text" name="firstName" class="form__input" placeholder="Ej. Ruby Carolina" />
    </div>
    <div class="form__group">
      <label class="form__label">Apellidos</label>
      <input type="text" name="lastName" class="form__input" placeholder="Ej. Méndez Peña" />
    </div>
    <div class="form__group">
      <label class="form__label">Tipo de documento</label>
      <select name="documentType" class="form__input">
        <option value="">Seleccionar...</option>
        <option value="pasaporte">Pasaporte</option>
        <option value="cedula">Cédula</option>
        <option value="id">ID / Identificación</option>
        <option value="otro">Otro</option>
      </select>
    </div>
    <div class="form__group">
      <label class="form__label">Número de documento</label>
      <input type="text" name="documentNumber" class="form__input" placeholder="Ej. AB123456" />
    </div>
    <div class="form__group">
      <label class="form__label">Nacionalidad</label>
      <input type="text" name="nationality" class="form__input" placeholder="Ej. Colombiana" />
    </div>
    <div class="form__group form__group--full">
      <span class="form__label">Servicios adicionales</span>
      <div class="checkbox-row">
        <label class="checkbox"><input type="checkbox" name="hasInsurance" /> <span>Seguro de viaje</span></label>
        <label class="checkbox"><input type="checkbox" name="hasActivities" /> <span>Actividades</span></label>
        <label class="checkbox"><input type="checkbox" name="hasTransfers" /> <span>Traslados</span></label>
      </div>
    </div>
    <div class="form__group form__group--full">
      <label class="form__label">Observaciones</label>
      <textarea name="observations" class="form__input" rows="3"
        placeholder="Detalles adicionales, preferencias o requerimientos especiales..."></textarea>
    </div>
  `;
}

export function MedicalCaseFormFields() {
  return `
    <div class="form__group">
      <label class="form__label">Paciente o identificador *</label>
      <input type="text" name="patientName" class="form__input" placeholder="Paciente reservado 05" />
      <small class="form__error" data-error-for="patientName"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Procedimiento / motivo *</label>
      <input type="text" name="procedure" class="form__input" placeholder="Consulta, cirugía, control..." />
      <small class="form__error" data-error-for="procedure"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Origen *</label>
      <input type="text" name="origin" class="form__input" placeholder="Ciudad de salida" />
      <small class="form__error" data-error-for="origin"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Destino *</label>
      <input type="text" name="destination" class="form__input" placeholder="Ciudad de llegada" />
      <small class="form__error" data-error-for="destination"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Fecha de ida *</label>
      <input type="date" name="travelDate" class="form__input" />
      <small class="form__error" data-error-for="travelDate"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Fecha de regreso</label>
      <input type="date" name="returnDate" class="form__input" />
      <small class="form__error" data-error-for="returnDate"></small>
    </div>
    <div class="form__group form__group--full">
      <span class="form__label">Datos del paciente</span>
      <p class="form__hint">Como aparecen en el documento de viaje (pasaporte o cédula).</p>
    </div>
    <div class="form__group">
      <label class="form__label">Nombres</label>
      <input type="text" name="firstName" class="form__input" placeholder="Ej. Ruby Carolina" />
    </div>
    <div class="form__group">
      <label class="form__label">Apellidos</label>
      <input type="text" name="lastName" class="form__input" placeholder="Ej. Méndez Peña" />
    </div>
    <div class="form__group">
      <label class="form__label">Tipo de documento</label>
      <select name="documentType" class="form__input">
        <option value="">Seleccionar...</option>
        <option value="pasaporte">Pasaporte</option>
        <option value="cedula">Cédula</option>
        <option value="id">ID / Identificación</option>
        <option value="otro">Otro</option>
      </select>
    </div>
    <div class="form__group">
      <label class="form__label">Número de documento</label>
      <input type="text" name="documentNumber" class="form__input" placeholder="Ej. AB123456" />
    </div>
    <div class="form__group">
      <label class="form__label">Nacionalidad</label>
      <input type="text" name="nationality" class="form__input" placeholder="Ej. Colombiana" />
    </div>
    <div class="form__group form__group--full">
      <span class="form__label">Necesidades logísticas</span>
      <div class="checkbox-row">
        <label class="checkbox"><input type="checkbox" name="requiresLodging" /> <span>Hospedaje</span></label>
        <label class="checkbox"><input type="checkbox" name="hasFlight" /> <span>Vuelo</span></label>
        <label class="checkbox"><input type="checkbox" name="requiresTransfers" /> <span>Traslados</span></label>
        <label class="checkbox"><input type="checkbox" name="requiresInsurance" /> <span>Seguro</span></label>
        <label class="checkbox"><input type="checkbox" name="requiresCompanion" /> <span>Acompañante</span></label>
      </div>
    </div>
    <div class="form__group form__group--full">
      <label class="form__label">Idioma o condición especial</label>
      <input type="text" name="languageOrSpecialCondition" class="form__input" placeholder="Apoyo bilingüe, movilidad reducida, etc." />
    </div>
    <div class="form__group form__group--full">
      <label class="form__label">Observaciones</label>
      <textarea name="observations" class="form__input" rows="3"></textarea>
    </div>
    <div class="form__group form__group--full">
      <label class="form__label">Código de referido / descuento (opcional)</label>
      <select name="referralCode" class="form__input"><option value="">— Sin código —</option></select>
      <p class="form__hint">Si CS Travel compartió un código para este caso, escríbelo aquí. Queda atribuido al socio y se cuenta en el panel de códigos.</p>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
 * Logica de envio compartida (pagina /new y modal usan exactamente la misma).
 * ------------------------------------------------------------------------- */

export function bindRequestForm(form, { onSuccess }) {
  const alert = form.querySelector('.form__alert');
  const submitBtn = form.querySelector('button[type="submit"]');
  const companyId = authService.getCompanyId();
  fillReferralCodes(form); // conecta el dropdown de código con los del admin
  wireRequestTypeConditional(form); // muestra/oculta campos según el tipo elegido

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
    alert.hidden = true;

    const types = selectedRequestTypes(form);
    const requestType = types.join(', ');
    // Detalles específicos del hotel: se anexan a observaciones para que el admin
    // los vea al cotizar (sin requerir columnas nuevas en Wix).
    const extras = [];
    if (types.includes('hotel') || types.includes('paquete')) {
      if (form.roomsCount?.value) extras.push(`Habitaciones: ${form.roomsCount.value}`);
      if (form.hotelCategory?.value) extras.push(`Categoría: ${form.hotelCategory.value}`);
    }
    const observations = [extras.join(' · '), form.observations.value.trim()]
      .filter(Boolean)
      .join(' — ');

    const data = {
      companyId,
      requestType,
      peopleCount: form.peopleCount.value,
      travelClass: form.travelClass.value,
      origin: form.origin.value.trim(),
      destination: form.destination.value.trim(),
      travelDate: form.travelDate.value,
      returnDate: form.returnDate.value,
      fullName: [form.firstName.value.trim(), form.lastName.value.trim()].filter(Boolean).join(' '),
      documentType: form.documentType.value,
      documentNumber: form.documentNumber.value.trim(),
      nationality: form.nationality.value.trim(),
      hasInsurance: form.hasInsurance.checked,
      hasActivities: form.hasActivities.checked,
      hasTransfers: form.hasTransfers.checked,
      observations,
      referralCode: (form.referralCode?.value || '').trim().toUpperCase(),
    };

    const { isValid, errors } = validateRequestForm(data);
    if (!isValid) {
      Object.entries(errors).forEach(([field, message]) => {
        const el = form.querySelector(`[data-error-for="${field}"]`);
        if (el) el.textContent = message;
      });
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
      await requestService.create(data);
      // Recalculamos los agregados de la empresa desde sus solicitudes reales.
      await companyService.recompute(companyId);
      form.reset();
      // Confirmacion clara en pantalla. El toast cuelga de <body>, sobrevive al
      // refresco de la lista que hace onSuccess().
      showToast(
        'Tu solicitud fue enviada. CS Travel preparará tu cotización y te avisaremos en la campana. Puedes seguir su avance en Mis solicitudes.',
        'success',
        { title: '¡Solicitud enviada!' }
      );
      onSuccess();
    } catch (error) {
      alert.textContent = `No se pudo crear la solicitud: ${error.message}`;
      alert.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar solicitud';
    }
  });
}

export function bindMedicalCaseForm(form, { onSuccess }) {
  const alert = form.querySelector('.form__alert');
  const submitBtn = form.querySelector('button[type="submit"]');
  const doctorId = authService.getDoctorId();
  fillReferralCodes(form); // conecta el dropdown de código con los del admin

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
    alert.hidden = true;

    const data = {
      doctorId,
      patientName: form.patientName.value.trim(),
      procedure: form.procedure.value.trim(),
      origin: form.origin.value.trim(),
      destination: form.destination.value.trim(),
      travelDate: form.travelDate.value,
      returnDate: form.returnDate.value,
      fullName: [form.firstName.value.trim(), form.lastName.value.trim()].filter(Boolean).join(' '),
      documentType: form.documentType.value,
      documentNumber: form.documentNumber.value.trim(),
      nationality: form.nationality.value.trim(),
      hasFlight: form.hasFlight.checked,
      requiresLodging: form.requiresLodging.checked,
      requiresTransfers: form.requiresTransfers.checked,
      requiresInsurance: form.requiresInsurance.checked,
      requiresCompanion: form.requiresCompanion.checked,
      languageOrSpecialCondition: form.languageOrSpecialCondition.value.trim(),
      observations: form.observations.value.trim(),
      referralCode: (form.referralCode?.value || '').trim().toUpperCase(),
    };

    const { isValid, errors } = validateMedicalCaseForm(data);
    if (!isValid) {
      Object.entries(errors).forEach(([field, message]) => {
        const el = form.querySelector(`[data-error-for="${field}"]`);
        if (el) el.textContent = message;
      });
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando...';
      await medicalCaseService.create(data);
      // Recalculamos los agregados del medico desde sus casos reales.
      await doctorService.recompute(doctorId);
      form.reset();
      showToast(
        'Tu caso fue creado. CS Travel lo revisará y te enviará la cotización; te avisaremos en la campana. Puedes seguir su avance en Mis casos.',
        'success',
        { title: '¡Caso creado!' }
      );
      onSuccess();
    } catch (error) {
      alert.textContent = `No se pudo crear el caso: ${error.message}`;
      alert.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear caso';
    }
  });
}

/* ---------------------------------------------------------------------------
 * FAB + modal de creacion rapida (segun rol).
 * ------------------------------------------------------------------------- */

const QUICK_CONFIG = {
  company: {
    title: 'Nueva solicitud de viaje',
    subtitle: 'Completa los datos y nuestro equipo preparara tu cotizacion.',
    submitLabel: 'Enviar solicitud',
    fields: RequestFormFields,
    fabLabel: 'Nueva solicitud',
  },
  doctor: {
    title: 'Nuevo caso medico',
    subtitle: 'Registra una necesidad logistica para tu paciente.',
    submitLabel: 'Crear caso',
    fields: MedicalCaseFormFields,
    fabLabel: 'Nuevo caso',
  },
};

/** HTML del FAB + modal. Devuelve '' para roles sin creacion rapida (admin). */
export function QuickCreate(role) {
  const config = QUICK_CONFIG[role];
  if (!config) return '';

  return `
    <button type="button" class="fab" data-action="open-quick-create"
      aria-label="${config.fabLabel}" title="${config.fabLabel}">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
        stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </button>

    <div class="modal-overlay modal-overlay--${role}" id="quick-create-modal">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__header">
          <div>
            <h2 class="modal__title">${config.title}</h2>
            <p class="modal__subtitle">${config.subtitle}</p>
          </div>
          <button type="button" class="modal__close" data-action="close-quick-create" aria-label="Cerrar">✕</button>
        </div>
        <form class="form form--grid" novalidate>
          ${config.fields()}
          <div class="form__alert form__group--full" hidden></div>
          <div class="form__actions form__group--full">
            <button type="button" class="btn btn--ghost" data-action="close-quick-create">Cancelar</button>
            <button type="submit" class="btn btn--primary">${config.submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/** Navega a la lista correspondiente; si ya estamos en ella, refresca. */
function goOrRefresh(targetHash) {
  if (window.location.hash.split('?')[0] === targetHash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    navigate(targetHash);
  }
}

/** Enlaza FAB, cierres y submit del modal. Llamado por el router tras cada render. */
export function bindQuickCreate(role) {
  const modal = document.getElementById('quick-create-modal');
  if (!modal) return;

  const open = () => {
    modal.classList.add('is-open');
    modal.querySelector('input, select')?.focus();
  };
  const close = () => modal.classList.remove('is-open');

  document.querySelectorAll('[data-action="open-quick-create"]').forEach((btn) => {
    btn.addEventListener('click', open);
  });
  modal.querySelectorAll('[data-action="close-quick-create"]').forEach((btn) => {
    btn.addEventListener('click', close);
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  const form = modal.querySelector('form');
  if (role === 'company') {
    bindRequestForm(form, {
      onSuccess: () => {
        close();
        goOrRefresh('#/company/requests');
      },
    });
  } else if (role === 'doctor') {
    bindMedicalCaseForm(form, {
      onSuccess: () => {
        close();
        goOrRefresh('#/doctor/cases');
      },
    });
  }
}
