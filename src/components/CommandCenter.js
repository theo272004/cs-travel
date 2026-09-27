/**
 * CommandCenter.js
 * =============================================================================
 * PROPOSITO:
 *   Funcionalidad de la barra superior:
 *     - Busqueda global (overlay tipo command palette) sobre las entidades a las
 *       que el usuario tiene acceso segun su rol (empresas, medicos, solicitudes,
 *       casos, usuarios). Navega al detalle al elegir un resultado.
 *     - Panel de notificaciones: avisos derivados del estado de los datos
 *       (cotizaciones por decidir, casos sin cotizar, solicitudes en gestion...).
 *
 *   Ambos se construyen UNA vez (overlay/panel en <body>) y se abren por
 *   delegacion desde main.js, de modo que sobreviven a los re-render de vistas.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { companyService } from '../services/companyService.js';
import { doctorService } from '../services/doctorService.js';
import { requestService } from '../services/requestService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { userService } from '../services/userService.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/formatDate.js';
import { navigate } from '../router/router.js';
import { icon } from '../utils/icons.js';

/* ---------------------------------------------------------------------------
 * Indice de busqueda segun rol.
 * ------------------------------------------------------------------------- */

async function buildSearchIndex() {
  const user = authService.getSession();
  if (!user) return [];

  if (user.role === 'admin') {
    const [companies, doctors, requests, cases, users] = await Promise.all([
      companyService.getAll(),
      doctorService.getAll(),
      requestService.getAll(),
      medicalCaseService.getAll(),
      userService.getAll(),
    ]);
    return [
      ...companies.map((c) => ({ title: c.name, sub: `Empresa · ${c.sharedCode}`, href: `#/admin/companies/${c.id}`, terms: `${c.name} ${c.sharedCode} ${c.email}` })),
      ...doctors.map((d) => ({ title: d.clinicName, sub: `Medico · ${d.name}`, href: `#/admin/doctors/${d.id}`, terms: `${d.clinicName} ${d.name} ${d.specialty}` })),
      ...requests.map((r) => ({ title: r.requestCode, sub: `Solicitud · ${r.origin} → ${r.destination}`, href: `#/admin/requests/${r.id}`, terms: `${r.requestCode} ${r.origin} ${r.destination} ${r.status}` })),
      ...cases.map((c) => ({ title: c.caseCode, sub: `Caso · ${c.patientName}`, href: `#/admin/medical-cases/${c.id}`, terms: `${c.caseCode} ${c.patientName} ${c.procedure} ${c.status}` })),
      ...users.map((u) => ({ title: u.name, sub: `Usuario · ${u.role}`, href: `#/admin/users/${u.id}`, terms: `${u.name} ${u.email} ${u.role}` })),
    ];
  }

  if (user.role === 'doctor') {
    const cases = await medicalCaseService.getByDoctor(authService.getDoctorId());
    return cases.map((c) => ({ title: c.caseCode, sub: `${c.patientName} · ${c.origin} → ${c.destination}`, href: `#/doctor/cases/${c.id}`, terms: `${c.caseCode} ${c.patientName} ${c.procedure} ${c.destination} ${c.status}` }));
  }

  // Empresa
  const requests = await requestService.getByCompany(authService.getCompanyId());
  return requests.map((r) => ({ title: r.requestCode, sub: `${r.requestType} · ${r.origin} → ${r.destination}`, href: `#/company/requests/${r.id}`, terms: `${r.requestCode} ${r.origin} ${r.destination} ${r.requestType} ${r.status}` }));
}

let searchOverlay = null;
let searchIndex = [];

