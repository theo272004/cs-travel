/**
 * DoctorDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard del MEDICO/CLINICA aliada con composicion compacta y ejecutiva:
 *     1. Resumen financiero en 4 tarjetas.
 *     2. Calculadora de margen + ganancias por periodo.
 *     3. Casos que requieren decision.
 *     4. KPIs operativos compactos.
 *     5. Casos por estado + casos activos.
 *     6. Simulador de margen + top ganancias.
 *     7. Soporte CST.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ColumnChart, SemiGaugeChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';

const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
const PIPELINE_STATUSES = ['cotizacion enviada'];
const ACTION_STATUSES = ['cotizacion enviada'];
const QUOTED_STATUSES = ['cotizacion enviada', 'aprobada', 'en gestion', 'finalizada'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
// Valores de referencia para visualizar el comportamiento del grafico en
// meses sin ganancias reales todavia (se reemplazan por datos reales si existen).
const SIMULATED_MONTHLY = [320000, 410000, 280000, 460000, 390000, 520000, 610000, 540000, 470000, 580000, 650000, 720000];
const SUPPORT_EMAIL = 'info.cstravelgroup@gmail.com';
const SUPPORT_PHONE = '+57 314 610 3599';
const SUPPORT_WA = '573146103599';

const ICONS = {
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h2"/></svg>',
};

let cachedDoctorCases = [];
let cachedActiveCases = [];
let cachedActionable = [];
let decisionIndex = 0;

const logisticsCost = (c) => (c.baseCost || 0) + (c.csTravelMargin || 0);
const earnedValue = (c) => (EARNED_STATUSES.includes(c.status) ? c.doctorMargin || 0 : 0);
const pipelineValue = (c) => (
  PIPELINE_STATUSES.includes(c.status) ? (c.doctorMargin || c.doctorMarginSuggested || 0) : 0
);

function pct(value, total, digits = 0) {
  if (total <= 0) return 0;
  const factor = 10 ** digits;
  return Math.round(((value / total) * 100) * factor) / factor;
}

function buildGeneratedData(cases, mode = 'monthly') {
  const source = cases.filter((c) => earnedValue(c) > 0);
  const currentYear = new Date().getFullYear();

  if (mode === 'annual') {
    if (!source.length) return [];
    const annualData = Object.entries(source.reduce((acc, c) => {
      const year = String(new Date(c.updatedAt || c.createdAt).getFullYear());
      acc[year] = (acc[year] || 0) + earnedValue(c);
      return acc;
    }, {}))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([label, value]) => ({ label, value }));
    return annualData.map((item) => ({ ...item, color: '#0058c1' }));
  }

  const totals = Array.from({ length: 12 }, () => 0);
  source.forEach((c) => {
    const date = new Date(c.updatedAt || c.createdAt);
    if (date.getFullYear() === currentYear) {
      totals[date.getMonth()] += earnedValue(c);
    }
  });

  // Datos REALES por mes (cero si aun no hay ganancias). Sin valores simulados.
  return totals.map((value, index) => ({
    label: MONTH_LABELS[index],
    value,
    color: '#0058c1',
  }));
}

function renderGeneratedChart(cases, mode = 'monthly') {
  return ColumnChart({
    data: buildGeneratedData(cases, mode),
    formatValue: formatCurrency,
    color: '#0058c1',
    keepZero: mode === 'monthly',
  });
}

/** Resalta la columna activa (clic) en #0058C1 y atenua el resto a gris. */
function bindGeneratedChart(container) {
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

function dashboardCard({
  label,
  value,
  hint,
  icon,
  accent = 'blue',
  highlight = false,
  compact = false,
  trend = [28, 38, 32, 46, 40, 56, 52, 68],
}) {
  const spark = `<span class="doctor-kpi__spark" aria-hidden="true">${trend.map((height) => `<b style="height:${height}%"></b>`).join('')}</span>`;

  return `
    <article class="doctor-kpi doctor-kpi--${escapeHtml(accent)} ${highlight ? 'doctor-kpi--hero' : ''} ${compact ? 'doctor-kpi--compact' : ''}">
      <div class="doctor-kpi__head">
        <span>${escapeHtml(label)}</span>
        <i aria-hidden="true">${icon}</i>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <div class="doctor-kpi__foot">
        <small>${escapeHtml(hint)}</small>
        ${spark}
      </div>
    </article>
  `;
}

/** Nav "Pendiente X de N" para recorrer un paciente a la vez sin crecer la tarjeta. */
function renderDecisionPager(count) {
  if (count <= 1) return '';
  return `
    <div class="decision-pager" id="decision-pager">
      <button type="button" class="decision-pager__btn" id="decision-prev" aria-label="Paciente anterior">‹</button>
      <span class="decision-pager__label">Pendiente <strong id="decision-pager-current">1</strong> de ${count}</span>
      <button type="button" class="decision-pager__btn" id="decision-next" aria-label="Paciente siguiente">›</button>
    </div>
  `;
}

function renderDecisionCards(cases) {
  if (!cases.length) {
    return `
      <div class="decision-empty">
        <strong>No tienes decisiones pendientes</strong>
        <p class="muted">Cuando CS Travel envie una nueva cotizacion, aparecera aqui para que ajustes el margen.</p>
      </div>
    `;
  }

  const visible = cases.slice(0, 3);
  return `
    <div class="decision-card-row decision-card-row--paged">
      ${visible.map((c, i) => {
        const margin = c.doctorMargin || c.doctorMarginSuggested || 0;
        return `
          <article class="decision-card ${i === 0 ? 'is-active' : ''}" data-decision-index="${i}">
            <div class="decision-card__body">
              <strong>${escapeHtml(c.patientName)}</strong>
              <span class="muted-block">${escapeHtml(c.caseCode)} · ${escapeHtml(c.procedure)}</span>
              <span class="muted-block">${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}</span>
            </div>
            <div class="decision-card__foot">
              <div>
                <span class="muted-block">Ganancia potencial</span>
                <strong class="text-green">${formatCurrency(margin)}</strong>
              </div>
              <a class="btn btn--primary btn--sm" href="#/doctor/cases/${c.id}">Ajustar margen</a>
            </div>
          </article>
        `;
      }).join('')}
    </div>
    <div class="pipeline-banner">
      <span class="pipeline-banner__label">Pipeline potencial</span>
      <strong class="pipeline-banner__value">${formatCurrency(cases.reduce((sum, c) => sum + (c.doctorMargin || c.doctorMarginSuggested || 0), 0))}</strong>
      <small>Lo que podrias sumar si tus pacientes aprueban las cotizaciones en curso.</small>
    </div>
  `;
}

/** Permite navegar entre las tarjetas de "Esperando tu decision" sin crecer el panel. */
function bindDecisionPager() {
  const pager = document.getElementById('decision-pager');
  if (!pager) return;
  const cards = Array.from(document.querySelectorAll('.decision-card-row--paged .decision-card'));
  const currentLabel = document.getElementById('decision-pager-current');
  let index = 0;

  const show = (next) => {
    index = (next + cards.length) % cards.length;
    cards.forEach((card, i) => card.classList.toggle('is-active', i === index));
    currentLabel.textContent = String(index + 1);
  };

  document.getElementById('decision-prev')?.addEventListener('click', () => show(index - 1));
  document.getElementById('decision-next')?.addEventListener('click', () => show(index + 1));
}

// Agrupacion de estados en 3 categorias para el medidor semicircular
// (paleta restringida: azul oscuro, azul principal, azul claro).
export function renderStatusChart(cases) {
  const buckets = { quoted: 0, managed: 0, sent: 0 };
  cases.forEach((c) => {
    if (['cotizacion enviada'].includes(c.status)) buckets.quoted += 1;
    else if (['en gestion', 'aprobada'].includes(c.status)) buckets.managed += 1;
    else buckets.sent += 1;
  });

  return SemiGaugeChart({
    segments: [
      { label: 'Cotizacion enviada', value: buckets.quoted, color: '#9cc6ff' },
      { label: 'En gestion', value: buckets.managed, color: '#0058c1' },
      { label: 'Caso enviado', value: buckets.sent, color: '#06244d' },
    ],
    centerValue: String(cases.length),
    centerLabel: 'Casos',
    formatValue: (value) => String(value),
  });
}

function renderActiveCasesTable(cases) {
  const visible = cases.slice(0, 2);
  if (!visible.length) return '<p class="empty-state">No tienes casos activos.</p>';

  return `
    <div class="doctor-active-table">
      <table>
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Paciente</th>
            <th>Ruta</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map((c) => `
            <tr class="clickable-row" data-href="#/doctor/cases/${c.id}">
              <td><strong>${escapeHtml(c.caseCode)}</strong></td>
              <td>
                <strong>${escapeHtml(c.patientName)}</strong>
                <span>${escapeHtml(c.procedure)}</span>
              </td>
              <td>${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}</td>
              <td>${StatusBadge(c.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderSupportStrip(doctor) {
  const waText = encodeURIComponent(`Hola CS Travel, necesito apoyo con mi cuenta aliada ${doctor.sharedCode}.`);

  return `
    <section class="partner-strip">

      <div class="partner-strip__brand">
        <div class="partner-strip__brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.6 4.88 2 2 0 0 1 3.6 2.71h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10a16 16 0 0 0 6.06 6.06l.92-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        <div>
          <span class="partner-strip__label">Soporte CST</span>
          <p class="partner-strip__tagline">Equipo dedicado a aliados medicos</p>
        </div>
      </div>

      <div class="partner-strip__block">
        <span class="partner-strip__label">Tu codigo aliado</span>
        <div class="partner-strip__code">
          <strong id="doctor-shared-code">${escapeHtml(doctor.sharedCode || 'CST-MED')}</strong>
          <button type="button" class="btn btn--ghost btn--sm" id="copy-shared-code">Copiar</button>
        </div>
        <p class="muted">Prioridad en trazabilidad y seguimiento</p>
      </div>

      <div class="partner-strip__block">
        <span class="partner-strip__label">Canales de atencion</span>
        <a class="partner-strip__contact" href="mailto:${SUPPORT_EMAIL}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          ${SUPPORT_EMAIL}
        </a>
        <a class="partner-strip__contact" href="tel:${SUPPORT_PHONE.replace(/\s/g, '')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.6 4.88 2 2 0 0 1 3.6 2.71h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10a16 16 0 0 0 6.06 6.06l.92-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          ${SUPPORT_PHONE}
        </a>
      </div>

      <div class="partner-strip__block partner-strip__block--cta">
        <span class="partner-strip__label">Escribenos ahora</span>
        <a class="support-wa" href="https://wa.me/${SUPPORT_WA}?text=${waText}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>
          </svg>
          <span>WhatsApp</span>
        </a>
      </div>

    </section>
  `;
}

const DOC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';
const ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/** Panel hero de ganancias acumuladas (lo mas importante, arriba a la izquierda). */
function renderGainHero({ earnedMargin, pipelinePending, momPct }) {
  const bars = [30, 26, 42, 36, 54, 48, 66, 60, 80, 92].map((h) => `<b style="height:${h}%"></b>`).join('');
  return `
    <article class="gain-hero">
      <div class="gain-hero__head">
        <span class="gain-hero__label">Ganancias acumuladas</span>
        <span class="gain-hero__year">Mensual (${new Date().getFullYear()})</span>
      </div>
      <strong class="gain-hero__value">${formatCurrency(earnedMargin)}</strong>
      ${momPct != null
        ? `<span class="gain-hero__delta">${ICONS.trend} ${momPct >= 0 ? '+' : ''}${momPct}% vs mes anterior</span>`
        : ''}
      <div class="gain-hero__divider"></div>
      <div class="gain-hero__pipeline">
        <span class="gain-hero__pipeicon" aria-hidden="true">${ICONS.trend}</span>
        <div>
          <span class="gain-hero__pipe-label">Pipeline pendiente</span>
          <strong class="gain-hero__pipe-value">${formatCurrency(pipelinePending)}</strong>
        </div>
      </div>
      <span class="gain-hero__bars" aria-hidden="true">${bars}</span>
    </article>
  `;
}

/** Cuerpo del caso por decidir (se re-renderiza al pasar de pagina). */
function decisionBodyHtml(c) {
  const margin = c.doctorMargin || c.doctorMarginSuggested || 0;
  return `
    <span class="decision-hero__icon" aria-hidden="true">${DOC_ICON}</span>
    <div class="decision-hero__case">
      <strong>${escapeHtml(c.patientName)}</strong>
      <span class="muted-block">${escapeHtml(c.caseCode)} · ${escapeHtml(c.procedure)}</span>
      <span class="muted-block">${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}</span>
    </div>
    <div class="decision-hero__gain">
      <span class="muted-block">Ganancia potencial</span>
      <strong class="text-green">${formatCurrency(margin)}</strong>
    </div>
  `;
}

/** Panel hero "Pendiente de tu decision": caso por decidir + paginador + CTA. */
function renderDecisionHero(actionable) {
  cachedActionable = actionable;
  decisionIndex = 0;

  if (!actionable.length) {
    return `
      <article class="decision-hero decision-hero--calm">
        <div class="decision-hero__head">
          <h2 class="decision-hero__title">Pendiente de tu decision</h2>
        </div>
        <div class="decision-hero__empty">
          <strong>Todo al dia</strong>
          <p class="muted">No tienes cotizaciones esperando tu decision. Cuando CS Travel envie una nueva, aparecera aqui.</p>
        </div>
      </article>
    `;
  }

  const c = actionable[0];
  const n = actionable.length;

  return `
    <article class="decision-hero is-urgent">
      <div class="decision-hero__head">
        <h2 class="decision-hero__title"><span class="pulse-dot" aria-hidden="true"></span>Pendiente de tu decision</h2>
        ${n > 1
          ? `<div class="decision-hero__pager">
              <button type="button" class="decision-pager__btn" id="dh-prev" aria-label="Caso anterior">‹</button>
              <span>Pendiente <strong id="dh-current">1</strong> de ${n}</span>
              <button type="button" class="decision-pager__btn" id="dh-next" aria-label="Caso siguiente">›</button>
            </div>`
          : `<span class="decision-hero__badge">1 cotizacion requiere atencion</span>`}
      </div>
      <div class="decision-hero__body" id="dh-body">${decisionBodyHtml(c)}</div>
      <a class="decision-hero__cta" id="dh-cta" href="#/doctor/cases/${c.id}">
        Ajustar margen y continuar ${ARROW_ICON}
      </a>
      <p class="decision-hero__hint">Define tu margen para avanzar con la operacion.</p>
    </article>
  `;
}

/** Pasa de un caso a otro dentro del panel "Pendiente de tu decision". */
function bindDecisionHero() {
  const prev = document.getElementById('dh-prev');
  const next = document.getElementById('dh-next');
  if (!prev || !next || cachedActionable.length <= 1) return;

  const body = document.getElementById('dh-body');
  const cta = document.getElementById('dh-cta');
  const current = document.getElementById('dh-current');

  const show = (idx) => {
    decisionIndex = (idx + cachedActionable.length) % cachedActionable.length;
    const c = cachedActionable[decisionIndex];
    body.innerHTML = decisionBodyHtml(c);
    cta.setAttribute('href', `#/doctor/cases/${c.id}`);
    current.textContent = String(decisionIndex + 1);
  };

  prev.addEventListener('click', () => show(decisionIndex - 1));
  next.addEventListener('click', () => show(decisionIndex + 1));
}

export const DoctorDashboardView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);

    cachedDoctorCases = cases;
    cachedActiveCases = medicalCaseService.getActive(cases)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const earnedCases = cases.filter((c) => EARNED_STATUSES.includes(c.status));
    const actionable = cases
      .filter((c) => ACTION_STATUSES.includes(c.status))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    const earnedMargin = earnedCases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
    const pendingApproval = actionable.reduce((sum, c) => sum + (c.doctorMargin || c.doctorMarginSuggested || 0), 0);
    const pipelinePotential = cases.reduce((sum, c) => sum + pipelineValue(c), 0);
    const avgTicket = earnedCases.length ? Math.round(earnedMargin / earnedCases.length) : 0;

    // Variacion vs mes anterior con ganancias REALES (no simuladas). Se muestra
    // solo si ambos meses tienen datos, para no exhibir saltos enormes/irreales.
    const yearNow = new Date().getFullYear();
    const earnedByMonth = Array(12).fill(0);
    earnedCases.forEach((c) => {
      const d = new Date(c.updatedAt || c.createdAt);
      if (d.getFullYear() === yearNow) earnedByMonth[d.getMonth()] += (c.doctorMargin || 0);
    });
    const mIdx = new Date().getMonth();
    const thisM = earnedByMonth[mIdx];
    const prevM = mIdx > 0 ? earnedByMonth[mIdx - 1] : 0;
    const momPct = (prevM > 0 && thisM > 0) ? Math.round(((thisM - prevM) / prevM) * 100) : null;

    return `
      <section class="doctor-top-grid" aria-label="Resumen y decision">
        ${renderGainHero({ earnedMargin, pipelinePending: pipelinePotential, momPct })}
        ${renderDecisionHero(actionable)}
      </section>

      <section class="doctor-kpi-row doctor-kpi-row--trio" aria-label="Indicadores">
        ${dashboardCard({ label: 'Pendiente por aprobar', value: formatCurrency(pendingApproval), hint: `${actionable.length} caso${actionable.length === 1 ? '' : 's'} en decision`, icon: ICONS.briefcase, accent: 'blue', trend: [18, 22, 26, 32, 38, 44, 50, 58] })}
        ${dashboardCard({ label: 'Pipeline potencial', value: formatCurrency(pipelinePotential), hint: `${cases.filter((c) => PIPELINE_STATUSES.includes(c.status)).length} cotizaciones`, icon: ICONS.trend, accent: 'violet', trend: [14, 20, 26, 32, 40, 48, 54, 60] })}
        ${dashboardCard({ label: 'Ticket promedio', value: formatCurrency(avgTicket), hint: `${earnedCases.length} caso(s) ganados`, icon: ICONS.card, accent: 'amber', trend: [30, 28, 34, 32, 38, 40, 44, 42] })}
      </section>

      <section class="doctor-main-grid">
        <div class="panel panel--chart panel--doctor-chart">
          <div class="panel__header">
            <h2 class="panel__title">Ganancias por periodo</h2>
            <select id="generated-range" class="form__input generated-range" aria-label="Rango de tiempo">
              <option value="monthly">Mensual (${new Date().getFullYear()})</option>
              <option value="annual">Anual (historico)</option>
            </select>
          </div>
          <div class="doctor-period-card__body">
            <div id="generated-chart">${renderGeneratedChart(cases, 'monthly')}</div>
          </div>
        </div>

        <div class="panel panel--dashboard-active panel--dashboard-active-compact">
          <div class="panel__header">
            <h2 class="panel__title">Casos activos</h2>
            <a href="#/doctor/cases" class="link">Ver todos →</a>
          </div>
          <div class="dashboard-active-toolbar">
            <input id="dashboard-active-search" class="form__input table-toolbar__search" type="search"
              placeholder="Buscar codigo, paciente o destino..." />
            <span class="table-toolbar__count" id="dashboard-active-count"></span>
          </div>
          <div id="dashboard-active-table">${renderActiveCasesTable(cachedActiveCases)}</div>
        </div>
      </section>

      ${renderSupportStrip(doctor)}
    `;
  },

  async afterRender() {
    const range = document.getElementById('generated-range');
    const chart = document.getElementById('generated-chart');
    bindGeneratedChart(chart);
    range?.addEventListener('change', () => {
      chart.innerHTML = renderGeneratedChart(cachedDoctorCases, range.value);
      bindGeneratedChart(chart);
    });

    bindDecisionHero();

    const search = document.getElementById('dashboard-active-search');
    const table = document.getElementById('dashboard-active-table');
    const countLabel = document.getElementById('dashboard-active-count');
    const applyActiveFilter = () => {
      const q = search?.value.trim().toLowerCase() || '';
      const filtered = cachedActiveCases.filter((item) => {
        if (!q) return true;
        return [item.caseCode, item.patientName, item.procedure, item.origin, item.destination]
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
      countLabel.textContent = `${Math.min(filtered.length, 2)} de ${filtered.length} visibles`;
      table.innerHTML = renderActiveCasesTable(filtered);
    };
    search?.addEventListener('input', applyActiveFilter);
    applyActiveFilter();

    bindSupportStrip();
  },
};

/** Activa el boton "Copiar" del codigo aliado dentro de renderSupportStrip(). */
export function bindSupportStrip() {
  document.getElementById('copy-shared-code')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const code = document.getElementById('doctor-shared-code')?.textContent?.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      button.classList.add('is-copied');
      button.textContent = 'Copiado';
      setTimeout(() => {
        button.classList.remove('is-copied');
        button.textContent = 'Copiar codigo';
      }, 1200);
    } catch {}
  });
}
