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
        <a class="btn btn--primary" href="#/admin/users">+ Nueva empresa (desde Usuarios)</a>
      </div>

      <!-- Las empresas ya NO se crean aquí sueltas: se crean al dar de alta un
           usuario de tipo empresa (así nunca queda una empresa sin cuenta). -->
      <p class="muted" style="margin:-6px 0 14px;">
        Las empresas se crean al registrar un <strong>usuario de tipo empresa</strong>
        en <a href="#/admin/users">Usuarios</a>. Así cada empresa tiene siempre su cuenta.
      </p>

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
    const filter = document.getElementById('status-filter');
    const tableContainer = document.getElementById('companies-table');
    const searchInput = document.getElementById('company-search');
    const countLabel = document.getElementById('companies-count');

    // Busqueda + filtro de estado combinados: re-renderiza solo la tabla.
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
  },
};