function ensureSearchOverlay() {
  if (searchOverlay) return searchOverlay;
  searchOverlay = document.createElement('div');
  searchOverlay.className = 'cmd-overlay';
  searchOverlay.innerHTML = `
    <div class="cmd-palette" role="dialog" aria-modal="true" aria-label="Busqueda global">
      <div class="cmd-palette__head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>
        </svg>
        <input type="search" class="cmd-palette__input" placeholder="Buscar codigo, nombre, ruta..." aria-label="Buscar" />
        <kbd class="cmd-palette__esc">Esc</kbd>
      </div>
      <div class="cmd-palette__results"></div>
    </div>
  `;
  document.body.appendChild(searchOverlay);

  const input = searchOverlay.querySelector('.cmd-palette__input');
  const results = searchOverlay.querySelector('.cmd-palette__results');

  const renderResults = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      results.innerHTML = `<p class="cmd-palette__hint">Escribe para buscar en todo tu portal.</p>`;
      return;
    }
    const matches = searchIndex
      .filter((item) => item.terms.toLowerCase().includes(q))
      .slice(0, 8);
    if (!matches.length) {
      results.innerHTML = `<p class="cmd-palette__hint">Sin resultados para "${escapeHtml(q)}".</p>`;
      return;
    }
    results.innerHTML = matches
      .map((m) => `
        <button type="button" class="cmd-result" data-href="${m.href}">
          <strong>${escapeHtml(m.title)}</strong>
          <span>${escapeHtml(m.sub)}</span>
        </button>
      `)
      .join('');
  };

  input.addEventListener('input', renderResults);
  results.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-href]');
    if (btn) {
      closeSearch();
      navigate(btn.dataset.href);
    }
  });
  searchOverlay.addEventListener('click', (event) => {
    if (event.target === searchOverlay) closeSearch();
  });

  searchOverlay._renderResults = renderResults;
  return searchOverlay;
}

export async function openGlobalSearch() {
  const overlay = ensureSearchOverlay();
  searchIndex = await buildSearchIndex();
  overlay.classList.add('is-open');
  const input = overlay.querySelector('.cmd-palette__input');
  input.value = '';
  overlay._renderResults();
  input.focus();
}

export function closeSearch() {
  searchOverlay?.classList.remove('is-open');
}

/* ---------------------------------------------------------------------------
 * Notificaciones segun rol y estado de los datos.
 * ------------------------------------------------------------------------- */

async function buildNotifications() {
  const user = authService.getSession();
  if (!user) return [];
  // Cada aviso lleva una clave (registro + estado): asi se sabe si ya se vio.
  // action = requiere que ESTA persona haga algo; el resto es informativo.
  const item = (key, action, ic, title, sub, href) => ({ key, action, icon: icon(ic), title, sub, href });
  const recent = (x) => Date.now() - Date.parse(x.updatedAt || x.createdAt || 0) < 7 * 86400000;

  if (user.role === 'doctor') {
    const cases = await medicalCaseService.getByDoctor(authService.getDoctorId());
    const out = [];
    for (const c of cases) {
      const k = `case:${c.id}:${c.status}`;
      const href = `#/doctor/cases/${c.id}`;
      const p = c.patientName || 'tu paciente';
      if (c.status === 'cotizacion enviada' && !((c.doctorMargin || 0) > 0)) out.push(item(k, true, 'money', `Cotización lista: ${c.caseCode}`, `Fija tu margen para ${p}`, href));
      else if (c.status === 'cotizacion enviada') out.push(item(k + ':m', false, 'users', `Esperando aprobación: ${c.caseCode}`, `Cuando ${p} diga que sí, márcalo en el caso`, href));
      else if (c.status === 'aprobada') out.push(item(k, true, 'card', `Listo para pagar: ${c.caseCode}`, `Paga para poner en marcha el viaje de ${p}`, href));
      else if (c.status === 'en gestion') out.push(item(k, false, 'plane', `En gestión: ${c.caseCode}`, `CS Travel Group coordina el viaje de ${p}`, href));
      else if (c.status === 'solicitud enviada') out.push(item(k, false, 'clock', `Enviado: ${c.caseCode}`, `En revisión por CS Travel Group · ${p}`, href));
      else if (['finalizada', 'cancelada'].includes(c.status) && recent(c)) out.push(item(k, false, c.status === 'finalizada' ? 'check' : 'x', `${c.status === 'finalizada' ? 'Finalizado' : 'Cancelado'}: ${c.caseCode}`, p, href));
    }
    return out;
  }

  if (user.role === 'company') {
    const requests = await requestService.getByCompany(authService.getCompanyId());
    const out = [];
    for (const r of requests) {
      const k = `req:${r.id}:${r.status}`;
      const href = `#/company/requests/${r.id}`;
      const ruta = `${r.origin} → ${r.destination}`;
      if (r.status === 'cotizacion enviada') out.push(item(k, true, 'file', `${r.requestCode}: cotización lista para aprobar`, ruta, href));
      else if (r.status === 'aprobada') out.push(item(k, true, 'card', `${r.requestCode}: lista para pagar`, ruta, href));
      else if (r.status === 'solicitud enviada') out.push(item(k, false, 'clock', `${r.requestCode}: en revisión por CS Travel Group`, ruta, href));
      else if (r.status === 'en gestion') out.push(item(k, false, 'plane', `${r.requestCode}: en gestión por CS Travel Group`, ruta, href));
      else if (['finalizada', 'cancelada'].includes(r.status) && recent(r)) out.push(item(k, false, r.status === 'finalizada' ? 'check' : 'x', `${r.requestCode}: ${r.status === 'finalizada' ? 'viaje completado' : 'cancelada'}`, ruta, href));
    }
    return out;
  }

  // Admin: lo que requiere accion del equipo.
  const [requests, cases] = await Promise.all([requestService.getAll(), medicalCaseService.getAll()]);
  const out = [];
  requests.filter((r) => r.status === 'solicitud enviada').forEach((r) =>
    out.push(item(`req:${r.id}:${r.status}`, true, 'inbox', `Solicitud por atender: ${r.requestCode}`, `${r.origin} → ${r.destination}`, `#/admin/requests/${r.id}`))
  );
  cases.filter((c) => c.status === 'solicitud enviada').forEach((c) =>
    out.push(item(`case:${c.id}:${c.status}`, true, 'stethoscope', `Caso por cotizar: ${c.caseCode}`, c.patientName || '', `#/admin/medical-cases/${c.id}`))
  );
  return out;
}

