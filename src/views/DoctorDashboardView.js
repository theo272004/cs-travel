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
import { codeService } from '../services/codeService.js';
import { referralService } from '../services/referralService.js';
import { showToast } from '../utils/toast.js';
import { shakeError } from '../utils/feedback.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ColumnChart, SemiGaugeChart } from '../components/Chart.js';
import { formatCurrency, formatWithUsd } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { infoBtn, bindInfoModals } from '../components/InfoModal.js';
import { greeting } from '../utils/greeting.js';
import { payHref, payTargetAttrs } from '../utils/payLink.js';
import { renderBenefitsCenter, bindBenefitsCenter } from '../components/AlliedValue.js';

const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
const PIPELINE_STATUSES = ['cotizacion enviada'];
const ACTION_STATUSES = ['cotizacion enviada'];
const QUOTED_STATUSES = ['cotizacion enviada', 'aprobada', 'en gestion', 'finalizada'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
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
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};

let cachedDoctorCases = [];
let cachedActiveCases = [];
let cachedActionable = [];
let decisionIndex = 0;
// Desglose por período: al tocar una barra del gráfico se abre el detalle de
// los pacientes/casos que componen esa ganancia. Cache reconstruida en cada
// cambio de rango (mensual / diario / anual).
let cachedPeriodGroups = {};
let cachedPeriodMode = 'monthly';

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
  const now = new Date();
  const currentYear = now.getFullYear();

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

  if (mode === 'daily') {
    const year = currentYear;
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totals = Array.from({ length: daysInMonth }, () => 0);
    source.forEach((c) => {
      const d = new Date(c.updatedAt || c.createdAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        totals[d.getDate() - 1] += earnedValue(c);
      }
    });
    return totals.map((value, i) => ({
      label: String(i + 1),
      value,
      color: '#0058c1',
    }));
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

/** Lo que el paciente pagó por el viaje (con respaldo si falta el campo). */
const patientPurchase = (c) => c.finalPatientValue
  || ((c.baseCost || 0) + (c.csTravelMargin || 0) + (c.doctorMargin || 0));

/**
 * Agrupa los casos con ganancia por período (mes/día/año) usando la MISMA
 * etiqueta que dibuja el gráfico, para que al tocar una barra se encuentre su
 * grupo por el texto de la etiqueta. Devuelve { etiqueta: { cases, total } }.
 */
function buildPeriodGroups(cases, mode = 'monthly') {
  const source = cases.filter((c) => earnedValue(c) > 0);
  const now = new Date();
  const currentYear = now.getFullYear();
  const groups = {};

  source.forEach((c) => {
    const d = new Date(c.updatedAt || c.createdAt);
    let key = null;
    if (mode === 'annual') {
      key = String(d.getFullYear());
    } else if (mode === 'daily') {
      if (d.getFullYear() === currentYear && d.getMonth() === now.getMonth()) {
        key = String(d.getDate());
      }
    } else if (d.getFullYear() === currentYear) {
      key = MONTH_LABELS[d.getMonth()];
    }
    if (key == null) return;
    if (!groups[key]) groups[key] = { cases: [], total: 0 };
    groups[key].cases.push(c);
    groups[key].total += earnedValue(c);
  });

  return groups;
}

/** Título legible del período según el modo y la etiqueta de la barra. */
function periodTitle(label, mode) {
  const year = new Date().getFullYear();
  if (mode === 'annual') return `Año ${label}`;
  if (mode === 'daily') return `${label} de ${MONTH_FULL[new Date().getMonth()]}, ${year}`;
  const idx = MONTH_LABELS.indexOf(label);
  return `${idx >= 0 ? MONTH_FULL[idx] : label} ${year}`;
}

/** Contenido del modal de desglose: hero + 3 indicadores + tarjetas por caso. */
function renderPeriodDetail(group, mode) {
  const cases = [...group.cases].sort((a, b) => earnedValue(b) - earnedValue(a));
  const count = cases.length;
  const managed = cases.reduce((s, c) => s + patientPurchase(c), 0);
  const avgTicket = count ? Math.round(group.total / count) : 0;

  const rows = cases.map((c) => {
    const logistics = (c.baseCost || 0) + (c.csTravelMargin || 0);
    return `
      <a class="period-case" href="#/doctor/cases/${c.id}" aria-label="Ver caso de ${escapeHtml(c.fullName || c.patientName)}">
        <div class="period-case__head">
          <div class="period-case__id">
            <strong class="period-case__name">${escapeHtml(c.fullName || c.patientName)}</strong>
            <span class="period-case__meta">${escapeHtml(c.caseCode)} · ${escapeHtml(c.procedure)}</span>
            <span class="period-case__meta">${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}</span>
          </div>
          ${StatusBadge(c.status)}
        </div>
        <div class="period-case__figures">
          <div class="period-fig">
            <span class="period-fig__label">Compra del paciente</span>
            <strong class="period-fig__value">${formatCurrency(patientPurchase(c))}</strong>
          </div>
          <div class="period-fig">
            <span class="period-fig__label">Costo logístico</span>
            <strong class="period-fig__value">${formatCurrency(logistics)}</strong>
          </div>
          <div class="period-fig period-fig--gain">
            <span class="period-fig__label">Tu ganancia</span>
            <strong class="period-fig__value text-green">${formatCurrency(c.doctorMargin || 0)}</strong>
          </div>
        </div>
        <span class="period-case__link">Ver caso completo →</span>
      </a>
    `;
  }).join('');

  return `
    <div class="period-detail__summary">
      <div class="period-detail__hero">
        <span class="period-detail__hero-label">Ganancia del período</span>
        <strong class="period-detail__hero-value">${formatCurrency(group.total)}</strong>
      </div>
      <div class="period-detail__stats">
        <div class="period-stat">
          <span class="period-stat__value">${count}</span>
          <span class="period-stat__label">Caso${count === 1 ? '' : 's'}</span>
        </div>
        <div class="period-stat">
          <span class="period-stat__value">${formatCurrency(avgTicket)}</span>
          <span class="period-stat__label">Ticket promedio</span>
        </div>
        <div class="period-stat">
          <span class="period-stat__value">${formatCurrency(managed)}</span>
          <span class="period-stat__label">Valor gestionado</span>
        </div>
      </div>
    </div>
    <div class="period-detail__list">${rows}</div>
  `;
}

/** Abre el modal de desglose para la etiqueta de barra recibida. */
function openPeriodDetail(label) {
  const group = cachedPeriodGroups[label];
  const modal = document.getElementById('period-detail-modal');
  if (!group || !modal) return;
  const n = group.cases.length;
  document.getElementById('period-detail-title').textContent = periodTitle(label, cachedPeriodMode);
  document.getElementById('period-detail-subtitle').textContent =
    `${n} paciente${n === 1 ? '' : 's'} · desglose de ganancias`;
  document.getElementById('period-detail-body').innerHTML = renderPeriodDetail(group, cachedPeriodMode);
  modal.classList.add('is-open');
}

function renderGeneratedChart(cases, mode = 'monthly') {
  return ColumnChart({
    data: buildGeneratedData(cases, mode),
    formatValue: formatCurrency,
    color: '#0058c1',
    keepZero: mode === 'monthly',
  });
}

/**
 * Al tocar una columna: la resalta (#0058C1), atenúa el resto y abre el modal
 * con el desglose de los pacientes que componen esa ganancia.
 */
function bindGeneratedChart(container) {
  if (!container) return;
  const cols = container.querySelectorAll('.column-chart__col:not(.column-chart__col--empty)');
  cols.forEach((col) => {
    col.classList.add('column-chart__col--clickable');
    col.addEventListener('click', () => {
      cols.forEach((c) => c.classList.remove('is-active', 'is-dimmed'));
      col.classList.add('is-active');
      cols.forEach((c) => { if (c !== col) c.classList.add('is-dimmed'); });
      const label = col.querySelector('small')?.textContent?.trim();
      if (label) openPeriodDetail(label);
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

// Los 6 estados del modelo de operaciones, cada uno con su color (coherente
// con los badges) para el medidor semicircular "Mis casos por estado".
// Orden del flujo de operaciones; color por estado igual al de su badge.
const STATUS_META = [
  { key: 'solicitud enviada', label: 'Solicitud enviada', color: '#3f8af0' },
  { key: 'cotizacion enviada', label: 'Cotizacion enviada', color: '#eaa30c' },
  { key: 'aprobada', label: 'Aprobada', color: '#22a866' },
  { key: 'en gestion', label: 'En gestion', color: '#7c6cf0' },
  { key: 'finalizada', label: 'Finalizada', color: '#16b3bd' },
  { key: 'cancelada', label: 'Cancelada', color: '#ec5a51' },
];

// Estados antiguos en localStorage -> su equivalente en el modelo de 6.
const LEGACY_STATUS = {
  'caso enviado': 'solicitud enviada',
  'en revision': 'solicitud enviada',
  nueva: 'solicitud enviada',
  'en cotizacion': 'cotizacion enviada',
};

/**
 * Medidor "Mis casos por estado": cuenta cada caso en su estado real (los 6
 * del modelo) y dibuja un segmento por estado presente. Recalcula con la lista
 * que reciba, así que se actualiza al filtrar/buscar.
 */
export function renderStatusChart(cases, { animate = true, label = 'Casos' } = {}) {
  const counts = {};
  cases.forEach((c) => {
    const key = LEGACY_STATUS[c.status] || c.status;
    counts[key] = (counts[key] || 0) + 1;
  });

  const segments = STATUS_META.map((s) => ({
    label: s.label,
    value: counts[s.key] || 0,
    color: s.color,
  }));

  return SemiGaugeChart({
    segments,
    centerValue: String(cases.length),
    centerLabel: label,
    formatValue: (value) => String(value),
    animate,
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
  const referralLink = `https://cstravelgroup.com/?ref=${encodeURIComponent(doctor.sharedCode || 'CST-MED')}`;

  return `
    <section class="partner-strip">

      <div class="partner-strip__brand">
        <div class="partner-strip__brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.6 4.88 2 2 0 0 1 3.6 2.71h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10a16 16 0 0 0 6.06 6.06l.92-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        <span class="partner-strip__label">Soporte CST</span>
        <p class="partner-strip__tagline">Equipo dedicado a aliados médicos</p>
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
        <span class="gain-hero__label">Ganancias acumuladas ${infoBtn('medico-ingresos')}</span>
        <span class="gain-hero__year">Mensual (${new Date().getFullYear()})</span>
      </div>
      <strong class="gain-hero__value">${formatWithUsd(earnedMargin)}</strong>
      ${momPct != null
        ? `<span class="gain-hero__delta">${ICONS.trend} ${momPct >= 0 ? '+' : ''}${momPct}% vs mes anterior</span>`
        : ''}
      <div class="gain-hero__divider"></div>
      <div class="gain-hero__pipeline">
        <span class="gain-hero__pipeicon" aria-hidden="true">${ICONS.trend}</span>
        <div>
          <span class="gain-hero__pipe-label">Pipeline pendiente</span>
          <strong class="gain-hero__pipe-value">${formatWithUsd(pipelinePending)}</strong>
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
    <article class="decision-hero is-urgent decision-hero--clickable" role="button" tabindex="0" aria-label="Ajustar margen del caso pendiente">
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
    </article>
  `;
}

/** Pasa de un caso a otro dentro del panel "Pendiente de tu decision". */
function bindDecisionHero() {
  const hero = document.querySelector('.decision-hero--clickable');
  if (!hero || !cachedActionable.length) return;

  // Toda la tarjeta es un botón: lleva a ajustar el margen del caso visible.
  const goToCurrent = () => {
    const c = cachedActionable[decisionIndex];
    if (c) window.location.hash = `#/doctor/cases/${c.id}`;
  };
  hero.addEventListener('click', (e) => {
    // No navegar si el clic fue en los botones del paginador.
    if (e.target.closest('.decision-pager__btn')) return;
    goToCurrent();
  });
  hero.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToCurrent(); }
  });

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

  // stopPropagation: paginar no debe disparar la navegación de la tarjeta.
  prev.addEventListener('click', (e) => { e.stopPropagation(); show(decisionIndex - 1); });
  next.addEventListener('click', (e) => { e.stopPropagation(); show(decisionIndex + 1); });
}

// =============================================================================
// PENDIENTES (unificado): UN solo panel con selector Todos / Margen / Aprobación
// / Pagar. Reemplaza el cuadro separado de "Por pagar". Cada fila indica si el
// cliente ya aceptó la cotización (✓/✗).
//   - Margen:     cotización enviada SIN tu margen aún (acción: ajustar margen).
//   - Aprobación: cotización con tu margen, esperando que el paciente apruebe.
//   - Pagar:      el paciente aprobó (✓), listo para cobrar (link de pago).
// =============================================================================
const PENDING_CATS = [
  { key: 'margen', label: 'Margen', color: '#eaa30c' },
  { key: 'aprobacion', label: 'Aprobación', color: '#3f8af0' },
  { key: 'pagar', label: 'Pagar', color: '#22a866' },
];

let cachedPending = [];

/** Clasifica un caso en su etapa pendiente, o null si no está pendiente. */
function classifyPending(c) {
  if (c.status === 'cotizacion enviada') return (c.doctorMargin || 0) > 0 ? 'aprobacion' : 'margen';
  if (c.status === 'aprobada') return 'pagar';
  return null;
}

/** ¿El paciente ya aceptó la cotización? (aprobada en adelante). */
function clientAccepted(c) {
  return ['aprobada', 'en gestion', 'finalizada'].includes(c.status);
}

/** Filas de la lista de pendientes según la categoría elegida. */
function renderPendList(list) {
  if (!list.length) {
    return `<div class="pend-empty"><strong>Todo al día</strong><p class="muted">No tienes pendientes en esta categoría.</p></div>`;
  }
  return list.slice(0, 5).map(({ c, cat }) => {
    const meta = PENDING_CATS.find((m) => m.key === cat);
    const accepted = clientAccepted(c);
    const value = c.finalPatientValue || ((c.baseCost || 0) + (c.csTravelMargin || 0) + (c.doctorMargin || 0));
    let action;
    if (cat === 'pagar') {
      const href = payHref({ reference: 'case:' + c.id, concept: c.caseCode || 'Cotización', amount: value });
      action = `<a class="pend-act pend-act--pay" href="${href}"${payTargetAttrs()}>Pagar ${escapeHtml(formatCurrency(value))} →</a>`;
    } else if (cat === 'margen') {
      action = `<a class="pend-act" href="#/doctor/cases/${c.id}">Ajustar margen →</a>`;
    } else {
      action = `<a class="pend-act pend-act--ghost" href="#/doctor/cases/${c.id}">Ver caso →</a>`;
    }
    // En "Aprobación" el indicador de Cliente es un BOTÓN: el médico marca que el
    // cliente aprobó su cotización -> el caso pasa a "aprobada" (y a la categoría
    // Pagar). En las demás categorías es solo un indicador de lectura (✓/✗).
    const acceptEl = cat === 'aprobacion'
      ? `<span class="pend-approve" role="group" aria-label="¿El cliente aprobó la cotización?">
          <span class="pend-approve__q">¿Cliente aprobó?</span>
          <button type="button" class="pend-approve__btn pend-approve__btn--yes" data-action="client-approved" data-id="${c.id}" title="Sí aprobó → el caso pasa a Pagar">✓ Sí</button>
          <button type="button" class="pend-approve__btn pend-approve__btn--no" data-action="client-declined" data-id="${c.id}" title="No aprobó → el caso se cancela">✗ No</button>
        </span>`
      : `<span class="pend-accept ${accepted ? 'is-yes' : 'is-no'}" title="${accepted ? 'El cliente aceptó la cotización' : 'El cliente aún no acepta'}"><b aria-hidden="true">${accepted ? '✓' : '✗'}</b> Cliente</span>`;
    return `
      <div class="pend-row">
        <div class="pend-row__main">
          <a href="#/doctor/cases/${c.id}" class="pend-row__code">${escapeHtml(c.caseCode)}</a>
          <span class="muted-block">${escapeHtml(c.patientName || c.fullName || '')}${c.procedure ? ' · ' + escapeHtml(c.procedure) : ''}</span>
        </div>
        <span class="pend-tag" style="--c:${meta.color}">${escapeHtml(meta.label)}</span>
        ${acceptEl}
        ${action}
      </div>`;
  }).join('');
}

/** Panel unificado de Pendientes con selector de categoría. */
function renderPendientes(cases) {
  cachedPending = cases
    .map((c) => ({ c, cat: classifyPending(c) }))
    .filter((x) => x.cat)
    .sort((a, b) => new Date(b.c.updatedAt || b.c.createdAt) - new Date(a.c.updatedAt || a.c.createdAt));

  const counts = { todos: cachedPending.length };
  PENDING_CATS.forEach((cat) => { counts[cat.key] = cachedPending.filter((x) => x.cat === cat.key).length; });

  const chips = [{ key: 'todos', label: 'Todos', color: '#0a2d66' }, ...PENDING_CATS]
    .map((cat, i) => `
      <button type="button" class="pend-chip ${i === 0 ? 'is-active' : ''}" data-cat="${cat.key}" style="--c:${cat.color}">
        ${escapeHtml(cat.label)} <span class="pend-chip__n">${counts[cat.key] || 0}</span>
      </button>`).join('');

  return `
    <article class="panel pend-panel">
      <style>
        .pend-panel { display:flex; flex-direction:column; overflow:hidden; }
        .pend-filter { display:flex; flex-wrap:wrap; gap:6px; margin:2px 0 10px; flex-shrink:0; }
        .pend-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px;
          border:1px solid #e0e6f0; background:#fff; color:#41506a; font-weight:700; font-size:.74rem; cursor:pointer;
          transition:background .15s ease, color .15s ease, border-color .15s ease; }
        .pend-chip:hover { border-color:var(--c); color:var(--c); }
        .pend-chip.is-active { background:var(--c); border-color:var(--c); color:#fff; }
        .pend-chip__n { display:inline-grid; place-items:center; min-width:17px; height:17px; padding:0 4px;
          border-radius:999px; background:rgba(10,45,102,.08); font-size:.68rem; }
        .pend-chip.is-active .pend-chip__n { background:rgba(255,255,255,.25); }
        .pend-list { display:flex; flex-direction:column; gap:6px; overflow-y:auto; flex:1; min-height:0; }
        .pend-row { display:flex; align-items:center; flex-wrap:wrap; gap:9px 14px; padding:11px 14px;
          border:1px solid #eef1f7; border-radius:12px; background:#fbfcfe; }
        .pend-row__main { flex:1 1 170px; min-width:0; }
        .pend-row__code { font-weight:800; color:#0a2d66; }
        .pend-tag { font-size:.72rem; font-weight:800; color:var(--c); background:#f4f6fb; border:1px solid #e3e9f3;
          padding:3px 9px; border-radius:999px; white-space:nowrap; }
        .pend-accept { font-size:.76rem; font-weight:700; white-space:nowrap; display:inline-flex; align-items:center; gap:5px; }
        .pend-accept b { font-size:.95rem; }
        .pend-accept.is-yes { color:#16794a; }
        .pend-accept.is-no { color:#b23b3b; }
        .pend-approve { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
        .pend-approve__q { font-size:.74rem; font-weight:700; color:#41506a; }
        .pend-approve__btn { border:1px solid currentColor; background:#fff; cursor:pointer; padding:3px 9px;
          border-radius:999px; font-size:.74rem; font-weight:800; transition:background .15s ease, color .15s ease; }
        .pend-approve__btn--yes { color:#16794a; }
        .pend-approve__btn--yes:hover { background:#16794a; color:#fff; }
        .pend-approve__btn--no { color:#b23b3b; }
        .pend-approve__btn--no:hover { background:#b23b3b; color:#fff; }
        .pend-approve__btn:disabled { opacity:.5; cursor:default; }
        .pend-act { font-weight:800; font-size:.82rem; color:#0a52c6; white-space:nowrap; text-decoration:none; }
        .pend-act--pay { background:#22a866; color:#fff; padding:7px 13px; border-radius:9px; }
        .pend-act--pay:hover { background:#1c9258; }
        .pend-act--ghost { color:#6b7280; }
        .pend-empty { text-align:center; padding:24px 14px; }
        .pend-empty strong { display:block; color:#0a2d66; }
      </style>
      <div class="panel__header">
        <h2 class="panel__title"><span class="pulse-dot" aria-hidden="true"></span>Pendientes</h2>
        <a href="#/doctor/cases" class="link">Ver casos →</a>
      </div>
      <div class="pend-filter" id="pend-filter">${chips}</div>
      <div class="pend-list" id="pend-list">${renderPendList(cachedPending)}</div>
    </article>
  `;
}

/** Selector de categoría del panel Pendientes (filtra la lista en el cliente). */
function bindPendientes() {
  const filter = document.getElementById('pend-filter');
  const list = document.getElementById('pend-list');
  if (!filter || !list) return;
  filter.addEventListener('click', (e) => {
    const chip = e.target.closest('.pend-chip');
    if (!chip) return;
    filter.querySelectorAll('.pend-chip').forEach((b) => b.classList.remove('is-active'));
    chip.classList.add('is-active');
    const cat = chip.dataset.cat;
    const filtered = cat === 'todos' ? cachedPending : cachedPending.filter((x) => x.cat === cat);
    list.innerHTML = renderPendList(filtered);
  });

  // "¿Cliente aprobó?" (categoría Aprobación): el médico confirma que el cliente
  // aceptó su cotización -> el caso pasa a "aprobada" y, al re-renderizar el panel,
  // salta a la categoría Pagar (siguiente paso: cobrar).
  list.addEventListener('click', async (e) => {
    const yes = e.target.closest('[data-action="client-approved"]');
    const no = e.target.closest('[data-action="client-declined"]');
    const btn = yes || no;
    if (!btn) return;
    const item = cachedPending.find((x) => String(x.c.id) === String(btn.dataset.id))?.c;
    if (!item) return;
    const approved = Boolean(yes);
    const msg = approved
      ? `¿El cliente aprobó la cotización ${item.caseCode}? El caso pasará al estado "Pagar".`
      : `¿El cliente NO aprobó la cotización ${item.caseCode}? El caso se marcará como "cancelada".`;
    if (!window.confirm(msg)) return;
    btn.disabled = true;
    try {
      await medicalCaseService.update(item.id, { status: approved ? 'aprobada' : 'cancelada' });
      // Recalculo best-effort (en produccion lo hace el servidor); no rompe la accion.
      await doctorService.recompute(item.doctorId);
      showToast(
        approved
          ? `Aprobación registrada para ${item.caseCode}. CS Travel avanzará con la gestión.`
          : `Registramos que el cliente no aprobó ${item.caseCode}.`,
        approved ? 'success' : 'info'
      );
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      shakeError(btn);
      showToast('No se pudo actualizar el caso. Intenta de nuevo en un momento.', 'error');
      btn.disabled = false;
    }
  });
}

// Iconos extra solo para el centro de beneficios del medico.
const BEN_ICONS = {
  support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M21 16.5a2.5 2.5 0 0 1-2.5 2.5H17v-7h1.5A2.5 2.5 0 0 1 21 14.5z"/><path d="M3 16.5A2.5 2.5 0 0 0 5.5 19H7v-7H5.5A2.5 2.5 0 0 0 3 14.5z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>',
};

/**
 * "Tus beneficios como aliado": cuadro que EXPLICA con claridad lo que el medico
 * gana al ser aliado de CS Travel (espejo del Centro de beneficios de la empresa).
 */
function renderDoctorBenefits() {
  const items = [
    { icon: ICONS.money, title: 'Ingreso por cada paciente', desc: 'Defines tu margen y ganas en cada viaje que coordinas. Un ingreso adicional, sin cambiar tu practica medica.' },
    { icon: ICONS.link, title: 'Ingresos por referidos', desc: 'Tu enlace de afiliado: cada paciente que llega por ti queda atribuido a tu cuenta y suma a tus ganancias.' },
    { icon: ICONS.briefcase, title: 'Nosotros operamos todo', desc: 'CS Travel gestiona vuelos, hoteles y traslados de principio a fin. Tu solo lideras la relacion con tu paciente.' },
    { icon: BEN_ICONS.support, title: 'Soporte dedicado', desc: 'Un equipo CST exclusivo para aliados medicos te acompana en cada caso, con prioridad.' },
    { icon: ICONS.activity, title: 'Trazabilidad en tiempo real', desc: 'Sigue el estado de cada paciente y tus ganancias desde este panel, sin llamadas ni papeleo.' },
    { icon: BEN_ICONS.heart, title: 'Mejor experiencia para tu paciente', desc: 'Le ofreces un servicio completo —tratamiento mas viaje resuelto— que eleva tu reputacion y lo fideliza.' },
  ];
  const cards = items.map((b) => `
    <article class="docben-card">
      <span class="docben-card__icon" aria-hidden="true">${b.icon}</span>
      <div>
        <strong class="docben-card__title">${escapeHtml(b.title)}</strong>
        <p class="docben-card__desc">${escapeHtml(b.desc)}</p>
      </div>
    </article>`).join('');

  return `
    <section class="panel">
      <style>
        .docben-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; }
        .docben-card { display:flex; gap:13px; align-items:flex-start; padding:16px;
          border:1px solid #eef1f7; border-radius:14px; background:#fbfcff; }
        .docben-card__icon { flex:none; width:40px; height:40px; border-radius:11px; display:grid; place-items:center;
          background:linear-gradient(135deg,#0a2d66,#0058c1); color:#fff; }
        .docben-card__icon svg { width:20px; height:20px; stroke-width:1.8; }
        .docben-card__title { display:block; color:#0a2d66; font-size:.95rem; margin-bottom:3px; }
        .docben-card__desc { margin:0; font-size:.84rem; line-height:1.5; color:#56627a; }
        @media (max-width: 980px) { .docben-grid { grid-template-columns:repeat(2, 1fr); } }
        @media (max-width: 600px) { .docben-grid { grid-template-columns:1fr; } }
      </style>
      <div class="panel__header">
        <h2 class="panel__title">Tus beneficios como aliado</h2>
        <span class="muted">Todo lo que ganas con CS Travel Group</span>
      </div>
      <div class="docben-grid">${cards}</div>
    </section>
  `;
}

// Estados de un referido (mismo modelo que el admin/empresa).
const REF_STATUS_MED = {
  escribio:   { label: 'Escribió',   css: 'escribio'  },
  cotizo:     { label: 'Cotizó',     css: 'cotizo'    },
  aprobado:   { label: 'Aprobado',   css: 'aprobado'  },
  finalizado: { label: 'Finalizado', css: 'finalizado'},
};
const REF_EARNED_MED = ['aprobado', 'finalizado'];

/**
 * "Tus referidos": panel de SOLO LECTURA en el dashboard del médico. Muestra los
 * pacientes/contactos que el equipo CST le atribuye por su enlace de afiliado y
 * la comisión que generan. Se muestra SIEMPRE (aun vacío) para que el médico
 * sepa que tiene esta opción; el estado vacío invita a compartir su enlace.
 */
function renderDoctorReferrals(refs, sharedCode) {
  const rowsOrEmpty = !refs.length
    ? `
      <div class="ref-empty-cta">
        <p><strong>Aún no tienes referidos registrados.</strong></p>
        <p class="muted">Cada paciente que llega por tu enlace de afiliado queda atribuido a tu
        cuenta y suma comisión. Comparte tu código <strong>${escapeHtml(sharedCode || 'CST-MED')}</strong>
        para empezar; el equipo CST irá registrando aquí cada referido y su avance.</p>
      </div>`
    : (() => {
        const rows = refs.map((r) => {
          const meta = REF_STATUS_MED[r.status] || REF_STATUS_MED.escribio;
          const earned = REF_EARNED_MED.includes(r.status) && r.amount > 0;
          const commission = earned
            ? formatCurrency(r.amount * (r.commissionPct || 0) / 100)
            : '<span class="muted">En proceso</span>';
          const amount = r.amount > 0 ? formatCurrency(r.amount) : '—';
          const dateStr = r.date
            ? new Date(r.date + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })
            : '—';
          return `
            <tr>
              <td><strong>${escapeHtml(r.name || 'Referido')}</strong></td>
              <td>${dateStr}</td>
              <td><span class="ref-status ref-status--${meta.css}">${meta.label}</span></td>
              <td>${amount}</td>
              <td>${commission}</td>
            </tr>`;
        }).join('');
        return `
          <div class="table-wrapper">
            <table class="data-table ref-table">
              <thead>
                <tr><th>Referido</th><th>Fecha</th><th>Estado</th><th>Monto</th><th>Tu comisión</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      })();

  const total = refs.length;
  const closed = refs.filter((r) => REF_EARNED_MED.includes(r.status)).length;
  const totalComm = refs
    .filter((r) => REF_EARNED_MED.includes(r.status) && r.amount > 0)
    .reduce((s, r) => s + r.amount * (r.commissionPct || 0) / 100, 0);

  return `
    <section class="panel">
      <div class="panel__header">
        <h2 class="panel__title">Tus referidos ${infoBtn('medico-ingresos')}</h2>
        <span class="muted">Pacientes que llegan por tu enlace de afiliado</span>
      </div>
      <div class="ref-summary">
        <div class="ref-summary__stat"><span class="ref-summary__num ref-summary__num--blue">${total}</span><span class="ref-summary__lbl">Total referidos</span></div>
        <div class="ref-summary__stat"><span class="ref-summary__num ref-summary__num--amber">${closed}</span><span class="ref-summary__lbl">Aprobados / Finalizados</span></div>
        <div class="ref-summary__stat"><span class="ref-summary__num ref-summary__num--green">${formatCurrency(totalComm)}</span><span class="ref-summary__lbl">Comisión generada</span></div>
      </div>
      ${rowsOrEmpty}
    </section>
  `;
}

export const DoctorDashboardView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);

    // Códigos de referido ASIGNADOS a este médico por el admin (vacío = pendiente).
    let assignedCodes = [];
    try { assignedCodes = await codeService.getByOwner('doctor', doctorId); } catch (e) { assignedCodes = []; }

    // Referidos del médico (solo lectura; los registra el admin). Panel siempre
    // visible para que el médico conozca la opción, aun sin referidos.
    let referrals = [];
    try { referrals = await referralService.getByDoctor(doctorId); } catch (e) { referrals = []; }

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
    // Negocio total generado a través del link/código de afiliado del médico:
    // suma del valor de viaje de todos los pacientes que llegaron por su link.
    const affiliateGenerated = cases.reduce((sum, c) => sum + patientPurchase(c), 0);
    const affiliatePatients = cases.length;

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
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> ${escapeHtml(doctor.name)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(doctor.status)}
            ${doctor.clinicName ? `<span class="chip">${escapeHtml(doctor.clinicName)}</span>` : ''}
            ${doctor.specialty ? `<span class="chip">${escapeHtml(doctor.specialty)}</span>` : ''}
          </p>
        </div>
      </div>

      <section class="doctor-top-grid" aria-label="Resumen y decision">
        ${renderGainHero({ earnedMargin, pipelinePending: pipelinePotential, momPct })}
        ${renderPendientes(cases)}
      </section>

      <section class="doctor-kpi-row doctor-kpi-row--trio" aria-label="Indicadores">
        ${dashboardCard({ label: 'Valor total gestionado', value: formatWithUsd(affiliateGenerated), hint: `${affiliatePatients} paciente${affiliatePatients === 1 ? '' : 's'} en total`, icon: ICONS.link, accent: 'blue', trend: [18, 22, 26, 32, 38, 44, 50, 58] })}
        ${dashboardCard({ label: 'Pipeline potencial', value: formatWithUsd(pipelinePotential), hint: `${cases.filter((c) => PIPELINE_STATUSES.includes(c.status)).length} cotizaciones`, icon: ICONS.trend, accent: 'violet', trend: [14, 20, 26, 32, 40, 48, 54, 60] })}
        ${dashboardCard({ label: 'Ticket promedio', value: formatWithUsd(avgTicket), hint: `${earnedCases.length} caso(s) ganados`, icon: ICONS.card, accent: 'amber', trend: [30, 28, 34, 32, 38, 40, 44, 42] })}
      </section>

      <section class="doctor-main-grid">
        <div class="panel panel--chart panel--doctor-chart">
          <div class="panel__header">
            <h2 class="panel__title">Ganancias por periodo</h2>
            <select id="generated-range" class="form__input generated-range" aria-label="Rango de tiempo">
              <option value="monthly">Mensual (${new Date().getFullYear()})</option>
              <option value="daily">Diario (este mes)</option>
              <option value="annual">Anual (historico)</option>
            </select>
          </div>
          <div class="doctor-period-card__body">
            <div id="generated-chart">${renderGeneratedChart(cases, 'monthly')}</div>
            <p class="chart-hint" id="generated-hint">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74"/><path d="M14 10.5a2.5 2.5 0 0 1 5 0v2.5a7 7 0 0 1-7 7h-1.6a4 4 0 0 1-2.83-1.17l-3-3a2 2 0 0 1 2.83-2.83L9 15"/></svg>
              Toca una barra para ver el desglose por paciente.
            </p>
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

      ${renderDoctorReferrals(referrals, doctor.sharedCode)}

      ${renderDoctorBenefits()}

      ${renderBenefitsCenter(doctor.sharedCode, assignedCodes)}

      ${renderSupportStrip(doctor)}

      <div class="modal-overlay modal-overlay--doctor" id="period-detail-modal">
        <div class="modal modal--period" role="dialog" aria-modal="true" aria-labelledby="period-detail-title">
          <div class="modal__header">
            <div>
              <h2 class="modal__title" id="period-detail-title">Detalle del período</h2>
              <p class="modal__subtitle" id="period-detail-subtitle">Desglose de ganancias y pacientes</p>
            </div>
            <button type="button" class="modal__close" data-action="close-period-detail" aria-label="Cerrar">✕</button>
          </div>
          <div id="period-detail-body"></div>
        </div>
      </div>
    `;
  },

  async afterRender() {
    const range = document.getElementById('generated-range');
    const chart = document.getElementById('generated-chart');

    // Reconstruye datos + grupos del período actual y reengancha los clics.
    const refreshChart = (mode) => {
      cachedPeriodMode = mode;
      cachedPeriodGroups = buildPeriodGroups(cachedDoctorCases, mode);
      chart.innerHTML = renderGeneratedChart(cachedDoctorCases, mode);
      bindGeneratedChart(chart);
    };
    refreshChart('monthly');
    range?.addEventListener('change', () => refreshChart(range.value));

    // Cierre del modal de desglose: botón, clic en el fondo y tecla Escape.
    const periodModal = document.getElementById('period-detail-modal');
    const closePeriod = () => {
      periodModal?.classList.remove('is-open');
      chart?.querySelectorAll('.column-chart__col')
        .forEach((c) => c.classList.remove('is-active', 'is-dimmed'));
    };
    periodModal?.querySelectorAll('[data-action="close-period-detail"]')
      .forEach((b) => b.addEventListener('click', closePeriod));
    periodModal?.addEventListener('click', (e) => { if (e.target === periodModal) closePeriod(); });
    if (window.__periodEsc) document.removeEventListener('keydown', window.__periodEsc);
    window.__periodEsc = (e) => { if (e.key === 'Escape') closePeriod(); };
    document.addEventListener('keydown', window.__periodEsc);

    bindPendientes();
    bindInfoModals();

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
    bindBenefitsCenter();
  },
};

/** Activa el boton "Copiar" del codigo aliado y el enlace de referidos. */
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

  document.getElementById('copy-referral-link')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const url = document.getElementById('doctor-referral-url')?.getAttribute('title')?.trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = 'Copiado!';
      setTimeout(() => { button.textContent = 'Copiar enlace'; }, 1500);
    } catch {}
  });
}
