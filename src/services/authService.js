/**
 * authService.js
 * =============================================================================
 * PROPOSITO:
 *   Gestionar la autenticacion y la sesion del usuario.
 *
 * RESPONSABILIDADES:
 *   - login()    : validar email + password contra los usuarios del backend.
 *   - logout()   : cerrar sesion borrando los datos guardados.
 *   - getSession(): leer la sesion activa desde localStorage.
 *   - isAuthenticated(), getRole(), getCompanyId(): helpers de consulta.
 *
 * PERSISTENCIA DE SESION (localStorage):
 *   Tras un login correcto guardamos el usuario (sin password) en localStorage
 *   bajo la clave "cs_travel_session". Asi la sesion sobrevive a recargas de
 *   pagina (F5) y a cerrar/abrir el navegador, sin volver a pedir credenciales.
 *
 * NOTA DE SEGURIDAD (didactica):
 *   Validar password en el frontend y guardar la sesion en localStorage es
 *   correcto para un MVP/demo, pero NO es seguro para produccion real. En una
 *   version real, la validacion ocurre en el servidor y se usan tokens (JWT)
 *   o cookies httpOnly. Aqui priorizamos claridad para estudio.
 * =============================================================================
 */

import { apiService } from './apiService.js';

// Clave bajo la cual se guarda la sesion en localStorage.
const SESSION_KEY = 'cs_travel_session';

export const authService = {
  /**
   * login()
   * Valida credenciales contra el recurso "users" de json-server.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>} - Usuario autenticado (sin el password).
   * @throws  {Error}           - Si las credenciales son invalidas.
   *
   * FLUJO:
   *   1) Pedimos al backend los usuarios que coincidan con ese email.
   *      json-server permite filtrar: GET /users?email=...
   *   2) Si no hay ninguno, o la password no coincide, lanzamos error.
   *   3) Si todo es correcto, guardamos la sesion y devolvemos el usuario.
   */
  async login(email, password) {
    // Buscamos por email (filtro nativo de json-server).
    const matches = await apiService.get('users', { email });

    // matches es un array. Tomamos el primero (los emails son unicos).
    const user = matches[0];

    // Validacion: existe el usuario Y la password coincide.
    if (!user || user.password !== password) {
      throw new Error('Email o contrasena incorrectos.');
    }

    if (user.status && user.status !== 'active') {
      throw new Error('Tu usuario no esta activo. Contacta al equipo de CS Travel.');
    }

    const updatedUser = await apiService.patch('users', user.id, {
      lastLogin: new Date().toISOString(),
    });

    // Nunca guardamos el password en la sesion. Lo quitamos del objeto.
    const { password: _omit, ...safeUser } = updatedUser;

    // Persistimos la sesion en localStorage como texto JSON.
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));

    return safeUser;
  },

  /**
   * logout()
   * Cierra la sesion eliminando los datos de localStorage.
   */
  logout() {
    localStorage.removeItem(SESSION_KEY);
  },

  /**
   * getSession()
   * Devuelve el usuario logueado (objeto) o null si no hay sesion.
   * Lee de localStorage y parsea el JSON guardado.
   */
  getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Si el JSON esta corrupto, limpiamos para evitar estados inconsistentes.
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  },

  /** true si hay un usuario con sesion activa. */
  isAuthenticated() {
    return this.getSession() !== null;
  },

  /** Devuelve el rol del usuario logueado ("admin" | "company") o null. */
  getRole() {
    const session = this.getSession();
    return session ? session.role : null;
  },

  /** Devuelve el companyId del usuario logueado (solo rol company) o null. */
  getCompanyId() {
    const session = this.getSession();
    return session ? session.companyId : null;
  },

  /** Devuelve el doctorId del usuario logueado (solo rol doctor) o null. */
  getDoctorId() {
    const session = this.getSession();
    return session ? session.doctorId : null;
  },

  async completeFirstLogin(newPassword) {
    const session = this.getSession();
    if (!session) throw new Error('No hay sesion activa.');

    const updatedUser = await apiService.patch('users', session.id, {
      password: newPassword,
      firstLoginRequired: false,
    });

    const { password: _omit, ...safeUser } = updatedUser;
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    return safeUser;
  },
};
