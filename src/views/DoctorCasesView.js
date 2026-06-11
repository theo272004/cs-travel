import { authService } from '../services/authService.js';
import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';

let cachedCases = [];

export const DoctorCasesView = {
  async render() {
    cachedCases = await medicalCaseService.getByDoctor(authService.getDoctorId());
    const statusOptions = `<option value="todos">Estado: todos</option>` +
      MEDICAL_CASE_STATUSES.map((status) => `<option value="${status}">${status}</option>`).join('');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Mis casos medicos</h1>
          <p class="page-subtitle">Consulta los casos logisticos de tus pacientes.</p>
        </div>
        <button type="button" class="btn btn--primary" data-action="open-quick-create">+ Nuevo caso</button>
      </div>

      <section class="panel">
        <div class="table-toolbar">
          <input id="case-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar codigo, paciente o destino..." />
          <select id="status-filter" class="form__input table-toolbar__select">${statusOptions}</select>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="cases-count"></span>
        </div>
        <div id="cases-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const filter = document.getElementById('status-filter');
    const search = document.getElementById('case-search');
    const table = document.getElementById('cases-table');
    const countLabel = document.getElementById('cases-count');

    const applyFilters = () => {
      const q = search.value.trim().toLowerCase();
      const value = filter.value;
      const filtered = cachedCases.filter((item) => {
        const haystack = [item.caseCode, item.patientName, item.procedure, item.origin, item.destination]
          .join(' ').toLowerCase();
        const byText = !q || haystack.includes(q);
        const byStatus = value === 'todos' || item.status === value;
        return byText && byStatus;
      });
      countLabel.textContent = `${filtered.length} de ${cachedCases.length} caso(s)`;
      table.innerHTML = MedicalCaseTable(filtered, { detailBase: '#/doctor/cases' });
    };

    search.addEventListener('input', applyFilters);
    filter.addEventListener('change', applyFilters);
    applyFilters();
  },
};
