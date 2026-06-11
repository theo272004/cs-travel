/**
 * RequestTable.js
 * =============================================================================
 * PROPOSITO:
 *   Tabla de solicitudes de viaje. Pensada para escritorio; en movil se hace
 *   scroll horizontal controlado (ver CSS .table-wrapper).
 *
 * RESPONSABILIDAD:
 *   Devolver el HTML de una tabla con las solicitudes recibidas. Cada fila
 *   enlaza al detalle (ruta segun rol, parametro detailBase).
 *
 * PARAMETROS:
 *   - requests   : array de solicitudes.
 *   - detailBase : prefijo de ruta al detalle ("#/admin/requests" | "#/company/requests").
 *   - showCompany: si true, muestra la columna "Empresa" (panel admin).
 *   - companiesMap: mapa { companyId: nombreEmpresa } para resolver el nombre.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { StatusBadge } from './StatusBadge.js';

export function RequestTable(requests, {
  detailBase,
  showCompany = false,
  companiesMap = {},
} = {}) {
  // Caso sin datos: mostramos un mensaje de estado vacio.
  if (!requests || requests.length === 0) {
    return `<p class="empty-state">No hay solicitudes para mostrar.</p>`;
  }

  // Encabezado: la columna "Empresa" es opcional (solo admin).
  const head = `
    <tr>
      <th>Codigo</th>
      ${showCompany ? '<th>Empresa</th>' : ''}
      <th>Tipo</th>
      <th>Ruta</th>
      <th>Fecha</th>
      <th>Personas</th>
      <th>Estado</th>
      <th>Costo estimado</th>
      <th>Ahorro</th>
    </tr>
  `;

  // Construimos una fila por cada solicitud.
  const rows = requests
    .map((r) => {
      const companyCell = showCompany
        ? `<td>${escapeHtml(companiesMap[r.companyId] || 'Empresa #' + r.companyId)}</td>`
        : '';

      return `
        <tr class="clickable-row" data-href="${detailBase}/${r.id}">
          <td><strong>${escapeHtml(r.requestCode)}</strong></td>
          ${companyCell}
          <td>${escapeHtml(r.requestType || 'paquete completo')}</td>
          <td>${escapeHtml(r.origin)} → ${escapeHtml(r.destination)}</td>
          <td>${formatDate(r.travelDate)}</td>
          <td>${escapeHtml(r.peopleCount)}</td>
          <td>${StatusBadge(r.status)}</td>
          <td>${formatCurrency(r.estimatedCost)}</td>
          <td class="text-green">${formatCurrency(r.estimatedSavings)}</td>
        </tr>
      `;
    })
    .join('');

  // .table-wrapper permite scroll horizontal en pantallas estrechas.
  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
