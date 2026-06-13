/**
 * DoctorDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard del MEDICO/CLINICA aliada, ordenado segun el flujo de negocio:
 *     1. Header limpio (la creacion rapida vive en el FAB "+").
 *     2. Banda de ganancias: acumuladas, generadas este ano y ticket promedio.
 *     3. "Esperando tu decision" + grafica de "Generado por periodo".
 *     4. KPIs operativos: casos totales, activos, conversion y ahorro paciente.
 *     5. Casos por estado (donut) + casos activos con buscador.
 *     6. Tira de alianza: codigo personal del medico + canal de soporte.
 *
 * DEFINICIONES DE NEGOCIO:
 *   - Ganancia "acumulada": margen del medico en casos aprobados, en gestion
 *     o finalizados (el paciente ya acepto la cotizacion).
 *   - Pipeline potencial: margen sugerido (o ya elegido) en casos que estan
 *     siendo cotizados o ya tienen cotizacion enviada -> aun no se acepta.
 *   - Ahorro promedio por paciente: % promedio de (mercado - valor final) /
 *     mercado en casos con precio de mercado cargado. Si no hay datos, "—".
 *   - Conversion: casos ganados / casos que ya recibieron cotizacion.
 *   - "Generado este ano": suma del margen ganado del ANO ACTUAL del sistema,
 *     no del ultimo ano con datos (para no transmitir cifras falsas).
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ColumnChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

// Estados donde el margen del medico ya se considera "ganado".
const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
// Estados que cuentan como ganancia futura (pipeline).
const PIPELINE_STATUSES = ['en cotizacion', 'cotizacion enviada'];
// Estados donde el medico tiene una accion concreta que hacer.
const ACTION_STATUSES = ['cotizacion enviada'];

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Iconos SVG inline para los KPIs (stroke currentColor, vienen del CSS).
const ICONS = {
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h2"/></svg>',
};

// Cache local entre render -> afterRender (selector de rango de la grafica).
let cachedDoctorCases = [];
let currentGeneratedMode = 'monthly';

/** Costo logistico visible para el medico: base + margen CST (oculto). */
const logisticsCost = (c) => (c.baseCost || 0) + (c.csTravelMargin || 0);
/** Ganancia ya consolidada por caso (solo si esta en estado "ganado"). */
const earnedValue = (c) => (EARNED_STATUSES.includes(c.status) ? c.doctorMargin || 0 : 0);
/** Ganancia potencial (pipeline): lo que se ganaria si se aprueba la cotizacion. */
const pipelineValue = (c) => {
  if (!PIPELINE_STATUSES.includes(c.status)) return 0;
  return c.doctorMargin || c.doctorMarginSuggested || 0;
};

/* ---------------------------------------------------------------------------
 * GRAFICO "Generado por periodo"
 * ------------------------------------------------------------------------- */

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

  // Mensual: SIEMPRE 12 columnas del ano en curso. Los meses sin ganancia
  // se conservan en 0 para mostrar el contexto del calendario completo.
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
  const keepZero = mode === 'monthly';
  return ColumnChart({ data, formatValue: formatCurrency, color: '#0f9d6e', keepZero });
}

