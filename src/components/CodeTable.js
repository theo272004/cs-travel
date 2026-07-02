/**
 * CodeTable.js
 * =============================================================================
 * PROPOSITO:
 *   Tabla de CODIGOS de referido/descuento para el panel administrativo.
 *
 * RESPONSABILIDAD:
 *   Devolver el HTML de una tabla: codigo, descuento, socio (referido), estado,
 *   usos y acciones (activar/desactivar, borrar).
 *
 * INTERACCION:
 *   Los botones usan data-action ("toggle-code" | "delete-code") + data-id;
 *   AdminCodesView delega el clic y llama al codeService.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { StatusBadge } from './StatusBadge.js';

/** Texto legible del descuento: "10%", "$50" o "Sin descuento" si es 0. */
function discountLabel(c) {
  if (!(Number(c.discountValue) > 0)) return 'Sin descuento';
  return c.discountType === 'fixed' ? formatCurrency(c.discountValue) : `${c.discountValue}%`;
}

/** Etiqueta del socio dueno del codigo (empresa/medico) o un guion si no tiene. */
function ownerLabel(c) {
  if (!c.ownerName) return '<span class="muted">—</span>';
  const tag = c.ownerType === 'company' ? 'Empresa' : c.ownerType === 'doctor' ? 'Médico' : '';
  return `${escapeHtml(c.ownerName)}${tag ? `<span class="muted-block">${tag}</span>` : ''}`;
}

export function CodeTable(codes) {
  if (!codes || codes.length === 0) {
    return `<p class="empty-state">Aún no hay códigos. Crea el primero con "+ Nuevo código".</p>`;
  }

  const rows = codes
    .map(
      (c) => `
      <tr>
        <td><span class="code-chip">${escapeHtml(c.code)}</span><span class="muted-block">${c.codeType === 'colaboradores' ? 'Colaboradores' : 'Clientes'}</span></td>
        <td><strong>${escapeHtml(discountLabel(c))}</strong></td>
        <td>${ownerLabel(c)}</td>
        <td>${StatusBadge(c.status)}</td>
        <td>
          <strong>${c.usageCount ?? c.uses ?? 0}</strong>
          ${(c.usageCount > 0) ? `<span class="muted-block">${c.closedCount || 0} vendida(s) · ${escapeHtml(formatCurrency(c.usedTotal || 0))}</span>` : ''}
        </td>
        <td>
          <div class="codes-actions">
            <button class="btn btn--ghost btn--sm" data-action="toggle-code" data-id="${c.id}">
              ${c.status === 'active' ? 'Desactivar' : 'Activar'}
            </button>
            <button class="btn btn--ghost btn--sm text-red" data-action="delete-code" data-id="${c.id}">Borrar</button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descuento</th>
            <th>Socio (referido)</th>
            <th>Estado</th>
            <th>Usos</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
