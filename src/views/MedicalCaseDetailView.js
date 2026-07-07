/**
 * MedicalCaseDetailView.js
 * =============================================================================
 * PROPOSITO:
 *   Detalle de un caso medico/paciente. Vista COMPARTIDA por admin y medico:
 *     - Medico: "centro de decision" unificado (Tu cotizacion) que fusiona la
 *       calculadora de margen con su resultado en vivo: slider -> precio al
 *       paciente + tu ganancia + ahorro. Los datos del paciente quedan como
 *       contexto secundario abajo. Puede descargar la cotizacion en PDF.
 *     - Admin: desglose logistico + panel de gestion (costos, margenes, estado).
 *
 * MODELO DE MARGEN (acordado):
 *   - El medico ve "costo logistico CST" = costo base + margen CST (el margen
 *     de CS Travel NUNCA se le muestra por separado).
 *   - Tope del margen del medico: el menor entre el tope fijado por CST y el
 *     punto donde el valor final igualaria el precio de mercado.
 * =============================================================================
 */

import { medicalCaseService, MEDICAL_CASE_STATUSES, isInternalCase } from '../services/medicalCaseService.js';
import { doctorService } from '../services/doctorService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { StackedBar } from '../components/Chart.js';
import { renderInventorySearch, wireInventorySearch } from '../components/InventorySearch.js';
import { renderTimeline } from '../components/Timeline.js';
import { formatCurrency, formatWithUsd } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { payHref, payTargetAttrs } from '../utils/payLink.js';
import { navigate } from '../router/router.js';
import { showToast } from '../utils/toast.js';
import { gateNote, shakeError } from '../utils/feedback.js';

/** Costo logistico visible para el medico (margen CST oculto adentro). */
const logisticsCost = (item) => (item.baseCost || 0) + (item.csTravelMargin || 0);

const DOC_TYPE_LABEL = { pasaporte: 'Pasaporte', cedula: 'Cédula', id: 'ID', otro: 'Documento' };

const CALC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M14 10h2v8M8 14h2M8 18h2"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const TAG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.3"/></svg>';
const INFO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
const TRUCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>';
const TREND_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>';

// Iconos de linea para los datos del paciente (vista compacta del medico).
const FACT = {
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  id: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.7 5.5 3.7 9S14.5 18.5 12 21"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  stetho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v7a5 5 0 0 0 10 0V3"/><path d="M9 15v1a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="12" r="2"/></svg>',
  brief: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',
};

/** Texto del documento del viajero: "Pasaporte AB123456" o "". */
function documentText(item) {
  if (!item.documentNumber) return '';
  const type = DOC_TYPE_LABEL[item.documentType] || 'Documento';
  return `${type} ${item.documentNumber}`;
}

/** Tope efectivo del margen del medico: tope CST y tope de mercado. */
function effectiveMaxMargin(item) {
  const byCst = item.doctorMarginMax || 0;
  const market = item.marketReferenceCost || 0;
  const byMarket = market > 0 ? Math.max(0, market - logisticsCost(item)) : Infinity;
  return Math.round(Math.min(byCst, byMarket));
}

function marginToPct(logCost, margin) {
  return logCost > 0 ? Math.round((margin / logCost) * 100) : 0;
}

function pct(value, total, digits = 0) {
  if (total <= 0) return 0;
  const factor = 10 ** digits;
  return Math.round(((value / total) * 100) * factor) / factor;
}

/** Porcentaje con coma decimal (es): 12.9 -> "12,9". */
function pctComma(n) {
  return String(n).replace('.', ',');
}

