/**
 * DoctorDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard del MEDICO/CLINICA aliada con composicion compacta y ejecutiva:
 *     1. Resumen financiero en 4 tarjetas.
 *     2. Calculadora de margen + ganancias por periodo.
 *     3. Casos que requieren decision.
 *     4. KPIs operativos compactos.
 *     5. Casos por estado + casos activos.
 *     6. Simulador de margen + top ganancias.
 *     7. Soporte CST.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ColumnChart, DonutChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
const PIPELINE_STATUSES = ['en cotizacion', 'cotizacion enviada'];
const ACTION_STATUSES = ['cotizacion enviada'];
const QUOTED_STATUSES = ['cotizacion enviada', 'aprobada', 'en gestion', 'finalizada'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const SUPPORT_EMAIL = 'soporte@cstravel.co';

const ICONS = {
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h2"/></svg>',
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
  const factor = 10 ** digits;
  return Math.round(((value / total) * 100) * factor) / factor;
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
  const currentMonth = new Date().getMonth();

  if (mode === 'annual') {
    if (!source.length) return [];
    const annualData = Object.entries(source.reduce((acc, c) => {
      const year = String(new Date(c.updatedAt || c.createdAt).getFullYear());
      acc[year] = (acc[year] || 0) + earnedValue(c);
      return acc;
    }, {}))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([label, value]) => ({ label, value }));
    const maxAnnual = Math.max(...annualData.map((item) => item.value), 1);
    return annualData.map((item) => ({
      ...item,
      color: item.value === maxAnnual ? '#8f8c92' : '#1f2523',
    }));
  }

  const totals = Array.from({ length: currentMonth + 1 }, () => 0);
  source.forEach((c) => {
    const date = new Date(c.updatedAt || c.createdAt);
    if (date.getFullYear() === currentYear && date.getMonth() <= currentMonth) {
      totals[date.getMonth()] += earnedValue(c);
    }
  });

  const maxMonthly = Math.max(...totals, 1);
  return totals.map((value, index) => ({
    label: MONTH_LABELS[index],
    value,
    color: value === maxMonthly ? '#8f8c92' : '#1f2523',
  }));
}

function renderGeneratedChart(cases, mode = 'monthly') {
  return ColumnChart({
    data: buildGeneratedData(cases, mode),
    formatValue: formatCurrency,
    color: '#1f2523',
    keepZero: mode === 'monthly',
  });
}

function dashboardCard({
  label,
  value,
  hint,
  icon,
  accent = 'blue',
  highlight = false,
  compact = false,
  trend = [28, 38, 32, 46, 40, 56, 52, 68],
}) {
  return `
    <article class="doctor-kpi doctor-kpi--${escapeHtml(accent)} ${highlight ? 'doctor-kpi--hero' : ''} ${compact ? 'doctor-kpi--compact' : ''}">
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

function renderDecisionCards(cases) {
  if (!cases.length) {
    return `
      <div class="decision-empty">
        <strong>No tienes decisiones pendientes</strong>
        <p class="muted">Cuando CS Travel envie una nueva cotizacion, aparecera aqui para que ajustes el margen.</p>
      </div>
    `;
  }

  return `
    <div class="decision-card-row decision-card-row--image ${cases.length === 1 ? 'decision-card-row--single' : ''}">
      ${cases.slice(0, 3).map((c) => {
        const margin = c.doctorMargin || c.doctorMarginSuggested || 0;
        return `
          <article class="decision-card">
            <span class="decision-card__status" aria-hidden="true"></span>
            <div class="decision-card__body">
              <strong>${escapeHtml(c.patientName)}</strong>
              <span class="muted-block">${escapeHtml(c.caseCode)} · ${escapeHtml(c.procedure)}</span>
              <span class="muted-block">${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}</span>
            </div>
            <div class="decision-card__foot">
              <div>
                <span class="muted-block">Ganancia potencial</span>
                <strong class="text-green">${formatCurrency(margin)}</strong>
              </div>
              <a class="btn btn--primary btn--sm" href="#/doctor/cases/${c.id}">Ajustar margen</a>
            </div>
          </article>
        `;
      }).join('')}
    </div>
    <div class="pipeline-banner">
      <span class="pipeline-banner__label">Pipeline potencial</span>
      <strong class="pipeline-banner__value">${formatCurrency(cases.reduce((sum, c) => sum + (c.doctorMargin || c.doctorMarginSuggested || 0), 0))}</strong>
      <small>Lo que podrias sumar si tus pacientes aprueban las cotizaciones en curso.</small>
    </div>
  `;
}

function renderStatusChart(cases) {
  const byStatus = cases.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  return DonutChart({
    data: Object.entries(byStatus).map(([label, value]) => ({ label: statusLabel(label), value })),
    centerLabel: 'Casos',
    formatValue: (value) => String(value),
  });
}

function renderActiveCasesTable(cases) {
  const visible = cases.slice(0, 3);
  if (!visible.length) return '<p class="empty-state">No tienes casos activos.</p>';

  return `
    <div class="doctor-active-table">
      <table>
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Paciente</th>
            <th>Ruta</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map((c) => `
            <tr class="clickable-row" data-href="#/doctor/cases/${c.id}">
              <td><strong>${escapeHtml(c.caseCode)}</strong></td>
              <td>
                <strong>${escapeHtml(c.patientName)}</strong>
                <span>${escapeHtml(c.procedure)}</span>
              </td>
              <td>${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}</td>
              <td>${StatusBadge(c.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSupportStrip(doctor) {
  const subject = encodeURIComponent(`Soporte medico ${doctor.sharedCode}`);
  const body = encodeURIComponent(`Hola CS Travel, necesito apoyo con mi cuenta aliada ${doctor.sharedCode}.`);

  return `
    <section class="partner-strip">
      <div class="partner-strip__block">
        <span class="partner-strip__label">Soporte CST</span>
        <div class="partner-strip__code">
          <strong id="doctor-shared-code">${escapeHtml(doctor.sharedCode || 'CST-MED')}</strong>
          <button type="button" class="btn btn--ghost btn--sm" id="copy-shared-code">Copiar codigo</button>
        </div>
        <p class="muted">Usa este codigo para trazabilidad y seguimiento prioritario con el equipo CST.</p>
      </div>

      <div class="partner-strip__block">
        <span class="partner-strip__label">Canal prioritario</span>
        <strong>${SUPPORT_EMAIL}</strong>
        <span class="muted">Respuesta ejecutiva de lunes a viernes.</span>
      </div>

      <div class="partner-strip__block partner-strip__block--cta">
        <span class="partner-strip__label">Atencion</span>
        <a class="btn btn--primary partner-strip__cta" href="mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}">
          Contactar soporte
        </a>
      </div>
    </section>
  `;
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
    const pendingApproval = actionable.reduce((sum, c) => sum + (c.doctorMargin || c.doctorMarginSuggested || 0), 0);
    const pipelinePotential = cases.reduce((sum, c) => sum + pipelineValue(c), 0);
    const avgTicket = earnedCases.length ? Math.round(earnedMargin / earnedCases.length) : 0;

    return `
      <section class="doctor-hero doctor-hero--compact">
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

      <section class="doctor-kpi-row doctor-kpi-row--primary" aria-label="Resumen financiero">
        ${dashboardCard({ label: 'Ganancias acumuladas', value: formatCurrency(earnedMargin), hint: 'Margen consolidado', icon: ICONS.money, accent: 'green', highlight: true, trend: [22, 28, 26, 34, 42, 48, 56, 64] })}
        ${dashboardCard({ label: 'Pendiente por aprobar', value: formatCurrency(pendingApproval), hint: `${actionable.length} caso${actionable.length === 1 ? '' : 's'} en decision`, icon: ICONS.briefcase, accent: 'blue', trend: [18, 22, 26, 32, 38, 44, 50, 58] })}
        ${dashboardCard({ label: 'Pipeline potencial', value: formatCurrency(pipelinePotential), hint: `${cases.filter((c) => PIPELINE_STATUSES.includes(c.status)).length} cotizaciones`, icon: ICONS.trend, accent: 'violet', trend: [14, 20, 26, 32, 40, 48, 54, 60] })}
        ${dashboardCard({ label: 'Ticket promedio', value: formatCurrency(avgTicket), hint: `${earnedCases.length} caso(s) ganados`, icon: ICONS.card, accent: 'amber', trend: [30, 28, 34, 32, 38, 40, 44, 42] })}
      </section>

      <section class="doctor-main-grid">
        <div class="panel panel--decision-cards panel--decision-cards-dashboard">
          <div class="panel__header">
            <div>
              <span class="section-label section-label--inline">Tu flujo de trabajo</span>
              <h2 class="panel__title">Esperando tu decision</h2>
            </div>
            <span class="chip chip--alert">${actionable.length} pendiente${actionable.length === 1 ? '' : 's'}</span>
          </div>
          ${renderDecisionCards(actionable)}
        </div>

        <div class="panel panel--chart panel--doctor-chart">
          <div class="panel__header">
            <h2 class="panel__title">Ganancias por periodo</h2>
            <select id="generated-range" class="form__input generated-range" aria-label="Rango de tiempo">
              <option value="monthly">Mensual (${new Date().getFullYear()})</option>
              <option value="annual">Anual (historico)</option>
            </select>
          </div>
          <div class="doctor-period-card__body">
            <div id="generated-chart">${renderGeneratedChart(cases, 'monthly')}</div>
          </div>
        </div>
      </section>

      <section class="doctor-insights-grid doctor-insights-grid--compact">
        <div class="doctor-status-floating">
          <div class="doctor-status-floating__head">
            <h2 class="panel__title">Mis casos por estado</h2>
            <span class="muted">${cases.length} en total</span>
          </div>
          ${renderStatusChart(cases)}
        </div>

        <div class="panel panel--dashboard-active panel--dashboard-active-compact">
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

      ${renderSupportStrip(doctor)}
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
      countLabel.textContent = `${Math.min(filtered.length, 3)} de ${filtered.length} visibles`;
      table.innerHTML = renderActiveCasesTable(filtered);
    };
    search?.addEventListener('input', applyActiveFilter);
    applyActiveFilter();

    document.getElementById('copy-shared-code')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const code = document.getElementById('doctor-shared-code')?.textContent?.trim();
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        button.classList.add('is-copied');
        button.textContent = 'Copiado';
        setTimeout(() => {
          button.classList.remove('is-copied');
          button.textContent = 'Copiar codigo';
        }, 1200);
      } catch {}
    });
  },
};
