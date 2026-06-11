/**
 * localApiAdapter.js
 * =============================================================================
 * PROPOSITO:
 *   Backend de DEMO 100% en el navegador para despliegues estaticos
 *   (GitHub Pages, Netlify, embed en Wix...), donde no existe json-server.
 *
 * COMO FUNCIONA:
 *   - Los datos semilla se importan de db.json y se copian a localStorage la
 *     primera vez que el visitante abre la app.
 *   - Todas las operaciones (get/post/patch/delete) leen y escriben sobre esa
 *     copia local, replicando el comportamiento basico de json-server
 *     (filtros por igualdad via query params e ids numericos autoincrementales).
 *   - Cada visitante tiene su PROPIA copia de los datos: ideal para que un
 *     cliente explore el prototipo sin poder afectar a nadie mas.
 *
 *   apiService.js decide cuando usar este adaptador (build de produccion o
 *   "?demo" en la URL) y cuando hablar con json-server real (desarrollo).
 * =============================================================================
 */

import seedData from '../data/db.json';

const STORAGE_KEY = 'cs_travel_demo_db';

/** Carga la base demo desde localStorage (sembrandola si no existe). */
function loadDb() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Datos corruptos: re-sembramos.
    }
  }
  const fresh = JSON.parse(JSON.stringify(seedData));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/** Simula la latencia minima de una API real (mantiene los flujos async honestos). */
function respond(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), 30));
}

function notFound(resource, id) {
  return Promise.reject(new Error(`Error 404 (Not Found) al consultar /${resource}/${id}`));
}

/** Borra la copia local y vuelve a los datos semilla (util para demos). */
export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEY);
}

export const localApiAdapter = {
  get(resource, query = {}) {
    const db = loadDb();
    let items = db[resource] || [];
    // Filtros por igualdad, como json-server: ?email=x => item.email === x
    const entries = Object.entries(query);
    if (entries.length > 0) {
      items = items.filter((item) =>
        entries.every(([key, value]) => String(item[key]) === String(value))
      );
    }
    return respond(JSON.parse(JSON.stringify(items)));
  },

  getById(resource, id) {
    const db = loadDb();
    const item = (db[resource] || []).find((entry) => String(entry.id) === String(id));
    if (!item) return notFound(resource, id);
    return respond(JSON.parse(JSON.stringify(item)));
  },

  post(resource, data) {
    const db = loadDb();
    const items = db[resource] || (db[resource] = []);
    const nextId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const record = { ...data, id: nextId };
    items.push(record);
    saveDb(db);
    return respond(JSON.parse(JSON.stringify(record)));
  },

  put(resource, id, data) {
    const db = loadDb();
    const items = db[resource] || [];
    const index = items.findIndex((entry) => String(entry.id) === String(id));
    if (index === -1) return notFound(resource, id);
    items[index] = { ...data, id: items[index].id };
    saveDb(db);
    return respond(JSON.parse(JSON.stringify(items[index])));
  },

  patch(resource, id, data) {
    const db = loadDb();
    const items = db[resource] || [];
    const index = items.findIndex((entry) => String(entry.id) === String(id));
    if (index === -1) return notFound(resource, id);
    items[index] = { ...items[index], ...data, id: items[index].id };
    saveDb(db);
    return respond(JSON.parse(JSON.stringify(items[index])));
  },

  remove(resource, id) {
    const db = loadDb();
    const items = db[resource] || [];
    const index = items.findIndex((entry) => String(entry.id) === String(id));
    if (index === -1) return notFound(resource, id);
    items.splice(index, 1);
    saveDb(db);
    return respond(null);
  },
};
