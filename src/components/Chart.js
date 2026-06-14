/**
 * Chart.js
 * =============================================================================
 * PROPOSITO:
 *   Graficos ligeros e INTERACTIVOS (donut, barras horizontales y lineas)
 *   construidos con SVG/HTML puro, SIN librerias externas.
 *
 * INTERACTIVIDAD:
 *   - Tooltips: cada elemento marcado con [data-tip] muestra un tooltip
 *     flotante que sigue al cursor (sistema global registrado en main.js).
 *   - Hover: segmentos del donut se destacan y atenuan al resto, los puntos
 *     de la linea crecen, las filas de barras se iluminan (CSS puro).
 *   - Animaciones de entrada: trazo de la linea (pathLength), crecimiento de
 *     barras y aparicion del donut (CSS, 0.3-0.8s, respeta reduced-motion).
 *
 * POR QUE SIN LIBRERIAS:
 *   El prototipo debe poder replicarse en Wix Studio / Velo sin cargar
 *   dependencias pesadas. SVG + CSS funcionan en cualquier entorno HTML.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

/** Paleta compartida por todos los graficos (coherente con la marca). */
export const CHART_COLORS = [
  '#2f86ff', // azul brillante
  '#0f9d6e', // verde
  '#f0b90f', // dorado
  '#061953', // azul profundo
  '#14a8b8', // cian
  '#7c5cd6', // violeta
  '#d6453d', // rojo
  '#6b7787', // gris
];

