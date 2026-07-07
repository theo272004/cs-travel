/**
 * AlliedValue.js
 * =============================================================================
 * Modelo "CS Allied Value Partnership" para el dashboard de EMPRESAS.
 *   Módulo 1: Analítica de retornos (gráfico tendencia + drill-down por día,
 *             retorno neto escalonado 25-40% sobre la UNC, comparativa de mercado).
 *   Módulo 2: Tracking en vivo de clientes referidos por el aliado.
 *
 * Modelo financiero (Anexo A del contrato):
 *   UNC (Utilidad Neta de la Operación) = comisión bruta
 *        − IVA (19% sobre la comisión)
 *        − costo de pasarela de pago (2.9% sobre la venta)
 *        − costos operativos (10% sobre la comisión).
 *   Retorno del aliado = UNC × % de tramo, según volumen NETO QUINCENAL:
 *     Inicial ≤ $20M → 25% · Plata $20-55M → 30% · Oro $55-120M → 35% · Platino +$120M → 40%.
 *
 * NOTA: datos demo deterministas (como el portal médico). En producción se
 *       cargarán por ID de empresa desde Wix; los % y costos son configurables.
 * =============================================================================
 */

import { formatCurrency, formatWithUsd } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { ColumnChart } from './Chart.js';
import { infoBtn } from './InfoModal.js';
import { payHref, payTargetAttrs } from '../utils/payLink.js';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Parámetros del modelo (configurables por empresa en producción).
const IVA_RATE = 0.19;       // sobre la comisión bruta
const GATEWAY_RATE = 0.029;  // sobre el valor de venta
const OPS_RATE = 0.10;       // sobre la comisión bruta

// Tramos de retorno por volumen NETO QUINCENAL (COP).
export const TIERS = [
  { key: 'inicial', name: 'Inicial', pct: 0.25, max: 20_000_000, color: '#0a2d66' },
  { key: 'plata', name: 'Plata', pct: 0.30, max: 55_000_000, color: '#6b7787' },
  { key: 'oro', name: 'Oro', pct: 0.35, max: 120_000_000, color: '#c77700' },
  { key: 'platino', name: 'Platino', pct: 0.40, max: Infinity, color: '#5b4bd8' },
];

function tierForVolume(volume) {
  return TIERS.find((t) => volume <= t.max) || TIERS[TIERS.length - 1];
}

// Catálogo de servicios y estados de la operación (100% CS).
const SERVICE_LABELS = {
  vuelos: 'Vuelos',
  alojamientos: 'Alojamientos',
  cruceros: 'Cruceros',
  autos: 'Alquiler de vehículos',
  traslados: 'Traslados',
  parques: 'Parques temáticos',
  seguros: 'Seguros',
};
// Estados que ya generan retorno liquidable (confirmada/liquidada). El estado
// del referido manual (aprobado/finalizado) se mapea a estos en `refsToTxns`.
const EARNED_STATUSES = ['confirmada', 'liquidada'];

/** Utilidad Neta de la Operación de una transacción. */
function unc(t) {
  const iva = t.commission * IVA_RATE;
  const gateway = t.sale * GATEWAY_RATE;
  const ops = t.commission * OPS_RATE;
  return Math.max(0, Math.round(t.commission - iva - gateway - ops));
}

/** Nombre cifrado para privacidad: "María Restrepo" -> "M•••• R.". */
function maskName(name) {
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts[1] || '';
  return `${first[0] || ''}${'•'.repeat(Math.max(3, first.length - 1))} ${last[0] ? last[0] + '.' : ''}`.trim();
}

/** Volumen neto (suma de UNC) de la quincena en curso, para definir el tramo. */
// Mapea el estado de gestión manual del referido (lo que registra el dueño) al
// estado de "transacción" que entiende la analítica de retornos.
const REF_STATUS_TO_TXN = {
  escribio: 'cotizacion',
  cotizo: 'propuesta',
  aprobado: 'confirmada',
  finalizado: 'liquidada',
};

/**
 * Convierte los referidos REALES (registrados a mano por el dueño) en el formato
 * de transacción que consume la analítica. `amount` = valor del servicio (venta);
 * `commissionPct` = % de comisión bruta de CST. Así el dashboard de retornos se
 * alimenta de datos reales, no de un demo. Sin referidos, devuelve [] (retorno $0).
 */
function refsToTxns(refs) {
  return (refs || []).map((r) => {
    const sale = Number(r.amount) || 0;
    const pct = Number(r.commissionPct) || 0;
    return {
      id: r.id,
      client: r.name || 'Referido',
      code: '',
      service: 'referido',
      status: REF_STATUS_TO_TXN[r.status] || 'cotizacion',
      date: r.date || new Date().toISOString().slice(0, 10),
      sale,
      commission: Math.round(sale * pct / 100),
    };
  });
}

function currentQuincenaVolume(txns) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const half = now.getDate() <= 15 ? 'a' : 'b';
  return (txns || []).filter((t) => {
    const d = new Date(t.date);
    if (d.getFullYear() !== y || d.getMonth() !== m) return false;
    return (d.getDate() <= 15 ? 'a' : 'b') === half;
  }).reduce((s, t) => s + unc(t), 0);
}

// Color de las barras (idéntico al gráfico "Ganancias por periodo" de médicos).
const RETURNS_COLOR = '#0058c1';

// Estado del gráfico de retornos: modo activo (mensual/diario/anual), grupos por
// período para el drill-down (misma etiqueta que dibuja el gráfico) y caches de
// las transacciones + % del tramo para reconstruirlo al cambiar de rango. Mismo
// patrón que el gráfico "Ganancias por periodo" del panel de médicos.
let returnsMode = 'monthly';
let returnsGroupsCache = {};
let returnsTxnsCache = [];
let returnsPctCache = 0;

