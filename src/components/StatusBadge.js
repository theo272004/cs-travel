/**
 * StatusBadge.js
 * =============================================================================
 * PROPOSITO:
 *   Componente para mostrar el estado de una solicitud o empresa como una
 *   "etiqueta" (badge) con color segun el estado.
 *
 * RESPONSABILIDAD:
 *   Mapear cada estado a una clase CSS de color y devolver el HTML del badge.
 *   Centraliza los colores de estado para mantener coherencia visual.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

// Mapa estado -> variante de color (clase CSS).
const STATUS_VARIANT = {
  // Solicitudes
  'solicitud enviada': 'badge--blue',
  'caso enviado': 'badge--blue',
  'en revision': 'badge--amber',
  nueva: 'badge--blue',
  'en cotizacion': 'badge--amber',
  'cotizacion enviada': 'badge--amber',
  aprobada: 'badge--green',
  'en gestion': 'badge--blue',
  finalizada: 'badge--green',
  cancelada: 'badge--red',
  // Empresas
  active: 'badge--green',
  inactive: 'badge--gray',
  pending: 'badge--amber',
};

// Texto legible para estados de empresa (los de solicitud ya son legibles).
const STATUS_LABEL = {
  active: 'Activa',
  inactive: 'Inactiva',
  pending: 'Pendiente',
};

/**
 * StatusBadge()
 * @param {string} status - Estado a mostrar.
 * @returns {string} HTML del badge.
 */
export function StatusBadge(status) {
  const variant = STATUS_VARIANT[status] || 'badge--gray';
  const label = STATUS_LABEL[status] || status;
  return `<span class="badge ${variant}">${escapeHtml(label)}</span>`;
}
