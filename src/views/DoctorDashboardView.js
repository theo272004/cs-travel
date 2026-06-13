/**
 * DoctorDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard del MEDICO/CLINICA aliada, ordenado segun el flujo de negocio:
 *     1. GANANCIAS ACUMULADAS (lo primero que ve al entrar).
 *     2. Cards: casos totales, casos activos, ahorro promedio por paciente
 *        y conversion de cotizaciones.
 *     3. Casos activos (con buscador) + historial reciente.
 *     4. Simulador "¿Cuanto habrias ganado con otro margen?".
 *     5. Graficos de apoyo (estado, margen por caso, gauge, ultimo caso).
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
import { DonutChart, ColumnChart, GaugeChart, StackedBar } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

// Estados donde el margen del medico ya se considera "ganado".
const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
// Estados donde el caso YA recibio cotizacion (para medir conversion).
const QUOTED_STATUSES = ['cotizacion enviada', 'aprobada', 'en gestion', 'finalizada', 'cancelada'];

// Margenes alternativos del simulador (% sobre el costo logistico CST).
const SIMULATOR_RATES = [5, 8, 10, 12, 15, 20];

// Cache de casos activos para el buscador del dashboard.
let cachedActiveCases = [];

/** Costo logistico visible para el medico: base + margen CST (oculto). */
const logisticsCost = (c) => (c.baseCost || 0) + (c.csTravelMargin || 0);

export const DoctorDashboardView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);

    const activeCases = medicalCaseService.getActive(cases);
    cachedActiveCases = activeCases;
    const recent = [...cases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // --- Ganancias -------------------------------------------------------
    const earnedCases = cases.filter((c) => EARNED_STATUSES.includes(c.status));
    const earnedMargin = earnedCases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
    const projectedMargin = cases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
    const pendingMargin = projectedMargin - earnedMargin;

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

    // --- Simulador: ¿cuanto habrias ganado con otro margen? ---------------
    // Base: casos ganados; si aun no hay, usa todos los cotizados.
    const simBase = earnedCases.length ? earnedCases : cases.filter((c) => logisticsCost(c) > 0);
    const simCostSum = simBase.reduce((sum, c) => sum + logisticsCost(c), 0);
    const simEarned = simBase.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
    const avgRate = simCostSum > 0 ? Math.round((simEarned / simCostSum) * 1000) / 10 : 0;
    const simRates = [...new Set([...SIMULATOR_RATES, Math.round(avgRate)])].filter((r) => r > 0).sort((a, b) => a - b);
    const simMax = Math.max(...simRates.map((r) => (r / 100) * simCostSum), simEarned, 1);

    // --- Ultimo caso cotizado (acceso directo a la calculadora) -----------
    const latestQuoted = [...cases]
      .filter((c) => (c.baseCost || 0) > 0)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0];

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

      <!-- 1. Ganancias acumuladas: lo primero que ve el medico. -->
      <section class="earnings-hero">
        <span class="earnings-hero__value">${formatCurrency(earnedMargin)}</span>
        <span class="earnings-hero__label">Ganancias acumuladas</span>
        ${pendingMargin > 0 ? `<span class="earnings-hero__pending">+ ${formatCurrency(pendingMargin)} pendientes de aprobacion del paciente</span>` : ''}
      </section>

      <!-- 2. Cards de resumen. -->
      <section class="metrics-grid">
        ${MetricCard({ label: 'Casos totales', value: String(cases.length) })}
        ${MetricCard({ label: 'Casos activos', value: String(activeCases.length) })}
        ${MetricCard({ label: 'Ahorro promedio para tus pacientes', value: `${avgSavingsPct}%` })}
        ${MetricCard({ label: 'Conversion de cotizaciones', value: `${conversionPct}%` })}
      </section>

      <!-- 3. Casos activos (con buscador) + historial reciente. -->
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

      <!-- 4. Simulador de margen + graficos de apoyo. -->
      <section class="charts-grid">
        <div class="panel">
          <div class="panel__header">
            <div>
              <h2 class="panel__title">¿Cuanto habrias ganado con otro margen?</h2>
              <p class="muted" style="font-size:.82rem">Basado en ${simBase.length} caso(s) ${earnedCases.length ? 'ganados' : 'cotizados'}.</p>
            </div>
          </div>
          <div class="simulator__summary">
            <div>
              <span class="muted-block">Margen utilizado promedio</span>
              <strong>${avgRate}%</strong>
            </div>
            <div>
              <span class="muted-block">Ganancia obtenida</span>
              <strong class="text-green">${formatCurrency(simEarned)}</strong>
            </div>
          </div>
          <div class="simulator__rows">
            ${simRates.map((rate) => {
              const estimate = Math.round((rate / 100) * simCostSum);
              const isCurrent = Math.abs(rate - avgRate) < 1;
              return `
                <div class="simulator__row ${isCurrent ? 'is-current' : ''}"
                  data-tip="${escapeHtml(`Con ${rate}% habrias ganado ${formatCurrency(estimate)}`)}">
                  <span class="simulator__rate">${rate}%${isCurrent ? ' (actual)' : ''}</span>
                  <div class="simulator__track"><div class="simulator__fill" style="width:${Math.round((estimate / simMax) * 100)}%"></div></div>
                  <span class="simulator__value">${formatCurrency(estimate)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Margen ganado vs. proyectado</h2>
          </div>
          ${GaugeChart({ value: earnedMargin, max: projectedMargin, formatValue: formatCurrency })}
        </div>

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

        ${latestQuoted ? `
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Ultimo caso cotizado</h2>
            <a href="#/doctor/cases/${latestQuoted.id}" class="link">Abrir calculadora →</a>
          </div>
          <p class="muted" style="margin-bottom:12px">
            <strong>${escapeHtml(latestQuoted.caseCode)}</strong> · ${escapeHtml(latestQuoted.patientName)}
            · ${formatDate(latestQuoted.travelDate)}
          </p>
          ${StackedBar({
            segments: [
              { key: 'log', label: 'Costo logistico CST', value: logisticsCost(latestQuoted), color: '#2f86ff' },
              { key: 'doctor', label: 'Tu margen', value: latestQuoted.doctorMargin, color: '#0f9d6e' },
            ],
            formatValue: formatCurrency,
          })}
        </div>
        ` : ''}
      </section>
    `;
  },

  async afterRender() {
    // Buscador de la tabla de casos activos del dashboard.
    const search = document.getElementById('dash-case-search');
    const table = document.getElementById('dash-active-cases');
    if (!search || !table) return;

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const filtered = cachedActiveCases.filter((c) =>
        [c.caseCode, c.patientName, c.procedure, c.origin, c.destination, c.status].join(' ').toLowerCase().includes(q)
      );
      table.innerHTML = MedicalCaseTable(filtered, { detailBase: '#/doctor/cases' });
    });
  },
};
