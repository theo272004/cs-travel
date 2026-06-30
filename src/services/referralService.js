/**
 * referralService.js
 * =============================================================================
 * PROPOSITO:
 *   Logica de los REFERIDOS de afiliado (clientes que una empresa/aliado refiere
 *   a CS Travel). El admin/dueño los registra y los CIERRA manualmente: confirma
 *   el estado de la gestion y, al aprobarse/finalizarse, queda atribuida la
 *   comision/retorno. Es el modelo "medio funcional manual": el sistema no
 *   captura solo quien escribio por WhatsApp; el dueño lo registra a mano.
 *
 *   Se traduce a llamadas al apiService sobre el recurso "referrals". En demo
 *   escribe en localStorage; en el portal real va contra la coleccion Wix
 *   "Referrals" (misma interfaz). Ver [[codes-referral-discount]].
 *
 * MODELO DE DATOS (por referido):
 *   { companyId, name, date, status, amount, commissionPct, notes }
 *   status: escribio | cotizo | aprobado | finalizado
 *   (aprobado/finalizado = ya genera comision/retorno liquidable)
 * =============================================================================
 */

import { apiService } from './apiService.js';

const RESOURCE = 'referrals';

// Estados que ya generan comision/retorno (gestion cerrada favorablemente).
export const REFERRAL_EARNED_STATUSES = ['aprobado', 'finalizado'];

export const referralService = {
  /** Lista los referidos de UNA empresa (los demas no le incumben). */
  getByCompany(companyId) {
    return apiService.get(RESOURCE, { companyId });
  },

  /** Lista todos (uso admin). */
  getAll() {
    return apiService.get(RESOURCE);
  },

  /**
   * create()
   * Registra un referido nuevo para una empresa.
   * @param {object} data - { companyId, name, date?, status?, amount?, commissionPct?, notes? }
   */
  create(data) {
    const record = {
      companyId: data.companyId,
      name: String(data.name || '').trim(),
      date: data.date || new Date().toISOString().slice(0, 10),
      status: data.status || 'escribio',
      amount: Number(data.amount) || 0,
      commissionPct: Number(data.commissionPct) || 0,
      notes: String(data.notes || '').trim(),
      createdAt: new Date().toISOString(),
    };
    return apiService.post(RESOURCE, record);
  },

  /** Actualiza parcialmente un referido (p. ej. cambiar de estado). */
  update(id, data) {
    return apiService.patch(RESOURCE, id, data);
  },

  /** Borra un referido por id. */
  remove(id) {
    return apiService.remove(RESOURCE, id);
  },
};
