/**
 * NotAuthorizedView.js
 * =============================================================================
 * PROPOSITO:
 *   Vista de acceso denegado. Se muestra cuando un usuario autenticado intenta
 *   entrar a una ruta que no corresponde a su rol (ej: una empresa abriendo una
 *   ruta de admin).
 *
 * RESPONSABILIDAD:
 *   Avisar del bloqueo y ofrecer una salida segura.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { redirectByRole } from '../utils/guards.js';

export const NotAuthorizedView = {
  async render() {
    // Si hay sesion, ofrecemos volver a SU dashboard; si no, al login.
    const backHash = authService.isAuthenticated() ? redirectByRole() : '#/login';
    return `
      <div class="error-screen">
        <span class="error-screen__code">403</span>
        <h1>Acceso no autorizado</h1>
        <p class="muted">No tienes permisos para ver esta seccion.</p>
        <a href="${backHash}" class="btn btn--primary">Volver</a>
      </div>
    `;
  },
};
