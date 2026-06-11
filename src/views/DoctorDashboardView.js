import { authService } from '../services/authService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { MetricCard } from '../components/MetricCard.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { DonutChart, BarListChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

export const DoctorDashboardView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);

    const activeCases = medicalCaseService.getActive(cases);
    const recent = [...cases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(doctor.clinicName)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(doctor.status)}
            <span class="chip">${escapeHtml(doctor.name)}</span>
            <span class="chip">Codigo: ${escapeHtml(doctor.sharedCode)}</span>
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
          ${BarListChart({
            data: cases
              .filter((c) => c.doctorMargin > 0)
              .sort((a, b) => b.doctorMargin - a.doctorMargin)
              .map((c) => ({ label: `${c.caseCode} · ${c.patientName}`, value: c.doctorMargin })),
            formatValue: formatCurrency,
            color: '#0f9d6e',
          })}
        </div>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Casos activos</h2>
          <a href="#/doctor/cases" class="link">Ver todos →</a>
        </div>
        ${MedicalCaseTable(activeCases, { detailBase: '#/doctor/cases' })}
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Historial reciente</h2>
        </div>
        ${MedicalCaseTable(recent.slice(0, 5), { detailBase: '#/doctor/cases' })}
        <p class="panel__footnote">Ultima actualizacion de datos: ${formatDate(doctor.lastUpdate, true)}</p>
      </section>
    `;
  },
};
