/**
 * formatDate.js
 * =============================================================================
 * PROPOSITO:
 *   Formatear fechas (en formato ISO o "YYYY-MM-DD") a un texto legible en
 *   espanol para mostrarlas en la interfaz.
 *
 * RESPONSABILIDAD:
 *   Convertir "2026-07-15" -> "15 jul 2026". Centraliza el formato de fechas.
 * =============================================================================
 */

/**
 * formatDate()
 * @param {string} isoString - Fecha en ISO ("2026-07-15T..." o "2026-07-15").
 * @param {boolean} withTime - Si true, incluye la hora.
 * @returns {string}         - Fecha legible o "-" si la entrada es invalida.
 */
export function formatDate(isoString, withTime = false) {
  if (!isoString) return '-';

  const date = new Date(isoString);
  // Si la fecha no es valida, evitamos mostrar "Invalid Date".
  if (Number.isNaN(date.getTime())) return '-';

  // Opciones base: dia, mes abreviado y ano.
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  // Si se pide la hora, la agregamos al formato.
  if (withTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return new Intl.DateTimeFormat('es-CO', options).format(date);
}
