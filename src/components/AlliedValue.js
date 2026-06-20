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

import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { ColumnChart } from './Chart.js';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Parámetros del modelo (configurables por empresa en producción).
const IVA_RATE = 0.19;       // sobre la comisión bruta
const GATEWAY_RATE = 0.029;  // sobre el valor de venta
const OPS_RATE = 0.10;       // sobre la comisión bruta

// Tramos de retorno por volumen NETO QUINCENAL (COP).
export const TIERS = [
  { key: 'inicial', name: 'Inicial', pct: 0.25, max: 20_000_000, color: '#1d6fd8' },
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
const STATUS_META = {
  cotizacion: { label: 'En cotización', color: '#c77700', bg: '#fdf1dd' },
  propuesta: { label: 'Propuesta enviada', color: '#1456a0', bg: '#e7f0fb' },
  confirmada: { label: 'Reserva confirmada', color: '#5b4bd8', bg: '#eee9ff' },
  liquidada: { label: 'Liquidada', color: '#1a7f4b', bg: '#e3f3ea' },
};

/**
 * Transacciones demo de clientes referidos por el aliado. `sale` = valor de la
 * venta turística; `commission` = comisión bruta de CST en esa venta.
 */
const TXNS = [
  { id: 't01', client: 'María Restrepo', code: 'CST-AL-7741', service: 'vuelos', status: 'liquidada', date: '2026-02-18', sale: 9_400_000, commission: 1_410_000 },
  { id: 't02', client: 'Andrés Gómez', code: 'CST-AL-7798', service: 'alojamientos', status: 'liquidada', date: '2026-03-05', sale: 6_200_000, commission: 1_054_000 },
  { id: 't03', client: 'Lucía Fernández', code: 'CST-AL-7820', service: 'seguros', status: 'liquidada', date: '2026-03-21', sale: 1_800_000, commission: 360_000 },
  { id: 't04', client: 'Carlos Pineda', code: 'CST-AL-7866', service: 'cruceros', status: 'liquidada', date: '2026-04-12', sale: 14_800_000, commission: 2_220_000 },
  { id: 't05', client: 'Daniela Ortiz', code: 'CST-AL-7901', service: 'traslados', status: 'liquidada', date: '2026-05-04', sale: 980_000, commission: 176_400 },
  { id: 't06', client: 'Jorge Salazar', code: 'CST-AL-7925', service: 'parques', status: 'liquidada', date: '2026-05-20', sale: 3_600_000, commission: 540_000 },
  { id: 't07', client: 'Paola Marín', code: 'CST-AL-7960', service: 'vuelos', status: 'confirmada', date: '2026-06-03', sale: 8_100_000, commission: 1_215_000 },
  { id: 't08', client: 'Esteban Ruiz', code: 'CST-AL-7984', service: 'alojamientos', status: 'confirmada', date: '2026-06-09', sale: 5_400_000, commission: 918_000 },
  { id: 't09', client: 'Natalia Cano', code: 'CST-AL-7991', service: 'autos', status: 'propuesta', date: '2026-06-12', sale: 2_300_000, commission: 345_000 },
  { id: 't10', client: 'Felipe Duarte', code: 'CST-AL-8002', service: 'vuelos', status: 'propuesta', date: '2026-06-15', sale: 11_200_000, commission: 1_680_000 },
  { id: 't11', client: 'Sofía Mejía', code: 'CST-AL-8014', service: 'seguros', status: 'cotizacion', date: '2026-06-18', sale: 2_100_000, commission: 420_000 },
  { id: 't12', client: 'Ricardo Lozano', code: 'CST-AL-8020', service: 'cruceros', status: 'cotizacion', date: '2026-06-19', sale: 16_500_000, commission: 2_475_000 },
];

// Estados que ya generan retorno liquidable (confirmada/liquidada).
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
function currentQuincenaVolume() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const half = now.getDate() <= 15 ? 'a' : 'b';
  return TXNS.filter((t) => {
    const d = new Date(t.date);
    if (d.getFullYear() !== y || d.getMonth() !== m) return false;
    return (d.getDate() <= 15 ? 'a' : 'b') === half;
  }).reduce((s, t) => s + unc(t), 0);
}

// Cache para el drill-down del gráfico.
let returnsByDayCache = {};

