/**
 * AdminCompanyDetailView.js
 * =============================================================================
 * PROPOSITO:
 *   Detalle y gestion de UNA empresa (rol admin). Permite editar datos basicos,
 *   actualizar manualmente las metricas (costos, ahorro, retorno, viajes),
 *   activar/desactivar la empresa, ver sus solicitudes y crear una solicitud
 *   asociada a ella.
 *
 * RESPONSABILIDADES:
 *   - render(): cargar la empresa (por id de la URL) y sus solicitudes; pintar
 *     el formulario de edicion y los listados.
 *   - afterRender(): guardar cambios (editar/metricas), alternar estado y crear
 *     una solicitud para la empresa.
 * =============================================================================
 */

import { companyService } from '../services/companyService.js';
import { requestService } from '../services/requestService.js';
import { RequestTable } from '../components/RequestTable.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { validateRequestForm } from '../utils/validators.js';

/**
 * Panel de rentabilidad: compara el ingreso que la empresa genera a CS Travel
 * (margen propio) contra el valor que se le retorna al cliente. Alerta si el
 * retorno supera al ingreso (se le esta devolviendo mas de lo que genera).
 */
function renderProfitability(incomeCST, returned) {
  const net = incomeCST - returned;
  const ratio = incomeCST > 0 ? Math.round((returned / incomeCST) * 100) : 0;
  const overReturned = returned > incomeCST;

  return `
    <section class="panel profit-panel ${overReturned ? 'profit-panel--alert' : ''}">
      <div class="panel__header">
        <h2 class="panel__title">Rentabilidad del aliado</h2>
        ${overReturned
          ? '<span class="chip chip--danger">⚠ Retorna mas de lo que genera</span>'
          : '<span class="chip chip--ok">Rentable</span>'}
      </div>
      <div class="profit-grid">
        <div class="profit-stat">
          <span>Ingreso generado a CS Travel</span>
          <strong class="text-green">${formatCurrency(incomeCST)}</strong>
          <small>Margen propio sobre sus operaciones</small>
        </div>
        <div class="profit-stat">
          <span>Valor retornado al cliente</span>
          <strong class="text-amber">${formatCurrency(returned)}</strong>
          <small>${ratio}% de lo que genera a CS Travel</small>
        </div>
        <div class="profit-stat">
          <span>Resultado neto</span>
          <strong class="${net >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(net)}</strong>
          <small>${net >= 0 ? 'Aporta mas de lo que recibe' : 'Recibe mas de lo que aporta'}</small>
        </div>
      </div>
    </section>
  `;
}

