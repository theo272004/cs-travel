/**
 * CompanyDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard privado de una EMPRESA aliada. Muestra un resumen de su actividad:
 *   datos de la empresa, metricas (costos, ahorro, retorno), solicitudes activas
 *   e historial reciente.
 *
 * RESPONSABILIDADES:
 *   - render(): cargar los datos de LA empresa del usuario logueado y de sus
 *     solicitudes, y construir el HTML del dashboard.
 *   - Garantizar el AISLAMIENTO de datos: solo se consultan datos de la propia
 *     empresa (companyId tomado de la sesion).
 *
 * DATOS:
 *   - El companyId proviene de la sesion (no de la URL), de modo que una empresa
 *     no puede ver datos de otra manipulando rutas.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { companyService } from '../services/companyService.js';
import { requestService } from '../services/requestService.js';
import { MetricCard } from '../components/MetricCard.js';
import { RequestTable } from '../components/RequestTable.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { DonutChart, BarListChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

export const CompanyDashboardView = {
  async render() {
    // companyId SIEMPRE desde la sesion: clave para el aislamiento de datos.
    const companyId = authService.getCompanyId();

    // Cargamos en paralelo la empresa y sus solicitudes (mas rapido).
    const [company, requests] = await Promise.all([
      companyService.getById(companyId),
      requestService.getByCompany(companyId),
    ]);

    // Separamos solicitudes activas del resto (historial).
    const activeRequests = requestService.getActive(requests);

    // Ordenamos por fecha de creacion descendente (mas recientes primero).
    const recent = [...requests].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return `
      <!-- Encabezado de la pagina con nombre y estado de la empresa. -->
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(company.name)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(company.status)}
            <span class="chip">Codigo: ${escapeHtml(company.sharedCode)}</span>
          </p>
        </div>
        <button type="button" class="btn btn--primary" data-action="open-quick-create">+ Nueva solicitud</button>
      </div>

      <!-- Rejilla de metricas (KPIs). -->
      <section class="metrics-grid">
        ${MetricCard({ label: 'Total de solicitudes', value: String(company.totalRequests), icon: '✈', accent: 'blue' })}
        ${MetricCard({ label: 'Viajes registrados', value: String(company.totalTrips), icon: '🧳', accent: 'blue' })}
        ${MetricCard({ label: 'Costo total estimado', value: formatCurrency(company.totalCost), icon: '💰', accent: 'gray' })}
        ${MetricCard({ label: 'Ahorro estimado', value: formatCurrency(company.estimatedSavings), icon: '📉', accent: 'green' })}
        ${MetricCard({ label: 'Retorno estimado', value: formatCurrency(company.estimatedReturn), icon: '📈', accent: 'amber' })}
        ${MetricCard({ label: 'Solicitudes activas', value: String(activeRequests.length), icon: '⏳', accent: 'blue' })}
      </section>

      <!-- Graficos. -->
      <section class="charts-grid">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Mis solicitudes por estado</h2>
          </div>
          ${DonutChart({
            data: Object.entries(
              requests.reduce((acc, r) => {
                acc[r.status] = (acc[r.status] || 0) + 1;
                return acc;
              }, {})
            ).map(([label, value]) => ({ label, value })),
            centerLabel: 'solicitudes',
          })}
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Ahorro estimado por solicitud</h2>
          </div>
          ${BarListChart({
            data: requests
              .filter((r) => r.estimatedSavings > 0)
              .sort((a, b) => b.estimatedSavings - a.estimatedSavings)
              .map((r) => ({ label: `${r.requestCode} · ${r.destination}`, value: r.estimatedSavings })),
            formatValue: formatCurrency,
            color: '#0f9d6e',
          })}
        </div>
      </section>

      <!-- Solicitudes activas. -->
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Solicitudes activas</h2>
          <a href="#/company/requests" class="link">Ver todas →</a>
        </div>
        ${RequestTable(activeRequests, { detailBase: '#/company/requests' })}
      </section>

      <!-- Historial / solicitudes recientes. -->
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Historial reciente</h2>
        </div>
        ${RequestTable(recent.slice(0, 5), { detailBase: '#/company/requests' })}
        <p class="panel__footnote">Ultima actualizacion de datos: ${formatDate(company.lastUpdate, true)}</p>
      </section>
    `;
  },
};