/** Datos del gráfico de retornos por mes (año actual) sobre transacciones ganadas. */
function buildReturnsMonthly(pct) {
  const year = new Date().getFullYear();
  const totals = Array.from({ length: 12 }, () => 0);
  TXNS.filter((t) => EARNED_STATUSES.includes(t.status)).forEach((t) => {
    const d = new Date(t.date);
    if (d.getFullYear() === year) totals[d.getMonth()] += Math.round(unc(t) * pct);
  });
  return totals.map((value, i) => ({ label: MONTH_LABELS[i], value, color: '#0058c1' }));
}

/** Agrupa los retornos del año por día dentro de cada mes (para el drill-down). */
function buildReturnsByDay(pct) {
  const year = new Date().getFullYear();
  const groups = {};
  TXNS.filter((t) => EARNED_STATUSES.includes(t.status)).forEach((t) => {
    const d = new Date(t.date);
    if (d.getFullYear() !== year) return;
    const m = d.getMonth();
    (groups[m] = groups[m] || []).push({
      day: d.getDate(),
      client: maskName(t.client),
      service: SERVICE_LABELS[t.service] || t.service,
      ret: Math.round(unc(t) * pct),
      sale: t.sale,
    });
  });
  return groups;
}

/* ===========================================================================
 * MÓDULO 1 — Analítica de retornos
 * ======================================================================== */
export function renderReturnsAnalytics() {
  const tier = tierForVolume(currentQuincenaVolume());
  const earned = TXNS.filter((t) => EARNED_STATUSES.includes(t.status));

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
  const savingsPct = Math.round((communitySavings / otaSales) * 100);

  returnsByDayCache = buildReturnsByDay(tier.pct);

  const ladder = TIERS.map((t) => `
    <div class="tier-step ${t.key === tier.key ? 'is-active' : ''}">
      <span class="tier-step__pct" style="color:${t.color}">${Math.round(t.pct * 100)}%</span>
      <span class="tier-step__name">${t.name}</span>
    </div>`).join('<span class="tier-step__sep" aria-hidden="true">›</span>');

  return `
    <section class="av-analytics">
      <div class="av-hero">
        <div class="av-hero__main">
          <span class="av-hero__label">Ganancia total acumulada · retorno neto</span>
          <strong class="av-hero__value">${formatCurrency(returnTotal)}</strong>
          <span class="av-hero__tier">
            <span class="av-hero__tier-dot" style="background:${tier.color}"></span>
            Tramo <b>${tier.name}</b> · ${Math.round(tier.pct * 100)}% sobre la utilidad neta
          </span>
        </div>
        <div class="av-formula" aria-label="Cálculo de la utilidad neta">
          <span class="av-formula__title">Cómo se calcula tu retorno</span>
          <ul class="av-formula__list">
            <li><span>Comisión bruta</span><b>${formatCurrency(Math.round(grossTotal))}</b></li>
            <li class="is-sub"><span>− IVA (19%)</span><b>−${formatCurrency(Math.round(ivaTotal))}</b></li>
            <li class="is-sub"><span>− Pasarela de pago</span><b>−${formatCurrency(Math.round(gatewayTotal))}</b></li>
            <li class="is-sub"><span>− Costos operativos</span><b>−${formatCurrency(Math.round(opsTotal))}</b></li>
            <li class="is-unc"><span>= Utilidad neta (UNC)</span><b>${formatCurrency(Math.round(uncTotal))}</b></li>
            <li class="is-ret"><span>× ${Math.round(tier.pct * 100)}% (tu tramo)</span><b>${formatCurrency(returnTotal)}</b></li>
          </ul>
        </div>
      </div>

      <div class="av-tiers">
        <span class="av-tiers__label">Tu escalón de retorno (por volumen quincenal)</span>
        <div class="av-tiers__ladder">${ladder}</div>
      </div>

      <div class="av-grid">
        <div class="panel panel--av-chart">
          <div class="panel__header">
            <h2 class="panel__title">Retorno por período</h2>
            <span class="muted">Toca una barra para ver el detalle por día</span>
          </div>
          <div id="av-returns-chart">${ColumnChart({ data: buildReturnsMonthly(tier.pct), formatValue: formatCurrency, color: '#0058c1', keepZero: true })}</div>
        </div>

        <div class="panel panel--av-market">
          <div class="panel__header">
            <h2 class="panel__title">Ahorro de tu comunidad vs OTAs</h2>
          </div>
          <div class="av-market">
            <div class="av-market__row">
              <span>Canales públicos (Booking, OTAs)</span>
              <strong>${formatCurrency(otaSales)}</strong>
              <div class="av-market__track"><i style="width:100%;background:#f2622e"></i></div>
            </div>
            <div class="av-market__row">
              <span>Convenio CS Travel</span>
              <strong>${formatCurrency(cstSales)}</strong>
              <div class="av-market__track"><i style="width:${Math.max(8, Math.round((cstSales / otaSales) * 100))}%;background:#061953"></i></div>
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
              <h2 class="modal__title" id="av-day-title">Detalle del mes</h2>
              <p class="modal__subtitle" id="av-day-sub">Retorno generado día por día</p>
            </div>
            <button type="button" class="modal__close" data-action="av-day-close" aria-label="Cerrar">✕</button>
          </div>
          <div id="av-day-body"></div>
        </div>
      </div>
    </section>
  `;
}

