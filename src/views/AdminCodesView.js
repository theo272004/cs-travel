/**
 * AdminCodesView.js
 * =============================================================================
 * PROPOSITO:
 *   Panel de gestion de CODIGOS de referido/descuento (rol admin). El cliente
 *   asigna los codigos MANUALMENTE y puede crearlos, borrarlos y agregar mas.
 *   Un codigo: (1) atribuye el referido a un socio (empresa/medico) y
 *   (2) aplica un descuento al cliente (porcentaje o monto fijo).
 *
 * RESPONSABILIDADES:
 *   - render(): formulario de creacion (codigo, descuento, socio, estado),
 *     buscador y tabla de codigos.
 *   - afterRender(): crear, activar/desactivar y borrar codigos sin recargar.
 *
 * NOTA: el uso del descuento en el checkout (/pagar) es el siguiente paso;
 *   aqui se construye el panel de gestion (CRUD), que es el corazon del pedido.
 * =============================================================================
 */

import { codeService } from '../services/codeService.js';
import { companyService } from '../services/companyService.js';
import { doctorService } from '../services/doctorService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { requestService } from '../services/requestService.js';
import { CodeTable } from '../components/CodeTable.js';
import { escapeHtml } from '../utils/escapeHtml.js';

// Cache para filtrar sin volver a pedir datos.
let cachedCodes = [];

/** Nombre legible de un medico (segun como venga el registro). */
function doctorName(d) {
  return d.name || d.fullName || d.clinicName || `Médico #${d.id}`;
}