/** Monto corto para la tira de escenarios: $529k / $1.2M. */
function shortMoney(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}k`;
}

/** Tira de escenarios: pocos porcentajes por ENCIMA del actual, hasta el tope. */
function scenarioStrip(logCost, marginPct, maxPct) {
  const rates = [...new Set([10, 15, maxPct])]
    .filter((r) => r > marginPct && r <= maxPct)
    .sort((a, b) => a - b)
    .slice(0, 3);
  if (!rates.length) return '<span class="muted">estas en el tope</span>';
  return rates
    .map((r) => `<span class="scenario-pill">${r}% → ${shortMoney(Math.round((r / 100) * logCost))}</span>`)
    .join('');
}

export const MedicalCaseDetailView = {
  async render(ctx) {
    const { id } = ctx.params;
    const user = ctx.user;
    const isAdmin = user.role === 'admin';
    const item = await medicalCaseService.getById(id);

    if (!isAdmin && item.doctorId !== user.doctorId) {
      navigate('#/not-authorized');
      return '';
    }

    const doctor = await doctorService.getById(item.doctorId);
    const backHash = isAdmin ? '#/admin/requests' : '#/doctor/cases';
    const quoted = logisticsCost(item) > 0;
    // La calculadora SOLO se puede editar mientras el medico esta decidiendo su
    // margen (estado "cotizacion enviada"). Una vez aprobado/en gestion/finalizado
    // /cancelado, el margen ya esta pactado: se muestra el resumen (read-only).
    const awaitingDecision = item.status === 'cotizacion enviada';
    const doctorCanEdit = !isAdmin && awaitingDecision && effectiveMaxMargin(item) > 0;

    const header = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(item.caseCode)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(item.status)}
            ${isInternalCase(item) ? '<span class="chip tag-internal">Solicitud interna</span>' : ''}
            <span class="chip">${escapeHtml(doctor.clinicName)}</span>
          </p>
        </div>
        <div class="page-header__actions">
          ${!isAdmin && item.status === 'solicitud enviada' ? `<a href="#/doctor/cases/new?edit=${item.id}" class="btn btn--ghost">✎ Editar caso</a>` : ''}
          ${quoted ? `<button type="button" class="btn btn--ghost" id="quote-pdf">Descargar PDF</button>` : ''}
          ${!isAdmin && item.status === 'cotizacion enviada' && (item.doctorMargin || 0) > 0 ? `<button type="button" class="btn btn--primary" id="approve-case">Paciente aprobó ✓</button>` : ''}
          ${!isAdmin && item.status === 'cotizacion enviada' && !((item.doctorMargin || 0) > 0) ? `<span class="chip chip--amber" id="margin-gate-chip" role="button" tabindex="0" title="Ajusta y guarda tu margen antes de aprobar">Fija tu margen para aprobar</span>` : ''}
          <a href="${backHash}" class="btn btn--ghost">← Volver</a>
        </div>
      </div>
    `;

    // --- Vista ADMIN: desglose logistico + gestion ---
    if (isAdmin) {
      return `
        ${header}
        ${renderTimeline(item.status, { lostReason: item.lostReason })}
        <div class="detail-grid">
          ${renderPatientPanel(item)}
          <section class="panel">
            <h2 class="panel__title">Cotización logística</h2>
            ${renderLogisticsBreakdown(item)}
            <dl class="detail-list">
              <div class="detail-list__full"><dt>Detalle de cotizacion</dt><dd>${escapeHtml(item.quoteDetails) || '<span class="muted">Pendiente</span>'}</dd></div>
              <div class="detail-list__full"><dt>Notas de CS Travel</dt><dd>${escapeHtml(item.clientNotes) || '<span class="muted">Sin notas visibles</span>'}</dd></div>
              <div class="detail-list__right"><dt>Actualizado</dt><dd id="quote-updated-at">${formatDate(item.updatedAt, true)}</dd></div>
            </dl>
          </section>
        </div>
        ${renderInventorySearch(item)}
        ${renderAdminPanel(item)}
      `;
    }

    // --- Vista MEDICO: centro de decision + contexto ---
    const decision = doctorCanEdit
      ? renderDecisionCenter(item)
      : quoted
        ? renderQuoteSummary(item)
        : `<section class="panel"><p class="empty-state">CS Travel está preparando la cotización logística de este caso. Cuando esté lista podrás ajustar tu margen y descargarla aquí.</p></section>`;

    return `
      ${header}
      ${renderTimeline(item.status, { lostReason: item.lostReason })}
      <p class="flow-caption">CS Travel gestiona cada etapa por ti; te avisaremos en la campana cuando puedas actuar (cotización lista, listo para pagar…).</p>
      <section class="case-detail-grid">
        ${decision}
        ${renderPatientPanel(item, true)}
      </section>
    `;
  },

  async afterRender(ctx) {
    const item = await medicalCaseService.getById(ctx.params.id);
    const isAdmin = ctx.user.role === 'admin';

    if (isAdmin) {
      wireAdminForm(ctx);
      wireInventorySearch();
    } else if (item.status === 'cotizacion enviada' && effectiveMaxMargin(item) > 0) {
      wireDecisionCenter(ctx, item);
    }

    // Descarga de la cotizacion para el paciente (ventana imprimible -> PDF).
    document.getElementById('quote-pdf')?.addEventListener('click', async () => {
      const fresh = await medicalCaseService.getById(ctx.params.id);
      const doctor = await doctorService.getById(fresh.doctorId);
      openQuotePdf(fresh, doctor);
    });

    // El paciente aprobo la cotizacion: el caso pasa a "aprobada".
    document.getElementById('approve-case')?.addEventListener('click', async () => {
      const approveBtn = document.getElementById('approve-case');
      if (!window.confirm('¿Confirmas que el paciente aprobo esta cotizacion? El caso pasara a "aprobada" y tu ganancia quedara acumulada.')) return;
      try {
        await medicalCaseService.update(ctx.params.id, { status: 'aprobada' });
        // Recalculo best-effort (en produccion lo hace el servidor); no rompe la aprobacion.
        await doctorService.recompute(item.doctorId);
        showToast('Aprobación registrada. CS Travel avanzará con la gestión del viaje.', 'success', { title: '¡Aprobado!' });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        gateNote(approveBtn, 'No pudimos registrar la aprobación en este momento. Vuelve a intentarlo; si persiste, <strong>CS Travel</strong> lo revisará.', approveBtn);
      }
    });

    // Chip "Fija tu margen para aprobar": al tocarlo, lleva a la calculadora y
    // explica que primero debe guardar su margen (gating con voz, no silencioso).
    document.getElementById('margin-gate-chip')?.addEventListener('click', () => {
      document.querySelector('.decision-center')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      shakeError(document.getElementById('calc-slider'));
      showToast('Fija y guarda tu margen abajo. En cuanto lo guardes aparecerá el botón para aprobar.', 'info', { title: 'Falta fijar tu margen' });
    });
  },
};

