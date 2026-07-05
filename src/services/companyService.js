/**
 * companyService.js
 * =============================================================================
 * PROPOSITO:
 *   Logica de negocio relacionada con EMPRESAS aliadas. Traduce las acciones
 *   de la aplicacion (crear, listar, editar, activar/desactivar) en llamadas
 *   al apiService sobre el recurso "companies".
 *
 * RESPONSABILIDADES:
 *   - getAll()        : listar todas las empresas.
 *   - getById(id)     : obtener una empresa concreta.
 *   - create(data)    : crear una empresa nueva con valores por defecto.
 *   - update(id,data) : editar datos de una empresa.
 *   - toggleStatus()  : activar / desactivar una empresa.
 *   - getMetrics()    : calcular metricas globales para el panel admin.
 *
 * NOTA:
 *   Este servicio NO sabe nada de fetch ni de URLs. Solo conoce apiService.
 *   Esa separacion permite testear y migrar la capa de datos sin tocar negocio.
 * =============================================================================
 */

import { apiService } from './apiService.js';

// Nombre del recurso en json-server.
const RESOURCE = 'companies';

export const companyService = {
  /** Lista todas las empresas aliadas. */
  getAll() {
    return apiService.get(RESOURCE);
  },

  /** Obtiene una empresa por su id. */
  getById(id) {
    return apiService.getById(RESOURCE, id);
  },

  /**
   * create()
   * Crea una empresa nueva. Inicializa los contadores y montos en 0 y la
   * marca como "active" por defecto. El admin completa el resto.
   *
   * @param {object} data - { name, contactName, email, phone, sharedCode, status? }
   */
  create(data) {
    const newCompany = {
      name: data.name,
      contactName: data.contactName,
      email: data.email,
      phone: data.phone,
      // Estado inicial: activo salvo que se indique lo contrario.
      status: data.status || 'active',
      sharedCode: data.sharedCode,
      // Metricas arrancan en cero; se actualizan manualmente o con el uso.
      totalRequests: 0,
      totalTrips: 0,
      totalCost: 0,
      estimatedSavings: 0,
      estimatedReturn: 0,
      // Fecha de ultima actualizacion en formato ISO.
      lastUpdate: new Date().toISOString(),
    };
    return apiService.post(RESOURCE, newCompany);
  },

  /**
   * update()
   * Actualiza parcialmente una empresa (PATCH) y refresca lastUpdate.
   * Sirve tanto para editar datos basicos como para que el admin ajuste
   * manualmente costos, ahorro y retorno.
   */
  update(id, data) {
    const payload = {
      ...data,
      lastUpdate: new Date().toISOString(),
    };
    return apiService.patch(RESOURCE, id, payload);
  },

  /**
   * toggleStatus()
   * Cambia el estado de una empresa entre "active" e "inactive".
   * @param {object} company - La empresa actual (para conocer su estado).
   */
  toggleStatus(company) {
    const nextStatus = company.status === 'active' ? 'inactive' : 'active';
    return this.update(company.id, { status: nextStatus });
  },

  /** Elimina una empresa por id. Accion destructiva: usar con confirmacion. */
  remove(id) {
    return apiService.remove(RESOURCE, id);
  },

  /**
   * recompute()
   * Recalcula los agregados de UNA empresa a partir de sus solicitudes reales
   * y los persiste. Asi, cuando el admin edita una solicitud (costo, ahorro,
   * estado), el dashboard de la empresa refleja los nuevos totales sin tocar
   * nada a mano. Devuelve la empresa actualizada.
   */
  async recompute(companyId) {
    // BEST-EFFORT: nunca debe romper la accion del usuario. En produccion la
    // empresa (no-admin) NO puede escribir 'companies' (lo hace el servidor tras
    // su accion); en demo y para el admin si persiste aqui. Tragamos cualquier
    // fallo (p. ej. 403) para no mostrar un error enganoso al aprobar/crear.
    try {
      const own = await apiService.get('requests', { companyId });
      const totals = own.reduce(
        (acc, r) => {
          acc.totalRequests += 1;
          if (r.status === 'finalizada') acc.totalTrips += 1;
          acc.totalCost += r.estimatedCost || 0;
          acc.estimatedSavings += r.estimatedSavings || 0;
          acc.estimatedReturn += r.estimatedReturn || 0;
          return acc;
        },
        { totalRequests: 0, totalTrips: 0, totalCost: 0, estimatedSavings: 0, estimatedReturn: 0 }
      );
      return await this.update(companyId, totals);
    } catch (e) {
      return null;
    }
  },

  /**
   * getMetrics()
   * Calcula metricas globales del sistema agregando todas las empresas.
   * Lo usa el dashboard del administrador.
   *
   * @returns {Promise<object>} - { totalCompanies, activeCompanies,
   *   totalCost, totalSavings, totalReturn }
   */
  async getMetrics() {
    const companies = await this.getAll();
    return companies.reduce(
      (acc, c) => {
        acc.totalCompanies += 1;
        if (c.status === 'active') acc.activeCompanies += 1;
        acc.totalCost += c.totalCost || 0;
        acc.totalSavings += c.estimatedSavings || 0;
        acc.totalReturn += c.estimatedReturn || 0;
        return acc;
      },
      {
        totalCompanies: 0,
        activeCompanies: 0,
        totalCost: 0,
        totalSavings: 0,
        totalReturn: 0,
      }
    );
  },
};
