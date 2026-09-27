/**
 * formatDate.js
 * =============================================================================
 * PROPOSITO:
 *   Formatear fechas (en formato ISO o "YYYY-MM-DD") a un texto legible en
 *   español para mostrarlas en la interfaz.
 *
 * RESPONSABILIDAD:
 *   Convertir "2026-07-15" -> "15 jul 2026". Centraliza el formato de fechas.
 *
 * OJO CON LAS FECHAS SIN HORA:
 *   new Date('2026-07-15') NO es el 15 de julio en Colombia: el estándar lo
 *   interpreta como medianoche UTC, que en Bogotá (UTC-5) es el 14 a las 7 p. m.
 *   Por eso una fecha de viaje, un vencimiento o una "siguiente acción" se veía
 *   un día antes. Las fechas "YYYY-MM-DD" (y "YYYY-MM") se leen aquí como fecha
 *   LOCAL con parseLocalDate(). Las fechas con hora y zona ("...T15:00:00Z")
 *   son un instante real y se muestran en la hora del navegador.
 *
 *   Lo mismo pasa al revés: new Date().toISOString().slice(0, 10) da el día
 *   UTC, que después de las 7 p. m. en Colombia ya es "mañana". Para el día
 *   local usa localDayISO().
 * =============================================================================
 */

/** "YYYY-MM-DD" o "YYYY-MM" exactos (sin hora). */
const DATE_ONLY = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/**
 * parseLocalDate()
 * Convierte una fecha en un Date sin correrla de día.
 *   - "2026-07-15"          -> 15 jul 2026, 00:00 hora local.
 *   - "2026-07"             -> 1 jul 2026, 00:00 hora local.
 *   - "2026-07-15T10:00Z"   -> ese instante (como new Date()).
 *   - Date / número (ms)    -> se respetan.
 * @param {string|number|Date} value
 * @returns {Date|null} null si la fecha no existe (p. ej. "2026-02-31").
 */
export function parseLocalDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'string') {
    const m = DATE_ONLY.exec(value.trim());
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      const day = m[3] ? Number(m[3]) : 1;
      const date = new Date(year, month, day);
      // new Date(2026, 1, 31) "rueda" al 3 de marzo: una fecha imposible es inválida.
      if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
      return date;
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** true si el valor es una fecha sin hora ("YYYY-MM-DD" o "YYYY-MM"). */
export function isDateOnly(value) {
  return typeof value === 'string' && DATE_ONLY.test(value.trim());
}

/**
 * localDayISO()
 * Día LOCAL como "YYYY-MM-DD" (no el día UTC de toISOString()).
 * @param {string|number|Date} [value=new Date()]
 * @returns {string} "" si la fecha no es válida.
 */
export function localDayISO(value = new Date()) {
  const date = parseLocalDate(value);
  if (!date) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * formatDate()
 * @param {string|number|Date} isoString - Fecha en ISO ("2026-07-15T..." o "2026-07-15").
 * @param {boolean} withTime - Si true, incluye la hora (se ignora en fechas sin
 *   hora: mostrar "12:00 a. m." inventaría una hora que nadie fijó).
 * @returns {string}         - Fecha legible o "-" si la entrada es inválida.
 */
export function formatDate(isoString, withTime = false) {
  if (!isoString) return '-';

  const date = parseLocalDate(isoString);
  // Si la fecha no es válida, evitamos mostrar "Invalid Date".
  if (!date) return '-';

  // Opciones base: día, mes abreviado y año.
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  // Si se pide la hora (y la fecha la trae), la agregamos al formato.
  if (withTime && !isDateOnly(isoString)) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return new Intl.DateTimeFormat('es-CO', options).format(date);
}
