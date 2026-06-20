import { requestService, STATUSES } from '../services/requestService.js';
import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { companyService } from '../services/companyService.js';
import { doctorService } from '../services/doctorService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

let cachedItems = [];   // lista unificada de solicitudes + casos medicos
let currentPage = 1;
const PAGE_SIZE = 8;

const SORTERS = {
  recientes:     (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  'fecha-viaje': (a, b) => new Date(a.date) - new Date(b.date),
  'mayor-valor': (a, b) => (b.value || 0) - (a.value || 0),
};

const ALL_STATUSES = [...new Set([...STATUSES, ...MEDICAL_CASE_STATUSES])];

function UnifiedTable(items) {
  if (!items.length) {
    return `<p class="empty-state">No hay operaciones para mostrar.</p>`;
  }

  const PRIORITY_LABEL = { alta: 'Alta', normal: 'Normal', baja: 'Baja' };
  const TIPO_BADGE = {
    solicitud: `<span class="badge badge--blue">Solicitud</span>`,
    caso:      `<span class="badge badge--violet">Caso medico</span>`,
  };

  const rows = items.map((item) => `
    <tr class="clickable-row" data-href="${item.detailHref}">
      <td>${TIPO_BADGE[item._type] || ''}</td>
      <td><strong>${escapeHtml(item.code)}</strong></td>
      <td>${escapeHtml(item.client)}</td>
      <td class="muted">${escapeHtml(item.route)}</td>
      <td>${formatDate(item.date)}</td>
      <td>${StatusBadge(item.status)}</td>
      <td class="text-right"><strong>${formatCurrency(item.value || 0)}</strong></td>
      <td>
        <span class="badge priority--${escapeHtml(item.priority)}">
          ${escapeHtml(PRIORITY_LABEL[item.priority] || item.priority)}
        </span>
      </td>
    </tr>
  `).join('');

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Codigo</th>
            <th>Cliente</th>
            <th>Ruta</th>
            <th>Fecha viaje</th>
            <th>Estado</th>
            <th class="text-right">Valor</th>
            <th>Prioridad</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export const AdminRequestsView = {
  async render(ctx) {
    currentPage = 1;
    const [requests, cases, companies, doctors] = await Promise.all([
      requestService.getAll(),
      medicalCaseService.getAll(),
      companyService.getAll(),
      doctorService.getAll(),
    ]);

    const companiesMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));
    const doctorsMap   = Object.fromEntries(doctors.map((d) => [d.id, d.clinicName]));

    cachedItems = [
      ...requests.map((r) => ({
        _type:      'solicitud',
        id:         r.id,
        code:       r.requestCode,
        client:     companiesMap[r.companyId] || `Empresa #${r.companyId}`,
        route:      `${r.origin} → ${r.destination}`,
        date:       r.travelDate,
        status:     r.status,
        priority:   r.priority || 'normal',
        value:      r.estimatedCost,
        detailHref: `#/admin/requests/${r.id}`,
        createdAt:  r.createdAt,
      })),
      ...cases.map((c) => ({
        _type:      'caso',
        id:         c.id,
        code:       c.caseCode,
        client:     doctorsMap[c.doctorId] || `Medico #${c.doctorId}`,
        route:      `${c.origin} → ${c.destination}`,
        date:       c.travelDate,
        status:     c.status,
        priority:   c.priority || 'normal',
        value:      c.finalPatientValue,
        detailHref: `#/admin/medical-cases/${c.id}`,
        createdAt:  c.createdAt,
      })),
    ];

    const preStatus = ctx?.query?.status && ALL_STATUSES.includes(ctx.query.status)
      ? ctx.query.status : 'todas';

    const statusOptions = ALL_STATUSES
      .map((s) => `<option value="${s}" ${s === preStatus ? 'selected' : ''}>${s}</option>`)
      .join('');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Operaciones</h1>
          <p class="page-subtitle">Solicitudes de empresas y casos medicos del sistema.</p>
        </div>
      </div>

      <section class="panel ops-table-panel">
        <div class="table-toolbar">
          <input id="req-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar codigo, cliente, ruta..." />
          <select id="req-tipo" class="form__input table-toolbar__select">
            <option value="todos">Tipo: todos</option>
            <option value="solicitud">Solicitudes</option>
            <option value="caso">Casos medicos</option>
          </select>
          <select id="req-status" class="form__input table-toolbar__select">
            <option value="todas">Estado: todos</option>
            ${statusOptions}
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
            <option value="mayor-valor">Mayor valor</option>
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
    const tipoFilter = document.getElementById('req-tipo');
    const stFilter  = document.getElementById('req-status');
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
      const q        = search.value.trim().toLowerCase();
      const tipo     = tipoFilter.value;
      const status   = stFilter.value;
      const priority = prFilter.value;

      let filtered = cachedItems.filter((item) => {
        const hay = [item.code, item.client, item.route].join(' ').toLowerCase();
        return (!q || hay.includes(q))
          && (tipo     === 'todos'  || item._type === tipo)
          && (status   === 'todas'  || item.status === status)
          && (priority === 'todas'  || item.priority === priority);
      });

      filtered.sort(SORTERS[sorter.value] || SORTERS.recientes);

      clearBtn.hidden = !(q || tipo !== 'todos' || status !== 'todas' || priority !== 'todas');

      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (resetPage) currentPage = 1;
      currentPage = Math.min(currentPage, totalPages);

      const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

      countEl.textContent  = `${filtered.length} de ${cachedItems.length} operacion(es)`;
      tableEl.innerHTML    = UnifiedTable(slice);

      tableEl.querySelectorAll('.clickable-row[data-href]').forEach((row) => {
        row.addEventListener('click', () => { window.location.hash = row.dataset.href; });
      });

      pager.hidden         = totalPages <= 1;
      pagerLbl.textContent = `${currentPage} de ${totalPages}`;
      pagerPrev.disabled   = currentPage <= 1;
      pagerNext.disabled   = currentPage >= totalPages;
    }

    search.addEventListener('input',  () => applyFilters({ resetPage: true }));
    [tipoFilter, stFilter, prFilter, sorter].forEach((el) =>
      el.addEventListener('change', () => applyFilters({ resetPage: true }))
    );
    clearBtn.addEventListener('click', () => {
      search.value = ''; tipoFilter.value = 'todos'; stFilter.value = 'todas'; prFilter.value = 'todas';
      applyFilters({ resetPage: true });
    });
    pagerPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; applyFilters(); } });
    pagerNext.addEventListener('click', () => { currentPage += 1; applyFilters(); });

    applyFilters({ resetPage: true });
  },
};
