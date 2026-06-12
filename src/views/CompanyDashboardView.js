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
import { BarListChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

const formatUsdApprox = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format(value / 4000);

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

    const statusSummary = Object.entries(
      requests.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {})
    ).map(([label, value]) => ({ label, value }));
    const maxStatus = Math.max(...statusSummary.map((item) => item.value), 1);

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

        <div class="company-command-grid">
          <article class="balance-panel">
            <div class="balance-panel__top">
              <div>
                <span class="balance-panel__label">Retorno estimado</span>
                <strong class="balance-panel__value">${formatCurrency(company.estimatedReturn)}</strong>
              </div>
              <div class="currency-switch" aria-label="Moneda">
                <span class="is-active">COP</span>
                <span>USD</span>
              </div>
            </div>
            <div class="balance-panel__change">
              <span>${formatUsdApprox(company.estimatedReturn)}</span>
              <small>USD aprox.</small>
            </div>
            <div class="balance-panel__spark" aria-hidden="true">
              <span style="height:32%"></span>
              <span style="height:52%"></span>
              <span style="height:44%"></span>
              <span style="height:72%"></span>
              <span style="height:62%"></span>
              <span style="height:86%"></span>
            </div>
            <p class="balance-panel__note">Valor generado por la operacion</p>
          </article>

          <section class="metric-cluster" aria-label="Metricas principales">
            <article class="mini-metric mini-metric--accent">
              <span>Ahorro estimado</span>
              <strong>${formatCurrency(company.estimatedSavings)}</strong>
              <small>Optimizacion acumulada</small>
            </article>
            <article class="mini-metric">
              <span>Costo total estimado</span>
              <strong>${formatCurrency(company.totalCost)}</strong>
              <small>Volumen gestionado</small>
            </article>
            <article class="mini-metric">
              <span>Total de solicitudes</span>
              <strong>${escapeHtml(company.totalRequests)}</strong>
              <small>Solicitudes creadas</small>
            </article>
            <article class="mini-metric">
              <span>Viajes registrados</span>
              <strong>${escapeHtml(company.totalTrips)}</strong>
              <small>Viajes consolidados</small>
            </article>
          </section>

          <section class="status-income-panel">
            <div class="panel__header">
              <div>
                <h2 class="panel__title">Mis solicitudes por estado</h2>
                <p class="status-income-panel__subtitle">Distribucion actual de solicitudes</p>
              </div>
            </div>
            <div class="status-income-panel__bars">
              ${statusSummary.map((item, index) => `
                <div class="status-income-panel__bar" data-tip="${escapeHtml(`${item.label}: ${item.value}`)}">
                  <span class="status-income-panel__fill status-income-panel__fill--${index % 3}" style="height:${Math.max(18, Math.round((item.value / maxStatus) * 100))}%"></span>
                  <small>${escapeHtml(item.label)}</small>
                </div>
              `).join('')}
            </div>
            <div class="status-income-panel__legend">
              ${statusSummary.map((item) => `
                <span><strong>${escapeHtml(item.value)}</strong> ${escapeHtml(item.label)}</span>
              `).join('')}
            </div>
          </section>
        </div>
      </section>

      <section class="company-insights-grid">
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
        <section class="panel panel--visual panel--compact-summary">
          <div class="panel__header">
            <h2 class="panel__title">Resumen de gestion</h2>
          </div>
          <div class="summary-stack">
            <div><span>Retorno estimado</span><strong>${formatCurrency(company.estimatedReturn)}</strong></div>
            <div><span>Ahorro estimado</span><strong>${formatCurrency(company.estimatedSavings)}</strong></div>
            <div><span>Costo total estimado</span><strong>${formatCurrency(company.totalCost)}</strong></div>
          </div>
        </section>
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
