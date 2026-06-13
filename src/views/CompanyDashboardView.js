/**
 * CompanyDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard privado de una EMPRESA aliada, con una lectura ejecutiva y
 *   compacta centrada en ahorro, retorno y solicitudes activas.
 *
 * RESPONSABILIDADES:
 *   - render(): cargar los datos de LA empresa del usuario logueado y de sus
 *     solicitudes, y construir el HTML del dashboard.
 *   - Garantizar el AISLAMIENTO de datos: solo se consultan datos de la propia
 *     empresa (companyId tomado de la sesion).
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { companyService } from '../services/companyService.js';
import { requestService } from '../services/requestService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

// Cache de solicitudes activas para el buscador del dashboard.
let cachedActiveRequests = [];

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
    cachedActiveRequests = activeRequests;

    // Ordenamos por fecha de creacion descendente (mas recientes primero).
    const recent = [...requests].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // --- Ahorro vs. plataformas externas (Booking/Despegar) --------------
    // El % de ahorro es el argumento comercial principal.
    const totalCstCost = requests.reduce((sum, r) => sum + (r.estimatedCost || 0), 0);
    const totalReferenceCost = requests.reduce((sum, r) => sum + (r.bookingReferenceCost || 0), 0);
    const totalSavings = company.estimatedSavings || requests.reduce((sum, r) => sum + (r.estimatedSavings || 0), 0);
    const managedCost = company.totalCost || totalCstCost;
    const marketCost = totalReferenceCost || managedCost + totalSavings;
    const savingsPct = marketCost > 0
      ? Math.round((totalSavings / marketCost) * 100)
      : 0;
    const avgSavingsPct = requests.length > 0
      ? Math.round(
        requests.reduce((sum, r) => {
          if (!r.bookingReferenceCost || !r.estimatedSavings) return sum;
          return sum + ((r.estimatedSavings / r.bookingReferenceCost) * 100);
        }, 0) / Math.max(1, requests.filter((r) => r.bookingReferenceCost && r.estimatedSavings).length)
      )
      : 0;
    const marketBarWidth = 100;
    const cstBarWidth = marketCost > 0 ? Math.max(8, Math.round((managedCost / marketCost) * 100)) : 0;
    const visibleRequests = activeRequests.length ? activeRequests : recent.slice(0, 4);

    return `
      <!-- Encabezado con saludo, nombre y estado de la empresa. -->
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> ${escapeHtml(company.name)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(company.status)}
            <span class="chip">Alianza: ${escapeHtml(company.sharedCode)}</span>
          </p>
        </div>
        <button type="button" class="btn btn--primary" data-action="open-quick-create">+ Nueva solicitud</button>
      </div>

      <!-- Fila 1: tarjeta protagonista de ahorro. -->
      <section class="company-top">
        <div class="savings-hero">
          <div class="savings-hero__main">
            <span class="savings-hero__label">Ahorro acumulado</span>
            <strong class="savings-hero__value">${formatCurrency(totalSavings)}</strong>
            <span class="savings-hero__amount">Generado con CS Travel</span>
            <span class="savings-hero__trend">↑ ${savingsPct}% vs plataformas externas</span>
          </div>
          <div class="savings-visual" aria-hidden="true">
            <div class="savings-visual__grid">
              <span style="height:34%"></span>
              <span style="height:54%"></span>
              <span style="height:42%"></span>
              <span style="height:74%"></span>
              <span style="height:62%"></span>
              <span style="height:88%"></span>
            </div>
            <div class="savings-visual__line"></div>
            <div class="savings-visual__coin">$</div>
          </div>
        </div>
      </section>

      <!-- Fila 2: KPIs compactos. -->
      <section class="compact-kpis" aria-label="Metricas principales">
        ${compactKpi('Solicitudes activas', String(activeRequests.length), '+12%')}
        ${compactKpi('Ahorro promedio', `${avgSavingsPct || savingsPct}%`, '+14%')}
        ${compactKpi('Retorno estimado', formatCurrency(company.estimatedReturn), '+10%')}
        ${compactKpi('Viajes realizados', String(company.totalTrips), '+8%')}
      </section>

      <!-- Fila 3: comparativo de ahorro. -->
      <section class="savings-comparison">
        <div class="panel panel--comparison">
          <div class="panel__header">
            <h2 class="panel__title">Cuanto habria gastado sin CST?</h2>
          </div>
          <div class="comparison-bars">
            ${comparisonRow('Mercado tradicional', marketCost, marketBarWidth, '#f2622e')}
            ${comparisonRow('Con CST Travel', managedCost, cstBarWidth, '#061953')}
          </div>
          <div class="comparison-result">
            <span>Ahorro generado</span>
            <strong>${formatCurrency(totalSavings)}</strong>
            <em>${savingsPct}%</em>
          </div>
        </div>
      </section>

      <!-- Fila 4: solicitudes activas protagonistas + historial compacto. -->
      <section class="dashboard-split dashboard-split--company">
        <div class="panel panel--table-feature">
          <div class="panel__header">
            <h2 class="panel__title">Solicitudes activas</h2>
            <div class="table-actions">
              <input id="dash-request-search" class="form__input table-toolbar__search" type="search"
                placeholder="Buscar..." />
              <a href="#/company/requests" class="link">Ver todas →</a>
            </div>
          </div>
          <div id="dash-active-table">
            ${renderActiveRequestsTable(visibleRequests)}
          </div>
        </div>
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Historial reciente</h2>
          </div>
          <div class="mini-list">
            ${recent.slice(0, 5).map((r) => `
              <div class="mini-list__item" data-href="#/company/requests/${r.id}">
                <div>
                  <span class="mini-list__code">${escapeHtml(r.requestCode)}</span>
                  <span class="muted-block">${formatDate(r.travelDate)} · ${escapeHtml(r.destination)}</span>
                </div>
                <span class="mini-list__tag">${escapeHtml(r.requestType || 'viaje')}</span>
              </div>
            `).join('') || '<p class="empty-state">Sin solicitudes.</p>'}
          </div>
          <p class="panel__footnote">Ultima actualizacion: ${formatDate(company.lastUpdate, true)}</p>
        </div>
      </section>
    `;
  },

  async afterRender() {
    // Buscador de la tabla de solicitudes activas del dashboard.
    const search = document.getElementById('dash-request-search');
    const table = document.getElementById('dash-active-table');
    if (!search || !table) return;

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const filtered = cachedActiveRequests.filter((r) =>
        [r.requestCode, r.origin, r.destination, r.requestType, r.status].join(' ').toLowerCase().includes(q)
      );
      table.innerHTML = renderActiveRequestsTable(filtered);
    });
  },
};

function compactKpi(label, value, variation) {
  return `
    <article class="compact-kpi">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>↑ ${escapeHtml(variation.replace(/^↑\s*/, ''))}</small>
    </article>
  `;
}

function comparisonRow(label, value, width, color) {
  return `
    <div class="comparison-row" data-tip="${escapeHtml(`${label}: ${formatCurrency(value)}`)}">
      <div class="comparison-row__head">
        <span>${escapeHtml(label)}</span>
        <strong>${formatCurrency(value)}</strong>
      </div>
      <div class="comparison-row__track">
        <span style="width:${width}%;background:${color}"></span>
      </div>
    </div>
  `;
}

function renderActiveRequestsTable(requests) {
  if (!requests || requests.length === 0) {
    return '<p class="empty-state">No hay solicitudes activas para mostrar.</p>';
  }

  return `
    <div class="table-wrapper">
      <table class="data-table data-table--company-active">
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Ruta</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Ahorro estimado</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          ${requests.map((r) => `
            <tr>
              <td><strong>${escapeHtml(r.requestCode)}</strong></td>
              <td>${escapeHtml(r.origin)} &rarr; ${escapeHtml(r.destination)}</td>
              <td>${formatDate(r.travelDate)}</td>
              <td>${StatusBadge(r.status)}</td>
              <td class="text-green">${formatCurrency(r.estimatedSavings)}</td>
              <td><a class="btn btn--ghost btn--table" href="#/company/requests/${r.id}">Ver</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
