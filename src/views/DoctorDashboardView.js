/**
 * DoctorDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard del MEDICO/CLINICA aliada, ordenado segun el flujo de negocio:
 *     1. GANANCIAS ACUMULADAS (lo primero que ve al entrar).
 *     2. Cards: casos totales, casos activos, ahorro promedio por paciente
 *        y conversion de cotizaciones.
 *     3. Casos activos (con buscador) + historial reciente.
 *     4. Graficos de apoyo (generado por periodo, estado y pacientes).
 *
 * DEFINICIONES DE NEGOCIO:
 *   - Ganancia "acumulada": margen del medico en casos aprobados, en gestion
 *     o finalizados (el paciente ya acepto la cotizacion).
 *   - Ahorro promedio por paciente: % promedio de (mercado - valor final) /
 *     mercado en casos con precio de mercado cargado.
 *   - Conversion: casos ganados / casos que ya recibieron cotizacion.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { MetricCard } from '../components/MetricCard.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { DonutChart, ColumnChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

// Estados donde el margen del medico ya se considera "ganado".
const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
// Estados donde el caso YA recibio cotizacion (para medir conversion).
const QUOTED_STATUSES = ['cotizacion enviada', 'aprobada', 'en gestion', 'finalizada', 'cancelada'];

// Cache de casos activos para el buscador del dashboard.
let cachedActiveCases = [];
let cachedDoctorCases = [];

/** Costo logistico visible para el medico: base + margen CST (oculto). */
const logisticsCost = (c) => (c.baseCost || 0) + (c.csTravelMargin || 0);
const generatedValue = (c) => (EARNED_STATUSES.includes(c.status) ? c.doctorMargin || 0 : 0);

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function buildGeneratedData(cases, mode = 'monthly') {
  const source = cases.filter((c) => generatedValue(c) > 0);
  if (!source.length) return [];

  if (mode === 'annual') {
    const byYear = source.reduce((acc, c) => {
      const year = String(new Date(c.updatedAt || c.createdAt).getFullYear());
      acc[year] = (acc[year] || 0) + generatedValue(c);
      return acc;
    }, {});
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([label, value]) => ({ label, value, color: '#061953' }));
  }

  const latestYear = Math.max(...source.map((c) => new Date(c.updatedAt || c.createdAt).getFullYear()));
  const totals = Array.from({ length: 12 }, () => 0);
  source.forEach((c) => {
    const date = new Date(c.updatedAt || c.createdAt);
    if (date.getFullYear() === latestYear) totals[date.getMonth()] += generatedValue(c);
  });
  return totals.map((value, index) => ({
    label: MONTH_LABELS[index],
    value,
    color: value > 0 ? '#0b5ed7' : '#dbe7f7',
  }));
}

function renderGeneratedChart(cases, mode = 'monthly') {
  const data = buildGeneratedData(cases, mode);
  return ColumnChart({ data, formatValue: formatCurrency, color: '#061953' });
}

function renderPatientAccordion(cases) {
  if (!cases.length) return '<p class="empty-state">Sin pacientes registrados.</p>';

  return cases
    .map((c, index) => {
      const finalValue = logisticsCost(c) + (c.doctorMargin || 0);
      return `
        <details class="patient-accordion__item" ${index === 0 ? 'open' : ''}>
          <summary>
            <span>
              <strong>${escapeHtml(c.patientName)}</strong>
              <small>${escapeHtml(c.caseCode)} · ${escapeHtml(c.procedure)}</small>
            </span>
            <span class="mini-list__tag">${escapeHtml(c.status)}</span>
          </summary>
          <div class="patient-accordion__body">
            <div><span class="muted-block">Ruta</span><strong>${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}</strong></div>
            <div><span class="muted-block">Fecha</span><strong>${formatDate(c.travelDate)}</strong></div>
            <div><span class="muted-block">Valor paciente</span><strong>${finalValue > 0 ? formatCurrency(finalValue) : 'Pendiente'}</strong></div>
            <div><span class="muted-block">Tu margen</span><strong class="text-green">${formatCurrency(c.doctorMargin || 0)}</strong></div>
          </div>
        </details>
      `;
    })
    .join('');
}

