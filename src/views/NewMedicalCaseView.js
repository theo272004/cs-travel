/**
 * NewMedicalCaseView.js
 * =============================================================================
 * PROPOSITO:
 *   Pagina completa para crear un caso medico (MEDICO/CLINICA). La via
 *   principal de creacion es la ventana flotante del boton "+" (QuickCreate);
 *   esta vista se mantiene como respaldo para enlaces directos a /new.
 *
 *   Campos y logica de envio viven en components/QuickCreate.js y se comparten
 *   entre esta pagina y el modal.
 * =============================================================================
 */

import { MedicalCaseFormFields, bindMedicalCaseForm, prefillForm } from '../components/QuickCreate.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { navigate } from '../router/router.js';

export const NewMedicalCaseView = {
  async render(ctx) {
    const editing = !!ctx?.query?.edit;
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${editing ? 'Editar caso médico' : 'Nuevo caso medico'}</h1>
          <p class="page-subtitle">${editing ? 'Ajusta los datos antes de que CS Travel prepare la cotización.' : 'Registra una necesidad logistica para paciente.'}</p>
        </div>
        <a href="#/doctor/cases" class="btn btn--ghost">← Volver</a>
      </div>

      <section class="panel">
        <form id="medical-case-form" class="form form--grid" novalidate>
          ${MedicalCaseFormFields()}
          <div class="form__alert form__group--full" hidden></div>
          <div class="form__actions form__group--full">
            <a href="#/doctor/cases" class="btn btn--ghost">Cancelar</a>
            <button type="submit" class="btn btn--primary">${editing ? 'Guardar cambios' : 'Crear caso'}</button>
          </div>
        </form>
      </section>
    `;
  },

  async afterRender(ctx) {
    const form = document.getElementById('medical-case-form');
    const editId = ctx?.query?.edit;

    if (editId) {
      let item = null;
      try { item = await medicalCaseService.getById(editId); } catch { item = null; }
      // Solo editable ANTES de que CS Travel cotice.
      if (!item || item.status !== 'solicitud enviada') {
        navigate(item ? `#/doctor/cases/${editId}` : '#/doctor/cases');
        return;
      }
      bindMedicalCaseForm(form, { onSuccess: () => navigate(`#/doctor/cases/${editId}`), editId });
      prefillForm(form, item);
      return;
    }

    bindMedicalCaseForm(form, { onSuccess: () => navigate('#/doctor/cases') });
  },
};