/* Avisos ya vistos, por persona y en este navegador (el punto rojo solo sale
   si hay algo nuevo). Si el navegador no deja guardar, todo cuenta como nuevo. */
function seenKey() {
  const u = authService.getSession();
  return `cs_notif_seen_${u?.id ?? 'anon'}`;
}
function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey()) || '[]')); } catch { return new Set(); }
}
function saveSeen(keys) {
  try { localStorage.setItem(seenKey(), JSON.stringify([...keys].slice(-300))); } catch { /* sin almacenamiento */ }
}

let notifPanel = null;

function ensureNotifPanel() {
  if (notifPanel) return notifPanel;
  notifPanel = document.createElement('div');
  notifPanel.className = 'notif-panel';
  document.body.appendChild(notifPanel);
  notifPanel.addEventListener('click', (event) => {
    const item = event.target.closest('[data-href]');
    if (item) {
      closeNotifications();
      navigate(item.dataset.href);
    }
  });
  return notifPanel;
}

export async function toggleNotifications(anchor) {
  const panel = ensureNotifPanel();
  if (panel.classList.contains('is-open')) {
    closeNotifications();
    return;
  }
  const items = await buildNotifications();
  const seen = loadSeen();
  const row = (n) => `
    <button type="button" class="notif-item${seen.has(n.key) ? '' : ' is-new'}" data-href="${n.href}">
      <span class="notif-item__icon">${n.icon}</span>
      <span class="notif-item__text">
        <strong>${escapeHtml(n.title)}</strong>
        <span>${escapeHtml(n.sub)}</span>
      </span>
    </button>`;
  const act = items.filter((n) => n.action);
  const info = items.filter((n) => !n.action);
  panel.innerHTML = `
    <div class="notif-panel__head">
      <strong>Notificaciones</strong>
      <span>${items.length}</span>
    </div>
    <div class="notif-panel__body">
      ${act.length ? `<p class="notif-panel__group">Requiere tu acción</p>${act.map(row).join('')}` : ''}
      ${info.length ? `<p class="notif-panel__group">Para que estés al tanto</p>${info.map(row).join('')}` : ''}
      ${items.length ? '' : '<p class="cmd-palette__hint">Estás al día. Sin notificaciones.</p>'}
    </div>
  `;
  // Abrir el panel cuenta como "visto": se apaga el punto rojo.
  items.forEach((n) => seen.add(n.key));
  saveSeen(seen);
  document.querySelector('.navbar__icon-dot')?.setAttribute('hidden', '');
  // Posicionar bajo el ancla (campana).
  const rect = anchor.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 10}px`;
  panel.style.right = `${window.innerWidth - rect.right}px`;
  panel.classList.add('is-open');
}

export function closeNotifications() {
  notifPanel?.classList.remove('is-open');
}

/** Numero de notificaciones (para el punto rojo de la campana). */
export async function notificationCount() {
  return (await buildNotifications()).length;
}

/** Muestra el punto rojo de la campana SOLO si hay notificaciones. */
export async function refreshNotifDot() {
  const dot = document.querySelector('.navbar__icon-dot');
  if (!dot) return;
  try {
    const seen = loadSeen();
    dot.hidden = !(await buildNotifications()).some((n) => !seen.has(n.key));
  } catch {
    dot.hidden = true;
  }
}
