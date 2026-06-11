/**
 * guards.js
 * =============================================================================
 * PROPOSITO:
 *   "Guardianes" de rutas. Funciones que decide el router ANTES de renderizar
 *   una vista para proteger el acceso segun autenticacion y rol.
 *
 * RESPONSABILIDADES:
 *   - requireAuth()  : exige sesion activa; si no, redirige a #/login.
 *   - requireRole()  : exige que el usuario tenga un rol concreto.
 *   - redirectByRole(): tras el login, lleva al dashboard segun el rol.
 *
 * COMO LO USA EL ROUTER:
 *   Cada ruta puede declarar { auth: true, role: 'admin' }. El router llama a
 *   estos guards y, si devuelven una ruta de redireccion (string), navega alli
 *   en lugar de renderizar la vista pedida.
 *
 *   Convencion: un guard devuelve...
 *     - null  -> acceso permitido, continua.
 *     - "#/ruta" -> acceso denegado, redirige a esa ruta.
 * =============================================================================
 */

import { authService } from '../services/authService.js';

/**
 * requireAuth()
 * Permite el paso solo si hay sesion activa.
 * @returns {string|null} "#/login" si no hay sesion, null si la hay.
 */
export function requireAuth() {
  if (!authService.isAuthenticated()) {
    return '#/login';
  }
  return null;
}

/**
 * requireRole()
 * Permite el paso solo si el usuario tiene el rol requerido.
 * Asume que requireAuth ya garantizo que hay sesion.
 *
 * @param {string} role - Rol requerido ("admin" | "company" | "doctor").
 * @returns {string|null} "#/not-authorized" si el rol no coincide, null si si.
 */
export function requireRole(role) {
  const currentRole = authService.getRole();
  if (currentRole !== role) {
    return '#/not-authorized';
  }
  return null;
}

/**
 * redirectByRole()
 * Devuelve la ruta del dashboard correspondiente al rol del usuario logueado.
 * Se usa despues de un login correcto y para redirigir desde rutas raiz.
 *
 * @returns {string} Ruta destino segun el rol.
 */
export function redirectByRole() {
  const role = authService.getRole();
  if (role === 'admin') return '#/admin/dashboard';
  if (role === 'company') return '#/company/dashboard';
  if (role === 'doctor') return '#/doctor/dashboard';
  // Sin rol valido -> al login.
  return '#/login';
}