/** Abre el modal de drill-down con el detalle diario del mes (índice 0-11). */
function openDayDetail(monthIndex) {
  const rows = (returnsByDayCache[monthIndex] || []).slice().sort((a, b) => a.day - b.day);
  const modal = document.getElementById('av-day-modal');
  if (!modal || !rows.length) return;
  const total = rows.reduce((s, r) => s + r.ret, 0);
  document.getElementById('av-day-title').textContent = `${MONTH_FULL[monthIndex]} ${new Date().getFullYear()}`;
  document.getElementById('av-day-sub').textContent = `${rows.length} ${rows.length === 1 ? 'operación' : 'operaciones'} · retorno por día`;
  document.getElementById('av-day-body').innerHTML = `
    <div class="av-day-summary">
      <span>Retorno del mes</span>
      <strong>${formatCurrency(total)}</strong>
    </div>
    <div class="av-day-list">
      ${rows.map((r) => `
        <div class="av-day-row">
          <span class="av-day-row__day">${String(r.day).padStart(2, '0')}</span>
          <span class="av-day-row__client">${escapeHtml(r.client)}<small>${escapeHtml(r.service)}</small></span>
          <span class="av-day-row__ret text-green">${formatCurrency(r.ret)}</span>
        </div>`).join('')}
    </div>
  `;
  modal.classList.add('is-open');
}

export function bindReturnsAnalytics() {
  const chart = document.getElementById('av-returns-chart');
  const modal = document.getElementById('av-day-modal');
  if (chart) {
    const cols = chart.querySelectorAll('.column-chart__col:not(.column-chart__col--empty)');
    cols.forEach((col) => {
      col.classList.add('column-chart__col--clickable');
      col.addEventListener('click', () => {
        cols.forEach((c) => c.classList.remove('is-active', 'is-dimmed'));
        col.classList.add('is-active');
        cols.forEach((c) => { if (c !== col) c.classList.add('is-dimmed'); });
        const label = col.querySelector('small')?.textContent?.trim();
        const idx = MONTH_LABELS.indexOf(label);
        if (idx >= 0) openDayDetail(idx);
      });
    });
  }
  if (modal) {
    const close = () => {
      modal.classList.remove('is-open');
      chart?.querySelectorAll('.column-chart__col').forEach((c) => c.classList.remove('is-active', 'is-dimmed'));
    };
    modal.querySelectorAll('[data-action="av-day-close"]').forEach((b) => b.addEventListener('click', close));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  }
}

/* ===========================================================================
 * MÓDULO 2 — Tracking en vivo de clientes referidos
 * ======================================================================== */
export function renderTrackingTable() {
  const rows = TXNS.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map((t) => {
    const s = STATUS_META[t.status];
    const ret = EARNED_STATUSES.includes(t.status)
      ? formatCurrency(Math.round(unc(t) * tierForVolume(currentQuincenaVolume()).pct))
      : '<span class="muted">En proceso</span>';
    return `
      <tr>
        <td><strong>${escapeHtml(maskName(t.client))}</strong></td>
        <td><span class="av-code">${escapeHtml(t.code)}</span></td>
        <td>${escapeHtml(SERVICE_LABELS[t.service] || t.service)}</td>
        <td><span class="av-pill" style="color:${s.color};background:${s.bg}">${s.label}</span></td>
        <td class="av-track__ret">${ret}</td>
      </tr>`;
  }).join('');

  return `
    <section class="panel panel--av-track">
      <div class="panel__header">
        <h2 class="panel__title">Clientes referidos · monitoreo en vivo</h2>
        <span class="muted">Operación 100% gestionada por CS Travel</span>
      </div>
      <div class="table-wrapper">
        <table class="data-table av-track">
          <thead>
            <tr>
              <th>Cliente referido</th>
              <th>Código / enlace</th>
              <th>Servicio</th>
              <th>Estado de la gestión</th>
              <th>Retorno generado</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}
