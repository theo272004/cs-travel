import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { doctorService } from '../services/doctorService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { navigate } from '../router/router.js';

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
          <dl class="detail-list">
            <div><dt>Costo base</dt><dd><strong>${formatCurrency(item.baseCost)}</strong></dd></div>
            <div><dt>Margen CS Travel</dt><dd class="text-amber">${formatCurrency(item.csTravelMargin)}</dd></div>
            <div><dt>Margen medico</dt><dd>${formatCurrency(item.doctorMargin)}</dd></div>
            <div><dt>Valor final paciente</dt><dd class="text-green">${formatCurrency(item.finalPatientValue)}</dd></div>
            <div class="detail-list__full"><dt>Detalle de cotizacion</dt><dd>${escapeHtml(item.quoteDetails) || '<span class="muted">Pendiente</span>'}</dd></div>
            <div class="detail-list__full"><dt>Notas de CS Travel</dt><dd>${escapeHtml(item.clientNotes) || '<span class="muted">Sin notas visibles</span>'}</dd></div>
            <div><dt>Actualizado</dt><dd>${formatDate(item.updatedAt, true)}</dd></div>
          </dl>
        </section>
      </div>

      ${isAdmin ? renderAdminPanel(item) : ''}
    `;
  },

  async afterRender(ctx) {
    if (ctx.user.role !== 'admin') return;

    const form = document.getElementById('medical-case-manage-form');
    const alert = document.getElementById('medical-case-manage-alert');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      alert.hidden = true;

      const payload = {
        status: form.status.value,
        baseCost: Number(form.baseCost.value) || 0,
        csTravelMargin: Number(form.csTravelMargin.value) || 0,
        doctorMargin: Number(form.doctorMargin.value) || 0,
        finalPatientValue: Number(form.finalPatientValue.value) || 0,
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
  },
};

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
          <label class="form__label">Margen medico</label>
          <input type="number" name="doctorMargin" class="form__input" value="${item.doctorMargin}" min="0" />
        </div>
        <div class="form__group">
          <label class="form__label">Valor final paciente</label>
          <input type="number" name="finalPatientValue" class="form__input" value="${item.finalPatientValue}" min="0" />
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
