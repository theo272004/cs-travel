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

// Texto legible (capitalizado y con tildes) por estado.
const STATUS_LABEL = {
  'solicitud enviada': 'Solicitud enviada',
  'cotizacion enviada': 'Cotización enviada',
  aprobada: 'Aprobada',
  'en gestion': 'En gestión',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
  'caso enviado': 'Caso enviado',
  'en revision': 'En revisión',
  'en cotizacion': 'En cotización',
  nueva: 'Nueva',
  active: 'Activa',
  inactive: 'Inactiva',
  pending: 'Pendiente',
};

/** Etiqueta legible de un estado: capitalizada, con tildes. Reusable fuera del badge. */
export function statusLabel(status) {
  const clean = String(status || '').trim();
  if (!clean) return '';
  return STATUS_LABEL[clean] || (clean.charAt(0).toUpperCase() + clean.slice(1));
}

/**
 * StatusBadge()
 * @param {string} status - Estado a mostrar.
 * @returns {string} HTML del badge.
 */
export function StatusBadge(status) {
  // Sin estado definido -> NO renderizar nada (evita un pill/bolita vacío).
  const clean = String(status || '').trim();
  if (!clean) return '';
  const variant = STATUS_VARIANT[clean] || 'badge--gray';
  return `<span class="badge ${variant}">${escapeHtml(statusLabel(clean))}</span>`;
}