/* ---------------------------------------------------------------------------
 * Datos del paciente (contexto). Compacto cuando es la vista del medico.
 * ------------------------------------------------------------------------- */
function renderPatientPanel(item, compact = false) {
  const yesNo = (v) => (v ? 'Si' : 'No');

  // Vista ADMIN: lista de detalle completa (sin cambios).
  if (!compact) {
    return `
      <section class="panel panel--patient-info">
        <div class="panel__header">
          <h2 class="panel__title">Datos del paciente y viaje</h2>
        </div>
        <dl class="detail-list">
          <div><dt>Paciente</dt><dd>${escapeHtml(item.patientName)}</dd></div>
          <div><dt>Nombre completo</dt><dd>${escapeHtml(item.fullName) || '<span class="muted">Pendiente</span>'}</dd></div>
          <div><dt>Documento</dt><dd>${escapeHtml(documentText(item)) || '<span class="muted">Pendiente</span>'}</dd></div>
          <div><dt>Nacionalidad</dt><dd>${escapeHtml(item.nationality) || '<span class="muted">Pendiente</span>'}</dd></div>
          <div><dt>Procedimiento</dt><dd>${escapeHtml(item.procedure)}</dd></div>
          <div><dt>Ruta</dt><dd>${escapeHtml(item.origin)} → ${escapeHtml(item.destination)}</dd></div>
          <div><dt>Fecha de ida</dt><dd>${formatDate(item.travelDate)}</dd></div>
          <div><dt>Fecha de regreso</dt><dd>${item.returnDate ? formatDate(item.returnDate) : '<span class="muted">No aplica</span>'}</dd></div>
          <div class="detail-list__full"><dt>Servicios incluidos</dt><dd><strong>Vuelo:</strong> ${yesNo(item.hasFlight)} · <strong>Hospedaje:</strong> ${yesNo(item.requiresLodging)} · <strong>Traslados:</strong> ${yesNo(item.requiresTransfers)} · <strong>Seguro:</strong> ${yesNo(item.requiresInsurance)} · <strong>Acompañante:</strong> ${yesNo(item.requiresCompanion)}</dd></div>
          <div class="detail-list__full"><dt>Idioma o condición especial</dt><dd>${escapeHtml(item.languageOrSpecialCondition) || '<span class="muted">No aplica</span>'}</dd></div>
          <div class="detail-list__full"><dt>Observaciones</dt><dd>${escapeHtml(item.observations) || '<span class="muted">Sin observaciones</span>'}</dd></div>
          ${item.status === 'cancelada' && item.lostReason
            ? `<div class="detail-list__full"><dt>Motivo de no cierre</dt><dd class="text-amber">${escapeHtml(item.lostReason)}</dd></div>`
            : ''}
        </dl>
      </section>
    `;
  }

  // Vista MEDICO: grid compacto con iconos (contexto secundario).
  const dates = formatDate(item.travelDate) + (item.returnDate ? ` → ${formatDate(item.returnDate)}` : '');
  const servicesList = [
    item.hasFlight && 'Vuelo',
    item.requiresLodging && 'Hospedaje',
    item.requiresTransfers && 'Traslados',
    item.requiresInsurance && 'Seguro',
    item.requiresCompanion && 'Acompañante',
  ].filter(Boolean);
  const doc = documentText(item);

  const facts = [
    patientFact(FACT.user, 'Paciente', escapeHtml(item.fullName || item.patientName), false, 'case-fact--primary'),
    patientFact(FACT.stetho, 'Procedimiento', escapeHtml(item.procedure), false, 'case-fact--primary'),
    patientFact(FACT.pin, 'Ruta', `${escapeHtml(item.origin)} → ${escapeHtml(item.destination)}`, false, 'case-fact--primary'),
    patientFact(FACT.calendar, 'Fecha', dates, false, 'case-fact--primary'),
    doc ? patientFact(FACT.id, 'Documento', escapeHtml(doc)) : '',
    item.nationality ? patientFact(FACT.globe, 'Nacionalidad', escapeHtml(item.nationality)) : '',
    item.languageOrSpecialCondition
      ? patientFact(FACT.message, 'Idioma o condición especial', escapeHtml(item.languageOrSpecialCondition), true)
      : '',
    servicesFact(servicesList, item.observations),
    item.status === 'cancelada' && item.lostReason
      ? patientFact(FACT.note, 'Motivo de no cierre', escapeHtml(item.lostReason), true)
      : '',
  ].join('');

  return `
    <section class="panel panel--patient-compact">
      <div class="panel__header">
        <h2 class="panel__title"><span class="title-icon" aria-hidden="true">${FACT.user}</span>Datos del paciente y viaje</h2>
        <span class="section-tag">${INFO_ICON} Contexto, secundario</span>
      </div>
      <div class="case-facts">${facts}</div>
    </section>
  `;
}

