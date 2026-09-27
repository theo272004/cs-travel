/**
 * EventKit.js
 * =============================================================================
 * PROPOSITO:
 *   Piezas compartidas por las pantallas del panel de EVENTOS (organizador,
 *   administrador e invitado): iconos, formatos, encabezado del evento, ficha
 *   de una cuenta (Drawer), recordatorios por WhatsApp, cifras que cuentan,
 *   entrada escalonada y el buscador / campana propios del organizador.
 *
 * REGLAS QUE CUIDA (especificacion de Eventos):
 *   - Regla 19: la vista NUNCA pide montos que el rol no ve. Todo sale de
 *     eventService.getEventView(), que ya viene filtrado por rol; aqui solo se
 *     pinta lo que llega (si una cuenta trae amountsHidden, no hay cifras).
 *   - Regla 20: un recordatorio por cuenta cada 3 dias; antes de ese plazo se
 *     pide confirmacion (confirmDialog) y se reintenta con force.
 *   - Los mensajes de WhatsApp nunca llevan montos (los arma eventService).
 *   - Sin emojis: iconos SVG de linea (docs/GUIA-DE-ESTILO.md, seccion 3).
 *
 * ESTILOS: src/styles/events.css (se importa aqui para que cualquier vista de
 * eventos lo tenga).
 * =============================================================================
 */

import '../styles/events.css';
import { eventService } from '../services/eventService.js';
import { authService } from '../services/authService.js';
import * as L from '../utils/eventLedger.js';
import {
  getTemplate, vocabFor, EVENT_STAGES, RSVP_LABELS, AUDIENCE_LABELS, fillMessage, guestLink,
} from '../utils/eventTemplates.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { downloadCsv, csvDateStamp } from '../utils/csv.js';
import { showToast } from '../utils/toast.js';
import { StatusBadge } from './StatusBadge.js';
import { confirmDialog } from './ConfirmDialog.js';
import { openDrawer, closeDrawer } from './Drawer.js';
import { wireStyledSelects } from './StyledSelect.js';

/* ---------------------------------------------------------------------------
 * Iconos de linea (24x24, trazo 1.9, currentColor)
 * ------------------------------------------------------------------------ */

const P = {
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6"/><path d="M18 14.3c1.6.7 2.7 2.3 3 4.7"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6"/>',
  userCheck: '<circle cx="9" cy="8" r="3.4"/><path d="M3 20c.7-3.4 3.2-5.6 6-5.6s5.3 2.2 6 5.6"/><path d="m16 11 2 2 4-4"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M19 10c0 5.5-7 11-7 11s-7-5.5-7-11a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.6"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l4.6 3-2 2-2.5-.5a1 1 0 0 0-.9 1.6l2.3 2.3 2.3 2.3a1 1 0 0 0 1.6-.9l-.5-2.5 2-2 3 4.6a1 1 0 0 0 1.7-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  hourglass: '<path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 10 5 10 9s-10 4-10 9"/><path d="M17 3c0 5-10 5-10 9s10 4 10 9"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.3"/>',
  bell: '<path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3h-4a2 2 0 0 0 0 4h4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  trend: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>',
  message: '<path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/>',
  send: '<path d="m21 3-7.5 18-3.2-7.3L3 10.5z"/><path d="M21 3 10.3 13.7"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  phone: '<path d="M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 4.2 2 2 0 0 1 3.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  undo: '<path d="M3 7v6h6"/><path d="M3.5 13A9 9 0 1 0 6 6.3L3 9"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.6 3.2 7.9 7.5 9 4.3-1.1 7.5-4.4 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 16.5 9 4.5 9-4.5"/><path d="m3 12 9 4.5 9-4.5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
  school: '<path d="m12 4 10 5-10 5L2 9z"/><path d="M6 11v5c2 2 10 2 12 0v-5"/><path d="M22 9v6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
};

/** SVG de un icono de linea. `cls` se suma a la clase base ev-ico. */
export function evIcon(name, cls = '') {
  const path = P[name];
  if (!path) return '';
  return `<svg class="ev-ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

/** Icono de cada plantilla. */
export const TEMPLATE_ICON = { boda: 'heart', promocion: 'school', empresa: 'briefcase', otro: 'calendar' };

/* ---------------------------------------------------------------------------
 * Formatos
 * ------------------------------------------------------------------------ */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** $ 1.234.000 (pesos enteros). */
export const money = (n) => formatCurrency(Math.round(Number(n) || 0));

/** Monto corto para ejes y etiquetas: $ 18,9 M · $ 950 mil. */
export function moneyShort(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$ ${(v / 1e6).toFixed(abs >= 1e8 ? 0 : 1).replace('.', ',').replace(',0', '')} M`;
  if (abs >= 1e3) return `$ ${Math.round(v / 1e3)} mil`;
  return money(v);
}

/**
 * Meta frente a lo real, mes a mes, en barras HTML (se lee bien a cualquier
 * ancho; en el celular reemplaza a la gráfica de líneas).
 */
export function monthBarsHtml(months) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.metaAcum, m.pagadoAcum)));
  return `
    <ul class="ev-mbars">
      ${months.map((m) => `
        <li class="ev-mbars__row">
          <span class="ev-mbars__month">${escapeHtml(monthLabel(m.month))}</span>
          <span class="ev-mbars__bars">
            <i class="is-goal" style="--w:${((m.metaAcum / max) * 100).toFixed(1)}%"></i>
            <i class="is-real" style="--w:${((m.pagadoAcum / max) * 100).toFixed(1)}%"></i>
          </span>
          <span class="ev-mbars__vals"><b>${escapeHtml(moneyShort(m.pagadoAcum))}</b><small>meta ${escapeHtml(moneyShort(m.metaAcum))}</small></span>
        </li>`).join('')}
    </ul>`;
}

/** Monto con signo para movimientos: «+ $ 300.000» / «− $ 300.000». */
export function signedMoney(n) {
  const v = Number(n) || 0;
  if (v === 0) return money(0);
  return `${v > 0 ? '+' : '−'} ${money(Math.abs(v))}`;
}