export const AdminCodesView = {
  async render() {
    // Cargamos en paralelo: codigos + socios (empresas/medicos) + ventas
    // (casos + solicitudes) para calcular el USO real de cada codigo.
    const [codes, companies, doctors, cases, requests] = await Promise.all([
      codeService.getAll().catch(() => []), // resiliente: si la colección Codes aún no existe, lista vacía
      companyService.getAll().catch(() => []),
      doctorService.getAll().catch(() => []),
      medicalCaseService.getAll().catch(() => []),
      requestService.getAll().catch(() => []),
    ]);

    // Uso REAL: cruzamos las ventas que tienen el codigo anotado (manual). El
    // monto sale de la venta y "vendida" = pagada/finalizada (en gestion o
    // finalizada). Asi el admin ve, por codigo, cuantas ventas lo usaron, cuantas
    // cerraron y cuanto sumaron — sin marcar nada a mano.
    const norm = (s) => String(s || '').trim().toUpperCase();
    const CLOSED = ['en gestion', 'finalizada'];
    const sales = [
      ...cases.map((c) => ({ code: c.referralCode, status: c.status, value: c.finalPatientValue || 0 })),
      ...requests.map((r) => ({ code: r.referralCode, status: r.status, value: r.estimatedCost || 0 })),
    ].filter((s) => s.code);
    codes.forEach((code) => {
      const used = sales.filter((s) => norm(s.code) === norm(code.code));
      code.usageCount = used.length;
      code.closedCount = used.filter((s) => CLOSED.includes(s.status)).length;
      code.usedTotal = used.reduce((sum, s) => sum + Number(s.value || 0), 0);
    });
    cachedCodes = codes;

    const activeCount = codes.filter((c) => c.status === 'active').length;

    const companyOptions = companies
      .map((c) => `<option value="company:${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
    const doctorOptions = doctors
      .map((d) => `<option value="doctor:${d.id}">${escapeHtml(doctorName(d))}</option>`)
      .join('');

    return `
      <style>
        .code-chip {
          display: inline-block;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-weight: 800;
          letter-spacing: 0.04em;
          background: #eef2fb;
          color: #0a2d66;
          border: 1px solid #d8e0f2;
          border-radius: 7px;
          padding: 3px 9px;
        }
        .codes-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .codes-actions .btn--sm { white-space: nowrap; }
      </style>

      <div class="page-header">
        <div>
          <h1 class="page-title">Códigos de referido y descuento</h1>
          <p class="page-subtitle">Crea, asigna y administra los códigos. Cada código atribuye el referido a un socio y aplica un descuento al cliente.</p>
        </div>
        <button class="btn btn--primary" id="toggle-create">+ Nuevo código</button>
      </div>

      <!-- Formulario de creacion (oculto hasta pulsar el boton). -->
      <section class="panel" id="create-panel" hidden>
        <h2 class="panel__title">Crear nuevo código</h2>
        <form id="code-form" class="form form--grid" novalidate>
          <div class="form__group">
            <label class="form__label">1 · Socio (a quién se asigna) *</label>
            <select name="owner" class="form__input">
              <option value="">— Sin socio —</option>
              ${companyOptions ? `<optgroup label="Empresas">${companyOptions}</optgroup>` : ''}
              ${doctorOptions ? `<optgroup label="Médicos">${doctorOptions}</optgroup>` : ''}
            </select>
            <small class="form__hint">El aliado (empresa o médico) dueño del código.</small>
          </div>
          <div class="form__group">
            <label class="form__label">2 · Código *</label>
            <input type="text" name="code" class="form__input" placeholder="DRAVALEN10" autocomplete="off" style="text-transform:uppercase" />
            <small class="form__error" data-error-for="code"></small>
          </div>
          <div class="form__group">
            <label class="form__label">3 · Tipo de código *</label>
            <select name="codeType" class="form__input">
              <option value="clientes">Clientes (fidelización)</option>
              <option value="colaboradores">Colaboradores (bienestar del equipo)</option>
            </select>
            <small class="form__hint">¿Para qué público es el beneficio? (los 2 tipos del contrato)</small>
          </div>
          <div class="form__group form__group--full">
            <label class="form__label">4 · Descuento al cliente</label>
            <label class="checkbox"><input type="checkbox" name="hasDiscount" id="code-has-discount" /> <span>Este código aplica un descuento</span></label>
            <small class="form__hint">Sin marcar, el código solo atribuye el referido al socio (sin descuento). No hace falta elegir tipo ni valor.</small>
          </div>
          <div class="form__group" data-discount-field hidden>
            <label class="form__label">Tipo de descuento</label>
            <select name="discountType" class="form__input">
              <option value="percent">Porcentaje (%)</option>
              <option value="fixed">Monto fijo ($)</option>
            </select>
          </div>
          <div class="form__group" data-discount-field hidden>
            <label class="form__label">Valor del descuento</label>
            <input type="number" name="discountValue" class="form__input" min="0" step="0.01" placeholder="Ej: 10" />
            <small class="form__error" data-error-for="discountValue"></small>
          </div>
          <div class="form__group">
            <label class="form__label">5 · Estado</label>
            <select name="status" class="form__input">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>

          <div class="form__alert form__group--full" id="code-alert" hidden></div>

          <div class="form__actions form__group--full">
            <button type="button" class="btn btn--ghost" id="cancel-create">Cancelar</button>
            <button type="submit" class="btn btn--primary">Crear código</button>
          </div>
        </form>
      </section>

      <!-- Busqueda + tabla. -->
      <section class="panel">
        <div class="table-toolbar">
          <input id="code-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar código o socio..." />
          <select id="status-filter" class="form__input table-toolbar__select">
            <option value="todos">Estado: todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="codes-count">${activeCount} activo(s) de ${codes.length}</span>
        </div>
        <div id="codes-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const createPanel = document.getElementById('create-panel');
    const toggleBtn = document.getElementById('toggle-create');
    const cancelBtn = document.getElementById('cancel-create');
    const form = document.getElementById('code-form');
    const alert = document.getElementById('code-alert');
    const filter = document.getElementById('status-filter');
    const searchInput = document.getElementById('code-search');
    const countLabel = document.getElementById('codes-count');
    const tableContainer = document.getElementById('codes-table');

    // Mostrar/ocultar el formulario.
    toggleBtn.addEventListener('click', () => {
      createPanel.hidden = !createPanel.hidden;
    });
    cancelBtn.addEventListener('click', () => {
      createPanel.hidden = true;
      form.reset();
      clearErrors();
      alert.hidden = true;
    });

    // Check "¿aplica descuento?": muestra/oculta tipo + valor. Si no está marcado,
    // el código es solo de atribución (sin descuento) y no se pide tipo/valor.
    const hasDiscountEl = document.getElementById('code-has-discount');
    const discountFields = form.querySelectorAll('[data-discount-field]');
    const syncDiscount = () => discountFields.forEach((el) => { el.hidden = !hasDiscountEl.checked; });
    hasDiscountEl?.addEventListener('change', syncDiscount);
    syncDiscount();

    // Crear codigo.
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors();
      alert.hidden = true;

      const code = codeService.normalize(form.code.value);
      const hasDiscount = hasDiscountEl.checked;
      const discountType = hasDiscount ? form.discountType.value : 'percent';
      const discountValue = hasDiscount ? (Number(form.discountValue.value) || 0) : 0;

      // Validacion en cliente. El descuento es OPCIONAL (check desmarcado = sin
      // descuento). Si SÍ aplica descuento, el valor debe ser > 0 y con tope válido.
      const errors = {};
      if (!code) errors.code = 'Escribe un código.';
      else if (cachedCodes.some((c) => c.code === code)) errors.code = 'Ese código ya existe.';
      if (hasDiscount) {
        if (!(discountValue > 0)) errors.discountValue = 'Indica el valor del descuento (o desmarca "aplica descuento").';
        else if (discountType === 'percent' && discountValue > 100) errors.discountValue = 'El porcentaje no puede superar 100.';
      }
      if (Object.keys(errors).length) return showFieldErrors(errors);

      // Socio (referido): "company:2" / "doctor:1" / "".
      let ownerType = '', ownerId = null, ownerName = '';
      const ownerRaw = form.owner.value;
      if (ownerRaw) {
        const [t, id] = ownerRaw.split(':');
        ownerType = t;
        ownerId = Number(id);
        const opt = form.owner.selectedOptions[0];
        ownerName = opt ? opt.textContent.trim() : '';
      }

      try {
        await codeService.create({ code, codeType: form.codeType.value, discountType, discountValue, ownerType, ownerId, ownerName, status: form.status.value });
        // Re-renderiza la vista para reflejar el nuevo codigo.
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        alert.textContent = `No se pudo crear el código: ${error.message}`;
        alert.hidden = false;
      }
    });

    // Buscador + filtro de estado: re-renderiza solo la tabla.
    function applyFilters() {
      const q = searchInput.value.trim().toLowerCase();
      const status = filter.value;
      const filtered = cachedCodes.filter((c) => {
        const haystack = [c.code, c.ownerName].join(' ').toLowerCase();
        const byText = !q || haystack.includes(q);
        const byStatus = status === 'todos' || c.status === status;
        return byText && byStatus;
      });
      const active = cachedCodes.filter((c) => c.status === 'active').length;
      countLabel.textContent = `${active} activo(s) de ${cachedCodes.length} · ${filtered.length} en vista`;
      tableContainer.innerHTML = CodeTable(filtered);
    }
    searchInput.addEventListener('input', applyFilters);
    filter.addEventListener('change', applyFilters);
    applyFilters();

    // Acciones de la tabla (activar/desactivar, borrar) por delegacion.
    tableContainer.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const code = cachedCodes.find((c) => String(c.id) === String(id));
      if (!code) return;

      if (action === 'toggle-code') {
        await codeService.toggleStatus(code);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } else if (action === 'delete-code') {
        if (!confirm(`¿Borrar el código "${code.code}"? Esta acción no se puede deshacer.`)) return;
        await codeService.remove(code.id);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });

    function showFieldErrors(errors) {
      Object.entries(errors).forEach(([field, message]) => {
        const el = form.querySelector(`[data-error-for="${field}"]`);
        if (el) el.textContent = message;
      });
    }
    function clearErrors() {
      form.querySelectorAll('.form__error').forEach((el) => (el.textContent = ''));
    }
  },
};
