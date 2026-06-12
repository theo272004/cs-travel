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
import logoCs from '../assets/logo-cs.png';

// Definicion de los enlaces por rol. Cada item: { label, hash, icon }.
const MENU_BY_ROLE = {
  admin: [
    { label: 'Dashboard', hash: '#/admin/dashboard', icon: '◧' },
    { label: 'Usuarios', hash: '#/admin/users', icon: '◉' },
    { label: 'Empresas', hash: '#/admin/companies', icon: '◰' },
    { label: 'Medicos', hash: '#/admin/doctors', icon: '✚' },
    { label: 'Solicitudes', hash: '#/admin/requests', icon: '✈' },
    { label: 'Casos medicos', hash: '#/admin/medical-cases', icon: '▣' },
    { label: 'Seguimiento', hash: '#/admin/kanban', icon: '▥' },
  ],
  company: [
    { label: 'Dashboard', hash: '#/company/dashboard', icon: '◧' },
    { label: 'Mis solicitudes', hash: '#/company/requests', icon: '✈' },
    { label: 'Nueva solicitud', hash: '#/company/requests/new', icon: '＋' },
  ],
  doctor: [
    { label: 'Dashboard', hash: '#/doctor/dashboard', icon: '◧' },
    { label: 'Mis casos', hash: '#/doctor/cases', icon: '▣' },
    { label: 'Nuevo caso', hash: '#/doctor/cases/new', icon: '＋' },
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
      // Excepcion: "nueva" y "mis solicitudes" comparten prefijo, asi que
      // comparamos de forma exacta cuando el item es la ruta "new".
      const isActive = item.hash.endsWith('/new')
        ? currentHash === item.hash
        : currentHash.startsWith(item.hash);

      return `
        <a href="${item.hash}" class="sidebar__link ${isActive ? 'is-active' : ''}">
          <span class="sidebar__icon">${escapeHtml(item.icon)}</span>
          <span class="sidebar__label">${escapeHtml(item.label)}</span>
        </a>
      `;
    })
    .join('');

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar__brand">
        <img src="${logoCs}" alt="" class="sidebar__logo" />
        <p class="sidebar__brand-name">CS Travel</p>
        <p class="sidebar__brand-subtitle">Plataforma de viajes corporativos</p>
      </div>
      <nav class="sidebar__nav">
        ${links}
      </nav>
      <div class="sidebar__footer">
        <p>CS Travel · Etapa 1</p>
        <p class="sidebar__muted">Empresas y Medicos</p>
      </div>
    </aside>
  `;
}