/** Retorno del aliado de una transacción según su tramo (UNC × %). */
const returnOf = (t, pct) => Math.round(unc(t) * pct);

/**
 * Parseo tolerante de la fecha de una transacción. Una fecha "solo fecha"
 * (YYYY-MM-DD) se ancla al mediodía LOCAL para que la zona horaria no la corra
 * un día (en Colombia, UTC-5, "2026-05-22" caía en el día 21). Igual criterio
 * que la tabla de seguimiento. Las fechas con hora se respetan tal cual.
 */
function txnDate(value) {
  const s = String(value || '');
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
}

/**
 * Datos del gráfico de retornos por período (mensual del año / diario del mes
 * actual / anual histórico). Espeja `buildGeneratedData` del panel de médicos.
 */
function buildReturnsData(txns, pct, mode = 'monthly') {
  const earned = (txns || []).filter((t) => EARNED_STATUSES.includes(t.status));
  const now = new Date();
  const year = now.getFullYear();

  if (mode === 'annual') {
    if (!earned.length) return [];
    return Object.entries(earned.reduce((acc, t) => {
      const y = String(txnDate(t.date).getFullYear());
      acc[y] = (acc[y] || 0) + returnOf(t, pct);
      return acc;
    }, {}))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([label, value]) => ({ label, value, color: RETURNS_COLOR }));
  }

  if (mode === 'daily') {
    const month = now.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const totals = Array.from({ length: days }, () => 0);
    earned.forEach((t) => {
      const d = txnDate(t.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        totals[d.getDate() - 1] += returnOf(t, pct);
      }
    });
    return totals.map((value, i) => ({ label: String(i + 1), value, color: RETURNS_COLOR }));
  }

  const totals = Array.from({ length: 12 }, () => 0);
  earned.forEach((t) => {
    const d = txnDate(t.date);
    if (d.getFullYear() === year) totals[d.getMonth()] += returnOf(t, pct);
  });
  return totals.map((value, i) => ({ label: MONTH_LABELS[i], value, color: RETURNS_COLOR }));
}

/**
 * Agrupa las transacciones por período usando la MISMA etiqueta que dibuja el
 * gráfico, para que al tocar una barra se encuentre su grupo por el texto. Cada
 * grupo trae sus operaciones + el retorno total. Espeja `buildPeriodGroups`.
 */
function buildReturnsGroups(txns, pct, mode = 'monthly') {
  const earned = (txns || []).filter((t) => EARNED_STATUSES.includes(t.status));
  const now = new Date();
  const year = now.getFullYear();
  const groups = {};
  earned.forEach((t) => {
    const d = txnDate(t.date);
    let key = null;
    if (mode === 'annual') {
      key = String(d.getFullYear());
    } else if (mode === 'daily') {
      if (d.getFullYear() === year && d.getMonth() === now.getMonth()) key = String(d.getDate());
    } else if (d.getFullYear() === year) {
      key = MONTH_LABELS[d.getMonth()];
    }
    if (key == null) return;
    if (!groups[key]) groups[key] = { txns: [], total: 0 };
    groups[key].txns.push({
      day: d.getDate(),
      month: d.getMonth(),
      client: maskName(t.client),
      service: SERVICE_LABELS[t.service] || t.service,
      ret: returnOf(t, pct),
      sale: t.sale,
    });
    groups[key].total += returnOf(t, pct);
  });
  return groups;
}

/** Título legible del período según el modo y la etiqueta de la barra. */
function returnsPeriodTitle(label, mode) {
  const year = new Date().getFullYear();
  if (mode === 'annual') return `Año ${label}`;
  if (mode === 'daily') return `${label} de ${MONTH_FULL[new Date().getMonth()]}, ${year}`;
  const idx = MONTH_LABELS.indexOf(label);
  return `${idx >= 0 ? MONTH_FULL[idx] : label} ${year}`;
}

/* ===========================================================================
 * MÓDULO 1 — Analítica de retornos
 * ======================================================================== */
