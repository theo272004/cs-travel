/**
 * AdminDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Panel principal del ADMINISTRADOR de CS Travel. Reutiliza el MISMO lenguaje
 *   visual que el dashboard de Medicos (la seccion mejor estructurada):
 *     - doctor-kpi-row (primary con tarjeta hero + secondary compacta).
 *     - doctor-main-grid: cola de trabajo + ingreso por aliado.
 *     - doctor-insights-grid--compact: estado de la operacion (gauge) + recientes.
 *
 *   Prioriza lo que importa para operar el negocio: ingreso propio de CS Travel,
 *   cola de trabajo (por atender), operacion en curso, valor entregado a
 *   clientes y aliados activos.
 * =============================================================================
 */

import { companyService } from '../services/companyService.js';
import { requestService } from '../services/requestService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { userService } from '../services/userService.js';
import { RequestTable } from '../components/RequestTable.js';
import { ColumnChart, SemiGaugeChart } from '../components/Chart.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

// Estados que representan "cola de trabajo" del equipo CS Travel: lo que espera
// una accion nuestra (cotizar la solicitud recien enviada).
const TODO_STATUSES = ['solicitud enviada'];

// Iconos de linea (heredan color via currentColor) para las tarjetas KPI.
const ICONS = {
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M15 9h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4"/><path d="M8 7h3M8 11h3M8 15h3"/></svg>',
  medical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="M8 12h8M8 16h5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
};

let cachedRecent = [];

/**
 * Tarjeta KPI con el MISMO markup que el dashboard de medicos
 * (clases doctor-kpi*), para que herede estilos: acento de color, hero,
 * compacta y sparkline de tendencia.
 */
function kpiCard({
  label,
  value,
  hint,
  icon,
  accent = 'blue',
  highlight = false,
  compact = false,
  href = '',
  trend = [28, 38, 32, 46, 40, 56, 52, 68],
}) {
  const spark = `<span class="doctor-kpi__spark" aria-hidden="true">${trend.map((h) => `<b style="height:${h}%"></b>`).join('')}</span>`;
  const tag = href ? 'a' : 'article';
  const hrefAttr = href ? ` href="${href}"` : '';
  const clickable = href ? ' doctor-kpi--clickable' : '';
  return `
    <${tag}${hrefAttr} class="doctor-kpi doctor-kpi--${escapeHtml(accent)} ${highlight ? 'doctor-kpi--hero' : ''} ${compact ? 'doctor-kpi--compact' : ''}${clickable}">
      <div class="doctor-kpi__head">
        <span>${escapeHtml(label)}</span>
        <i aria-hidden="true">${icon}</i>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <div class="doctor-kpi__foot">
        <small>${escapeHtml(hint)}</small>
        ${spark}
      </div>
    </${tag}>
  `;
}

// Agrupa todos los estados de la operacion en 3 categorias para el medidor
// semicircular (misma paleta azul que medicos).
function renderOperationGauge(items) {
  const buckets = { todo: 0, process: 0, closed: 0 };
  items.forEach((it) => {
    const s = it.status;
    if (['solicitud enviada', 'caso enviado', 'en revision', 'en cotizacion'].includes(s)) buckets.todo += 1;
    else if (['cotizacion enviada', 'aprobada', 'en gestion'].includes(s)) buckets.process += 1;
    else buckets.closed += 1; // finalizada / cancelada
  });

  return SemiGaugeChart({
    segments: [
      { label: 'Por atender', value: buckets.todo, color: '#9cc6ff' },
      { label: 'En proceso', value: buckets.process, color: '#0058c1' },
      { label: 'Cerradas', value: buckets.closed, color: '#06244d' },
    ],
    centerValue: String(items.length),
    centerLabel: 'Operaciones',
    formatValue: (v) => String(v),
  });
}

