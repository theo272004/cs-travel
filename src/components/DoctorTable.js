import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { StatusBadge } from './StatusBadge.js';

export function DoctorTable(doctors) {
  if (!doctors || doctors.length === 0) {
    return `<p class="empty-state">Aun no hay medicos o clinicas registradas.</p>`;
  }

  const rows = doctors
    .map(
      (doctor) => `
        <tr class="clickable-row" data-href="#/admin/doctors/${doctor.id}">
          <td>
            <strong>${escapeHtml(doctor.name)}</strong>
            <span class="muted-block">${escapeHtml(doctor.clinicName)}</span>
          </td>
          <td>
            ${escapeHtml(doctor.specialty)}
            <span class="muted-block">${escapeHtml(doctor.email)}</span>
          </td>
          <td>${StatusBadge(doctor.status)}</td>
          <td>${escapeHtml(doctor.totalCases)}</td>
          <td>${escapeHtml(doctor.activeCases)}</td>
          <td>${formatCurrency(doctor.estimatedLogistics)}</td>
          <td class="text-amber">${formatCurrency(doctor.estimatedMargin)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Medico / Clinica</th>
            <th>Especialidad</th>
            <th>Estado</th>
            <th>Casos</th>
            <th>Activos</th>
            <th>Logistica estimada</th>
            <th>Margen estimado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
