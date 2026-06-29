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
const STATUS_META = {
  cotizacion: { label: 'En cotización', color: '#c77700', bg: '#fdf1dd' },
  propuesta: { label: 'Propuesta enviada', color: '#0a2d66', bg: '#e7f0fb' },
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

  const tierIdx = TIERS.findIndex((t) => t.key === tier.key);
  const ladder = TIERS.map((t, i) => {
    const state = i < tierIdx ? 'is-done' : i === tierIdx ? 'is-active' : 'is-pending';
    return `<div class="tier-step ${state}">${Math.round(t.pct * 100)}% ${t.name}</div>`;
  }).join('');

  return `
    <section class="av-analytics">
      <div class="av-top-grid">
        <div class="av-hero av-hero--solo">
          <div class="av-hero__main">
            <span class="av-hero__label">
              Ganancia total acumulada · retorno neto
              ${infoBtn({ target: '#av-formula-detail', title: 'Cómo se calcula tu retorno' })}
            </span>
            <strong class="av-hero__value">${formatCurrency(returnTotal)}</strong>
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
        <div class="panel panel--av-chart">
          <div class="panel__header">
            <h2 class="panel__title">Retorno por período</h2>
            <span class="muted">Toca una barra para ver el detalle por día</span>
          </div>
          <div id="av-returns-chart">${ColumnChart({ data: buildReturnsMonthly(tier.pct), formatValue: formatCurrency, color: '#0a2d66', keepZero: true })}</div>
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
              <div class="av-market__track"><i style="width:${Math.max(8, Math.round((cstSales / otaSales) * 100))}%;background:#0757d6"></i></div>
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
  const modal = portalToBody('av-day-modal');
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
// Mapeo de estados del tracker de referidos (admin) al estilo pill de la tabla.
const REF_PILL = {
  escribio:   { label: 'Escribió',   color: '#92400e', bg: '#fef3c7' },
  cotizo:     { label: 'Cotizó',     color: '#1e40af', bg: '#dbeafe' },
  aprobado:   { label: 'Aprobado',   color: '#5b4bd8', bg: '#eee9ff' },
  finalizado: { label: 'Finalizado', color: '#1a7f4b', bg: '#dcfce7' },
};
const REF_COMM_STATUSES = ['aprobado', 'finalizado'];

function getRealRefs(companyId) {
  try { return JSON.parse(localStorage.getItem(`cs_ref_company_${companyId}`) || '[]'); } catch { return []; }
}

function maskRefName(name) {
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts[1] || '';
  return `${first[0] || ''}${'•'.repeat(Math.max(3, first.length - 1))} ${last[0] ? last[0] + '.' : ''}`.trim();
}

export function renderTrackingTable(companyId) {
  const realRefs = companyId ? getRealRefs(companyId) : [];
  const hasReal = realRefs.length > 0;

  if (hasReal) {
    const fmtCOP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n || 0));
    const rows = realRefs.map((r) => {
      const pill = REF_PILL[r.status] || REF_PILL.escribio;
      const comm = REF_COMM_STATUSES.includes(r.status) && r.amount > 0
        ? fmtCOP(r.amount * r.commissionPct / 100)
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
                <th>Comisión generada</th>
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

  // Fallback: datos demo (cuando el admin aún no ha registrado referidos reales)
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
        <span class="muted">Operación 100% CS Travel</span>
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

export function renderGamification() {
  // Ventas del período derivadas del volumen real de los casos (no un literal).
  const sold = TXNS.filter((t) => EARNED_STATUSES.includes(t.status)).reduce((s, t) => s + t.sale, 0);
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

export function renderBenefitsCenter(sharedCode = 'CST') {
  // Los códigos se derivan del código de alianza de la empresa logueada.
  const base = sharedCode || 'CST';
  const benefits = [
    { key: 'clientes', title: 'Fidelización de clientes', code: `${base}-CLI`, audience: 'Para tu base de clientes', tag: 'Clientes' },
    { key: 'colaboradores', title: 'Bienestar de colaboradores', code: `${base}-COL`, audience: 'Para tu equipo de trabajo', tag: 'Colaboradores' },
  ];
  const cards = benefits.map((b) => {
    const link = benefitLink(b.code);
    const waMsg = `¡Hola! Como parte de nuestra comunidad tienes acceso preferencial a CS Travel Group. Reserva tus viajes con beneficios aquí: ${link} (código ${b.code}).`;
    return `
      <article class="benefit-card" data-link="${escapeHtml(link)}">
        <div class="benefit-card__avatar" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="benefit-card__content">
          <div class="benefit-card__head">
            <span class="benefit-card__tag">${escapeHtml(b.tag)}</span>
            <strong>${escapeHtml(b.title)}</strong>
            <span class="benefit-card__audience">${escapeHtml(b.audience)}</span>
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
        <h2 class="panel__title">Centro de beneficios · códigos activos</h2>
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

      <div class="partner-strip__block partner-strip__block--referral">
        <span class="partner-strip__label">Tu enlace de referidos</span>
        <div class="partner-strip__referral-url" id="av-referral-url" title="${escapeHtml(referralLink)}">${escapeHtml(referralLink)}</div>
        <div class="partner-strip__referral-actions">
          <button type="button" class="btn btn--primary btn--sm" id="av-copy-referral">Copiar enlace</button>
          <a href="${escapeHtml(referralLink)}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">Abrir</a>
          <span class="partner-strip__referral-note">Comparte este enlace con tu comunidad para que te acrediten la referencia.</span>
        </div>
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
