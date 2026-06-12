/**
 * greeting.js
 * =============================================================================
 * PROPOSITO:
 *   Saludo segun la hora local del usuario, para los encabezados de los
 *   dashboards ("Buenos dias, Clinica Salud Integral").
 * =============================================================================
 */

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos dias';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
