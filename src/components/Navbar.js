/**
 * Navbar.js
 * =============================================================================
 * PROPOSITO:
 *   Barra superior de la aplicacion (visible en las pantallas autenticadas).
 *   Muestra el logo/marca, el buscador, la campana, el boton «Guía» (explica la
 *   pagina actual; ver components/Tour.js) y un menu de perfil con logout.
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
import { isDeployedBundle } from '../utils/env.js';
import logoCs from '../assets/logo-cs.png';
import { icon } from '../utils/icons.js';

const DASHBOARD_BY_ROLE = {
  admin: '#/admin/dashboard',
  doctor: '#/doctor/dashboard',
  company: '#/company/dashboard',
  event: '#/event/dashboard',
};

/** Etiqueta legible del rol (lo que se ve en el menu de perfil). */
const ROLE_LABEL = {
  admin: 'Administrador',
  doctor: 'Médico / Clínica',
  company: 'Empresa',
  event: 'Organizador de evento',
};

/**
 * Navbar()
 * @param {object} user - Usuario logueado { name, role, ... }.
 * @returns {string} HTML de la barra superior.
 */
export function Navbar(user) {
  // Etiqueta legible del rol.
  const roleLabel = ROLE_LABEL[user.role] || 'Empresa';
  // El organizador de evento tiene su propio buscador (personas del evento) y
  // sus propias notificaciones (atrasados, metas, confirmaciones): los atiende
  // components/EventKit.js. Asi nunca ve avisos de otros roles.
  const isEvent = user.role === 'event';
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
          <span class="navbar__title">CS Travel Group</span>
        </div>
      </div>

      <div class="navbar__right">
        <div class="navbar__quickbar" aria-label="Acciones rapidas">
          <button type="button" class="navbar__search-float" data-action="${isEvent ? 'event-search' : 'open-search'}" aria-label="Buscar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <span>Buscar...</span>
          </button>
          <button type="button" class="navbar__icon-float navbar__icon-float--notify" data-action="${isEvent ? 'event-notifications' : 'toggle-notifications'}" aria-label="Notificaciones">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"></path>
              <path d="M10 21a2 2 0 0 0 4 0"></path>
            </svg>
            <span class="${isEvent ? 'ev-notif-dot' : 'navbar__icon-dot'}" aria-hidden="true" hidden></span>
          </button>
        </div>

        <!-- Boton «Guía»: explica la pagina actual (que es, para que sirve, como
             se usa y cada seccion). Va FUERA de .navbar__quickbar porque esa
             barra se oculta en el celular; ahi queda solo el circulo con el
             icono. El punto azul late cuando la pagina tiene guia sin ver
             (lo enciende Tour.js > updateGuideButton). Tecla: ?. -->
        <button type="button" class="navbar__guide" data-action="start-tour"
          aria-label="Guía de esta página" aria-keyshortcuts="Shift+?" title="Guía de esta página (tecla ?)">
          <span class="navbar__guide-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" focusable="false">
              <path d="M8.4 8.6a3.7 3.7 0 1 1 5.5 3.2c-1.2.7-1.9 1.5-1.9 2.9v.3"></path>
              <path d="M12 19.2h.01"></path>
            </svg>
          </span>
          <span class="navbar__guide-label">Guía</span>
          <span class="navbar__guide-dot" aria-hidden="true" hidden></span>
        </button>

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
            <!-- Configuración volvió al menú lateral (grupo Sistema): un solo lugar. -->
            ${isDeployedBundle() ? `
            <!-- Verificacion en dos pasos: pagina propia, fuera del SPA. Solo
                 existe en el portal real, no en el demo. -->
            <a class="profile-menu__item" href="/portal/seguridad">
              <span class="profile-menu__icon">${icon('lock')}</span>
              <span>Verificación en dos pasos</span>
            </a>` : ''}
            <!-- La guia de la pagina ya no vive aqui: tiene su propio boton
                 «Guía» en la barra (un solo disparador). -->
            <!-- Cambiar contrasena: dispara el correo de Wix hacia la pagina
                 de crear contrasena. Antes no habia forma de cambiarla desde
                 dentro del portal. -->
            <button class="profile-menu__item" type="button" data-action="change-password">
              <span class="profile-menu__icon">${icon('edit')}</span>
              <span>Cambiar contraseña</span>
            </button>
            <!-- data-action="logout": lo escucha main.js para cerrar sesion. -->
            <button class="profile-menu__item profile-menu__item--danger" type="button" data-action="logout">
              <span class="profile-menu__icon">${icon('logout')}</span>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </details>
      </div>
    </header>
  `;
}
