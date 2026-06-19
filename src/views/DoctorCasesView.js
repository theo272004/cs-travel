/**
 * DoctorCasesView.js
 * =============================================================================
 * PROPOSITO:
 *   Listado de casos del MEDICO con busqueda/filtros y KPIs operativos
 *   compactos. El dashboard principal queda como resumen financiero; aqui se
 *   trabaja el detalle de pacientes y estados.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { renderSupportStrip, bindSupportStrip, renderStatusChart } from './DoctorDashboardView.js';

// Etiqueta del total según haya o no filtros activos.
const statusTotalLabel = (filtered, total) =>
  filtered === total ? `${total} en total` : `${filtered} de ${total}`;

const KPI_ICONS = {
  cases: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
  active: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-3.86 3.58-7 8-7s8 3.14 8 7"/></svg>',
  hourglass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
};

const PAGE_SIZE = 5;

let cachedCases = [];
let currentPage = 1;

export const DoctorCasesView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);
    cachedCases = cases;
    const activeCases = medicalCaseService.getActive(cachedCases);
    const pendingDecision = cachedCases.filter((c) => c.status === 'cotizacion enviada').length;
    const statusOptions = `<option value="todos">Estado: todos</option>` +
      MEDICAL_CASE_STATUSES.map((status) => `<option value="${status}">${status}</option>`).join('');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Mis casos medicos</h1>
          <p class="page-subtitle">Consulta tus pacientes, ajusta cotizaciones y revisa el rendimiento de cada caso.</p>
        </div>
        <button type="button" class="btn btn--primary" data-action="open-quick-create">+ Nuevo caso</button>
      </div>

      <section class="cases-hero">
        <div class="cases-hero__kpis">
          <article class="cases-kpi-card">
            <div class="cases-kpi-card__icon" aria-hidden="true">${KPI_ICONS.cases}</div>
            <div class="cases-kpi-card__body">
              <span>Total casos</span>
              <strong>${cachedCases.length}</strong>
              <small>Registrados en tu portal</small>
            </div>
          </article>
          <article class="cases-kpi-card">
            <div class="cases-kpi-card__icon" aria-hidden="true">${KPI_ICONS.active}</div>
            <div class="cases-kpi-card__body">
              <span>Casos activos</span>
              <strong>${activeCases.length}</strong>
              <small>Hoy en gestion</small>
            </div>
          </article>
          <article class="cases-kpi-card cases-kpi-card--alert">
            <div class="cases-kpi-card__icon" aria-hidden="true">${KPI_ICONS.hourglass}</div>
            <div class="cases-kpi-card__body">
              <span>Esperando decision</span>
              <strong>${pendingDecision}</strong>
              <small>Cotizaciones por revisar</small>
            </div>
          </article>
        </div>
      </section>

      <section class="doctor-status-floating cases-status">
        <div class="doctor-status-floating__head">
          <h2 class="panel__title">Mis casos por estado</h2>
          <span class="muted" id="cases-status-total">${cachedCases.length} en total</span>
        </div>
        <div id="cases-status-chart">${renderStatusChart(cachedCases)}</div>
      </section>

      <section class="panel cases-table-panel">
        <div class="table-toolbar">
          <input id="case-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar codigo, paciente o destino..." />
          <select id="status-filter" class="form__input table-toolbar__select">${statusOptions}</select>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="cases-count"></span>
          <div class="decision-pager" id="cases-pager" hidden>
            <button type="button" class="decision-pager__btn" id="cases-prev" aria-label="Pagina anterior">‹</button>
            <span class="decision-pager__label">Pagina <strong id="cases-page-current">1</strong> de <span id="cases-page-total">1</span></span>
            <button type="button" class="decision-pager__btn" id="cases-next" aria-label="Pagina siguiente">›</button>
          </div>
        </div>
        <div id="cases-table"></div>
      </section>

      ${renderSupportStrip(doctor)}
    `;
  },

  async afterRender() {
    const filter = document.getElementById('status-filter');
    const search = document.getElementById('case-search');
    const table = document.getElementById('cases-table');
    const countLabel = document.getElementById('cases-count');
    const pager = document.getElementById('cases-pager');
    const pagerPrev = document.getElementById('cases-prev');
    const pagerNext = document.getElementById('cases-next');
    const pagerCurrent = document.getElementById('cases-page-current');
    const pagerTotal = document.getElementById('cases-page-total');
    // La primera pasada de applyFilters no reemplaza el gráfico (deja su
    // animación de entrada); a partir de ahí sí, en modo estático.
    let chartInitialized = false;

    const applyFilters = ({ resetPage = false } = {}) => {
      const q = search.value.trim().toLowerCase();
      const value = filter.value;
      const filtered = cachedCases.filter((item) => {
        const haystack = [item.caseCode, item.patientName, item.procedure, item.origin, item.destination]
          .join(' ').toLowerCase();
        const byText = !q || haystack.includes(q);
        const byStatus = value === 'todos' || item.status === value;
        return byText && byStatus;
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (resetPage) currentPage = 1;
      currentPage = Math.min(currentPage, totalPages);

      const start = (currentPage - 1) * PAGE_SIZE;
      const pageItems = filtered.slice(start, start + PAGE_SIZE);

      countLabel.textContent = `${filtered.length} de ${cachedCases.length} caso(s)`;
      table.innerHTML = MedicalCaseTable(pageItems, { detailBase: '#/doctor/cases' });

      // El gráfico "Mis casos por estado" refleja la lista filtrada. Se salta la
      // primera pasada (conserva la animación de entrada del render inicial) y
      // luego actualiza en modo estático para no re-animar/parpadear al filtrar.
      if (chartInitialized) {
        const statusChart = document.getElementById('cases-status-chart');
        if (statusChart) statusChart.innerHTML = renderStatusChart(filtered, { animate: false });
      }
      const statusTotal = document.getElementById('cases-status-total');
      if (statusTotal) statusTotal.textContent = statusTotalLabel(filtered.length, cachedCases.length);

      pager.hidden = totalPages <= 1;
      pagerCurrent.textContent = String(currentPage);
      pagerTotal.textContent = String(totalPages);
      pagerPrev.disabled = currentPage <= 1;
      pagerNext.disabled = currentPage >= totalPages;
    };

    search.addEventListener('input', () => applyFilters({ resetPage: true }));
    filter.addEventListener('change', () => applyFilters({ resetPage: true }));
    pagerPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage -= 1;
        applyFilters();
      }
    });
    pagerNext.addEventListener('click', () => {
      currentPage += 1;
      applyFilters();
    });
    applyFilters({ resetPage: true });
    chartInitialized = true;

    bindSupportStrip();
  },
};
