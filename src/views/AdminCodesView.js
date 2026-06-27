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
    // Cargamos en paralelo: codigos + posibles socios (empresas y medicos).
    const [codes, companies, doctors] = await Promise.all([
      codeService.getAll().catch(() => []), // resiliente: si la colección Codes aún no existe, lista vacía
      companyService.getAll().catch(() => []),
      doctorService.getAll().catch(() => []),
    ]);
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
            <label class="form__label">Código *</label>
            <input type="text" name="code" class="form__input" placeholder="DRAVALEN10" autocomplete="off" style="text-transform:uppercase" />
            <small class="form__error" data-error-for="code"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Tipo de descuento *</label>
            <select name="discountType" class="form__input">
              <option value="percent">Porcentaje (%)</option>
              <option value="fixed">Monto fijo ($)</option>
            </select>
          </div>
          <div class="form__group">
            <label class="form__label">Valor del descuento *</label>
            <input type="number" name="discountValue" class="form__input" min="0" step="0.01" placeholder="10" />
            <small class="form__error" data-error-for="discountValue"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Socio (referido)</label>
            <select name="owner" class="form__input">
              <option value="">— Sin socio —</option>
              ${companyOptions ? `<optgroup label="Empresas">${companyOptions}</optgroup>` : ''}
              ${doctorOptions ? `<optgroup label="Médicos">${doctorOptions}</optgroup>` : ''}
            </select>
          </div>
          <div class="form__group">
            <label class="form__label">Estado</label>
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

    // Crear codigo.
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors();
      alert.hidden = true;

      const code = codeService.normalize(form.code.value);
      const discountType = form.discountType.value;
      const discountValue = Number(form.discountValue.value);

      // Validacion en cliente.
      const errors = {};
      if (!code) errors.code = 'Escribe un código.';
      else if (cachedCodes.some((c) => c.code === code)) errors.code = 'Ese código ya existe.';
      if (!discountValue || discountValue <= 0) errors.discountValue = 'Indica un valor mayor que 0.';
      else if (discountType === 'percent' && discountValue > 100) errors.discountValue = 'El porcentaje no puede superar 100.';
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
        await codeService.create({ code, discountType, discountValue, ownerType, ownerId, ownerName, status: form.status.value });
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
