import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { StatusBadge } from './StatusBadge.js';

// Paleta deterministica para los avatares (mismo nombre → mismo color).
const AVATAR_PALETTE = [
  { bg: 'rgba(29,111,216,0.12)', color: '#1456a0' },
  { bg: 'rgba(15,157,110,0.14)', color: '#0f9d6e' },
  { bg: 'rgba(240,185,15,0.18)', color: '#b8870f' },
  { bg: 'rgba(214,69,61,0.12)', color: '#c0392d' },
  { bg: 'rgba(124,92,214,0.14)', color: '#7c5cd6' },
  { bg: 'rgba(20,168,184,0.14)', color: '#0e8694' },
];

function pickAvatar(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '·';
}

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
      const palette = pickAvatar(item.patientName);
      const avatar = `
        <span class="patient-avatar" style="background:${palette.bg};color:${palette.color}">
          ${escapeHtml(initials(item.patientName))}
        </span>`;

      return `
        <tr class="clickable-row" data-href="${detailBase}/${item.id}">
          <td><strong>${escapeHtml(item.caseCode)}</strong></td>
          ${doctorCell}
          <td>
            <div class="patient-cell">
              ${avatar}
              <div>
                <strong>${escapeHtml(item.patientName)}</strong>
                <span class="muted-block">${escapeHtml(item.procedure)}</span>
              </div>
            </div>
          </td>
          <td>${escapeHtml(item.origin)} → ${escapeHtml(item.destination)}</td>
          <td>${formatDate(item.travelDate)}</td>
          <td>${StatusBadge(item.status)}</td>
          <td><strong>${formatCurrency(item.finalPatientValue)}</strong></td>
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
