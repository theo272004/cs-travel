import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { StatusBadge } from './StatusBadge.js';
import { isInternalCase } from '../services/medicalCaseService.js';

// Paleta deterministica para los avatares (mismo nombre → mismo color).
const AVATAR_PALETTE = [
  { bg: 'rgba(29,111,216,0.12)', color: '#1456a0' },
  { bg: 'rgba(0, 88, 193, 0.14)', color: '#0058c1' },
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
    return `<p class="empty-state">No hay casos médicos para mostrar.</p>`;
  }

  const rows = cases
    .map((item) => {
      const doctorCell = showDoctor
        ? `<td>${escapeHtml(doctorsMap[item.doctorId] || 'Médico #' + item.doctorId)}</td>`
        : '';
      const displayName = item.patientName || (isInternalCase(item) ? 'Solicitud interna' : '—');
      const palette = pickAvatar(displayName);
      const avatar = `
        <span class="patient-avatar" style="background:${palette.bg};color:${palette.color}">
          ${escapeHtml(initials(displayName))}
        </span>`;
      const internalTag = isInternalCase(item) ? ' <span class="tag-internal">Interna</span>' : '';

      return `
        <tr class="clickable-row" data-href="${detailBase}/${item.id}">
          <td><strong>${escapeHtml(item.caseCode)}</strong></td>
          ${doctorCell}
          <td>
            <div class="patient-cell">
              ${avatar}
              <div>
                <strong>${escapeHtml(displayName)}${internalTag}</strong>
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
            <th>Código</th>
            ${showDoctor ? '<th>Médico</th>' : ''}
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
    <div class="case-cards">${cases.map((item) => caseCard(item, detailBase, showDoctor ? doctorsMap[item.doctorId] : '')).join('')}</div>
  `;
}

// Proximo paso en una frase, para la tarjeta del celular (vista del medico).
const CASE_NEXT = {
  'solicitud enviada': ['wait', 'CS Travel Group prepara la cotización'],
  aprobada: ['action', 'Te toca: pagar para poner en marcha el viaje'],
  'en gestion': ['wait', 'CS Travel Group gestiona el viaje'],
};

/** Tarjeta de un caso para pantallas angostas (la tabla no cabe). */
function caseCard(item, detailBase, doctorName) {
  const name = item.patientName || (isInternalCase(item) ? 'Solicitud interna' : '—');
  let next = CASE_NEXT[item.status];
  if (item.status === 'cotizacion enviada') {
    next = (item.doctorMargin || 0) > 0 ? ['wait', 'Esperando que el paciente apruebe'] : ['action', 'Te toca: fijar tu margen'];
  }
  const value = Number(item.finalPatientValue) > 0 ? formatCurrency(item.finalPatientValue) : 'Por cotizar';
  return `
    <a href="${detailBase}/${item.id}" class="request-card case-card">
      <div class="request-card__top">
        <span class="request-card__code">${escapeHtml(item.caseCode)}</span>
        ${StatusBadge(item.status)}
      </div>
      <h3 class="request-card__route">${escapeHtml(name)}</h3>
      <p class="case-card__proc">${escapeHtml(item.procedure || '')}${doctorName ? ` · ${escapeHtml(doctorName)}` : ''}</p>
      <div class="request-card__meta">
        <span>${escapeHtml(item.origin || '')} → ${escapeHtml(item.destination || '')}</span>
        <span>${formatDate(item.travelDate)}</span>
      </div>
      <div class="request-card__cost">
        <span class="request-card__cost-label">Valor final</span>
        <span class="request-card__cost-value">${value}</span>
      </div>
      ${next ? `<p class="request-card__next request-card__next--${next[0]}">${next[1]}</p>` : ''}
    </a>`;
}