export const AdminCompanyDetailView = {
  async render(ctx) {
    const { id } = ctx.params;

    // Cargamos la empresa y sus solicitudes en paralelo.
    const [company, requests] = await Promise.all([
      companyService.getById(id),
      requestService.getByCompany(id),
    ]);

    // Texto del boton de activar/desactivar segun estado actual.
    const toggleLabel = company.status === 'active' ? 'Desactivar' : 'Activar';

    // Rentabilidad: lo que genera a CS Travel vs lo que se le retorna al cliente.
    const incomeCST = requests.reduce((s, r) => s + (r.csTravelMargin || 0), 0);
    const returned = requests.reduce((s, r) => s + (r.estimatedReturn || 0), 0);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(company.name)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(company.status)}
            <span class="chip">Codigo: ${escapeHtml(company.sharedCode)}</span>
            <span class="muted">Actualizada: ${formatDate(company.lastUpdate, true)}</span>
          </p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--ghost" id="toggle-status">${toggleLabel}</button>
          <a href="#/admin/companies" class="btn btn--ghost">← Volver</a>
        </div>
      </div>

      ${renderProfitability(incomeCST, returned)}

      <!-- Formulario de edicion de datos + metricas manuales. -->
      <section class="panel">
        <h2 class="panel__title">Datos y metricas de la empresa</h2>
        <form id="edit-form" class="form form--grid">
          <div class="form__group">
            <label class="form__label">Nombre</label>
            <input type="text" name="name" class="form__input" value="${escapeHtml(company.name)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Contacto</label>
            <input type="text" name="contactName" class="form__input" value="${escapeHtml(company.contactName)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Email</label>
            <input type="email" name="email" class="form__input" value="${escapeHtml(company.email)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Telefono</label>
            <input type="text" name="phone" class="form__input" value="${escapeHtml(company.phone)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Codigo compartido</label>
            <input type="text" name="sharedCode" class="form__input" value="${escapeHtml(company.sharedCode)}" />
          </div>
          <div class="form__group">
            <label class="form__label">Viajes registrados</label>
            <input type="number" name="totalTrips" class="form__input" value="${company.totalTrips}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Costo total</label>
            <input type="number" name="totalCost" class="form__input" value="${company.totalCost}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Ahorro estimado</label>
            <input type="number" name="estimatedSavings" class="form__input" value="${company.estimatedSavings}" min="0" />
          </div>
          <div class="form__group">
            <label class="form__label">Retorno estimado</label>
            <input type="number" name="estimatedReturn" class="form__input" value="${company.estimatedReturn}" min="0" />
          </div>

          <div class="form__alert form__group--full" id="edit-alert" hidden></div>

          <div class="form__actions form__group--full">
            <button type="submit" class="btn btn--primary">Guardar cambios</button>
          </div>
        </form>
      </section>

      <!-- Solicitudes de la empresa + crear solicitud asociada. -->
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Solicitudes de la empresa</h2>
          <button class="btn btn--ghost" id="toggle-new-request">+ Crear solicitud</button>
        </div>

        <!-- Formulario rapido de creacion (oculto por defecto). -->
        <form id="admin-request-form" class="form form--grid" hidden>
          <div class="form__group">
            <label class="form__label">Personas *</label>
            <input type="number" name="peopleCount" class="form__input" min="1" value="1" />
            <small class="form__error" data-error-for="peopleCount"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Clase *</label>
            <select name="travelClass" class="form__input">
              <option value="turista">Turista</option>
              <option value="ejecutiva">Ejecutiva / Business</option>
            </select>
          </div>
          <div class="form__group">
            <label class="form__label">Origen *</label>
            <input type="text" name="origin" class="form__input" />
            <small class="form__error" data-error-for="origin"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Destino *</label>
            <input type="text" name="destination" class="form__input" />
            <small class="form__error" data-error-for="destination"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Fecha *</label>
            <input type="date" name="travelDate" class="form__input" />
            <small class="form__error" data-error-for="travelDate"></small>
          </div>
          <div class="form__group form__group--full">
            <div class="checkbox-row">
              <label class="checkbox"><input type="checkbox" name="hasInsurance" /> <span>Seguro</span></label>
              <label class="checkbox"><input type="checkbox" name="hasActivities" /> <span>Actividades</span></label>
              <label class="checkbox"><input type="checkbox" name="hasTransfers" /> <span>Traslados</span></label>
            </div>
          </div>
          <div class="form__group form__group--full">
            <label class="form__label">Observaciones</label>
            <textarea name="observations" class="form__input" rows="2"></textarea>
          </div>
          <div class="form__alert form__group--full" id="admin-request-alert" hidden></div>
          <div class="form__actions form__group--full">
            <button type="submit" class="btn btn--primary">Guardar solicitud</button>
          </div>
        </form>

        ${RequestTable(requests, { detailBase: '#/admin/requests' })}
      </section>
    `;
  },

  async afterRender(ctx) {
    const { id } = ctx.params;

    // --- Editar datos / metricas ---------------------------------------
    const editForm = document.getElementById('edit-form');
    const editAlert = document.getElementById('edit-alert');

    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      editAlert.hidden = true;

      const payload = {
        name: editForm.name.value.trim(),
        contactName: editForm.contactName.value.trim(),
        email: editForm.email.value.trim(),
        phone: editForm.phone.value.trim(),
        sharedCode: editForm.sharedCode.value.trim(),
        totalTrips: Number(editForm.totalTrips.value) || 0,
        totalCost: Number(editForm.totalCost.value) || 0,
        estimatedSavings: Number(editForm.estimatedSavings.value) || 0,
        estimatedReturn: Number(editForm.estimatedReturn.value) || 0,
      };

      try {
        await companyService.update(id, payload);
        editAlert.textContent = 'Cambios guardados correctamente.';
        editAlert.className = 'form__alert form__alert--success';
        editAlert.hidden = false;
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 600);
      } catch (error) {
        editAlert.textContent = `Error al guardar: ${error.message}`;
        editAlert.className = 'form__alert';
        editAlert.hidden = false;
      }
    });

    // --- Activar / desactivar ------------------------------------------
    const toggleBtn = document.getElementById('toggle-status');
    toggleBtn.addEventListener('click', async () => {
      try {
        const company = await companyService.getById(id);
        await companyService.toggleStatus(company);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        window.alert(`No se pudo cambiar el estado: ${error.message}`);
      }
    });

    // --- Crear solicitud asociada a la empresa -------------------------
    const newReqBtn = document.getElementById('toggle-new-request');
    const reqForm = document.getElementById('admin-request-form');
    const reqAlert = document.getElementById('admin-request-alert');

    newReqBtn.addEventListener('click', () => {
      reqForm.hidden = !reqForm.hidden;
    });

    reqForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      reqForm.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
      reqAlert.hidden = true;

      const data = {
        companyId: id,
        peopleCount: reqForm.peopleCount.value,
        travelClass: reqForm.travelClass.value,
        origin: reqForm.origin.value.trim(),
        destination: reqForm.destination.value.trim(),
        travelDate: reqForm.travelDate.value,
        hasInsurance: reqForm.hasInsurance.checked,
        hasActivities: reqForm.hasActivities.checked,
        hasTransfers: reqForm.hasTransfers.checked,
        observations: reqForm.observations.value.trim(),
      };

      const { isValid, errors } = validateRequestForm(data);
      if (!isValid) {
        Object.entries(errors).forEach(([field, message]) => {
          const el = reqForm.querySelector(`[data-error-for="${field}"]`);
          if (el) el.textContent = message;
        });
        return;
      }

      try {
        await requestService.create(data);
        // Actualizamos el contador de solicitudes de la empresa.
        const company = await companyService.getById(id);
        await companyService.update(id, { totalRequests: (company.totalRequests || 0) + 1 });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        reqAlert.textContent = `No se pudo crear la solicitud: ${error.message}`;
        reqAlert.hidden = false;
      }
    });
  },
};
