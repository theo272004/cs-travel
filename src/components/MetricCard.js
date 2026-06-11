/**
 * MetricCard.js
 * =============================================================================
 * PROPOSITO:
 *   Componente visual reutilizable que muestra una metrica destacada (KPI)
 *   dentro de una tarjeta: un titulo, un valor grande y un icono opcional.
 *
 * RESPONSABILIDAD:
 *   Devolver el HTML (string) de una "card" de metrica. Lo usan los dashboards
 *   de empresa y de administrador para mostrar costos, ahorro, retorno, etc.
 *
 * PATRON DE COMPONENTE:
 *   En esta SPA sin frameworks, un "componente" es simplemente una funcion que
 *   recibe datos (props) y devuelve un string de HTML. Las vistas concatenan
 *   estos strings y los inyectan en el DOM.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

/**
 * MetricCard()
 * @param {object} props
 * @param {string} props.label   - Titulo/descripcion de la metrica.
 * @param {string} props.value   - Valor ya formateado (texto).
 * @param {string} [props.icon]  - Emoji/icono opcional.
 * @param {string} [props.accent]- Variante de color: "blue"|"green"|"amber"|"gray".
 * @returns {string} HTML de la tarjeta.
 */
export function MetricCard({ label, value, icon = '', accent = 'blue' }) {
  return `
    <article class="metric-card metric-card--${escapeHtml(accent)}">
      <div class="metric-card__icon">${escapeHtml(icon)}</div>
      <div class="metric-card__body">
        <p class="metric-card__label">${escapeHtml(label)}</p>
        <p class="metric-card__value">${escapeHtml(value)}</p>
      </div>
    </article>
  `;
}
