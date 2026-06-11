import { userService, USER_ROLES, USER_STATUSES } from '../services/userService.js';
import { companyService } from '../services/companyService.js';
import { doctorService } from '../services/doctorService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

export const AdminUserDetailView = {
  async render(ctx) {
    const { id } = ctx.params;
    const [user, companies, doctors] = await Promise.all([
      userService.getById(id),
      companyService.getAll(),
      doctorService.getAll(),
    ]);

    const roleOptions = USER_ROLES
      .map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${role}</option>`)
      .join('');
    const statusOptions = USER_STATUSES
      .map((status) => `<option value="${status}" ${status === user.status ? 'selected' : ''}>${status}</option>`)
      .join('');
    const companyOptions = `<option value="">No aplica</option>` + companies
      .map((company) => `<option value="${company.id}" ${company.id === user.companyId ? 'selected' : ''}>${escapeHtml(company.name)}</option>`)
      .join('');
    const doctorOptions = `<option value="">No aplica</option>` + doctors
      .map((doctor) => `<option value="${doctor.id}" ${doctor.id === user.doctorId ? 'selected' : ''}>${escapeHtml(doctor.clinicName)}</option>`)
      .join('');
    const welcome = userService.getWelcomeEmail(user);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(user.name)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(user.status || 'pending')}
            <span class="chip">${escapeHtml(user.role)}</span>
            <span class="muted">Creado: ${formatDate(user.createdAt, true)}</span>
          </p>
        </div>
        <a href="#/admin/users" class="btn btn--ghost">← Volver</a>
      </div>

      <section class="panel">
        <h2 class="panel__title">Datos de acceso</h2>
        <form id="user-edit-form" class="form form--grid">
          <div class="form__group">
            <label class="form__label">Nombre</label>
            <input type="text" name="name" class="form__input" value="${escapeHtml(user.name)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Correo</label>
            <input type="email" name="email" class="form__input" value="${escapeHtml(user.email)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Rol</label>
            <select name="role" class="form__input">${roleOptions}</select>
          </div>
          <div class="form__group">
            <label class="form__label">Estado</label>
            <select name="status" class="form__input">${statusOptions}</select>
          </div>
          <div class="form__group">
            <label class="form__label">Empresa asociada</label>
            <select name="companyId" class="form__input">${companyOptions}</select>
          </div>
          <div class="form__group">
            <label class="form__label">Medico asociado</label>
            <select name="doctorId" class="form__input">${doctorOptions}</select>
          </div>
          <div class="form__group">
            <span class="form__label">Configuracion inicial</span>
            <label class="checkbox">
              <input type="checkbox" name="firstLoginRequired" ${user.firstLoginRequired ? 'checked' : ''} />
              <span>Requiere cambio inicial</span>
            </label>
          </div>
          <div class="form__group">
            <label class="form__label">Ultimo acceso</label>
            <input type="text" class="form__input" value="${user.lastLogin ? formatDate(user.lastLogin, true) : 'Sin ingreso'}" disabled />
          </div>
          <div class="form__group form__group--full">
            <label class="form__label">Observaciones internas</label>
            <textarea name="internalNotes" class="form__input" rows="3">${escapeHtml(user.internalNotes || '')}</textarea>
          </div>
          <div class="form__alert form__group--full" id="user-edit-alert" hidden></div>
          <div class="form__actions form__group--full">
            <button type="button" class="btn btn--ghost" id="toggle-user-status">${user.status === 'active' ? 'Desactivar' : 'Activar'}</button>
            <button type="submit" class="btn btn--primary">Guardar cambios</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <h2 class="panel__title">Correo de bienvenida</h2>
        <p class="panel__footnote">Plantilla lista para copiar o implementar con triggered emails de Wix/Velo.</p>
        <div class="form form--grid">
          <div class="form__group form__group--full">
            <label class="form__label">Asunto</label>
            <input class="form__input" value="${escapeHtml(welcome.subject)}" readonly />
          </div>
          <div class="form__group form__group--full">
            <label class="form__label">Mensaje</label>
            <textarea class="form__input" rows="10" readonly>${escapeHtml(welcome.body)}</textarea>
          </div>
        </div>
      </section>
    `;
  },

  async afterRender(ctx) {
    const { id } = ctx.params;
    const form = document.getElementById('user-edit-form');
    const alert = document.getElementById('user-edit-alert');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;

      const role = form.role.value;
      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        role,
        profileType: role,
        status: form.status.value,
        companyId: role === 'company' && form.companyId.value ? Number(form.companyId.value) : null,
        doctorId: role === 'doctor' && form.doctorId.value ? Number(form.doctorId.value) : null,
        firstLoginRequired: form.firstLoginRequired.checked,
        internalNotes: form.internalNotes.value.trim(),
      };

      try {
        await userService.update(id, payload);
        alert.textContent = 'Usuario actualizado correctamente.';
        alert.className = 'form__alert form__alert--success';
        alert.hidden = false;
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 600);
      } catch (error) {
        alert.textContent = `Error al guardar: ${error.message}`;
        alert.className = 'form__alert';
        alert.hidden = false;
      }
    });

    document.getElementById('toggle-user-status').addEventListener('click', async () => {
      const user = await userService.getById(id);
      await userService.toggleStatus(user);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  },
};
