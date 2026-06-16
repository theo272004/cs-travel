/**
 * realApiAdapter.js
 * =============================================================================
 * PROPOSITO:
 *   Adaptador de datos para el PORTAL REAL (bundle en /portal-app/). Habla con
 *   los endpoints de Astro /api/data/* respaldados por colecciones de Wix.
 *
 *   Mantiene la MISMA interfaz que localApiAdapter / json-server
 *   (get/getById/post/put/patch/remove) para que ningun servicio ni vista
 *   tenga que cambiar.
 *
 *   Los recursos "reales" (REAL) van a la base de datos de Wix; el resto se
 *   delega al adaptador local (demo) para no romper pantallas aun no migradas.
 *   La seguridad/alcance por rol se aplica en el servidor (cookie de sesion).
 * =============================================================================
 */

import { localApiAdapter } from './localApiAdapter.js';

const REAL = new Set(['medicalCases', 'doctors', 'companies', 'requests', 'users']);
const BASE = '/api/data';

async function http(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || `Error ${res.status} al consultar ${path}`);
  }
  return data;
}

export const realApiAdapter = {
  get(resource, query = {}) {
    if (!REAL.has(resource)) return localApiAdapter.get(resource, query);
    const qs = new URLSearchParams(query).toString();
    return http(`/${resource}${qs ? `?${qs}` : ''}`);
  },

  getById(resource, id) {
    if (!REAL.has(resource)) return localApiAdapter.getById(resource, id);
    return http(`/${resource}/${encodeURIComponent(id)}`);
  },

  post(resource, data) {
    if (!REAL.has(resource)) return localApiAdapter.post(resource, data);
    return http(`/${resource}`, { method: 'POST', body: JSON.stringify(data) });
  },

  // La actualizacion del servidor es por mezcla (merge), asi que put y patch
  // usan el mismo endpoint PATCH.
  put(resource, id, data) {
    if (!REAL.has(resource)) return localApiAdapter.put(resource, id, data);
    return http(`/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  patch(resource, id, data) {
    if (!REAL.has(resource)) return localApiAdapter.patch(resource, id, data);
    return http(`/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  remove(resource, id) {
    if (!REAL.has(resource)) return localApiAdapter.remove(resource, id);
    return http(`/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