/** Servicios y observaciones comparten la misma fila de contexto. */
function servicesFact(list, observations = '') {
  const body = list.length
    ? `<div class="svc-pills">${list.map((s) => `<span class="svc-pill"><span class="svc-pill__check" aria-hidden="true">✓</span>${escapeHtml(s)}</span>`).join('')}</div>`
    : '<span class="case-fact__value">Por definir</span>';
  return `
    <div class="case-fact-row case-fact-row--services">
      <div class="case-fact">
        <span class="case-fact__icon" aria-hidden="true">${FACT.brief}</span>
        <div>
          <span class="case-fact__label">Servicios incluidos</span>
          ${body}
        </div>
      </div>
      <div class="case-fact">
        <span class="case-fact__icon" aria-hidden="true">${FACT.note}</span>
        <div>
          <span class="case-fact__label">Observaciones</span>
          <span class="case-fact__value">${observations ? escapeHtml(observations) : '<span class="muted">Sin observaciones</span>'}</span>
        </div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
 * Centro de decision (medico): calculadora + resultado fusionados.
 * ------------------------------------------------------------------------- */
function renderDecisionCenter(item) {
  const logCost = logisticsCost(item);
  const market = item.marketReferenceCost || 0;
  const maxMargin = effectiveMaxMargin(item);
  const maxPct = marginToPct(logCost, maxMargin);
  const margin = Math.min(item.doctorMargin || 0, maxMargin);
  const marginPct = marginToPct(logCost, margin);
  const finalValue = logCost + margin;
  const savings = Math.max(0, market - finalValue);
  const savingsPct = pct(savings, market, 1);
  const suggestedMargin = Math.min(item.doctorMarginSuggested || 0, maxMargin);
  const suggestedPct = marginToPct(logCost, suggestedMargin);

  return `
    <section class="panel decision-center" data-log-cost="${logCost}" data-max-margin="${maxMargin}" data-market="${market}" data-suggested-pct="${suggestedPct}">
      <div class="panel__header">
        <h2 class="panel__title"><span class="decision-center__icon" aria-hidden="true">${CALC_ICON}</span>Tu cotizacion</h2>
        <span class="chip chip--fused">${INFO_ICON} Calculadora + resultado fusionados</span>
      </div>
      <p class="decision-center__hint">Solo tu margen es editable. Costo CST y mercado estan bloqueados.</p>

      <div class="decision-center__grid">
        <div class="decision-center__control">
          <span class="decision-center__label">Tu margen</span>
          <output id="dc-pct" class="decision-center__pct">${marginPct}%</output>
          <input id="calc-slider" type="range" min="0" max="${maxPct}" value="${marginPct}" step="1" aria-label="Tu margen" />
          <div class="decision-center__scale"><span>0%</span><span>tope ${maxPct}%</span></div>
          <div class="decision-center__refs">
            <span class="ref-chip" role="button" tabindex="0" data-gate-chip="costo">${LOCK_ICON} Costo CST <strong>${formatCurrency(logCost)}</strong></span>
            <span class="ref-chip" role="button" tabindex="0" data-gate-chip="mercado">${LOCK_ICON} Mercado <strong>${market > 0 ? formatCurrency(market) : '—'}</strong></span>
          </div>
        </div>

        <div class="decision-center__result">
          <div class="result-row result-row--sep">
            <span>Precio al paciente</span>
            <strong id="dc-final">${formatCurrency(finalValue)}</strong>
          </div>
          <div class="result-row">
            <span>Tu ganancia</span>
            <strong id="dc-gain" class="text-green">${formatCurrency(margin)}</strong>
          </div>
          <div class="result-savings">
            <span class="result-savings__label"><span class="result-savings__icon" aria-hidden="true">${TAG_ICON}</span>Ahorro del paciente</span>
            <span class="result-savings__value">
              <strong id="dc-savings">${market > 0 ? `${formatCurrency(savings)} · ${pctComma(savingsPct)}%` : '—'}</strong>
              <small id="dc-savings-pct">${market > 0 ? 'Frente al mercado' : 'Sin referencia de mercado'}</small>
            </span>
          </div>
        </div>
      </div>

      <div class="decision-center__foot">
        <div class="decision-center__scenarios">
          <span class="decision-center__scenarios-icon" aria-hidden="true">${TREND_ICON}</span>
          <span class="muted">escenarios:</span>
          <span id="dc-scenarios">${scenarioStrip(logCost, marginPct, maxPct)}</span>
        </div>
        <div class="decision-center__actions">
          <button type="button" class="btn btn--ghost" id="calc-suggested">Usar sugerido (${suggestedPct}%)</button>
          <button type="button" class="btn btn--primary" id="calc-save">Guardar y generar PDF</button>
        </div>
      </div>
      <div class="form__alert" id="calc-alert" hidden></div>
    </section>
  `;
}

/**
 * Resumen "Cotizacion logistica" (read-only). Se muestra cuando el caso ya esta
 * decidido (aprobada / en gestion / finalizada / cancelada): el margen ya quedo
 * pactado, asi que en vez de la calculadora se ve un resumen de lo acordado.
 */
function renderQuoteSummary(item) {
  const logCost = logisticsCost(item);
  const margin = item.doctorMargin || 0;
  const finalValue = logCost + margin;
  const market = item.marketReferenceCost || 0;
  const savings = Math.max(0, market - finalValue);
  const savingsPct = pct(savings, market, 1);
  const logPct = finalValue > 0 ? Math.round((logCost / finalValue) * 100) : 0;
  const marginPct = finalValue > 0 ? Math.max(0, 100 - logPct) : 0;

  return `
    <section class="panel panel--quote-summary">
      <div class="panel__header">
        <h2 class="panel__title"><span class="title-icon title-icon--blue" aria-hidden="true">${TRUCK_ICON}</span>Cotización logística</h2>
        ${StatusBadge(item.status)}
      </div>

      <div class="quote-card">
        <div class="quote-card__top">
          <div>
            <span class="muted-block">Valor final paciente</span>
            <strong>${formatWithUsd(finalValue)}</strong>
          </div>
        </div>
        <div class="quote-live-bar" aria-label="Desglose de cotizacion">
          <span class="quote-live-bar__log" style="width:${logPct}%"></span>
          <span class="quote-live-bar__margin" style="width:${marginPct}%"></span>
        </div>
        <div class="quote-card__rows">
          <div><span class="quote-dot quote-dot--log"></span><span>Costo logístico CST</span><strong>${formatCurrency(logCost)}</strong></div>
          <div><span class="quote-dot quote-dot--margin"></span><span>Tu margen</span><strong>${formatCurrency(margin)}</strong></div>
        </div>
      </div>

      ${(finalValue > 0 && item.status !== 'cancelada') ? `
      <a class="btn btn--primary btn--pay-quote"
         href="${payHref({ reference: 'case:' + item.id, concept: item.caseCode || 'Cotización', amount: finalValue })}"${payTargetAttrs()}>
        Pagar cotización · ${formatCurrency(finalValue)} →
      </a>
      <p class="pay-quote-note">Pago seguro con tarjeta, PSE o transferencia (sin recargo).</p>` : ''}

      ${market > 0 ? `
      <div class="quote-summary__savings">
        <span class="result-savings__label"><span class="result-savings__icon" aria-hidden="true">${TAG_ICON}</span>Ahorro del paciente</span>
        <span class="result-savings__value"><strong>${formatCurrency(savings)} · ${pctComma(savingsPct)}%</strong><small>Frente al mercado</small></span>
      </div>` : ''}

      ${(item.quoteDetails || item.clientNotes) ? `
      <div class="quote-summary__notes">
        <span class="quote-summary__notes-icon" aria-hidden="true">${FACT.note}</span>
        <div>
          ${item.quoteDetails ? `<p>${escapeHtml(item.quoteDetails)}</p>` : ''}
          ${item.clientNotes ? `<p class="muted">Notas de CS Travel: ${escapeHtml(item.clientNotes)}</p>` : ''}
        </div>
      </div>` : ''}

      <p class="quote-summary__updated">Actualizado: ${formatDate(item.updatedAt, true)}</p>
    </section>
  `;
}

/** Una fila de dato en la vista compacta del paciente (icono + label + valor). */
function patientFact(icon, label, value, full = false, extraClass = '') {
  return `
    <div class="case-fact${full ? ' case-fact--full' : ''}${extraClass ? ` ${extraClass}` : ''}">
      <span class="case-fact__icon" aria-hidden="true">${icon}</span>
      <div>
        <span class="case-fact__label">${label}</span>
        <span class="case-fact__value">${value}</span>
      </div>
    </div>
  `;
}

function wireDecisionCenter(ctx, item) {
  const root = document.querySelector('.decision-center');
  const slider = document.getElementById('calc-slider');
  if (!root || !slider) return;

  const logCost = Number(root.dataset.logCost) || 0;
  const market = Number(root.dataset.market) || 0;
  const maxMargin = Number(root.dataset.maxMargin) || 0;
  const maxPct = marginToPct(logCost, maxMargin);
  const suggestedPct = Number(root.dataset.suggestedPct) || 0;

  const out = (id) => document.getElementById(id);
  const marginFromSlider = () => Math.min(maxMargin, Math.round(logCost * ((Number(slider.value) || 0) / 100)));

  const recalc = () => {
    const margin = marginFromSlider();
    const finalValue = logCost + margin;
    const pctValue = marginToPct(logCost, margin);
    const savings = Math.max(0, market - finalValue);
    const savingsPct = pct(savings, market, 1);

    out('dc-pct').textContent = `${pctValue}%`;
    out('dc-final').textContent = formatCurrency(finalValue);
    out('dc-gain').textContent = formatCurrency(margin);
    out('dc-savings').textContent = market > 0 ? `${formatCurrency(savings)} · ${pctComma(savingsPct)}%` : '—';
    out('dc-savings-pct').textContent = market > 0 ? 'Frente al mercado' : 'Sin referencia de mercado';
    out('dc-scenarios').innerHTML = scenarioStrip(logCost, pctValue, maxPct);
  };

  slider.addEventListener('input', recalc);

  out('calc-suggested')?.addEventListener('click', () => {
    slider.value = String(suggestedPct);
    recalc();
  });

  out('calc-save').addEventListener('click', async () => {
    const alert = out('calc-alert');
    const btn = out('calc-save');
    alert.hidden = true;
    btn.disabled = true;
    const doctorMargin = marginFromSlider();
    const finalPatientValue = logCost + doctorMargin;
    try {
      await medicalCaseService.update(ctx.params.id, { doctorMargin, finalPatientValue });
      await doctorService.recompute(item.doctorId);
      const fresh = await medicalCaseService.getById(ctx.params.id);
      const doctor = await doctorService.getById(fresh.doctorId);
      openQuotePdf(fresh, doctor);
      alert.textContent = 'Margen guardado. Generando tu cotizacion en PDF...';
      alert.className = 'form__alert form__alert--success';
      alert.hidden = false;
    } catch (error) {
      alert.textContent = `Error al guardar: ${error.message}`;
      alert.className = 'form__alert';
      alert.hidden = false;
      shakeError(btn);
    } finally {
      btn.disabled = false;
    }
  });

  // Voz humana al gating "silencioso": los chips bloqueados (Costo CST / Mercado)
  // explican, al tocarlos, que esos valores los define CS Travel.
  root.querySelectorAll('[data-gate-chip]').forEach((chip) => {
    chip.addEventListener('click', () => {
      gateNote(chip, 'Estos valores los define <strong>CS Travel</strong>. Tú solo ajustas tu margen; el resto lo calculamos por ti.', chip);
    });
  });
}

/* ---------------------------------------------------------------------------
 * Cotizacion para el paciente (ventana imprimible -> guardar como PDF).
 * SOLO datos de cara al paciente: nunca margenes internos.
 * ------------------------------------------------------------------------- */
function openQuotePdf(item, doctor) {
  const finalValue = logisticsCost(item) + (item.doctorMargin || 0);
  const market = item.marketReferenceCost || 0;
  const savings = market - finalValue;
  const services = [
    item.hasFlight && 'Vuelos',
    item.requiresLodging && 'Hospedaje',
    item.requiresTransfers && 'Traslados',
    item.requiresInsurance && 'Seguro de viaje',
    item.requiresCompanion && 'Acompañante',
  ].filter(Boolean);

  const win = window.open('', '_blank');
  if (!win) {
    window.alert('Tu navegador bloqueo la ventana de la cotizacion. Permite ventanas emergentes para descargarla.');
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Cotizacion ${escapeHtml(item.caseCode)} - CS Travel Group</title>
  <style>
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a2330; margin: 40px; }
    .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0a2540; padding-bottom: 16px; }
    .brand { font-size: 1.6rem; font-weight: 800; color: #0a2540; }
    .muted { color: #6b7787; font-size: .9rem; }
    h2 { color: #0a2540; margin-top: 28px; font-size: 1.1rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    td { padding: 8px 0; border-bottom: 1px solid #e8ecf1; font-size: .95rem; }
    td:first-child { color: #6b7787; width: 40%; }
    .total { margin-top: 24px; padding: 18px; background: #f2f5f8; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
    .total strong { font-size: 1.6rem; color: #0058c1; }
    .savings { margin-top: 10px; font-size: .92rem; color: #0058c1; font-weight: 600; }
    .foot { margin-top: 36px; font-size: .8rem; color: #97a1ad; border-top: 1px solid #e8ecf1; padding-top: 12px; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">CS TRAVEL GROUP</div>
      <div class="muted">Logistica de viaje para pacientes</div>
    </div>
    <div class="muted" style="text-align:right">
      Cotizacion ${escapeHtml(item.caseCode)}<br/>
      En alianza con ${escapeHtml(doctor.clinicName)}
    </div>
  </div>

  <h2>Detalle del viaje</h2>
  <table>
    <tr><td>Paciente</td><td>${escapeHtml(item.fullName || item.patientName)}</td></tr>
    ${item.documentNumber ? `<tr><td>Documento</td><td>${escapeHtml(documentText(item))}</td></tr>` : ''}
    ${item.nationality ? `<tr><td>Nacionalidad</td><td>${escapeHtml(item.nationality)}</td></tr>` : ''}
    <tr><td>Procedimiento</td><td>${escapeHtml(item.procedure)}</td></tr>
    <tr><td>Ruta</td><td>${escapeHtml(item.origin)} → ${escapeHtml(item.destination)}</td></tr>
    <tr><td>Fecha de ida</td><td>${formatDate(item.travelDate)}</td></tr>
    ${item.returnDate ? `<tr><td>Fecha de regreso</td><td>${formatDate(item.returnDate)}</td></tr>` : ''}
    <tr><td>Servicios incluidos</td><td>${services.length ? services.map(escapeHtml).join(' · ') : 'Por definir'}</td></tr>
    ${item.quoteDetails ? `<tr><td>Detalle</td><td>${escapeHtml(item.quoteDetails)}</td></tr>` : ''}
  </table>

  <div class="total">
    <span>Valor total del paquete logístico</span>
    <strong>${formatCurrency(finalValue)}</strong>
  </div>
  ${market > 0 && savings > 0 ? `<p class="savings">Ahorras ${formatCurrency(savings)} frente al precio promedio del mercado.</p>` : ''}

  <div class="foot">
    Cotizacion valida por 15 dias a partir de su emision. Sujeta a disponibilidad de tarifas.
    Gestionada por CS Travel Group en alianza con ${escapeHtml(doctor.clinicName)} (codigo ${escapeHtml(doctor.sharedCode)}).
  </div>
  <script>window.print();</scr` + `ipt>
</body>
</html>`);
  win.document.close();
}

