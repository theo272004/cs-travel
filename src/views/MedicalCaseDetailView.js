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

/**
 * Tope del margen del medico = SIEMPRE el precio de mercado menos lo que le
 * cobramos (mercado − costo logistico). Asi el medico nunca vende por encima del
 * mercado. Si aun no hay precio de mercado, cae al tope manual heredado (legado).
 */
function effectiveMaxMargin(item) {
  const market = item.marketReferenceCost || 0;
  if (market > 0) return Math.max(0, Math.round(market - logisticsCost(item)));
  return Math.round(item.doctorMarginMax || 0);
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
            ${doctor.clinicName ? `<span class="chip">${escapeHtml(doctor.clinicName)}</span>` : ''}
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
        ${renderAdminNextStep(item)}
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
  // Margen sugerido para el médico: el que fijó el admin, o un default de 15% del
  // costo si no hay. Así SIEMPRE hay una sugerencia mientras quede margen (tope>0).
  const rawSuggested = (item.doctorMarginSuggested || 0) > 0
    ? item.doctorMarginSuggested
    : Math.round(logCost * 0.15);
  const suggestedMargin = Math.min(rawSuggested, maxMargin);
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
          ${suggestedPct > 0 ? `<button type="button" class="btn btn--ghost" id="calc-suggested">Usar sugerido (${suggestedPct}%)</button>` : ''}
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

  // MARCA BLANCA: la cotización va a nombre del MÉDICO/CLÍNICA, no de CS Travel.
  // El paciente la recibe como del consultorio; CS Travel no aparece.
  const brandName = (doctor.clinicName || doctor.name || 'Cotización de viaje').toUpperCase();
  const brandSub = doctor.specialty || 'Cotización de viaje médico';
  const contact = [doctor.name, doctor.phone, doctor.email].filter(Boolean).join(' · ');

  const win = window.open('', '_blank');
  if (!win) {
    window.alert('Tu navegador bloqueo la ventana de la cotizacion. Permite ventanas emergentes para descargarla.');
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Cotizacion ${escapeHtml(item.caseCode)} - ${escapeHtml(brandName)}</title>
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
      <div class="brand">${escapeHtml(brandName)}</div>
      <div class="muted">${escapeHtml(brandSub)}</div>
    </div>
    <div class="muted" style="text-align:right">
      Cotizacion ${escapeHtml(item.caseCode)}<br/>
      ${escapeHtml(formatDate(item.updatedAt || item.createdAt) || '')}
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
    ${contact ? `Emitida por ${escapeHtml(contact)}.` : `Emitida por ${escapeHtml(brandName)}.`}
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
  const tripCost = logisticsCost(item);          // lo que paga el médico (costo del viaje)
  const doctorMargin = item.doctorMargin || 0;   // lo pone el médico al aprobar
  // Mientras el médico no fije su margen (y el caso siga abierto), el valor final
  // está PENDIENTE de su parte: no se completa hasta que él la ponga.
  const pendingDoctor = doctorMargin <= 0 && !['finalizada', 'cancelada'].includes(item.status);
  return `
    <div class="breakdown">
      ${StackedBar({
        segments: [
          { key: 'trip', label: 'Costo del viaje', value: tripCost, color: '#0a2d66' },
          { key: 'doctor', label: 'Margen del médico', value: doctorMargin, color: '#0058c1' },
        ],
        formatValue: formatCurrency,
      })}
      <div class="breakdown__total">
        <span class="muted-block">Valor final paciente</span>
        <strong class="breakdown__total-value ${pendingDoctor ? '' : 'text-green'}">${formatWithUsd(tripCost + doctorMargin)}</strong>
      </div>
      ${pendingDoctor ? `<p class="breakdown__pending-note"><span aria-hidden="true">⏳</span> Pendiente: el <strong>valor final</strong> se completa cuando el <strong>médico fije su margen</strong> al aprobar.</p>` : ''}
    </div>
  `;
}

// Guía de "siguiente paso" para el admin: dice EXACTAMENTE qué hacer ahora según
// el estado del caso, con un botón que baja a la acción. Hace el flujo didáctico.
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
const XC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>';

function renderAdminNextStep(item) {
  const STEPS = {
    'solicitud enviada': {
      tone: 'action', step: 'Paso 1 de 3', icon: CALC_ICON,
      title: 'Arma la cotización del viaje',
      desc: 'Pon el costo del viaje, el precio para el médico y el precio de mercado, y guarda. La cotización se enviará al médico, que definirá su propio margen al aprobar.',
      cta: 'Ir a la cotización', target: 'baseCost',
    },
    'cotizacion enviada': {
      tone: 'wait', icon: CLOCK_ICON,
      title: 'Cotización enviada al médico',
      desc: 'Ahora le toca al médico: debe fijar su margen y aprobar. No tienes acción pendiente; te avisaremos en la campana cuando apruebe.',
      cta: null,
    },
    'aprobada': {
      tone: 'action', step: 'Paso 2 de 3', icon: CHECK_ICON,
      title: 'El médico aprobó · ponlo en gestión',
      desc: 'Marca el caso como “en gestión” para empezar a coordinar el viaje (vuelos, hotel, traslados). El botón lo deja listo; solo guarda.',
      cta: 'Poner en gestión', target: 'status', value: 'en gestion',
    },
    'en gestion': {
      tone: 'action', step: 'Paso 3 de 3', icon: TRUCK_ICON,
      title: 'En gestión · coordina el viaje',
      desc: 'Cuando el viaje esté completado, marca el caso como “finalizada” para cerrarlo y registrar la ganancia.',
      cta: 'Actualizar estado', target: 'status', value: 'finalizada',
    },
    'finalizada': {
      tone: 'done', icon: CHECK_ICON,
      title: 'Caso finalizado',
      desc: 'Este caso está cerrado y la ganancia quedó registrada. No hay más pasos.',
      cta: null,
    },
    'cancelada': {
      tone: 'cancel', icon: XC_ICON,
      title: 'Caso cancelado',
      desc: item.lostReason ? `Motivo registrado: ${escapeHtml(item.lostReason)}` : 'Este caso fue cancelado.',
      cta: null,
    },
  };
  const s = STEPS[item.status] || STEPS['solicitud enviada'];
  return `
    <section class="case-nextstep case-nextstep--${s.tone}" aria-label="Siguiente paso">
      <span class="case-nextstep__icon" aria-hidden="true">${s.icon}</span>
      <div class="case-nextstep__body">
        ${s.step ? `<span class="case-nextstep__step">${s.step}</span>` : ''}
        <strong class="case-nextstep__title">${s.title}</strong>
        <p class="case-nextstep__desc">${s.desc}</p>
      </div>
      ${s.cta ? `<button type="button" class="btn btn--primary case-nextstep__cta"
        data-nextstep-target="${s.target}"${s.value ? ` data-nextstep-value="${s.value}"` : ''}>${escapeHtml(s.cta)} →</button>` : ''}
    </section>
  `;
}

function renderAdminPanel(item) {
  const statusOptions = MEDICAL_CASE_STATUSES
    .map((status) => `<option value="${status}" ${status === item.status ? 'selected' : ''}>${status}</option>`)
    .join('');

  return `
    <section class="panel panel--admin panel--quote-build">
      <div class="panel__header">
        <h2 class="panel__title">Cotización del viaje</h2>
        <span class="muted">El médico define su propio margen al aprobar</span>
      </div>
      <form id="medical-case-manage-form" class="form">
        <p class="quote-build__intro">Pon el <strong>costo del viaje</strong> (lo que le cobras al médico por todo el viaje) y el <strong>precio de mercado</strong>. El médico le sumará su propio margen al aprobar; el sistema calcula solo su tope.</p>

        <div class="form--grid quote-build__prices">
          <div class="form__group">
            <label class="form__label">Costo del viaje <span class="form__hint-inline">(lo que paga el médico · su “costo logístico”)</span></label>
            <input type="number" id="mc-base-cost" name="baseCost" class="form__input" value="${item.baseCost || 0}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Precio de mercado <span class="form__hint-inline">(fija el tope del médico)</span></label>
            <input type="number" id="mc-market" name="marketReferenceCost" class="form__input" value="${item.marketReferenceCost || 0}" min="0" />
          </div>
        </div>

        <!-- Resumen en vivo: tope del médico + aviso de que su parte queda pendiente. -->
        <div class="quote-build__summary" id="mc-quote-summary">
          <div class="quote-build__stat">
            <span>Tope del margen del médico <em>(mercado − costo del viaje)</em></span>
            <strong id="mc-doctor-cap" class="text-blue">${formatCurrency(effectiveMaxMargin(item))}</strong>
          </div>
          <div class="quote-build__stat quote-build__stat--note">
            <span id="mc-cap-note">El médico define su margen (de 0 al tope) al aprobar. Hasta entonces, la cotización queda <strong>pendiente de su parte</strong>.</span>
          </div>
        </div>

        <!-- Opcional: desglose por persona + notas. Colapsado por defecto. -->
        <details class="quote-build__optional"${(item.quoteDetails || item.clientNotes || item.adminNotes) ? ' open' : ''}>
          <summary>Desglose de precios y notas <span class="muted">(opcional)</span></summary>
          <div class="form--grid quote-build__optional-grid">
            <div class="form__group form__group--full">
              <label class="form__label">Desglose de precios / por persona</label>
              <textarea name="quoteDetails" class="form__input" rows="3" placeholder="Ej: 2 pasajeros × $1.200.000 · hotel 3 noches × $300.000…">${escapeHtml(item.quoteDetails || '')}</textarea>
            </div>
            <div class="form__group form__group--full">
              <label class="form__label">Notas visibles para el médico</label>
              <textarea name="clientNotes" class="form__input" rows="2">${escapeHtml(item.clientNotes || '')}</textarea>
            </div>
            <div class="form__group form__group--full">
              <label class="form__label">Observaciones internas <span class="form__hint-inline">(no se muestran al médico)</span></label>
              <textarea name="adminNotes" class="form__input" rows="2">${escapeHtml(item.adminNotes || '')}</textarea>
            </div>
          </div>
        </details>

        <div class="form__group form__group--full quote-build__status">
          <label class="form__label">Estado de la operación</label>
          <select name="status" class="form__input">${statusOptions}</select>
          <small class="form__hint">Al guardar una cotización nueva, avanza solo a “cotización enviada”. Cámbialo a mano solo para finalizar o cancelar.</small>
        </div>
        <div class="form__alert form__group--full" id="medical-case-manage-alert" hidden></div>
        <div class="form__actions form__group--full">
          <button type="submit" class="btn btn--primary">Guardar cotización</button>
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

    // "Costo del viaje" = lo que paga el médico = su costo logístico (una sola
    // cifra; nuestro margen ya está en tu pricing, no se desglosa aquí).
    const baseCost = Number(form.baseCost.value) || 0;
    const marketReferenceCost = Number(form.marketReferenceCost.value) || 0;
    // El margen del MÉDICO no se fija aquí (lo define él al aprobar): se preserva su
    // valor actual. El tope del médico se deriva del precio de mercado.
    const current = await medicalCaseService.getById(ctx.params.id);
    const doctorMargin = Number(current.doctorMargin) || 0;
    const doctorMarginMax = marketReferenceCost > 0 ? Math.max(0, marketReferenceCost - baseCost) : 0;

    const payload = {
      status: form.status.value,
      baseCost,
      csTravelMargin: 0,
      doctorMargin,
      doctorMarginSuggested: 0,
      doctorMarginMax,
      marketReferenceCost,
      finalPatientValue: baseCost + doctorMargin,
      quoteDetails: form.quoteDetails.value.trim(),
      clientNotes: form.clientNotes.value.trim(),
      adminNotes: form.adminNotes.value.trim(),
    };

    // Semi-automático: si llegó como "solicitud enviada" y ya pusiste el costo del
    // viaje, avanza solo a "cotización enviada". El estado manual queda para
    // finalizar/cancelar.
    if (payload.status === 'solicitud enviada' && baseCost > 0) {
      payload.status = 'cotizacion enviada';
    }

    // Al marcar como cancelada pedimos el motivo de no cierre (analisis).
    if (payload.status === 'cancelada') {
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

  // Resumen en vivo: al escribir el costo del viaje y el precio de mercado se
  // recalcula el TOPE del margen del médico (mercado − costo del viaje). Su margen
  // (y por tanto el valor final) los define él al aprobar.
  const num = (el) => Number(el?.value) || 0;
  const fmt = (n) => formatCurrency(Math.round(n));
  const capEl = document.getElementById('mc-doctor-cap');
  const capNote = document.getElementById('mc-cap-note');
  const refreshSummary = () => {
    const base = num(form.baseCost);
    const market = num(form.marketReferenceCost);
    if (market > 0) {
      const cap = Math.max(0, market - base);
      if (capEl) capEl.textContent = fmt(cap);
      if (capNote) capNote.innerHTML = cap > 0
        ? 'El médico define su margen (de 0 al tope) al aprobar. Hasta entonces, la cotización queda <strong>pendiente de su parte</strong>.'
        : 'Ojo: el costo del viaje iguala o supera el precio de mercado; al médico no le queda margen.';
    } else {
      if (capEl) capEl.textContent = '—';
      if (capNote) capNote.textContent = 'Pon el precio de mercado para fijar el tope del margen del médico.';
    }
  };
  ['baseCost', 'marketReferenceCost'].forEach((n) =>
    form.elements[n]?.addEventListener('input', refreshSummary));
  refreshSummary();

  // Botón de la guía "siguiente paso": baja al formulario y prepara la acción
  // (enfoca el costo base para cotizar, o deja el estado listo para solo guardar).
  document.querySelector('.case-nextstep__cta')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const target = btn.dataset.nextstepTarget;
    const value = btn.dataset.nextstepValue;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const field = form.elements[target];
    if (!field) return;
    if (value) {
      // Deja el estado pre-seleccionado; el StyledSelect se sincroniza con change.
      field.value = value;
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Enfoca/resalta el campo tras el scroll (los <select> quedan ocultos: se
    // resalta su control visible en su lugar).
    setTimeout(() => {
      const focusable = field.offsetParent === null ? field.nextElementSibling : field;
      focusable?.focus?.();
      focusable?.classList?.add('field-flash');
      setTimeout(() => focusable?.classList?.remove('field-flash'), 1200);
    }, 420);
  });
}
