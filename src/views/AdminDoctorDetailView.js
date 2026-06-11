import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

export const AdminDoctorDetailView = {
  async render(ctx) {
    const { id } = ctx.params;
    const [doctor, cases] = await Promise.all([
      doctorService.getById(id),
      medicalCaseService.getByDoctor(id),
    ]);

    const toggleLabel = doctor.status === 'active' ? 'Desactivar' : 'Activar';

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(doctor.clinicName)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(doctor.status)}
            <span class="chip">${escapeHtml(doctor.name)}</span>
            <span class="chip">Codigo: ${escapeHtml(doctor.sharedCode)}</span>
            <span class="muted">Actualizado: ${formatDate(doctor.lastUpdate, true)}</span>
          </p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--ghost" id="toggle-doctor-status">${toggleLabel}</button>
          <a href="#/admin/doctors" class="btn btn--ghost">← Volver</a>
        </div>
      </div>

      <section class="panel">
        <h2 class="panel__title">Datos y metricas del medico</h2>
        <form id="doctor-edit-form" class="form form--grid">
          <div class="form__group">
            <label class="form__label">Nombre del medico</label>
            <input type="text" name="name" class="form__input" value="${escapeHtml(doctor.name)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Clinica / consultorio</label>
            <input type="text" name="clinicName" class="form__input" value="${escapeHtml(doctor.clinicName)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Especialidad</label>
            <input type="text" name="specialty" class="form__input" value="${escapeHtml(doctor.specialty)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Email</label>
            <input type="email" name="email" class="form__input" value="${escapeHtml(doctor.email)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Telefono</label>
            <input type="text" name="phone" class="form__input" value="${escapeHtml(doctor.phone)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Codigo compartido</label>
            <input type="text" name="sharedCode" class="form__input" value="${escapeHtml(doctor.sharedCode)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Casos registrados</label>
            <input type="number" name="totalCases" class="form__input" value="${doctor.totalCases}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Casos activos</label>
            <input type="number" name="activeCases" class="form__input" value="${doctor.activeCases}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Logistica estimada</label>
            <input type="number" name="estimatedLogistics" class="form__input" value="${doctor.estimatedLogistics}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Margen estimado</label>
            <input type="number" name="estimatedMargin" class="form__input" value="${doctor.estimatedMargin}" min="0" />
          </div>
          <div class="form__alert form__group--full" id="doctor-edit-alert" hidden></div>
          <div class="form__actions form__group--full">
            <button type="submit" class="btn btn--primary">Guardar cambios</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Casos del medico</h2>
        </div>
        ${MedicalCaseTable(cases, { detailBase: '#/admin/medical-cases' })}
      </section>
    `;
  },

  async afterRender(ctx) {
    const { id } = ctx.params;
    const form = document.getElementById('doctor-edit-form');
    const alert = document.getElementById('doctor-edit-alert');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;

      const payload = {
        name: form.name.value.trim(),
        clinicName: form.clinicName.value.trim(),
        specialty: form.specialty.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        sharedCode: form.sharedCode.value.trim(),
        totalCases: Number(form.totalCases.value) || 0,
        activeCases: Number(form.activeCases.value) || 0,
        estimatedLogistics: Number(form.estimatedLogistics.value) || 0,
        estimatedMargin: Number(form.estimatedMargin.value) || 0,
      };

      try {
        await doctorService.update(id, payload);
        alert.textContent = 'Cambios guardados correctamente.';
        alert.className = 'form__alert form__alert--success';
        alert.hidden = false;
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 600);
      } catch (error) {
        alert.textContent = `Error al guardar: ${error.message}`;
        alert.className = 'form__alert';
        alert.hidden = false;
      }
    });

    document.getElementById('toggle-doctor-status').addEventListener('click', async () => {
      const doctor = await doctorService.getById(id);
      await doctorService.toggleStatus(doctor);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  },
};
