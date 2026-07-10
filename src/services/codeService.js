/**
 * codeService.js
 * =============================================================================
 * PROPOSITO:
 *   Logica de negocio de los CODIGOS de referido/descuento. Un mismo codigo
 *   cumple dos funciones: (1) atribuye el referido a un socio (empresa o medico)
 *   y (2) aplica un descuento al cliente al pagar. Se traduce a llamadas al
 *   apiService sobre el recurso "codes".
 *
 * RESPONSABILIDADES:
 *   - getAll()        : listar todos los codigos.
 *   - getById(id)     : obtener uno.
 *   - create(data)    : crear un codigo (normaliza el texto a MAYUSCULAS).
 *   - update(id,data) : editar parcialmente.
 *   - toggleStatus()  : activar / desactivar.
 *   - remove(id)      : borrar.
 *   - existsCode()    : evitar duplicados (case-insensitive).
 *
 * NOTA: No conoce fetch ni URLs; solo apiService. En modo demo escribe en
 *       localStorage; en el portal real ira contra Wix (misma interfaz).
 * =============================================================================
 */

import { apiService } from './apiService.js';

const RESOURCE = 'codes';

/** Normaliza el texto del codigo: sin espacios y en MAYUSCULAS. */
function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export const codeService = {
  /** Lista todos los codigos. */
  getAll() {
    return apiService.get(RESOURCE);
  },

  /** Obtiene un codigo por id. */
  getById(id) {
    return apiService.getById(RESOURCE, id);
  },

  /**
   * Codigos ACTIVOS asignados a un socio concreto (empresa/medico). Sirve para
   * saber si el admin ya le asigno un codigo de referido: si la lista viene vacia,
   * esta "pendiente"; si trae alguno, esta "asignado". Resiliente (lista vacia si
   * la coleccion aun no existe).
   */
  async getByOwner(ownerType, ownerId) {
    const all = await this.getAll().catch(() => []);
    return (all || []).filter(
      (c) =>
        c.ownerType === ownerType &&
        String(c.ownerId) === String(ownerId) &&
        c.status === 'active',
    );
  },

  /**
   * create()
   * Crea un codigo nuevo. Inicializa los usos en 0 y la fecha de creacion.
   * @param {object} data - { code, discountType, discountValue, ownerType,
   *                          ownerId, ownerName, status? }
   */
  create(data) {
    const record = {
      code: normalizeCode(data.code),
      // Tipo de código por público (los 2 del contrato): clientes | colaboradores.
      codeType: data.codeType === 'colaboradores' ? 'colaboradores' : 'clientes',
      discountType: data.discountType === 'fixed' ? 'fixed' : 'percent',
      discountValue: Number(data.discountValue) || 0,
      ownerType: data.ownerType || '',
      // ownerId se guarda TAL CUAL (string). En producción es un GUID de Wix;
      // NO se convierte a número (Number(GUID)=NaN -> JSON null, rompía el vínculo
      // con el dueño y el código nunca aparecía como "asignado").
      ownerId: data.ownerId != null && data.ownerId !== '' ? String(data.ownerId) : null,
      ownerName: data.ownerName || '',
      status: data.status || 'active',
      uses: 0,
      createdAt: new Date().toISOString(),
    };
    return apiService.post(RESOURCE, record);
  },

  /** Actualiza parcialmente un codigo. */
  update(id, data) {
    return apiService.patch(RESOURCE, id, data);
  },

  /** Activa / desactiva un codigo. */
  toggleStatus(code) {
    const next = code.status === 'active' ? 'inactive' : 'active';
    return this.update(code.id, { status: next });
  },

  /** Borra un codigo por id. */
  remove(id) {
    return apiService.remove(RESOURCE, id);
  },

  /** Normaliza un texto al formato de codigo (expuesto para validar en la vista). */
  normalize: normalizeCode,
};
