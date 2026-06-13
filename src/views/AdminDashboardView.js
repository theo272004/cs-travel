/**
 * AdminDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Panel principal del ADMINISTRADOR de CS Travel, alineado con el estilo
 *   ejecutivo del resto de la app. Prioriza lo que importa para operar el
 *   negocio: ingreso propio de CS Travel, cola de trabajo (por atender),
 *   operacion en curso, valor entregado a clientes y aliados activos.
 *
 *   Estructura:
 *     1. Encabezado con saludo.
 *     2. KPIs financieros y operativos (tarjetas planas).
 *     3. Cola de trabajo: lo que requiere accion del equipo.
 *     4. Distribucion por estado (donut) + top aliados por ingreso (columnas).
 *     5. Accesos a empresas, medicos y solicitudes recientes.
 * =============================================================================
 */

import { companyService } from '../services/companyService.js';
import { requestService } from '../services/requestService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { userService } from '../services/userService.js';
import { MetricCard } from '../components/MetricCard.js';
import { RequestTable } from '../components/RequestTable.js';
import { DonutChart, ColumnChart } from '../components/Chart.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

// Estados que representan "cola de trabajo" del equipo CS Travel.
const REQUEST_TODO = ['solicitud enviada', 'en revision', 'en cotizacion'];
const CASE_TODO = ['caso enviado', 'en revision', 'en cotizacion'];

function countByStatus(items) {
  const counts = {};
  items.forEach((item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
  });
  return Object.entries(counts).map(([label, value]) => ({ label, value }));
}

export const AdminDashboardView = {
  async render() {
    const [metrics, companies, requests, doctorMetrics, doctors, medicalCases, users] = await Promise.all([
      companyService.getMetrics(),
      companyService.getAll(),
      requestService.getAll(),
      doctorService.getMetrics(),
      doctorService.getAll(),
      medicalCaseService.getAll(),
      userService.getAll(),
    ]);

    const activeRequests = requestService.getActive(requests);
    const activeCases = medicalCaseService.getActive(medicalCases);

    // Ingreso real de CS Travel (su margen propio sobre solicitudes y casos).
    const csTravelIncome =
      requests.reduce((sum, r) => sum + (r.csTravelMargin || 0), 0) +
      medicalCases.reduce((sum, c) => sum + (c.csTravelMargin || 0), 0);

    // Valor entregado a los clientes (ahorro a empresas).
    const valueDelivered = metrics.totalSavings;

    // Aliados activos (empresas + medicos).
    const activeCompanies = companies.filter((c) => c.status === 'active').length;
    const activeDoctors = doctorMetrics.activeDoctors;

    // Cola de trabajo: lo que el equipo debe atender ahora.
    const todo = [
      ...requests.filter((r) => REQUEST_TODO.includes(r.status)).map((r) => ({
        code: r.requestCode, who: companies.find((c) => c.id === r.companyId)?.name || 'Empresa',
        route: `${r.origin} → ${r.destination}`, status: r.status, href: `#/admin/requests/${r.id}`,
      })),
      ...medicalCases.filter((c) => CASE_TODO.includes(c.status)).map((c) => ({
        code: c.caseCode, who: doctors.find((d) => d.id === c.doctorId)?.clinicName || 'Medico',
        route: c.patientName, status: c.status, href: `#/admin/medical-cases/${c.id}`,
      })),
    ];

    const companiesMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));
    const recentRequests = [...requests]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    // Top aliados por ingreso generado a CS Travel.
    const incomeByCompany = companies.map((c) => ({
      label: c.name,
      value: requests.filter((r) => r.companyId === c.id).reduce((s, r) => s + (r.csTravelMargin || 0), 0),
    })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);

    // Estado combinado de toda la operacion (solicitudes + casos).
    const pipeline = countByStatus([...requests, ...medicalCases]);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> CS Travel</h1>
          <p class="page-subtitle">Resumen operativo y financiero del sistema.</p>
        </div>
        <a href="#/admin/settings" class="btn btn--ghost">⚙ Configuracion</a>
      </div>

      <!-- KPIs clave (lo que mueve el negocio). -->
      <section class="metrics-grid">
        ${MetricCard({ label: 'Ingreso CS Travel', value: formatCurrency(csTravelIncome) })}
        ${MetricCard({ label: 'Por atender', value: String(todo.length) })}
        ${MetricCard({ label: 'Solicitudes activas', value: String(activeRequests.length) })}
        ${MetricCard({ label: 'Casos medicos activos', value: String(activeCases.length) })}
        ${MetricCard({ label: 'Valor entregado a clientes', value: formatCurrency(valueDelivered) })}
        ${MetricCard({ label: 'Empresas activas', value: String(activeCompanies) })}
        ${MetricCard({ label: 'Medicos activos', value: String(activeDoctors) })}
        ${MetricCard({ label: 'Usuarios', value: String(users.length) })}
      </section>

      <!-- Cola de trabajo + distribucion por estado. -->
      <section class="dashboard-split">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Cola de trabajo</h2>
            <span class="table-toolbar__count">${todo.length} por atender</span>
          </div>
          <div class="mini-list">
            ${todo.length ? todo.slice(0, 8).map((t) => `
              <div class="mini-list__item" data-href="${t.href}">
                <div>
                  <span class="mini-list__code">${escapeHtml(t.code)}</span>
                  <span class="muted-block">${escapeHtml(t.who)} · ${escapeHtml(t.route)}</span>
                </div>
                ${StatusBadge(t.status)}
              </div>
            `).join('') : '<p class="empty-state">Todo al dia. Sin pendientes.</p>'}
          </div>
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Estado de la operacion</h2>
          </div>
          ${DonutChart({ data: pipeline, centerLabel: 'en total' })}
        </div>
      </section>

      <!-- Ingreso por aliado + accesos. -->
      <section class="charts-grid">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Ingreso CS Travel por empresa</h2>
          </div>
          ${ColumnChart({ data: incomeByCompany, formatValue: formatCurrency, color: '#10141c' })}
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Solicitudes recientes</h2>
            <a href="#/admin/requests" class="link">Ver todas →</a>
          </div>
          ${RequestTable(recentRequests, { detailBase: '#/admin/requests', showCompany: true, companiesMap })}
        </div>
      </section>
    `;
  },
};
