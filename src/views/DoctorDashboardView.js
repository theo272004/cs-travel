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
    color: '#0a2540',
  }));
}

function renderGeneratedChart(cases, mode = 'monthly') {
  const data = buildGeneratedData(cases, mode);
  const keepZero = mode === 'monthly';
  return ColumnChart({ data, formatValue: formatCurrency, color: '#0a2540', keepZero });
}

/* ---------------------------------------------------------------------------
 * "Esperando tu decision": casos donde el medico debe actuar.
 * ------------------------------------------------------------------------- */

function renderActionItems(actionable) {
  if (!actionable.length) {
    return `
      <div class="action-empty">
        <span class="action-empty__icon" aria-hidden="true">✓</span>
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
                <a href="#/doctor/cases/${c.id}" class="btn btn--primary btn--sm">Ajustar y enviar</a>
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

      <!-- 1. Banda de ganancias: acumulado + ano + ticket. -->
      <section class="earnings-band">
        <article class="earnings-band__main">
          <span class="earnings-band__label">Ganancias acumuladas</span>
          <span class="earnings-band__value">${formatCurrency(earnedMargin)}</span>
          <span class="earnings-band__hint">${earnedCases.length} caso${earnedCases.length === 1 ? '' : 's'} ganado${earnedCases.length === 1 ? '' : 's'}</span>
        </article>
        <article class="earnings-band__side earnings-band__side--year">
          <span class="muted-block">Generado en ${new Date().getFullYear()}</span>
          <strong>${formatCurrency(generatedThisYear)}</strong>
        </article>
        <article class="earnings-band__side earnings-band__side--ticket">
          <span class="muted-block">Ticket promedio</span>
          <strong>${formatCurrency(avgTicket)}</strong>
          <small class="muted">Margen medio por caso ganado</small>
        </article>
      </section>

      <!-- 2. Accion requerida + grafica de generado por periodo. -->
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
      <section class="metrics-grid">
        ${MetricCard({ label: 'Casos totales', value: String(cases.length) })}
        ${MetricCard({ label: 'Casos activos', value: String(activeCases.length) })}
        ${MetricCard({
          label: 'Conversion de cotizaciones',
          value: conversionPct === null ? '—' : `${conversionPct}%`,
        })}
        ${MetricCard({
          label: 'Ahorro promedio paciente',
          value: avgSavingsPct === null ? '—' : `${avgSavingsPct}%`,
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
      <section class="partner-strip">
        <div class="partner-strip__block">
          <span class="partner-strip__label">Tu codigo de aliado</span>
          <div class="partner-strip__code">
            <strong id="partner-code">${escapeHtml(doctor.sharedCode)}</strong>
            <button type="button" class="btn btn--ghost btn--sm" id="copy-code"
              data-code="${escapeHtml(doctor.sharedCode)}">Copiar</button>
          </div>
          <small class="muted">Usalo para tus propios viajes o compartelo con colegas: tendran tarifas preferenciales.</small>
        </div>
        <div class="partner-strip__block partner-strip__block--cta">
          <span class="partner-strip__label">¿Necesitas apoyo con un caso?</span>
          <a href="${SUPPORT_WHATSAPP}" target="_blank" rel="noopener" class="btn btn--primary">
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
    copyBtn?.addEventListener('click', async () => {
      const code = copyBtn.dataset.code || '';
      try {
        await navigator.clipboard.writeText(code);
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copiado ✓';
        copyBtn.disabled = true;
        setTimeout(() => {
          copyBtn.textContent = original;
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
