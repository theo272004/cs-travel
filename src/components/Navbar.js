/**
 * Navbar.js
 * =============================================================================
 * PROPOSITO:
 *   Barra superior de la aplicacion (visible en las pantallas autenticadas).
 *   Muestra el logo/marca y un menu de perfil compacto con logout.
 *
 * RESPONSABILIDADES:
 *   - Renderizar el HTML de la barra superior.
 *   - Incluir un boton "hamburguesa" para abrir/cerrar el sidebar en movil.
 *   - El logout se gestiona via delegacion de eventos en main.js (data-action).
 *
 * NOTA SOBRE EVENTOS:
 *   Este componente solo devuelve HTML. Los clics (logout, toggle de menu) se
 *   capturan globalmente en main.js usando atributos data-action, para no tener
 *   que volver a enlazar listeners cada vez que se re-renderiza una vista.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import logoCs from '../assets/logo-cs.png';

const DASHBOARD_BY_ROLE = {
  admin: '#/admin/dashboard',
  doctor: '#/doctor/dashboard',
  company: '#/company/dashboard',
};

/**
 * Navbar()
 * @param {object} user - Usuario logueado { name, role, ... }.
 * @returns {string} HTML de la barra superior.
 */
export function Navbar(user) {
  // Etiqueta legible del rol.
  const roleLabel = user.role === 'admin'
    ? 'Administrador'
    : user.role === 'doctor'
      ? 'Medico / Clinica'
      : 'Empresa';
  const dashboardHref = DASHBOARD_BY_ROLE[user.role] || '#/';
  const initials = String(user.name || 'CS')
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, '')) // ignora paréntesis/símbolos
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CS';

  return `
    <header class="navbar">
      <div class="navbar__left">
        <!-- Boton para mostrar/ocultar el menu lateral en pantallas pequenas. -->
        <button class="navbar__toggle" data-action="toggle-sidebar" aria-label="Abrir menu">
          <span></span><span></span><span></span>
        </button>
        <div class="navbar__brand">
          <img src="${logoCs}" alt="" class="navbar__logo" />
          <span class="navbar__title">CS Travel</span>
        </div>
      </div>

      <div class="navbar__right">
        <div class="navbar__quickbar" aria-label="Acciones rapidas">
          <button type="button" class="navbar__search-float" data-action="open-search" aria-label="Buscar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <span>Buscar...</span>
          </button>
          <button type="button" class="navbar__icon-float navbar__icon-float--notify" data-action="toggle-notifications" aria-label="Notificaciones">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"></path>
              <path d="M10 21a2 2 0 0 0 4 0"></path>
            </svg>
            <span class="navbar__icon-dot" aria-hidden="true" hidden></span>
          </button>
        </div>

        <details class="profile-menu">
          <summary class="profile-menu__trigger" aria-label="Abrir perfil">
            <span class="profile-menu__face" aria-hidden="true">${escapeHtml(initials)}</span>
          </summary>
          <div class="profile-menu__panel">
            <div class="profile-menu__identity">
              <span class="profile-menu__name">${escapeHtml(user.name)}</span>
              <span class="profile-menu__email">${escapeHtml(user.email || roleLabel)}</span>
            </div>
            <div class="profile-menu__meta">
              <span>Tipo de cuenta</span>
              <strong>${escapeHtml(roleLabel)}</strong>
            </div>
            ${user.role === 'admin' ? `
            <!-- Configuracion vive aqui (se quito del sidebar y del dashboard). -->
            <a class="profile-menu__item" href="#/admin/settings">
              <span class="profile-menu__icon">⚙</span>
              <span>Configuracion</span>
            </a>` : ''}
            <!-- data-action="logout": lo escucha main.js para cerrar sesion. -->
            <button class="profile-menu__item profile-menu__item--danger" type="button" data-action="logout">
              <span class="profile-menu__icon">↪</span>
              <span>Cerrar sesion</span>
            </button>
          </div>
        </details>
      </div>
    </header>
  `;
}
