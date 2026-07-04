/**
 * Sidebar.js
 * =============================================================================
 * PROPOSITO:
 *   Menu lateral de navegacion. Muestra enlaces distintos segun el rol del
 *   usuario (admin o empresa) y resalta la opcion activa.
 *
 * RESPONSABILIDADES:
 *   - Construir la lista de enlaces correcta para cada rol.
 *   - Marcar visualmente el enlace correspondiente a la ruta actual.
 *
 * NAVEGACION:
 *   Los enlaces usan hrefs con hash (#/...). Al hacer clic, cambia el hash de
 *   la URL y el router (escuchando 'hashchange') renderiza la vista, sin recargar.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { requestService } from '../services/requestService.js';
import logoCs from '../assets/logo-cs.png';

/**
 * Iconos SVG de linea (estilo del mockup): trazo limpio, heredan el color del
 * texto via currentColor. Reemplazan a los antiguos glifos unicode.
 */
const NAV_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M15 9h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4"/><path d="M8 7h3M8 11h3M8 15h3"/></svg>',
  medical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>',
  plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l4.6 3-2 2-2.5-.5a1 1 0 0 0-.9 1.6l2.3 2.3 2.3 2.3a1 1 0 0 0 1.6-.9l-.5-2.5 2-2 3 4.6a1 1 0 0 0 1.7-.9z"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="M8 12h8M8 16h5"/></svg>',
  kanban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="10" rx="1.5"/><rect x="16" y="4" width="5" height="13" rx="1.5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
};

// Definicion de los enlaces por rol. Cada item: { label, hash, icon }.
const MENU_BY_ROLE = {
  admin: [
    { label: 'Dashboard', hash: '#/admin/dashboard', icon: 'dashboard' },
    { label: 'Operaciones', hash: '#/admin/requests', icon: 'plane', match: ['#/admin/requests', '#/admin/medical-cases'] },
    { label: 'Seguimiento', hash: '#/admin/kanban', icon: 'kanban' },
    { label: 'Cotizaciones', hash: '#/admin/quotes', icon: 'quote' },
    { label: 'Empresas', hash: '#/admin/companies', icon: 'building' },
    { label: 'Medicos', hash: '#/admin/doctors', icon: 'medical' },
    { label: 'Codigos', hash: '#/admin/codes', icon: 'tag' },
    { label: 'Usuarios', hash: '#/admin/users', icon: 'users' },
    { label: 'Configuracion', hash: '#/admin/settings', icon: 'settings' },
  ],
  company: [
    { label: 'Dashboard', hash: '#/company/dashboard', icon: 'dashboard' },
    { label: 'Mis solicitudes', hash: '#/company/requests', icon: 'plane', badge: true },
    // "Nueva solicitud" se quitó del menú: el botón flotante "+" (abajo a la
    // derecha) hace exactamente lo mismo. La ruta #/company/requests/new sigue.
  ],
  doctor: [
    { label: 'Dashboard', hash: '#/doctor/dashboard', icon: 'dashboard' },
    { label: 'Mis casos', hash: '#/doctor/cases', icon: 'clipboard', badge: true },
  ],
};

/**
 * Sidebar()
 * @param {string} role        - Rol del usuario ("admin" | "company").
 * @param {string} currentHash - Hash de la ruta actual, para marcar el activo.
 * @returns {string} HTML del menu lateral.
 */
export function Sidebar(role, currentHash) {
  const items = MENU_BY_ROLE[role] || [];

  // Generamos un <a> por cada item. La clase "is-active" resalta el actual.
  const links = items
    .map((item) => {
      // Consideramos activo si el hash actual empieza por el del item.
      // - item.match: lista de prefijos que activan el item (ej. "Operaciones"
      //   abarca solicitudes y casos medicos).
      // - "new" comparte prefijo con su listado, asi que se compara exacto.
      const isActive = item.match
        ? item.match.some((m) => currentHash.startsWith(m))
        : item.hash.endsWith('/new')
          ? currentHash === item.hash
          // El listado NO se activa en su ruta hija "/new" (esa tiene su propio item).
          : currentHash.startsWith(item.hash) && !currentHash.endsWith('/new');

      const badge = item.badge
        ? `<span class="sidebar__badge" data-badge-hash="${item.hash}" hidden></span>`
        : '';

      return `
        <a href="${item.hash}" class="sidebar__link ${isActive ? 'is-active' : ''}">
          <span class="sidebar__icon" aria-hidden="true">${NAV_ICONS[item.icon] || ''}</span>
          <span class="sidebar__label">${escapeHtml(item.label)}</span>
          ${badge}
        </a>
      `;
    })
    .join('');

  return renderSidebarShell(role, links);
}

/**
 * updateSidebarBadges()
 * Pinta la burbuja contador en el menu (decisiones pendientes del aliado):
 *   - Medico: casos en "cotizacion enviada" (esperan que ponga su margen).
 *   - Empresa: solicitudes en "cotizacion enviada" (esperan su aprobacion).
 * Se llama desde el router tras cada render del layout.
 */
export async function updateSidebarBadges(user) {
  if (!user) return;
  try {
    if (user.role === 'doctor' && user.doctorId != null) {
      const cases = await medicalCaseService.getByDoctor(user.doctorId);
      setSidebarBadge('#/doctor/cases', cases.filter((c) => c.status === 'cotizacion enviada').length);
    } else if (user.role === 'company' && user.companyId != null) {
      const requests = await requestService.getByCompany(user.companyId);
      // Mismo criterio que el KPI "Activas" de Mis solicitudes: operacion viva
      // (todo lo que no esta finalizada ni cancelada).
      const active = requests.filter((r) => !['finalizada', 'cancelada'].includes(r.status)).length;
      setSidebarBadge('#/company/requests', active);
    }
  } catch {
    // Silencioso: la burbuja es informativa, no debe romper la navegacion.
  }
}

function setSidebarBadge(hash, count) {
  const el = document.querySelector(`.sidebar__badge[data-badge-hash="${hash}"]`);
  if (!el) return;
  if (count > 0) {
    el.textContent = String(count);
    el.hidden = false;
    el.setAttribute('aria-label', `${count} pendiente${count === 1 ? '' : 's'} por revisar`);
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

const FOOTER_SUBTITLE = {
  admin:   'Panel Administrativo',
  doctor:  'Medicos y Clinicas',
  company: 'Plataforma corporativa',
};

function renderSidebarShell(role, links) {
  const subtitle = FOOTER_SUBTITLE[role] || 'Plataforma de viajes';
  return `
    <aside class="sidebar sidebar--${escapeHtml(role)}" id="sidebar">
      <div class="sidebar__brand">
        <img src="${logoCs}" alt="" class="sidebar__logo" />
        <p class="sidebar__brand-name">CS Travel Group</p>
        <p class="sidebar__brand-subtitle">Plataforma de viajes corporativos</p>
      </div>
      <nav class="sidebar__nav">
        ${links}
      </nav>
      <div class="sidebar__footer">
        <p>CS Travel Group</p>
        <p class="sidebar__muted">${subtitle}</p>
      </div>
    </aside>
  `;
}
