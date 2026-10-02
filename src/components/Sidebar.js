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
import { isDeployedBundle } from '../utils/env.js';
import { isTemporaryAlly, partnerRoute } from '../utils/allyOnboarding.js';
import { authService } from '../services/authService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { requestService } from '../services/requestService.js';
import { eventService } from '../services/eventService.js';
import logoCs from '../assets/logo-cs.png';

/**
 * Iconos SVG de linea (estilo del mockup): trazo limpio, heredan el color del
 * texto via currentColor. Reemplazan a los antiguos glifos unicode.
 */
const NAV_ICONS = {
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  handshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l2 2a1 1 0 1 0 3-3"/><path d="M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="M21 3l1 11h-2"/><path d="M3 3L2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
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
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/></svg>',
};

// Definicion de los enlaces por rol. Cada item: { label, hash, icon }.
const MENU_BY_ROLE = {
  // Menu del admin agrupado (docs/GUIA-DE-ESTILO.md). Varias paginas viven
  // dentro de una seccion con pestañas (SectionTabs.js): cada entrada se marca
  // activa en todas sus rutas con `match`. `group` pone un rotulo encima.
  admin: [
    { label: 'Panel', hash: '#/admin/dashboard', icon: 'dashboard' },
    { group: 'Operación', label: 'Operaciones', hash: '#/admin/requests', icon: 'plane', match: ['#/admin/requests', '#/admin/medical-cases', '#/admin/kanban', '#/admin/quotes'] },
    // demoOnly: lo contrario de deployedOnly. Eventos aun no tiene backend en el
    // portal real (sus colecciones caerian al localStorage del navegador).
    { label: 'Eventos', hash: '#/admin/events', icon: 'calendar', demoOnly: true },
    { group: 'Clientes', label: 'Aliados', hash: '#/admin/allies', icon: 'handshake', match: ['#/admin/allies', '#/admin/companies', '#/admin/doctors', '#/admin/codes'] },
    { label: 'Cobros', hash: '#/admin/payments', icon: 'card' },
    { group: 'Contenido', label: 'Comunicación', hash: '#/admin/banners', icon: 'mail', match: ['#/admin/banners', '#/admin/emails'] },
    { group: 'Sistema', label: 'Usuarios', hash: '#/admin/users', icon: 'users' },
    { label: 'Configuración', hash: '#/admin/settings', icon: 'settings' },
  ],
  company: [
    { label: 'Dashboard', hash: '#/company/dashboard', icon: 'dashboard' },
    { label: 'Mis solicitudes', hash: '#/company/requests', icon: 'plane', badge: true },
    { label: 'Mi convenio', hash: '#/company/partner', icon: 'handshake' },
    // "Nueva solicitud" se quitó del menú: el botón flotante "+" (abajo a la
    // derecha) hace exactamente lo mismo. La ruta #/company/requests/new sigue.
  ],
  doctor: [
    { label: 'Dashboard', hash: '#/doctor/dashboard', icon: 'dashboard' },
    { label: 'Mis casos', hash: '#/doctor/cases', icon: 'clipboard', badge: true },
    { label: 'Mi convenio', hash: '#/doctor/partner', icon: 'handshake' },
  ],
  // Organizador de un evento (novios, comite de padres, Talento Humano).
  // «Invitar» se oculta si su permiso en el evento es 'lectura' (updateSidebarBadges).
  event: [
    { label: 'Inicio', hash: '#/event/dashboard', icon: 'dashboard' },
    { label: 'Personas', hash: '#/event/people', icon: 'users', badge: true },
    { label: 'Dinero', hash: '#/event/money', icon: 'card' },
    { label: 'Invitar', hash: '#/event/invite', icon: 'mail' },
  ],
};

/**
 * Sidebar()
 * @param {string} role        - Rol del usuario ("admin" | "company").
 * @param {string} currentHash - Hash de la ruta actual, para marcar el activo.
 * @returns {string} HTML del menu lateral.
 */
