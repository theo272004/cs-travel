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
import { isDeployedBundle } from '../utils/env.js';

// Clave bajo la cual se guarda la sesion en localStorage.
const SESSION_KEY = 'cs_travel_session';

/**
 * Lo que se borra del navegador al cerrar sesion en el PORTAL REAL, ademas de
 * la sesion: la copia local de datos (adaptador demo para recursos que aun no
 * estan en Wix) y lo que queda atado a la persona (notificaciones vistas,
 * evento elegido, pestañas). Se conservan solo preferencias sin datos
 * personales (tema claro/oscuro, guias vistas).
 * En el demo local no se borra la base demo: la gente cambia de cuenta de
 * prueba para recorrer un flujo y perderia lo que acaba de crear.
 */
const REAL_PORTAL_KEYS = ['cs_travel_demo_db', 'cs_travel_demo_db_version', 'cs_event_current', 'cs_travel_demo_expediente'];
const REAL_PORTAL_PREFIXES = ['cs_notif_seen_'];
const SESSION_STORAGE_KEYS = ['cs_section_tab', 'cst_focus_referrals'];

/** Borra de forma segura (modo privado o almacenamiento bloqueado no rompe). */
function clearBrowserData(deployed) {
  try {
    localStorage.removeItem(SESSION_KEY);
    if (deployed) {
      REAL_PORTAL_KEYS.forEach((k) => localStorage.removeItem(k));
      Object.keys(localStorage)
        .filter((k) => REAL_PORTAL_PREFIXES.some((p) => k.startsWith(p)))
        .forEach((k) => localStorage.removeItem(k));
    }
  } catch { /* sin almacenamiento */ }
  try {
    SESSION_STORAGE_KEYS.forEach((k) => sessionStorage.removeItem(k));
  } catch { /* sin almacenamiento */ }
}

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
    // En el portal real el unico ingreso es /portal/ (Wix valida la contraseña
    // en el servidor). El login de demostracion no debe funcionar alli aunque
    // alguien llegue a esta funcion.
    if (isDeployedBundle()) {
      throw new Error('Ingresa desde la página de acceso del portal.');
    }
    // Buscamos por email (filtro nativo de json-server).
    const matches = await apiService.get('users', { email });

    // matches es un array. Tomamos el primero (los emails son unicos).
    const user = matches[0];

    // Validacion: existe el usuario Y la password coincide.
    if (!user || user.password !== password) {
      throw new Error('Email o contrasena incorrectos.');
    }

    // Solo bloqueamos a los usuarios INACTIVOS. Los "pendientes" si pueden
    // entrar: usan su contrasena temporal y el flujo de primer ingreso les
    // obliga a definir una nueva (firstLoginRequired).
    if (user.status === 'inactive') {
      throw new Error('Tu usuario esta inactivo. Contacta al equipo de CS Travel Group.');
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
    clearBrowserData(isDeployedBundle());
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
    // En el portal real la contraseña se cambia con el correo de Wix
    // (/api/password-reset); nunca se escribe un campo password en los datos.
    if (isDeployedBundle()) throw new Error('Cambia tu contraseña desde el enlace que te llega al correo.');

    const updatedUser = await apiService.patch('users', session.id, {
      password: newPassword,
      firstLoginRequired: false,
    });

    const { password: _omit, ...safeUser } = updatedUser;
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    return safeUser;
  },
};