export function renderReturnsAnalytics(refs = [], company = null) {
  // Datos REALES: las transacciones salen de los referidos que el dueño registró
  // a mano (no de un demo). Sin referidos aún, todo da $0 y se marca como ejemplo.
  const txns = refsToTxns(refs);
  const tier = tierForVolume(currentQuincenaVolume(txns));
  const earned = txns.filter((t) => EARNED_STATUSES.includes(t.status));

  const grossTotal = earned.reduce((s, t) => s + t.commission, 0);
  const uncTotal = earned.reduce((s, t) => s + unc(t), 0);
  const ivaTotal = earned.reduce((s, t) => s + t.commission * IVA_RATE, 0);
  const gatewayTotal = earned.reduce((s, t) => s + t.sale * GATEWAY_RATE, 0);
  const opsTotal = earned.reduce((s, t) => s + t.commission * OPS_RATE, 0);
  const returnTotal = Math.round(uncTotal * tier.pct);

  // Comparativa de mercado: lo que la comunidad habría pagado en OTAs vs CST.
  const cstSales = earned.reduce((s, t) => s + t.sale, 0);
  const otaSales = Math.round(cstSales * 1.18); // ~18% más caro en canales públicos
  const communitySavings = otaSales - cstSales;
  const savingsPct = otaSales > 0 ? Math.round((communitySavings / otaSales) * 100) : 0;
  const cstBarPct = otaSales > 0 ? Math.max(8, Math.round((cstSales / otaSales) * 100)) : 0;

  // Estado inicial del gráfico de retornos (modo mensual) + caches para poder
  // reconstruirlo al cambiar de rango en bindReturnsAnalytics.
  returnsTxnsCache = txns;
  returnsPctCache = tier.pct;
  returnsMode = 'monthly';
  returnsGroupsCache = buildReturnsGroups(txns, tier.pct, 'monthly');

  const tierIdx = TIERS.findIndex((t) => t.key === tier.key);
  const ladder = TIERS.map((t, i) => {
    const state = i < tierIdx ? 'is-done' : i === tierIdx ? 'is-active' : 'is-pending';
    return `<div class="tier-step ${state}">${Math.round(t.pct * 100)}% ${t.name}</div>`;
  }).join('');

  // Números REALES de la operación PROPIA de la empresa (sus solicitudes),
  // calculados aparte del programa de referidos. Etapa 1 del contrato.
  const opCost = Number(company?.totalCost) || 0;
  const opSavings = Number(company?.estimatedSavings) || 0;
  const opReturn = Number(company?.estimatedReturn) || 0;
  const opStrip = company ? `
      <div class="av-op-strip">
        <div class="av-op-strip__item">
          <span class="av-op-strip__lbl">Costo gestionado con CS Travel</span>
          <strong>${formatWithUsd(opCost)}</strong>
        </div>
        <div class="av-op-strip__item">
          <span class="av-op-strip__lbl">Ahorro estimado de tu operación</span>
          <strong class="text-green">${formatWithUsd(opSavings)}</strong>
        </div>
        <div class="av-op-strip__item">
          <span class="av-op-strip__lbl">Retorno de tu operación</span>
          <strong class="text-green">${formatWithUsd(opReturn)}</strong>
        </div>
      </div>` : '';

  return `
    <section class="av-analytics">
      ${opStrip}
      <div class="av-top-grid">
        <div class="av-hero av-hero--solo">
          <div class="av-hero__main">
            <span class="av-hero__label">
              Ganancia por referidos · retorno neto
              ${infoBtn({ target: '#av-formula-detail', title: 'Cómo se calcula tu retorno' })}
            </span>
            <strong class="av-hero__value">${formatWithUsd(returnTotal)}</strong>
            <span class="av-hero__tier">
              <span class="av-hero__tier-dot" style="background:${tier.color}"></span>
              Tramo <b>${tier.name}</b> · ${Math.round(tier.pct * 100)}% sobre la utilidad neta
            </span>
          </div>
        </div>

        <div class="av-tiers">
          <span class="av-tiers__label">Tu escalón de retorno (por volumen quincenal)</span>
          <div class="av-tiers__ladder">${ladder}</div>
        </div>
      </div>

      <!-- Desglose oculto: se muestra al tocar el "?" del retorno. -->
      <div id="av-formula-detail" hidden>
        <p>Tu retorno se calcula sobre la <b>Utilidad Neta de la Operación (UNC)</b>, no sobre la venta bruta:</p>
        <ul class="av-formula__list">
          <li><span>Comisión bruta</span><b>${formatCurrency(Math.round(grossTotal))}</b></li>
          <li class="is-sub"><span>− IVA (19%)</span><b>−${formatCurrency(Math.round(ivaTotal))}</b></li>
          <li class="is-sub"><span>− Pasarela de pago</span><b>−${formatCurrency(Math.round(gatewayTotal))}</b></li>
          <li class="is-sub"><span>− Costos operativos</span><b>−${formatCurrency(Math.round(opsTotal))}</b></li>
          <li class="is-unc"><span>= Utilidad neta (UNC)</span><b>${formatCurrency(Math.round(uncTotal))}</b></li>
          <li class="is-ret"><span>× ${Math.round(tier.pct * 100)}% (tu tramo)</span><b>${formatCurrency(returnTotal)}</b></li>
        </ul>
        <p class="info-modal__hint">Tramos por volumen quincenal: Inicial (≤ $20M) 25% · Plata 30% · Oro 35% · Platino (+$120M) 40%. Solo cuentan transacciones confirmadas y pagadas.</p>
      </div>

      <div class="av-grid">
        <div class="panel panel--av-chart panel--doctor-chart">
          <div class="panel__header">
            <h2 class="panel__title">Retorno por período</h2>
            <select id="av-returns-range" class="form__input generated-range" aria-label="Rango de tiempo">
              <option value="monthly">Mensual (${new Date().getFullYear()})</option>
              <option value="daily">Diario (este mes)</option>
              <option value="annual">Anual (histórico)</option>
            </select>
          </div>
          <div class="doctor-period-card__body">
            <div id="av-returns-chart">${ColumnChart({ data: buildReturnsData(txns, tier.pct, 'monthly'), formatValue: formatCurrency, color: RETURNS_COLOR, keepZero: true })}</div>
            <p class="chart-hint" id="av-returns-hint">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74"/><path d="M14 10.5a2.5 2.5 0 0 1 5 0v2.5a7 7 0 0 1-7 7h-1.6a4 4 0 0 1-2.83-1.17l-3-3a2 2 0 0 1 2.83-2.83L9 15"/></svg>
              Toca una barra para ver el desglose por operación.
            </p>
          </div>
        </div>

        <div class="panel panel--av-market">
          <div class="panel__header">
            <h2 class="panel__title">Ahorro de tu comunidad vs OTAs</h2>
          </div>
          <div class="av-market">
            <div class="av-market__row">
              <span>Canales públicos (Booking, OTAs)</span>
              <strong>${formatCurrency(otaSales)}</strong>
              <div class="av-market__track"><i style="width:100%;background:#0a2540"></i></div>
            </div>
            <div class="av-market__row">
              <span>Convenio CS Travel</span>
              <strong>${formatCurrency(cstSales)}</strong>
              <div class="av-market__track"><i style="width:${cstBarPct}%;background:#0757d6"></i></div>
            </div>
            <div class="av-market__result">
              <span>Ahorro real para tu comunidad</span>
              <strong class="text-green">${formatCurrency(communitySavings)}</strong>
              <em>${savingsPct}%</em>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-overlay modal-overlay--doctor" id="av-day-modal">
        <div class="modal modal--period" role="dialog" aria-modal="true" aria-labelledby="av-day-title">
          <div class="modal__header">
            <div>
              <h2 class="modal__title" id="av-day-title">Detalle del período</h2>
              <p class="modal__subtitle" id="av-day-sub">Desglose de retorno por operación</p>
            </div>
            <button type="button" class="modal__close" data-action="av-day-close" aria-label="Cerrar">✕</button>
          </div>
          <div id="av-day-body"></div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Abre el modal de desglose del período tocado (mes / día / año). Muestra el
 * retorno total, 3 indicadores y las operaciones que lo componen. Es el análogo
 * al modal "Detalle del período" del panel de médicos, con datos de retorno.
 */
function openReturnsDetail(label) {
  const group = returnsGroupsCache[label];
  const modal = document.getElementById('av-day-modal');
  if (!group || !modal || !group.txns.length) return;
  const rows = group.txns.slice().sort((a, b) => (b.month - a.month) || (b.day - a.day));
  const count = rows.length;
  const managed = rows.reduce((s, r) => s + (r.sale || 0), 0);
  const avg = count ? Math.round(group.total / count) : 0;
  // Etiqueta de la primera columna de cada fila: día del mes (mensual/diario) o
  // el mes abreviado (anual, donde las operaciones abarcan varios meses).
  const lead = (r) => (returnsMode === 'annual' ? MONTH_LABELS[r.month] : String(r.day).padStart(2, '0'));

  document.getElementById('av-day-title').textContent = returnsPeriodTitle(label, returnsMode);
  document.getElementById('av-day-sub').textContent =
    `${count} ${count === 1 ? 'operación' : 'operaciones'} · desglose de retorno`;
  document.getElementById('av-day-body').innerHTML = `
    <div class="period-detail__summary">
      <div class="period-detail__hero">
        <span class="period-detail__hero-label">Retorno del período</span>
        <strong class="period-detail__hero-value">${formatCurrency(group.total)}</strong>
      </div>
      <div class="period-detail__stats">
        <div class="period-stat">
          <span class="period-stat__value">${count}</span>
          <span class="period-stat__label">Operación${count === 1 ? '' : 'es'}</span>
        </div>
        <div class="period-stat">
          <span class="period-stat__value">${formatCurrency(avg)}</span>
          <span class="period-stat__label">Retorno promedio</span>
        </div>
        <div class="period-stat">
          <span class="period-stat__value">${formatCurrency(managed)}</span>
          <span class="period-stat__label">Volumen gestionado</span>
        </div>
      </div>
    </div>
    <div class="av-day-list">
      ${rows.map((r) => `
        <div class="av-day-row">
          <span class="av-day-row__day">${escapeHtml(lead(r))}</span>
          <span class="av-day-row__client">${escapeHtml(r.client)}<small>${escapeHtml(r.service)}</small></span>
          <span class="av-day-row__ret text-green">${formatCurrency(r.ret)}</span>
        </div>`).join('')}
    </div>
  `;
  modal.classList.add('is-open');
}

/**
 * Reubica un overlay (modal/drawer) a <body>. Las animaciones de entrada del
 * dashboard aplican `transform` a sus secciones, lo que crea un containing block
 * que atrapa cualquier `position: fixed` descendiente (su backdrop se "corta" y
 * no cubre el navbar/sidebar). Moviéndolo a <body> el fixed vuelve a ser
 * relativo al viewport y cubre toda la página. Idempotente entre renders.
 */
function portalToBody(id) {
  document.querySelectorAll('body > #' + id).forEach((el) => el.remove());
  const el = document.getElementById(id);
  if (el) document.body.appendChild(el);
  return el;
}

export function bindReturnsAnalytics() {
  const chart = document.getElementById('av-returns-chart');
  const range = document.getElementById('av-returns-range');
  const modal = portalToBody('av-day-modal');

  // Al tocar una columna: la resalta, atenúa el resto y abre el desglose del
  // período. Se reengancha cada vez que se redibuja el gráfico (cambio de rango).
  const bindCols = () => {
    if (!chart) return;
    const cols = chart.querySelectorAll('.column-chart__col:not(.column-chart__col--empty)');
    cols.forEach((col) => {
      col.classList.add('column-chart__col--clickable');
      col.addEventListener('click', () => {
        cols.forEach((c) => c.classList.remove('is-active', 'is-dimmed'));
        col.classList.add('is-active');
        cols.forEach((c) => { if (c !== col) c.classList.add('is-dimmed'); });
        const label = col.querySelector('small')?.textContent?.trim();
        if (label) openReturnsDetail(label);
      });
    });
  };

  // Reconstruye datos + grupos del período seleccionado y reengancha los clics
  // (mismo comportamiento que refreshChart del panel de médicos).
  const refresh = (mode) => {
    returnsMode = mode;
    returnsGroupsCache = buildReturnsGroups(returnsTxnsCache, returnsPctCache, mode);
    if (chart) {
      chart.innerHTML = ColumnChart({
        data: buildReturnsData(returnsTxnsCache, returnsPctCache, mode),
        formatValue: formatCurrency,
        color: RETURNS_COLOR,
        keepZero: mode === 'monthly',
      });
      bindCols();
    }
  };

  bindCols();
  range?.addEventListener('change', () => refresh(range.value));

  if (modal) {
    const close = () => {
      modal.classList.remove('is-open');
      chart?.querySelectorAll('.column-chart__col').forEach((c) => c.classList.remove('is-active', 'is-dimmed'));
    };
    modal.querySelectorAll('[data-action="av-day-close"]').forEach((b) => b.addEventListener('click', close));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    if (window.__avDayEsc) document.removeEventListener('keydown', window.__avDayEsc);
    window.__avDayEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', window.__avDayEsc);
  }
}

/* ===========================================================================
 * MÓDULO 2 — Tracking en vivo de clientes referidos
 * ======================================================================== */
// Mapeo de estados del tracker de referidos (admin) al estilo pill de la tabla.
const REF_PILL = {
  escribio:   { label: 'Escribió',   color: '#92400e', bg: '#fef3c7' },
  cotizo:     { label: 'Cotizó',     color: '#1e40af', bg: '#dbeafe' },
  aprobado:   { label: 'Aprobado',   color: '#5b4bd8', bg: '#eee9ff' },
  finalizado: { label: 'Finalizado', color: '#1a7f4b', bg: '#dcfce7' },
};
const REF_COMM_STATUSES = ['aprobado', 'finalizado'];

function maskRefName(name) {
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts[1] || '';
  return `${first[0] || ''}${'•'.repeat(Math.max(3, first.length - 1))} ${last[0] ? last[0] + '.' : ''}`.trim();
}

/**
 * Tabla de clientes referidos. Consume los referidos REALES (registrados a mano
 * por el dueño en el detalle de la empresa). Si aún no hay, muestra un estado
 * vacío honesto en vez de datos de ejemplo. `refs` se precarga en la vista.
 */
export function renderTrackingTable(refs = []) {
  const list = Array.isArray(refs) ? refs : [];

  if (!list.length) {
    return `
      <section class="panel panel--av-track">
        <div class="panel__header">
          <h2 class="panel__title">Clientes referidos · monitoreo en vivo</h2>
          <span class="muted">Actualizado por CS Travel</span>
        </div>
        <p class="empty-state" style="padding:28px 16px;">
          Aún no hay clientes referidos registrados. A medida que tu comunidad
          use el convenio, CS Travel los irá registrando aquí con su estado y la
          comisión generada.
        </p>
      </section>
    `;
  }

  const fmtCOP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n || 0));
  // Retorno REAL del aliado por referido = UNC × % de tramo (igual que el hero),
  // NO la comisión bruta de CST. Así la tabla cuadra con "Ganancia por referidos".
  const trackTier = tierForVolume(currentQuincenaVolume(refsToTxns(list)));
  const rows = list.map((r) => {
    const pill = REF_PILL[r.status] || REF_PILL.escribio;
    const comm = REF_COMM_STATUSES.includes(r.status) && r.amount > 0
      ? fmtCOP(Math.round(unc(refsToTxns([r])[0]) * trackTier.pct))
      : '<span class="muted">En proceso</span>';
    const dateStr = r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    return `
      <tr>
        <td><strong>${escapeHtml(maskRefName(r.name))}</strong></td>
        <td>${dateStr}</td>
        <td><span class="av-pill" style="color:${pill.color};background:${pill.bg}">${pill.label}</span></td>
        <td class="av-track__ret">${comm}</td>
      </tr>`;
  }).join('');

  return `
    <section class="panel panel--av-track">
      <div class="panel__header">
        <h2 class="panel__title">Clientes referidos · monitoreo en vivo</h2>
        <span class="muted">Actualizado por CS Travel</span>
      </div>
      <div class="table-wrapper">
        <table class="data-table av-track">
          <thead>
            <tr>
              <th>Cliente referido</th>
              <th>Fecha</th>
              <th>Estado de la gestión</th>
              <th>Tu retorno estimado</th>
            </tr>
          </thead>
          <tbody id="av-track-tbody">${rows}</tbody>
        </table>
      </div>
      <div class="av-track-footer">
        <div class="decision-pager" id="av-track-pager">
          <button type="button" class="decision-pager__btn" id="av-track-prev">‹</button>
          <span class="decision-pager__label" id="av-track-lbl"></span>
          <button type="button" class="decision-pager__btn" id="av-track-next">›</button>
        </div>
      </div>
    </section>
  `;
}

const TRACK_PAGE_SIZE = 3;
let trackPage = 1;

export function bindTrackingPager() {
  const tbody = document.getElementById('av-track-tbody');
  const prev = document.getElementById('av-track-prev');
  const next = document.getElementById('av-track-next');
  const lbl = document.getElementById('av-track-lbl');
  if (!tbody || !prev || !next) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const total = Math.max(1, Math.ceil(rows.length / TRACK_PAGE_SIZE));
  trackPage = 1;

  function renderPage() {
    rows.forEach((r, i) => {
      r.hidden = i < (trackPage - 1) * TRACK_PAGE_SIZE || i >= trackPage * TRACK_PAGE_SIZE;
    });
    if (lbl) lbl.innerHTML = '<strong>' + trackPage + '</strong> de ' + total;
    prev.disabled = trackPage <= 1;
    next.disabled = trackPage >= total;
  }

  prev.addEventListener('click', () => { if (trackPage > 1) { trackPage--; renderPage(); } });
  next.addEventListener('click', () => { if (trackPage < total) { trackPage++; renderPage(); } });
  renderPage();
}

/* ===========================================================================
 * Constantes compartidas (WhatsApp, marca)
 * ======================================================================== */
const SUPPORT_WA = '573146103599';
const SUPPORT_EMAIL = 'info.cstravelgroup@gmail.com';
const SUPPORT_PHONE = '+57 314 610 3599';
const wa = (text) => `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(text)}`;

/* ===========================================================================
 * MÓDULO 5 — Incentivos corporativos (gamificación)
 * ======================================================================== */
// Hitos por volumen de ventas del período (en COP, coherente con el resto).
// Íconos en líneas (mismo lenguaje visual azul del resto del panel).
const MILESTONE_ICONS = {
  tours: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  estadias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>',
  vuelos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l4.6 3-2 2-2.5-.5a1 1 0 0 0-.9 1.6l2.3 2.3 2.3 2.3a1 1 0 0 0 1.6-.9l-.5-2.5 2-2 3 4.6a1 1 0 0 0 1.7-.9z"/></svg>',
};
const MILESTONES = [
  { key: 'tours', name: 'Tours', at: 25_000_000, icon: MILESTONE_ICONS.tours, desc: 'Experiencias de destino y actividades' },
  { key: 'estadias', name: 'Estadías', at: 45_000_000, icon: MILESTONE_ICONS.estadias, desc: 'Hoteles / resorts nacionales o internacionales' },
  { key: 'vuelos', name: 'Vuelos', at: 70_000_000, icon: MILESTONE_ICONS.vuelos, desc: 'Tiquetes aéreos para el equipo' },
];
const GOAL = 70_000_000;

export function renderGamification(refs = []) {
  // Ventas del período derivadas del volumen REAL de los referidos del aliado.
  const txns = refsToTxns(refs);
  const sold = txns.filter((t) => EARNED_STATUSES.includes(t.status)).reduce((s, t) => s + t.sale, 0);
  const pct = Math.min(100, Math.round((sold / GOAL) * 100));
  const next = MILESTONES.find((m) => m.at > sold);
  const remaining = next ? next.at - sold : 0;

  const cards = MILESTONES.map((m) => {
    const unlocked = sold >= m.at;
    return `
      <article class="prize-card ${unlocked ? 'is-unlocked' : ''}">
        <span class="prize-card__icon" aria-hidden="true">${m.icon}</span>
        <div class="prize-card__body">
          <strong>${escapeHtml(m.name)}</strong>
          <span class="prize-card__desc">${escapeHtml(m.desc)}</span>
        </div>
        <span class="prize-card__at">${unlocked ? '✓ Liberado' : formatCurrency(m.at)}</span>
      </article>`;
  }).join('');

  return `
    <section class="panel panel--incentives">
      <div class="panel__header">
        <h2 class="panel__title">Incentivos para tu equipo</h2>
        <span class="muted">Período actual</span>
      </div>
      <div class="incentive-progress">
        <div class="incentive-progress__head">
          <span><strong>${formatCurrency(sold)}</strong> de ${formatCurrency(GOAL)}</span>
          <span class="incentive-progress__pct">${pct}%</span>
        </div>
        <div class="incentive-progress__track">
          <div class="incentive-progress__fill" style="width:${pct}%"></div>
          ${MILESTONES.map((m) => `<span class="incentive-progress__mark" style="left:${Math.min(100, (m.at / GOAL) * 100)}%" title="${escapeHtml(m.name)} · ${formatCurrency(m.at)}"></span>`).join('')}
        </div>
        ${next ? `<p class="incentive-progress__hint">Tu equipo está a solo <strong>${formatCurrency(remaining)}</strong> de liberar el hito de <strong>${escapeHtml(next.name)}</strong> para su próximo viaje.</p>`
          : '<p class="incentive-progress__hint">¡Felicidades! Tu equipo liberó todos los hitos del período.</p>'}
      </div>
      <div class="prize-grid">${cards}</div>
    </section>
  `;
}

/* ===========================================================================
 * MÓDULO 4 — Centro de distribución de beneficios (códigos / links)
 * ======================================================================== */
const benefitLink = (code) => `https://cstravelgroup.com/?ref=${encodeURIComponent(code)}`;

