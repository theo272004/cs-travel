/**
 * Navbar.js
 * =============================================================================
 * PROPOSITO:
 *   Barra superior de la aplicacion (visible en las pantallas autenticadas).
 *   Muestra el logo/marca, el nombre y rol del usuario, y el boton de logout.
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

  return `
    <header class="navbar">
      <div class="navbar__left">
        <!-- Boton para mostrar/ocultar el menu lateral en pantallas pequenas. -->
        <button class="navbar__toggle" data-action="toggle-sidebar" aria-label="Abrir menu">
          <span></span><span></span><span></span>
        </button>
        <div class="navbar__brand">
          <span class="navbar__logo">CS</span>
          <span class="navbar__title">CS Travel</span>
        </div>
      </div>

      <div class="navbar__right">
        <div class="navbar__user">
          <span class="navbar__user-name">${escapeHtml(user.name)}</span>
          <span class="navbar__user-role">${escapeHtml(roleLabel)}</span>
        </div>
        <!-- data-action="logout": lo escucha main.js para cerrar sesion. -->
        <button class="btn btn--ghost" data-action="logout">Salir</button>
      </div>
    </header>
  `;
}
