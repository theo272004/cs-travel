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

import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { doctorService } from '../services/doctorService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { StackedBar } from '../components/Chart.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { navigate } from '../router/router.js';

/** Costo logistico visible para el medico (margen CST oculto adentro). */
const logisticsCost = (item) => (item.baseCost || 0) + (item.csTravelMargin || 0);

const DOC_TYPE_LABEL = { pasaporte: 'Pasaporte', cedula: 'Cedula', id: 'ID', otro: 'Documento' };

const CALC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M14 10h2v8M8 14h2M8 18h2"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const TAG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.3"/></svg>';

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
    const backHash = isAdmin ? '#/admin/medical-cases' : '#/doctor/cases';
    const quoted = logisticsCost(item) > 0;
    const doctorCanEdit = !isAdmin && effectiveMaxMargin(item) > 0;

    const header = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(item.caseCode)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(item.status)}
            <span class="chip">${escapeHtml(doctor.clinicName)}</span>
          </p>
        </div>
        <div class="page-header__actions">
          ${quoted ? `<button type="button" class="btn btn--ghost" id="quote-pdf">Descargar PDF</button>` : ''}
          ${!isAdmin && item.status === 'cotizacion enviada' ? `<button type="button" class="btn btn--primary" id="approve-case">Paciente aprobo ✓</button>` : ''}
          <a href="${backHash}" class="btn btn--ghost">← Volver</a>
        </div>
      </div>
    `;

    // --- Vista ADMIN: desglose logistico + gestion ---
    if (isAdmin) {
      return `
        ${header}
        <div class="detail-grid">
          ${renderPatientPanel(item)}
          <section class="panel">
            <h2 class="panel__title">Cotizacion logistica</h2>
            ${renderLogisticsBreakdown(item)}
            <dl class="detail-list">
              <div class="detail-list__full"><dt>Detalle de cotizacion</dt><dd>${escapeHtml(item.quoteDetails) || '<span class="muted">Pendiente</span>'}</dd></div>
              <div class="detail-list__full"><dt>Notas de CS Travel</dt><dd>${escapeHtml(item.clientNotes) || '<span class="muted">Sin notas visibles</span>'}</dd></div>
              <div class="detail-list__right"><dt>Actualizado</dt><dd id="quote-updated-at">${formatDate(item.updatedAt, true)}</dd></div>
            </dl>
          </section>
        </div>
        ${renderAdminPanel(item)}
      `;
    }

    // --- Vista MEDICO: centro de decision + contexto ---
    const decision = doctorCanEdit
      ? renderDecisionCenter(item)
      : quoted
        ? renderQuoteReadOnly(item)
        : `<section class="panel"><p class="empty-state">CS Travel esta preparando la cotizacion logistica de este caso. Cuando este lista podras ajustar tu margen y descargarla aqui.</p></section>`;

    return `
      ${header}
      ${decision}
      ${renderPatientPanel(item, true)}
    `;
  },

  async afterRender(ctx) {
    const item = await medicalCaseService.getById(ctx.params.id);
    const isAdmin = ctx.user.role === 'admin';

    if (isAdmin) {
      wireAdminForm(ctx);
    } else if (effectiveMaxMargin(item) > 0) {
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
      if (!window.confirm('¿Confirmas que el paciente aprobo esta cotizacion? El caso pasara a "aprobada" y tu ganancia quedara acumulada.')) return;
      try {
        await medicalCaseService.update(ctx.params.id, { status: 'aprobada' });
        await doctorService.recompute(item.doctorId);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        window.alert(`No se pudo aprobar: ${error.message}`);
      }
    });
  },
};

/* ---------------------------------------------------------------------------
 * Datos del paciente (contexto). Compacto cuando es la vista del medico.
 * ------------------------------------------------------------------------- */
function renderPatientPanel(item, compact = false) {
  const yesNo = (v) => (v ? 'Si' : 'No');
  return `
    <section class="panel panel--patient-info${compact ? ' panel--patient-compact' : ''}">
      <div class="panel__header">
        <h2 class="panel__title">Datos del paciente y viaje</h2>
        ${compact ? '<span class="section-tag">Contexto</span>' : ''}
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
        <div class="detail-list__full"><dt>Servicios incluidos</dt><dd><strong>Vuelo:</strong> ${yesNo(item.hasFlight)} · <strong>Hospedaje:</strong> ${yesNo(item.requiresLodging)} · <strong>Traslados:</strong> ${yesNo(item.requiresTransfers)} · <strong>Seguro:</strong> ${yesNo(item.requiresInsurance)} · <strong>Acompanante:</strong> ${yesNo(item.requiresCompanion)}</dd></div>
        <div class="detail-list__full"><dt>Idioma o condicion especial</dt><dd>${escapeHtml(item.languageOrSpecialCondition) || '<span class="muted">No aplica</span>'}</dd></div>
        <div class="detail-list__full"><dt>Observaciones</dt><dd>${escapeHtml(item.observations) || '<span class="muted">Sin observaciones</span>'}</dd></div>
        ${item.status === 'cancelada' && item.lostReason
          ? `<div class="detail-list__full"><dt>Motivo de no cierre</dt><dd class="text-amber">${escapeHtml(item.lostReason)}</dd></div>`
          : ''}
      </dl>
    </section>
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
        <span class="chip">Ajusta tu margen y descarga</span>
      </div>

      <div class="decision-center__grid">
        <div class="decision-center__control">
          <span class="decision-center__label">Tu margen</span>
          <output id="dc-pct" class="decision-center__pct">${marginPct}%</output>
          <input id="calc-slider" type="range" min="0" max="${maxPct}" value="${marginPct}" step="1" aria-label="Tu margen" />
          <div class="decision-center__scale"><span>0%</span><span>tope ${maxPct}%</span></div>
          <div class="decision-center__refs">
            <span class="ref-chip">${LOCK_ICON} Costo CST <strong>${formatCurrency(logCost)}</strong></span>
            <span class="ref-chip">${LOCK_ICON} Mercado <strong>${market > 0 ? formatCurrency(market) : '—'}</strong></span>
          </div>
        </div>

        <div class="decision-center__result">
          <div class="result-row">
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
              <strong id="dc-savings">${market > 0 ? formatCurrency(savings) : '—'}</strong>
              <small id="dc-savings-pct">${market > 0 ? `${savingsPct}% frente al mercado` : 'Sin referencia de mercado'}</small>
            </span>
          </div>
        </div>
      </div>

      <div class="decision-center__foot">
        <div class="decision-center__scenarios">
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

