import { requestService, STATUSES } from '../services/requestService.js';
import { companyService } from '../services/companyService.js';
import { RequestTable } from '../components/RequestTable.js';
import { OpsTabs } from '../components/OpsTabs.js';
import { escapeHtml } from '../utils/escapeHtml.js';

let cachedRequests = [];
let companiesMap   = {};
let currentPage    = 1;
const PAGE_SIZE    = 5;

const SORTERS = {
  recientes:     (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  'fecha-viaje': (a, b) => new Date(a.travelDate) - new Date(b.travelDate),
  'mayor-costo': (a, b) => (b.estimatedCost || 0) - (a.estimatedCost || 0),
  'mayor-ahorro':(a, b) => (b.estimatedSavings || 0) - (a.estimatedSavings || 0),
};

export const AdminRequestsView = {
  async render(ctx) {
    currentPage = 1;
    const [requests, companies] = await Promise.all([
      requestService.getAll(),
      companyService.getAll(),
    ]);

    cachedRequests = requests;
    companiesMap   = Object.fromEntries(companies.map((c) => [c.id, c.name]));

    const preStatus = ctx?.query?.status && STATUSES.includes(ctx.query.status)
      ? ctx.query.status : 'todas';

    const statusOptions  = STATUSES
      .map((s) => `<option value="${s}" ${s === preStatus ? 'selected' : ''}>${s}</option>`)
      .join('');
    const companyOptions = companies
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Operaciones</h1>
          <p class="page-subtitle">Solicitudes de empresas y casos medicos del sistema.</p>
          ${OpsTabs('requests')}
        </div>
      </div>

      <section class="panel ops-table-panel">
        <div class="table-toolbar">
          <input id="req-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar codigo, ruta, empresa..." />
          <select id="req-status" class="form__input table-toolbar__select">
            <option value="todas">Estado: todos</option>
            ${statusOptions}
          </select>
          <select id="req-company" class="form__input table-toolbar__select">
            <option value="todas">Empresa: todas</option>
            ${companyOptions}
          </select>
          <select id="req-priority" class="form__input table-toolbar__select">
            <option value="todas">Prioridad: todas</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baja">Baja</option>
          </select>
          <select id="req-sort" class="form__input table-toolbar__select">
            <option value="recientes">Mas recientes</option>
            <option value="fecha-viaje">Fecha de viaje</option>
            <option value="mayor-costo">Mayor costo</option>
            <option value="mayor-ahorro">Mayor ahorro</option>
          </select>
          <button type="button" class="btn btn--ghost" id="req-clear" hidden>Limpiar</button>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="req-count"></span>
          <div class="decision-pager" id="req-pager" hidden>
            <button type="button" class="decision-pager__btn" id="req-prev" aria-label="Pagina anterior">‹</button>
            <span id="req-page-label">1 de 1</span>
            <button type="button" class="decision-pager__btn" id="req-next" aria-label="Pagina siguiente">›</button>
          </div>
        </div>
        <div id="req-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const search    = document.getElementById('req-search');
    const stFilter  = document.getElementById('req-status');
    const coFilter  = document.getElementById('req-company');
    const prFilter  = document.getElementById('req-priority');
    const sorter    = document.getElementById('req-sort');
    const clearBtn  = document.getElementById('req-clear');
    const tableEl   = document.getElementById('req-table');
    const countEl   = document.getElementById('req-count');
    const pager     = document.getElementById('req-pager');
    const pagerPrev = document.getElementById('req-prev');
    const pagerNext = document.getElementById('req-next');
    const pagerLbl  = document.getElementById('req-page-label');

    function applyFilters({ resetPage = false } = {}) {
      const q         = search.value.trim().toLowerCase();
      const status    = stFilter.value;
      const companyId = coFilter.value;
      const priority  = prFilter.value;

      let filtered = cachedRequests.filter((r) => {
        const hay = [r.requestCode, r.origin, r.destination, r.requestType,
          r.observations, companiesMap[r.companyId]].join(' ').toLowerCase();
        return (!q || hay.includes(q))
          && (status    === 'todas' || r.status === status)
          && (companyId === 'todas' || String(r.companyId) === String(companyId))
          && (priority  === 'todas' || (r.priority || 'normal') === priority);
      });

      filtered.sort(SORTERS[sorter.value] || SORTERS.recientes);

      clearBtn.hidden = !(q || status !== 'todas' || companyId !== 'todas' || priority !== 'todas');

      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (resetPage) currentPage = 1;
      currentPage = Math.min(currentPage, totalPages);

      const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

      countEl.textContent  = `${filtered.length} de ${cachedRequests.length} solicitud(es)`;
      tableEl.innerHTML    = RequestTable(slice, { detailBase: '#/admin/requests', showCompany: true, companiesMap });

      pager.hidden         = totalPages <= 1;
      pagerLbl.textContent = `${currentPage} de ${totalPages}`;
      pagerPrev.disabled   = currentPage <= 1;
      pagerNext.disabled   = currentPage >= totalPages;
    }

    search.addEventListener('input',  () => applyFilters({ resetPage: true }));
    [stFilter, coFilter, prFilter, sorter].forEach((el) =>
      el.addEventListener('change', () => applyFilters({ resetPage: true }))
    );
    clearBtn.addEventListener('click', () => {
      search.value = ''; stFilter.value = 'todas'; coFilter.value = 'todas'; prFilter.value = 'todas';
      applyFilters({ resetPage: true });
    });
    pagerPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; applyFilters(); } });
    pagerNext.addEventListener('click', () => { currentPage += 1; applyFilters(); });

    applyFilters({ resetPage: true });
  },
};
