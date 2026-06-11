/**
 * router.js
 * =============================================================================
 * PROPOSITO:
 *   Enrutador de la SPA basado en el HASH de la URL (#/ruta). Decide que vista
 *   renderizar segun la ruta actual, aplica los guards de proteccion y arma el
 *   layout (navbar + sidebar) para las pantallas autenticadas.
 *
 * RESPONSABILIDADES:
 *   - Mantener la tabla de rutas (path -> vista, auth, rol, layout).
 *   - Parsear el hash y extraer parametros dinamicos (ej: :id).
 *   - Ejecutar guards (requireAuth / requireRole) antes de renderizar.
 *   - Inyectar el HTML de la vista en #app (con o sin layout).
 *   - Llamar a afterRender() de la vista para enlazar eventos.
 *
 * POR QUE HASH ROUTING:
 *   Con rutas tipo "#/admin/dashboard" el navegador no hace peticiones al
 *   servidor al cambiar de ruta: solo dispara el evento 'hashchange'. Es la
 *   forma mas simple de hacer una SPA sin configuracion de servidor, y funciona
 *   bien al incrustar/desplegar en distintos hostings (incluido un futuro Wix).
 *
 * CONTRATO DE UNA VISTA:
 *   Cada vista es un objeto con:
 *     - async render(ctx): devuelve un string de HTML.
 *     - async afterRender(ctx) [opcional]: enlaza eventos tras pintar el HTML.
 *   ctx = { params, query, user, hash }.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { requireAuth, requireRole, redirectByRole } from '../utils/guards.js';
import { Navbar } from '../components/Navbar.js';
import { Sidebar } from '../components/Sidebar.js';
import { QuickCreate, bindQuickCreate } from '../components/QuickCreate.js';

// --- Vistas ---------------------------------------------------------------
import { LoginView } from '../views/LoginView.js';
import { FirstLoginView } from '../views/FirstLoginView.js';
import { AdminDashboardView } from '../views/AdminDashboardView.js';
import { AdminCompaniesView } from '../views/AdminCompaniesView.js';
import { AdminCompanyDetailView } from '../views/AdminCompanyDetailView.js';
import { AdminRequestsView } from '../views/AdminRequestsView.js';
import { AdminUsersView } from '../views/AdminUsersView.js';
import { AdminUserDetailView } from '../views/AdminUserDetailView.js';
import { AdminDoctorsView } from '../views/AdminDoctorsView.js';
import { AdminDoctorDetailView } from '../views/AdminDoctorDetailView.js';
import { AdminMedicalCasesView } from '../views/AdminMedicalCasesView.js';
import { AdminKanbanView } from '../views/AdminKanbanView.js';
import { RequestDetailView } from '../views/RequestDetailView.js';
import { CompanyDashboardView } from '../views/CompanyDashboardView.js';
import { CompanyRequestsView } from '../views/CompanyRequestsView.js';
import { NewRequestView } from '../views/NewRequestView.js';
import { DoctorDashboardView } from '../views/DoctorDashboardView.js';
import { DoctorCasesView } from '../views/DoctorCasesView.js';
import { NewMedicalCaseView } from '../views/NewMedicalCaseView.js';
import { MedicalCaseDetailView } from '../views/MedicalCaseDetailView.js';
import { NotFoundView } from '../views/NotFoundView.js';
import { NotAuthorizedView } from '../views/NotAuthorizedView.js';

/**
 * TABLA DE RUTAS
 * Cada ruta declara:
 *   - path  : patron con segmentos. ":id" captura un valor dinamico.
 *   - view  : objeto vista (render/afterRender).
 *   - auth  : true si requiere sesion.
 *   - role  : rol requerido ("admin" | "company"), opcional.
 *   - layout: "app" (con navbar+sidebar) o "blank" (pantalla limpia).
 */
