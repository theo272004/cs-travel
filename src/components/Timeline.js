/**
 * Timeline.js
 * =============================================================================
 * Linea de tiempo (stepper) del FLUJO unificado de una operacion, compartida
 * por el detalle del caso (medico) y de la solicitud (empresa). Muestra en que
 * punto va: Enviado -> Cotizado -> Aprobado -> En gestion -> Finalizado, o el
 * bloque de "cancelada". Ver [[estados-operaciones-6]].
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

const STAGES = [
  { key: 'solicitud enviada', label: 'Enviado' },
  { key: 'cotizacion enviada', label: 'Cotizado' },
  { key: 'aprobada', label: 'Aprobado' },
  { key: 'en gestion', label: 'En gestión' },
  { key: 'finalizada', label: 'Finalizado' },
];

/**
 * renderTimeline()
 * @param {string} status - estado actual de la operacion.
 * @param {{ lostReason?: string }} opts - motivo si esta cancelada.
 */
export function renderTimeline(status, { lostReason = '' } = {}) {
  if (status === 'cancelada') {
    return `
      <section class="panel timeline-panel">
        <div class="timeline-cancelled">
          <span class="timeline-cancelled__dot" aria-hidden="true">✕</span>
          <div>
            <strong>Operación cancelada</strong>
            ${lostReason ? `<span class="muted">${escapeHtml(lostReason)}</span>` : ''}
          </div>
        </div>
      </section>
    `;
  }

  const found = STAGES.findIndex((s) => s.key === status);
  const idx = found === -1 ? 0 : found;

  return `
    <section class="panel timeline-panel">
      <ol class="timeline">
        ${STAGES.map((s, i) => {
          const state = i < idx ? 'is-done' : i === idx ? 'is-current' : '';
          const mark = i < idx ? '✓' : String(i + 1);
          return `
            <li class="timeline__step ${state}">
              <span class="timeline__dot">${mark}</span>
              <span class="timeline__label">${s.label}</span>
            </li>
          `;
        }).join('')}
      </ol>
    </section>
  `;
}
