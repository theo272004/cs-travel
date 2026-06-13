/**
 * DoctorDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard del MEDICO/CLINICA aliada, ordenado segun el flujo de negocio:
 *     1. Header limpio (la creacion rapida vive en el FAB "+").
 *     2. Banda de ganancias: acumuladas, generadas este ano y ticket promedio.
 *     3. "Esperando tu decision" + grafica de "Generado por periodo".
 *     4. KPIs operativos: casos totales, activos, conversion y ahorro paciente.
 *     5. Casos por estado (donut) + casos activos con buscador.
 *     6. Tira de alianza: codigo personal del medico + canal de soporte.
 *
 * DEFINICIONES DE NEGOCIO:
 *   - Ganancia "acumulada": margen del medico en casos aprobados, en gestion
 *     o finalizados (el paciente ya acepto la cotizacion).
 *   - Pipeline potencial: margen sugerido (o ya elegido) en casos que estan
 *     siendo cotizados o ya tienen cotizacion enviada -> aun no se acepta.
 *   - Ahorro promedio por paciente: % promedio de (mercado - valor final) /
 *     mercado en casos con precio de mercado cargado. Si no hay datos, "—".
 *   - Conversion: casos ganados / casos que ya recibieron cotizacion.
 *   - "Generado este ano": suma del margen ganado del ANO ACTUAL del sistema,
 *     no del ultimo ano con datos (para no transmitir cifras falsas).
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { MetricCard } from '../components/MetricCard.js';
import { MedicalCaseTable } from '../components/MedicalCaseTable.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { DonutChart, ColumnChart } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';

// Estados donde el margen del medico ya se considera "ganado".
const EARNED_STATUSES = ['aprobada', 'en gestion', 'finalizada'];
// Estados donde el caso YA recibio cotizacion (para medir conversion).
const QUOTED_STATUSES = ['cotizacion enviada', 'aprobada', 'en gestion', 'finalizada', 'cancelada'];
// Estados que cuentan como ganancia futura (pipeline).
const PIPELINE_STATUSES = ['en cotizacion', 'cotizacion enviada'];
// Estados donde el medico tiene una accion concreta que hacer.
const ACTION_STATUSES = ['cotizacion enviada'];

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Canal de soporte CS Travel (placeholder editable cuando el cliente lo confirme).
const SUPPORT_WHATSAPP = 'https://wa.me/573000000000?text=Hola%20CS%20Travel%2C%20necesito%20apoyo%20con%20un%20caso.';

// Iconos SVG inline para los KPIs (stroke currentColor, vienen del CSS).
const ICONS = {
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2"/></svg>',
};

// Cache local entre render -> afterRender (eventos de buscador y selector).
let cachedActiveCases = [];
let cachedDoctorCases = [];
let currentGeneratedMode = 'monthly';

/** Costo logistico visible para el medico: base + margen CST (oculto). */
const logisticsCost = (c) => (c.baseCost || 0) + (c.csTravelMargin || 0);
/** Ganancia ya consolidada por caso (solo si esta en estado "ganado"). */
const earnedValue = (c) => (EARNED_STATUSES.includes(c.status) ? c.doctorMargin || 0 : 0);
/** Ganancia potencial (pipeline): lo que se ganaria si se aprueba la cotizacion. */
const pipelineValue = (c) => {
  if (!PIPELINE_STATUSES.includes(c.status)) return 0;
  return c.doctorMargin || c.doctorMarginSuggested || 0;
};

/* ---------------------------------------------------------------------------
 * GRAFICO "Generado por periodo"
 * ------------------------------------------------------------------------- */

function buildGeneratedData(cases, mode = 'monthly') {
  const source = cases.filter((c) => earnedValue(c) > 0);
  const currentYear = new Date().getFullYear();

  if (mode === 'annual') {
    if (!source.length) return [];
    const byYear = source.reduce((acc, c) => {
      const year = String(new Date(c.updatedAt || c.createdAt).getFullYear());
      acc[year] = (acc[year] || 0) + earnedValue(c);
      return acc;
    }, {});
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([label, value]) => ({ label, value, color: '#0a2540' }));
  }

  // Mensual: SIEMPRE 12 columnas del ano en curso. Los meses sin ganancia
  // se conservan en 0 para mostrar el contexto del calendario completo.
  const totals = Array.from({ length: 12 }, () => 0);
  source.forEach((c) => {
    const date = new Date(c.updatedAt || c.createdAt);
    if (date.getFullYear() === currentYear) totals[date.getMonth()] += earnedValue(c);
  });

  return totals.map((value, index) => ({
    label: MONTH_LABELS[index],
    value,
    color: '#0f9d6e',
  }));
}

