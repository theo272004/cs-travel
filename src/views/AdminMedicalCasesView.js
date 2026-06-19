import { doctorService } from '../services/doctorService.js';
import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { OpsTabs } from '../components/OpsTabs.js';
import { escapeHtml } from '../utils/escapeHtml.js';

let cachedCases = [];
let doctorsMap  = {};
let currentPage = 1;
const PAGE_SIZE = 5;

export const AdminMedicalCasesView = {
  async render(ctx) {
    currentPage = 1;
    const [doctors, cases] = await Promise.all([
      doctorService.getAll(),
      medicalCaseService.getAll(),
    ]);

    cachedCases = cases;
    doctorsMap  = Object.fromEntries(doctors.map((d) => [d.id, d.clinicName]));

    const preStatus = ctx?.query?.status && MEDICAL_CASE_STATUSES.includes(ctx.query.status)
      ? ctx.query.status : 'todos';

    const doctorOptions = `<option value="todos">Medico: todos</option>` +
      doctors.map((d) => `<option value="${d.id}">${escapeHtml(d.clinicName)}</option>`).join('');
    const statusOptions = `<option value="todos">Estado: todos</option>` +
      MEDICAL_CASE_STATUSES.map((s) =>
        `<option value="${s}" ${s === preStatus ? 'selected' : ''}>${s}</option>`
      ).join('');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Operaciones</h1>
          <p class="page-subtitle">Solicitudes de empresas y casos medicos del sistema.</p>
          ${OpsTabs('cases')}
        </div>
      </div>

      <section class="panel ops-table-panel">
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
          <button type="button" class="btn btn--ghost" id="case-clear" hidden>Limpiar</button>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="cases-count"></span>
          <div class="decision-pager" id="case-pager" hidden>
            <button type="button" class="decision-pager__btn" id="case-prev" aria-label="Pagina anterior">‹</button>
            <span id="case-page-label">1 de 1</span>
            <button type="button" class="decision-pager__btn" id="case-next" aria-label="Pagina siguiente">›</button>
          </div>
        </div>
        <div id="admin-cases-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const search        = document.getElementById('case-search');
    const doctorFilter  = document.getElementById('doctor-filter');
    const statusFilter  = document.getElementById('case-status-filter');
    const priorityFilter= document.getElementById('case-priority-filter');
    const clearBtn      = document.getElementById('case-clear');
    const tableEl       = document.getElementById('admin-cases-table');
    const countEl       = document.getElementById('cases-count');
    const pager         = document.getElementById('case-pager');
    const pagerPrev     = document.getElementById('case-prev');
    const pagerNext     = document.getElementById('case-next');
    const pagerLbl      = document.getElementById('case-page-label');

    function applyFilters({ resetPage = false } = {}) {
      const q        = search.value.trim().toLowerCase();
      const doctorId = doctorFilter.value;
      const status   = statusFilter.value;
      const priority = priorityFilter.value;

      const filtered = cachedCases.filter((item) => {
        const hay = [
          item.caseCode, item.patientName, item.procedure,
          item.origin, item.destination, doctorsMap[item.doctorId],
        ].join(' ').toLowerCase();
        return (!q || hay.includes(q))
          && (doctorId === 'todos'  || String(item.doctorId) === String(doctorId))
          && (status   === 'todos'  || item.status === status)
          && (priority === 'todas'  || (item.priority || 'normal') === priority);
      });

      clearBtn.hidden = !(q || doctorId !== 'todos' || status !== 'todos' || priority !== 'todas');

      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (resetPage) currentPage = 1;
      currentPage = Math.min(currentPage, totalPages);

      const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

      countEl.textContent = `${filtered.length} de ${cachedCases.length} caso(s)`;
      tableEl.innerHTML   = MedicalCaseTable(slice, {
        detailBase: '#/admin/medical-cases',
        showDoctor: true,
        doctorsMap,
      });

      pager.hidden         = totalPages <= 1;
      pagerLbl.textContent = `${currentPage} de ${totalPages}`;
      pagerPrev.disabled   = currentPage <= 1;
      pagerNext.disabled   = currentPage >= totalPages;
    }

    search.addEventListener('input', () => applyFilters({ resetPage: true }));
    [doctorFilter, statusFilter, priorityFilter].forEach((el) =>
      el.addEventListener('change', () => applyFilters({ resetPage: true }))
    );
    clearBtn.addEventListener('click', () => {
      search.value = ''; doctorFilter.value = 'todos'; statusFilter.value = 'todos'; priorityFilter.value = 'todas';
      applyFilters({ resetPage: true });
    });
    pagerPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; applyFilters(); } });
    pagerNext.addEventListener('click', () => { currentPage += 1; applyFilters(); });

    applyFilters({ resetPage: true });
  },
};
