import { RequestFormFields, bindRequestForm } from '../components/QuickCreate.js';
import { navigate } from '../router/router.js';

export const NewRequestView = {
  async render() {
    return `
      <!-- Hero -->
      <div class="nr-page-hero">
        <div class="nr-page-hero__left">
          <a href="#/company/requests" class="nr-back-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Volver a mis solicitudes
          </a>
          <h1 class="page-title">Nueva solicitud de viaje</h1>
          <p class="page-subtitle">Completa los datos y nuestro equipo preparara tu cotizacion.</p>
        </div>
      </div>

      <!-- Formulario en secciones -->
      <form id="request-form" class="form" novalidate>

        <!-- Seccion: Detalles del viaje -->
        <section class="panel nr-section">
          <div class="nr-section__header">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.38 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>DETALLES DEL VIAJE</span>
          </div>
          <div class="form--grid">
            <div class="form__group">
              <label class="form__label">Tipo de solicitud *</label>
              <select name="requestType" class="form__input">
                <option value="vuelo">Vuelo</option>
                <option value="hotel">Hotel</option>
                <option value="tour">Tour / excursion</option>
                <option value="paquete completo">Paquete turistico</option>
                <option value="traslado">Traslado</option>
                <option value="sim">SIM / eSIM</option>
                <option value="evento">Evento</option>
                <option value="otro">Otro</option>
              </select>
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
            <div class="form__group">
              <label class="form__label">Numero de personas *</label>
              <input type="number" name="peopleCount" class="form__input" min="1" value="1" />
              <small class="form__error" data-error-for="peopleCount"></small>
            </div>
          </div>
        </section>

        <!-- Seccion: Datos del viajero -->
        <section class="panel nr-section">
          <div class="nr-section__header">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>DATOS DEL VIAJERO PRINCIPAL</span>
          </div>
          <p class="nr-section__hint">Como aparecen en el documento de viaje (pasaporte o cedula).</p>
          <div class="form--grid">
            <div class="form__group">
              <label class="form__label">Nombres</label>
              <input type="text" name="firstName" class="form__input" placeholder="Ej. Ruby Carolina" />
            </div>
            <div class="form__group">
              <label class="form__label">Apellidos</label>
              <input type="text" name="lastName" class="form__input" placeholder="Ej. Mendez Pena" />
            </div>
            <div class="form__group">
              <label class="form__label">Tipo de documento</label>
              <select name="documentType" class="form__input">
                <option value="">Seleccionar...</option>
                <option value="pasaporte">Pasaporte</option>
                <option value="cedula">Cedula</option>
                <option value="id">ID / Identificacion</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="form__group">
              <label class="form__label">Numero de documento</label>
              <input type="text" name="documentNumber" class="form__input" placeholder="Ej. AB123456" />
            </div>
            <div class="form__group">
              <label class="form__label">Nacionalidad</label>
              <input type="text" name="nationality" class="form__input" placeholder="Ej. Colombiana" />
            </div>
          </div>
        </section>

        <!-- Seccion: Servicios adicionales -->
        <section class="panel nr-section">
          <div class="nr-section__header">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4l3 3"/>
            </svg>
            <span>SERVICIOS ADICIONALES</span>
          </div>
          <div class="nr-checks">
            <label class="nr-check">
              <input type="checkbox" name="hasInsurance" />
              <span class="nr-check__box"></span>
              <span>Seguro de viaje</span>
            </label>
            <label class="nr-check">
              <input type="checkbox" name="hasActivities" />
              <span class="nr-check__box"></span>
              <span>Actividades</span>
            </label>
            <label class="nr-check">
              <input type="checkbox" name="hasTransfers" />
              <span class="nr-check__box"></span>
              <span>Traslados</span>
            </label>
          </div>
          <div class="form__group" style="margin-top:16px">
            <label class="form__label">Observaciones</label>
            <textarea name="observations" class="form__input" rows="3"
              placeholder="Detalles adicionales, preferencias o requerimientos especiales..."></textarea>
          </div>
        </section>

        <!-- Acciones -->
        <div class="nr-actions">
          <a href="#/company/requests" class="btn btn--ghost">Cancelar</a>
          <button type="submit" class="btn btn--primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Enviar solicitud
          </button>
        </div>

        <div class="form__alert" hidden></div>
      </form>
    `;
  },

  async afterRender() {
    bindRequestForm(document.getElementById('request-form'), {
      onSuccess: () => navigate('#/company/requests'),
    });
  },
};
