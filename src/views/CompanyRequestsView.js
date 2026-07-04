import { authService } from '../services/authService.js';
import { requestService, STATUSES } from '../services/requestService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { renderStatusChart } from './DoctorDashboardView.js';

let cachedRequests = [];
let currentPage = 1;
const PAGE_SIZE = 8;

const TYPE_LABEL = {
  vuelo: 'Vuelo', hotel: 'Hotel', tour: 'Tour', paquete: 'Paquete',
  'paquete completo': 'Paquete', traslado: 'Traslado', sim: 'SIM', evento: 'Evento', otro: 'Otro',
};
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
// requestType ahora puede ser multi-valor ("vuelo, hotel"): muestra cada tipo
// con su etiqueta, separados por coma.
const typeLabels = (raw) => String(raw || '')
  .split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
  .map((t) => TYPE_LABEL[t] || capitalize(t))
  .join(', ') || 'Paquete';

function RequestsTable(items) {
  if (!items.length) {
    return `<p class="empty-state">No hay solicitudes para mostrar.</p>`;
  }
  const rows = items.map((r) => `
    <tr class="clickable-row" data-href="#/company/requests/${r.id}">
      <td><strong>${escapeHtml(r.requestCode)}</strong></td>
      <td>${escapeHtml(typeLabels(r.requestType))}</td>
      <td class="muted">${escapeHtml(r.origin)} → ${escapeHtml(r.destination)}</td>
      <td>${formatDate(r.travelDate)}</td>
      <td>${escapeHtml(String(r.peopleCount))}</td>
      <td>${StatusBadge(r.status)}</td>
      <td class="text-right"><strong>${formatCurrency(r.estimatedCost)}</strong></td>
      <td class="text-green">${formatCurrency(r.estimatedSavings)}</td>
    </tr>
  `).join('');

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Tipo</th>
            <th>Ruta</th>
            <th>Fecha</th>
            <th>Personas</th>
            <th>Estado</th>
            <th class="text-right">Costo est.</th>
            <th>Ahorro</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export const CompanyRequestsView = {
  async render() {
    const companyId = authService.getCompanyId();
    cachedRequests = await requestService.getByCompany(companyId);
    currentPage = 1;

    const pending  = cachedRequests.filter((r) => r.status === 'solicitud enviada').length;
    const active   = cachedRequests.filter((r) => !['finalizada', 'cancelada'].includes(r.status)).length;
    const total    = cachedRequests.length;

    const statusOptions = STATUSES
      .map((s) => `<option value="${s}">${s}</option>`)
      .join('');

    return `
      <!-- Hero -->
      <div class="cr-page-hero">
        <div class="cr-page-hero__left">
          <h1 class="page-title">Mis solicitudes</h1>
          <p class="page-subtitle">Consulta y gestiona el estado de tus viajes corporativos.</p>
        </div>
        <div class="cr-page-hero__kpis">
          <div class="cr-kpi">
            <strong>${total}</strong>
            <span>Total</span>
          </div>
          <div class="cr-kpi cr-kpi--sep">
            <strong class="cr-kpi--amber">${pending}</strong>
            <span>Pendientes</span>
          </div>
          <div class="cr-kpi cr-kpi--sep">
            <strong class="cr-kpi--blue">${active}</strong>
            <span>Activas</span>
          </div>
        </div>
      </div>

      <!-- Gráfico "por estado" (igual que en Mis casos del médico). -->
      <section class="doctor-status-floating cases-status">
        <div class="doctor-status-floating__head">
          <h2 class="panel__title">Mis solicitudes por estado</h2>
          <span class="muted" id="cr-status-total">${cachedRequests.length} en total</span>
        </div>
        <div id="cr-status-chart">${renderStatusChart(cachedRequests, { label: 'Solicitudes' })}</div>
      </section>

      <!-- Tabla -->
      <section class="panel cr-table-panel">
        <div class="table-toolbar">
          <input id="cr-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar codigo, origen, destino..." />
          <select id="cr-status" class="form__input table-toolbar__select">
            <option value="todas">Estado: todos</option>
            ${statusOptions}
          </select>
          <select id="cr-type" class="form__input table-toolbar__select">
            <option value="todos">Tipo: todos</option>
            ${Object.entries(TYPE_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="cr-count"></span>
          <div class="decision-pager" id="cr-pager" hidden>
            <button type="button" class="decision-pager__btn" id="cr-prev">‹</button>
            <span id="cr-page-lbl">1 de 1</span>
            <button type="button" class="decision-pager__btn" id="cr-next">›</button>
          </div>
        </div>
        <div id="cr-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const search   = document.getElementById('cr-search');
    const stFilter = document.getElementById('cr-status');
    const tyFilter = document.getElementById('cr-type');
    const countEl  = document.getElementById('cr-count');
    const tableEl  = document.getElementById('cr-table');
    const pager    = document.getElementById('cr-pager');
    const prevBtn  = document.getElementById('cr-prev');
    const nextBtn  = document.getElementById('cr-next');
    const pageLabel= document.getElementById('cr-page-lbl');
    // La primera pasada deja la animación de entrada del gráfico; luego se
    // actualiza en modo estático (sin re-animar) al filtrar/buscar.
    let chartInitialized = false;

    function applyFilters({ resetPage = false } = {}) {
      const q      = search.value.trim().toLowerCase();
      const status = stFilter.value;
      const type   = tyFilter.value;

      let filtered = cachedRequests.filter((r) => {
        const hay = [r.requestCode, r.origin, r.destination, r.requestType].join(' ').toLowerCase();
        return (!q || hay.includes(q))
          && (status === 'todas'  || r.status === status)
          && (type   === 'todos'  || String(r.requestType || '').includes(type));
      });

      if (resetPage) currentPage = 1;
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      currentPage = Math.min(currentPage, totalPages);

      const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
      countEl.textContent = `${filtered.length} de ${cachedRequests.length} solicitud(es)`;
      tableEl.innerHTML   = RequestsTable(slice);

      tableEl.querySelectorAll('.clickable-row[data-href]').forEach((row) => {
        row.addEventListener('click', () => { window.location.hash = row.dataset.href; });
      });

      // Gráfico "Mis solicitudes por estado": refleja la lista filtrada.
      if (chartInitialized) {
        const chartEl = document.getElementById('cr-status-chart');
        if (chartEl) chartEl.innerHTML = renderStatusChart(filtered, { animate: false, label: 'Solicitudes' });
      }
      const statusTotal = document.getElementById('cr-status-total');
      if (statusTotal) {
        statusTotal.textContent = filtered.length === cachedRequests.length
          ? `${cachedRequests.length} en total`
          : `${filtered.length} de ${cachedRequests.length}`;
      }

      pager.hidden         = totalPages <= 1;
      pageLabel.textContent= `${currentPage} de ${totalPages}`;
      prevBtn.disabled     = currentPage <= 1;
      nextBtn.disabled     = currentPage >= totalPages;
    }

    search.addEventListener('input',  () => applyFilters({ resetPage: true }));
    stFilter.addEventListener('change', () => applyFilters({ resetPage: true }));
    tyFilter.addEventListener('change', () => applyFilters({ resetPage: true }));
    prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; applyFilters(); } });
    nextBtn.addEventListener('click', () => { currentPage++; applyFilters(); });

    applyFilters({ resetPage: true });
    chartInitialized = true;
  },
};