const BENEFIT_TYPE_LABEL = { clientes: 'Clientes', colaboradores: 'Colaboradores' };
const BENEFIT_TYPE_TITLE = {
  clientes: 'Fidelización de clientes',
  colaboradores: 'Bienestar de colaboradores',
};
const BENEFIT_TYPE_AUDIENCE = {
  clientes: 'Para tu base de clientes',
  colaboradores: 'Para tu equipo de trabajo',
};

/**
 * Centro de beneficios. El "clic de referido" (compartir por WhatsApp/enlace/
 * correo) SOLO aparece si el admin ya asignó un código a este socio. `assignedCodes`
 * son los códigos ACTIVOS de la colección Codes con este socio como dueño. Si la
 * lista viene vacía -> estado PENDIENTE (sin botones de compartir).
 */
export function renderBenefitsCenter(sharedCode = 'CST', assignedCodes = []) {
  const codes = Array.isArray(assignedCodes) ? assignedCodes : [];

  // PENDIENTE: el admin todavía no le asignó un código de referido.
  if (!codes.length) {
    return `
      <section class="panel panel--benefits">
        <div class="panel__header">
          <h2 class="panel__title">Centro de beneficios · código de referido</h2>
          <span class="badge badge--amber">Pendiente de asignación</span>
        </div>
        <p class="empty-state" style="padding:24px 16px;">
          Aún no tienes un código de referido asignado. Cuando CS Travel te active uno,
          aquí podrás compartirlo con tu comunidad por WhatsApp, enlace o correo.
        </p>
      </section>
    `;
  }

  const cards = codes.map((c) => {
    const link = benefitLink(c.code);
    const hasDisc = Number(c.discountValue) > 0;
    const disc = !hasDisc ? '' : (c.discountType === 'fixed' ? formatCurrency(c.discountValue) : `${c.discountValue}%`);
    const tag = BENEFIT_TYPE_LABEL[c.codeType] || 'Referido';
    const title = BENEFIT_TYPE_TITLE[c.codeType] || 'Código de referido';
    const audience = BENEFIT_TYPE_AUDIENCE[c.codeType] || 'Comparte con tu comunidad';
    const waMsg = hasDisc
      ? `¡Hola! Como parte de nuestra comunidad tienes acceso preferencial a CS Travel Group con un descuento de ${disc}. Reserva tus viajes aquí: ${link} (código ${c.code}).`
      : `¡Hola! Como parte de nuestra comunidad tienes acceso preferencial a CS Travel Group. Reserva tus viajes aquí: ${link} (código ${c.code}).`;
    return `
      <article class="benefit-card" data-link="${escapeHtml(link)}">
        <div class="benefit-card__avatar" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="benefit-card__content">
          <div class="benefit-card__head">
            <span class="benefit-card__tag">${escapeHtml(tag)}${hasDisc ? ` · ${escapeHtml(disc)}` : ''}</span>
            <strong>${escapeHtml(title)}</strong>
            <span class="benefit-card__audience">${escapeHtml(audience)} · código <b>${escapeHtml(c.code)}</b></span>
          </div>
          <div class="benefit-card__code">
            <span class="benefit-card__link" title="${escapeHtml(link)}">${escapeHtml(link)}</span>
          </div>
          <div class="benefit-card__actions">
            <a class="btn btn--wa btn--sm" href="${wa(waMsg)}" target="_blank" rel="noopener">WhatsApp</a>
            <button type="button" class="btn btn--ghost btn--sm" data-benefit-copy>Copiar enlace</button>
            <a class="btn btn--ghost btn--sm" href="mailto:?subject=${encodeURIComponent('Tu beneficio CS Travel Group')}&body=${encodeURIComponent(waMsg)}">Email</a>
          </div>
        </div>
      </article>`;
  }).join('');

  return `
    <section class="panel panel--benefits">
      <div class="panel__header">
        <h2 class="panel__title">Centro de beneficios · códigos asignados</h2>
        <span class="muted">Comparte el acceso con tu comunidad</span>
      </div>
      <div class="benefit-grid">${cards}</div>
    </section>
  `;
}

