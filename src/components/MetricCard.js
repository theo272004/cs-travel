/**
 * MetricCard.js
 * =============================================================================
 * PROPOSITO:
 *   Tarjeta de KPI con icono en circulo coloreado, label, valor grande y
 *   (opcionalmente) un subtitulo de contexto y una tendencia.
 *
 * RESPONSABILIDAD:
 *   Devolver el HTML (string) de una "card" de metrica. Lo usan los dashboards
 *   de empresa, medico y administrador para mostrar costos, ahorro, retorno,
 *   conversion, etc.
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
 * @param {string} props.label          - Titulo/descripcion de la metrica.
 * @param {string} props.value          - Valor ya formateado (texto).
 * @param {string} [props.icon]         - Icono SVG (string) o emoji.
 * @param {string} [props.accent]       - "blue" | "green" | "amber" | "gray".
 * @param {string} [props.subtitle]     - Linea de contexto bajo el valor.
 * @param {string} [props.trend]        - Tendencia opcional (ej. "+9% vs mes anterior").
 * @param {"up"|"down"|"flat"} [props.trendDirection] - Direccion para colorear la tendencia.
 * @returns {string} HTML de la tarjeta.
 */
export function MetricCard({
  label,
  value,
  icon = '',
  accent = 'blue',
  subtitle = '',
  trend = '',
  trendDirection = 'up',
}) {
  const subtitleHtml = subtitle
    ? `<p class="metric-card__subtitle">${escapeHtml(subtitle)}</p>`
    : '';
  const trendArrow = trendDirection === 'down' ? '↓' : trendDirection === 'flat' ? '→' : '↑';
  const trendHtml = trend
    ? `<p class="metric-card__trend metric-card__trend--${escapeHtml(trendDirection)}">
        <span class="metric-card__trend-arrow">${trendArrow}</span> ${escapeHtml(trend)}
      </p>`
    : '';

  return `
    <article class="metric-card metric-card--${escapeHtml(accent)}">
      <header class="metric-card__head">
        <span class="metric-card__icon" aria-hidden="true">${icon}</span>
        <p class="metric-card__label">${escapeHtml(label)}</p>
      </header>
      <p class="metric-card__value">${escapeHtml(value)}</p>
      ${subtitleHtml}
      ${trendHtml}
    </article>
  `;
}
