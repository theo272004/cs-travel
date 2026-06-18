/**
 * AdminDashboardView.js
 * =============================================================================
 * Panel principal del ADMINISTRADOR de CS Travel.
 * Reutiliza el mismo lenguaje visual que el dashboard de Medicos:
 *   - doctor-kpi-row: tarjetas KPI con sparkline.
 *   - doctor-main-grid: cola de trabajo (paginada) + ingreso por empresa (paginado).
 *   - doctor-insights-grid--compact: gauge semicircular + solicitudes recientes.
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

const TODO_STATUSES  = ['solicitud enviada'];
const TODO_PER_PAGE  = 4;
const CHART_PER_PAGE = 2;
const RECENT_PER_PAGE = 2;

const ICONS = {
  money:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
  inbox:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  gift:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M15 9h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4"/><path d="M8 7h3M8 11h3M8 15h3"/></svg>',
  medical:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>',
  trend:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  users:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

// Paginacion — estado de modulo (sobrevive entre actualizaciones del DOM).
let _todo            = [];
let _todoPage        = 0;
let _incomeByCompany = [];
let _incomeByDoctor  = [];
let _chartView       = 0;   // 0 = empresas, 1 = medicos
let _recentRequests  = [];
let _recentPage      = 0;
let _companiesMap    = {};

function kpiCard({ label, value, hint, icon, accent = 'blue', highlight = false, compact = false, href = '', trend = [28, 38, 32, 46, 40, 56, 52, 68] }) {
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

function renderOperationGauge(items) {
  const buckets = { todo: 0, process: 0, closed: 0 };
  items.forEach((it) => {
    const s = it.status;
    if (['solicitud enviada', 'caso enviado', 'en revision', 'en cotizacion'].includes(s)) buckets.todo += 1;
    else if (['cotizacion enviada', 'aprobada', 'en gestion'].includes(s)) buckets.process += 1;
    else buckets.closed += 1;
  });
  return SemiGaugeChart({
    segments: [
      { label: 'Por atender', value: buckets.todo,    color: '#9cc6ff' },
      { label: 'En proceso',  value: buckets.process, color: '#0058c1' },
      { label: 'Cerradas',    value: buckets.closed,  color: '#06244d' },
    ],
    centerValue: String(items.length),
    centerLabel: 'Operaciones',
    formatValue: (v) => String(v),
  });
}

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

function renderHeaderPager(page, totalPages, prevId, nextId) {
  if (totalPages <= 1) return;
  const el = prevId === 'todo-prev'
    ? document.getElementById('admin-todo-pager')
    : document.getElementById('admin-chart-pager');
  if (!el) return;
  el.style.display = '';
  el.innerHTML = `
    <button type="button" class="decision-pager__btn" id="${prevId}" ${page === 0 ? 'disabled' : ''} aria-label="Anterior">‹</button>
    <span>${page + 1} de ${totalPages}</span>
    <button type="button" class="decision-pager__btn" id="${nextId}" ${page >= totalPages - 1 ? 'disabled' : ''} aria-label="Siguiente">›</button>
  `;
  if (prevId === 'todo-prev') {
    el.querySelector(`#${prevId}`)?.addEventListener('click', () => { _todoPage--; updateTodo(); });
    el.querySelector(`#${nextId}`)?.addEventListener('click', () => { _todoPage++; updateTodo(); });
  } else {
    el.querySelector(`#${prevId}`)?.addEventListener('click', () => { _chartPage--; updateChart(); });
    el.querySelector(`#${nextId}`)?.addEventListener('click', () => { _chartPage++; updateChart(); });
  }
}

function updateTodo() {
  const wrap = document.getElementById('admin-todo-wrap');
  if (!wrap) return;
  const start      = _todoPage * TODO_PER_PAGE;
  const items      = _todo.slice(start, start + TODO_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(_todo.length / TODO_PER_PAGE));
  const listHtml   = items.length
    ? items.map((t) => `
        <div class="mini-list__item clickable-row" data-href="${escapeHtml(t.href)}">
          <div>
            <span class="mini-list__code">${escapeHtml(t.code)}</span>
            <span class="muted-block">${escapeHtml(t.who)} · ${escapeHtml(t.route)}</span>
          </div>
          ${StatusBadge(t.status)}
        </div>
      `).join('')
    : '<p class="empty-state">Todo al dia. Sin pendientes.</p>';
  wrap.innerHTML = `<div class="mini-list">${listHtml}</div>`;
  wrap.querySelectorAll('.clickable-row[data-href]').forEach((row) => {
    row.addEventListener('click', () => { window.location.hash = row.dataset.href; });
  });
  const pagerEl = document.getElementById('admin-todo-pager');
  if (pagerEl) pagerEl.style.display = totalPages <= 1 ? 'none' : '';
  renderHeaderPager(_todoPage, totalPages, 'todo-prev', 'todo-next');
}

function updateChart() {
  const wrap    = document.getElementById('admin-chart-wrap');
  const titleEl = document.getElementById('admin-chart-title');
  if (!wrap) return;
  const isDoctor = _chartView === 1;
  const data     = isDoctor ? _incomeByDoctor : _incomeByCompany;
  if (titleEl) titleEl.textContent = isDoctor
    ? 'Ingreso CS Travel Group por médicos'
    : 'Ingreso CS Travel Group por empresa';
  wrap.innerHTML = ColumnChart({ data, formatValue: formatCurrency, color: '#0757d6' });
  bindColumnHighlight(wrap);
  const pagerEl = document.getElementById('admin-chart-pager');
  if (!pagerEl) return;
  pagerEl.style.display = '';
  pagerEl.innerHTML = `
    <button type="button" class="decision-pager__btn" id="chart-prev" ${_chartView === 0 ? 'disabled' : ''} aria-label="Anterior">‹</button>
    <span>${_chartView + 1} de 2</span>
    <button type="button" class="decision-pager__btn" id="chart-next" ${_chartView === 1 ? 'disabled' : ''} aria-label="Siguiente">›</button>
  `;
  pagerEl.querySelector('#chart-prev')?.addEventListener('click', () => { _chartView--; updateChart(); });
  pagerEl.querySelector('#chart-next')?.addEventListener('click', () => { _chartView++; updateChart(); });
}

function updateRecent() {
  const wrap    = document.getElementById('admin-recent-wrap');
  const pagerEl = document.getElementById('admin-recent-pager');
  if (!wrap) return;
  const start      = _recentPage * RECENT_PER_PAGE;
  const slice      = _recentRequests.slice(start, start + RECENT_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(_recentRequests.length / RECENT_PER_PAGE));
  wrap.innerHTML   = RequestTable(slice, { detailBase: '#/admin/requests', showCompany: true, companiesMap: _companiesMap });
  wrap.querySelectorAll('.clickable-row[data-href]').forEach((row) => {
    row.addEventListener('click', () => { window.location.hash = row.getAttribute('data-href'); });
  });
  if (!pagerEl) return;
  if (totalPages <= 1) { pagerEl.style.display = 'none'; return; }
  pagerEl.style.display = '';
  pagerEl.innerHTML = `
    <button type="button" class="decision-pager__btn" id="recent-prev" ${_recentPage === 0 ? 'disabled' : ''} aria-label="Anterior">‹</button>
    <span>${_recentPage + 1} de ${totalPages}</span>
    <button type="button" class="decision-pager__btn" id="recent-next" ${_recentPage >= totalPages - 1 ? 'disabled' : ''} aria-label="Siguiente">›</button>
  `;
  pagerEl.querySelector('#recent-prev')?.addEventListener('click', () => { _recentPage--; updateRecent(); });
  pagerEl.querySelector('#recent-next')?.addEventListener('click', () => { _recentPage++; updateRecent(); });
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
    const activeCases    = medicalCaseService.getActive(medicalCases);

    const csTravelIncome =
      requests.reduce((sum, r) => sum + (r.csTravelMargin || 0), 0) +
      medicalCases.reduce((sum, c) => sum + (c.csTravelMargin || 0), 0);

    const valueDelivered  = metrics.totalSavings;
    const activeCompanies = companies.filter((c) => c.status === 'active').length;
    const activeDoctors   = doctorMetrics.activeDoctors;

    // Cola de trabajo: solicitudes y casos en estado pendiente.
    _todo = [
      ...requests.filter((r) => TODO_STATUSES.includes(r.status)).map((r) => ({
        code: r.requestCode,
        who:  companies.find((c) => c.id === r.companyId)?.name || 'Empresa',
        route: `${r.origin} → ${r.destination}`,
        status: r.status,
        href: `#/admin/requests/${r.id}`,
      })),
      ...medicalCases.filter((c) => TODO_STATUSES.includes(c.status)).map((c) => ({
        code: c.caseCode,
        who:  doctors.find((d) => d.id === c.doctorId)?.clinicName || 'Medico',
        route: c.patientName,
        status: c.status,
        href: `#/admin/medical-cases/${c.id}`,
      })),
    ];
    _todoPage = 0;

    // Ingreso por empresa e ingreso por médico (para las dos vistas de la gráfica).
    _incomeByCompany = companies.map((c) => ({
      label: c.name,
      value: requests.filter((r) => r.companyId === c.id).reduce((s, r) => s + (r.csTravelMargin || 0), 0),
    })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    _incomeByDoctor = doctors.map((d) => ({
      label: d.clinicName || d.name,
      value: medicalCases.filter((c) => c.doctorId === d.id).reduce((s, c) => s + (c.csTravelMargin || 0), 0),
    })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    _chartView = 0;

    // Solicitudes recientes (tabla paginada inferior).
    _companiesMap   = Object.fromEntries(companies.map((c) => [c.id, c.name]));
    _recentRequests = [...requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    _recentPage     = 0;

    // Estado combinado + tasa de cierre.
    const allOps  = [...requests, ...medicalCases];
    const WON     = ['aprobada', 'en gestion', 'finalizada'];
    const won     = allOps.filter((o) => WON.includes(o.status)).length;
    const lost    = allOps.filter((o) => o.status === 'cancelada').length;
    const decided = won + lost;
    const closeRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> CS Travel Group</h1>
          <p class="page-subtitle">Resumen operativo y financiero del sistema.</p>
        </div>
        <a href="#/admin/settings" class="btn btn--ghost">⚙ Configuracion</a>
      </div>

      <section class="doctor-kpi-row doctor-kpi-row--primary" aria-label="Resumen financiero">
        ${kpiCard({ label: 'Ingreso CS Travel Group', value: formatCurrency(csTravelIncome), hint: 'Margen propio consolidado', icon: ICONS.money, accent: 'green', highlight: true, trend: [22, 28, 26, 34, 42, 48, 56, 64] })}
        ${kpiCard({ label: 'Por atender', value: String(_todo.length), hint: 'Solicitudes y casos en cola', icon: ICONS.inbox, accent: 'blue', trend: [18, 22, 26, 32, 38, 44, 50, 58] })}
        ${kpiCard({ label: 'Operacion activa', value: String(activeRequests.length + activeCases.length), hint: `${activeRequests.length} solicitudes · ${activeCases.length} casos`, icon: ICONS.activity, accent: 'violet', trend: [14, 20, 26, 32, 40, 48, 54, 60] })}
        ${kpiCard({ label: 'Valor entregado', value: formatCurrency(valueDelivered), hint: 'Ahorro generado a clientes', icon: ICONS.gift, accent: 'amber', trend: [30, 28, 34, 32, 38, 40, 44, 42] })}
      </section>

      <section class="doctor-kpi-row doctor-kpi-row--secondary" aria-label="Aliados y usuarios">
        ${kpiCard({ label: 'Empresas activas', value: String(activeCompanies), hint: `${companies.length} en total`, icon: ICONS.building, accent: 'blue', compact: true, trend: [20, 26, 30, 28, 34, 40, 44, 48] })}
        ${kpiCard({ label: 'Medicos activos', value: String(activeDoctors), hint: `${doctors.length} en total`, icon: ICONS.medical, accent: 'green', compact: true, trend: [16, 22, 28, 30, 36, 42, 46, 52] })}
        ${kpiCard({ label: 'Tasa de cierre', value: `${closeRate}%`, hint: `${won} ganadas · ${lost} perdidas · ver no cerradas →`, icon: ICONS.trend, accent: 'violet', compact: true, href: '#/admin/requests?status=cancelada', trend: [40, 36, 44, 48, 52, 56, 60, 64] })}
        ${kpiCard({ label: 'Usuarios', value: String(users.length), hint: 'Cuentas registradas', icon: ICONS.users, accent: 'amber', compact: true, trend: [24, 26, 28, 30, 32, 34, 36, 38] })}
      </section>

      <section class="doctor-main-grid">
        <div class="panel">
          <div class="panel__header">
            <div>
              <span class="section-label section-label--inline">Tu flujo de trabajo</span>
              <h2 class="panel__title">Cola de trabajo</h2>
            </div>
            <div class="decision-pager" id="admin-todo-pager" style="display:none"></div>
          </div>
          <div id="admin-todo-wrap"></div>
        </div>

        <div class="panel panel--chart panel--doctor-chart">
          <div class="panel__header">
            <h2 class="panel__title" id="admin-chart-title">Ingreso CS Travel Group por empresa</h2>
            <div class="decision-pager" id="admin-chart-pager"></div>
          </div>
          <div class="doctor-period-card__body">
            <div id="admin-chart-wrap"></div>
          </div>
        </div>
      </section>

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
            <div class="decision-pager" id="admin-recent-pager" style="display:none"></div>
          </div>
          <div id="admin-recent-wrap"></div>
        </div>
      </section>
    `;
  },

  async afterRender() {
    updateTodo();
    updateChart();
    updateRecent();
  },
};