export function bindBenefitsCenter() {
  document.querySelectorAll('[data-benefit-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const link = btn.closest('.benefit-card')?.getAttribute('data-link');
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        const original = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = original; }, 1500);
      } catch {}
    });
  });
}

/* ===========================================================================
 * MÓDULO 6 — Strip de soporte CST + enlace de referidos (igual que médicos)
 * ======================================================================== */
const SUPPORT_PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.6 4.88 2 2 0 0 1 3.6 2.71h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10a16 16 0 0 0 6.06 6.06l.92-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

export function renderSupportStrip(company) {
  const code = company?.sharedCode || 'CST';
  const referralLink = benefitLink(code);
  const waMsg = `Hola CS Travel, necesito apoyo con nuestra cuenta empresarial aliada ${code}.`;

  return `
    <section class="partner-strip">

      <div class="partner-strip__brand">
        <div class="partner-strip__brand-icon">${SUPPORT_PHONE_ICON}</div>
        <span class="partner-strip__label">Soporte CST</span>
        <p class="partner-strip__tagline">Equipo dedicado a empresas aliadas</p>
      </div>


      <div class="partner-strip__block">
        <span class="partner-strip__label">Tu código aliado</span>
        <div class="partner-strip__code">
          <strong id="av-shared-code">${escapeHtml(code)}</strong>
          <button type="button" class="btn btn--ghost btn--sm" id="av-copy-code">Copiar</button>
        </div>
        <p class="muted">Prioridad en trazabilidad y seguimiento</p>
      </div>

      <div class="partner-strip__block">
        <span class="partner-strip__label">Canales de atención</span>
        <a class="partner-strip__contact" href="mailto:${SUPPORT_EMAIL}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          ${SUPPORT_EMAIL}
        </a>
        <a class="partner-strip__contact" href="tel:${SUPPORT_PHONE.replace(/\s/g, '')}">
          ${SUPPORT_PHONE_ICON}
          ${SUPPORT_PHONE}
        </a>
      </div>

      <div class="partner-strip__block partner-strip__block--cta">
        <span class="partner-strip__label">Escríbenos ahora</span>
        <a class="support-wa" href="${wa(waMsg)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>
          </svg>
          <span>WhatsApp</span>
        </a>
      </div>

    </section>
  `;
}

