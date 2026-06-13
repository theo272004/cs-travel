/**
 * MedicalCaseDetailView.js
 * =============================================================================
 * PROPOSITO:
 *   Detalle de un caso medico/paciente. Vista COMPARTIDA por admin y medico:
 *     - Medico: ve los datos del caso y, cuando CS Travel ya cotizo, usa la
 *       CALCULADORA DE MARGEN (EN VIVO): costo logistico CST (no editable)
 *       + su margen (slider) = valor final al paciente. Ve al instante su
 *       ganancia y el ahorro del paciente vs. el mercado. Puede descargar la
 *       cotizacion para el paciente (PDF) y marcarla como aprobada.
 *     - Admin: carga costo base, margen CST, sugerido/tope del medico, precio
 *       de mercado, estado y notas.
 *
 * MODELO DE MARGEN (acordado):
 *   - El medico ve "costo logistico CST" = costo base + margen CST (el margen
 *     de CS Travel NUNCA se le muestra por separado).
 *   - Tope del margen del medico: el menor entre el tope fijado por CST y el
 *     punto donde el valor final igualaria el precio de mercado (si el
 *     paciente no ahorra nada, la propuesta pierde sentido).
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
const SCENARIO_RATES = [5, 8, 10, 12, 15, 20];

/** Tope efectivo del margen del medico: tope CST y tope de mercado. */
function effectiveMaxMargin(item) {
  const byCst = item.doctorMarginMax || 0;
  const market = item.marketReferenceCost || 0;
  const byMarket = market > 0 ? Math.max(0, market - logisticsCost(item)) : Infinity;
  return Math.round(Math.min(byCst, byMarket));
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
    const yesNo = (value) => (value ? 'Si' : 'No');

    const doctorCanEdit = !isAdmin && effectiveMaxMargin(item) > 0;
    const quoted = logisticsCost(item) > 0;
    const finalValue = logisticsCost(item) + (item.doctorMargin || 0);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(item.caseCode)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(item.status)}
            <span class="chip">${escapeHtml(doctor.clinicName)}</span>
          </p>
        </div>
        <div class="page-header__actions">
          ${quoted ? `<button type="button" class="btn btn--ghost" id="quote-pdf">Descargar cotizacion (PDF)</button>` : ''}
          ${!isAdmin && item.status === 'cotizacion enviada' ? `<button type="button" class="btn btn--primary" id="approve-case">Paciente aprobo ✓</button>` : ''}
          <a href="${backHash}" class="btn btn--ghost">← Volver</a>
        </div>
      </div>

      <div class="detail-grid">
        <section class="panel">
          <h2 class="panel__title">Datos del paciente y viaje</h2>
          <dl class="detail-list">
            <div><dt>Paciente</dt><dd>${escapeHtml(item.patientName)}</dd></div>
            <div><dt>Procedimiento</dt><dd>${escapeHtml(item.procedure)}</dd></div>
            <div><dt>Ruta</dt><dd>${escapeHtml(item.origin)} → ${escapeHtml(item.destination)}</dd></div>
            <div><dt>Fecha estimada</dt><dd>${formatDate(item.travelDate)}</dd></div>
            <div><dt>Vuelo</dt><dd>${yesNo(item.hasFlight)}</dd></div>
            <div><dt>Hospedaje</dt><dd>${yesNo(item.requiresLodging)}</dd></div>
            <div><dt>Traslados</dt><dd>${yesNo(item.requiresTransfers)}</dd></div>
            <div><dt>Seguro</dt><dd>${yesNo(item.requiresInsurance)}</dd></div>
            <div><dt>Acompanante</dt><dd>${yesNo(item.requiresCompanion)}</dd></div>
            <div class="detail-list__full"><dt>Idioma o condicion especial</dt><dd>${escapeHtml(item.languageOrSpecialCondition) || '<span class="muted">No aplica</span>'}</dd></div>
            <div class="detail-list__full"><dt>Observaciones</dt><dd>${escapeHtml(item.observations) || '<span class="muted">Sin observaciones</span>'}</dd></div>
          </dl>
        </section>

        <section class="panel">
          <h2 class="panel__title">Cotizacion logistica</h2>
          ${renderLogisticsQuote(item, isAdmin)}
          <dl class="detail-list">
            <div class="detail-list__full"><dt>Detalle de cotizacion</dt><dd>${escapeHtml(item.quoteDetails) || '<span class="muted">Pendiente</span>'}</dd></div>
            <div class="detail-list__full"><dt>Notas de CS Travel</dt><dd>${escapeHtml(item.clientNotes) || '<span class="muted">Sin notas visibles</span>'}</dd></div>
            <div><dt>Actualizado</dt><dd id="quote-updated-at">${formatDate(item.updatedAt, true)}</dd></div>
          </dl>
        </section>
      </div>

      ${doctorCanEdit ? renderMarginCalculator(item) : ''}
      ${!isAdmin && !quoted ? `
      <section class="panel">
        <p class="empty-state">CS Travel esta preparando la cotizacion logistica de este caso.
        Cuando este lista podras ajustar tu margen aqui.</p>
      </section>` : ''}
      ${isAdmin ? renderAdminPanel(item) : ''}
    `;
  },

  async afterRender(ctx) {
    const item = await medicalCaseService.getById(ctx.params.id);
    const isAdmin = ctx.user.role === 'admin';

    if (isAdmin) {
      wireAdminForm(ctx);
    } else if (effectiveMaxMargin(item) > 0) {
      wireMarginCalculator(ctx, item);
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
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        window.alert(`No se pudo aprobar: ${error.message}`);
      }
    });
  },
};

function renderLogisticsQuote(item, isAdmin) {
  if (isAdmin) {
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
          <strong class="breakdown__total-value text-green" id="quote-final-value">${formatCurrency(logisticsCost(item) + (item.doctorMargin || 0))}</strong>
        </div>
      </div>
    `;
  }

  const logCost = logisticsCost(item);
  const margin = item.doctorMargin || 0;
  const finalValue = logCost + margin;
  const logPct = finalValue > 0 ? Math.round((logCost / finalValue) * 100) : 0;
  const marginPct = finalValue > 0 ? 100 - logPct : 0;

  return `
    <div class="quote-card" id="quote-card" data-log-cost="${logCost}">
      <div class="quote-card__top">
        <div>
          <span class="muted-block">Valor final paciente</span>
          <strong id="quote-final-value">${formatCurrency(finalValue)}</strong>
        </div>
        <span class="quote-card__badge">Cotizacion activa</span>
      </div>

      <div class="quote-live-bar" aria-label="Desglose de cotizacion">
        <span class="quote-live-bar__log" id="quote-log-bar" style="width:${logPct}%"></span>
        <span class="quote-live-bar__margin" id="quote-margin-bar" style="width:${marginPct}%"></span>
      </div>

      <div class="quote-card__rows">
        <div>
          <span class="quote-dot quote-dot--log"></span>
          <span>Costo logistico CST</span>
          <strong>${formatCurrency(logCost)}</strong>
        </div>
        <div>
          <span class="quote-dot quote-dot--margin"></span>
          <span>Tu margen</span>
          <strong id="quote-doctor-margin">${formatCurrency(margin)}</strong>
        </div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
 * Calculadora de margen (EN VIVO) — vista del medico.
 * ------------------------------------------------------------------------- */

function renderMarginCalculator(item) {
  const logCost = logisticsCost(item);
  const market = item.marketReferenceCost || 0;
  const maxMargin = effectiveMaxMargin(item);
  const maxPct = logCost > 0 ? Math.round((maxMargin / logCost) * 100) : 0;
  const margin = Math.min(item.doctorMargin || 0, maxMargin);
  const finalValue = logCost + margin;
  const marginPct = logCost > 0 ? Math.round((margin / logCost) * 100) : 0;
  const savings = market - finalValue;
  const savingsPct = market > 0 ? Math.round((savings / market) * 1000) / 10 : 0;

  // El calculador se renderiza como bloques FLOTANTES sin panel envolvente:
  // cada card se posa directamente sobre el fondo del detalle.
  return `
    <div class="margin-calc">
      <header class="margin-calc__heading">
        <div>
          <h2 class="margin-calc__title">Calculadora de margen <span class="margin-calc__live">EN VIVO</span></h2>
          <p class="muted">Ajusta tu margen y ve el impacto al instante. Tu cotizacion logistica se actualiza al guardar.</p>
        </div>
        <span class="chip chip--alert" id="calc-range-chip">Dentro del rango</span>
      </header>

      <div class="calc-strip calc-strip--floating">
        <div>
          <span class="muted-block">Costo logistico CST</span>
          <strong>${formatCurrency(logCost)}</strong>
        </div>
        <div>
          <span class="muted-block">Precio promedio mercado</span>
          <strong>${market > 0 ? formatCurrency(market) : '—'}</strong>
        </div>
        <div>
          <span class="muted-block">Ahorro para el paciente</span>
          <strong id="calc-savings" class="text-green">${market > 0 ? `${formatCurrency(savings)} (${savingsPct}%)` : '—'}</strong>
        </div>
      </div>

      <div class="calc-equation calc-equation--floating">
        <div class="calc-card">
          <span class="calc-card__label">Costo logistico CST</span>
          <strong>${formatCurrency(logCost)}</strong>
          <small>🔒 No editable</small>
        </div>
        <span class="calc-op">+</span>
        <div class="calc-card calc-card--editable">
          <span class="calc-card__label">Tu margen</span>
          <strong id="calc-margin" class="text-green">${formatCurrency(margin)}</strong>
          <small id="calc-margin-pct">(${marginPct}%) · ✏ Editable</small>
        </div>
        <span class="calc-op">=</span>
        <div class="calc-card calc-card--total">
          <span class="calc-card__label">Valor final al paciente</span>
          <strong id="calc-final">${formatCurrency(finalValue)}</strong>
          <small>Lo que paga tu paciente</small>
        </div>
      </div>

      <div class="margin-editor margin-editor--floating">
        <input type="range" id="calc-slider" class="margin-editor__slider"
          min="0" max="${maxMargin}" step="10000" value="${margin}" />
        <div class="margin-editor__scale">
          <span>0%</span>
          <button type="button" class="link" id="calc-suggested">Usar sugerido (${formatCurrency(item.doctorMarginSuggested || 0)})</button>
          <span>${maxPct}%</span>
        </div>
        <p class="muted" style="font-size:.8rem">Rango autorizado: 0% – ${maxPct}% sobre el costo logistico.
        ${market > 0 ? 'El tope garantiza que tu paciente siempre pague menos que en el mercado.' : ''}</p>
      </div>

      <div class="calc-results calc-results--floating">
        <div class="calc-result calc-result--gain">
          <span class="muted-block">Tu ganancia</span>
          <strong id="calc-gain" class="text-green">${formatCurrency(margin)}</strong>
          <small id="calc-gain-pct">${marginPct}% sobre el costo logistico CST</small>
        </div>
        <div class="calc-result">
          <span class="muted-block">Ahorro del paciente vs. mercado</span>
          <strong id="calc-result-savings">${market > 0 ? `${formatCurrency(savings)} (${savingsPct}%)` : 'Sin referencia de mercado'}</strong>
          <small>El paciente paga menos y tu ganas mas</small>
        </div>
      </div>

      <div class="form__alert" id="calc-alert" hidden></div>
      <div class="margin-calc__actions">
        <button type="button" class="btn btn--primary" id="calc-save">Guardar mi margen</button>
      </div>
    </div>

    ${renderScenarioPanel(item, { margin, marginPct, logCost })}
  `;
}

/**
 * Panel separado: comparador de escenarios.
 * Inspirado en el mockup "¿Cuanto habrias ganado con otro margen?".
 */
function renderScenarioPanel(item, { margin, marginPct, logCost }) {
  const maxMargin = effectiveMaxMargin(item);
  const maxPct = logCost > 0 ? Math.round((maxMargin / logCost) * 100) : 0;
  const market = item.marketReferenceCost || 0;
  const scenarioRates = [...new Set([...SCENARIO_RATES, marginPct])]
    .filter((rate) => rate >= 0 && (maxPct === 0 || rate <= maxPct))
    .sort((a, b) => a - b);
  const scenarioMax = Math.max(
    ...scenarioRates.map((rate) => Math.round((rate / 100) * logCost)),
    margin,
    1,
  );

  return `
    <section class="panel scenario-panel">
      <div class="panel__header">
        <div>
          <h2 class="panel__title">¿Cuanto ganarias con otro margen?</h2>
          <p class="muted" style="font-size:.84rem">Compara distintos porcentajes sobre el costo logistico CST de este caso.</p>
        </div>
      </div>

      <div class="scenario-summary">
        <div>
          <span class="muted-block">Margen actual en este caso</span>
          <strong>${marginPct}%</strong>
        </div>
        <div>
          <span class="muted-block">Ganancia con ${marginPct}%</span>
          <strong class="text-green">${formatCurrency(margin)}</strong>
        </div>
        ${market > 0
          ? `<div>
              <span class="muted-block">Precio promedio mercado</span>
              <strong>${formatCurrency(market)}</strong>
            </div>`
          : ''}
      </div>

      <div class="scenario-list">
        <div class="scenario-list__head">
          <span>Si usaras este margen...</span>
          <span>Ganancia estimada</span>
        </div>
        <div class="simulator__rows">
          ${scenarioRates
            .map((rate) => {
              const estimate = Math.round((rate / 100) * logCost);
              const isCurrent = Math.abs(rate - marginPct) < 1;
              const patientValue = logCost + estimate;
              const tip = `Con ${rate}% ganarias ${formatCurrency(estimate)} y el paciente pagaria ${formatCurrency(patientValue)}`;
              return `
                <div class="simulator__row ${isCurrent ? 'is-current' : ''}" data-tip="${escapeHtml(tip)}">
                  <span class="simulator__rate">${rate}%${isCurrent ? ' actual' : ''}</span>
                  <div class="simulator__track">
                    <div class="simulator__fill" style="width:${Math.round((estimate / scenarioMax) * 100)}%"></div>
                  </div>
                  <span class="simulator__value">${formatCurrency(estimate)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    </section>
  `;
}

function wireMarginCalculator(ctx, item) {
  const slider = document.getElementById('calc-slider');
  if (!slider) return;

  const logCost = logisticsCost(item);
  const market = item.marketReferenceCost || 0;
  const maxMargin = effectiveMaxMargin(item);
  const suggested = Math.min(item.doctorMarginSuggested || 0, maxMargin);
  const fmtPct = (margin) => (logCost > 0 ? Math.round((margin / logCost) * 100) : 0);

  const out = (id) => document.getElementById(id);

  const recalc = () => {
    const margin = Number(slider.value) || 0;
    const finalValue = logCost + margin;
    const pct = fmtPct(margin);
    const savings = market - finalValue;
    const savingsPct = market > 0 ? Math.round((savings / market) * 1000) / 10 : 0;
    const savingsText = market > 0 ? `${formatCurrency(savings)} (${savingsPct}%)` : '—';

    out('calc-margin').textContent = formatCurrency(margin);
    out('calc-margin-pct').textContent = `(${pct}%) · ✏ Editable`;
    out('calc-final').textContent = formatCurrency(finalValue);
    out('calc-gain').textContent = formatCurrency(margin);
    out('calc-gain-pct').textContent = `${pct}% sobre el costo logistico CST`;
    out('calc-savings').textContent = savingsText;
    out('calc-result-savings').textContent = market > 0 ? savingsText : 'Sin referencia de mercado';
    updateQuotePreview({ margin, finalValue, logCost });

    const chip = out('calc-range-chip');
    const atCap = margin >= maxMargin && maxMargin > 0;
    chip.textContent = atCap ? 'En el tope del rango' : 'Dentro del rango';
  };

  slider.addEventListener('input', recalc);

  document.getElementById('calc-suggested')?.addEventListener('click', () => {
    slider.value = String(suggested);
    recalc();
  });

  document.getElementById('calc-save').addEventListener('click', async () => {
    const alert = out('calc-alert');
    alert.hidden = true;
    const doctorMargin = Number(slider.value) || 0;
    const finalPatientValue = logCost + doctorMargin;
    try {
      await medicalCaseService.update(ctx.params.id, { doctorMargin, finalPatientValue });
      updateQuotePreview({ margin: doctorMargin, finalValue: finalPatientValue, logCost });
      out('quote-updated-at')?.replaceChildren(document.createTextNode('Actualizado ahora'));
      alert.textContent = 'Tu margen se guardo correctamente.';
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

function updateQuotePreview({ margin, finalValue, logCost }) {
  const finalNode = document.getElementById('quote-final-value');
  const marginNode = document.getElementById('quote-doctor-margin');
  const logBar = document.getElementById('quote-log-bar');
  const marginBar = document.getElementById('quote-margin-bar');

  if (finalNode) finalNode.textContent = formatCurrency(finalValue);
  if (marginNode) marginNode.textContent = formatCurrency(margin);

  if (logBar && marginBar) {
    const logPct = finalValue > 0 ? Math.round((logCost / finalValue) * 100) : 0;
    logBar.style.width = `${logPct}%`;
    marginBar.style.width = `${Math.max(0, 100 - logPct)}%`;
  }
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
    <tr><td>Paciente</td><td>${escapeHtml(item.patientName)}</td></tr>
    <tr><td>Procedimiento</td><td>${escapeHtml(item.procedure)}</td></tr>
    <tr><td>Ruta</td><td>${escapeHtml(item.origin)} → ${escapeHtml(item.destination)}</td></tr>
    <tr><td>Fecha estimada</td><td>${formatDate(item.travelDate)}</td></tr>
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
 * Panel de gestion del admin.
 * ------------------------------------------------------------------------- */

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
      // Valor final derivado: nunca se edita a mano.
      finalPatientValue: baseCost + csTravelMargin + doctorMargin,
      quoteDetails: form.quoteDetails.value.trim(),
      clientNotes: form.clientNotes.value.trim(),
      adminNotes: form.adminNotes.value.trim(),
    };

    try {
      await medicalCaseService.update(ctx.params.id, payload);
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
