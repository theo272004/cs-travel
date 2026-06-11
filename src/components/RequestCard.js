/**
 * RequestCard.js
 * =============================================================================
 * PROPOSITO:
 *   Tarjeta que resume una solicitud de viaje. Se usa para mostrar solicitudes
 *   en formato "card" (ideal para movil y para listados destacados).
 *
 * RESPONSABILIDAD:
 *   Devolver el HTML de una tarjeta con los datos clave de una solicitud:
 *   ruta (origen -> destino), fecha, personas, estado y costo estimado.
 *
 * INTERACCION:
 *   Toda la tarjeta es un enlace al detalle de la solicitud. La ruta destino
 *   depende del rol (admin o empresa), por eso se recibe "detailBase".
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { StatusBadge } from './StatusBadge.js';

/**
 * RequestCard()
 * @param {object} request    - Solicitud a mostrar.
 * @param {string} detailBase - Prefijo de ruta al detalle.
 *                              Ej admin: "#/admin/requests" -> "#/admin/requests/3"
 *                              Ej empresa: "#/company/requests"
 * @returns {string} HTML de la tarjeta.
 */
export function RequestCard(request, detailBase) {
  return `
    <a href="${detailBase}/${request.id}" class="request-card">
      <div class="request-card__top">
        <span class="request-card__code">${escapeHtml(request.requestCode)}</span>
        ${StatusBadge(request.status)}
      </div>

      <h3 class="request-card__route">
        ${escapeHtml(request.origin)} <span class="arrow">→</span> ${escapeHtml(request.destination)}
      </h3>

      <div class="request-card__meta">
        <span>📅 ${formatDate(request.travelDate)}</span>
        <span>👥 ${escapeHtml(request.peopleCount)}</span>
        <span>🎟 ${escapeHtml(request.travelClass === 'ejecutiva' ? 'Ejecutiva' : 'Turista')}</span>
      </div>

      <div class="request-card__cost">
        <span class="request-card__cost-label">Costo estimado</span>
        <span class="request-card__cost-value">${formatCurrency(request.estimatedCost)}</span>
      </div>
    </a>
  `;
}