/** '2026-10-15' -> '15 oct' (con año si no es el año en curso). */
export function fmtDay(date, { year = 'auto' } = {}) {
  if (!date) return '';
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const currentYear = Number(L.todayCO().slice(0, 4));
  const withYear = year === true || (year === 'auto' && y !== currentYear);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** '2026-10-15' -> { day: '15', month: 'oct' } (para calendarios pequeños). */
export function dayParts(date) {
  const [, m, d] = String(date || '').slice(0, 10).split('-').map(Number);
  return { day: String(d || ''), month: MONTHS[(m || 1) - 1] };
}

/** '2026-10-15' -> '15 de octubre'. */
export function fmtDayLong(date) {
  if (!date) return '';
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  const currentYear = Number(L.todayCO().slice(0, 4));
  return `${d} de ${MONTHS_LONG[m - 1]}${y !== currentYear ? ` de ${y}` : ''}`;
}

/** Rango corto del viaje: '2 – 6 dic 2026', '30 nov – 3 dic 2026'. */
export function fmtRange(start, end) {
  if (!start) return '';
  const [y1, m1, d1] = start.split('-').map(Number);
  if (!end || end === start) return `${d1} ${MONTHS[m1 - 1]} ${y1}`;
  const [y2, m2, d2] = end.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
}

/** Mes de una serie: '2026-09' -> 'Sep'. */
export function monthLabel(ym) {
  const m = Number(String(ym).slice(5, 7));
  const label = MONTHS[m - 1] || '';
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function monthLabelLong(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const label = MONTHS_LONG[m - 1] || '';
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${y}`;
}

/** Hace cuánto: 'hoy', 'ayer', 'hace 3 días' o la fecha. */
export function relTime(iso) {
  if (!iso) return '';
  const day = L.isoToDateCO(iso) || String(iso).slice(0, 10);
  const diff = L.daysBetween(day, L.todayCO());
  if (diff <= 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 7) return `hace ${diff} días`;
  return fmtDay(day);
}

/** «Faltan 67 días» / «Mañana es el viaje» / «En viaje» / «Ya regresaron». */
export function countdownText(event, today = L.todayCO()) {
  if (!event.startDate) return '';
  const days = L.daysBetween(today, event.startDate);
  if (days > 1) return `Faltan ${days} días`;
  if (days === 1) return 'Mañana es el viaje';
  if (days === 0) return 'Hoy es el viaje';
  if (event.endDate && today <= event.endDate) return 'En viaje';
  return 'Viaje terminado';
}

/** Plural sencillo: plural(3, 'persona') -> '3 personas'. */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Porcentaje entero para mostrar: 0.718 -> '72 %'. */
export const pct = (ratio) => `${Math.round((Number(ratio) || 0) * 100)} %`;

/** Saludo con tildes según la hora. */
export function saludo() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Primer nombre de una persona o cuenta. */
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/** Origen para los enlaces personales (conserva ?demo del prototipo). */
export function currentOrigin() {
  try {
    return `${window.location.origin}${window.location.pathname}${window.location.search}`;
  } catch {
    return '';
  }
}

/** Enlace personal completo de una cuenta. */
export const personalLink = (account) => guestLink(account.accessCode, currentOrigin());

/* ---------------------------------------------------------------------------
 * Estados y etiquetas
 * ------------------------------------------------------------------------ */

/** Insignia del estado de pago de una cuenta calculada («Atrasado · 15 días»). */
export function accountBadge(c) {
  if (!c) return '';
  return StatusBadge(c.status, c.statusLabel);
}

/** Insignia del estado de la invitación. */
export function rsvpBadge(rsvp) {
  return StatusBadge(rsvp, RSVP_LABELS[rsvp] || rsvp);
}

/** ¿La invitación todavía no responde? */
export const isPendingRsvp = (rsvp) => ['sin_enviar', 'enviada', 'vista'].includes(rsvp);

const ASIST = {
  si: { label: 'Va', cls: 'is-ok', icon: 'check' },
  no: { label: 'No va', cls: 'is-off', icon: 'x' },
  pendiente: { label: 'Sin responder', cls: 'is-wait', icon: 'clock' },
  cancelado: { label: 'Canceló', cls: 'is-bad', icon: 'ban' },
};
const PAGO_SEM = {
  al_dia: 'is-ok', pagado: 'is-ok', cubierto: 'is-ok', saldo_a_favor: 'is-ok',
  por_vencer: 'is-warn', atrasado: 'is-bad', sin_cargos: 'is-off',
};
const DOCS = {
  completo: { label: 'Documentos completos', cls: 'is-ok' },
  faltan: { label: 'Faltan documentos', cls: 'is-bad' },
  no_aplica: { label: 'Sin documentos', cls: 'is-off' },
};

/** Semáforo escrito de una persona o una cuenta: Asistencia · Pago · Documentos. */
export function semaphoreHtml({ asistencia, pago, pagoLabel, documentos }, { compact = false, docs = true } = {}) {
  const a = ASIST[asistencia] || ASIST.pendiente;
  const d = DOCS[documentos] || DOCS.no_aplica;
  const pLabel = pagoLabel || (L.ACCOUNT_STATUS[pago] || {}).label || 'Sin cargos';
  // Sin control de documentos (p. ej. una boda) el semáforo queda en dos partes.
  const withDocs = docs && documentos !== undefined;
  return `
    <span class="ev-sem ${compact ? 'ev-sem--compact' : ''} ${withDocs ? '' : 'ev-sem--two'}">
      <span class="ev-sem__item ${a.cls}"><i aria-hidden="true"></i><span class="ev-sem__k">Asistencia</span><b>${escapeHtml(a.label)}</b></span>
      <span class="ev-sem__item ${PAGO_SEM[pago] || 'is-off'}"><i aria-hidden="true"></i><span class="ev-sem__k">Pago</span><b>${escapeHtml(pLabel)}</b></span>
      ${withDocs ? `<span class="ev-sem__item ${d.cls}"><i aria-hidden="true"></i><span class="ev-sem__k">Documentos</span><b>${escapeHtml(d.label)}</b></span>` : ''}
    </span>`;
}

/** ¿El evento controla documentos? (colegio y empresa, o si alguien los tiene marcados). */
export function eventUsesDocs(data) {
  return getTemplate(data.event.type).requiresDocs || data.guests.some((g) => g.docsOk === true || g.docsOk === false);
}

/** Semáforo de una CUENTA (resume a sus personas). */
export function accountSemaphore(account, computed, guests) {
  const own = guests.filter((g) => L.sameId(g.accountId, account.id));
  const active = own.filter((g) => g.status !== 'cancelado');
  let asistencia = 'pendiente';
  if (account.rsvp === 'no_asiste') asistencia = 'no';
  else if (account.rsvp === 'confirmada') asistencia = active.some((g) => g.attendance === 'si') ? 'si' : (own.length && active.length === 0 ? 'cancelado' : 'no');
  const withDocs = active.filter((g) => g.attendance === 'si' && g.docsOk !== null && g.docsOk !== undefined);
  let documentos = 'no_aplica';
  if (withDocs.length) documentos = withDocs.every((g) => g.docsOk === true) ? 'completo' : 'faltan';
  return {
    asistencia,
    pago: computed ? computed.status : 'sin_cargos',
    pagoLabel: computed ? computed.statusLabel : 'Sin cargos',
    documentos,
  };
}

/**
 * Segunda línea de una cuenta: el grupo (si no va ya en el nombre, como en
 * «Juan Gómez · 11A») y, si no, el contacto.
 */
export function subLine(account) {
  if (!account) return '';
  const name = String(account.displayName || '');
  const group = account.groupTag && !name.includes(account.groupTag) ? account.groupTag : '';
  const contact = account.contactName && !name.includes(account.contactName) ? account.contactName : '';
  return [group, contact].filter(Boolean).join(' · ');
}

/** Texto de la próxima meta de una cuenta ('15 oct' o 'Vencida 31 ago'). */
export function nextGoalText(c) {
  if (!c) return '';
  if (c.status === 'atrasado' && c.oldestUnmet) return `Vencida el ${fmtDay(c.oldestUnmet.date)}`;
  if (c.next) return `${fmtDay(c.next.date)} · ${c.next.label}`;
  if (['pagado', 'cubierto', 'saldo_a_favor'].includes(c.status)) return 'Sin metas pendientes';
  return '';
}

/* ---------------------------------------------------------------------------
 * Carga del evento del organizador
 * ------------------------------------------------------------------------ */

/**
 * Evento activo del organizador y su vista filtrada por rol.
 * ?e=<id> manda; si no, el último usado (localStorage) o el primero.
 * @returns {{ user, events, data }} data = eventService.getEventView() o null.
 */
export async function loadOrganizerContext(ctx = {}) {
  const user = ctx.user || authService.getSession();
  const events = (await eventService.getForOrganizer(user.id))
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
  if (!events.length) return { user, events, data: null };
  const requested = (ctx.query && ctx.query.e) || eventService.recallCurrentEvent();
  const event = events.find((e) => L.sameId(e.id, requested)) || events[0];
  eventService.rememberCurrentEvent(event.id);
  const data = await eventService.getEventView(event.id, { actor: user });
  return { user, events, data };
}

/** Pantalla para un organizador sin eventos asignados. */
export function noEventsHtml(user) {
  return `
    <div class="page-header ev-head">
      <div>
        <h1 class="page-title"><span class="page-title__greet">${saludo()},</span> ${escapeHtml(firstName(user?.name))}</h1>
        <p class="page-subtitle">Eventos y grupos</p>
      </div>
    </div>
    <section class="panel ev-empty-panel">
      <span class="ev-empty-panel__icon">${evIcon('calendar')}</span>
      <h2 class="panel__title">Todavía no tienes un evento asignado</h2>
      <p class="muted">Cuando CS Travel Group cree tu evento y te agregue como organizador, lo verás aquí con sus invitados, pagos y metas.</p>
    </section>`;
}

/** Selector de evento (solo si la persona organiza más de uno). */
export function eventSwitcher(events, current, basePath) {
  if (!events || events.length < 2) return '';
  return `
    <label class="ev-switch">
      <span class="ev-switch__label">Evento</span>
      <select class="form__input ev-switch__select" data-ev-switch="${escapeHtml(basePath)}" aria-label="Cambiar de evento">
        ${events.map((e) => `<option value="${e.id}" ${L.sameId(e.id, current.id) ? 'selected' : ''}>${escapeHtml(e.title)}</option>`).join('')}
      </select>
    </label>`;
}

/** Enlaza el selector de evento: cambia ?e= y vuelve a pintar la vista. */
export function bindEventSwitcher(root = document) {
  root.querySelectorAll('[data-ev-switch]').forEach((sel) => {
    sel.addEventListener('change', () => {
      eventService.rememberCurrentEvent(sel.value);
      window.location.hash = `${sel.dataset.evSwitch}?e=${encodeURIComponent(sel.value)}`;
    });
  });
}

/**
 * Enlaces entre pantallas del evento. El organizador navega por #/event/* y el
 * administrador por las pestañas de #/admin/events/:id; las piezas compartidas
 * reciben uno de estos constructores: link('people', { f: 'atrasados' }).
 */
export function organizerLink(eventId) {
  return (page, params = {}) => `#/event/${page}?${new URLSearchParams({ e: eventId, ...params })}`;
}
export function adminLink(eventId) {
  const TAB = { people: 'personas', money: 'dinero', dashboard: 'resumen', invite: 'personas' };
  return (page, params = {}) => `#/admin/events/${eventId}?${new URLSearchParams({ tab: TAB[page] || page, ...params })}`;
}

/** Chips del evento: plantilla, fechas, destino, estado y cuenta regresiva. */
export function eventChips(event, { withCountdown = true } = {}) {
  const tpl = getTemplate(event.type);
  const countdown = countdownText(event);
  return `
    <span class="chip ev-chip">${evIcon(TEMPLATE_ICON[event.type] || 'calendar')}${escapeHtml(tpl.label)}</span>
    <span class="chip ev-chip">${evIcon('calendar')}${escapeHtml(fmtRange(event.startDate, event.endDate))}</span>
    <span class="chip ev-chip">${evIcon('pin')}${escapeHtml(event.destination || '')}</span>
    ${StatusBadge(event.status)}
    ${withCountdown && countdown ? `<span class="chip ev-chip ev-chip--count">${evIcon('hourglass')}${escapeHtml(countdown)}</span>` : ''}`;
}

/* ---------------------------------------------------------------------------
 * Piezas visuales
 * ------------------------------------------------------------------------ */

/**
 * Cifra que cuenta hasta su valor (400 ms) la primera vez que se ve.
 * El HTML ya trae el valor final (sin JS o con «reducir movimiento» se ve igual).
 */
export function countNode(value, format = 'money', cls = '') {
  const text = format === 'money' ? money(value) : format === 'pct' ? pct(value) : String(Math.round(value));
  return `<span class="ev-count ${cls}" data-count="${Number(value) || 0}" data-format="${format}">${escapeHtml(text)}</span>`;
}

const counted = new Set();

/** Anima las cifras [data-count] dentro de `root` (una vez por clave de página). */
export function runCountUp(root = document, key = window.location.hash.split('?')[0]) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || counted.has(key)) return;
  counted.add(key);
  const nodes = [...root.querySelectorAll('[data-count]')];
  const start = performance.now();
  const duration = 420;
  const fmt = (el, v) => {
    const f = el.dataset.format;
    el.textContent = f === 'money' ? money(v) : f === 'pct' ? pct(v) : String(Math.round(v));
  };
  const targets = nodes.map((el) => ({ el, to: Number(el.dataset.count) || 0 }));
  if (!targets.length) return;
  const ease = (t) => 1 - (1 - t) ** 3;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    targets.forEach(({ el, to }) => fmt(el, el.dataset.format === 'pct' ? to * ease(t) : Math.round(to * ease(t))));
    if (t < 1) requestAnimationFrame(step);
    else targets.forEach(({ el, to }) => fmt(el, to));
  };
  requestAnimationFrame(step);
}

