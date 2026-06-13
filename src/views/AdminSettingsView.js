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
          <p class="page-subtitle">Integraciones con proveedores de viaje y reservas.</p>
        </div>
      </div>

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