/** Formato compacto para ejes: 12300000 -> "12,3M". */
export function compactNumber(value) {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace('.0', '').replace('.', ',')}M`;
  if (abs >= 1e3) return `${Math.round(value / 1e3)}k`;
  return String(Math.round(value));
}

/** Redondeo corto para coordenadas SVG (evita decimales eternos). */
const px = (n) => Math.round(n * 100) / 100;

/**
 * DonutChart()
 * Grafico de anillo interactivo: hover destaca el segmento y muestra tooltip,
 * la leyenda tambien dispara el tooltip de su segmento.
 *
 * @param {object} props
 * @param {Array<{label: string, value: number, color?: string}>} props.data
 * @param {string} [props.centerLabel]
 * @param {(v: number) => string} [props.formatValue]
 * @param {boolean} [props.showLegend=true] - Si es false, muestra solo el anillo
 *   flotante (la info se ve al pasar el cursor por cada segmento).
 */
export function DonutChart({ data = [], centerLabel = 'Total', formatValue = (v) => String(v), showLegend = true }) {
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return '<p class="empty-state">Sin datos para graficar.</p>';
  }

  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  const segments = items
    .map((d, i) => {
      const length = (d.value / total) * circumference;
      const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
      const percent = Math.round((d.value / total) * 100);
      const tip = `${d.label}: ${formatValue(d.value)} (${percent}%)`;
      const segment = `<circle class="donut-seg" cx="90" cy="90" r="${radius}" fill="none"
        stroke="${color}" stroke-width="30"
        stroke-dasharray="${px(Math.max(0, length - 1.5))} ${px(circumference - Math.max(0, length - 1.5))}"
        stroke-dashoffset="${px(-accumulated)}"
        data-tip="${escapeHtml(tip)}"></circle>`;
      accumulated += length;
      return segment;
    })
    .join('');

  const legend = items
    .map((d, i) => {
      const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
      const percent = Math.round((d.value / total) * 100);
      const tip = `${d.label}: ${formatValue(d.value)} (${percent}%)`;
      return `
        <li data-tip="${escapeHtml(tip)}">
          <span class="chart-legend__dot" style="background:${color}"></span>
          <span class="chart-legend__label">${escapeHtml(d.label)}</span>
          <span class="chart-legend__value">${escapeHtml(formatValue(d.value))} · ${percent}%</span>
        </li>
      `;
    })
    .join('');

  return `
    <div class="chart-donut ${showLegend ? '' : 'chart-donut--solo'}">
      <svg viewBox="0 0 180 180" class="chart-donut__svg" role="img" aria-label="${escapeHtml(centerLabel)}">
        <g class="chart-donut__ring" transform="rotate(-90 90 90)">${segments}</g>
        <text x="90" y="88" text-anchor="middle" class="chart-donut__total">${escapeHtml(formatValue(total))}</text>
        <text x="90" y="106" text-anchor="middle" class="chart-donut__caption">${escapeHtml(centerLabel)}</text>
      </svg>
      ${showLegend ? `<ul class="chart-legend">${legend}</ul>` : ''}
    </div>
  `;
}

/**
 * BarListChart()
 * Barras horizontales interactivas: la barra crece al cargar y cada fila
 * muestra tooltip con el porcentaje sobre el total.
 *
 * @param {object} props
 * @param {Array<{label: string, value: number, color?: string}>} props.data
 * @param {(v: number) => string} [props.formatValue]
 * @param {string} [props.color]
 */
export function BarListChart({ data = [], formatValue = (v) => String(v), color = '#1d6fd8' }) {
  if (!data.length || data.every((d) => d.value === 0)) {
    return '<p class="empty-state">Sin datos para graficar.</p>';
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const rows = data
    .map((d, i) => {
      const width = Math.max(2, Math.round((d.value / max) * 100));
      const percent = total > 0 ? Math.round((d.value / total) * 100) : 0;
      const tip = `${d.label}: ${formatValue(d.value)} (${percent}% del total)`;
      return `
        <div class="bar-list__row" data-tip="${escapeHtml(tip)}">
          <div class="bar-list__head">
            <span class="bar-list__label">${escapeHtml(d.label)}</span>
            <span class="bar-list__value">${escapeHtml(formatValue(d.value))}</span>
          </div>
          <div class="bar-list__track">
            <div class="bar-list__fill" style="width:${width}%;background:${d.color || color};animation-delay:${i * 70}ms"></div>
          </div>
        </div>
      `;
    })
    .join('');

  return `<div class="bar-list">${rows}</div>`;
}

/**
 * StackedBar()
 * Barra horizontal apilada que descompone un total en tramos consecutivos
 * (p. ej. costo base + margen CST + margen medico = valor final). Cada tramo
 * tiene tooltip y se acompana de una leyenda con su valor.
 *
 * Los segmentos exponen data-seg para poder actualizar sus anchos en vivo
 * (lo usa el editor de margen del medico). Si no se pasa total > 0 se muestra
 * un estado vacio.
 *
 * @param {object} props
 * @param {Array<{key?: string, label: string, value: number, color?: string}>} props.segments
 * @param {(v: number) => string} [props.formatValue]
 * @param {string} [props.emptyText]
 */
export function StackedBar({ segments = [], formatValue = (v) => String(v), emptyText = 'Cotizacion pendiente.' }) {
  const items = segments.filter((s) => s.value > 0);
  const total = items.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
  }

  const bars = items
    .map((s, i) => {
      const color = s.color || CHART_COLORS[i % CHART_COLORS.length];
      const percent = Math.round((s.value / total) * 100);
      const tip = `${s.label}: ${formatValue(s.value)} (${percent}%)`;
      return `<div class="stack-bar__seg" data-seg="${escapeHtml(s.key || s.label)}"
        style="width:${px((s.value / total) * 100)}%;background:${color}"
        data-tip="${escapeHtml(tip)}"></div>`;
    })
    .join('');

  const legend = items
    .map((s, i) => {
      const color = s.color || CHART_COLORS[i % CHART_COLORS.length];
      const percent = Math.round((s.value / total) * 100);
      return `
        <li>
          <span class="chart-legend__dot" style="background:${color}"></span>
          <span class="chart-legend__label">${escapeHtml(s.label)}</span>
          <span class="chart-legend__value">${escapeHtml(formatValue(s.value))} · ${percent}%</span>
        </li>
      `;
    })
    .join('');

  return `
    <div class="stack-bar">${bars}</div>
    <ul class="chart-legend chart-legend--stack">${legend}</ul>
  `;
}

/**
 * ColumnChart()
 * Barras VERTICALES estilo financiero (como el mockup de referencia): columnas
 * oscuras redondeadas, lineas guia punteadas con eje Y compacto y etiquetas
 * truncadas bajo cada columna. Tooltip con el valor exacto.
 *
 * @param {object} props
 * @param {Array<{label: string, value: number, color?: string}>} props.data
 * @param {(v: number) => string} [props.formatValue] - Tooltip/valores.
 * @param {string} [props.color] - Color de las columnas.
 */
export function ColumnChart({
  data = [],
  formatValue = (v) => String(v),
  color = '#10141c',
  keepZero = false,
}) {
  // Para series temporales (12 meses) queremos conservar las columnas en 0
  // y dibujar una linea base sutil que muestre el contexto del mes.
  const items = keepZero ? data : data.filter((d) => d.value > 0);
  if (!items.length || items.every((d) => (d.value || 0) <= 0 && !keepZero)) {
    return '<p class="empty-state">Sin datos para graficar.</p>';
  }

  const max = Math.max(...items.map((d) => d.value || 0), 1);

  const gridLines = [1, 0.75, 0.5, 0.25, 0]
    .map((level) => `
      <div class="column-chart__line" style="bottom:${level * 100}%">
        <span>${escapeHtml(compactNumber(max * level))}</span>
      </div>
    `)
    .join('');

  const bars = items
    .map((d, i) => {
      const value = d.value || 0;
      const isEmpty = value <= 0;
      const height = isEmpty ? 0 : Math.max(4, Math.round((value / max) * 100));
      const tip = `${d.label}: ${formatValue(value)}`;
      const barStyle = isEmpty
        ? `background:transparent;border-bottom:3px solid #e1e7f0;height:0;`
        : `height:${height}%;background:${d.color || color};animation-delay:${i * 60}ms`;
      return `
        <div class="column-chart__col ${isEmpty ? 'column-chart__col--empty' : ''}" data-tip="${escapeHtml(tip)}">
          ${isEmpty ? '' : `<span class="column-chart__value">${escapeHtml(formatValue(value))}</span>`}
          <span class="column-chart__bar" style="${barStyle}"></span>
          <small>${escapeHtml(d.label)}</small>
        </div>
      `;
    })
    .join('');

  return `
    <div class="column-chart">
      <div class="column-chart__plot">
        <div class="column-chart__grid">${gridLines}</div>
        <div class="column-chart__bars">${bars}</div>
      </div>
    </div>
  `;
}

