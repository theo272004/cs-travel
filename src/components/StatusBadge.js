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
  // Operaciones (solicitudes y casos) - modelo de 6 estados.
  // Un color distinto por estado (coherente con el medidor "Casos por estado").
  'solicitud enviada': 'badge--blue',
  'cotizacion enviada': 'badge--amber',
  aprobada: 'badge--green',
  'en gestion': 'badge--violet',
  finalizada: 'badge--teal',
  cancelada: 'badge--red',
  // Estados antiguos (compatibilidad con datos previos en localStorage).
  'caso enviado': 'badge--blue',
  'en revision': 'badge--blue',
  'en cotizacion': 'badge--amber',
  nueva: 'badge--blue',
  // Empresas / usuarios
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