/** Resalta la columna activa (clic) y atenua el resto, igual que en medicos. */
function bindColumnHighlight(container) {
  if (!container) return;
  const cols = container.querySelectorAll('.column-chart__col:not(.column-chart__col--empty)');
  cols.forEach((col) => {
    col.addEventListener('click', () => {
      const wasActive = col.classList.contains('is-active');
      cols.forEach((c) => c.classList.remove('is-active', 'is-dimmed'));
      if (!wasActive) {
        col.classList.add('is-active');
        cols.forEach((c) => { if (c !== col) c.classList.add('is-dimmed'); });
      }
    });
  });
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
      ...requests.filter((r) => TODO_STATUSES.includes(r.status)).map((r) => ({
        code: r.requestCode, who: companies.find((c) => c.id === r.companyId)?.name || 'Empresa',
        route: `${r.origin} → ${r.destination}`, status: r.status, href: `#/admin/requests/${r.id}`,
      })),
      ...medicalCases.filter((c) => TODO_STATUSES.includes(c.status)).map((c) => ({
        code: c.caseCode, who: doctors.find((d) => d.id === c.doctorId)?.clinicName || 'Medico',
        route: c.patientName, status: c.status, href: `#/admin/medical-cases/${c.id}`,
      })),
    ];

    const companiesMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));
    cachedRecent = [...requests]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    // Top aliados por ingreso generado a CS Travel.
    const incomeByCompany = companies.map((c) => ({
      label: c.name,
      value: requests.filter((r) => r.companyId === c.id).reduce((s, r) => s + (r.csTravelMargin || 0), 0),
    })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);

    // Estado combinado de toda la operacion (solicitudes + casos).
    const allOps = [...requests, ...medicalCases];

    // Tasa de cierre: de las operaciones con decision tomada, cuantas se ganaron.
    const WON = ['aprobada', 'en gestion', 'finalizada'];
    const won = allOps.filter((o) => WON.includes(o.status)).length;
    const lost = allOps.filter((o) => o.status === 'cancelada').length;
    const decided = won + lost;
    const closeRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> CS Travel</h1>
          <p class="page-subtitle">Resumen operativo y financiero del sistema.</p>
        </div>
        <a href="#/admin/settings" class="btn btn--ghost">⚙ Configuracion</a>
      </div>

      <!-- KPIs principales (lo que mueve el negocio). -->
      <section class="doctor-kpi-row doctor-kpi-row--primary" aria-label="Resumen financiero">
        ${kpiCard({ label: 'Ingreso CS Travel', value: formatCurrency(csTravelIncome), hint: 'Margen propio consolidado', icon: ICONS.money, accent: 'green', highlight: true, trend: [22, 28, 26, 34, 42, 48, 56, 64] })}
        ${kpiCard({ label: 'Por atender', value: String(todo.length), hint: 'Solicitudes y casos en cola', icon: ICONS.inbox, accent: 'blue', trend: [18, 22, 26, 32, 38, 44, 50, 58] })}
        ${kpiCard({ label: 'Operacion activa', value: String(activeRequests.length + activeCases.length), hint: `${activeRequests.length} solicitudes · ${activeCases.length} casos`, icon: ICONS.activity, accent: 'violet', trend: [14, 20, 26, 32, 40, 48, 54, 60] })}
        ${kpiCard({ label: 'Valor entregado', value: formatCurrency(valueDelivered), hint: 'Ahorro generado a clientes', icon: ICONS.gift, accent: 'amber', trend: [30, 28, 34, 32, 38, 40, 44, 42] })}
      </section>

      <!-- KPIs secundarios (conteos de aliados y usuarios). -->
      <section class="doctor-kpi-row doctor-kpi-row--secondary" aria-label="Aliados y usuarios">
        ${kpiCard({ label: 'Empresas activas', value: String(activeCompanies), hint: `${companies.length} en total`, icon: ICONS.building, accent: 'blue', compact: true, trend: [20, 26, 30, 28, 34, 40, 44, 48] })}
        ${kpiCard({ label: 'Medicos activos', value: String(activeDoctors), hint: `${doctors.length} en total`, icon: ICONS.medical, accent: 'green', compact: true, trend: [16, 22, 28, 30, 36, 42, 46, 52] })}
        ${kpiCard({ label: 'Tasa de cierre', value: `${closeRate}%`, hint: `${won} ganadas · ${lost} perdidas · ver no cerradas →`, icon: ICONS.trend, accent: 'violet', compact: true, href: '#/admin/requests?status=cancelada', trend: [40, 36, 44, 48, 52, 56, 60, 64] })}
        ${kpiCard({ label: 'Usuarios', value: String(users.length), hint: 'Cuentas registradas', icon: ICONS.users, accent: 'amber', compact: true, trend: [24, 26, 28, 30, 32, 34, 36, 38] })}
      </section>

      <!-- Cola de trabajo + ingreso por aliado. -->
      <section class="doctor-main-grid">
        <div class="panel">
          <div class="panel__header">
            <div>
              <span class="section-label section-label--inline">Tu flujo de trabajo</span>
              <h2 class="panel__title">Cola de trabajo</h2>
            </div>
            <span class="chip ${todo.length ? 'chip--alert' : ''}">${todo.length} por atender</span>
          </div>
          <div class="mini-list">
            ${todo.length ? todo.slice(0, 8).map((t) => `
              <div class="mini-list__item clickable-row" data-href="${t.href}">
                <div>
                  <span class="mini-list__code">${escapeHtml(t.code)}</span>
                  <span class="muted-block">${escapeHtml(t.who)} · ${escapeHtml(t.route)}</span>
                </div>
                ${StatusBadge(t.status)}
              </div>
            `).join('') : '<p class="empty-state">Todo al dia. Sin pendientes.</p>'}
          </div>
        </div>

        <div class="panel panel--chart panel--doctor-chart">
          <div class="panel__header">
            <h2 class="panel__title">Ingreso CS Travel por empresa</h2>
            <a href="#/admin/companies" class="link">Ver aliados →</a>
          </div>
          <div class="doctor-period-card__body">
            <div id="admin-income-chart">${ColumnChart({ data: incomeByCompany, formatValue: formatCurrency, color: '#0757d6' })}</div>
          </div>
        </div>
      </section>

      <!-- Estado de la operacion (gauge) + solicitudes recientes. -->
      <section class="doctor-insights-grid doctor-insights-grid--compact">
        <div class="doctor-status-floating">
          <div class="doctor-status-floating__head">
            <h2 class="panel__title">Estado de la operacion</h2>
            <span class="muted">${allOps.length} en total</span>
          </div>
          ${renderOperationGauge(allOps)}
        </div>

        <div class="panel panel--dashboard-active panel--dashboard-active-compact">
          <div class="panel__header">
            <h2 class="panel__title">Solicitudes recientes</h2>
            <a href="#/admin/requests" class="link">Ver todas →</a>
          </div>
          ${RequestTable(cachedRecent, { detailBase: '#/admin/requests', showCompany: true, companiesMap })}
        </div>
      </section>
    `;
  },

  async afterRender() {
    bindColumnHighlight(document.getElementById('admin-income-chart'));

    // Filas clicables de la cola de trabajo.
    document.querySelectorAll('.mini-list__item[data-href]').forEach((row) => {
      row.addEventListener('click', () => {
        const href = row.getAttribute('data-href');
        if (href) window.location.hash = href;
      });
    });
  },
};