/**
 * GaugeChart()
 * Medidor semicircular (estilo velocimetro) para comparar un valor logrado
 * contra una meta: porcentaje grande al centro y "logrado / meta" debajo.
 * El arco se anima al cargar y muestra tooltip con el detalle.
 *
 * @param {object} props
 * @param {number} props.value - Valor logrado.
 * @param {number} props.max   - Meta / valor proyectado.
 * @param {(v: number) => string} [props.formatValue]
 * @param {string} [props.color]
 */
export function GaugeChart({ value = 0, max = 0, formatValue = (v) => String(v), color = '#0f9d6e' }) {
  if (max <= 0) {
    return '<p class="empty-state">Sin meta proyectada todavia.</p>';
  }

  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const arc = 'M 22 96 A 68 68 0 0 1 158 96';
  const tip = `Logrado ${formatValue(value)} de ${formatValue(max)} (${pct}%)`;

  return `
    <div class="gauge" data-tip="${escapeHtml(tip)}">
      <svg viewBox="0 0 180 108" role="img" aria-label="${escapeHtml(tip)}">
        <path d="${arc}" fill="none" stroke="var(--gray-200)" stroke-width="17" stroke-linecap="round"></path>
        <path class="gauge__arc" d="${arc}" pathLength="1" fill="none" stroke="${color}"
          stroke-width="17" stroke-linecap="round"
          stroke-dasharray="1" style="stroke-dashoffset:${px(1 - pct / 100)}"></path>
        <text x="90" y="82" text-anchor="middle" class="gauge__percent">${pct}%</text>
      </svg>
      <p class="gauge__detail"><strong>${escapeHtml(formatValue(value))}</strong> / ${escapeHtml(formatValue(max))}</p>
    </div>
  `;
}

