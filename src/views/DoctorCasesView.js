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
import { renderSupportStrip, bindSupportStrip } from './DoctorDashboardView.js';

let cachedCases = [];

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
            <span>Total casos</span>
            <strong>${cachedCases.length}</strong>
            <small>Registrados en tu portal</small>
          </article>
          <article class="cases-kpi-card">
            <span>Casos activos</span>
            <strong>${activeCases.length}</strong>
            <small>Hoy en gestion</small>
          </article>
          <article class="cases-kpi-card cases-kpi-card--alert">
            <span>Esperando decision</span>
            <strong>${pendingDecision}</strong>
            <small>Cotizaciones por revisar</small>
          </article>
        </div>
      </section>

      <section class="panel cases-table-panel">
        <div class="table-toolbar">
          <input id="case-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar codigo, paciente o destino..." />
          <select id="status-filter" class="form__input table-toolbar__select">${statusOptions}</select>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="cases-count"></span>
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

    bindSupportStrip();
  },
};
