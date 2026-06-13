/**
 * DoctorCasesView.js
 * =============================================================================
 * PROPOSITO:
 *   Listado de casos del MEDICO con busqueda/filtros y el ANALISIS INTERACTIVO
 *   de ganancias: chips de periodo (todo / este año / este mes), evolucion de
 *   la ganancia por mes y ganancia por paciente. El dashboard principal queda
 *   como resumen; aqui se explora el detalle.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { LineChart, ColumnChart, compactNumber } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';

const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

let cachedCases = [];
let periodFilter = 'todo';

/** Fecha de referencia para atribuir la ganancia (ultima actualizacion del caso). */
const caseDate = (c) => new Date(c.updatedAt || c.createdAt);

/** Casos dentro del periodo seleccionado. */
function inPeriod(c) {
  const now = new Date();
  const date = caseDate(c);
  if (periodFilter === 'mes') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (periodFilter === 'ano') {
    return date.getFullYear() === now.getFullYear();
  }
  return true;
}

/** HTML del bloque de analisis segun el periodo activo. */
function renderAnalytics() {
  const scoped = cachedCases.filter(inPeriod);
  const earned = scoped.filter((c) => EARNED_STATUSES.includes(c.status) && (c.doctorMargin || 0) > 0);
  const totalEarned = earned.reduce((sum, c) => sum + c.doctorMargin, 0);

  // Ganancia por mes (serie temporal sobre los casos ganados del periodo).
  const monthKeys = [...new Set(earned.map((c) => {
    const d = caseDate(c);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))].sort();
  const monthLabels = monthKeys.map((key) => {
    const [year, month] = key.split('-');
    return `${MONTH_NAMES[Number(month) - 1]} ${year.slice(2)}`;
  });
  const monthValues = monthKeys.map((key) =>
    earned
      .filter((c) => {
        const d = caseDate(c);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === key;
      })
      .reduce((sum, c) => sum + c.doctorMargin, 0)
  );

  // Ganancia por paciente (quien te genera mas).
  const byPatient = {};
  earned.forEach((c) => {
    byPatient[c.patientName] = (byPatient[c.patientName] || 0) + c.doctorMargin;
  });
  const patientData = Object.entries(byPatient)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  return `
    <div class="cases-analytics__summary">
      <div>
        <span class="muted-block">Ganancia del periodo</span>
        <strong>${formatCurrency(totalEarned)}</strong>
      </div>
      <span>${earned.length} caso(s) ganados</span>
    </div>
    <div class="cases-analytics__grid">
      <div class="cases-chart-card">
        <h3>Ganancia por mes</h3>
        ${LineChart({
          labels: monthLabels,
          series: [{ name: 'Ganancia', values: monthValues, color: '#0f9d6e' }],
          formatValue: compactNumber,
          id: 'earnings-line',
        })}
      </div>
      <div class="cases-chart-card">
        <h3>Ganancia por paciente</h3>
        ${ColumnChart({ data: patientData, formatValue: formatCurrency, color: '#0f9d6e' })}
      </div>
    </div>
  `;
}

export const DoctorCasesView = {
  async render() {
    cachedCases = await medicalCaseService.getByDoctor(authService.getDoctorId());
    const activeCases = medicalCaseService.getActive(cachedCases);
    const earnedCases = cachedCases.filter((c) => EARNED_STATUSES.includes(c.status) && (c.doctorMargin || 0) > 0);
    const totalEarned = earnedCases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
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
        <div class="cases-hero__main">
          <span>Ganancia acumulada</span>
          <strong>${formatCurrency(totalEarned)}</strong>
          <small>${earnedCases.length} caso(s) con margen ganado</small>
        </div>
        <div class="cases-hero__kpis">
          <div><span>Total casos</span><strong>${cachedCases.length}</strong></div>
          <div><span>Activos</span><strong>${activeCases.length}</strong></div>
          <div><span>Esperando decision</span><strong>${pendingDecision}</strong></div>
        </div>
      </section>

      <!-- Analisis interactivo de ganancias por periodo. -->
      <section class="panel cases-analytics">
        <div class="panel__header">
          <div>
            <span class="section-label section-label--inline">Analitica</span>
            <h2 class="panel__title">Analisis de ganancias</h2>
          </div>
          <div class="chip-group">
            <button type="button" class="chip-btn ${periodFilter === 'mes' ? 'is-active' : ''}" data-period="mes">Este mes</button>
            <button type="button" class="chip-btn ${periodFilter === 'ano' ? 'is-active' : ''}" data-period="ano">Este año</button>
            <button type="button" class="chip-btn ${periodFilter === 'todo' ? 'is-active' : ''}" data-period="todo">Todo</button>
          </div>
        </div>
        <div id="analytics-body">${renderAnalytics()}</div>
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
    `;
  },

  async afterRender() {
    const filter = document.getElementById('status-filter');
    const search = document.getElementById('case-search');
    const table = document.getElementById('cases-table');
    const countLabel = document.getElementById('cases-count');
    const analyticsBody = document.getElementById('analytics-body');

    // Chips de periodo: re-renderizan solo el bloque de analisis.
    document.querySelectorAll('[data-period]').forEach((chip) => {
      chip.addEventListener('click', () => {
        periodFilter = chip.dataset.period;
        document.querySelectorAll('[data-period]').forEach((c) =>
          c.classList.toggle('is-active', c.dataset.period === periodFilter)
        );
        analyticsBody.innerHTML = renderAnalytics();
      });
    });

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
