import { doctorService } from '../services/doctorService.js';
import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { escapeHtml } from '../utils/escapeHtml.js';

let cachedCases = [];
let doctorsMap = {};

export const AdminMedicalCasesView = {
  async render() {
    const [doctors, cases] = await Promise.all([
      doctorService.getAll(),
      medicalCaseService.getAll(),
    ]);

    cachedCases = cases;
    doctorsMap = Object.fromEntries(doctors.map((doctor) => [doctor.id, doctor.clinicName]));

    const doctorOptions = `<option value="todos">Medico: todos</option>` +
      doctors.map((doctor) => `<option value="${doctor.id}">${escapeHtml(doctor.clinicName)}</option>`).join('');
    const statusOptions = `<option value="todos">Estado: todos</option>` +
      MEDICAL_CASE_STATUSES.map((status) => `<option value="${status}">${status}</option>`).join('');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Casos medicos</h1>
          <p class="page-subtitle">Gestiona solicitudes logisticas de pacientes.</p>
        </div>
      </div>

      <section class="panel">
        <div class="table-toolbar">
          <input id="case-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar codigo, paciente, procedimiento..." />
          <select id="doctor-filter" class="form__input table-toolbar__select">${doctorOptions}</select>
          <select id="case-status-filter" class="form__input table-toolbar__select">${statusOptions}</select>
          <select id="case-priority-filter" class="form__input table-toolbar__select">
            <option value="todas">Prioridad: todas</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baja">Baja</option>
          </select>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="cases-count"></span>
        </div>
        <div id="admin-cases-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const search = document.getElementById('case-search');
    const doctorFilter = document.getElementById('doctor-filter');
    const statusFilter = document.getElementById('case-status-filter');
    const priorityFilter = document.getElementById('case-priority-filter');
    const table = document.getElementById('admin-cases-table');
    const countLabel = document.getElementById('cases-count');

    const renderFiltered = () => {
      const q = search.value.trim().toLowerCase();
      const doctorValue = doctorFilter.value;
      const statusValue = statusFilter.value;
      const priorityValue = priorityFilter.value;

      const filtered = cachedCases.filter((item) => {
        const haystack = [
          item.caseCode, item.patientName, item.procedure,
          item.origin, item.destination, doctorsMap[item.doctorId],
        ].join(' ').toLowerCase();
        const byText = !q || haystack.includes(q);
        const byDoctor = doctorValue === 'todos' || String(item.doctorId) === doctorValue;
        const byStatus = statusValue === 'todos' || item.status === statusValue;
        const byPriority = priorityValue === 'todas' || (item.priority || 'normal') === priorityValue;
        return byText && byDoctor && byStatus && byPriority;
      });

      countLabel.textContent = `${filtered.length} de ${cachedCases.length} caso(s)`;
      table.innerHTML = MedicalCaseTable(filtered, {
        detailBase: '#/admin/medical-cases',
        showDoctor: true,
        doctorsMap,
      });
    };

    search.addEventListener('input', renderFiltered);
    [doctorFilter, statusFilter, priorityFilter].forEach((el) =>
      el.addEventListener('change', renderFiltered)
    );
    renderFiltered();
  },
};
