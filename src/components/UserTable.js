/**
 * UserTable.js
 * =============================================================================
 * PROPOSITO:
 *   Tabla de usuarios estilo "data table" moderna (inspirada en shadcn/ui):
 *   avatar con iniciales, nombre + correo apilados, rol como badge outline,
 *   estado como badge de color, y un menu de acciones (⋮) por fila.
 *
 * INTERACCION (delegada en AdminUsersView):
 *   - th ordenable:       data-action="sort-users"
 *   - abrir menu fila:    data-action="toggle-menu"
 *   - acciones del menu:  data-action="user-view" | "user-toggle" | "user-delete"
 *   - fila clicable:      data-href="#/admin/users/:id"
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/formatDate.js';
import { StatusBadge } from './StatusBadge.js';

const ROLE_LABEL = {
  admin: 'Admin',
  company: 'Empresa',
  doctor: 'Medico',
};

/** Iniciales para el avatar: "Sara Gomez" -> "SG". */
function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?';
}

export function UserTable(users, { companiesMap = {}, doctorsMap = {}, sortDir = 'asc' } = {}) {
  if (!users || users.length === 0) {
    return `<p class="empty-state">No hay usuarios que coincidan con los filtros.</p>`;
  }

  const rows = users
    .map((user) => {
      const related = user.role === 'company'
        ? companiesMap[user.companyId] || 'Sin empresa'
        : user.role === 'doctor'
          ? doctorsMap[user.doctorId] || 'Sin medico'
          : 'CS Travel';

      const toggleLabel = user.status === 'active' ? 'Desactivar' : 'Activar';

      return `
        <tr class="clickable-row" data-href="#/admin/users/${user.id}">
          <td>
            <div class="user-cell">
              <span class="avatar">${escapeHtml(initials(user.name))}</span>
              <div>
                <strong>${escapeHtml(user.name)}</strong>
                <span class="muted-block">${escapeHtml(user.email)}</span>
              </div>
            </div>
          </td>
          <td><span class="badge badge--outline">${escapeHtml(ROLE_LABEL[user.role] || user.role)}</span></td>
          <td>${escapeHtml(related)}</td>
          <td>${StatusBadge(user.status || 'pending')}</td>
          <td>${user.lastLogin ? formatDate(user.lastLogin, true) : '<span class="muted">Sin ingreso</span>'}</td>
          <td>
            <div class="menu-wrap">
              <button type="button" class="menu-btn" data-action="toggle-menu" aria-label="Acciones">⋮</button>
              <div class="menu">
                <button type="button" class="menu__item" data-action="user-view" data-id="${user.id}">Ver detalle</button>
                <button type="button" class="menu__item" data-action="user-toggle" data-id="${user.id}">${toggleLabel}</button>
                <div class="menu__divider"></div>
                <button type="button" class="menu__item menu__item--danger" data-action="user-delete" data-id="${user.id}">Eliminar</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  const arrow = sortDir === 'asc' ? '↑' : '↓';

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th><button type="button" class="th-sort" data-action="sort-users">Usuario <span>${arrow}</span></button></th>
            <th>Rol</th>
            <th>Perfil asociado</th>
            <th>Estado</th>
            <th>Ultimo acceso</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
