/**
 * AdminSettingsView.js
 * =============================================================================
 * PROPOSITO:
 *   Configuracion del sistema para el admin: integraciones con proveedores de
 *   viaje. La primera entrega prioriza la API de Booking (clave + affiliate id);
 *   Despegar y Amadeus quedan listos como "proximamente".
 * =============================================================================
 */

import { settingsService } from '../services/settingsService.js';
import { escapeHtml } from '../utils/escapeHtml.js';

export const AdminSettingsView = {
  async render() {
    const cfg = settingsService.getAll();
    const mask = (key) => (key ? '••••••••' + key.slice(-4) : '');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Configuracion</h1>
          <p class="page-subtitle">Datos legales, marca e integraciones con proveedores.</p>
        </div>
      </div>

      <section class="panel">
        <h2 class="panel__title">Datos legales y de marca (cotizaciones)</h2>
        <p class="muted" style="margin-bottom:14px">Aparecen en el pie de las cotizaciones que generes (RNT obligatorio en Colombia).</p>
        <form id="company-form" class="form form--grid">
          <div class="form__group">
            <label class="form__label">Nombre de la agencia</label>
            <input type="text" name="agencyName" class="form__input" value="${escapeHtml(cfg.company.agencyName)}" />
          </div>
          <div class="form__group">
            <label class="form__label">RNT (Registro Nacional de Turismo)</label>
            <input type="text" name="rnt" class="form__input" value="${escapeHtml(cfg.company.rnt)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Registro Mercantil</label>
            <input type="text" name="registroMercantil" class="form__input" value="${escapeHtml(cfg.company.registroMercantil)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Email de contacto</label>
            <input type="text" name="email" class="form__input" value="${escapeHtml(cfg.company.email)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Telefonos</label>
            <input type="text" name="phones" class="form__input" value="${escapeHtml(cfg.company.phones)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Sitio web</label>
            <input type="text" name="web" class="form__input" value="${escapeHtml(cfg.company.web)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Ciudad / pais</label>
            <input type="text" name="city" class="form__input" value="${escapeHtml(cfg.company.city)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Asesor por defecto</label>
            <input type="text" name="advisorName" class="form__input" value="${escapeHtml(cfg.company.advisorName)}" />
          </div>
          <div class="form__alert form__group--full" id="company-alert" hidden></div>
          <div class="form__actions form__group--full">
            <button type="submit" class="btn btn--primary">Guardar datos de la empresa</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="integration">
          <div class="integration__brand">
            <div class="integration__logo integration__logo--booking">B.</div>
            <div>
              <h2 class="panel__title">Booking.com</h2>
              <p class="muted">Tarifas de hoteles y disponibilidad en tiempo real. Prioridad de la primera entrega.</p>
            </div>
            <span class="integration__status ${cfg.booking.enabled ? 'is-on' : ''}" id="booking-status">
              ${cfg.booking.enabled ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <form id="booking-form" class="form form--grid">
            <div class="form__group">
              <label class="form__label">API Key</label>
              <input type="text" name="apiKey" class="form__input" placeholder="${cfg.booking.apiKey ? escapeHtml(mask(cfg.booking.apiKey)) : 'Pega tu API key de Booking'}" />
              <small class="muted">Se guarda localmente solo para esta demo. En produccion ira en el servidor.</small>
            </div>
            <div class="form__group">
              <label class="form__label">Affiliate ID</label>
              <input type="text" name="affiliateId" class="form__input" value="${escapeHtml(cfg.booking.affiliateId || '')}" placeholder="Ej: 1234567" />
            </div>
            <div class="form__group">
              <span class="form__label">Estado</span>
              <label class="checkbox"><input type="checkbox" name="enabled" ${cfg.booking.enabled ? 'checked' : ''} /> <span>Habilitar integracion</span></label>
            </div>
            <div class="form__alert form__group--full" id="booking-alert" hidden></div>
            <div class="form__actions form__group--full">
              <button type="submit" class="btn btn--primary">Guardar conexion Booking</button>
            </div>
          </form>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__title">Otros proveedores</h2>
        <div class="integration-grid">
          <div class="integration-card">
            <div class="integration__logo integration__logo--despegar">D</div>
            <div>
              <strong>Despegar</strong>
              <span class="muted-block">Vuelos y paquetes regionales</span>
            </div>
            <span class="integration__status">Proximamente</span>
          </div>
          <div class="integration-card">
            <div class="integration__logo integration__logo--amadeus">A</div>
            <div>
              <strong>Amadeus</strong>
              <span class="muted-block">GDS de vuelos global</span>
            </div>
            <span class="integration__status">Proximamente</span>
          </div>
        </div>
      </section>
    `;
  },

  async afterRender() {
    // --- Datos legales / marca ---
    const companyForm = document.getElementById('company-form');
    const companyAlert = document.getElementById('company-alert');
    companyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      settingsService.saveProvider('company', {
        agencyName: companyForm.agencyName.value.trim(),
        rnt: companyForm.rnt.value.trim(),
        registroMercantil: companyForm.registroMercantil.value.trim(),
        email: companyForm.email.value.trim(),
        phones: companyForm.phones.value.trim(),
        web: companyForm.web.value.trim(),
        city: companyForm.city.value.trim(),
        advisorName: companyForm.advisorName.value.trim(),
      });
      companyAlert.textContent = 'Datos de la empresa guardados.';
      companyAlert.className = 'form__alert form__alert--success';
      companyAlert.hidden = false;
    });

    const form = document.getElementById('booking-form');
    const alert = document.getElementById('booking-alert');
    const status = document.getElementById('booking-status');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = {
        enabled: form.enabled.checked,
        affiliateId: form.affiliateId.value.trim(),
      };
      // Solo sobrescribimos la API key si el usuario escribio una nueva.
      const newKey = form.apiKey.value.trim();
      if (newKey) data.apiKey = newKey;

      settingsService.saveProvider('booking', data);

      status.textContent = data.enabled ? 'Conectado' : 'Desconectado';
      status.classList.toggle('is-on', data.enabled);
      form.apiKey.value = '';

      alert.textContent = 'Configuracion de Booking guardada.';
      alert.className = 'form__alert form__alert--success';
      alert.hidden = false;
    });
  },
};
