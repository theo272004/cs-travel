/**
 * AdminMedicalCasesView.js
 * =============================================================================
 * "Casos médicos" dejó de ser una vista aparte: Operaciones (#/admin/requests)
 * es UNA sola vista unificada con filtro por tipo (Solicitudes / Casos médicos).
 * Las pestañas separadas confundían y duplicaban, así que esta ruta redirige a
 * Operaciones. El detalle del caso (#/admin/medical-cases/:id) sigue intacto.
 * =============================================================================
 */
import { navigate } from '../router/router.js';

export const AdminMedicalCasesView = {
  async render() {
    navigate('#/admin/requests');
    return '';
  },
};
