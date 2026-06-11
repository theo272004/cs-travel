import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { StatusBadge } from './StatusBadge.js';

export function MedicalCaseTable(cases, {
  detailBase,
  showDoctor = false,
  doctorsMap = {},
} = {}) {
  if (!cases || cases.length === 0) {
    return `<p class="empty-state">No hay casos medicos para mostrar.</p>`;
  }

  const rows = cases
    .map((item) => {
      const doctorCell = showDoctor
        ? `<td>${escapeHtml(doctorsMap[item.doctorId] || 'Medico #' + item.doctorId)}</td>`
        : '';

      return `
        <tr class="clickable-row" data-href="${detailBase}/${item.id}">
          <td><strong>${escapeHtml(item.caseCode)}</strong></td>
          ${doctorCell}
          <td>
            ${escapeHtml(item.patientName)}
            <span class="muted-block">${escapeHtml(item.procedure)}</span>
          </td>
          <td>${escapeHtml(item.origin)} → ${escapeHtml(item.destination)}</td>
          <td>${formatDate(item.travelDate)}</td>
          <td>${StatusBadge(item.status)}</td>
          <td>${formatCurrency(item.finalPatientValue)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Codigo</th>
            ${showDoctor ? '<th>Medico</th>' : ''}
            <th>Paciente / Procedimiento</th>
            <th>Ruta</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Valor final</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
