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
  // Eventos · estado de una cuenta (regla 10 de eventLedger.js).
  al_dia: 'badge--green',
  por_vencer: 'badge--amber',
  atrasado: 'badge--red',
  pagado: 'badge--teal',
  cubierto: 'badge--violet',
  saldo_a_favor: 'badge--blue',
  sin_cargos: 'badge--gray',
  // Eventos · estado de la invitacion (eventAccounts.rsvp).
  sin_enviar: 'badge--gray',
  enviada: 'badge--blue',
  vista: 'badge--violet',
  confirmada: 'badge--green',
  no_asiste: 'badge--gray',
  // Eventos · estado del evento (events.status).
  borrador: 'badge--gray',
  abierto: 'badge--green',
  cerrado: 'badge--blue',
  en_viaje: 'badge--violet',
  finalizado: 'badge--teal',
  cancelado: 'badge--red',
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
  al_dia: 'Al día',
  por_vencer: 'Por vencer',
  atrasado: 'Atrasado',
  pagado: 'Pagado',
  cubierto: 'Cubierto',
  saldo_a_favor: 'Saldo a favor',
  sin_cargos: 'Sin cargos',
  sin_enviar: 'Sin enviar',
  enviada: 'Enviada',
  vista: 'Vista',
  confirmada: 'Confirmada',
  no_asiste: 'No asiste',
  borrador: 'Borrador',
  abierto: 'Abierto',
  cerrado: 'Cerrado',
  en_viaje: 'En viaje',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
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
 * @param {string} [label] - Texto propio (ej. «Atrasado · 15 días»); por defecto statusLabel().
 * @returns {string} HTML del badge.
 */
export function StatusBadge(status, label = '') {
  // Sin estado definido -> NO renderizar nada (evita un pill/bolita vacío).
  const clean = String(status || '').trim();
  if (!clean) return '';
  const variant = STATUS_VARIANT[clean] || 'badge--gray';
  return `<span class="badge ${escapeHtml(variant)}">${escapeHtml(label || statusLabel(clean))}</span>`;
}