function renderGeneratedChart(cases, mode = 'monthly') {
  const data = buildGeneratedData(cases, mode);
  const keepZero = mode === 'monthly';
  return ColumnChart({ data, formatValue: formatCurrency, color: '#0f9d6e', keepZero });
}

/* ---------------------------------------------------------------------------
 * "Esperando tu decision": casos donde el medico debe actuar.
 * ------------------------------------------------------------------------- */

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '·';
}

function renderActionItems(actionable) {
  if (!actionable.length) {
    return `
      <div class="action-empty">
        <span class="action-empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
        <div>
          <strong>Todo al dia.</strong>
          <p class="muted">Cuando CS Travel envie una cotizacion, aparecera aqui para que ajustes tu margen y la entregues al paciente.</p>
        </div>
      </div>
    `;
  }

  return `
    <ul class="action-list">
      ${actionable
        .map((c) => {
          const value = c.doctorMargin || c.doctorMarginSuggested || 0;
          const finalValue = logisticsCost(c) + value;
          return `
            <li class="action-list__item">
              <span class="action-list__status" aria-hidden="true"></span>
              <span class="patient-avatar action-list__avatar">${escapeHtml(initials(c.patientName))}</span>
              <div class="action-list__info">
                <strong>${escapeHtml(c.patientName)}</strong>
                <span class="muted-block">
                  ${escapeHtml(c.caseCode)} · ${escapeHtml(c.procedure)} · ${escapeHtml(c.origin)} → ${escapeHtml(c.destination)}
                </span>
              </div>
              <div class="action-list__meta">
                <span class="action-list__amount">
                  <span class="muted-block">Margen sugerido</span>
                  <strong class="text-green">${formatCurrency(value)}</strong>
                </span>
                <span class="action-list__amount">
                  <span class="muted-block">Paciente pagaria</span>
                  <strong>${formatCurrency(finalValue)}</strong>
                </span>
                <a href="#/doctor/cases/${c.id}" class="btn btn--primary btn--sm">
                  Ajustar y enviar
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
                </a>
              </div>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
}

/* ---------------------------------------------------------------------------
 * Vista principal.
 * ------------------------------------------------------------------------- */

