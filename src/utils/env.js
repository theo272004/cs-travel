/**
 * env.js
 * =============================================================================
 * PROPOSITO:
 *   Detectar si la app corre como BUNDLE DESPLEGADO dentro del portal real
 *   (servida bajo /portal-app/ en cstravelgroup.com) o como PROTOTIPO LOCAL
 *   (vite dev + json-server).
 *
 * POR QUE:
 *   En el portal real la unica entrada valida es el login real de Astro
 *   (/portal/), que valida la cookie de Wix. La version desplegada NO debe
 *   permitir el login interno de demostracion (admin@cstravel.com / admin123),
 *   porque cualquiera podria entrar como administrador. En local, en cambio,
 *   seguimos usando el login de demo para poder probar sin Wix.
 * =============================================================================
 */

/** true si la app se sirve bajo /portal-app/ (bundle del portal real). */
export function isDeployedBundle() {
  try {
    return window.location.pathname.includes('/portal-app/');
  } catch {
    return false;
  }
}
