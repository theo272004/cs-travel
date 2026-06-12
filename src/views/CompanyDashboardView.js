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
import { greeting } from '../utils/greeting.js';

// Cache de solicitudes activas para el buscador del dashboard.
let cachedActiveRequests = [];
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
    cachedActiveRequests = activeRequests;

    // Ordenamos por fecha de creacion descendente (mas recientes primero).
    const recent = [...requests].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // --- Ahorro vs. plataformas externas (Booking/Despegar) --------------
    // El % de ahorro es el argumento comercial principal: lo calculamos sobre
    // las solicitudes que ya tienen costo de referencia cargado.
    const totalCstCost = requests.reduce((sum, r) => sum + (r.estimatedCost || 0), 0);
    const totalReferenceCost = requests.reduce((sum, r) => sum + (r.bookingReferenceCost || 0), 0);
    const totalSavings = requests.reduce((sum, r) => sum + (r.estimatedSavings || 0), 0);
    const savingsPct = totalReferenceCost > 0
      ? Math.round((totalSavings / totalReferenceCost) * 100)
      : 0;
    // Ancho relativo de la barra "CS Travel" frente a la referencia (para la comparativa).
    const cstBarPct = totalReferenceCost > 0
      ? Math.round((totalCstCost / totalReferenceCost) * 100)
      : 0;

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

      <!-- Tarjeta protagonista: ahorro vs. plataformas externas. -->
      ${savingsPct > 0 ? `
      <section class="savings-hero">
        <div class="savings-hero__main">
          <span class="savings-hero__label">Ahorro acumulado vs. plataformas externas</span>
          <span class="savings-hero__percent">${savingsPct}%</span>
          <span class="savings-hero__amount">${formatCurrency(totalSavings)} menos que Booking / Despegar</span>
        </div>
        <div class="savings-hero__compare">
          <div class="savings-hero__bar">
            <span class="savings-hero__bar-label">CS Travel</span>
            <div class="savings-hero__track"><div class="savings-hero__fill savings-hero__fill--cst" style="width:${cstBarPct}%"></div></div>
            <span class="savings-hero__bar-value">${formatCurrency(totalCstCost)}</span>
          </div>
          <div class="savings-hero__bar">
            <span class="savings-hero__bar-label">Referencia</span>
            <div class="savings-hero__track"><div class="savings-hero__fill savings-hero__fill--ref" style="width:100%"></div></div>
            <span class="savings-hero__bar-value">${formatCurrency(totalReferenceCost)}</span>
          </div>
        </div>
      </section>
      ` : ''}

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

      <!-- Solicitudes activas (con buscador) + historial reciente lateral. -->
      <section class="dashboard-split">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Solicitudes activas</h2>
            <input id="dash-request-search" class="form__input table-toolbar__search" type="search"
              placeholder="Buscar..." style="max-width:200px" />
            <a href="#/company/requests" class="link">Ver todas →</a>
          </div>
          <div id="dash-active-table">
            ${RequestTable(activeRequests, { detailBase: '#/company/requests' })}
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
      table.innerHTML = RequestTable(filtered, { detailBase: '#/company/requests' });
    });
  },
};
