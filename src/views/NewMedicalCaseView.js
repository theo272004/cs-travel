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

import { MedicalCaseFormFields, bindMedicalCaseForm } from '../components/QuickCreate.js';
import { navigate } from '../router/router.js';

export const NewMedicalCaseView = {
  async render() {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Nuevo caso medico</h1>
          <p class="page-subtitle">Registra una necesidad logistica para paciente.</p>
        </div>
        <a href="#/doctor/cases" class="btn btn--ghost">← Volver</a>
      </div>

      <section class="panel">
        <form id="medical-case-form" class="form form--grid" novalidate>
          ${MedicalCaseFormFields()}
          <div class="form__alert form__group--full" hidden></div>
          <div class="form__actions form__group--full">
            <a href="#/doctor/cases" class="btn btn--ghost">Cancelar</a>
            <button type="submit" class="btn btn--primary">Crear caso</button>
          </div>
        </form>
      </section>
    `;
  },

  async afterRender() {
    bindMedicalCaseForm(document.getElementById('medical-case-form'), {
      onSuccess: () => navigate('#/doctor/cases'),
    });
  },
};