/** Barra de avance con marca opcional (p. ej. la meta a hoy). */
export function progressBar({ value = 0, max = 0, marker = null, markerLabel = '', tone = 'blue', label = '' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const mk = marker != null && max > 0 ? Math.max(0, Math.min(1, marker / max)) : null;
  return `
    <div class="ev-bar ev-bar--${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}" ${label ? `aria-label="${escapeHtml(label)}"` : ''}>
      <span class="ev-bar__fill" style="--w:${(ratio * 100).toFixed(2)}%"></span>
      ${mk != null ? `<span class="ev-bar__mark" style="--x:${(mk * 100).toFixed(2)}%" ${markerLabel ? `data-tip="${escapeHtml(markerLabel)}"` : ''}></span>` : ''}
    </div>`;
}

/** Nombre corto de cada etapa para el celular. */
const STAGE_SHORT = { invitaciones: 'Invitar', confirmaciones: 'Confirmar', pagos: 'Pagos', viaje: 'Viaje', cierre: 'Cierre' };

/** Stepper de etapas: Invitaciones → Confirmaciones → Pagos → Viaje → Cierre. */
export function stagesHtml(stage) {
  const index = Math.max(0, EVENT_STAGES.findIndex((s) => s.key === stage));
  return `
    <ol class="ev-stages" aria-label="Etapas del evento">
      ${EVENT_STAGES.map((s, i) => `
        <li class="ev-stages__step ${i < index ? 'is-done' : ''} ${i === index ? 'is-current' : ''}" ${i === index ? 'aria-current="step"' : ''}>
          <span class="ev-stages__dot">${i < index ? evIcon('check') : `<b>${i + 1}</b>`}</span>
          <span class="ev-stages__label" data-short="${escapeHtml(STAGE_SHORT[s.key] || s.label)}"><span>${escapeHtml(s.label)}</span></span>
        </li>`).join('')}
    </ol>`;
}

const ACTIVITY = {
  invitacion_creada: { icon: 'plus', verb: 'Invitaciones' },
  invitacion_enviada: { icon: 'send', verb: 'Invitación' },
  recordatorio: { icon: 'message', verb: 'Recordatorio' },
  confirmo: { icon: 'userCheck', verb: 'Confirmación' },
  no_asiste: { icon: 'xCircle', verb: 'No asiste' },
  marco_confirmado: { icon: 'userCheck', verb: 'Confirmación' },
  aporte: { icon: 'gift', verb: 'Aporte' },
  pago: { icon: 'card', verb: 'Pago' },
  cancelacion: { icon: 'ban', verb: 'Cancelación' },
  reembolso: { icon: 'undo', verb: 'Reembolso' },
  correccion: { icon: 'edit', verb: 'Corrección' },
  config: { icon: 'layers', verb: 'Ajuste' },
};

/** Lista de actividad reciente (la bitácora ya viene filtrada por rol). */
export function activityHtml(log, { limit = 7 } = {}) {
  const items = (log || []).slice(0, limit);
  if (!items.length) return '<p class="ev-empty">Todavía no hay movimientos en este evento.</p>';
  return `
    <ul class="ev-activity ev-rows">
      ${items.map((e) => {
        const meta = ACTIVITY[e.action] || { icon: 'info', verb: '' };
        const amount = e.amount != null && e.amount !== 0 ? `<b class="ev-activity__amount">${money(Math.abs(e.amount))}</b>` : '';
        return `
          <li class="ev-activity__item ev-activity__item--${escapeHtml(e.action)}">
            <span class="ev-activity__icon">${evIcon(meta.icon)}</span>
            <span class="ev-activity__text">
              <strong>${escapeHtml(e.detail || meta.verb)}</strong>
              <small>${escapeHtml(relTime(e.at))}${e.channel === 'whatsapp' ? ' · WhatsApp' : e.channel === 'copiado' ? ' · Enlace copiado' : ''}</small>
            </span>
            ${amount}
          </li>`;
      }).join('')}
    </ul>`;
}

/** Franja del asesor de CS Travel Group del evento (sin «código aliado»). */
export function advisorStrip(event, { who = '' } = {}) {
  const a = event.advisor || {};
  const phone = String(a.phone || '').replace(/\D/g, '');
  const text = encodeURIComponent(`Hola, ${firstName(a.name) || 'CS Travel Group'}. ${who ? `Soy ${who}, ` : ''}te escribo por el evento «${event.title}».`);
  return `
    <section class="ev-advisor" aria-label="Tu asesor de CS Travel Group">
      <div class="ev-advisor__who">
        <span class="ev-advisor__avatar">${escapeHtml(initials(a.name || 'CS Travel Group'))}</span>
        <div>
          <span class="ev-advisor__label">Tu asesor de CS Travel Group</span>
          <strong>${escapeHtml(a.name || 'Equipo CS Travel Group')}</strong>
          <small>Acompaña este evento de principio a fin</small>
        </div>
      </div>
      <div class="ev-advisor__contacts">
        ${a.email ? `<a href="mailto:${escapeHtml(a.email)}">${evIcon('mail')}${escapeHtml(a.email)}</a>` : ''}
        ${a.phone ? `<a href="tel:+${phone}">${evIcon('phone')}${escapeHtml(a.phone)}</a>` : ''}
      </div>
      ${phone ? `<a class="btn ev-advisor__cta" href="https://wa.me/${phone}?text=${text}" target="_blank" rel="noopener">${evIcon('message')}Escribir por WhatsApp</a>` : ''}
    </section>`;
}

export function initials(name = '') {
  return String(name).split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
    .slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'CS';
}

/** Estado vacío dentro de un panel. */
export const emptyHtml = (title, text = '') => `
  <div class="ev-empty-state">
    <span class="ev-empty-state__icon">${evIcon('checkCircle')}</span>
    <strong>${escapeHtml(title)}</strong>
    ${text ? `<p>${escapeHtml(text)}</p>` : ''}
  </div>`;

/** Botón con carga (.is-loading) mientras llama al servidor. */
export function setLoading(button, on) {
  if (!button) return;
  button.classList.toggle('is-loading', on);
  button.disabled = on;
  if (on) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

/**
 * Lleva una ventana (.modal-overlay) al <body>: dentro del contenido quedaría
 * atrapada bajo el menú y la barra superior. Se quita sola al cambiar de página.
 */
export function portal(el) {
  if (!el) return el;
  document.body.appendChild(el);
  const drop = () => { window.removeEventListener('hashchange', drop); el.remove(); };
  window.addEventListener('hashchange', drop);
  return el;
}

/** Vuelve a pintar la vista actual (mismo hash). */
export function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Cambia la query del hash SIN volver a pintar (filtros, ?cuenta=). */
export function setHashQuery(patch) {
  const [path, qs = ''] = window.location.hash.split('?');
  const params = new URLSearchParams(qs);
  Object.entries(patch).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '' || v === 'todos') params.delete(k);
    else params.set(k, v);
  });
  const next = params.toString();
  try {
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${path}${next ? `?${next}` : ''}`);
  } catch {
    // Sin History API: el filtro sigue en pantalla aunque no quede en la URL.
  }
}

/* ---------------------------------------------------------------------------
 * WhatsApp: recordatorios, enlaces y mensaje para el grupo
 * ------------------------------------------------------------------------ */

/**
 * Recordar a una cuenta por WhatsApp (regla 20). Abre wa.me con el texto de
 * la plantilla (SIN montos) y deja el registro. Si ya se le recordó en los
 * últimos 3 días, primero pregunta.
 * Las invitaciones sin responder reciben el texto de invitación.
 * @returns {Promise<object|null>} la cuenta actualizada o null si se canceló.
 */
export async function remindAccount({ event, account, button = null }) {
  const check = L.reminderCheck(account);
  let force = false;
  if (!check.allowed) {
    const ok = await confirmDialog({
      title: 'Ya le recordaste hace poco',
      message: `<p>A <strong>${escapeHtml(account.displayName)}</strong> se le recordó ${escapeHtml(relTime(check.lastAt))}. Para no saturar, lo normal es esperar 3 días (faltan ${check.hoursLeft} horas).</p><p class="cst-modal__note">¿Quieres enviarle otro recordatorio de todas formas?</p>`,
      confirmLabel: 'Sí, recordar',
      cancelLabel: 'Esperar',
    });
    if (!ok) return null;
    force = true;
  }
  const kind = isPendingRsvp(account.rsvp) ? 'invite' : 'reminder';
  const { href } = eventService.messageFor(event, account, kind, currentOrigin());
  window.open(href, '_blank', 'noopener');
  setLoading(button, true);
  try {
    const updated = await eventService.markReminderSent(account.id, { channel: 'whatsapp', force });
    showToast(`Quedó registrado el recordatorio a ${account.displayName}.`, 'success');
    return updated;
  } catch (error) {
    showToast(error.message || 'No se pudo registrar el recordatorio.', 'error');
    return null;
  } finally {
    setLoading(button, false);
  }
}

/** Copia el enlace personal de una cuenta. */
export async function copyPersonalLink(account, button = null) {
  const link = personalLink(account);
  try {
    await navigator.clipboard.writeText(link);
    flashCopied(button);
    showToast('Enlace personal copiado. Pégalo en el chat de la familia.', 'success');
  } catch {
    showToast(`No se pudo copiar. El enlace es: ${link}`, 'info', { timeout: 9000 });
  }
}

/** Copia un texto cualquiera al portapapeles con aviso. */
export async function copyText(text, okMessage, button = null) {
  try {
    await navigator.clipboard.writeText(text);
    flashCopied(button);
    showToast(okMessage, 'success');
  } catch {
    showToast('No se pudo copiar el texto en este navegador.', 'error');
  }
}

function flashCopied(button) {
  if (!button) return;
  button.classList.add('is-copied');
  setTimeout(() => button.classList.remove('is-copied'), 1400);
}

/** Mensaje para el grupo: sin nombres ni montos (regla 19). */
export function groupMessage(event) {
  const tpl = getTemplate(event.type);
  return fillMessage(tpl.groupText || '', { event });
}

/* ---------------------------------------------------------------------------
 * Ficha de una cuenta (Drawer)
 * ------------------------------------------------------------------------ */

let drawerWatch = null;
let drawerHashHandler = () => {};

/** Mantiene la clase propia del cajón y devuelve el foco al cerrarse. */
function watchDrawer(trigger, onClose) {
  const host = document.querySelector('.drawer-overlay');
  if (!host) return;
  // El cajón vive en <body>: si la persona cambia de página, se cierra. Si solo
  // se vuelve a pintar la misma página (tras una acción, con ?cuenta=), sigue abierto.
  const path = window.location.hash.split('?')[0];
  const onHash = () => {
    const [nextPath, qs = ''] = window.location.hash.split('?');
    if (nextPath !== path || !new URLSearchParams(qs).has('cuenta')) {
      window.removeEventListener('hashchange', onHash);
      closeDrawer();
    }
  };
  window.removeEventListener('hashchange', drawerHashHandler);
  drawerHashHandler = onHash;
  window.addEventListener('hashchange', onHash);
  host.querySelector('.drawer')?.classList.add('ev-drawer');
  drawerWatch?.disconnect();
  drawerWatch = new MutationObserver(() => {
    if (host.classList.contains('is-open')) return;
    drawerWatch.disconnect();
    drawerWatch = null;
    setTimeout(() => host.querySelector('.drawer')?.classList.remove('ev-drawer'), 320);
    onClose?.();
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  });
  drawerWatch.observe(host, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => host.querySelector('.drawer__close')?.focus({ preventScroll: true }), 60);
}

/** Cinco cifras de una cuenta (regla 4) con la barra «Así se paga». */
export function fiveFiguresHtml(c, { hostName = 'el anfitrión', you = false } = {}) {
  const favor = c.saldo < 0;
  const rows = [
    { k: 'Cuesta', v: money(c.cuesta), hint: 'El valor de los paquetes' },
    { k: `Cubierto por ${hostName}`, v: c.cubierto > 0 ? `− ${money(c.cubierto)}` : money(0), hint: 'Lo invita el anfitrión' },
    { k: you ? 'Te toca' : 'Le toca', v: money(c.neto), strong: true },
    { k: 'Pagado', v: money(c.pagado), tone: 'blue' },
    favor
      ? { k: 'Saldo a favor', v: money(-c.saldo), tone: 'blue', strong: true }
      : { k: you ? 'Te falta' : 'Le falta', v: money(c.saldo), tone: c.status === 'atrasado' ? 'red' : '', strong: true },
  ];
  const total = Math.max(1, c.cuesta);
  const segPaid = Math.min(c.pagado, c.neto > 0 ? c.neto : 0);
  const segs = [
    { cls: 'is-host', w: c.cubierto / total, label: `Cubierto por ${hostName}` },
    { cls: 'is-paid', w: segPaid / total, label: 'Pagado' },
    { cls: 'is-due', w: Math.max(0, c.saldo) / total, label: you ? 'Te falta' : 'Falta' },
  ].filter((s) => s.w > 0.001);
  return `
    <div class="ev-five">
      <div class="ev-five__bar" aria-hidden="true">${segs.map((s) => `<span class="${s.cls}" style="--w:${(s.w * 100).toFixed(2)}%"></span>`).join('')}</div>
      <ul class="ev-five__legend">
        ${segs.map((s) => `<li class="${s.cls}"><i></i>${escapeHtml(s.label)}</li>`).join('')}
      </ul>
      <dl class="ev-five__grid">
        ${rows.map((r) => `
          <div class="ev-five__row ${r.strong ? 'is-strong' : ''} ${r.tone ? `is-${r.tone}` : ''}">
            <dt>${escapeHtml(r.k)}</dt><dd>${escapeHtml(r.v)}</dd>
          </div>`).join('')}
      </dl>
    </div>`;
}

/** Metas de una cuenta: fecha, meta acumulada y estado. */
export function milestonesHtml(c, { amounts = true } = {}) {
  const list = c.milestones || [];
  if (!list.length) return '<p class="ev-empty">Las metas aparecen cuando la invitación confirma.</p>';
  const STATE = { cumplida: ['Cumplida', 'is-ok', 'check'], vencida: ['Vencida', 'is-bad', 'alert'], pendiente: ['Pendiente', 'is-wait', 'clock'] };
  return `
    <ol class="ev-goals">
      ${list.map((m) => {
        const [label, cls, ico] = STATE[m.state] || STATE.pendiente;
        return `
          <li class="ev-goals__item ${cls}">
            <span class="ev-goals__dot">${evIcon(ico)}</span>
            <span class="ev-goals__main">
              <strong>${escapeHtml(m.label)}</strong>
              <small>${escapeHtml(fmtDayLong(m.date))}${m.pct ? ` · ${m.pct} % acumulado` : ''}</small>
            </span>
            ${amounts && m.target != null ? `<span class="ev-goals__amount">${money(m.target)}</span>` : ''}
            <span class="ev-goals__state">${label}</span>
          </li>`;
      }).join('')}
    </ol>`;
}

/** Movimientos (líneas) visibles de una cuenta, del más reciente al más viejo. */
export function movementsHtml(lines, { limit = 12, showRef = false, accountName = null } = {}) {
  const list = [...(lines || [])].sort((a, b) => (a.date === b.date ? Number(b.id) - Number(a.id) : a.date < b.date ? 1 : -1)).slice(0, limit);
  if (!list.length) return '<p class="ev-empty">Sin movimientos todavía.</p>';
  return `
    <ul class="ev-moves">
      ${list.map((l) => {
        const cash = L.CAJA.includes(l.kind);
        const shown = cash ? -l.amount : l.amount;
        return `
          <li class="ev-moves__item ${cash ? 'is-cash' : ''} ${l.correctsId != null ? 'is-correction' : ''}">
            <span class="ev-moves__date">${escapeHtml(fmtDay(l.date))}</span>
            <span class="ev-moves__desc">${accountName ? `<strong>${escapeHtml(accountName(l.accountId))}</strong>` : ''}${escapeHtml(l.description || l.kind)}${showRef && l.reference ? ` <small>· ${escapeHtml(l.reference)}</small>` : ''}</span>
            <span class="ev-moves__amount">${escapeHtml(cash ? (shown >= 0 ? `+ ${money(shown)}` : `− ${money(-shown)}`) : signedMoney(shown))}</span>
          </li>`;
      }).join('')}
    </ul>`;
}

/**
 * Abre la ficha de una cuenta.
 * @param {object} opts
 * @param {object} opts.data     - eventService.getEventView() (ya filtrado por rol).
 * @param {number} opts.accountId
 * @param {HTMLElement} [opts.trigger] - para devolver el foco al cerrar.
 * @param {Function} [opts.onChange]   - tras una acción que cambia datos.
 * @param {Function} [opts.onClose]
 * @param {Function} [opts.extraHtml]  - (account, computed) => HTML adicional (admin).
 * @param {Function} [opts.bindExtra]  - (body, account, computed) => enlaza lo adicional.
 * @param {Function} [opts.onContribute] - abrir «Aportar» con esta cuenta elegida.
 */
export function openAccountDrawer({ data, accountId, trigger = null, onChange, onClose, extraHtml, bindExtra, onContribute }) {
  const { event, view } = data;
  const account = data.accounts.find((a) => L.sameId(a.id, accountId));
  if (!account) return;
  const c = data.summary.byId.get(String(account.id));
  const vocab = vocabFor(event.type, data.summary.host ? data.summary.host.displayName : event.hostDisplayName);
  const guests = data.guests.filter((g) => L.sameId(g.accountId, account.id));
  const lines = data.lines.filter((l) => L.sameId(l.accountId, account.id));
  const pkgName = (id) => (data.packages.find((p) => L.sameId(p.id, id)) || {}).name || 'Sin paquete';
  const hostShort = event.hostDisplayName || 'el anfitrión';
  const amounts = !c?.amountsHidden;
  const yes = guests.filter((g) => g.status !== 'cancelado' && g.attendance === 'si').length;
  const isHost = account.kind === 'anfitrion';
  const can = view.can || {};
  const pending = isPendingRsvp(account.rsvp);
  const canMark = can.markConfirmed && pending && event.status === 'abierto';

  const people = guests.length
    ? `<ul class="ev-people">
        ${guests.map((g) => {
          const sem = L.personSemaphore(g, c, data.lines);
          const label = sem.pago === 'cubierto' ? 'Cubierto' : (c && sem.pago === c.status ? c.statusLabel : (L.ACCOUNT_STATUS[sem.pago] || {}).label);
          return `
            <li class="ev-people__item">
              <span class="ev-people__avatar">${escapeHtml(initials(L.guestName(g)))}</span>
              <span class="ev-people__main">
                <strong>${escapeHtml(L.guestName(g))}</strong>
                <small>${escapeHtml(g.packageId != null ? pkgName(g.packageId) : (AUDIENCE_LABELS[g.audience] || g.audience))}${g.isMinor ? ' · menor de edad' : ''}</small>
                ${semaphoreHtml({ ...sem, pagoLabel: label }, { compact: true, docs: eventUsesDocs(data) })}
              </span>
            </li>`;
        }).join('')}
      </ul>`
    : `<p class="ev-empty">${pending ? `Esta invitación todavía no responde. Tiene ${plural(Number(account.seatsAllowed) || 0, 'cupo')}.` : 'Sin personas registradas.'}</p>`;

  const payBlock = !c || c.status === 'sin_cargos'
    ? `<p class="ev-empty">${pending ? 'Cuando confirme, aquí verás lo que le toca y su plan de pagos.' : 'Esta cuenta no tiene cargos.'}</p>`
    : amounts
      ? fiveFiguresHtml(c, { hostName: hostShort })
      : `
        <div class="ev-private">
          <div class="ev-private__status">${accountBadge(c)}</div>
          <p>${c.status === 'atrasado'
            ? `Tiene una meta vencida desde el ${escapeHtml(fmtDayLong(c.oldestUnmet?.date))}.`
            : c.next ? `Su próxima meta es el ${escapeHtml(fmtDayLong(c.next.date))}.` : 'No tiene metas pendientes.'}</p>
          <small>${evIcon('lock')} En este evento los organizadores ven el estado de cada cuenta, no los montos.</small>
        </div>`;

  const notesBlock = view.organizerNotes && !isHost && (can.invite || view.role === 'admin')
    ? `
      <section class="ev-drawer__section">
        <h3>Notas privadas</h3>
        <textarea class="form__input ev-notes" rows="3" maxlength="2000" placeholder="Solo las ven los organizadores y CS Travel Group." data-notes>${escapeHtml(account.organizerNotes || '')}</textarea>
        <div class="ev-drawer__row-end"><button type="button" class="btn btn--ghost btn--sm" data-act="save-notes">Guardar nota</button></div>
      </section>`
    : '';

  const actions = [];
  const allCancelled = guests.length > 0 && guests.every((g) => g.status === 'cancelado');
  if (!isHost && can.remind && account.rsvp !== 'no_asiste' && !allCancelled) {
    actions.push(`<button type="button" class="btn btn--primary" data-act="remind">${evIcon('message')}${pending ? 'Reenviar invitación' : 'Recordar por WhatsApp'}</button>`);
  }
  if (!isHost) actions.push(`<button type="button" class="btn btn--ghost" data-act="copy">${evIcon('link')}Copiar enlace personal</button>`);
  if (canMark) actions.push(`<button type="button" class="btn btn--ghost" data-act="mark">${evIcon('userCheck')}Confirmó por teléfono</button>`);
  if (!isHost && can.contribute && onContribute && account.rsvp === 'confirmada' && yes > 0) {
    actions.push(`<button type="button" class="btn btn--ghost" data-act="contribute">${evIcon('gift')}Aportar a esta cuenta</button>`);
  }

  const reminderInfo = account.lastReminderAt
    ? `<small class="ev-drawer__hint">${evIcon('clock')}Último recordatorio ${escapeHtml(relTime(account.lastReminderAt))} · ${plural(Number(account.reminderCount) || 0, 'envío')}</small>`
    : '';

  const body = `
    <div class="ev-drawer">
      <header class="ev-drawer__head">
        <div class="ev-drawer__badges">
          ${account.groupTag ? `<span class="chip">${escapeHtml(account.groupTag)}</span>` : ''}
          ${isHost ? '<span class="chip">Cuenta del anfitrión</span>' : rsvpBadge(account.rsvp)}
          ${c && c.status !== 'sin_cargos' ? accountBadge(c) : ''}
        </div>
        <dl class="ev-drawer__facts">
          ${!isHost ? `<div><dt>Cupos</dt><dd>${yes} de ${Number(account.seatsAllowed) || 0} confirmados</dd></div>` : ''}
          <div><dt>${escapeHtml(isHost ? 'Responsable' : vocab.contacto)}</dt><dd>${escapeHtml(account.contactName || '—')}</dd></div>
          ${account.contactPhone ? `<div><dt>Celular</dt><dd>${escapeHtml(account.contactPhone)}</dd></div>` : ''}
          ${account.contactEmail ? `<div><dt>Correo</dt><dd class="ev-ellipsis">${escapeHtml(account.contactEmail)}</dd></div>` : ''}
        </dl>
        ${reminderInfo}
      </header>

      ${actions.length ? `<div class="ev-drawer__actions">${actions.join('')}</div>` : ''}

      <section class="ev-drawer__section">
        <h3>${isHost ? 'Lo que cubre' : 'Así se paga'}</h3>
        ${payBlock}
      </section>

      ${!isHost ? `<section class="ev-drawer__section"><h3>${escapeHtml(vocab.personas)}</h3>${people}</section>` : ''}

      ${c && (c.milestones || []).length ? `<section class="ev-drawer__section"><h3>Metas</h3>${milestonesHtml(c, { amounts })}</section>` : ''}

      ${amounts && lines.length ? `<section class="ev-drawer__section"><h3>Movimientos</h3>${movementsHtml(lines, { showRef: view.role === 'admin' })}</section>` : ''}

      ${notesBlock}

      ${extraHtml ? extraHtml(account, c) : ''}

      ${view.role === 'event' && event.advisor?.phone ? `
        <button type="button" class="ev-drawer__change" data-act="change">
          ${evIcon('edit')}<span>¿Hay que cambiar algo de esta invitación? <b>Pedir un cambio a CS Travel Group</b></span>${evIcon('arrowRight')}
        </button>` : ''}
    </div>`;

  openDrawer({ title: account.displayName, bodyHtml: body });
  watchDrawer(trigger, onClose);
  const root = document.querySelector('.drawer-overlay .drawer__body');
  if (!root) return;
  root.scrollTop = 0;
  wireStyledSelects(root);

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !root.contains(btn)) return;
    const act = btn.dataset.act;
    if (act === 'remind') {
      const updated = await remindAccount({ event, account, button: btn });
      if (updated) { Object.assign(account, updated); onChange?.(); }
    } else if (act === 'copy') {
      copyPersonalLink(account, btn);
    } else if (act === 'mark') {
      const done = await markConfirmedByPhone({ data, account, guests, button: btn });
      if (done) { closeDrawer(); onChange?.(); }
    } else if (act === 'contribute') {
      closeDrawer();
      onContribute?.({ accountIds: [account.id] }, btn);
    } else if (act === 'change') {
      const phone = String(event.advisor.phone).replace(/\D/g, '');
      const me = authService.getSession();
      const text = `Hola, ${firstName(event.advisor.name)}. Soy ${me?.name || 'la organizadora'} del evento «${event.title}». Quiero pedir un cambio para ${account.displayName}: `;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } else if (act === 'save-notes') {
      const value = root.querySelector('[data-notes]')?.value || '';
      setLoading(btn, true);
      try {
        await eventService.updateOrganizerNotes(account.id, value);
        account.organizerNotes = value;
        showToast('Nota guardada.', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo guardar la nota.', 'error');
      } finally {
        setLoading(btn, false);
      }
    }
  });
  bindExtra?.(root, account, c);
}

/**
 * «Confirmó por teléfono»: pide quién va (una casilla por persona o los
 * nombres de cada cupo) y confirma en nombre de la invitación.
 */
async function markConfirmedByPhone({ data, account, guests, button }) {
  const { event } = data;
  const seats = Math.max(1, Number(account.seatsAllowed) || 1);
  const active = guests.filter((g) => g.status !== 'cancelado');
  const adultPkg = data.packages.find((p) => p.status !== 'oculto');
  const audiences = [...new Set(data.packages.filter((p) => p.status !== 'oculto').map((p) => p.audience))];
  const rows = active.length
    ? active.map((g) => `
        <label class="ev-mark__row">
          <input type="checkbox" data-guest="${g.id}" ${g.attendance !== 'no' ? 'checked' : ''} />
          <span><strong>${escapeHtml(L.guestName(g))}</strong><small>${escapeHtml(AUDIENCE_LABELS[g.audience] || g.audience)}</small></span>
        </label>`).join('')
    : Array.from({ length: seats }, (_, i) => `
        <div class="ev-mark__new">
          <input class="form__input" data-new-first="${i}" placeholder="Nombre" aria-label="Nombre de la persona ${i + 1}" />
          <input class="form__input" data-new-last="${i}" placeholder="Apellido" aria-label="Apellido de la persona ${i + 1}" />
          ${audiences.length > 1 ? `
            <select class="form__input" data-new-aud="${i}" aria-label="Tipo de persona ${i + 1}">
              ${audiences.map((a) => `<option value="${a}">${escapeHtml(AUDIENCE_LABELS[a] || a)}</option>`).join('')}
            </select>` : ''}
        </div>`).join('');
  const ok = await confirmDialog({
    title: `Confirmar a ${account.displayName}`,
    message: `
      <p>Marca quién va al viaje. ${active.length ? '' : `Escribe los nombres (hasta ${plural(seats, 'cupo')}); deja en blanco los cupos que no se usan.`}</p>
      <div class="ev-mark">${rows}</div>
      <p class="cst-modal__note">Se crean los cargos de cada persona y la invitación recibe su plan de pagos. Queda registrado que confirmó por teléfono.</p>`,
    confirmLabel: 'Confirmar asistencia',
    cancelLabel: 'Cancelar',
  });
  if (!ok) return false;
  const box = document.querySelector('.cst-modal__body');
  let persons;
  if (active.length) {
    persons = active.map((g) => ({ id: g.id, attendance: box.querySelector(`[data-guest="${g.id}"]`)?.checked ? 'si' : 'no' }));
  } else {
    persons = Array.from({ length: seats }, (_, i) => ({
      firstName: (box.querySelector(`[data-new-first="${i}"]`)?.value || '').trim(),
      lastName: (box.querySelector(`[data-new-last="${i}"]`)?.value || '').trim(),
      audience: box.querySelector(`[data-new-aud="${i}"]`)?.value || (adultPkg ? adultPkg.audience : 'adulto'),
      attendance: 'si',
    })).filter((p) => p.firstName);
  }
  if (!persons.length) {
    showToast('Escribe al menos un nombre para confirmar.', 'error');
    return false;
  }
  setLoading(button, true);
  try {
    const result = await eventService.confirmAttendance(account.id, persons);
    showToast(result.account.rsvp === 'no_asiste'
      ? `Quedó registrado que ${account.displayName} no asistirá.`
      : `Listo: ${account.displayName} quedó confirmada.`, 'success');
    return true;
  } catch (error) {
    showToast(error.message || 'No se pudo confirmar.', 'error');
    return false;
  } finally {
    setLoading(button, false);
  }
}

/* ---------------------------------------------------------------------------
 * CSV
 * ------------------------------------------------------------------------ */

export function exportCsv(name, columns, rows) {
  downloadCsv(`${name}-${csvDateStamp()}.csv`, columns, rows);
}

/* ---------------------------------------------------------------------------
 * Buscador y campana del organizador (Navbar: data-action event-search /
 * event-notifications). Se registran una sola vez al importar este módulo.
 * ------------------------------------------------------------------------ */

let evSearch = null;

/** Texto comparable: sin tildes ni mayúsculas. */
const fold = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let evNotif = null;

async function currentOrganizerData() {
  const user = authService.getSession();
  if (!user || user.role !== 'event') return null;
  const query = Object.fromEntries(new URLSearchParams(window.location.hash.split('?')[1] || ''));
  const { data } = await loadOrganizerContext({ user, query });
  return data;
}

async function openEventSearch(anchor) {
  const data = await currentOrganizerData();
  if (!data) return;
  if (!evSearch) {
    evSearch = document.createElement('div');
    evSearch.className = 'cmd-overlay ev-cmd';
    evSearch.innerHTML = `
      <div class="cmd-palette" role="dialog" aria-modal="true" aria-label="Buscar personas del evento">
        <div class="cmd-palette__head">
          ${evIcon('search')}
          <input type="search" class="cmd-palette__input" placeholder="Buscar invitación, persona, grupo..." aria-label="Buscar" />
          <kbd class="cmd-palette__esc">Esc</kbd>
        </div>
        <div class="cmd-palette__results"></div>
      </div>`;
    document.body.appendChild(evSearch);
    evSearch.addEventListener('click', (e) => {
      if (e.target === evSearch) closeEventSearch();
      const hit = e.target.closest('[data-href]');
      if (hit) { closeEventSearch(); window.location.hash = hit.dataset.href; }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEventSearch(); });
  }
  const input = evSearch.querySelector('.cmd-palette__input');
  const results = evSearch.querySelector('.cmd-palette__results');
  const index = data.accounts.filter((a) => a.kind !== 'anfitrion').map((a) => {
    const names = data.guests.filter((g) => L.sameId(g.accountId, a.id)).map(L.guestName).join(' ');
    const c = data.summary.byId.get(String(a.id));
    return { a, c, terms: fold(`${a.displayName} ${a.groupTag} ${a.contactName} ${names}`) };
  });
  const paint = () => {
    const q = fold(input.value.trim());
    if (!q) { results.innerHTML = '<p class="cmd-palette__hint">Escribe un nombre, un apellido o un grupo.</p>'; return; }
    const hits = index.filter((x) => x.terms.includes(q)).slice(0, 8);
    results.innerHTML = hits.length
      ? hits.map((x) => `
          <button type="button" class="cmd-result" data-href="#/event/people?e=${data.event.id}&cuenta=${x.a.id}">
            <strong>${escapeHtml(x.a.displayName)}</strong>
            <span>${escapeHtml([x.a.groupTag, RSVP_LABELS[x.a.rsvp], x.c && x.c.status !== 'sin_cargos' ? x.c.statusLabel : ''].filter(Boolean).join(' · '))}</span>
          </button>`).join('')
      : `<p class="cmd-palette__hint">Sin resultados para «${escapeHtml(input.value.trim())}».</p>`;
  };
  input.oninput = paint;
  input.value = '';
  paint();
  evSearch.classList.add('is-open');
  evSearch._anchor = anchor;
  setTimeout(() => input.focus(), 30);
}

function closeEventSearch() {
  if (!evSearch || !evSearch.classList.contains('is-open')) return;
  evSearch.classList.remove('is-open');
  evSearch._anchor?.focus?.({ preventScroll: true });
}

/** Avisos del organizador: atrasados, metas en 7 días y confirmaciones nuevas. */
function organizerNotifications(data) {
  const out = [];
  const base = `#/event/people?e=${data.event.id}`;
  const late = data.summary.accounts.filter((c) => c.kind !== 'anfitrion' && c.status === 'atrasado');
  if (late.length) out.push({ icon: 'alert', title: `${plural(late.length, 'cuenta atrasada', 'cuentas atrasadas')}`, sub: 'Mándales un recordatorio sin montos por WhatsApp.', href: `${base}&f=atrasados` });
  const soon = data.summary.accounts.filter((c) => c.kind !== 'anfitrion' && c.status === 'por_vencer');
  if (soon.length) out.push({ icon: 'clock', title: `${plural(soon.length, 'meta vence', 'metas vencen')} en 7 días`, sub: 'Un recordatorio a tiempo evita atrasos.', href: `${base}&f=por_vencer` });
  const next = data.summary.nextMilestone;
  if (next && next.daysLeft <= 7) out.push({ icon: 'flag', title: `Meta del evento el ${fmtDay(next.date)}`, sub: `${plural(next.cuentas, 'cuenta')} todavía no llegan.`, href: `#/event/money?e=${data.event.id}` });
  const weekAgo = L.addDays(L.todayCO(), -7);
  const news = data.log.filter((e) => ['confirmo', 'marco_confirmado', 'no_asiste'].includes(e.action) && (L.isoToDateCO(e.at) || '') >= weekAgo);
  news.slice(0, 4).forEach((e) => out.push({ icon: e.action === 'no_asiste' ? 'xCircle' : 'userCheck', title: e.detail, sub: relTime(e.at), href: e.accountId ? `${base}&cuenta=${e.accountId}` : base }));
  return out;
}