/**
 * SemiGaugeChart()
 * Medidor semicircular (180 grados) dividido en segmentos coloreados, con un
 * valor + etiqueta al centro y una lista compacta de filas (punto + nombre +
 * porcentaje) debajo. Pensado para "Mis casos por estado".
 *
 * @param {object} props
 * @param {Array<{label: string, value: number, color: string}>} props.segments
 * @param {string} [props.centerValue]
 * @param {string} [props.centerLabel]
 * @param {(v: number) => string} [props.formatValue]
 */
export function SemiGaugeChart({ segments = [], centerValue = '', centerLabel = '', formatValue = (v) => String(v) }) {
  const items = segments.filter((s) => s.value > 0);
  const total = items.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return '<p class="empty-state">Sin datos para graficar.</p>';
  }

  // Geometria del arco: semicircunferencia centrada en (cx, cy) con radio r.
  // Cada segmento se dibuja como su propio sub-arco, recortado en los bordes
  // internos por el radio de la punta redondeada (capAngle) para que los
  // remates de dos segmentos vecinos se toquen exactamente sin superponerse.
  const cx = 90;
  const cy = 89;
  const r = 76;
  const strokeWidth = 26;
  const capAngle = strokeWidth / 2 / r;

  const arcPoint = (t) => {
    const theta = Math.PI - t;
    return { x: cx + r * Math.cos(theta), y: cy - r * Math.sin(theta) };
  };
  const arcPath = (t1, t2) => {
    const p1 = arcPoint(t1);
    const p2 = arcPoint(t2);
    return `M ${px(p1.x)} ${px(p1.y)} A ${r} ${r} 0 0 1 ${px(p2.x)} ${px(p2.y)}`;
  };
  const fullArc = arcPath(0, Math.PI);

  const boundaries = [0];
  items.forEach((s) => {
    boundaries.push(boundaries[boundaries.length - 1] + (s.value / total) * Math.PI);
  });

  // Sin recortes en los bordes internos: cada segmento llega hasta el limite
  // exacto y su punta redondeada se solapa con el siguiente, que se dibuja
  // despues (y por lo tanto queda encima), logrando un arco visualmente
  // continuo donde cada color cubre la union con el anterior.
  const edgeExtend = capAngle;
  const paths = items
    .map((s, i) => {
      const start = i === 0 ? boundaries[0] - edgeExtend : boundaries[i];
      const end = i === items.length - 1 ? boundaries[i + 1] + edgeExtend : boundaries[i + 1];
      const percent = Math.round((s.value / total) * 100);
      const tip = `${s.label}: ${formatValue(s.value)} (${percent}%)`;
      if (end <= start) return '';
      return `<path class="semi-gauge__seg" d="${arcPath(start, end)}" fill="none" stroke="${s.color}"
        stroke-width="${strokeWidth}" stroke-linecap="round" pathLength="100"
        style="animation-delay:${i * 180}ms" data-tip="${escapeHtml(tip)}"></path>`;
    })
    .join('');

  const rows = items
    .map((s) => {
      const percent = Math.round((s.value / total) * 100);
      const tip = `${s.label}: ${formatValue(s.value)} (${percent}%)`;
      return `
        <li class="semi-gauge__row" data-tip="${escapeHtml(tip)}">
          <span class="semi-gauge__row-top">
            <span class="semi-gauge__dot" style="background:${s.color}"></span>
            <span class="semi-gauge__label">${escapeHtml(s.label)}</span>
          </span>
          <span class="semi-gauge__value">${percent}%</span>
        </li>
      `;
    })
    .join('');

  return `
    <div class="semi-gauge">
      <svg viewBox="0 0 180 134" class="semi-gauge__svg" role="img" aria-label="${escapeHtml(centerLabel)}">
        <path d="${fullArc}" fill="none" stroke="var(--gray-200)" stroke-width="${strokeWidth}" stroke-linecap="round"></path>
        ${paths}
        <text x="90" y="69" text-anchor="middle" class="semi-gauge__center-value">${escapeHtml(centerValue)}</text>
        <text x="90" y="89" text-anchor="middle" class="semi-gauge__center-label">${escapeHtml(centerLabel)}</text>
      </svg>
      <ul class="semi-gauge__list">${rows}</ul>
    </div>
  `;
}

/**
 * Convierte una lista de puntos [x,y] en un path SVG suavizado
 * (spline Catmull-Rom convertida a curvas Bezier cubicas).
 */
