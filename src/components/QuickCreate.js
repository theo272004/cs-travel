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

/* ---------------------------------------------------------------------------
 * Campos de formulario compartidos (sin <form> ni ids, para poder coexistir
 * la version "pagina" y la version "modal" sin colisiones).
 * ------------------------------------------------------------------------- */

export function RequestFormFields() {
  return `
    <div class="form__group">
      <label class="form__label">Tipo de solicitud *</label>
      <select name="requestType" class="form__input">
        <option value="vuelo">Vuelo</option>
        <option value="hotel">Hotel</option>
        <option value="tour">Tour</option>
        <option value="traslado">Traslado</option>
        <option value="paquete completo">Paquete completo</option>
        <option value="otro">Otro</option>
      </select>
    </div>
    <div class="form__group">
      <label class="form__label">Numero de personas *</label>
      <input type="number" name="peopleCount" class="form__input" min="1" value="1" />
      <small class="form__error" data-error-for="peopleCount"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Clase del viaje *</label>
      <select name="travelClass" class="form__input">
        <option value="turista">Turista</option>
        <option value="ejecutiva">Ejecutiva / Business</option>
      </select>
      <small class="form__error" data-error-for="travelClass"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Fecha del viaje *</label>
      <input type="date" name="travelDate" class="form__input" />
      <small class="form__error" data-error-for="travelDate"></small>
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
        placeholder="Detalles adicionales, preferencias, requerimientos especiales..."></textarea>
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
      <input type="text" name="procedure" class="form__input" placeholder="Consulta, cirugia, control..." />
      <small class="form__error" data-error-for="procedure"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Origen *</label>
      <input type="text" name="origin" class="form__input" />
      <small class="form__error" data-error-for="origin"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Destino *</label>
      <input type="text" name="destination" class="form__input" />
      <small class="form__error" data-error-for="destination"></small>
    </div>
    <div class="form__group">
      <label class="form__label">Fecha estimada *</label>
      <input type="date" name="travelDate" class="form__input" />
      <small class="form__error" data-error-for="travelDate"></small>
    </div>
    <div class="form__group form__group--full">
      <span class="form__label">Necesidades logisticas</span>
      <div class="checkbox-row">
        <label class="checkbox"><input type="checkbox" name="requiresLodging" /> <span>Hospedaje</span></label>
        <label class="checkbox"><input type="checkbox" name="hasFlight" /> <span>Vuelo</span></label>
        <label class="checkbox"><input type="checkbox" name="requiresTransfers" /> <span>Traslados</span></label>
        <label class="checkbox"><input type="checkbox" name="requiresInsurance" /> <span>Seguro</span></label>
        <label class="checkbox"><input type="checkbox" name="requiresCompanion" /> <span>Acompanante</span></label>
      </div>
    </div>
    <div class="form__group form__group--full">
      <label class="form__label">Idioma o condicion especial</label>
      <input type="text" name="languageOrSpecialCondition" class="form__input" placeholder="Apoyo bilingue, movilidad reducida, etc." />
    </div>
    <div class="form__group form__group--full">
      <label class="form__label">Observaciones</label>
      <textarea name="observations" class="form__input" rows="3"></textarea>
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
    alert.hidden = true;

    const data = {
      companyId,
      requestType: form.requestType.value,
      peopleCount: form.peopleCount.value,
      travelClass: form.travelClass.value,
      origin: form.origin.value.trim(),
      destination: form.destination.value.trim(),
      travelDate: form.travelDate.value,
      hasInsurance: form.hasInsurance.checked,
      hasActivities: form.hasActivities.checked,
      hasTransfers: form.hasTransfers.checked,
      observations: form.observations.value.trim(),
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
      const company = await companyService.getById(companyId);
      await companyService.update(companyId, {
        totalRequests: (company.totalRequests || 0) + 1,
      });
      form.reset();
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
      hasFlight: form.hasFlight.checked,
      requiresLodging: form.requiresLodging.checked,
      requiresTransfers: form.requiresTransfers.checked,
      requiresInsurance: form.requiresInsurance.checked,
      requiresCompanion: form.requiresCompanion.checked,
      languageOrSpecialCondition: form.languageOrSpecialCondition.value.trim(),
      observations: form.observations.value.trim(),
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
      const doctor = await doctorService.getById(doctorId);
      await doctorService.update(doctorId, {
        totalCases: (doctor.totalCases || 0) + 1,
        activeCases: (doctor.activeCases || 0) + 1,
      });
      form.reset();
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

    <div class="modal-overlay" id="quick-create-modal">
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