/** Activa los botones "Copiar" del strip de soporte (enlace de referidos y código). */
export function bindSupportStrip() {
  const flash = (btn, label) => {
    const prev = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = prev; }, 1400);
  };
  document.getElementById('av-copy-referral')?.addEventListener('click', async (e) => {
    const url = document.getElementById('av-referral-url')?.getAttribute('title')?.trim();
    if (!url) return;
    try { await navigator.clipboard.writeText(url); flash(e.currentTarget, '¡Copiado!'); } catch {}
  });
  document.getElementById('av-copy-code')?.addEventListener('click', async (e) => {
    const code = document.getElementById('av-shared-code')?.textContent?.trim();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); flash(e.currentTarget, 'Copiado'); } catch {}
  });
}

/* ===========================================================================
 * MÓDULO 7 — Pasarela de pagos corporativos
 * ======================================================================== */
export function renderPaymentModule() {
  return `
    <section class="panel panel--pay">
      <div class="panel__header">
        <h2 class="panel__title">Pasarela de pagos</h2>
        <span class="pay-secure"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg> Pago seguro</span>
      </div>
      <p class="muted">Liquida de forma inmediata cualquier servicio institucional o de experiencia: tarjeta, PSE o transferencia (sin recargo).</p>
      <a class="btn btn--primary" href="${payHref({ concept: 'Servicio institucional CS Travel' })}"${payTargetAttrs()}>Pagar un servicio →</a>
      <span class="pay-providers">Procesa <b>Bold</b> · <b>Davivienda</b> (Bre-B)</span>
    </section>
  `;
}

