import { doctorService } from '../services/doctorService.js';
import { DoctorTable } from '../components/DoctorTable.js';

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
        <a class="btn btn--primary" href="#/admin/users">+ Nuevo médico (desde Usuarios)</a>
      </div>

      <!-- Los médicos ya NO se crean aquí sueltos: se crean al dar de alta un
           usuario de tipo médico (así cada médico tiene siempre su cuenta). -->
      <p class="muted" style="margin:-6px 0 14px;">
        Los médicos se crean al registrar un <strong>usuario de tipo médico</strong>
        en <a href="#/admin/users">Usuarios</a>. Así cada médico tiene siempre su cuenta.
      </p>

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
  },
};