export const DoctorDashboardView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);

    const activeCases = medicalCaseService.getActive(cases);
    cachedActiveCases = activeCases;
    cachedDoctorCases = cases;
    const recent = [...cases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // --- Ganancias -------------------------------------------------------
    const earnedCases = cases.filter((c) => EARNED_STATUSES.includes(c.status));
    const earnedMargin = earnedCases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);

    // --- Ahorro promedio por paciente vs. mercado -------------------------
    const withMarket = cases.filter((c) => (c.marketReferenceCost || 0) > 0 && (c.finalPatientValue || 0) > 0);
    const avgSavingsPct = withMarket.length
      ? Math.round(
          (withMarket.reduce((sum, c) => sum + (c.marketReferenceCost - c.finalPatientValue) / c.marketReferenceCost, 0) /
            withMarket.length) * 100
        )
      : 0;

    // --- Conversion: ganados / cotizados ----------------------------------
    const quotedCount = cases.filter((c) => QUOTED_STATUSES.includes(c.status)).length;
    const conversionPct = quotedCount > 0 ? Math.round((earnedCases.length / quotedCount) * 100) : 0;

    const generatedThisYear = buildGeneratedData(cases, 'monthly').reduce((sum, item) => sum + item.value, 0);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> ${escapeHtml(doctor.clinicName)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(doctor.status)}
            <span class="chip">${escapeHtml(doctor.name)}</span>
            <span class="chip">Codigo de aliado: ${escapeHtml(doctor.sharedCode)}</span>
          </p>
        </div>
        <button type="button" class="btn btn--primary" data-action="open-quick-create">+ Nuevo caso</button>
      </div>

      <!-- 1. Ganancias + generado por periodo. -->
      <section class="doctor-command-grid">
        <div class="earnings-hero">
          <span class="earnings-hero__value">${formatCurrency(earnedMargin)}</span>
          <span class="earnings-hero__label">Ganancias acumuladas</span>
          <span class="earnings-hero__pending">${formatCurrency(generatedThisYear)} generados este ano</span>
        </div>

        <div class="panel panel--chart">
          <div class="panel__header">
            <div>
              <h2 class="panel__title">Generado por periodo</h2>
              <p class="muted" style="font-size:.82rem">Margen medico acumulado en casos aprobados, en gestion o finalizados.</p>
            </div>
            <select id="generated-range" class="form__input generated-range">
              <option value="monthly">Mensual</option>
              <option value="annual">Anual</option>
            </select>
          </div>
          <div id="generated-chart">
            ${renderGeneratedChart(cases, 'monthly')}
          </div>
        </div>
      </section>

      <!-- 2. Cards de resumen. -->
      <section class="metrics-grid">
        ${MetricCard({ label: 'Casos totales', value: String(cases.length) })}
        ${MetricCard({ label: 'Casos activos', value: String(activeCases.length) })}
        ${MetricCard({ label: 'Ahorro promedio para tus pacientes', value: `${avgSavingsPct}%` })}
        ${MetricCard({ label: 'Conversion de cotizaciones', value: `${conversionPct}%` })}
      </section>

      <!-- 3. Estado + pacientes desplegables. -->
      <section class="doctor-insights-grid">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Mis casos por estado</h2>
          </div>
          ${DonutChart({
            data: Object.entries(
              cases.reduce((acc, c) => {
                acc[c.status] = (acc[c.status] || 0) + 1;
                return acc;
              }, {})
            ).map(([label, value]) => ({ label, value })),
            centerLabel: 'casos',
          })}
        </div>

        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Pacientes y casos</h2>
            <a href="#/doctor/cases" class="link">Ver todos →</a>
          </div>
          <div class="patient-accordion">
            ${renderPatientAccordion(recent)}
          </div>
        </div>
      </section>

      <!-- 4. Casos activos (con buscador) + historial reciente. -->
      <section class="dashboard-split">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Casos activos</h2>
            <input id="dash-case-search" class="form__input table-toolbar__search" type="search"
              placeholder="Buscar..." style="max-width:200px" />
            <a href="#/doctor/cases" class="link">Ver todos →</a>
          </div>
          <div id="dash-active-cases">
            ${MedicalCaseTable(activeCases, { detailBase: '#/doctor/cases' })}
          </div>
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Historial reciente</h2>
          </div>
          <div class="mini-list">
            ${recent.slice(0, 5).map((c) => `
              <div class="mini-list__item" data-href="#/doctor/cases/${c.id}">
                <div>
                  <span class="mini-list__code">${escapeHtml(c.caseCode)}</span>
                  <span class="muted-block">${formatDate(c.travelDate)} · ${escapeHtml(c.patientName)}</span>
                </div>
                <span class="mini-list__tag">${escapeHtml(c.status)}</span>
              </div>
            `).join('') || '<p class="empty-state">Sin casos.</p>'}
          </div>
          <p class="panel__footnote">Ultima actualizacion: ${formatDate(doctor.lastUpdate, true)}</p>
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

    // Buscador de la tabla de casos activos del dashboard.
    const search = document.getElementById('dash-case-search');
    const table = document.getElementById('dash-active-cases');
    if (search && table) {
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        const filtered = cachedActiveCases.filter((c) =>
          [c.caseCode, c.patientName, c.procedure, c.origin, c.destination, c.status].join(' ').toLowerCase().includes(q)
        );
        table.innerHTML = MedicalCaseTable(filtered, { detailBase: '#/doctor/cases' });
      });
    }
  },
};
