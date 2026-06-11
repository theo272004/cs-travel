/**
 * NewRequestView.js
 * =============================================================================
 * PROPOSITO:
 *   Pagina completa para crear una solicitud de viaje (EMPRESA). La via
 *   principal de creacion es la ventana flotante del boton "+" (QuickCreate);
 *   esta vista se mantiene como respaldo para enlaces directos a /new.
 *
 *   Campos y logica de envio viven en components/QuickCreate.js y se comparten
 *   entre esta pagina y el modal.
 * =============================================================================
 */

import { RequestFormFields, bindRequestForm } from '../components/QuickCreate.js';
import { navigate } from '../router/router.js';

export const NewRequestView = {
  async render() {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Nueva solicitud de viaje</h1>
          <p class="page-subtitle">Completa los datos y nuestro equipo preparara tu cotizacion.</p>
        </div>
        <a href="#/company/requests" class="btn btn--ghost">← Volver</a>
      </div>

      <section class="panel">
        <form id="request-form" class="form form--grid" novalidate>
          ${RequestFormFields()}
          <div class="form__alert form__group--full" hidden></div>
          <div class="form__actions form__group--full">
            <a href="#/company/requests" class="btn btn--ghost">Cancelar</a>
            <button type="submit" class="btn btn--primary">Enviar solicitud</button>
          </div>
        </form>
      </section>
    `;
  },

  async afterRender() {
    bindRequestForm(document.getElementById('request-form'), {
      onSuccess: () => navigate('#/company/requests'),
    });
  },
};
