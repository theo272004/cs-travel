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

  if (user.role === 'doctor') {
    const cases = await medicalCaseService.getByDoctor(authService.getDoctorId());
    const out = [];
    cases.filter((c) => c.status === 'cotizacion enviada').forEach((c) =>
      out.push({ icon: '💰', title: `Cotizacion lista: ${c.caseCode}`, sub: `Ajusta tu margen para ${c.patientName}`, href: `#/doctor/cases/${c.id}` })
    );
    cases.filter((c) => c.status === 'en gestion').forEach((c) =>
      out.push({ icon: '✈', title: `En gestion: ${c.caseCode}`, sub: `CS Travel coordina el viaje de ${c.patientName}`, href: `#/doctor/cases/${c.id}` })
    );
    return out;
  }

  if (user.role === 'company') {
    const requests = await requestService.getByCompany(authService.getCompanyId());
    return requests
      .filter((r) => ['cotizacion enviada', 'en gestion'].includes(r.status))
      .map((r) => ({ icon: r.status === 'cotizacion enviada' ? '📄' : '✈', title: `${r.requestCode}: ${r.status}`, sub: `${r.origin} → ${r.destination}`, href: `#/company/requests/${r.id}` }));
  }

  // Admin: lo que requiere accion del equipo.
  const [requests, cases] = await Promise.all([requestService.getAll(), medicalCaseService.getAll()]);
  const out = [];
  requests.filter((r) => ['solicitud enviada'].includes(r.status)).forEach((r) =>
    out.push({ icon: '🆕', title: `Solicitud por atender: ${r.requestCode}`, sub: `${r.origin} → ${r.destination}`, href: `#/admin/requests/${r.id}` })
  );
  cases.filter((c) => ['solicitud enviada'].includes(c.status)).forEach((c) =>
    out.push({ icon: '🩺', title: `Caso por cotizar: ${c.caseCode}`, sub: c.patientName, href: `#/admin/medical-cases/${c.id}` })
  );
  return out;
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
  panel.innerHTML = `
    <div class="notif-panel__head">
      <strong>Notificaciones</strong>
      <span>${items.length}</span>
    </div>
    <div class="notif-panel__body">
      ${items.length
        ? items.map((n) => `
            <button type="button" class="notif-item" data-href="${n.href}">
              <span class="notif-item__icon">${n.icon}</span>
              <span class="notif-item__text">
                <strong>${escapeHtml(n.title)}</strong>
                <span>${escapeHtml(n.sub)}</span>
              </span>
            </button>
          `).join('')
        : '<p class="cmd-palette__hint">Estas al dia. Sin notificaciones.</p>'}
    </div>
  `;
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
