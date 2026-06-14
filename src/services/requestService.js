/**
 * requestService.js
 * =============================================================================
 * PROPOSITO:
 *   Logica de negocio de las SOLICITUDES de viaje. Traduce acciones de la UI
 *   en operaciones sobre el recurso "requests" de json-server.
 *
 * RESPONSABILIDADES:
 *   - getAll()            : todas las solicitudes (uso admin).
 *   - getByCompany(id)    : solicitudes de UNA empresa (aislamiento de datos).
 *   - getById(id)         : una solicitud concreta.
 *   - create(data)        : crear solicitud con codigo autogenerado.
 *   - update(id,data)     : editar solicitud / ajustar costos.
 *   - changeStatus()      : cambiar solo el estado.
 *   - remove(id)          : eliminar (solo admin, validado en la vista/guard).
 *   - getActive()         : filtrar las que estan "en curso".
 *
 * ESTADOS POSIBLES (constante STATUSES):
 *   Se exporta para reutilizar en selects y badges de las vistas.
 * =============================================================================
 */

import { apiService } from './apiService.js';

const RESOURCE = 'requests';

// Catalogo de estados de una operacion (orden logico del flujo de trabajo).
// Modelo simplificado (6 estados) alineado con el proceso real:
//   1) solicitud enviada  -> el aliado envia el caso; CS Travel cotiza la base.
//   2) cotizacion enviada -> CS Travel envio la cotizacion base; el aliado elige
//                            su margen y la presenta al cliente/paciente.
//   3) aprobada           -> el cliente/paciente autoriza.
//   4) en gestion         -> pagado; CS Travel compra tickets / gestiona.
//   5) finalizada         -> todo emitido; el aliado gana la diferencia.
//   6) cancelada          -> no se cerro.
export const STATUSES = [
  'solicitud enviada',
  'cotizacion enviada',
  'aprobada',
  'en gestion',
  'finalizada',
  'cancelada',
];

// Estados que consideramos "activos" (la operacion sigue viva, no cerrada).
const ACTIVE_STATUSES = [
  'solicitud enviada',
  'cotizacion enviada',
  'aprobada',
  'en gestion',
];

export const requestService = {
  /** Todas las solicitudes del sistema (panel admin). */
  getAll() {
    return apiService.get(RESOURCE);
  },

  /**
   * getByCompany()
   * Devuelve SOLO las solicitudes de una empresa. Clave para el aislamiento
   * de datos: una empresa nunca debe ver solicitudes de otra.
   * Usa el filtro nativo de json-server: GET /requests?companyId=ID
   */
  getByCompany(companyId) {
    return apiService.get(RESOURCE, { companyId });
  },

  /** Una solicitud por id. */
  getById(id) {
    return apiService.getById(RESOURCE, id);
  },

  /**
   * create()
   * Crea una solicitud nueva. Genera un requestCode legible, fija el estado
   * inicial en "nueva" y deja los montos en 0 (los completa el admin al cotizar).
   *
   * @param {object} data - Datos del formulario + companyId.
   */
  async create(data) {
    // Generamos un codigo simple basado en el ano y un consecutivo aproximado.
    const existing = await this.getAll();
    const nextNumber = String(existing.length + 1).padStart(4, '0');
    const requestCode = `REQ-${new Date().getFullYear()}-${nextNumber}`;

    const now = new Date().toISOString();

    const newRequest = {
      companyId: Number(data.companyId),
      requestCode,
      requestType: data.requestType || 'paquete completo',
      origin: data.origin,
      destination: data.destination,
      peopleCount: Number(data.peopleCount),
      travelDate: data.travelDate,
      returnDate: data.returnDate || '',
      travelClass: data.travelClass, // "turista" | "ejecutiva"
      // Identidad del viajero principal (para emitir tiquetes).
      fullName: data.fullName || '',
      documentType: data.documentType || '',
      documentNumber: data.documentNumber || '',
      nationality: data.nationality || '',
      hasInsurance: Boolean(data.hasInsurance),
      hasActivities: Boolean(data.hasActivities),
      hasTransfers: Boolean(data.hasTransfers),
      observations: data.observations || '',
      // Estado inicial del flujo de trabajo.
      status: 'solicitud enviada',
      // Montos en cero: aun no se ha cotizado.
      estimatedCost: 0,
      bookingReferenceCost: 0,
      estimatedSavings: 0,
      estimatedReturn: 0,
      csTravelMargin: 0,
      quoteDetails: '',
      adminNotes: '',
      clientNotes: '',
      priority: data.priority || 'normal',
      createdAt: now,
      updatedAt: now,
    };

    return apiService.post(RESOURCE, newRequest);
  },

  /** Actualiza parcialmente una solicitud (editar datos o montos). */
  update(id, data) {
    return apiService.patch(RESOURCE, id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  },

  /** Cambia unicamente el estado de la solicitud. */
  changeStatus(id, status) {
    return this.update(id, { status });
  },

  /** Elimina una solicitud. La restriccion de rol se aplica en la vista/guard. */
  remove(id) {
    return apiService.remove(RESOURCE, id);
  },

  /**
   * getActive()
   * A partir de un array de solicitudes, devuelve solo las activas.
   * @param {Array} requests
   */
  getActive(requests) {
    return requests.filter((r) => ACTIVE_STATUSES.includes(r.status));
  },

  /** Indica si un estado concreto se considera activo. */
  isActive(status) {
    return ACTIVE_STATUSES.includes(status);
  },
};