export const DoctorDashboardView = {
  async render() {
    const doctorId = authService.getDoctorId();
    const [doctor, cases] = await Promise.all([
      doctorService.getById(doctorId),
      medicalCaseService.getByDoctor(doctorId),
    ]);

    const activeCases = medicalCaseService.getActive(cases);
    cachedActiveCases = activeCases;
    cachedDoctorCases = cases;
    currentGeneratedMode = 'monthly';

    // --- Ganancias consolidadas y potenciales --------------------------------
    const earnedCases = cases.filter((c) => EARNED_STATUSES.includes(c.status));
    const earnedMargin = earnedCases.reduce((sum, c) => sum + (c.doctorMargin || 0), 0);
    const avgTicket = earnedCases.length ? Math.round(earnedMargin / earnedCases.length) : 0;
    const pipelinePotential = cases.reduce((sum, c) => sum + pipelineValue(c), 0);

    // --- Ano en curso (suma de la grafica mensual) ---------------------------
    const generatedThisYear = buildGeneratedData(cases, 'monthly').reduce((sum, item) => sum + item.value, 0);

    // --- Ahorro promedio paciente vs mercado ---------------------------------
    const withMarket = cases.filter((c) => (c.marketReferenceCost || 0) > 0 && (c.finalPatientValue || 0) > 0);
    const avgSavingsPct = withMarket.length
      ? Math.round(
          (withMarket.reduce(
            (sum, c) => sum + (c.marketReferenceCost - c.finalPatientValue) / c.marketReferenceCost,
            0,
          ) /
            withMarket.length) *
            100,
        )
      : null;

    // --- Conversion: ganados / cotizados -------------------------------------
    const quotedCount = cases.filter((c) => QUOTED_STATUSES.includes(c.status)).length;
    const conversionPct = quotedCount > 0 ? Math.round((earnedCases.length / quotedCount) * 100) : null;

    // --- Cosas que el medico debe hacer ya -----------------------------------
    const actionable = cases
      .filter((c) => ACTION_STATUSES.includes(c.status))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    return `
      <div class="page-header page-header--doctor">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> ${escapeHtml(doctor.clinicName)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(doctor.status)}
            <span class="chip">${escapeHtml(doctor.name)}</span>
            <span class="chip">${escapeHtml(doctor.specialty || 'Aliado CS Travel')}</span>
          </p>
        </div>
      </div>

      <!-- 1. Banda de ganancias: hero acumulado + 2 stats laterales. -->
      <p class="section-label">Resumen del aliado</p>
      <section class="earnings-band">
        <article class="earnings-band__main">
          <span class="earnings-band__label">Ganancias acumuladas</span>
          <span class="earnings-band__value">${formatCurrency(earnedMargin)}</span>
          <span class="earnings-band__hint">
            <span class="earnings-band__hint-dot" aria-hidden="true"></span>
            ${earnedCases.length} caso${earnedCases.length === 1 ? '' : 's'} ganado${earnedCases.length === 1 ? '' : 's'}
          </span>
        </article>
        <article class="earnings-band__side">
          <div class="earnings-band__side-row">
            <span class="muted-block">Generado en ${new Date().getFullYear()}</span>
            <strong>${formatCurrency(generatedThisYear)}</strong>
          </div>
          <div class="earnings-band__side-row">
            <span class="muted-block">Ticket promedio</span>
            <strong>${formatCurrency(avgTicket)}</strong>
            <small class="muted">Margen medio por caso ganado</small>
          </div>
        </article>
      </section>

      <!-- 2. Accion requerida + grafica de generado por periodo. -->
      <p class="section-label">Tu flujo de trabajo</p>
      <section class="doctor-flow-grid">
        <div class="panel panel--action">
          <div class="panel__header">
            <div>
              <h2 class="panel__title">Esperando tu decision</h2>
              <p class="muted" style="font-size:.82rem">
                ${actionable.length
                  ? `Cotizaciones listas: ajusta tu margen y envia al paciente.`
                  : 'Aqui apareceran los casos que necesiten tu decision.'}
              </p>
            </div>
            ${actionable.length
              ? `<span class="chip chip--alert">${actionable.length} pendiente${actionable.length === 1 ? '' : 's'}</span>`
              : ''}
          </div>
          ${renderActionItems(actionable)}
          ${pipelinePotential > 0
            ? `
              <div class="pipeline-banner">
                <span class="pipeline-banner__label">Pipeline potencial</span>
                <strong class="pipeline-banner__value">${formatCurrency(pipelinePotential)}</strong>
                <small class="muted">Lo que podrias sumar si tus pacientes aprueban las cotizaciones en curso.</small>
              </div>
            `
            : ''}
        </div>

        <div class="panel panel--chart">
          <div class="panel__header">
            <div>
              <h2 class="panel__title">Generado por periodo</h2>
              <p class="muted" style="font-size:.82rem">Margen consolidado por mes del ano en curso.</p>
            </div>
            <select id="generated-range" class="form__input generated-range" aria-label="Rango de tiempo">
              <option value="monthly">Mensual (${new Date().getFullYear()})</option>
              <option value="annual">Anual (historico)</option>
            </select>
          </div>
          <div id="generated-chart">
            ${renderGeneratedChart(cases, 'monthly')}
          </div>
        </div>
      </section>

      <!-- 3. KPIs operativos. -->
      <p class="section-label">Seguimiento operativo</p>
      <section class="metrics-grid">
        ${MetricCard({
          label: 'Casos totales',
          value: String(cases.length),
          icon: ICONS.briefcase,
          accent: 'gray',
          subtitle: 'Registrados en tu portal',
        })}
        ${MetricCard({
          label: 'Casos activos',
          value: String(activeCases.length),
          icon: ICONS.activity,
          accent: 'blue',
          subtitle: `${activeCases.length} de ${cases.length} en gestion`,
        })}
        ${MetricCard({
          label: 'Conversion de cotizaciones',
          value: conversionPct === null ? '—' : `${conversionPct}%`,
          icon: ICONS.trend,
          accent: 'amber',
          subtitle: 'Cotizaciones aprobadas',
        })}
        ${MetricCard({
          label: 'Ahorro promedio paciente',
          value: avgSavingsPct === null ? '—' : `${avgSavingsPct}%`,
          icon: ICONS.tag,
          accent: 'green',
          subtitle: 'vs. costo de mercado',
        })}
      </section>

      <!-- 4. Estado de los casos + tabla de activos con buscador. -->
      <section class="doctor-insights-grid">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Mis casos por estado</h2>
            <span class="muted" style="font-size:.78rem">Cada estado es una etapa hacia CS Travel.</span>
          </div>
          ${DonutChart({
            data: Object.entries(
              cases.reduce((acc, c) => {
                acc[c.status] = (acc[c.status] || 0) + 1;
                return acc;
              }, {}),
            ).map(([label, value]) => ({ label, value })),
            centerLabel: 'casos',
          })}
        </div>

        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Casos activos</h2>
            <input id="dash-case-search" class="form__input table-toolbar__search" type="search"
              placeholder="Buscar..." style="max-width:200px" />
            <a href="#/doctor/cases" class="link">Ver todos →</a>
          </div>
          <div id="dash-active-cases">
            ${MedicalCaseTable(activeCases, { detailBase: '#/doctor/cases' })}
          </div>
        </div>
      </section>

      <!-- 5. Tira de alianza: codigo personal + canal de soporte. -->
      <p class="section-label">Tu alianza con CS Travel</p>
      <section class="partner-strip">
        <div class="partner-strip__block">
          <span class="partner-strip__label">Tu codigo de aliado</span>
          <div class="partner-strip__code">
            <strong id="partner-code">${escapeHtml(doctor.sharedCode)}</strong>
            <button type="button" class="btn btn--ghost btn--sm" id="copy-code"
              data-code="${escapeHtml(doctor.sharedCode)}" aria-label="Copiar codigo de aliado">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span id="copy-code-label">Copiar</span>
            </button>
          </div>
          <small class="muted">Usalo para tus propios viajes o compartelo con colegas: tendran tarifas preferenciales.</small>
        </div>
        <div class="partner-strip__block partner-strip__block--cta">
          <span class="partner-strip__label">¿Necesitas apoyo con un caso?</span>
          <a href="${SUPPORT_WHATSAPP}" target="_blank" rel="noopener" class="btn btn--primary partner-strip__cta">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path d="M20.52 3.45A11.86 11.86 0 0 0 12.05 0C5.5 0 .2 5.3.2 11.83c0 2.08.55 4.12 1.59 5.92L0 24l6.4-1.67a11.94 11.94 0 0 0 5.65 1.43h.01c6.55 0 11.85-5.3 11.85-11.83 0-3.16-1.23-6.13-3.39-8.48zm-8.47 18.2h-.01a9.84 9.84 0 0 1-5.02-1.37l-.36-.21-3.8.99 1.02-3.7-.23-.38a9.83 9.83 0 0 1-1.51-5.24c.01-5.43 4.43-9.85 9.87-9.85 2.64 0 5.12 1.03 6.98 2.89a9.78 9.78 0 0 1 2.89 6.98c-.01 5.43-4.44 9.89-9.83 9.89zm5.42-7.39c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.3-.76.97-.93 1.16-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.39-1.46-.88-.78-1.48-1.74-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.07-.15-.66-1.59-.91-2.18-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34z"/>
            </svg>
            Hablar con CS Travel
          </a>
          <small class="muted">Equipo logistico disponible para resolver dudas en cada caso.</small>
        </div>
        <div class="partner-strip__meta">
          <span class="muted-block">Ultima actualizacion</span>
          <strong>${formatDate(doctor.lastUpdate, true)}</strong>
        </div>
      </section>
    `;
  },

  async afterRender() {
    // Selector mensual / anual del grafico de generado por periodo.
    const range = document.getElementById('generated-range');
    const chart = document.getElementById('generated-chart');
    range?.addEventListener('change', () => {
      currentGeneratedMode = range.value;
      chart.innerHTML = renderGeneratedChart(cachedDoctorCases, currentGeneratedMode);
    });

    // Buscador de la tabla de casos activos del dashboard.
    const search = document.getElementById('dash-case-search');
    const table = document.getElementById('dash-active-cases');
    if (search && table) {
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        const filtered = cachedActiveCases.filter((c) =>
          [c.caseCode, c.patientName, c.procedure, c.origin, c.destination, c.status]
            .join(' ')
            .toLowerCase()
            .includes(q),
        );
        table.innerHTML = MedicalCaseTable(filtered, { detailBase: '#/doctor/cases' });
      });
    }

    // Copiar codigo de aliado al portapapeles con feedback breve.
    const copyBtn = document.getElementById('copy-code');
    const copyLabel = document.getElementById('copy-code-label');
    copyBtn?.addEventListener('click', async () => {
      const code = copyBtn.dataset.code || '';
      try {
        await navigator.clipboard.writeText(code);
        const original = copyLabel.textContent;
        copyLabel.textContent = 'Copiado';
        copyBtn.classList.add('is-copied');
        copyBtn.disabled = true;
        setTimeout(() => {
          copyLabel.textContent = original;
          copyBtn.classList.remove('is-copied');
          copyBtn.disabled = false;
        }, 1400);
      } catch {
        // Si clipboard falla (http en algunos navegadores), seleccionamos el texto.
        const codeEl = document.getElementById('partner-code');
        if (codeEl) {
          const range = document.createRange();
          range.selectNodeContents(codeEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    });
  },
};