export function Sidebar(role, currentHash) {
  // Los items marcados `deployedOnly` solo existen en el portal real (en el demo
  // de GitHub Pages esas paginas no existen).
  // Un aliado con acceso temporal solo ve su expediente ("Mi convenio").
  const temporary = isTemporaryAlly(authService.getSession());
  const items = (MENU_BY_ROLE[role] || [])
    .filter((item) => !item.deployedOnly || isDeployedBundle())
    .filter((item) => !item.demoOnly || !isDeployedBundle())
    .filter((item) => !temporary || item.hash === partnerRoute(role));

  // Generamos un <a> por cada item. La clase "is-active" resalta el actual.
  const links = items
    .map((item) => {
      // Consideramos activo si el hash actual empieza por el del item.
      // - item.match: lista de prefijos que activan el item (ej. "Operaciones"
      //   abarca solicitudes y casos medicos).
      // - "new" comparte prefijo con su listado, asi que se compara exacto.
      // Enlace a una pagina fuera del SPA: sale del router por completo.
      if (item.url) {
        return `
        <a href="${escapeHtml(item.url)}" class="sidebar__link">
          <span class="sidebar__icon" aria-hidden="true">${NAV_ICONS[item.icon] || ''}</span>
          <span class="sidebar__label">${escapeHtml(item.label)}</span>
        </a>
      `;
      }

      const itemAttr = item.hash === '#/event/invite' ? ' data-event-invite' : '';
      const isActive = item.match
        ? item.match.some((m) => currentHash.startsWith(m))
        : item.hash.endsWith('/new')
          ? currentHash === item.hash
          // El listado NO se activa en su ruta hija "/new" (esa tiene su propio item).
          : currentHash.startsWith(item.hash) && !currentHash.endsWith('/new');

      const badge = item.badge
        ? `<span class="sidebar__badge" data-badge-hash="${escapeHtml(item.hash)}" hidden></span>`
        : '';

      // Rotulo de grupo (solo admin): separa Operacion, Clientes, Contenido y Sistema.
      const groupLabel = item.group ? `<p class="sidebar__group">${escapeHtml(item.group)}</p>` : '';

      return `${groupLabel}
        <a href="${escapeHtml(item.hash)}" class="sidebar__link ${isActive ? 'is-active' : ''}"${itemAttr}>
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
    } else if (user.role === 'event') {
      // Organizador: cuentas atrasadas del evento activo (?e= o el ultimo usado).
      const events = await eventService.getForOrganizer(user.id);
      if (!events.length) return;
      const requested = new URLSearchParams((window.location.hash.split('?')[1]) || '').get('e')
        || eventService.recallCurrentEvent();
      const event = events.find((e) => String(e.id) === String(requested)) || events[0];
      const data = await eventService.getEventView(event.id, { actor: user });
      const late = data.summary.byStatus.atrasado || 0;
      setSidebarBadge('#/event/people', late, `${late} ${late === 1 ? 'cuenta atrasada' : 'cuentas atrasadas'}`);
      // Con permiso de solo lectura no se invita: el item «Invitar» sobra.
      if (data.permission === 'lectura') document.querySelector('[data-event-invite]')?.remove();
    }
  } catch {
    // Silencioso: la burbuja es informativa, no debe romper la navegacion.
  }
}

function setSidebarBadge(hash, count, label = '') {
  const el = document.querySelector(`.sidebar__badge[data-badge-hash="${hash}"]`);
  if (!el) return;
  if (count > 0) {
    el.textContent = String(count);
    el.hidden = false;
    el.setAttribute('aria-label', label || `${count} pendiente${count === 1 ? '' : 's'} por revisar`);
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

const FOOTER_SUBTITLE = {
  admin:   'Panel Administrativo',
  doctor:  'Medicos y Clinicas',
  company: 'Plataforma corporativa',
  event:   'Eventos y grupos',
};

function renderSidebarShell(role, links) {
  const subtitle = FOOTER_SUBTITLE[role] || 'Plataforma de viajes';
  return `
    <aside class="sidebar sidebar--${escapeHtml(role)}" id="sidebar">
      <div class="sidebar__brand">
        <img src="${escapeHtml(logoCs)}" alt="" class="sidebar__logo" />
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
