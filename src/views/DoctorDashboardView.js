/**
 * DoctorDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard privado del MEDICO/CLINICA aliada, inspirado en dashboards
 *   financieros modernos: saludo, KPIs, gauge de margen ganado vs proyectado,
 *   desglose del ultimo caso cotizado (con acceso al ajuste de margen),
 *   graficos por estado/caso y casos activos con buscador + historial lateral.
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

// Estados donde el margen del medico ya se considera "ganado" (caso en marcha o cerrado).
const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];

// Cache de casos activos para el buscador del dashboard.
let cachedActiveCases = [];

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

    // --- Margen ganado vs proyectado (gauge) ------------------------------
    // Ganado: margen de casos aprobados/en gestion/finalizados.
    // Proyectado: margen de todos los casos ya cotizados.
    const earnedMargin = cases
      .filter((c) => EARNED_STATUSES.includes(c.status))
      .reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
    const projectedMargin = cases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);

    // --- Ultimo caso cotizado (desglose + acceso al ajuste de margen) -----
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

      <section class="metrics-grid">
        ${MetricCard({ label: 'Casos registrados', value: String(doctor.totalCases), icon: '▣', accent: 'blue' })}
        ${MetricCard({ label: 'Casos activos', value: String(activeCases.length), icon: '⏳', accent: 'amber' })}
        ${MetricCard({ label: 'Logistica estimada', value: formatCurrency(doctor.estimatedLogistics), icon: '✈', accent: 'gray' })}
        ${MetricCard({ label: 'Margen estimado', value: formatCurrency(doctor.estimatedMargin), icon: '📈', accent: 'green' })}
      </section>

      <!-- Graficos. -->
      <section class="charts-grid">
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
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Margen estimado por caso</h2>
          </div>
          ${ColumnChart({
            data: cases
              .filter((c) => c.doctorMargin > 0)
              .sort((a, b) => b.doctorMargin - a.doctorMargin)
              .map((c) => ({ label: c.caseCode.replace('MED-', ''), value: c.doctorMargin })),
            formatValue: formatCurrency,
            color: '#2f86ff',
          })}
        </div>
        ${latestQuoted ? `
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Ultimo caso cotizado</h2>
            <a href="#/doctor/cases/${latestQuoted.id}" class="link">Ajustar margen →</a>
          </div>
          <p class="muted" style="margin-bottom:12px">
            <strong>${escapeHtml(latestQuoted.caseCode)}</strong> · ${escapeHtml(latestQuoted.patientName)}
            · ${formatDate(latestQuoted.travelDate)}
          </p>
          ${StackedBar({
            segments: [
              { key: 'base', label: 'Costo base', value: latestQuoted.baseCost, color: '#1d6fd8' },
              { key: 'cst', label: 'Margen CST', value: latestQuoted.csTravelMargin, color: '#c77700' },
              { key: 'doctor', label: 'Tu margen', value: latestQuoted.doctorMargin, color: '#0f9d6e' },
            ],
            formatValue: formatCurrency,
          })}
        </div>
        ` : ''}
      </section>

      <!-- Casos activos (con buscador) + historial reciente lateral. -->
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
