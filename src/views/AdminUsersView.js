/**
 * AdminUsersView.js
 * =============================================================================
 * PROPOSITO:
 *   Gestion de usuarios del sistema con una data table moderna:
 *   - Busqueda por nombre/correo + filtros de rol y estado.
 *   - Ordenamiento por nombre (clic en encabezado).
 *   - Paginacion en cliente (filas por pagina + navegacion).
 *   - Menu de acciones por fila (ver detalle, activar/desactivar, eliminar).
 *   - Creacion de usuario en un modal.
 *
 * NOTA:
 *   Toda la interaccion se delega en un unico listener sobre el contenedor de
 *   la vista (#users-page), de modo que sobrevive a los re-renders de la tabla.
 * =============================================================================
 */

import { userService, USER_ROLES, USER_STATUSES, canonicalRole } from '../services/userService.js';
import { companyService } from '../services/companyService.js';
import { doctorService } from '../services/doctorService.js';
import { UserTable } from '../components/UserTable.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { isNotEmpty, isValidEmail } from '../utils/validators.js';
import { navigate } from '../router/router.js';
import { isDeployedBundle } from '../utils/env.js';

const ROLE_LABEL = { admin: 'Admin', company: 'Empresa', empresa: 'Empresa', doctor: 'Medico', medico: 'Medico' };
const STATUS_LABEL = { active: 'Activos', inactive: 'Inactivos', pending: 'Pendientes' };

// Estado de la vista (filtros, orden y pagina actuales).
const state = {
  query: '',
  role: 'todos',
  status: 'todos',
  sortDir: 'asc',
  page: 1,
  perPage: 10,
};

let cachedUsers = [];
let companiesMap = {};
let doctorsMap = {};

