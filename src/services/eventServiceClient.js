/**
 * eventServiceClient.js
 * =============================================================================
 * Lo que importan las vistas de Eventos.
 *   - Demo (vite, GitHub Pages): el servicio local con datos de ejemplo.
 *   - Portal desplegado: cada operación va a /api/eventos. El servidor toma el
 *     usuario de la cookie, nunca el `actor` ni la fecha que mande el navegador,
 *     y aplica las mismas reglas (corre el mismo eventService.js).
 *
 * EVENTS_LIVE apaga Eventos en el portal desplegado mientras se termina de
 * encender: oculta el menú y no consulta al servidor. Para encenderlo basta con
 * cambiarlo a true y re-empaquetar.
 * =============================================================================
 */

import { isDeployedBundle } from '../utils/env.js';
import { eventService as local, EVENT_RESOURCES, organizerPermission, viewFor } from './eventService.js';

export { EVENT_RESOURCES, organizerPermission, viewFor };

export const EVENTS_LIVE = true;

async function call(action, payload = {}) {
  const res = await fetch('/api/eventos', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const error = new Error(data.error || `No pudimos completar la acción (error ${res.status}).`);
    if (data.code) error.code = data.code;
    throw error;
  }
  return data.result;
}

/** Las vistas buscan cada cuenta en summary.byId: un Map no viaja en JSON. */
function withById(summary) {
  if (!summary) return summary;
  return { ...summary, byId: new Map((summary.accounts || []).map((c) => [String(c.accountId), c])) };
}

const codeOf = (actor) => (actor && actor.role === 'invitado' ? actor.accessCode : undefined);

const remote = {
  // Sin servidor de por medio: no leen datos de nadie.
  messageFor: local.messageFor,
  recallCurrentEvent: local.recallCurrentEvent,
  rememberCurrentEvent: local.rememberCurrentEvent,

  /* --- Lecturas --- */
  async getPortfolio() {
    if (!EVENTS_LIVE) return [];
    const rows = await call('portfolio');
    return rows.map((r) => ({ ...r, summary: withById(r.summary) }));
  },
  getForOrganizer() {
    return EVENTS_LIVE ? call('mine') : Promise.resolve([]);
  },
  async getEventView(eventId, { actor } = {}) {
    // El admin puede ver el evento como lo ve su organizador.
    const previewAs = actor && actor.role === 'event' ? actor.id : undefined;
    const view = await call('view', { eventId, previewAs });
    return { ...view, summary: withById(view.summary) };
  },
  getGuestView(code) {
    return call('guestView', { code });
  },
  quoteCancellation(guestId) {
    return call('quoteCancellation', { guestId });
  },
  previewContribution(eventId, input) {
    return call('previewContribution', { eventId, input });
  },

  /* --- Evento --- */
  createEvent(data) {
    return call('createEvent', { data });
  },
  publishEvent(eventId) {
    return call('publishEvent', { eventId });
  },
  setEventStatus(eventId, status) {
    return call('setEventStatus', { eventId, status });
  },
  updateEvent(eventId, patch) {
    return call('updateEvent', { eventId, patch });
  },
  setOrganizers(eventId, organizers) {
    return call('setOrganizers', { eventId, organizers });
  },
  updatePackage(packageId, patch) {
    return call('updatePackage', { packageId, patch });
  },

  /* --- Invitaciones --- */
  createInvitations(eventId, rows) {
    return call('createInvitations', { eventId, rows });
  },
  markInvitationSent(accountId, options) {
    return call('markInvitationSent', { accountId, options });
  },
  markInvitationViewed(code) {
    return call('markInvitationViewed', { code });
  },
  confirmAttendance(accountId, persons, actor) {
    return call('confirmAttendance', { accountId, persons, code: codeOf(actor), consent: true });
  },
  declineInvitation(accountId, actor) {
    return call('declineInvitation', { accountId, code: codeOf(actor) });
  },
  markReminderSent(accountId, options) {
    return call('markReminderSent', { accountId, options });
  },
  updateOrganizerNotes(accountId, notes) {
    return call('updateOrganizerNotes', { accountId, notes });
  },
  updateAdminNotes(accountId, notes) {
    return call('updateAdminNotes', { accountId, notes });
  },
  regenerateAccessCode(accountId) {
    return call('regenerateAccessCode', { accountId });
  },
  setDocsOk(guestId, value) {
    return call('setDocsOk', { guestId, value });
  },

  /* --- Dinero --- */
  contribute(eventId, input) {
    return call('contribute', { eventId, input });
  },
  registerPayment(accountId, input) {
    return call('registerPayment', { accountId, input });
  },
  cancelGuest(guestId, input) {
    return call('cancelGuest', { guestId, input });
  },
  refund(accountId, input) {
    return call('refund', { accountId, input });
  },
  correctLine(lineId, input) {
    return call('correctLine', { lineId, input });
  },
  changePackage(guestId, packageId) {
    return call('changePackage', { guestId, packageId });
  },
  /** Crea el cobro del invitado y devuelve su código para pagar en /pago. */
  startGuestPayment(code, amount) {
    return call('guestPay', { code, amount });
  },
};

export const eventService = isDeployedBundle() ? remote : local;

/** ¿Eventos está encendido aquí? En el demo siempre. */
export const eventsEnabled = () => !isDeployedBundle() || EVENTS_LIVE;