const routes = [
  { path: '#/login', view: LoginView, auth: false, layout: 'blank' },
  { path: '#/first-login', view: FirstLoginView, auth: true, layout: 'blank' },

  // --- Admin ---
  { path: '#/admin/dashboard', view: AdminDashboardView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/users', view: AdminUsersView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/users/:id', view: AdminUserDetailView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/companies', view: AdminCompaniesView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/companies/:id', view: AdminCompanyDetailView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/doctors', view: AdminDoctorsView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/doctors/:id', view: AdminDoctorDetailView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/requests', view: AdminRequestsView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/requests/:id', view: RequestDetailView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/medical-cases', view: AdminMedicalCasesView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/medical-cases/:id', view: MedicalCaseDetailView, auth: true, role: 'admin', layout: 'app' },
  { path: '#/admin/kanban', view: AdminKanbanView, auth: true, role: 'admin', layout: 'app' },

  // --- Empresa ---
  { path: '#/company/dashboard', view: CompanyDashboardView, auth: true, role: 'company', layout: 'app' },
  { path: '#/company/requests', view: CompanyRequestsView, auth: true, role: 'company', layout: 'app' },
  { path: '#/company/requests/new', view: NewRequestView, auth: true, role: 'company', layout: 'app' },
  { path: '#/company/requests/:id', view: RequestDetailView, auth: true, role: 'company', layout: 'app' },

  // --- Medico / Clinica ---
  { path: '#/doctor/dashboard', view: DoctorDashboardView, auth: true, role: 'doctor', layout: 'app' },
  { path: '#/doctor/cases', view: DoctorCasesView, auth: true, role: 'doctor', layout: 'app' },
  { path: '#/doctor/cases/new', view: NewMedicalCaseView, auth: true, role: 'doctor', layout: 'app' },
  { path: '#/doctor/cases/:id', view: MedicalCaseDetailView, auth: true, role: 'doctor', layout: 'app' },

  // --- Errores ---
  { path: '#/not-authorized', view: NotAuthorizedView, auth: false, layout: 'blank' },
  { path: '#/not-found', view: NotFoundView, auth: false, layout: 'blank' },
];

/**
 * matchRoute()
 * Compara el hash actual contra los patrones de las rutas y, si encuentra una
 * coincidencia, devuelve { route, params }. Soporta segmentos dinamicos (:id).
 *
 * @param {string} hashPath - Solo la parte de ruta del hash (sin query-string).
 * @returns {{ route: object, params: object } | null}
 */
function matchRoute(hashPath) {
  // Partimos la ruta actual en segmentos: "#/admin/companies/1" -> ["#","admin","companies","1"]
  const currentSegments = hashPath.split('/');

  for (const route of routes) {
    const routeSegments = route.path.split('/');

    // Si tienen distinto numero de segmentos, no pueden coincidir.
    if (routeSegments.length !== currentSegments.length) continue;

    const params = {};
    let matches = true;

    // Comparamos segmento a segmento.
    for (let i = 0; i < routeSegments.length; i++) {
      const routeSeg = routeSegments[i];
      const currentSeg = currentSegments[i];

      if (routeSeg.startsWith(':')) {
        // Segmento dinamico: capturamos el valor. ":id" -> params.id = currentSeg
        const paramName = routeSeg.slice(1);
        params[paramName] = decodeURIComponent(currentSeg);
      } else if (routeSeg !== currentSeg) {
        // Segmento fijo que no coincide: esta ruta no sirve.
        matches = false;
        break;
      }
    }

    if (matches) return { route, params };
  }

  return null; // Ninguna ruta coincide -> 404.
}

/**
 * parseQuery()
 * Extrae los parametros de query del hash. Ej: "#/x?status=nueva" -> { status: 'nueva' }.
 */
function parseQuery(rawHash) {
  const queryIndex = rawHash.indexOf('?');
  if (queryIndex === -1) return {};
  const queryString = rawHash.slice(queryIndex + 1);
  return Object.fromEntries(new URLSearchParams(queryString));
}

/**
 * navigate()
 * Cambia la ruta actual de forma programatica (desde JS).
 * @param {string} hash - Ej: "#/admin/dashboard".
 */
export function navigate(hash) {
  // Cambiar location.hash dispara el evento 'hashchange' -> resolveRoute().
  window.location.hash = hash;
}

/**
 * resolveRoute()
 * Funcion principal: se ejecuta en cada cambio de hash y al cargar la pagina.
 * Resuelve que vista mostrar, aplica guards y renderiza.
 */
