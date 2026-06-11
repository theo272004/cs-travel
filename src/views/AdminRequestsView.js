/**
 * AdminRequestsView.js
 * =============================================================================
 * PROPOSITO:
 *   Listado global de TODAS las solicitudes (rol admin) con busqueda libre,
 *   filtros combinados (estado, empresa, prioridad), ordenamiento y contador
 *   de resultados. Todo se aplica en cliente, sin recargar.
 * =============================================================================
 */

import { requestService, STATUSES } from '../services/requestService.js';
import { companyService } from '../services/companyService.js';
import { RequestTable } from '../components/RequestTable.js';
import { escapeHtml } from '../utils/escapeHtml.js';

let cachedRequests = [];
let companiesMap = {};

const SORTERS = {
  recientes: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  'fecha-viaje': (a, b) => new Date(a.travelDate) - new Date(b.travelDate),
  'mayor-costo': (a, b) => (b.estimatedCost || 0) - (a.estimatedCost || 0),
  'mayor-ahorro': (a, b) => (b.estimatedSavings || 0) - (a.estimatedSavings || 0),
};

export const AdminRequestsView = {
  async render() {
    const [requests, companies] = await Promise.all([
      requestService.getAll(),
      companyService.getAll(),
    ]);

    cachedRequests = requests;
    companiesMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));

    const statusOptions = STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('');
    const companyOptions = companies
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Solicitudes</h1>
          <p class="page-subtitle">Todas las solicitudes de viaje del sistema.</p>
        </div>
      </div>

      <section class="panel">
        <div class="table-toolbar">
          <input id="request-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar codigo, ruta, empresa..." />
          <select id="status-filter" class="form__input table-toolbar__select">
            <option value="todas">Estado: todos</option>
            ${statusOptions}
          </select>
          <select id="company-filter" class="form__input table-toolbar__select">
            <option value="todas">Empresa: todas</option>
            ${companyOptions}
          </select>
          <select id="priority-filter" class="form__input table-toolbar__select">
            <option value="todas">Prioridad: todas</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baja">Baja</option>
          </select>
          <select id="sort-select" class="form__input table-toolbar__select">
            <option value="recientes">Mas recientes</option>
            <option value="fecha-viaje">Fecha de viaje</option>
            <option value="mayor-costo">Mayor costo</option>
            <option value="mayor-ahorro">Mayor ahorro</option>
          </select>
          <button type="button" class="btn btn--ghost" id="clear-filters" hidden>Limpiar</button>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="requests-count"></span>
        </div>
        <div id="requests-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const search = document.getElementById('request-search');
    const statusFilter = document.getElementById('status-filter');
    const companyFilter = document.getElementById('company-filter');
    const priorityFilter = document.getElementById('priority-filter');
    const sortSelect = document.getElementById('sort-select');
    const clearBtn = document.getElementById('clear-filters');
    const tableContainer = document.getElementById('requests-table');
    const count = document.getElementById('requests-count');

    function applyFilters() {
      const q = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const companyId = companyFilter.value;
      const priority = priorityFilter.value;

      let filtered = cachedRequests.filter((r) => {
        const haystack = [
          r.requestCode, r.origin, r.destination, r.requestType,
          r.observations, companiesMap[r.companyId],
        ].join(' ').toLowerCase();
        const byText = !q || haystack.includes(q);
        const byStatus = status === 'todas' || r.status === status;
        const byCompany = companyId === 'todas' || String(r.companyId) === String(companyId);
        const byPriority = priority === 'todas' || (r.priority || 'normal') === priority;
        return byText && byStatus && byCompany && byPriority;
      });

      filtered.sort(SORTERS[sortSelect.value] || SORTERS.recientes);

      const hasFilters = q || status !== 'todas' || companyId !== 'todas' || priority !== 'todas';
      clearBtn.hidden = !hasFilters;
      count.textContent = `${filtered.length} de ${cachedRequests.length} solicitud(es)`;

      tableContainer.innerHTML = RequestTable(filtered, {
        detailBase: '#/admin/requests',
        showCompany: true,
        companiesMap,
      });
    }

    search.addEventListener('input', applyFilters);
    [statusFilter, companyFilter, priorityFilter, sortSelect].forEach((el) =>
      el.addEventListener('change', applyFilters)
    );
    clearBtn.addEventListener('click', () => {
      search.value = '';
      statusFilter.value = 'todas';
      companyFilter.value = 'todas';
      priorityFilter.value = 'todas';
      applyFilters();
    });

    applyFilters();
  },
};
