/**
 * AdminCompaniesView.js
 * =============================================================================
 * PROPOSITO:
 *   Gestion de EMPRESAS aliadas (rol admin): listar, filtrar por estado y crear
 *   nuevas empresas mediante un formulario desplegable.
 *
 * RESPONSABILIDADES:
 *   - render(): listar todas las empresas y preparar el formulario de creacion.
 *   - afterRender(): mostrar/ocultar el formulario, validar y crear la empresa,
 *     y filtrar la tabla por estado sin recargar.
 *
 * NAVEGACION:
 *   Cada fila de la tabla (CompanyTable) enlaza al detalle de la empresa
 *   (#/admin/companies/:id), gestionado por la delegacion de clics de main.js.
 * =============================================================================
 */

import { companyService } from '../services/companyService.js';
import { CompanyTable } from '../components/CompanyTable.js';
import { validateCompanyForm } from '../utils/validators.js';

// Cache de empresas para filtrar sin volver a pedir al backend.
let cachedCompanies = [];

export const AdminCompaniesView = {
  async render() {
    cachedCompanies = await companyService.getAll();

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Empresas aliadas</h1>
          <p class="page-subtitle">Administra las empresas con las que trabaja CS Travel.</p>
        </div>
        <button class="btn btn--primary" id="toggle-create">+ Nueva empresa</button>
      </div>

      <!-- Formulario de creacion (oculto hasta pulsar el boton). -->
      <section class="panel" id="create-panel" hidden>
        <h2 class="panel__title">Registrar nueva empresa</h2>
        <form id="company-form" class="form form--grid" novalidate>
          <div class="form__group">
            <label class="form__label">Nombre de la empresa *</label>
            <input type="text" name="name" class="form__input" />
            <small class="form__error" data-error-for="name"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Nombre de contacto *</label>
            <input type="text" name="contactName" class="form__input" />
            <small class="form__error" data-error-for="contactName"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Email *</label>
            <input type="email" name="email" class="form__input" />
            <small class="form__error" data-error-for="email"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Telefono *</label>
            <input type="text" name="phone" class="form__input" />
            <small class="form__error" data-error-for="phone"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Codigo compartido *</label>
            <input type="text" name="sharedCode" class="form__input" placeholder="CST-XXX-00" />
            <small class="form__error" data-error-for="sharedCode"></small>
          </div>
          <div class="form__group">
            <label class="form__label">Estado</label>
            <select name="status" class="form__input">
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </select>
          </div>

          <div class="form__alert form__group--full" id="company-alert" hidden></div>

          <div class="form__actions form__group--full">
            <button type="button" class="btn btn--ghost" id="cancel-create">Cancelar</button>
            <button type="submit" class="btn btn--primary">Crear empresa</button>
          </div>
        </form>
      </section>

      <!-- Busqueda + filtros. -->
      <section class="panel">
        <div class="table-toolbar">
          <input id="company-search" class="form__input table-toolbar__search" type="search"
            placeholder="Buscar nombre, contacto, correo o codigo..." />
          <select id="status-filter" class="form__input table-toolbar__select">
            <option value="todas">Estado: todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="companies-count"></span>
        </div>
        <div id="companies-table"></div>
      </section>
    `;
  },

  async afterRender() {
    const createPanel = document.getElementById('create-panel');
    const toggleBtn = document.getElementById('toggle-create');
    const cancelBtn = document.getElementById('cancel-create');
    const form = document.getElementById('company-form');
    const alert = document.getElementById('company-alert');
    const filter = document.getElementById('status-filter');
    const tableContainer = document.getElementById('companies-table');

    // Mostrar/ocultar el formulario de creacion.
    toggleBtn.addEventListener('click', () => {
      createPanel.hidden = !createPanel.hidden;
    });
    cancelBtn.addEventListener('click', () => {
      createPanel.hidden = true;
      form.reset();
      clearErrors();
    });

    // Crear empresa.
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors();
      alert.hidden = true;

      const data = {
        name: form.name.value.trim(),
        contactName: form.contactName.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        sharedCode: form.sharedCode.value.trim(),
        status: form.status.value,
      };

      // Validacion en cliente.
      const { isValid, errors } = validateCompanyForm(data);
      if (!isValid) {
        showFieldErrors(errors);
        return;
      }

      try {
        await companyService.create(data);
        // Recargamos la lista y la vista completa para reflejar el cambio.
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        alert.textContent = `No se pudo crear la empresa: ${error.message}`;
        alert.hidden = false;
      }
    });

    // Busqueda + filtro de estado combinados: re-renderiza solo la tabla.
    const searchInput = document.getElementById('company-search');
    const countLabel = document.getElementById('companies-count');

    function applyFilters() {
      const q = searchInput.value.trim().toLowerCase();
      const status = filter.value;
      const filtered = cachedCompanies.filter((c) => {
        const haystack = [c.name, c.contactName, c.email, c.sharedCode].join(' ').toLowerCase();
        const byText = !q || haystack.includes(q);
        const byStatus = status === 'todas' || c.status === status;
        return byText && byStatus;
      });
      countLabel.textContent = `${filtered.length} de ${cachedCompanies.length} empresa(s)`;
      tableContainer.innerHTML = CompanyTable(filtered);
    }

    searchInput.addEventListener('input', applyFilters);
    filter.addEventListener('change', applyFilters);
    applyFilters();

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
