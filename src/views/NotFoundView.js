/**
 * NotFoundView.js
 * =============================================================================
 * PROPOSITO:
 *   Vista de error 404. Se muestra cuando el hash no coincide con ninguna ruta.
 *
 * RESPONSABILIDAD:
 *   Informar al usuario y ofrecer un enlace para volver a una zona valida.
 * =============================================================================
 */

export const NotFoundView = {
  async render() {
    return `
      <div class="error-screen">
        <span class="error-screen__code">404</span>
        <h1>Pagina no encontrada</h1>
        <p class="muted">La ruta que intentas abrir no existe.</p>
        <a href="#/login" class="btn btn--primary">Ir al inicio</a>
      </div>
    `;
  },
};
