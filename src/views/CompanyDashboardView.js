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

    // Ordenamos por fecha de creacion descendente (mas recientes primero).
    const recent = [...requests].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return `
      <section class="company-overview">
        <div class="company-overview__hero">
          <div>
            <p class="company-overview__eyebrow">Dashboard empresarial</p>
            <h1 class="page-title">${escapeHtml(company.name)}</h1>
            <p class="page-subtitle">
              ${StatusBadge(company.status)}
              <span class="chip">Codigo: ${escapeHtml(company.sharedCode)}</span>
            </p>
          </div>
          <button type="button" class="btn btn--primary" data-action="open-quick-create">+ Nueva solicitud</button>
        </div>

        <div class="company-overview__grid">
          <article class="finance-card finance-card--primary">
            <span class="finance-card__label">Retorno estimado</span>
            <strong class="finance-card__value">${formatCurrency(company.estimatedReturn)}</strong>
            <span class="finance-card__note">Valor generado por la operacion</span>
          </article>

          <article class="finance-card">
            <span class="finance-card__label">Ahorro estimado</span>
            <strong class="finance-card__value">${formatCurrency(company.estimatedSavings)}</strong>
            <span class="finance-card__note">Optimizacion acumulada</span>
          </article>

          <article class="finance-card">
            <span class="finance-card__label">Costo total estimado</span>
            <strong class="finance-card__value">${formatCurrency(company.totalCost)}</strong>
            <span class="finance-card__note">Volumen gestionado</span>
          </article>

          <div class="operations-card">
            <div>
              <span>Total de solicitudes</span>
              <strong>${escapeHtml(company.totalRequests)}</strong>
            </div>
            <div>
              <span>Viajes registrados</span>
              <strong>${escapeHtml(company.totalTrips)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="company-insights-grid">
        <div class="panel panel--visual panel--donut">
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
        <div class="panel panel--visual">
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

      <!-- Historial / solicitudes recientes. -->
      <section class="panel panel--table-feature">
        <div class="panel__header">
          <h2 class="panel__title">Historial reciente</h2>
          <a href="#/company/requests" class="link">Ver todas →</a>
        </div>
        ${RequestTable(recent.slice(0, 5), { detailBase: '#/company/requests' })}
        <p class="panel__footnote">Ultima actualizacion de datos: ${formatDate(company.lastUpdate, true)}</p>
      </section>
    `;
  },
};
