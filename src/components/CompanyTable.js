/**
 * CompanyTable.js
 * =============================================================================
 * PROPOSITO:
 *   Tabla de empresas aliadas para el panel administrativo.
 *
 * RESPONSABILIDAD:
 *   Devolver el HTML de una tabla con las empresas: nombre, contacto, estado,
 *   codigo compartido y metricas resumidas. Cada fila enlaza al detalle.
 *
 * INTERACCION:
 *   Las filas tienen data-href; main.js delega el clic para navegar al detalle.
 *   El boton de activar/desactivar usa data-action para que la vista lo gestione.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { StatusBadge } from './StatusBadge.js';

/**
 * CompanyTable()
 * @param {Array} companies - Lista de empresas.
 * @returns {string} HTML de la tabla.
 */
export function CompanyTable(companies) {
  if (!companies || companies.length === 0) {
    return `<p class="empty-state">Aun no hay empresas registradas.</p>`;
  }

  const rows = companies
    .map(
      (c) => `
      <tr class="clickable-row" data-href="#/admin/companies/${c.id}">
        <td>
          <strong>${escapeHtml(c.name)}</strong>
          <span class="muted-block">${escapeHtml(c.sharedCode)}</span>
        </td>
        <td>
          ${escapeHtml(c.contactName)}
          <span class="muted-block">${escapeHtml(c.email)}</span>
        </td>
        <td>${StatusBadge(c.status)}</td>
        <td>${escapeHtml(c.totalRequests)}</td>
        <td>${formatCurrency(c.totalCost)}</td>
        <td class="text-green">${formatCurrency(c.estimatedSavings)}</td>
      </tr>
    `
    )
    .join('');

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Contacto</th>
            <th>Estado</th>
            <th>Solicitudes</th>
            <th>Costo total</th>
            <th>Ahorro estimado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
