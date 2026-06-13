/**
 * DoctorDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard del MEDICO/CLINICA aliada, ordenado segun el flujo de negocio:
 *     1. Header limpio.
 *     2. Banda de ganancias acumuladas + resumen rapido.
 *     3. "Esperando tu decision" + grafica de generado por periodo.
 *     4. KPIs operativos.
 *     5. Casos por estado + casos activos clicables para trabajarlos.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ColumnChart, DonutChart } from '../components/Chart.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
const PIPELINE_STATUSES = ['en cotizacion', 'cotizacion enviada'];
const ACTION_STATUSES = ['cotizacion enviada'];
const QUOTED_STATUSES = ['cotizacion enviada', 'aprobada', 'en gestion', 'finalizada'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const ICONS = {
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
};

let cachedDoctorCases = [];
let cachedActiveCases = [];

const logisticsCost = (c) => (c.baseCost || 0) + (c.csTravelMargin || 0);
const earnedValue = (c) => (EARNED_STATUSES.includes(c.status) ? c.doctorMargin || 0 : 0);
const pipelineValue = (c) => (
  PIPELINE_STATUSES.includes(c.status) ? (c.doctorMargin || c.doctorMarginSuggested || 0) : 0
);

function pct(value, total, digits = 0) {
  if (total <= 0) return 0;
  const scaled = (value / total) * 100;
  const factor = 10 ** digits;
  return Math.round(scaled * factor) / factor;
}

function statusLabel(status) {
  return status
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildGeneratedData(cases, mode = 'monthly') {
  const source = cases.filter((c) => earnedValue(c) > 0);
  const currentYear = new Date().getFullYear();

  if (mode === 'annual') {
    if (!source.length) return [];
    const byYear = source.reduce((acc, c) => {
      const year = String(new Date(c.updatedAt || c.createdAt).getFullYear());
      acc[year] = (acc[year] || 0) + earnedValue(c);
      return acc;
    }, {});
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([label, value]) => ({ label, value, color: '#0a2540' }));
  }

  const totals = Array.from({ length: 12 }, () => 0);
  source.forEach((c) => {
    const date = new Date(c.updatedAt || c.createdAt);
    if (date.getFullYear() === currentYear) totals[date.getMonth()] += earnedValue(c);
  });

  return totals.map((value, index) => ({
    label: MONTH_LABELS[index],
    value,
    color: '#0f9d6e',
  }));
}

function renderGeneratedChart(cases, mode = 'monthly') {
  const data = buildGeneratedData(cases, mode);
  return ColumnChart({
    data,
    formatValue: formatCurrency,
    color: mode === 'annual' ? '#0a2540' : '#0f9d6e',
    keepZero: mode === 'monthly',
  });
}

function kpiCard({ label, value, hint, icon, accent = 'blue', trend = [28, 38, 32, 46, 40, 56, 52, 68] }) {
  return `
    <article class="doctor-kpi doctor-kpi--${escapeHtml(accent)}">
      <div class="doctor-kpi__head">
        <span>${escapeHtml(label)}</span>
        <i aria-hidden="true">${icon}</i>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <div class="doctor-kpi__foot">
        <small>${escapeHtml(hint)}</small>
        <span class="doctor-kpi__spark" aria-hidden="true">
          ${trend.map((height) => `<b style="height:${height}%"></b>`).join('')}
        </span>
      </div>
    </article>
  `;
}

function renderDecisionPanel(cases, pipelinePotential) {
  if (!cases.length) {
    return `
      <div class="action-empty">
        <span class="action-empty__icon" aria-hidden="true">✓</span>
        <div>
          <strong>No tienes decisiones pendientes</strong>
          <p class="muted">Cuando CS Travel te envie una cotizacion, la veras aqui para ajustarla y aprobarla.</p>
        </div>
      </div>
      <div class="pipeline-banner">
        <span class="pipeline-banner__label">Pipeline potencial</span>
        <strong class="pipeline-banner__value">${formatCurrency(pipelinePotential)}</strong>
        <small>Lo que podrias sumar si tus cotizaciones en curso se convierten.</small>
      </div>
    `;
  }

  return `
    <ul class="action-list">
      ${cases.slice(0, 3).map((c) => {
        const margin = c.doctorMargin || c.doctorMarginSuggested || 0;
        return `
          <li class="action-list__item">
            <span class="action-list__status" aria-hidden="true"></span>
            <div class="action-list__info">
              <strong>${escapeHtml(c.patientName)}</strong>
              <span class="muted-block">${escapeHtml(c.caseCode)} · ${escapeHtml(c.procedure)}</span>
              <span class="muted-block">${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}</span>
            </div>
            <div class="action-list__meta">
              <div class="action-list__amount">
                <span class="muted-block">Margen sugerido</span>
                <strong class="text-green">${formatCurrency(margin)}</strong>
              </div>
              <div class="action-list__amount">
                <span class="muted-block">Paciente pagaria</span>
                <strong>${formatCurrency(c.finalPatientValue || logisticsCost(c) + margin)}</strong>
              </div>
              <a class="btn btn--primary btn--sm" href="#/doctor/cases/${c.id}">Ajustar y enviar</a>
            </div>
          </li>
        `;
      }).join('')}
    </ul>

    <div class="pipeline-banner">
      <span class="pipeline-banner__label">Pipeline potencial</span>
      <strong class="pipeline-banner__value">${formatCurrency(pipelinePotential)}</strong>
      <small>Lo que podrias sumar si tus pacientes aprueban las cotizaciones en curso.</small>
    </div>
  `;
}

function renderStatusChart(cases) {
  const byStatus = cases.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const data = Object.entries(byStatus).map(([label, value]) => ({
    label: statusLabel(label),
    value,
  }));

  return DonutChart({
    data,
    centerLabel: 'Casos',
    formatValue: (value) => String(value),
  });
}

function renderActiveCasesTable(cases) {
  return MedicalCaseTable(cases, { detailBase: '#/doctor/cases' });
}

export const DoctorDashboardView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);

    cachedDoctorCases = cases;
    cachedActiveCases = medicalCaseService.getActive(cases)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const earnedCases = cases.filter((c) => EARNED_STATUSES.includes(c.status));
    const actionable = cases
      .filter((c) => ACTION_STATUSES.includes(c.status))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    const earnedMargin = earnedCases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
    const generatedThisYear = buildGeneratedData(cases, 'monthly').reduce((sum, item) => sum + item.value, 0);
    const avgTicket = earnedCases.length ? Math.round(earnedMargin / earnedCases.length) : 0;
    const pipelinePotential = cases.reduce((sum, c) => sum + pipelineValue(c), 0);
    const quotedCases = cases.filter((c) => QUOTED_STATUSES.includes(c.status));
    const conversionPct = pct(earnedCases.length, quotedCases.length);
    const marketCases = cases.filter((c) => (c.marketReferenceCost || 0) > 0 && (c.finalPatientValue || 0) > 0);
    const avgSavings = marketCases.length
      ? `${pct(
        marketCases.reduce((sum, c) => sum + Math.max(0, (c.marketReferenceCost - c.finalPatientValue) / c.marketReferenceCost), 0),
        marketCases.length,
        1,
      )}%`
      : '—';

    return `
      <section class="doctor-hero">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> ${escapeHtml(doctor.clinicName)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(doctor.status)}
            <span class="chip">${escapeHtml(doctor.specialty || 'Aliado CS Travel')}</span>
            <span class="chip">Cuenta verificada</span>
          </p>
        </div>
        <span class="doctor-hero__plane" aria-hidden="true"></span>
      </section>

      <section class="earnings-band" aria-label="Resumen de ganancias">
        <div class="earnings-band__main">
          <span class="earnings-band__label">Ganancias acumuladas</span>
          <strong class="earnings-band__value">${formatCurrency(earnedMargin)}</strong>
          <span class="earnings-band__hint">
            <span class="earnings-band__hint-dot" aria-hidden="true"></span>
            ${actionable.length
              ? `${actionable.length} cotizacion${actionable.length === 1 ? '' : 'es'} esperando tu decision`
              : 'Sin decisiones pendientes por ahora'}
          </span>
        </div>
        <div class="earnings-band__side">
          <div class="earnings-band__side-row">
            <span class="muted-block">Generado este año</span>
            <strong>${formatCurrency(generatedThisYear)}</strong>
            <small>Margen consolidado en ${new Date().getFullYear()}</small>
          </div>
          <div class="earnings-band__side-row">
            <span class="muted-block">Ticket promedio</span>
            <strong>${formatCurrency(avgTicket)}</strong>
            <small>${earnedCases.length} caso(s) con margen ganado</small>
          </div>
        </div>
      </section>

      <section class="doctor-flow-grid">
        <div class="panel panel--action">
          <div class="panel__header">
            <div>
              <span class="section-label section-label--inline">Tu flujo de trabajo</span>
              <h2 class="panel__title">Esperando tu decision</h2>
            </div>
            <span class="chip chip--alert">${actionable.length} pendiente${actionable.length === 1 ? '' : 's'}</span>
          </div>
          ${renderDecisionPanel(actionable, pipelinePotential)}
        </div>

        <div class="panel panel--chart panel--doctor-chart">
          <div class="panel__header">
            <h2 class="panel__title">Ganancias por periodo</h2>
            <select id="generated-range" class="form__input generated-range" aria-label="Rango de tiempo">
              <option value="monthly">Mensual (${new Date().getFullYear()})</option>
              <option value="annual">Anual (historico)</option>
            </select>
          </div>
          <div id="generated-chart">${renderGeneratedChart(cases, 'monthly')}</div>
        </div>
      </section>

      <section class="doctor-kpi-row" aria-label="KPIs operativos">
        ${kpiCard({ label: 'Casos totales', value: String(cases.length), hint: 'Registrados en tu portal', icon: ICONS.briefcase, accent: 'blue', trend: [18, 22, 28, 34, 38, 42, 46, 52] })}
        ${kpiCard({ label: 'Casos activos', value: String(cachedActiveCases.length), hint: `${actionable.length} en accion`, icon: ICONS.activity, accent: 'green', trend: [12, 20, 26, 30, 36, 40, 48, 54] })}
        ${kpiCard({ label: 'Conversion de cotizaciones', value: `${conversionPct}%`, hint: `${earnedCases.length}/${quotedCases.length || 0} aprobadas`, icon: ICONS.trend, accent: 'amber', trend: [16, 20, 26, 34, 44, 52, 58, 64] })}
        ${kpiCard({ label: 'Ahorro promedio paciente', value: avgSavings, hint: marketCases.length ? `${marketCases.length} referencias de mercado` : 'Sin referencia cargada', icon: ICONS.money, accent: 'violet', trend: [14, 18, 22, 24, 30, 36, 42, 48] })}
      </section>

      <section class="doctor-insights-grid">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Mis casos por estado</h2>
            <span class="muted">${cases.length} en total</span>
          </div>
          ${renderStatusChart(cases)}
        </div>

        <div class="panel panel--dashboard-active">
          <div class="panel__header">
            <h2 class="panel__title">Casos activos</h2>
            <a href="#/doctor/cases" class="link">Ver todos →</a>
          </div>
          <div class="dashboard-active-toolbar">
            <input id="dashboard-active-search" class="form__input table-toolbar__search" type="search"
              placeholder="Buscar codigo, paciente o destino..." />
            <span class="table-toolbar__count" id="dashboard-active-count"></span>
          </div>
          <div id="dashboard-active-table">${renderActiveCasesTable(cachedActiveCases)}</div>
        </div>
      </section>
    `;
  },

  async afterRender() {
    const range = document.getElementById('generated-range');
    const chart = document.getElementById('generated-chart');
    range?.addEventListener('change', () => {
      chart.innerHTML = renderGeneratedChart(cachedDoctorCases, range.value);
    });

    const search = document.getElementById('dashboard-active-search');
    const table = document.getElementById('dashboard-active-table');
    const countLabel = document.getElementById('dashboard-active-count');

    const applyActiveFilter = () => {
      const q = search?.value.trim().toLowerCase() || '';
      const filtered = cachedActiveCases.filter((item) => {
        if (!q) return true;
        return [item.caseCode, item.patientName, item.procedure, item.origin, item.destination]
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
      countLabel.textContent = `${filtered.length} de ${cachedActiveCases.length} caso(s)`;
      table.innerHTML = renderActiveCasesTable(filtered);
    };

    search?.addEventListener('input', applyActiveFilter);
    applyActiveFilter();
  },
};
