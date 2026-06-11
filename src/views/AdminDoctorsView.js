import { doctorService } from '../services/doctorService.js';
import { DoctorTable } from '../components/DoctorTable.js';
import { validateCompanyForm } from '../utils/validators.js';

let cachedDoctors = [];

export const AdminDoctorsView = {
  async render() {
    cachedDoctors = await doctorService.getAll();

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Medicos y clinicas</h1>
          <p class="page-subtitle">Gestiona aliados medicos para logistica de pacientes.</p>
        </div>
        <button class="btn btn--primary" id="toggle-create-doctor">+ Nuevo medico</button>
      </div>

      <section class="panel" id="create-doctor-panel" hidden>
        <h2 class="panel__title">Registrar medico / clinica</h2>
        <form id="doctor-form" class="form form--grid" novalidate>
          <div class="form__group">
            <label class="form__label">Nombre del medico *</label>
            <input type="text" name="name" class="form__input" />
            <small class="form__error" data-error-for="name"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Clinica / consultorio *</label>
            <input type="text" name="clinicName" class="form__input" />
            <small class="form__error" data-error-for="clinicName"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Especialidad *</label>
            <input type="text" name="specialty" class="form__input" />
            <small class="form__error" data-error-for="specialty"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Email *</label>
            <input type="email" name="email" class="form__input" />
            <small class="form__error" data-error-for="email"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Telefono *</label>
            <input type="text" name="phone" class="form__input" />
            <small class="form__error" data-error-for="phone"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Codigo compartido *</label>
            <input type="text" name="sharedCode" class="form__input" placeholder="CST-MED-XXX-00" />
            <small class="form__error" data-error-for="sharedCode"></small>
          </div>
          <div class="form__alert form__group--full" id="doctor-alert" hidden></div>
          <div class="form__actions form__group--full">
            <button type="submit" class="btn btn--primary">Crear medico</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="table-toolbar">
          <input id="doctor-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar nombre, clinica o especialidad..." />
          <select id="doctor-status-filter" class="form__input table-toolbar__select">
            <option value="todos">Estado: todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="doctors-count"></span>
        </div>
        <div id="doctor-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const panel = document.getElementById('create-doctor-panel');
    document.getElementById('toggle-create-doctor').addEventListener('click', () => {
      panel.hidden = !panel.hidden;
    });

    const search = document.getElementById('doctor-search');
    const statusFilter = document.getElementById('doctor-status-filter');
    const table = document.getElementById('doctor-table');
    const countLabel = document.getElementById('doctors-count');

    function applyFilters() {
      const q = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const filtered = cachedDoctors.filter((doctor) => {
        const byText = [doctor.name, doctor.clinicName, doctor.specialty, doctor.email].some(
          (value) => String(value || '').toLowerCase().includes(q)
        );
        const byStatus = status === 'todos' || doctor.status === status;
        return byText && byStatus;
      });
      countLabel.textContent = `${filtered.length} de ${cachedDoctors.length} medico(s)`;
      table.innerHTML = DoctorTable(filtered);
    }

    search.addEventListener('input', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
    applyFilters();

    const form = document.getElementById('doctor-form');
    const alert = document.getElementById('doctor-alert');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
      alert.hidden = true;

      const data = {
        name: form.name.value.trim(),
        clinicName: form.clinicName.value.trim(),
        contactName: form.clinicName.value.trim(),
        specialty: form.specialty.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        sharedCode: form.sharedCode.value.trim(),
      };

      const { isValid, errors } = validateCompanyForm({
        name: data.name,
        contactName: data.clinicName,
        email: data.email,
        phone: data.phone,
        sharedCode: data.sharedCode,
      });
      if (!data.specialty) errors.specialty = 'La especialidad es obligatoria.';

      if (!isValid || Object.keys(errors).length > 0) {
        Object.entries(errors).forEach(([field, message]) => {
          const el = form.querySelector(`[data-error-for="${field}"]`);
          if (el) el.textContent = message;
        });
        return;
      }

      try {
        await doctorService.create(data);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        alert.textContent = `No se pudo crear el medico: ${error.message}`;
        alert.hidden = false;
      }
    });
  },
};