/* ---------------------------------------------------------------------------
 * Panel de gestion del admin (desglose + formulario).
 * ------------------------------------------------------------------------- */
function renderLogisticsBreakdown(item) {
  return `
    <div class="breakdown">
      ${StackedBar({
        segments: [
          { key: 'base', label: 'Costo base', value: item.baseCost, color: '#6b7787' },
          { key: 'cst', label: 'Margen CS Travel', value: item.csTravelMargin, color: '#c77700' },
          { key: 'doctor', label: 'Margen medico', value: item.doctorMargin, color: '#0058c1' },
        ],
        formatValue: formatCurrency,
      })}
      <div class="breakdown__total">
        <span class="muted-block">Valor final paciente</span>
        <strong class="breakdown__total-value text-green">${formatWithUsd(logisticsCost(item) + (item.doctorMargin || 0))}</strong>
      </div>
    </div>
  `;
}

function renderAdminPanel(item) {
  const statusOptions = MEDICAL_CASE_STATUSES
    .map((status) => `<option value="${status}" ${status === item.status ? 'selected' : ''}>${status}</option>`)
    .join('');

  return `
    <section class="panel panel--admin">
      <h2 class="panel__title">Gestion CS Travel</h2>
      <form id="medical-case-manage-form" class="form">

        <!-- Bloque 1: lo que el MÉDICO ve / usa en su cotización. -->
        <div class="manage-block manage-block--client">
          <div class="manage-block__head">
            <span class="manage-block__badge manage-block__badge--client">Visible para el médico</span>
            <span class="manage-block__hint">Márgenes, detalle y notas que llegan al médico en su cotización.</span>
          </div>
          <div class="form--grid">
            <div class="form__group">
              <label class="form__label">Precio promedio mercado</label>
              <input type="number" name="marketReferenceCost" class="form__input" value="${item.marketReferenceCost || 0}" min="0" />
            </div>
            <div class="form__group">
              <label class="form__label">Margen medico (actual)</label>
              <input type="number" name="doctorMargin" class="form__input" value="${item.doctorMargin}" min="0" />
            </div>
            <div class="form__group">
              <label class="form__label">Margen sugerido al medico</label>
              <input type="number" name="doctorMarginSuggested" class="form__input" value="${item.doctorMarginSuggested || 0}" min="0" />
            </div>
            <div class="form__group">
              <label class="form__label">Tope de margen del medico</label>
              <input type="number" name="doctorMarginMax" class="form__input" value="${item.doctorMarginMax || 0}" min="0" />
            </div>
            <div class="form__group form__group--full">
              <label class="form__label">Detalle de cotizacion</label>
              <textarea name="quoteDetails" class="form__input" rows="3">${escapeHtml(item.quoteDetails || '')}</textarea>
            </div>
            <div class="form__group form__group--full">
              <label class="form__label">Notas visibles para medico</label>
              <textarea name="clientNotes" class="form__input" rows="3">${escapeHtml(item.clientNotes || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Bloque 2: costos internos que el médico NO ve (ve solo "costo logístico"). -->
        <div class="manage-block manage-block--internal">
          <div class="manage-block__head">
            <span class="manage-block__badge manage-block__badge--internal">Uso interno · no se muestra</span>
            <span class="manage-block__hint">El médico ve "costo logístico" (base + margen CST), nunca el margen CST aparte.</span>
          </div>
          <div class="form--grid">
            <div class="form__group">
              <label class="form__label">Costo base</label>
              <input type="number" id="mc-base-cost" name="baseCost" class="form__input" value="${item.baseCost}" min="0" />
            </div>
            <div class="form__group">
              <label class="form__label">Margen CS Travel</label>
              <input type="number" name="csTravelMargin" class="form__input" value="${item.csTravelMargin}" min="0" />
            </div>
            <div class="form__group form__group--full">
              <label class="form__label">Observaciones internas</label>
              <textarea name="adminNotes" class="form__input" rows="3">${escapeHtml(item.adminNotes || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="form__group form__group--full">
          <label class="form__label">Estado de la operación</label>
          <select name="status" class="form__input">${statusOptions}</select>
          <small class="form__hint">Al guardar una cotización en "solicitud enviada", avanza solo a "cotización enviada". Cámbialo a mano solo para finalizar o cancelar.</small>
        </div>
        <div class="form__alert form__group--full" id="medical-case-manage-alert" hidden></div>
        <div class="form__actions form__group--full">
          <button type="submit" class="btn btn--primary">Guardar cambios</button>
          <a href="#/admin/quotes?from=case:${item.id}" class="btn btn--ghost">Generar itinerario PDF →</a>
        </div>
      </form>
    </section>
  `;
}