/* ===========================================================================
 * MÓDULO 3 — Drawer izquierdo: soluciones de valor + cotización directa
 * ======================================================================== */
const WORKSHOP_TYPES = [
  'Inteligencia Artificial (IA) aplicada',
  'Productividad y automatización con IA',
  'Liderazgo y fortalecimiento ejecutivo',
  'Transformación digital',
  'Otro (especificar)',
];

/** Botón que abre el drawer (va en el encabezado del dashboard). */
export function renderServicesDrawerTrigger() {
  return `<button type="button" class="btn btn--ghost" id="av-drawer-open">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
    Servicios y solicitudes
  </button>`;
}

export function renderServicesDrawer() {
  const aportesMsg = 'Hola, vengo del Dashboard de Aliados y quiero activar mi tarifa preferencial en Aportes Empresariales.';
  const segurosMsg = 'Hola, vengo del Dashboard de Aliados y quiero cotizar el Portafolio de Seguros (viaje, asistencia médica, vida, salud o vehículos).';

  return `
    <div class="av-drawer" id="av-drawer" aria-hidden="true">
      <div class="av-drawer__backdrop" data-drawer-close></div>
      <aside class="av-drawer__panel" role="dialog" aria-modal="true" aria-label="Servicios y solicitudes">
        <div class="av-drawer__head">
          <h2>Servicios y solicitudes</h2>
          <button type="button" class="modal__close" data-drawer-close aria-label="Cerrar">✕</button>
        </div>

        <div class="av-drawer__body">
          <!-- Sub-módulo A: soluciones de valor agregado -->
          <h3 class="av-drawer__section">Soluciones de valor agregado</h3>

          <article class="av-solution">
            <strong>Aportes Empresariales</strong>
            <p>Tarifas preferenciales en la gestión integral de afiliaciones y prestaciones sociales para tu organización.</p>
            <a class="btn btn--wa btn--sm" href="${wa(aportesMsg)}" target="_blank" rel="noopener">Activar por WhatsApp</a>
          </article>

          <article class="av-solution">
            <strong>Portafolio de Seguros</strong>
            <p>Seguros de viaje, asistencias médicas internacionales, pólizas de vida, salud y vehículos.</p>
            <a class="btn btn--wa btn--sm" href="${wa(segurosMsg)}" target="_blank" rel="noopener">Cotizar por WhatsApp</a>
          </article>

          <article class="av-solution">
            <strong>Talleres corporativos (IA y fortalecimiento ejecutivo)</strong>
            <p>Agenda una capacitación para tu equipo. Te confirmamos la sesión.</p>
            <form class="av-mini-form" id="av-workshop-form">
              <label class="form__label">Tipo de taller</label>
              <select class="form__input" name="type" required>
                ${WORKSHOP_TYPES.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
              </select>
              <div class="av-mini-form__row">
                <div>
                  <label class="form__label">Fecha</label>
                  <input type="date" class="form__input" name="date" required>
                </div>
                <div>
                  <label class="form__label">Hora</label>
                  <input type="time" class="form__input" name="time" required>
                </div>
              </div>
              <button type="submit" class="btn btn--primary btn--sm">Solicitar taller</button>
              <p class="av-mini-form__ok" hidden>✓ Solicitud enviada. Nuestro equipo te contactará para confirmar la sesión.</p>
            </form>
          </article>

          <!-- Sub-módulo B: cotización directa -->
          <h3 class="av-drawer__section">Solicitud de cotización directa</h3>
          <div class="av-tabs" role="tablist">
            <button type="button" class="av-tab is-active" data-quote-tab="individual">Individual</button>
            <button type="button" class="av-tab" data-quote-tab="grupal">Grupal</button>
            <button type="button" class="av-tab" data-quote-tab="experiencia">Experiencias</button>
          </div>
          <form class="av-mini-form" id="av-quote-form">
            <input type="hidden" name="flow" value="individual" id="av-quote-flow">
            <label class="form__label">Destino</label>
            <input type="text" class="form__input" name="destination" placeholder="Ciudad o país" required>
            <div class="av-mini-form__row">
              <div>
                <label class="form__label">Fecha ida</label>
                <input type="date" class="form__input" name="dateIn" required>
              </div>
              <div>
                <label class="form__label">Fecha regreso</label>
                <input type="date" class="form__input" name="dateOut">
              </div>
            </div>
            <div class="av-mini-form__row">
              <div>
                <label class="form__label">Pasajeros</label>
                <input type="number" class="form__input" name="pax" min="1" value="1" required>
              </div>
              <div>
                <label class="form__label">Servicio</label>
                <select class="form__input" name="service">
                  <option value="vuelos">Vuelos</option>
                  <option value="alojamientos">Alojamientos</option>
                  <option value="paquete">Paquete completo</option>
                  <option value="traslados">Traslados</option>
                  <option value="seguros">Seguros</option>
                </select>
              </div>
            </div>
            <label class="form__label">Detalles</label>
            <textarea class="form__input" name="notes" rows="2" placeholder="Servicios turísticos solicitados, contexto del viaje..."></textarea>
            <button type="submit" class="btn btn--primary btn--sm">Enviar solicitud</button>
            <p class="av-mini-form__ok" hidden>✓ Solicitud enviada al equipo logístico de CS Travel.</p>
          </form>
        </div>
      </aside>
    </div>
  `;
}

export function bindServicesDrawer() {
  const drawer = portalToBody('av-drawer');
  const openBtn = document.getElementById('av-drawer-open');
  if (!drawer || !openBtn) return;

  const open = () => { drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); };
  const close = () => { drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); };
  openBtn.addEventListener('click', open);
  drawer.querySelectorAll('[data-drawer-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) close(); });

  // Pestañas del flujo de cotización.
  const flowInput = document.getElementById('av-quote-flow');
  drawer.querySelectorAll('[data-quote-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      drawer.querySelectorAll('[data-quote-tab]').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      if (flowInput) flowInput.value = tab.getAttribute('data-quote-tab');
    });
  });

  // Envío demo: muestra confirmación (en producción dispara webhook al equipo).
  const wireDemoForm = (id) => {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const ok = form.querySelector('.av-mini-form__ok');
      const btn = form.querySelector('button[type="submit"]');
      if (ok) ok.hidden = false;
      if (btn) { btn.disabled = true; btn.textContent = 'Enviado ✓'; }
    });
  };
  wireDemoForm('av-workshop-form');
  wireDemoForm('av-quote-form');
}