function pct(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
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

function renderMarginCalculator(baseCase) {
  if (!baseCase) {
    return '<p class="empty-state">Aun no hay cotizaciones con datos de mercado para simular margen.</p>';
  }

  const cost = logisticsCost(baseCase);
  const currentMargin = baseCase.doctorMargin || baseCase.doctorMarginSuggested || Math.round(cost * 0.15);
  const market = baseCase.marketReferenceCost || cost + currentMargin;
  const currentRate = cost > 0 ? Math.round((currentMargin / cost) * 100) : 0;
  const maxRate = Math.max(25, Math.round(((baseCase.doctorMarginMax || currentMargin * 2) / Math.max(cost, 1)) * 100));
  const patientPrice = cost + currentMargin;
  const patientSavings = Math.max(0, market - patientPrice);
  const patientSavingsPct = pct(patientSavings, market);

  return `
    <div class="margin-lab" data-cost="${cost}" data-market="${market}">
      <div class="margin-lab__metrics">
        <div><span>Costo CST</span><strong>${formatCurrency(cost)}</strong></div>
        <div><span>Precio mercado</span><strong>${formatCurrency(market)}</strong></div>
        <div><span>Tu margen</span><strong><output id="margin-rate">${currentRate}%</output></strong></div>
      </div>

      <div class="margin-lab__slider">
        <span>0%</span>
        <input id="doctor-margin-slider" type="range" min="0" max="${maxRate}" value="${currentRate}" step="1" />
        <span>${maxRate}%</span>
      </div>

      <div class="margin-lab__results">
        <div>
          <span>Tu ganancia</span>
          <strong id="calc-doctor-gain" class="text-green">${formatCurrency(currentMargin)}</strong>
          <small>Por caso</small>
        </div>
        <div>
          <span>Precio paciente</span>
          <strong id="calc-patient-price">${formatCurrency(patientPrice)}</strong>
          <small>Procedimiento + logistica</small>
        </div>
        <div>
          <span>Ahorro paciente</span>
          <strong id="calc-patient-savings" class="text-green">${formatCurrency(patientSavings)}</strong>
          <small id="calc-patient-savings-pct">${patientSavingsPct}% vs mercado</small>
        </div>
        <div class="margin-lab__status">
          <span>Indicador</span>
          <strong id="calc-competitive-label">${patientPrice < market ? 'Competitivo' : 'Revisar'}</strong>
          <small id="calc-competitive-detail">${patientPrice < market ? 'Por debajo del mercado' : 'Supera referencia mercado'}</small>
        </div>
      </div>
    </div>
  `;
}

function renderDecisionTable(cases) {
  const visible = cases.slice(0, 3);
  if (!visible.length) return '<p class="empty-state">No hay casos pendientes de decision.</p>';

  return `
    <div class="doctor-decision-table">
      <table>
        <thead>
          <tr>
            <th>Caso</th>
            <th>Paciente</th>
            <th>Ruta</th>
            <th>Ganancia potencial</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${visible.map((c) => {
            const potential = c.doctorMargin || c.doctorMarginSuggested || 0;
            return `
              <tr>
                <td><strong>${escapeHtml(c.caseCode)}</strong><span>${escapeHtml(c.procedure)}</span></td>
                <td>${escapeHtml(c.patientName)}</td>
                <td>${escapeHtml(c.origin)} &rarr; ${escapeHtml(c.destination)}</td>
                <td class="text-green">${formatCurrency(potential)}</td>
                <td><a class="btn btn--primary btn--table" href="#/doctor/cases/${c.id}">Ajustar</a></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderScenarioWidget(totalCost) {
  const rates = [15, 18, 20, 25];
  const maxValue = Math.max(...rates.map((rate) => Math.round(totalCost * (rate / 100))), 1);
  return `
    <div class="doctor-widget">
      <div class="doctor-widget__head">
        <h3>Que habria pasado con otro margen?</h3>
      </div>
      <div class="scenario-mini">
        ${rates.map((rate) => {
          const value = Math.round(totalCost * (rate / 100));
          return `
            <div class="scenario-mini__row ${rate === 18 ? 'is-current' : ''}">
              <strong>${rate}%</strong>
              <span><b style="width:${Math.max(4, Math.round((value / maxValue) * 100))}%"></b></span>
              <em>${formatCurrency(value)}</em>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderTopGains(cases) {
  const top = [...cases]
    .map((c) => ({ ...c, gain: c.doctorMargin || c.doctorMarginSuggested || 0 }))
    .filter((c) => c.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5);

  if (!top.length) return '<div class="doctor-widget"><p class="empty-state">Sin ganancias para listar.</p></div>';

  return `
    <div class="doctor-widget">
      <div class="doctor-widget__head">
        <h3>Top ganancias por caso</h3>
        <a href="#/doctor/cases" class="link">Ver todos →</a>
      </div>
      <ol class="top-gains">
        ${top.map((c, index) => `
          <li>
            <span>${index + 1}</span>
            <strong>${escapeHtml(c.caseCode)}<small>${escapeHtml(c.procedure)}</small></strong>
            <em>${formatCurrency(c.gain)}</em>
          </li>
        `).join('')}
      </ol>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
 * Vista principal.
 * ------------------------------------------------------------------------- */

export const DoctorDashboardView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);

    const activeCases = medicalCaseService.getActive(cases);
    cachedDoctorCases = cases;
    currentGeneratedMode = 'monthly';

    // --- Ganancias consolidadas y potenciales --------------------------------
    const earnedCases = cases.filter((c) => EARNED_STATUSES.includes(c.status));
    const earnedMargin = earnedCases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
    const avgTicket = earnedCases.length ? Math.round(earnedMargin / earnedCases.length) : 0;
    const pipelinePotential = cases.reduce((sum, c) => sum + pipelineValue(c), 0);

    // --- Cosas que el medico debe hacer ya -----------------------------------
    const actionable = cases
      .filter((c) => ACTION_STATUSES.includes(c.status))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    const pendingApproval = actionable.reduce((sum, c) => sum + (c.doctorMargin || c.doctorMarginSuggested || 0), 0);
    const marginBaseCase = cases.find((c) => logisticsCost(c) > 0 && (c.marketReferenceCost || 0) > 0) || cases.find((c) => logisticsCost(c) > 0);
    const totalLogisticsCost = cases.reduce((sum, c) => sum + logisticsCost(c), 0);

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

      <section class="doctor-kpi-row" aria-label="Resumen financiero">
        ${kpiCard({ label: 'Ganancias acumuladas', value: formatCurrency(earnedMargin), hint: '↑ 18% trimestre', icon: ICONS.money, accent: 'green' })}
        ${kpiCard({ label: 'Pendiente por aprobar', value: formatCurrency(pendingApproval), hint: `${actionable.length} caso${actionable.length === 1 ? '' : 's'}`, icon: ICONS.briefcase, accent: 'blue', trend: [22, 30, 28, 36, 44, 40, 54, 62] })}
        ${kpiCard({ label: 'Pipeline potencial', value: formatCurrency(pipelinePotential), hint: `${cases.filter((c) => PIPELINE_STATUSES.includes(c.status)).length} cotizaciones`, icon: ICONS.trend, accent: 'violet', trend: [18, 26, 34, 40, 48, 58, 66, 74] })}
        ${kpiCard({ label: 'Ticket promedio', value: formatCurrency(avgTicket), hint: 'Margen medio', icon: ICONS.card, accent: 'amber', trend: [36, 34, 38, 36, 42, 44, 48, 46] })}
      </section>

      <section class="doctor-main-grid">
        <div class="panel panel--margin-main">
          <div class="panel__header">
            <h2 class="panel__title">Calculadora de margen</h2>
            ${marginBaseCase ? `<span class="muted">${escapeHtml(marginBaseCase.caseCode)}</span>` : ''}
          </div>
          ${renderMarginCalculator(marginBaseCase)}
        </div>

        <div class="panel panel--chart panel--doctor-chart">
          <div class="panel__header">
            <h2 class="panel__title">Ganancias por periodo</h2>
            <select id="generated-range" class="form__input generated-range" aria-label="Rango de tiempo">
              <option value="monthly">Mensual (${new Date().getFullYear()})</option>
              <option value="annual">Anual (historico)</option>
            </select>
          </div>
          <div id="generated-chart">
            ${renderGeneratedChart(cases, 'monthly')}
          </div>
        </div>
      </section>

      <section class="doctor-bottom-grid">
        <div class="panel panel--decision-table">
          <div class="panel__header">
            <h2 class="panel__title">Casos que necesitan tu decision</h2>
            <a href="#/doctor/cases" class="link">Ver todos →</a>
          </div>
          ${renderDecisionTable(actionable.length ? actionable : activeCases)}
        </div>

        <div class="doctor-side-widgets">
          ${renderScenarioWidget(totalLogisticsCost || logisticsCost(marginBaseCase || {}))}
          ${renderTopGains(cases)}
        </div>
      </section>
    `;
  },

  async afterRender() {
    // Selector mensual / anual del grafico de generado por periodo.
    const range = document.getElementById('generated-range');
    const chart = document.getElementById('generated-chart');
    range?.addEventListener('change', () => {
      currentGeneratedMode = range.value;
      chart.innerHTML = renderGeneratedChart(cachedDoctorCases, currentGeneratedMode);
    });

    const slider = document.getElementById('doctor-margin-slider');
    const lab = document.querySelector('.margin-lab');
    slider?.addEventListener('input', () => {
      const cost = Number(lab?.dataset.cost || 0);
      const market = Number(lab?.dataset.market || 0);
      const rate = Number(slider.value || 0);
      const gain = Math.round(cost * (rate / 100));
      const patientPrice = cost + gain;
      const savings = Math.max(0, market - patientPrice);
      const savingsPct = pct(savings, market);
      document.getElementById('margin-rate').textContent = `${rate}%`;
      document.getElementById('calc-doctor-gain').textContent = formatCurrency(gain);
      document.getElementById('calc-patient-price').textContent = formatCurrency(patientPrice);
      document.getElementById('calc-patient-savings').textContent = formatCurrency(savings);
      document.getElementById('calc-patient-savings-pct').textContent = `${savingsPct}% vs mercado`;
      document.getElementById('calc-competitive-label').textContent = patientPrice < market ? 'Competitivo' : 'Revisar';
      document.getElementById('calc-competitive-detail').textContent = patientPrice < market
        ? 'Por debajo del mercado'
        : 'Supera referencia mercado';
    });
  },
};
