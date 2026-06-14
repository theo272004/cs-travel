/**
 * quoteService.js
 * =============================================================================
 * PROPOSITO:
 *   CRUD de COTIZACIONES editables (estilo "itinerario") que el admin arma a
 *   partir de una plantilla y exporta a PDF. Cada cotizacion guarda bloques
 *   (ciudades/hoteles/excursiones), tramos de transporte, incluye/no incluye,
 *   totales y la configuracion de MARCA BLANCA (presentarla sin la marca CST).
 * =============================================================================
 */

import { apiService } from './apiService.js';

const RESOURCE = 'quotes';

/** Suma segura de los precios de una lista de items {price}. */
export function sumPrices(items = []) {
  return items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
}

/** Total general de una cotizacion (bloques + transporte). */
export function quoteTotal(quote) {
  return sumPrices(quote.blocks) + sumPrices(quote.transport);
}

export const quoteService = {
  getAll() {
    return apiService.get(RESOURCE);
  },

  getById(id) {
    return apiService.getById(RESOURCE, id);
  },

  async create(data) {
    const existing = await this.getAll();
    const nextNumber = String(existing.length + 1).padStart(4, '0');
    const now = new Date().toISOString();
    return apiService.post(RESOURCE, {
      code: `COT-${new Date().getFullYear()}-${nextNumber}`,
      createdAt: now,
      updatedAt: now,
      ...data,
    });
  },

  update(id, data) {
    return apiService.patch(RESOURCE, id, { ...data, updatedAt: new Date().toISOString() });
  },

  remove(id) {
    return apiService.remove(RESOURCE, id);
  },
};