function wireAdminForm(ctx) {
  const form = document.getElementById('medical-case-manage-form');
  const alert = document.getElementById('medical-case-manage-alert');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;

    const baseCost = Number(form.baseCost.value) || 0;
    const csTravelMargin = Number(form.csTravelMargin.value) || 0;
    const doctorMargin = Number(form.doctorMargin.value) || 0;

    const payload = {
      status: form.status.value,
      baseCost,
      csTravelMargin,
      doctorMargin,
      doctorMarginSuggested: Number(form.doctorMarginSuggested.value) || 0,
      doctorMarginMax: Number(form.doctorMarginMax.value) || 0,
      marketReferenceCost: Number(form.marketReferenceCost.value) || 0,
      finalPatientValue: baseCost + csTravelMargin + doctorMargin,
      quoteDetails: form.quoteDetails.value.trim(),
      clientNotes: form.clientNotes.value.trim(),
      adminNotes: form.adminNotes.value.trim(),
    };

    // Semi-automático: si llegó como "solicitud enviada" y ya le pusiste costos,
    // avanza solo a "cotización enviada" (estás cotizando). El estado manual queda
    // para finalizar/cancelar; no hay que elegirlo a mano para cotizar.
    if (payload.status === 'solicitud enviada' && baseCost > 0) {
      payload.status = 'cotizacion enviada';
    }

    // Al marcar como cancelada pedimos el motivo de no cierre (analisis).
    if (payload.status === 'cancelada') {
      const current = await medicalCaseService.getById(ctx.params.id);
      const input = window.prompt(
        'Motivo por el que NO se cerro este caso (para analisis):',
        current.lostReason || ''
      );
      if (input !== null) payload.lostReason = input.trim();
    }

    try {
      await medicalCaseService.update(ctx.params.id, payload);
      const fresh = await medicalCaseService.getById(ctx.params.id);
      await doctorService.recompute(fresh.doctorId);
      alert.textContent = 'Caso actualizado correctamente.';
      alert.className = 'form__alert form__alert--success';
      alert.hidden = false;
      setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 600);
    } catch (error) {
      alert.textContent = `Error al guardar: ${error.message}`;
      alert.className = 'form__alert';
      alert.hidden = false;
    }
  });
}
