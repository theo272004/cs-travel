/**
 * MedicalCaseDetailView.js
 * =============================================================================
 * PROPOSITO:
 *   Detalle de un caso medico/paciente. Vista COMPARTIDA por admin y medico:
 *     - Medico: ve los datos del caso, el desglose de la cotizacion logistica y,
 *       cuando CS Travel ya cotizo, puede AJUSTAR su propio margen dentro del
 *       rango sugerido (entre 0 y el tope que fija CS Travel). El valor final al
 *       paciente se recalcula en vivo.
 *     - Admin: ademas carga costo base, margen CS Travel, margen sugerido y tope
 *       del medico, estado y notas. El valor final se deriva automaticamente.
 *
 * MODELO DE MARGEN (acordado):
 *   valor final paciente = costo base + margen CS Travel + margen del medico.
 *   CS Travel sugiere un margen y fija un tope; el medico ajusta el suyo dentro
 *   de ese rango. El medico nunca edita el costo base ni el margen de CS Travel.
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

// Colores de cada tramo del desglose (coherentes con la paleta de la marca).
const SEG_COLORS = { base: '#6b7787', cst: '#c77700', doctor: '#0f9d6e' };

/** Construye los segmentos del desglose de la cotizacion. */
function breakdownSegments(item) {
  return [
    { key: 'base', label: 'Costo base', value: item.baseCost, color: SEG_COLORS.base },
    { key: 'cst', label: 'Margen CS Travel', value: item.csTravelMargin, color: SEG_COLORS.cst },
    { key: 'doctor', label: 'Margen medico', value: item.doctorMargin, color: SEG_COLORS.doctor },
  ];
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

    // El medico solo puede ajustar su margen cuando el caso ya esta cotizado
    // (CS Travel definio un tope mayor que cero).
    const doctorCanEdit = !isAdmin && (item.doctorMarginMax || 0) > 0;
    const finalValue = (item.baseCost || 0) + (item.csTravelMargin || 0) + (item.doctorMargin || 0);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(item.caseCode)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(item.status)}
            <span class="chip">${escapeHtml(doctor.clinicName)}</span>
          </p>
        </div>
        <a href="${backHash}" class="btn btn--ghost">← Volver</a>
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
          <div class="breakdown">
            ${StackedBar({ segments: breakdownSegments(item), formatValue: formatCurrency })}
            <div class="breakdown__total">
              <span class="muted-block">Valor final paciente</span>
              <strong class="breakdown__total-value text-green">${formatCurrency(finalValue)}</strong>
            </div>
          </div>
          <dl class="detail-list">
            <div class="detail-list__full"><dt>Detalle de cotizacion</dt><dd>${escapeHtml(item.quoteDetails) || '<span class="muted">Pendiente</span>'}</dd></div>
            <div class="detail-list__full"><dt>Notas de CS Travel</dt><dd>${escapeHtml(item.clientNotes) || '<span class="muted">Sin notas visibles</span>'}</dd></div>
            <div><dt>Actualizado</dt><dd>${formatDate(item.updatedAt, true)}</dd></div>
          </dl>
        </section>
      </div>

      ${doctorCanEdit ? renderDoctorMarginEditor(item) : ''}
      ${isAdmin ? renderAdminPanel(item) : ''}
    `;
  },

  async afterRender(ctx) {
    const item = await medicalCaseService.getById(ctx.params.id);

    if (ctx.user.role === 'admin') {
      wireAdminForm(ctx, item);
    } else if ((item.doctorMarginMax || 0) > 0) {
      wireDoctorMarginEditor(ctx, item);
    }
  },
};

/**
 * renderDoctorMarginEditor()
 * Bloque interactivo donde el medico ajusta su margen con un slider dentro del
 * rango [0, doctorMarginMax]. La barra y los valores se recalculan en vivo.
 */
function renderDoctorMarginEditor(item) {
  const base = item.baseCost || 0;
  const cst = item.csTravelMargin || 0;
  const doctor = item.doctorMargin || 0;
  const max = item.doctorMarginMax || 0;
  const suggested = item.doctorMarginSuggested || 0;
  const total = base + cst + doctor;
  const pct = (value) => (total > 0 ? (value / total) * 100 : 0);

  return `
    <section class="panel panel--accent">
      <h2 class="panel__title">Tu margen como medico</h2>
      <p class="muted">
        CS Travel sugiere <strong>${formatCurrency(suggested)}</strong>.
        Puedes ajustarlo entre $0 y <strong>${formatCurrency(max)}</strong>.
        El valor final que paga el paciente se recalcula automaticamente.
      </p>

      <div class="margin-editor">
        <div class="margin-editor__readouts">
          <div>
            <span class="muted-block">Tu margen</span>
            <strong id="me-doctor" class="text-green">${formatCurrency(doctor)}</strong>
          </div>
          <div>
            <span class="muted-block">Valor final paciente</span>
            <strong id="me-final">${formatCurrency(total)}</strong>
          </div>
        </div>

        <input type="range" id="me-slider" class="margin-editor__slider"
          min="0" max="${max}" step="10000" value="${doctor}" />
        <div class="margin-editor__scale">
          <span>$0</span>
          <button type="button" class="link" id="me-suggested">Usar sugerido</button>
          <span>${formatCurrency(max)}</span>
        </div>

        <div class="stack-bar margin-editor__bar" id="me-bar">
          <div class="stack-bar__seg" data-seg="base" style="width:${pct(base)}%;background:${SEG_COLORS.base}"></div>
          <div class="stack-bar__seg" data-seg="cst" style="width:${pct(cst)}%;background:${SEG_COLORS.cst}"></div>
          <div class="stack-bar__seg" data-seg="doctor" style="width:${pct(doctor)}%;background:${SEG_COLORS.doctor}"></div>
        </div>

        <div class="form__alert" id="me-alert" hidden></div>
        <div class="form__actions">
          <button type="button" class="btn btn--primary" id="me-save">Guardar mi margen</button>
        </div>
      </div>
    </section>
  `;
}

/** Enlaza el slider del medico: recalculo en vivo + guardado de su margen. */
function wireDoctorMarginEditor(ctx, item) {
  const slider = document.getElementById('me-slider');
  if (!slider) return;

  const base = item.baseCost || 0;
  const cst = item.csTravelMargin || 0;
  const suggested = item.doctorMarginSuggested || 0;

  const doctorOut = document.getElementById('me-doctor');
  const finalOut = document.getElementById('me-final');
  const bar = document.getElementById('me-bar');
  const alert = document.getElementById('me-alert');

  const recalc = () => {
    const doctor = Number(slider.value) || 0;
    const total = base + cst + doctor;
    doctorOut.textContent = formatCurrency(doctor);
    finalOut.textContent = formatCurrency(total);
    if (total > 0) {
      bar.querySelector('[data-seg="base"]').style.width = `${(base / total) * 100}%`;
      bar.querySelector('[data-seg="cst"]').style.width = `${(cst / total) * 100}%`;
      bar.querySelector('[data-seg="doctor"]').style.width = `${(doctor / total) * 100}%`;
    }
  };

  slider.addEventListener('input', recalc);

  document.getElementById('me-suggested')?.addEventListener('click', () => {
    slider.value = String(suggested);
    recalc();
  });

  document.getElementById('me-save').addEventListener('click', async () => {
    alert.hidden = true;
    const doctorMargin = Number(slider.value) || 0;
    const finalPatientValue = base + cst + doctorMargin;
    try {
      // El medico SOLO actualiza su margen y el total derivado.
      await medicalCaseService.update(ctx.params.id, { doctorMargin, finalPatientValue });
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

/**
 * renderAdminPanel()
 * Gestion de CS Travel: estado, costo base, margen CST, margen sugerido y tope
 * del medico, detalle y notas. El valor final al paciente se deriva al guardar.
 */
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
          <p class="muted">El valor final al paciente se calcula como costo base + margen CS Travel + margen medico.</p>
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

/** Enlaza el formulario de gestion del admin. */
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