async function toggleEventNotifications(anchor) {
  if (evNotif && evNotif.classList.contains('is-open')) { closeEventNotifications(); return; }
  const data = await currentOrganizerData();
  if (!data) return;
  const items = organizerNotifications(data);
  if (!evNotif) {
    evNotif = document.createElement('div');
    evNotif.className = 'notif-panel ev-notif';
    document.body.appendChild(evNotif);
    evNotif.addEventListener('click', (e) => {
      const item = e.target.closest('[data-href]');
      if (item) { closeEventNotifications(); window.location.hash = item.dataset.href; }
    });
  }
  evNotif.innerHTML = `
    <div class="notif-panel__head"><strong>Notificaciones</strong><span>${items.length}</span></div>
    <div class="notif-panel__body">
      ${items.length ? items.map((n) => `
        <button type="button" class="notif-item" data-href="${escapeHtml(n.href)}">
          <span class="notif-item__icon">${evIcon(n.icon)}</span>
          <span class="notif-item__text"><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.sub)}</span></span>
        </button>`).join('') : '<p class="cmd-palette__hint">Estás al día. Sin notificaciones.</p>'}
    </div>`;
  const rect = anchor.getBoundingClientRect();
  evNotif.style.top = `${rect.bottom + 10}px`;
  evNotif.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
  evNotif.classList.add('is-open');
}

function closeEventNotifications() {
  evNotif?.classList.remove('is-open');
}

/** Punto de la campana del organizador (solo si hay avisos). */
export function refreshEventBell(data) {
  const dot = document.querySelector('.ev-notif-dot');
  if (!dot || !data) return;
  dot.hidden = organizerNotifications(data).length === 0;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action="event-search"], [data-action="event-notifications"]');
    if (el) {
      if (el.dataset.action === 'event-search') openEventSearch(el);
      else toggleEventNotifications(el);
      return;
    }
    if (evNotif && evNotif.classList.contains('is-open') && !e.target.closest('.ev-notif')) closeEventNotifications();
  });
}
