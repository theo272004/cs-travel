/**
 * AdminDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Panel principal del ADMINISTRADOR de CS Travel. Muestra metricas globales
 *   del sistema y accesos rapidos a empresas y solicitudes recientes.
 *
 * RESPONSABILIDADES:
 *   - render(): agregar datos de todas las empresas y solicitudes para construir
 *     las metricas globales (empresas, costos, ahorro, retorno) y los listados.
 *
 * DATOS:
 *   - companyService.getMetrics(): totales agregados de empresas.
 *   - requestService.getAll(): para contar solicitudes activas y mostrar las
 *     mas recientes con el nombre de su empresa.
 * =============================================================================
 */

import { companyService } from '../services/companyService.js';
import { requestService } from '../services/requestService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { userService } from '../services/userService.js';
import { MetricCard } from '../components/MetricCard.js';
import { RequestTable } from '../components/RequestTable.js';
import { CompanyTable } from '../components/CompanyTable.js';
import { DoctorTable } from '../components/DoctorTable.js';
import { DonutChart, BarListChart, LineChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Clave de mes "2026-04" a partir de una fecha ISO. */
function monthKey(dateString) {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Etiqueta corta "abr 26" a partir de la clave "2026-04". */
function monthLabel(key) {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year.slice(2)}`;
}

/** Cuenta elementos por estado y devuelve datos listos para el donut. */
function countByStatus(items) {
  const counts = {};
  items.forEach((item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
  });
  return Object.entries(counts).map(([label, value]) => ({ label, value }));
}

export const AdminDashboardView = {
  async render() {
    // Cargamos en paralelo: metricas de empresas, empresas y solicitudes.
    const [metrics, companies, requests, doctorMetrics, doctors, medicalCases, users] = await Promise.all([
      companyService.getMetrics(),
      companyService.getAll(),
      requestService.getAll(),
      doctorService.getMetrics(),
      doctorService.getAll(),
      medicalCaseService.getAll(),
      userService.getAll(),
    ]);

    // Solicitudes activas (en curso) en todo el sistema.
    const activeRequests = requestService.getActive(requests);
    const activeUsers = users.filter((user) => user.status === 'active');
    const inactiveUsers = users.filter((user) => user.status === 'inactive');

    // Ingreso/margen real de CS Travel: lo que gana CST sobre solicitudes de
    // empresa + casos medicos (no es el ahorro del cliente, es el margen propio).
    const csTravelIncome =
      requests.reduce((sum, r) => sum + (r.csTravelMargin || 0), 0) +
      medicalCases.reduce((sum, c) => sum + (c.csTravelMargin || 0), 0);

    // Mapa companyId -> nombre, para mostrarlo en la tabla de solicitudes.
    const companiesMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));

    // Solicitudes mas recientes (top 5).
    const recentRequests = [...requests]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    // --- Datos para graficos ---------------------------------------------
    // Actividad mensual: solicitudes y casos creados por mes.
    const monthKeys = [...new Set([...requests, ...medicalCases].map((item) => monthKey(item.createdAt)))].sort();
    const requestsPerMonth = monthKeys.map((key) => requests.filter((r) => monthKey(r.createdAt) === key).length);
    const casesPerMonth = monthKeys.map((key) => medicalCases.filter((c) => monthKey(c.createdAt) === key).length);

    // Costos y ahorro por empresa (ordenados de mayor a menor).
    const costByCompany = [...companies]
      .sort((a, b) => b.totalCost - a.totalCost)
      .map((c) => ({ label: c.name, value: c.totalCost }));
    const savingsByCompany = [...companies]
      .sort((a, b) => b.estimatedSavings - a.estimatedSavings)
      .map((c) => ({ label: c.name, value: c.estimatedSavings }));

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Panel administrativo</h1>
          <p class="page-subtitle">Resumen general del sistema CS Travel.</p>
        </div>
      </div>

      <!-- Metricas globales. -->
      <section class="metrics-grid">
        ${MetricCard({ label: 'Total de empresas', value: String(metrics.totalCompanies), icon: '◰', accent: 'blue' })}
        ${MetricCard({ label: 'Usuarios activos', value: String(activeUsers.length), icon: '◉', accent: 'green' })}
        ${MetricCard({ label: 'Usuarios inactivos', value: String(inactiveUsers.length), icon: '◌', accent: 'gray' })}
        ${MetricCard({ label: 'Empresas activas', value: String(metrics.activeCompanies), icon: '✓', accent: 'green' })}
        ${MetricCard({ label: 'Total de solicitudes', value: String(requests.length), icon: '✈', accent: 'blue' })}
        ${MetricCard({ label: 'Solicitudes activas', value: String(activeRequests.length), icon: '⏳', accent: 'amber' })}
        ${MetricCard({ label: 'Costos gestionados', value: formatCurrency(metrics.totalCost), icon: '💰', accent: 'gray' })}
        ${MetricCard({ label: 'Ahorro global', value: formatCurrency(metrics.totalSavings), icon: '📉', accent: 'green' })}
        ${MetricCard({ label: 'Retorno global', value: formatCurrency(metrics.totalReturn), icon: '📈', accent: 'amber' })}
        ${MetricCard({ label: 'Ingreso CS Travel', value: formatCurrency(csTravelIncome), icon: '🏦', accent: 'green' })}
        ${MetricCard({ label: 'Medicos activos', value: String(doctorMetrics.activeDoctors), icon: '✚', accent: 'green' })}
        ${MetricCard({ label: 'Casos medicos', value: String(medicalCases.length), icon: '▣', accent: 'blue' })}
        ${MetricCard({ label: 'Logistica medica', value: formatCurrency(doctorMetrics.estimatedLogistics), icon: '✈', accent: 'gray' })}
      </section>

      <!-- Graficos. -->
      <section class="charts-grid">
        <div class="panel charts-grid__wide">
          <div class="panel__header">
            <h2 class="panel__title">Actividad mensual</h2>
          </div>
          ${LineChart({
            labels: monthKeys.map(monthLabel),
            series: [
              { name: 'Solicitudes', values: requestsPerMonth, color: '#1d6fd8' },
              { name: 'Casos medicos', values: casesPerMonth, color: '#0f9d6e' },
            ],
            formatValue: (v) => String(Math.round(v)),
            id: 'admin-activity',
          })}
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Solicitudes por estado</h2>
          </div>
          ${DonutChart({ data: countByStatus(requests), centerLabel: 'solicitudes' })}
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Casos medicos por estado</h2>
          </div>
          ${DonutChart({ data: countByStatus(medicalCases), centerLabel: 'casos' })}
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Costos gestionados por empresa</h2>
          </div>
          ${BarListChart({ data: costByCompany, formatValue: formatCurrency })}
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Ahorro estimado por empresa</h2>
          </div>
          ${BarListChart({ data: savingsByCompany, formatValue: formatCurrency, color: '#0f9d6e' })}
        </div>
      </section>

      <!-- Empresas aliadas. -->
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Empresas aliadas</h2>
          <a href="#/admin/companies" class="link">Gestionar empresas →</a>
        </div>
        ${CompanyTable(companies.slice(0, 5))}
      </section>

      <!-- Medicos aliados. -->
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Medicos y clinicas</h2>
          <a href="#/admin/doctors" class="link">Gestionar medicos →</a>
        </div>
        ${DoctorTable(doctors.slice(0, 5))}
      </section>

      <!-- Solicitudes recientes. -->
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Solicitudes recientes</h2>
          <a href="#/admin/requests" class="link">Ver todas →</a>
        </div>
        ${RequestTable(recentRequests, {
          detailBase: '#/admin/requests',
          showCompany: true,
          companiesMap,
        })}
      </section>
    `;
  },
};