export const AdminUsersView = {
  async render() {
    const [users, companies, doctors] = await Promise.all([
      userService.getAll(),
      companyService.getAll(),
      doctorService.getAll(),
    ]);

    cachedUsers = users;
    companiesMap = Object.fromEntries(companies.map((company) => [company.id, company.name]));
    doctorsMap = Object.fromEntries(doctors.map((doctor) => [doctor.id, doctor.clinicName]));

    // Al entrar a la vista partimos de la primera pagina.
    state.page = 1;

    const roleOptions = USER_ROLES
      .map((role) => `<option value="${role}" ${state.role === role ? 'selected' : ''}>${ROLE_LABEL[role] || role}</option>`)
      .join('');
    const statusOptions = USER_STATUSES
      .map((status) => `<option value="${status}" ${state.status === status ? 'selected' : ''}>${STATUS_LABEL[status] || status}</option>`)
      .join('');
    const companyOptions = companies
      .map((company) => `<option value="${company.id}">${escapeHtml(company.name)}</option>`)
      .join('');
    const doctorOptions = doctors
      .map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.clinicName)}</option>`)
      .join('');

    // En el portal real el alta crea el miembro en Wix y envia el correo de
    // activacion; el modal es mas simple. En local (demo) se mantiene el modal
    // completo que escribe en json-server/localStorage.
    const real = isDeployedBundle();

    return `
      <div id="users-page">
        <div class="page-header">
          <div>
            <h1 class="page-title">Usuarios</h1>
            <p class="page-subtitle">Crea accesos, asigna roles y administra el estado de cada usuario.</p>
          </div>
          <button class="btn btn--primary" data-action="open-user-modal">+ Nuevo usuario</button>
        </div>

        <section class="panel">
          <div class="table-toolbar">
            <input id="user-search" class="form__input table-toolbar__search" type="search"
              placeholder="Buscar por nombre o correo..." value="${escapeHtml(state.query)}" />
            <select id="user-role-filter" class="form__input table-toolbar__select">
              <option value="todos">Rol: todos</option>
              ${roleOptions}
            </select>
            <select id="user-status-filter" class="form__input table-toolbar__select">
              <option value="todos">Estado: todos</option>
              ${statusOptions}
            </select>
            <div class="table-toolbar__spacer"></div>
            <span class="table-toolbar__count" id="users-count"></span>
          </div>
          <div id="users-table"></div>
        </section>

        <!-- Modal: crear usuario -->
        <div class="modal-overlay" id="user-modal">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
            <div class="modal__header">
              <div>
                <h2 class="modal__title" id="user-modal-title">Crear usuario</h2>
                <p class="modal__subtitle">${real
                  ? 'Se enviara un correo para que la persona cree su propia contrasena y active su cuenta.'
                  : 'El usuario recibira una contrasena temporal y debera cambiarla al ingresar.'}</p>
              </div>
              <button type="button" class="modal__close" data-action="close-user-modal" aria-label="Cerrar">✕</button>
            </div>
            <form id="user-form" class="form form--grid" novalidate>
              <div class="form__group">
                <label class="form__label">Nombre completo *</label>
                <input type="text" name="name" class="form__input" placeholder="Ej: Dra. Valentina Rios" />
                <small class="form__error" data-error-for="name"></small>
              </div>
              <div class="form__group">
                <label class="form__label">Correo *</label>
                <input type="email" name="email" class="form__input" placeholder="persona@correo.com" />
                <small class="form__error" data-error-for="email"></small>
              </div>
              <div class="form__group">
                <label class="form__label">Rol *</label>
                <select name="role" class="form__input">
                  ${real
                    ? `<option value="medico">Medico / Clinica</option>
                       <option value="empresa">Empresa</option>
                       <option value="admin">Administrador</option>`
                    : `<option value="company">Empresa</option>
                       <option value="doctor">Medico</option>
                       <option value="admin">Admin</option>`}
                </select>
              </div>
              <div class="form__group">
                <label class="form__label">Telefono (opcional)</label>
                <input type="tel" name="phone" class="form__input" placeholder="Ej: +57 300 123 4567" />
              </div>
              ${real ? '' : `
              <div class="form__group">
                <label class="form__label">Estado</label>
                <select name="status" class="form__input">
                  <option value="pending">Pendiente</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
              <div class="form__group">
                <label class="form__label">Empresa asociada</label>
                <select name="companyId" class="form__input">
                  <option value="">No aplica</option>
                  ${companyOptions}
                </select>
                <small class="form__error" data-error-for="companyId"></small>
              </div>
              <div class="form__group">
                <label class="form__label">Medico asociado</label>
                <select name="doctorId" class="form__input">
                  <option value="">No aplica</option>
                  ${doctorOptions}
                </select>
                <small class="form__error" data-error-for="doctorId"></small>
              </div>
              <div class="form__group">
                <label class="form__label">Contrasena temporal</label>
                <input type="text" name="password" class="form__input" value="Temporal123" />
              </div>
              <div class="form__group">
                <span class="form__label">Configuracion inicial</span>
                <label class="checkbox"><input type="checkbox" name="firstLoginRequired" checked /> <span>Requiere cambio inicial</span></label>
              </div>
              <div class="form__group form__group--full">
                <label class="form__label">Observaciones internas</label>
                <textarea name="internalNotes" class="form__input" rows="3"></textarea>
              </div>
              `}
              <div class="form__alert form__group--full" id="user-alert" hidden></div>
              <div class="form__actions form__group--full">
                <button type="button" class="btn btn--ghost" data-action="close-user-modal">Cancelar</button>
                <button type="submit" class="btn btn--primary">${real ? 'Crear usuario y enviar invitacion' : 'Crear usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  },

  async afterRender() {
    const page = document.getElementById('users-page');
    const search = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');
    const statusFilter = document.getElementById('user-status-filter');
    const tableContainer = document.getElementById('users-table');
    const countLabel = document.getElementById('users-count');
    const modal = document.getElementById('user-modal');

    /** Aplica filtros + orden y devuelve la lista resultante. */
    const getFiltered = () => {
      const q = state.query.trim().toLowerCase();
      const filtered = cachedUsers.filter((user) => {
        const byText = [user.name, user.email].some((value) => String(value || '').toLowerCase().includes(q));
        const byRole = state.role === 'todos' || canonicalRole(user.role) === canonicalRole(state.role);
        const byStatus = state.status === 'todos' || user.status === state.status;
        return byText && byRole && byStatus;
      });
      filtered.sort((a, b) => {
        const cmp = String(a.name).localeCompare(String(b.name), 'es');
        return state.sortDir === 'asc' ? cmp : -cmp;
      });
      return filtered;
    };

    /** Re-renderiza tabla + paginacion segun el estado actual. */
    const renderTable = () => {
      const filtered = getFiltered();
      const totalPages = Math.max(1, Math.ceil(filtered.length / state.perPage));
      state.page = Math.min(state.page, totalPages);
      const start = (state.page - 1) * state.perPage;
      const pageItems = filtered.slice(start, start + state.perPage);

      countLabel.textContent = `${filtered.length} de ${cachedUsers.length} usuario(s)`;

      tableContainer.innerHTML = `
        ${UserTable(pageItems, { companiesMap, doctorsMap, sortDir: state.sortDir })}
        <div class="table-footer">
          <span class="table-footer__info">Mostrando ${filtered.length === 0 ? 0 : start + 1}–${start + pageItems.length} de ${filtered.length}</span>
          <div class="pagination">
            <span class="pagination__label">Filas por pagina</span>
            <select class="form__input pagination__select" data-action-change="per-page">
              ${[5, 10, 20].map((n) => `<option value="${n}" ${state.perPage === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
            <span class="pagination__label">Pagina ${state.page} de ${totalPages}</span>
            <button type="button" class="page-btn" data-action="page-prev" ${state.page <= 1 ? 'disabled' : ''}>‹</button>
            <button type="button" class="page-btn" data-action="page-next" ${state.page >= totalPages ? 'disabled' : ''}>›</button>
          </div>
        </div>
      `;
    };

    /** Recarga usuarios desde la API y re-renderiza (tras crear/editar/eliminar). */
    const refreshData = async () => {
      cachedUsers = await userService.getAll();
      renderTable();
    };

    const closeMenus = () => {
      page.querySelectorAll('.menu.is-open').forEach((menu) => menu.classList.remove('is-open'));
    };

    // --- Filtros ---
    search.addEventListener('input', () => {
      state.query = search.value;
      state.page = 1;
      renderTable();
    });
    roleFilter.addEventListener('change', () => {
      state.role = roleFilter.value;
      state.page = 1;
      renderTable();
    });
    statusFilter.addEventListener('change', () => {
      state.status = statusFilter.value;
      state.page = 1;
      renderTable();
    });

    // --- Cambio de "filas por pagina" (delegado porque la tabla se re-renderiza) ---
    page.addEventListener('change', (event) => {
      const select = event.target.closest('[data-action-change="per-page"]');
      if (select) {
        state.perPage = Number(select.value);
        state.page = 1;
        renderTable();
      }
    });

    // --- Clics delegados (menus, paginacion, orden, modal, acciones de fila) ---
    page.addEventListener('click', async (event) => {
      const actionEl = event.target.closest('[data-action]');

      // Clic fuera de un menu abierto -> cerrarlo.
      if (!actionEl || actionEl.dataset.action !== 'toggle-menu') {
        if (!event.target.closest('.menu')) closeMenus();
      }
      if (!actionEl) return;

      const { action, id } = actionEl.dataset;
      const user = id ? cachedUsers.find((u) => String(u.id) === String(id)) : null;

      switch (action) {
        case 'toggle-menu': {
          event.stopPropagation();
          const menu = actionEl.nextElementSibling;
          const wasOpen = menu.classList.contains('is-open');
          closeMenus();
          if (!wasOpen) menu.classList.add('is-open');
          break;
        }

        case 'sort-users':
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          renderTable();
          break;

        case 'page-prev':
          state.page = Math.max(1, state.page - 1);
          renderTable();
          break;

        case 'page-next':
          state.page += 1;
          renderTable();
          break;

        case 'user-view':
          navigate(`#/admin/users/${id}`);
          break;

        case 'user-toggle': {
          if (!user) return;
          closeMenus();
          // Al desactivar exigimos un motivo (queda registrado para auditoria).
          let reason = '';
          if (user.status === 'active') {
            const input = window.prompt(
              `Motivo para desactivar a "${user.name}" (p. ej. incumplimiento de contrato):`,
              ''
            );
            if (input === null) return; // el admin cancelo
            reason = input.trim();
            if (!reason) {
              window.alert('Debes indicar un motivo para desactivar al usuario.');
              return;
            }
          }
          try {
            await userService.toggleStatus(user, reason);
            await refreshData();
          } catch (error) {
            window.alert(`No se pudo cambiar el estado: ${error.message}`);
          }
          break;
        }

        case 'user-delete':
          if (!user) return;
          closeMenus();
          if (!window.confirm(`¿Eliminar al usuario "${user.name}"? Esta accion no se puede deshacer.`)) return;
          try {
            await userService.remove(user.id);
            await refreshData();
          } catch (error) {
            window.alert(`No se pudo eliminar el usuario: ${error.message}`);
          }
          break;

        case 'open-user-modal':
          modal.classList.add('is-open');
          modal.querySelector('input[name="name"]')?.focus();
          break;

        case 'close-user-modal':
          modal.classList.remove('is-open');
          break;
      }
    });

    // Cerrar el modal al hacer clic en el fondo oscuro.
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.remove('is-open');
    });

    // --- Formulario de creacion ---
    const form = document.getElementById('user-form');
    const alert = document.getElementById('user-alert');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
      alert.hidden = true;

      // --- Portal real: crea el miembro en Wix y envia el correo de activacion.
      if (isDeployedBundle()) {
        const fullName = form.name.value.trim();
        const email = form.email.value.trim();
        const role = form.role.value;
        const phone = form.phone ? form.phone.value.trim() : '';

        const errs = {};
        if (!isNotEmpty(fullName)) errs.name = 'El nombre es obligatorio.';
        if (!isNotEmpty(email)) errs.email = 'El correo es obligatorio.';
        else if (!isValidEmail(email)) errs.email = 'El correo no tiene un formato valido.';
        if (Object.keys(errs).length > 0) {
          Object.entries(errs).forEach(([field, message]) => {
            const el = form.querySelector(`[data-error-for="${field}"]`);
            if (el) el.textContent = message;
          });
          alert.textContent = 'Revisa los campos requeridos.';
          alert.hidden = false;
          return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creando...';
        try {
          const res = await fetch('/api/admin-create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, role, phone }),
          });
          const result = await res.json();
          if (result.ok) {
            alert.className = 'form__alert form__alert--success form__group--full';
            alert.textContent = result.emailSent
              ? `Usuario creado. Se envio el correo de activacion a ${email}.`
              : 'Usuario creado, pero el correo no se pudo enviar. La persona puede usar "Olvidaste tu contrasena?" para activar su cuenta.';
            alert.hidden = false;
            form.reset();
            setTimeout(() => {
              modal.classList.remove('is-open');
              alert.hidden = true;
              alert.className = 'form__alert form__group--full';
            }, 1800);
          } else {
            alert.className = 'form__alert form__group--full';
            alert.textContent = result.error || 'No se pudo crear el usuario.';
            alert.hidden = false;
          }
        } catch (error) {
          alert.className = 'form__alert form__group--full';
          alert.textContent = 'Error de conexion. Intenta de nuevo.';
          alert.hidden = false;
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Crear usuario y enviar invitacion';
        }
        return;
      }

      // --- Demo local (json-server / localStorage) ---
      const data = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value.trim(),
        role: form.role.value,
        profileType: form.role.value,
        companyId: form.role.value === 'company' ? form.companyId.value : '',
        doctorId: form.role.value === 'doctor' ? form.doctorId.value : '',
        status: form.status.value,
        firstLoginRequired: form.firstLoginRequired.checked,
        internalNotes: form.internalNotes.value.trim(),
      };

      const errors = {};
      if (!isNotEmpty(data.name)) errors.name = 'El nombre es obligatorio.';
      if (!isNotEmpty(data.email)) errors.email = 'El correo es obligatorio.';
      else if (!isValidEmail(data.email)) errors.email = 'El correo no tiene un formato valido.';
      if (data.role === 'company' && !data.companyId) errors.companyId = 'Selecciona una empresa.';
      if (data.role === 'doctor' && !data.doctorId) errors.doctorId = 'Selecciona un medico.';

      if (Object.keys(errors).length > 0) {
        Object.entries(errors).forEach(([field, message]) => {
          const el = form.querySelector(`[data-error-for="${field}"]`);
          if (el) el.textContent = message;
        });
        alert.textContent = 'Revisa los campos requeridos.';
        alert.hidden = false;
        return;
      }

      try {
        await userService.create(data);
        form.reset();
        modal.classList.remove('is-open');
        await refreshData();
      } catch (error) {
        alert.textContent = `No se pudo crear el usuario: ${error.message}`;
        alert.hidden = false;
      }
    });

    renderTable();
  },
};
