/**
 * CompanyRequestsView.js
 * =============================================================================
 * PROPOSITO:
 *   Listado completo de las solicitudes de la EMPRESA logueada, con un filtro
 *   por estado y una vista en tabla (escritorio) y cards (movil, via CSS).
 *
 * RESPONSABILIDADES:
 *   - render(): cargar y mostrar SOLO las solicitudes de la propia empresa.
 *   - afterRender(): manejar el filtro por estado sin recargar la pagina.
 *
 * AISLAMIENTO:
 *   companyId proviene de la sesion; nunca se listan solicitudes de otras empresas.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { requestService, STATUSES } from '../services/requestService.js';
import { RequestTable } from '../components/RequestTable.js';
import { RequestCard } from '../components/RequestCard.js';

// Guardamos las solicitudes cargadas para poder filtrar sin volver a pedirlas.
let cachedRequests = [];

export const CompanyRequestsView = {
  async render() {
    const companyId = authService.getCompanyId();

    // Cargamos las solicitudes de esta empresa y las guardamos en cache.
    cachedRequests = await requestService.getByCompany(companyId);

    // Opciones del filtro por estado: "todas" + cada estado del catalogo.
    const statusOptions = ['todas', ...STATUSES]
      .map((s) => `<option value="${s}">${s === 'todas' ? 'Todos los estados' : s}</option>`)
      .join('');

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Mis solicitudes</h1>
          <p class="page-subtitle">Consulta el estado de tus viajes corporativos.</p>
        </div>
        <button type="button" class="btn btn--primary" data-action="open-quick-create">+ Nueva solicitud</button>
      </div>

      <!-- Barra de busqueda y filtros. -->
      <section class="toolbar">
        <input id="request-search" class="form__input table-toolbar__search" type="search"
          placeholder="Buscar codigo, origen o destino..." />
        <select id="status-filter" class="form__input table-toolbar__select">${statusOptions}</select>
        <div class="table-toolbar__spacer"></div>
        <span class="table-toolbar__count" id="requests-count"></span>
      </section>

      <!-- Tabla (visible en pantallas medianas/grandes). -->
      <section class="panel only-desktop" id="requests-table">
        ${RequestTable(cachedRequests, { detailBase: '#/company/requests' })}
      </section>

      <!-- Cards apiladas (visible en movil). -->
      <section class="cards-grid only-mobile" id="requests-cards">
        ${renderCards(cachedRequests)}
      </section>
    `;
  },

  async afterRender() {
    const filter = document.getElementById('status-filter');
    const search = document.getElementById('request-search');
    const countLabel = document.getElementById('requests-count');

    // Busqueda + estado combinados: re-renderizamos tabla y cards.
    const applyFilters = () => {
      const q = search.value.trim().toLowerCase();
      const value = filter.value;
      const filtered = cachedRequests.filter((r) => {
        const haystack = [r.requestCode, r.origin, r.destination, r.requestType].join(' ').toLowerCase();
        const byText = !q || haystack.includes(q);
        const byStatus = value === 'todas' || r.status === value;
        return byText && byStatus;
      });

      countLabel.textContent = `${filtered.length} de ${cachedRequests.length} solicitud(es)`;
      document.getElementById('requests-table').innerHTML = RequestTable(filtered, {
        detailBase: '#/company/requests',
      });
      document.getElementById('requests-cards').innerHTML = renderCards(filtered);
    };

    search.addEventListener('input', applyFilters);
    filter.addEventListener('change', applyFilters);
    applyFilters();
  },
};

/** Helper: arma el HTML de las cards o un estado vacio. */
function renderCards(requests) {
  if (!requests || requests.length === 0) {
    return `<p class="empty-state">No hay solicitudes para mostrar.</p>`;
  }
  return requests.map((r) => RequestCard(r, '#/company/requests')).join('');
}