/** Resultado en modo lectura (caso ya decidido o sin margen editable). */
function renderQuoteReadOnly(item) {
  const logCost = logisticsCost(item);
  const margin = item.doctorMargin || 0;
  const finalValue = logCost + margin;
  const market = item.marketReferenceCost || 0;
  const savings = Math.max(0, market - finalValue);

  return `
    <section class="panel decision-center">
      <div class="panel__header">
        <h2 class="panel__title"><span class="decision-center__icon" aria-hidden="true">${CALC_ICON}</span>Tu cotizacion</h2>
        <span class="chip chip--ok">Confirmada</span>
      </div>
      <div class="decision-center__result decision-center__result--full">
        <div class="result-row"><span>Precio al paciente</span><strong>${formatCurrency(finalValue)}</strong></div>
        <div class="result-row"><span>Tu ganancia</span><strong class="text-green">${formatCurrency(margin)}</strong></div>
        ${market > 0
          ? `<div class="result-savings">
              <span class="result-savings__label"><span class="result-savings__icon" aria-hidden="true">${TAG_ICON}</span>Ahorro del paciente</span>
              <span class="result-savings__value"><strong>${formatCurrency(savings)}</strong></span>
            </div>`
          : ''}
      </div>
    </section>
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
    out('dc-savings').textContent = market > 0 ? formatCurrency(savings) : '—';
    out('dc-savings-pct').textContent = market > 0 ? `${savingsPct}% frente al mercado` : 'Sin referencia de mercado';
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
    } finally {
      btn.disabled = false;
    }
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
    item.requiresCompanion && 'Acompanante',
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
  <title>Cotizacion ${escapeHtml(item.caseCode)} - CS Travel</title>
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
    .total strong { font-size: 1.6rem; color: #0f9d6e; }
    .savings { margin-top: 10px; font-size: .92rem; color: #0f9d6e; font-weight: 600; }
    .foot { margin-top: 36px; font-size: .8rem; color: #97a1ad; border-top: 1px solid #e8ecf1; padding-top: 12px; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">CS TRAVEL</div>
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
    <span>Valor total del paquete logistico</span>
    <strong>${formatCurrency(finalValue)}</strong>
  </div>
  ${market > 0 && savings > 0 ? `<p class="savings">Ahorras ${formatCurrency(savings)} frente al precio promedio del mercado.</p>` : ''}

  <div class="foot">
    Cotizacion valida por 15 dias a partir de su emision. Sujeta a disponibilidad de tarifas.
    Gestionada por CS Travel en alianza con ${escapeHtml(doctor.clinicName)} (codigo ${escapeHtml(doctor.sharedCode)}).
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
          { key: 'doctor', label: 'Margen medico', value: item.doctorMargin, color: '#0f9d6e' },
        ],
        formatValue: formatCurrency,
      })}
      <div class="breakdown__total">
        <span class="muted-block">Valor final paciente</span>
        <strong class="breakdown__total-value text-green">${formatCurrency(logisticsCost(item) + (item.doctorMargin || 0))}</strong>
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
      <form id="medical-case-manage-form" class="form form--grid">
        <div class="form__group">
          <label class="form__label">Estado</label>
          <select name="status" class="form__input">${statusOptions}</select>
        </div>
        <div class="form__group">
          <label class="form__label">Costo base</label>
          <input type="number" name="baseCost" class="form__input" value="${item.baseCost}" min="0" />
        </div>
        <div class="form__group">
          <label class="form__label">Margen CS Travel</label>
          <input type="number" name="csTravelMargin" class="form__input" value="${item.csTravelMargin}" min="0" />
        </div>
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
          <p class="muted">Valor final paciente = costo base + margen CS Travel + margen medico.
          El medico ve "costo logistico" (base + margen CST) y nunca el margen CST por separado.</p>
        </div>
        <div class="form__group form__group--full">
          <label class="form__label">Detalle de cotizacion</label>
          <textarea name="quoteDetails" class="form__input" rows="3">${escapeHtml(item.quoteDetails || '')}</textarea>
        </div>
        <div class="form__group form__group--full">
          <label class="form__label">Notas visibles para medico</label>
          <textarea name="clientNotes" class="form__input" rows="3">${escapeHtml(item.clientNotes || '')}</textarea>
        </div>
        <div class="form__group form__group--full">
          <label class="form__label">Observaciones internas</label>
          <textarea name="adminNotes" class="form__input" rows="3">${escapeHtml(item.adminNotes || '')}</textarea>
        </div>
        <div class="form__alert form__group--full" id="medical-case-manage-alert" hidden></div>
        <div class="form__actions form__group--full">
          <button type="submit" class="btn btn--primary">Guardar cambios</button>
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
