/**
 * RequestDetailView.js
 * =============================================================================
 * PROPOSITO:
 *   Detalle de una solicitud de viaje. Vista COMPARTIDA por admin y empresa,
 *   pero con permisos distintos:
 *     - Empresa: solo lectura, y SOLO si la solicitud le pertenece.
 *     - Admin: ademas puede editar costos/ahorro/retorno, cambiar el estado y
 *       eliminar la solicitud.
 *
 * RESPONSABILIDADES:
 *   - render(): cargar la solicitud (y la empresa), validar permisos y pintar
 *     el detalle. Mostrar el panel de gestion solo si el rol es admin.
 *   - afterRender(): enlazar las acciones de admin (guardar montos, cambiar
 *     estado, eliminar).
 *
 * SEGURIDAD (aislamiento):
 *   Si un usuario empresa intenta abrir una solicitud que no es suya (cambiando
 *   el id en la URL), lo redirigimos a #/not-authorized.
 * =============================================================================
 */

import { requestService, STATUSES } from '../services/requestService.js';
import { companyService } from '../services/companyService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { navigate } from '../router/router.js';
import { payHref, payTargetAttrs } from '../utils/payLink.js';

export const RequestDetailView = {
  async render(ctx) {
    const { id } = ctx.params;
    const user = ctx.user;
    const isAdmin = user.role === 'admin';

    // Cargamos la solicitud.
    const request = await requestService.getById(id);

    // --- Control de acceso para empresas -------------------------------
    // Una empresa solo puede ver SUS propias solicitudes.
    if (!isAdmin && request.companyId !== user.companyId) {
      navigate('#/not-authorized');
      return '';
    }

    // Cargamos la empresa asociada (para mostrar su nombre).
    const company = await companyService.getById(request.companyId);

    // Ruta de "volver" segun el rol.
    const backHash = isAdmin ? '#/admin/requests' : '#/company/requests';

    // Etiqueta legible de clase y de extras (si/no).
    const classLabel = request.travelClass === 'ejecutiva' ? 'Ejecutiva / Business' : 'Turista';
    const yesNo = (v) => (v ? 'Si' : 'No');
    const docLabels = { pasaporte: 'Pasaporte', cedula: 'Cedula', id: 'ID', otro: 'Documento' };
    const documentText = request.documentNumber
      ? `${docLabels[request.documentType] || 'Documento'} ${request.documentNumber}`
      : '';

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(request.requestCode)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(request.status)}
            <span class="chip">${escapeHtml(request.requestType || 'paquete completo')}</span>
            <span class="chip">${escapeHtml(company.name)}</span>
          </p>
        </div>
        <div class="page-header__actions">
          ${!isAdmin && request.status === 'cotizacion enviada' ? `<button type="button" class="btn btn--primary" id="approve-request">Aprobar cotización ✓</button>` : ''}
          <a href="${backHash}" class="btn btn--ghost">← Volver</a>
        </div>
      </div>

      <div class="detail-grid">
        <!-- Columna izquierda: datos del viaje. -->
        <section class="panel">
          <h2 class="panel__title">Datos del viaje</h2>
          <dl class="detail-list">
            <div><dt>Ruta</dt><dd>${escapeHtml(request.origin)} → ${escapeHtml(request.destination)}</dd></div>
            <div><dt>Tipo de solicitud</dt><dd>${escapeHtml(request.requestType || 'paquete completo')}</dd></div>
            <div><dt>Fecha de ida</dt><dd>${formatDate(request.travelDate)}</dd></div>
            <div><dt>Fecha de regreso</dt><dd>${request.returnDate ? formatDate(request.returnDate) : '<span class="muted">No aplica</span>'}</dd></div>
            <div><dt>Personas</dt><dd>${escapeHtml(request.peopleCount)}</dd></div>
            <div><dt>Clase</dt><dd>${escapeHtml(classLabel)}</dd></div>
            <div><dt>Viajero principal</dt><dd>${escapeHtml(request.fullName) || '<span class="muted">Pendiente</span>'}</dd></div>
            <div><dt>Documento</dt><dd>${escapeHtml(documentText) || '<span class="muted">Pendiente</span>'}</dd></div>
            <div><dt>Nacionalidad</dt><dd>${escapeHtml(request.nationality) || '<span class="muted">Pendiente</span>'}</dd></div>
            <div><dt>Seguro de viaje</dt><dd>${yesNo(request.hasInsurance)}</dd></div>
            <div><dt>Actividades</dt><dd>${yesNo(request.hasActivities)}</dd></div>
            <div><dt>Traslados</dt><dd>${yesNo(request.hasTransfers)}</dd></div>
            <div><dt>Creada</dt><dd>${formatDate(request.createdAt, true)}</dd></div>
            <div class="detail-list__full"><dt>Observaciones</dt><dd>${escapeHtml(request.observations) || '<span class="muted">Sin observaciones</span>'}</dd></div>
            ${request.status === 'cancelada' && request.lostReason
              ? `<div class="detail-list__full"><dt>Motivo de no cierre</dt><dd class="text-amber">${escapeHtml(request.lostReason)}</dd></div>`
              : ''}
          </dl>
        </section>

        <!-- Columna derecha: cifras economicas. -->
        <section class="panel">
          <h2 class="panel__title">Costos y beneficios</h2>
          <dl class="detail-list">
            <div><dt>Costo estimado CS Travel</dt><dd><strong>${formatCurrency(request.estimatedCost)}</strong></dd></div>
            <div><dt>Referencia Booking/Despegar</dt><dd>${formatCurrency(request.bookingReferenceCost)}</dd></div>
            <div><dt>Ahorro estimado</dt><dd class="text-green">${formatCurrency(request.estimatedSavings)}</dd></div>
            <div><dt>Retorno estimado</dt><dd class="text-amber">${formatCurrency(request.estimatedReturn)}</dd></div>
            ${isAdmin ? `<div><dt>Margen CS Travel</dt><dd>${formatCurrency(request.csTravelMargin)}</dd></div>` : ''}
            <div class="detail-list__full"><dt>Detalle de cotizacion</dt><dd>${escapeHtml(request.quoteDetails) || '<span class="muted">Pendiente</span>'}</dd></div>
            <div class="detail-list__full"><dt>Notas de CS Travel</dt><dd>${escapeHtml(request.clientNotes) || '<span class="muted">Sin notas visibles</span>'}</dd></div>
          </dl>
        </section>
      </div>

      ${!isAdmin ? renderCompanyPayCta(request) : ''}
      ${isAdmin ? renderAdminPanel(request) : ''}
    `;
  },

  async afterRender(ctx) {
    const { id } = ctx.params;

    // --- Empresa: aprobar cotizacion (espejo del flujo del medico) ---------
    // La empresa no tiene el panel de gestion del admin, pero SI puede aprobar
    // su cotizacion (cuando esta "cotizacion enviada") y luego pagar.
    if (ctx.user.role !== 'admin') {
      document.getElementById('approve-request')?.addEventListener('click', async () => {
        if (!window.confirm('¿Confirmas que apruebas esta cotizacion? La solicitud pasara a "aprobada" y podras proceder al pago.')) return;
        try {
          const fresh = await requestService.getById(id);
          await requestService.changeStatus(id, 'aprobada');
          await companyService.recompute(fresh.companyId);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (error) {
          window.alert(`No se pudo aprobar: ${error.message}`);
        }
      });
      return; // la empresa no tiene panel de gestion del admin
    }

    // --- Guardar montos + estado ---------------------------------------
    const manageForm = document.getElementById('manage-form');
    const manageAlert = document.getElementById('manage-alert');

    manageForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      manageAlert.hidden = true;

      // Recolectamos los valores editados por el admin.
      const payload = {
        status: manageForm.status.value,
        estimatedCost: Number(manageForm.estimatedCost.value) || 0,
        bookingReferenceCost: Number(manageForm.bookingReferenceCost.value) || 0,
        estimatedSavings: Number(manageForm.estimatedSavings.value) || 0,
        estimatedReturn: Number(manageForm.estimatedReturn.value) || 0,
        csTravelMargin: Number(manageForm.csTravelMargin.value) || 0,
        quoteDetails: manageForm.quoteDetails.value.trim(),
        clientNotes: manageForm.clientNotes.value.trim(),
        adminNotes: manageForm.adminNotes.value.trim(),
      };

      // Al marcar como cancelada pedimos el motivo de no cierre (analisis).
      if (payload.status === 'cancelada') {
        const current = await requestService.getById(id);
        const input = window.prompt(
          'Motivo por el que NO se cerro esta operacion (para analisis):',
          current.lostReason || ''
        );
        if (input !== null) payload.lostReason = input.trim();
      }

      try {
        await requestService.update(id, payload);
        // Sincronizamos los agregados de la empresa (su dashboard refleja
        // costos/ahorro/retorno/estado nuevos automaticamente).
        const fresh = await requestService.getById(id);
        await companyService.recompute(fresh.companyId);
        manageAlert.textContent = 'Cambios guardados correctamente.';
        manageAlert.className = 'form__alert form__alert--success';
        manageAlert.hidden = false;
        // Recargamos la vista para reflejar los nuevos valores arriba.
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 600);
      } catch (error) {
        manageAlert.textContent = `Error al guardar: ${error.message}`;
        manageAlert.className = 'form__alert';
        manageAlert.hidden = false;
      }
    });

    // --- Eliminar solicitud (solo admin) -------------------------------
    const deleteBtn = document.getElementById('delete-request');
    deleteBtn.addEventListener('click', async () => {
      // Confirmacion para una accion destructiva.
      const ok = window.confirm('Eliminar esta solicitud? Esta accion no se puede deshacer.');
      if (!ok) return;

      try {
        const { companyId } = await requestService.getById(id);
        await requestService.remove(id);
        await companyService.recompute(companyId);
        navigate('#/admin/requests');
      } catch (error) {
        window.alert(`No se pudo eliminar: ${error.message}`);
      }
    });
  },
};

/**
 * renderCompanyPayCta()
 * CTA de pago para la empresa: aparece cuando la solicitud esta "aprobada" (o
 * "en gestion") y tiene costo. El monto autoritativo lo resuelve el servidor
 * desde la referencia request:<id> (espejo del pago del medico con case:<id>).
 */
function renderCompanyPayCta(request) {
  const payable = ['aprobada', 'en gestion'].includes(request.status) && (request.estimatedCost || 0) > 0;
  if (!payable) return '';
  const href = payHref({ reference: 'request:' + request.id, concept: request.requestCode || 'Solicitud', amount: request.estimatedCost });
  return `
    <section class="panel panel--pay">
      <h2 class="panel__title">Pago de la solicitud</h2>
      <a class="btn btn--primary btn--pay-quote"
         href="${href}"${payTargetAttrs()}>
        Pagar solicitud · ${formatCurrency(request.estimatedCost)} →
      </a>
      <p class="pay-quote-note">Pago seguro con tarjeta, PSE o transferencia (sin recargo).</p>
    </section>
  `;
}

/**
 * renderAdminPanel()
 * Panel de gestion visible solo para el admin: editar montos, cambiar estado
 * y eliminar la solicitud.
 */
function renderAdminPanel(request) {
  // Opciones del selector de estado (marcando el actual como seleccionado).
  const statusOptions = STATUSES.map(
    (s) => `<option value="${s}" ${s === request.status ? 'selected' : ''}>${s}</option>`
  ).join('');

  return `
    <section class="panel panel--admin">
      <h2 class="panel__title">Gestion (Administrador)</h2>
      <form id="manage-form" class="form form--grid">
        <div class="form__group">
          <label class="form__label">Estado</label>
          <select name="status" class="form__input">${statusOptions}</select>
        </div>
        <div class="form__group">
          <label class="form__label">Costo estimado CS Travel</label>
          <input type="number" name="estimatedCost" class="form__input" value="${request.estimatedCost}" min="0" />
        </div>
        <div class="form__group">
          <label class="form__label">Referencia Booking/Despegar</label>
          <input type="number" name="bookingReferenceCost" class="form__input" value="${request.bookingReferenceCost}" min="0" />
        </div>
        <div class="form__group">
          <label class="form__label">Ahorro estimado</label>
          <input type="number" name="estimatedSavings" class="form__input" value="${request.estimatedSavings}" min="0" />
        </div>
        <div class="form__group">
          <label class="form__label">Retorno estimado</label>
          <input type="number" name="estimatedReturn" class="form__input" value="${request.estimatedReturn}" min="0" />
        </div>
        <div class="form__group">
          <label class="form__label">Margen CS Travel (ingreso)</label>
          <input type="number" name="csTravelMargin" class="form__input" value="${request.csTravelMargin || 0}" min="0" />
        </div>
        <div class="form__group form__group--full">
          <label class="form__label">Detalle de cotizacion</label>
          <textarea name="quoteDetails" class="form__input" rows="3">${escapeHtml(request.quoteDetails || '')}</textarea>
        </div>
        <div class="form__group form__group--full">
          <label class="form__label">Notas visibles para el cliente</label>
          <textarea name="clientNotes" class="form__input" rows="3">${escapeHtml(request.clientNotes || '')}</textarea>
        </div>
        <div class="form__group form__group--full">
          <label class="form__label">Observaciones internas</label>
          <textarea name="adminNotes" class="form__input" rows="3">${escapeHtml(request.adminNotes || '')}</textarea>
        </div>

        <div class="form__alert form__group--full" id="manage-alert" hidden></div>

        <div class="form__actions form__group--full">
          <button type="button" class="btn btn--danger" id="delete-request">Eliminar solicitud</button>
          <button type="submit" class="btn btn--primary">Guardar cambios</button>
        </div>
      </form>
    </section>
  `;
}