export async function resolveRoute() {
  const app = document.getElementById('app');

  // Hash completo actual. Si esta vacio, lo tratamos como raiz.
  const rawHash = window.location.hash || '#/';

  // Separamos la parte de ruta (sin query) de los parametros de query.
  const hashPath = rawHash.split('?')[0];
  const query = parseQuery(rawHash);

  // Ruta raiz ("#/" o "#"): redirigimos segun haya sesion o no.
  if (hashPath === '#/' || hashPath === '#') {
    return navigate(authService.isAuthenticated() ? redirectByRole() : '#/login');
  }

  // Si el usuario YA tiene sesion y vuelve a #/login, lo mandamos a su dashboard.
  if (hashPath === '#/login' && authService.isAuthenticated()) {
    return navigate(redirectByRole());
  }

  // Buscamos la ruta que coincide.
  const match = matchRoute(hashPath);

  // Sin coincidencia -> pagina 404.
  if (!match) {
    return navigate('#/not-found');
  }

  const { route, params } = match;

  // --- GUARDS: proteccion de rutas -------------------------------------
  // 1) Autenticacion: la ruta requiere sesion?
  if (route.auth) {
    const authRedirect = requireAuth();
    if (authRedirect) return navigate(authRedirect);

    // 2) Rol: la ruta requiere un rol concreto?
    if (route.role) {
      const roleRedirect = requireRole(route.role);
      if (roleRedirect) return navigate(roleRedirect);
    }
  }

  // Usuario actual (puede ser null en rutas publicas).
  const user = authService.getSession();

  if (user?.firstLoginRequired && hashPath !== '#/first-login') {
    return navigate('#/first-login');
  }

  if (hashPath === '#/first-login' && user && !user.firstLoginRequired) {
    return navigate(redirectByRole());
  }

  // Contexto que recibira la vista.
  const ctx = { params, query, user, hash: hashPath };

  // --- RENDERIZADO ------------------------------------------------------
  try {
    // 1) Pedimos a la vista su HTML.
    const viewHtml = await route.view.render(ctx);

    // 2) Segun el layout, envolvemos con navbar+sidebar o lo dejamos limpio.
    if (route.layout === 'app' && user) {
      app.innerHTML = renderAppLayout(viewHtml, user, hashPath);
    } else {
      app.innerHTML = `<main class="blank-layout">${viewHtml}</main>`;
    }

    // 3) Tras pintar el HTML, la vista enlaza sus eventos (si lo necesita).
    if (typeof route.view.afterRender === 'function') {
      await route.view.afterRender(ctx);
    }

    // 4) Enlazamos el boton flotante de creacion rapida (empresa/medico).
    if (route.layout === 'app' && user) {
      bindQuickCreate(user.role);
    }

    // Subimos el scroll al inicio al cambiar de vista (mejor UX).
    window.scrollTo(0, 0);
  } catch (error) {
    // Cualquier fallo al renderizar (ej: backend caido) se muestra al usuario.
    console.error('[router] Error al renderizar la vista:', error);
    app.innerHTML = `
      <main class="blank-layout">
        <div class="error-screen">
          <h1>Algo salio mal</h1>
          <p>${error.message}</p>
          <p class="muted">Verifica que json-server este corriendo (npm run server).</p>
          <a href="#/login" class="btn btn--primary">Volver al inicio</a>
        </div>
      </main>
    `;
  }
}

/**
 * renderAppLayout()
 * Envuelve el contenido de una vista con la estructura comun de la app:
 * barra superior (Navbar) + menu lateral (Sidebar) + area de contenido.
 *
 * @param {string} content     - HTML de la vista.
 * @param {object} user        - Usuario logueado.
 * @param {string} currentHash - Hash actual (para resaltar el menu activo).
 * @returns {string} HTML completo del layout.
 */
function renderAppLayout(content, user, currentHash) {
  return `
    ${Navbar(user)}
    <div class="app-shell">
      ${Sidebar(user.role, currentHash)}
      <!-- Capa oscura para cerrar el sidebar al tocar fuera (solo movil). -->
      <div class="sidebar-overlay" data-action="close-sidebar"></div>
      <main class="content">
        ${content}
      </main>
    </div>
    ${QuickCreate(user.role)}
  `;
}

/**
 * initRouter()
 * Arranca el enrutador: registra los listeners y resuelve la ruta inicial.
 * Lo llama main.js al cargar la app.
 */
export function initRouter() {
  // Cada vez que cambia el hash de la URL, resolvemos la ruta.
  window.addEventListener('hashchange', resolveRoute);
  // Resolvemos tambien al cargar por primera vez.
  window.addEventListener('DOMContentLoaded', resolveRoute);
}
