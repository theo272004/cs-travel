/**
 * escapeHtml.js
 * =============================================================================
 * PROPOSITO:
 *   Escapar caracteres especiales antes de inyectar texto del usuario en el DOM
 *   mediante innerHTML. Evita que datos como observaciones o nombres rompan el
 *   HTML o introduzcan codigo (proteccion basica anti-XSS).
 *
 * RESPONSABILIDAD:
 *   Convertir caracteres como < > & " ' en sus entidades HTML seguras.
 *
 * POR QUE:
 *   Nuestras vistas construyen HTML como texto y lo asignan con innerHTML.
 *   Cualquier valor que venga de datos (empresa, solicitud, formulario) debe
 *   pasar por aqui antes de incrustarse, para no confiar en su contenido.
 * =============================================================================
 */

/**
 * escapeHtml()
 * @param {*} value - Valor a escapar (se convierte a string).
 * @returns {string} Texto seguro para incrustar en innerHTML.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
