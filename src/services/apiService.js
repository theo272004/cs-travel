/**
 * apiService.js
 * =============================================================================
 * PROPOSITO:
 *   Capa UNICA de comunicacion con el backend (json-server) mediante Fetch API.
 *   Es el "adaptador" entre la aplicacion y el origen de los datos.
 *
 * RESPONSABILIDADES:
 *   - Centralizar la URL base del backend.
 *   - Exponer metodos genericos REST: get, getById, post, put, patch, remove.
 *   - Manejar errores de red y respuestas HTTP no exitosas de forma uniforme.
 *
 * POR QUE ESTA CAPA ES IMPORTANTE (escalabilidad / Wix):
 *   Ningun otro archivo de la app llama a fetch() directamente. Todos los
 *   servicios (companyService, requestService, authService) pasan por aqui.
 *   --> El dia que migremos de json-server a Wix Data (Velo) o a una API real,
 *       SOLO se reescribe este archivo. El resto de la aplicacion no cambia.
 *
 * SOBRE LA URL BASE:
 *   Usamos "/api" como prefijo. En desarrollo, Vite (vite.config.js) tiene un
 *   proxy que reenvia "/api/..." hacia "http://localhost:3001/...". Asi evitamos
 *   problemas de CORS y dejamos el host del backend configurado en un solo sitio.
 * =============================================================================
 */

import { localApiAdapter } from './localApiAdapter.js';
import { realApiAdapter } from './realApiAdapter.js';
import { isDeployedBundle } from '../utils/env.js';

// Prefijo logico de la API. El proxy de Vite lo redirige a json-server.
const BASE_URL = '/api';

/**
 * MODO DEMO (sin backend):
 *   - En el build de produccion (GitHub Pages, Netlify, embed estatico) no
 *     existe json-server, asi que usamos el adaptador localStorage.
 *   - En desarrollo se puede forzar abriendo la app con "?demo" en la URL
 *     (ej: http://localhost:5173/?demo#/login) para probar el modo estatico.
 */
const USE_LOCAL_ADAPTER = import.meta.env.PROD || window.location.search.includes('demo');

/**
 * request()
 * Funcion interna y generica que ejecuta cualquier peticion HTTP.
 *
 * @param {string} endpoint - Ruta del recurso. Ej: "/companies" o "/companies/1".
 * @param {object} options  - Opciones nativas de fetch (method, body, etc).
 * @returns {Promise<any>}  - Datos ya parseados a objeto JavaScript.
 * @throws  {Error}         - Si la red falla o el status HTTP no es 2xx.
 *
 * FLUJO:
 *   1) Construye la URL final.
 *   2) Ejecuta fetch con cabeceras JSON por defecto.
 *   3) Si la respuesta no es "ok" (status 200-299), lanza un Error legible.
 *   4) Si todo va bien, devuelve el JSON parseado.
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  // Configuracion por defecto + la que llegue por parametro.
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  };

  try {
    // Llamada de red. await espera la respuesta del servidor.
    const response = await fetch(url, config);

    // fetch NO lanza error con status 404/500: hay que comprobarlo manualmente.
    if (!response.ok) {
      throw new Error(
        `Error ${response.status} (${response.statusText}) al consultar ${endpoint}`
      );
    }

    // 204 No Content (por ejemplo, tras un DELETE) no trae cuerpo JSON.
    if (response.status === 204) return null;

    // Convierte el cuerpo de la respuesta (texto JSON) en objeto JS.
    return await response.json();
  } catch (error) {
    // Errores de red (servidor caido, sin internet) o los que lanzamos arriba.
    console.error('[apiService] Fallo la peticion:', error.message);
    // Re-lanzamos para que el servicio/vista que llamo decida como mostrarlo.
    throw error;
  }
}

/**
 * apiService
 * Objeto publico con los metodos REST que usaran los demas servicios.
 * Cada metodo es un envoltorio semantico sobre request().
 */
// En el portal real (bundle desplegado en /portal-app/) usamos el adaptador
// real (Wix). En local: json-server en dev, o el adaptador demo con "?demo".
export const apiService = isDeployedBundle()
  ? realApiAdapter
  : USE_LOCAL_ADAPTER ? localApiAdapter : {
  /**
   * GET de una coleccion completa o filtrada.
   * @param {string} resource - Nombre del recurso. Ej: "companies".
   * @param {object} query    - Pares clave/valor para filtrar (json-server).
   *                            Ej: { companyId: 1 } -> "?companyId=1"
   */
  get(resource, query = {}) {
    // Convierte el objeto query en query-string: { companyId: 1 } -> "companyId=1"
    const queryString = new URLSearchParams(query).toString();
    const suffix = queryString ? `?${queryString}` : '';
    return request(`/${resource}${suffix}`);
  },

  /** GET de un unico registro por id. Ej: getById("companies", 1). */
  getById(resource, id) {
    return request(`/${resource}/${id}`);
  },

  /** POST: crea un nuevo registro. */
  post(resource, data) {
    return request(`/${resource}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** PUT: reemplaza por completo un registro existente. */
  put(resource, id, data) {
    return request(`/${resource}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** PATCH: actualiza parcialmente (solo los campos enviados). */
  patch(resource, id, data) {
    return request(`/${resource}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** DELETE: elimina un registro por id. */
  remove(resource, id) {
    return request(`/${resource}/${id}`, {
      method: 'DELETE',
    });
  },
};
