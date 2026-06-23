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
import heroImgMedico from '../assets/hero-medico.png';
import { StatusBadge } from '../components/StatusBadge.js';
import { ColumnChart, SemiGaugeChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { infoBtn, bindInfoModals } from '../components/InfoModal.js';

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
  { key: 'solicitud enviada', label: 'Solicitud enviada', color: '#1456a0' },
  { key: 'cotizacion enviada', label: 'Cotizacion enviada', color: '#c77700' },
  { key: 'aprobada', label: 'Aprobada', color: '#1a7f4b' },
  { key: 'en gestion', label: 'En gestion', color: '#5b4bd8' },
  { key: 'finalizada', label: 'Finalizada', color: '#0e8a8f' },
  { key: 'cancelada', label: 'Cancelada', color: '#d6453d' },
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
export function renderStatusChart(cases, { animate = true } = {}) {
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
    centerLabel: 'Casos',
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
        <div>
          <span class="partner-strip__label">Soporte CST</span>
          <p class="partner-strip__tagline">Equipo dedicado a aliados medicos</p>
        </div>
      </div>

      <div class="partner-strip__block partner-strip__block--referral">
        <span class="partner-strip__label">Tu enlace de referidos</span>
        <div class="partner-strip__referral-url" id="doctor-referral-url" title="${escapeHtml(referralLink)}">${escapeHtml(referralLink)}</div>
        <div class="partner-strip__referral-actions">
          <button type="button" class="btn btn--primary btn--sm" id="copy-referral-link">Copiar enlace</button>
          <a href="${escapeHtml(referralLink)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">Abrir</a>
        </div>
        <p class="muted">Comparte este enlace con tus pacientes para que te acrediten la referencia.</p>
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
      <img class="dashboard-hero-img" src="${heroImgMedico}" alt="" aria-hidden="true" />
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
      <p class="decision-hero__hint">Define tu margen para avanzar con la operacion.</p>
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
      <section class="doctor-top-grid" aria-label="Resumen y decision">
        ${renderGainHero({ earnedMargin, pipelinePending: pipelinePotential, momPct })}
        ${renderDecisionHero(actionable)}
      </section>

      <section class="doctor-kpi-row doctor-kpi-row--trio" aria-label="Indicadores">
        ${dashboardCard({ label: 'Generado por tu link', value: formatCurrency(affiliateGenerated), hint: `${affiliatePatients} paciente${affiliatePatients === 1 ? '' : 's'} por tu link de afiliado`, icon: ICONS.link, accent: 'blue', trend: [18, 22, 26, 32, 38, 44, 50, 58] })}
        ${dashboardCard({ label: 'Pipeline potencial', value: formatCurrency(pipelinePotential), hint: `${cases.filter((c) => PIPELINE_STATUSES.includes(c.status)).length} cotizaciones`, icon: ICONS.trend, accent: 'violet', trend: [14, 20, 26, 32, 40, 48, 54, 60] })}
        ${dashboardCard({ label: 'Ticket promedio', value: formatCurrency(avgTicket), hint: `${earnedCases.length} caso(s) ganados`, icon: ICONS.card, accent: 'amber', trend: [30, 28, 34, 32, 38, 40, 44, 42] })}
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

    bindDecisionHero();
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