function smoothPath(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`;
  }
  const t = 1 / 6; // tension estandar Catmull-Rom -> Bezier
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = px(p1[0] + (p2[0] - p0[0]) * t);
    const c1y = px(p1[1] + (p2[1] - p0[1]) * t);
    const c2x = px(p2[0] - (p3[0] - p1[0]) * t);
    const c2y = px(p2[1] - (p3[1] - p1[1]) * t);
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/**
 * LineChart()
 * Lineas suavizadas con area degradada, animacion de trazo y puntos
 * interactivos con tooltip por serie.
 *
 * @param {object} props
 * @param {string[]} props.labels
 * @param {Array<{name: string, values: number[], color?: string}>} props.series
 * @param {(v: number) => string} [props.formatValue]
 * @param {string} [props.id] - Prefijo unico para los gradientes SVG.
 */
export function LineChart({ labels = [], series = [], formatValue = compactNumber, id = 'line' }) {
  const allValues = series.flatMap((s) => s.values);
  if (!labels.length || !allValues.length || allValues.every((v) => v === 0)) {
    return '<p class="empty-state">Sin datos para graficar.</p>';
  }

  const width = 640;
  const height = 240;
  const pad = { top: 18, right: 18, bottom: 30, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = Math.max(...allValues, 1);

  const xFor = (i) => px(labels.length === 1 ? pad.left + innerW / 2 : pad.left + (i / (labels.length - 1)) * innerW);
  const yFor = (v) => px(pad.top + innerH - (v / maxValue) * innerH);
  const baseline = pad.top + innerH;

  // Lineas guia horizontales (0%, 50%, 100% del maximo).
  const grid = [0, 0.5, 1]
    .map((level) => {
      const y = yFor(maxValue * level);
      return `
        <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid-line"></line>
        <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" class="chart-axis-text">${escapeHtml(formatValue(maxValue * level))}</text>
      `;
    })
    .join('');

  const xLabels = labels
    .map((label, i) => `<text x="${xFor(i)}" y="${height - 8}" text-anchor="middle" class="chart-axis-text">${escapeHtml(label)}</text>`)
    .join('');

  const defs = [];
  const layers = series
    .map((s, si) => {
      const color = s.color || CHART_COLORS[si % CHART_COLORS.length];
      const gradId = `${id}-grad-${si}`;
      defs.push(`
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.25"></stop>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
        </linearGradient>
      `);

      const points = s.values.map((v, i) => [xFor(i), yFor(v)]);
      const linePath = smoothPath(points);
      const areaPath = `${linePath} L ${points[points.length - 1][0]},${baseline} L ${points[0][0]},${baseline} Z`;

      // Punto visible + halo invisible mas grande como zona de hover.
      const dots = s.values
        .map((v, i) => {
          const tip = `${s.name} · ${labels[i]}: ${formatValue(v)}`;
          return `<circle class="line-dot" cx="${points[i][0]}" cy="${points[i][1]}" r="4"
            fill="${color}" stroke="#fff" stroke-width="1.5"
            data-tip="${escapeHtml(tip)}"></circle>`;
        })
        .join('');

      return `
        <path class="line-area" d="${areaPath}" fill="url(#${gradId})" style="animation-delay:${si * 150 + 350}ms"></path>
        <path class="line-stroke" d="${linePath}" pathLength="1" fill="none" stroke="${color}"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          style="animation-delay:${si * 150}ms"></path>
        <g class="line-dots" style="animation-delay:${si * 150 + 450}ms">${dots}</g>
      `;
    })
    .join('');

  const legend = series.length > 1
    ? `<ul class="chart-legend chart-legend--row">
        ${series
          .map((s, si) => `
            <li>
              <span class="chart-legend__dot" style="background:${s.color || CHART_COLORS[si % CHART_COLORS.length]}"></span>
              <span class="chart-legend__label">${escapeHtml(s.name)}</span>
            </li>
          `)
          .join('')}
      </ul>`
    : '';

  return `
    <div class="line-chart">
      ${legend}
      <svg viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">
        <defs>${defs.join('')}</defs>
        ${grid}
        ${layers}
        ${xLabels}
      </svg>
    </div>
  `;
}
