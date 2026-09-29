/**
 * EventMoneyView.js  ·  #/event/money
 * =============================================================================
 * PROPOSITO:
 *   «Dinero» del organizador: valor del evento, lo recaudado, lo que falta y lo
 *   vencido; quién paga qué (anfitrión frente a invitados); la cuenta del
 *   anfitrión con su botón «Pagar» y «Aportar a invitados»; el plan de pagos
 *   por metas; el recaudo por mes y los movimientos.
 *
 * REGLAS:
 *   - El organizador NUNCA registra dinero (regla 17): el dinero entra por los
 *     pagos del portal. Aquí solo paga SU cuenta anfitrión (payHref) y aporta.
 *   - «Aportar» (regla 7) solo con permiso 'titular'. Tres pasos: a quién,
 *     cuánto y la vista previa del efecto (eventService.previewContribution),
 *     que avisa qué cuentas quedarían con saldo a favor. Se confirma con
 *     confirmDialog.
 *   - En una boda ('solo_estado') no se muestran montos de otras cuentas: ni en
 *     «Cuentas», ni en la vista previa del aporte, ni en el detalle del mes.
 *
 * URL: ?e=<evento> &aportar=<ids de cuentas> (abre «Aportar» ya elegido).
 * =============================================================================
 */

import { eventService } from '../services/eventService.js';
import * as L from '../utils/eventLedger.js';
import { vocabFor } from '../utils/eventTemplates.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { payHref, payTargetAttrs } from '../utils/payLink.js';
import { shakeError } from '../utils/feedback.js';
import { showToast } from '../utils/toast.js';
import { ColumnChart } from '../components/Chart.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { infoBtn, bindInfoModals } from '../components/InfoModal.js';
import { registerTours } from '../components/Tour.js';
import { wireStyledSelects } from '../components/StyledSelect.js';
import {
  evIcon, money, moneyShort, pct, plural, fmtDay, monthLabel, monthLabelLong,
  loadOrganizerContext, noEventsHtml, eventSwitcher, bindEventSwitcher, countNode, runCountUp,
  accountBadge, movementsHtml, emptyHtml, subLine, portal, organizerLink, exportCsv, refreshEventBell, rerender, setLoading, setHashQuery,
} from '../components/EventKit.js';

/* ---------------------------------------------------------------------------
 * Indicadores
 * ------------------------------------------------------------------------ */

function moneyKpi({ label, value, hint, icon, accent = 'blue', info = '' }) {
  return `
    <article class="doctor-kpi doctor-kpi--${escapeHtml(accent)} ev-kpi">
      <div class="doctor-kpi__head"><span>${escapeHtml(label)}${info}</span><i aria-hidden="true">${evIcon(icon)}</i></div>
      <strong>${countNode(value)}</strong>
      <div class="doctor-kpi__foot ev-kpi__foot"><small>${escapeHtml(hint)}</small></div>
    </article>`;
}

/** Cuatro indicadores del dinero del evento (organizador y admin). */
export function moneyKpisHtml(data) {
  const t = data.summary.totals;
  const next = data.summary.nextMilestone;
  return `
    <section class="doctor-kpi-row ev-kpis ev-kpis--four" aria-label="Dinero del evento">
      ${moneyKpi({ label: 'Valor del evento', value: t.valor, hint: 'Lo que suman todas las cuentas', icon: 'layers', info: infoBtn({ target: '#ev-info-valor', title: 'Valor del evento' }) })}
      ${moneyKpi({ label: 'Recaudado', value: t.recaudado, hint: `${pct(t.pctRecaudado)} del valor`, icon: 'wallet', accent: 'violet', info: infoBtn({ target: '#ev-info-recaudado', title: 'Recaudado' }) })}
      ${moneyKpi({ label: 'Por recaudar', value: t.porRecaudar, hint: next ? `Próxima meta: ${fmtDay(next.date)}` : 'Sin metas pendientes', icon: 'flag', accent: 'amber', info: infoBtn({ target: '#ev-info-porrecaudar', title: 'Por recaudar' }) })}
      ${moneyKpi({ label: 'Vencido hoy', value: t.vencido, hint: t.vencido > 0 ? `${plural(data.summary.byStatus.atrasado || 0, 'cuenta atrasada', 'cuentas atrasadas')}` : 'Nadie va atrasado', icon: 'alert', accent: t.vencido > 0 ? 'red' : 'blue', info: infoBtn({ target: '#ev-info-vencido', title: 'Vencido hoy' }) })}
    </section>
    <div hidden>
      <div id="ev-info-valor"><p>Es la suma de lo que le toca a cada cuenta, incluida la del anfitrión: ${money(t.valor)}.</p><p>Si el anfitrión aporta a un invitado, el valor no cambia: solo cambia quién lo paga.</p></div>
      <div id="ev-info-recaudado"><p>Lo que ya entró por los pagos del portal (tarjeta, PSE o transferencia verificada por CS Travel Group): ${money(t.recaudado)}, el ${pct(t.pctRecaudado)} del valor.</p><p class="info-modal__hint">El organizador no registra pagos: así las cuentas siempre cuadran.</p></div>
      <div id="ev-info-porrecaudar"><p>Lo que les falta pagar a todas las cuentas: ${money(t.porRecaudar)}.</p><p>Cada cuenta tiene <b>metas acumuladas</b> («al 15 de octubre deberías llevar el 85 %»). Mientras cumpla sus metas va <b>al día</b>, aunque todavía le falte.</p></div>
      <div id="ev-info-vencido"><p>Lo que ya debería estar pagado según las metas que vencieron y todavía no entra: ${money(t.vencido)}.</p><p>Una meta vence al terminar su día. Las cuentas con algo vencido aparecen como <b>Atrasado</b>, con sus días de atraso.</p></div>
    </div>`;
}

/* ---------------------------------------------------------------------------
 * Quién paga qué
 * ------------------------------------------------------------------------ */

export function whoPaysHtml(data) {
  const t = data.summary.totals;
  const host = data.summary.host;
  const hostNeto = host ? host.neto : 0;
  const hostPaid = host ? host.pagado : 0;
  const guestsNeto = t.valor - hostNeto;
  const guestsPaid = t.recaudado - hostPaid;
  const total = Math.max(1, t.valor);
  const vocab = vocabFor(data.event.type, host ? host.displayName : data.event.hostDisplayName);
  const invCount = data.summary.accounts.filter((c) => c.kind !== 'anfitrion' && c.status !== 'sin_cargos').length;
  const side = (label, sub, neto, paid, cls) => `
    <div class="ev-side ${escapeHtml(cls)}">
      <div class="ev-side__head">
        <span class="ev-side__dot"></span>
        <strong>${escapeHtml(label)}</strong>
        <span class="ev-side__share">${pct(neto / total)}</span>
      </div>
      <small class="ev-side__sub">${escapeHtml(sub)}</small>
      <div class="ev-side__nums">
        <span><em>Le toca</em><b>${money(neto)}</b></span>
        <span><em>Pagado</em><b>${money(paid)}</b></span>
        <span><em>Falta</em><b>${money(Math.max(0, neto - paid))}</b></span>
      </div>
      <span class="ev-paycell__bar"><b style="--w:${Math.round(Math.max(0, Math.min(1, neto > 0 ? paid / neto : 0)) * 100)}%"></b></span>
    </div>`;
  return `
    <article class="panel ev-whopays">
      <div class="panel__header">
        <h2 class="panel__title">Quién paga qué ${infoBtn({ target: '#ev-info-quien', title: 'Quién paga qué' })}</h2>
        <span class="muted ev-small">${money(t.valor)} en total</span>
      </div>
      <div class="ev-split" aria-hidden="true">
        <span class="is-host" style="--w:${((hostNeto / total) * 100).toFixed(2)}%"></span>
        <span class="is-guests" style="--w:${((guestsNeto / total) * 100).toFixed(2)}%"></span>
      </div>
      <div class="ev-sides">
        ${side(host ? host.displayName : 'Anfitrión', vocab.anfitrionCard, hostNeto, hostPaid, 'is-host')}
        ${side(vocab.cuentas, plural(invCount, 'cuenta con cargos', 'cuentas con cargos'), guestsNeto, guestsPaid, 'is-guests')}
      </div>
      <div id="ev-info-quien" hidden>
        <p>El anfitrión puede cubrir una parte de lo de cada invitado. Cada peso que cubre sale de la cuenta del invitado y entra a la del anfitrión: el valor del evento no cambia.</p>
        <p>Hoy ${escapeHtml(host ? host.displayName : 'el anfitrión')} cubre ${money(hostNeto)} (${pct(hostNeto / total)}) y ${escapeHtml(vocab.cuentas.toLowerCase())} pagan ${money(guestsNeto)}.</p>
      </div>
    </article>`;
}

/* ---------------------------------------------------------------------------
 * Cuenta del anfitrión
 * ------------------------------------------------------------------------ */

/** Desglose de lo que cubre el anfitrión: por paquete (regla) y aportes. */
function hostBreakdown(data) {
  const host = data.summary.host;
  if (!host) return [];
  const lines = data.lines.filter((l) => L.sameId(l.accountId, host.accountId) && L.COBERTURA.includes(l.kind));
  const guestById = new Map(data.guests.map((g) => [String(g.id), g]));
  const pkgById = new Map(data.packages.map((p) => [String(p.id), p]));
  const groups = new Map();
  lines.forEach((l) => {
    const voluntary = l.origin === 'aporte';
    let key = 'Aportes a invitados';
    if (!voluntary) {
      const g = guestById.get(String(l.guestId));
      const p = g ? pkgById.get(String(g.packageId)) : null;
      key = (p && p.hostCoversLabel) || 'Cobertura por paquete';
    }
    if (!groups.has(key)) groups.set(key, { label: key, voluntary, total: 0, byGuest: new Map() });
    const grp = groups.get(key);
    grp.total += l.amount;
    grp.byGuest.set(String(l.guestId), (grp.byGuest.get(String(l.guestId)) || 0) + l.amount);
  });
  return [...groups.values()]
    .map((g) => {
      const amounts = [...g.byGuest.values()].filter((v) => v > 0);
      const same = amounts.length > 0 && amounts.every((v) => v === amounts[0]);
      return { label: g.label, voluntary: g.voluntary, total: g.total, people: amounts.length, each: same ? amounts[0] : null };
    })
    .filter((g) => g.total !== 0)
    .sort((a, b) => Number(a.voluntary) - Number(b.voluntary) || b.total - a.total);
}

export function hostAccountHtml(data) {
  const host = data.summary.host;
  if (!host) return '';
  const { event, view } = data;
  const can = view.can || {};
  const rows = hostBreakdown(data);
  const pay = host.payment || { canPay: false };
  const href = pay.canPay ? payHref({ reference: `event:${host.accountId}`, concept: `${event.title} · ${host.displayName}`, amount: pay.suggested }) : '';
  return `
    <article class="panel ev-host" id="anfitrion">
      <div class="panel__header">
        <h2 class="panel__title">Tu cuenta como anfitrión</h2>
        ${accountBadge(host)}
      </div>
      <p class="ev-host__lead">${escapeHtml(host.displayName)} cubre <b>${money(host.neto)}</b></p>
      <ul class="ev-host__rows">
        ${rows.length ? rows.map((r) => `
          <li>
            <span class="ev-host__ico">${evIcon(r.voluntary ? 'gift' : 'users')}</span>
            <span class="ev-host__txt">
              <strong>${escapeHtml(r.label)}</strong>
              <small>${plural(r.people, 'persona')}${r.each ? ` × ${money(r.each)}` : ''}</small>
            </span>
            <b>${money(r.total)}</b>
          </li>`).join('') : '<li class="ev-empty">Todavía no cubre nada.</li>'}
      </ul>
      <dl class="ev-host__sum">
        <div><dt>Pagado</dt><dd>${money(host.pagado)}</dd></div>
        <div><dt>${host.saldo < 0 ? 'Saldo a favor' : 'Saldo'}</dt><dd>${money(Math.abs(host.saldo))}</dd></div>
        <div><dt>Próxima meta</dt><dd>${host.next ? `${escapeHtml(fmtDay(host.next.date))} · faltan ${money(host.next.target - host.pagado)}` : 'Sin metas pendientes'}</dd></div>
      </dl>
      <div class="ev-host__actions">
        ${can.payHost && pay.canPay ? `<a class="btn btn--primary" id="ev-host-pay" href="${escapeHtml(href)}"${payTargetAttrs()}>${evIcon('card')}Pagar ${money(pay.suggested)}</a>` : ''}
        ${can.contribute ? `<button type="button" class="btn btn--ghost" id="ev-open-aportar">${evIcon('gift')}Aportar a invitados</button>` : ''}
        ${!can.payHost && !can.contribute ? '<p class="ev-empty">Pagar y aportar lo hace el titular del evento.</p>' : ''}
      </div>
    </article>`;
}

/* ---------------------------------------------------------------------------
 * Plan de pagos, recaudo por mes, cuentas y movimientos
 * ------------------------------------------------------------------------ */

export function planHtml(data, link = organizerLink(data.event.id)) {
  const rows = data.summary.milestones || [];
  if (!rows.length) return '';
  const reserva = data.event.plan && data.event.plan.reserva;
  return `
    <section class="panel ev-plan">
      <div class="panel__header">
        <h2 class="panel__title">Plan de pagos ${infoBtn({ target: '#ev-info-plan', title: 'Cómo funcionan las metas' })}</h2>
        <span class="muted ev-small">${reserva ? `Reserva ${reserva.pct ? `del ${reserva.pct} %` : `de ${money(reserva.amount)}`} a ${plural(reserva.dueDays ?? 7, 'día')} de confirmar · ` : ''}abono mínimo ${money(data.event.plan?.minAbono || 0)}</span>
      </div>
      <div class="table-wrapper only-desktop">
        <table class="data-table ev-table ev-plan__table">
          <thead><tr><th>Fecha</th><th>Meta</th><th class="ev-num">% acumulado</th><th class="ev-num">Meta del evento</th><th class="ev-num">Recaudado a esa fecha</th><th class="ev-num">Cuentas que no llegan</th></tr></thead>
          <tbody>
            ${rows.map((m) => {
              const f = m.vencida ? 'atrasados' : m.daysLeft <= 7 ? 'por_vencer' : 'todos';
              return `
                <tr class="clickable-row ${m.vencida ? 'is-past' : ''}" data-href="${escapeHtml(link('people', f !== 'todos' ? { f } : {}))}" tabindex="0">
                  <td><strong>${escapeHtml(fmtDay(m.date, { year: true }))}</strong><small class="ev-plan__when">${m.vencida ? 'Vencida' : m.daysLeft === 0 ? 'Hoy' : `En ${plural(m.daysLeft, 'día')}`}</small></td>
                  <td>${escapeHtml(m.label)}</td>
                  <td class="ev-num">${m.pct} %</td>
                  <td class="ev-num">${money(m.meta)}</td>
                  <td class="ev-num">
                    <span class="ev-plan__got">${money(m.recaudado)}</span>
                    <span class="ev-paycell__bar ev-plan__bar"><b style="--w:${Math.round(Math.min(1, m.pctRecaudado) * 100)}%"></b></span>
                  </td>
                  <td class="ev-num">${m.cuentas ? `<b class="${m.vencida ? 'ev-late' : ''}">${m.cuentas}</b>` : '<span class="ev-ok">Todas</span>'}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <ul class="only-mobile ev-plan-cards">
        ${rows.map((m) => {
          const f = m.vencida ? 'atrasados' : m.daysLeft <= 7 ? 'por_vencer' : 'todos';
          return `
            <li><a class="ev-plan-card ${m.vencida ? 'is-past' : ''}" href="${escapeHtml(link('people', f !== 'todos' ? { f } : {}))}">
              <span class="ev-plan-card__top"><strong>${escapeHtml(fmtDay(m.date, { year: true }))}</strong><em>${m.vencida ? 'Vencida' : m.daysLeft === 0 ? 'Hoy' : `En ${plural(m.daysLeft, 'día')}`}</em></span>
              <span class="ev-plan-card__lbl">${escapeHtml(m.label)} · ${m.pct} %</span>
              <span class="ev-paycell__bar"><b style="--w:${Math.round(Math.min(1, m.pctRecaudado) * 100)}%"></b></span>
              <span class="ev-plan-card__nums"><span>${money(m.recaudado)} de ${money(m.meta)}</span><b class="${m.cuentas && m.vencida ? 'ev-late' : ''}">${m.cuentas ? `${plural(m.cuentas, 'cuenta')} no llegan` : 'Todas llegan'}</b></span>
            </a></li>`;
        }).join('')}
      </ul>
      <div id="ev-info-plan" hidden>
        <p>El plan funciona por <b>metas acumuladas</b>: «al 31 de agosto deberías llevar el 60 %». Cada familia abona cuando puede, con un mínimo de ${money(data.event.plan?.minAbono || 0)}.</p>
        <p>Las metas dependen de lo que le toca HOY a cada cuenta. Si el anfitrión aporta, alguien cancela o cambia de paquete, se recalculan solas: nunca hay que rehacer cuotas.</p>
        <p class="info-modal__hint">Toca una fila para ver las cuentas que no llegan a esa meta.</p>
      </div>
    </section>`;
}

export function monthChartHtml(data) {
  const today = L.todayCO().slice(0, 7);
  const months = (data.summary.series || []).filter((m) => m.month <= today);
  const chart = months.length
    ? ColumnChart({ data: months.map((m) => ({ label: monthLabel(m.month), value: m.pagadoMes })), formatValue: moneyShort, color: '#0058c1', keepZero: true })
    : '<p class="ev-empty">Todavía no hay pagos.</p>';
  return `
    <article class="panel ev-months">
      <div class="panel__header"><h2 class="panel__title">Recaudo por mes</h2><span class="muted ev-small">Toca una barra para ver el mes</span></div>
      <div class="ev-months__chart" id="ev-month-chart">${chart}</div>
    </article>`;
}

export function accountsHtml(data, link = organizerLink(data.event.id)) {
  const amounts = data.view.amounts || data.view.role === 'admin';
  const list = data.summary.accounts
    .filter((c) => c.kind !== 'anfitrion' && c.status !== 'sin_cargos')
    .sort((a, b) => (b.exigible || 0) - (a.exigible || 0) || (b.diasAtraso || 0) - (a.diasAtraso || 0) || (b.saldo || 0) - (a.saldo || 0))
    .slice(0, 8);
  return `
    <article class="panel ev-accounts">
      <div class="panel__header"><h2 class="panel__title">Cuentas</h2><a class="link ev-link" href="${escapeHtml(link('people'))}">Ver todas ${evIcon('arrowRight')}</a></div>
      ${list.length ? `
        <ul class="ev-acclist ev-rows">
          ${list.map((c) => `
            <li>
              <a class="ev-acclist__row" href="${escapeHtml(link('people', { cuenta: c.accountId }))}">
                <span class="ev-acclist__name"><strong>${escapeHtml(c.displayName)}</strong><small>${escapeHtml(subLine(data.accounts.find((a) => L.sameId(a.id, c.accountId))))}</small></span>
                ${accountBadge(c)}
                <span class="ev-acclist__amt">${amounts && !c.amountsHidden ? (c.exigible > 0 ? `<b class="ev-late">${money(c.exigible)}</b><small>vencido</small>` : c.saldo > 0 ? `<b>${money(c.saldo)}</b><small>por pagar</small>` : c.saldo < 0 ? `<b>${money(-c.saldo)}</b><small>a favor</small>` : '<b>—</b>') : ''}</span>
              </a>
            </li>`).join('')}
        </ul>` : emptyHtml('Sin cuentas con cargos', 'Aparecen cuando las invitaciones confirman.')}
      ${amounts ? '' : `<p class="ev-note ev-note--inline">${evIcon('lock')}Solo estados: en este evento los montos de cada familia son privados.</p>`}
    </article>`;
}

/**
 * Movimientos de dinero: pagos, reembolsos, aportes voluntarios, cancelaciones
 * y penalidades. Los cargos y las coberturas por paquete no se listan aquí
 * (ya están resumidos en «Tu cuenta como anfitrión» y en cada ficha).
 */
function moneyMoves(lines) {
  return lines.filter((l) => !(l.kind === 'cargo' || (l.kind === 'aporte_anfitrion' && l.origin === 'regla_paquete')));
}

export function movementsPanelHtml(data) {
  const lines = moneyMoves(data.lines);
  const privateNote = !data.view.amounts && data.view.role !== 'admin';
  return `
    <section class="panel ev-movements">
      <div class="panel__header">
        <h2 class="panel__title">Movimientos recientes</h2>
        <button type="button" class="btn btn--ghost btn--sm" id="ev-money-csv">${evIcon('download')}Exportar CSV</button>
      </div>
      ${privateNote ? `<p class="ev-note ev-note--inline">${evIcon('lock')}Ves los movimientos de la cuenta del anfitrión. Los de cada familia son privados.</p>` : ''}
      ${movementsHtml(lines, { limit: 10, showRef: data.view.role === 'admin', accountName: (id) => (data.accounts.find((a) => L.sameId(a.id, id)) || {}).displayName || '' })}
    </section>`;
}

/* ---------------------------------------------------------------------------
 * Detalle de un mes (patrón period-detail del médico)
 * ------------------------------------------------------------------------ */

function monthDetailHtml(data, ym) {
  const month = (data.summary.series || []).find((m) => m.month === ym);
  const pays = data.lines.filter((l) => L.CAJA.includes(l.kind) && String(l.date).startsWith(ym));
  const byAccount = new Map();
  pays.forEach((l) => {
    const key = String(l.accountId);
    if (!byAccount.has(key)) byAccount.set(key, { total: 0, n: 0 });
    const x = byAccount.get(key);
    x.total -= l.amount;
    x.n += 1;
  });
  const name = (id) => (data.accounts.find((a) => L.sameId(a.id, id)) || {}).displayName || 'Cuenta';
  const rows = [...byAccount.entries()].sort((a, b) => b[1].total - a[1].total);
  const privateNote = !data.view.amounts && data.view.role !== 'admin';
  return `
    <div class="period-detail__summary ev-month__summary">
      <div class="period-detail__hero">
        <span class="period-detail__hero-label">Recaudado en el mes</span>
        <strong class="period-detail__hero-value">${money(month ? month.pagadoMes : 0)}</strong>
      </div>
      <div class="period-detail__stats">
        <div class="period-stat"><span class="period-stat__value">${money(month ? month.pagadoAcum : 0)}</span><span class="period-stat__label">Acumulado</span></div>
        <div class="period-stat"><span class="period-stat__value">${money(month ? month.metaAcum : 0)}</span><span class="period-stat__label">Meta acumulada</span></div>
      </div>
    </div>
    ${rows.length ? `
      <ul class="ev-acclist">
        ${rows.map(([id, x]) => `
          <li><div class="ev-acclist__row">
            <span class="ev-acclist__name"><strong>${escapeHtml(name(id))}</strong><small>${plural(x.n, 'movimiento')}</small></span>
            <span></span>
            <span class="ev-acclist__amt"><b>${money(x.total)}</b></span>
          </div></li>`).join('')}
      </ul>` : ''}
    ${privateNote ? `<p class="ev-note">${evIcon('lock')}El detalle por familia es privado en este evento: aquí ves el total del mes y los pagos de la cuenta del anfitrión.</p>` : ''}`;
}

/* ---------------------------------------------------------------------------
 * Aportar (regla 7): modal de 3 pasos con vista previa del efecto
 * ------------------------------------------------------------------------ */

const STEPS = ['¿A quién?', '¿Cuánto?', 'Confirmar'];

function recipientsFor(data) {
  const invitations = new Map(data.accounts.filter((a) => a.kind !== 'anfitrion').map((a) => [String(a.id), a]));
  return data.guests
    .filter((g) => g.status !== 'cancelado' && g.attendance === 'si' && invitations.has(String(g.accountId)))
    .map((g) => ({ g, a: invitations.get(String(g.accountId)) }));
}

/**
 * Abre «Aportar a invitados».
 * @param {object} data   - vista del evento (organizador titular o admin).
 * @param {object} preset - { accountIds?: [] } para elegir cuentas de entrada.
 */
export function openContributionModal(data, preset = {}, { onDone } = {}) {
  const { event } = data;
  const vocab = vocabFor(event.type, data.summary.host ? data.summary.host.displayName : event.hostDisplayName);
  const all = recipientsFor(data);
  const groups = [...new Set(all.map((x) => x.a.groupTag).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const presetIds = new Set((preset.accountIds || []).map(String));
  const st = {
    step: 0,
    who: presetIds.size ? 'personas' : 'todas',
    group: groups[0] || '',
    picked: new Set(all.filter((x) => presetIds.has(String(x.a.id))).map((x) => String(x.g.id))),
    mode: 'por_persona',
    amount: 0,
    preview: null,
  };
  const amounts = data.view.amounts || data.view.role === 'admin';

  let overlay = document.getElementById('ev-aportar');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay ev-modal-overlay';
  overlay.id = 'ev-aportar';
  overlay.innerHTML = `
    <div class="modal ev-modal" role="dialog" aria-modal="true" aria-labelledby="ev-aportar-title">
      <div class="modal__header ev-modal__header">
        <div>
          <h2 class="modal__title" id="ev-aportar-title">Aportar a ${escapeHtml(vocab.personas.toLowerCase())}</h2>
          <p class="modal__subtitle" id="ev-aportar-sub"></p>
        </div>
        <button type="button" class="modal__close ev-modal__close" data-close aria-label="Cerrar">${evIcon('x')}</button>
      </div>
      <ol class="ev-wsteps" aria-hidden="true">${STEPS.map((s, i) => `<li data-i="${i}"><span>${i + 1}</span>${escapeHtml(s)}</li>`).join('')}</ol>
      <div class="ev-wbody" id="ev-aportar-body"></div>
      <div class="ev-modal__foot">
        <button type="button" class="btn btn--ghost" data-back>${evIcon('arrowLeft')}Atrás</button>
        <button type="button" class="btn btn--primary" data-next>Siguiente${evIcon('arrowRight')}</button>
      </div>
    </div>`;
  portal(overlay);

  const body = overlay.querySelector('#ev-aportar-body');
  const sub = overlay.querySelector('#ev-aportar-sub');
  const back = overlay.querySelector('[data-back]');
  const next = overlay.querySelector('[data-next]');

  const chosen = () => {
    if (st.who === 'todas') return all;
    if (st.who === 'grupo') return all.filter((x) => x.a.groupTag === st.group);
    return all.filter((x) => st.picked.has(String(x.g.id)));
  };
  const target = () => {
    if (st.who === 'todas') return {};
    if (st.who === 'grupo') return { groupTag: st.group };
    return { guestIds: [...st.picked].map(Number) };
  };

  const stepWho = () => `
    <div class="ev-options" role="radiogroup" aria-label="A quién">
      <label class="ev-option ${st.who === 'todas' ? 'is-on' : ''}">
        <input type="radio" name="ev-who" value="todas" ${st.who === 'todas' ? 'checked' : ''} />
        <span class="ev-option__ico">${evIcon('users')}</span>
        <span><strong>Todas las personas confirmadas</strong><small>${plural(all.length, 'persona')}</small></span>
      </label>
      ${groups.length > 1 ? `
        <label class="ev-option ${st.who === 'grupo' ? 'is-on' : ''}">
          <input type="radio" name="ev-who" value="grupo" ${st.who === 'grupo' ? 'checked' : ''} />
          <span class="ev-option__ico">${evIcon('layers')}</span>
          <span><strong>Un ${escapeHtml(vocab.grupo.toLowerCase())}</strong><small>Por ejemplo, solo ${escapeHtml(groups[0])}</small></span>
        </label>
        <div class="ev-option__more" ${st.who === 'grupo' ? '' : 'hidden'}>
          <select class="form__input" id="ev-who-group" aria-label="${escapeHtml(vocab.grupo)}">
            ${groups.map((g) => `<option value="${escapeHtml(g)}" ${g === st.group ? 'selected' : ''}>${escapeHtml(g)} · ${plural(all.filter((x) => x.a.groupTag === g).length, 'persona')}</option>`).join('')}
          </select>
        </div>` : ''}
      <label class="ev-option ${st.who === 'personas' ? 'is-on' : ''}">
        <input type="radio" name="ev-who" value="personas" ${st.who === 'personas' ? 'checked' : ''} />
        <span class="ev-option__ico">${evIcon('userCheck')}</span>
        <span><strong>Personas elegidas</strong><small>${st.picked.size ? `${plural(st.picked.size, 'elegida', 'elegidas')}` : 'Marca a quién'}</small></span>
      </label>
      <div class="ev-option__more" ${st.who === 'personas' ? '' : 'hidden'}>
        <input type="search" class="form__input ev-pick-q" placeholder="Buscar persona o ${escapeHtml(vocab.grupo.toLowerCase())}..." aria-label="Buscar persona" />
        <div class="ev-pick">
          ${[...all].sort((x, y) => Number(st.picked.has(String(y.g.id))) - Number(st.picked.has(String(x.g.id)))).map((x) => `
            <label class="ev-pick__row" data-terms="${escapeHtml(`${L.guestName(x.g)} ${x.a.displayName} ${x.a.groupTag}`.toLowerCase())}">
              <input type="checkbox" value="${escapeHtml(x.g.id)}" ${st.picked.has(String(x.g.id)) ? 'checked' : ''} />
              <span><strong>${escapeHtml(L.guestName(x.g))}</strong><small>${escapeHtml(x.a.displayName)}${x.a.groupTag ? ` · ${escapeHtml(x.a.groupTag)}` : ''}</small></span>
            </label>`).join('')}
        </div>
      </div>
    </div>`;

  const stepHow = () => {
    const n = chosen().length;
    return `
      <div class="ev-seg ev-seg--wide" role="group" aria-label="Cómo aportar">
        <button type="button" data-mode="por_persona" class="${st.mode === 'por_persona' ? 'is-active' : ''}">Un valor por persona</button>
        <button type="button" data-mode="total" class="${st.mode === 'total' ? 'is-active' : ''}">Un total que se reparte</button>
      </div>
      <label class="ev-amount">
        <span class="ev-amount__label">${st.mode === 'total' ? 'Total a repartir' : 'Valor para cada persona'}</span>
        <span class="ev-amount__box"><span>$</span><input type="text" inputmode="numeric" id="ev-amount" autocomplete="off" value="${st.amount ? st.amount.toLocaleString('es-CO') : ''}" placeholder="0" aria-describedby="ev-amount-hint" /></span>
      </label>
      <div class="ev-quick">${(st.mode === 'total' ? [1000000, 2000000, 5000000] : [100000, 180000, 250000]).map((v) => `<button type="button" class="ev-chipbtn" data-quick="${escapeHtml(v)}">${money(v)}</button>`).join('')}</div>
      <p class="ev-amount__hint" id="ev-amount-hint"></p>
      <p class="ev-note">${evIcon('info')}Para ${plural(n, 'persona')}. Valores en múltiplos de $ 1.000. Nadie recibe más de lo que le toca: el exceso no se aplica.</p>`;
  };

  const stepConfirm = () => {
    const p = st.preview;
    if (!p) return '<p class="ev-empty">Calculando…</p>';
    const perText = p.mode === 'por_persona' ? money(p.perPerson) : `unos ${money(p.perPerson)}`;
    const credit = p.accountsWithCredit;
    return `
      <div class="ev-effect">
        <div class="ev-effect__big">
          <span>${evIcon('gift')}</span>
          <p>Cada ${escapeHtml(vocab.persona.toLowerCase())} baja <b>${perText}</b>; tu cuenta sube <b>${money(p.totalApplied)}</b>.</p>
        </div>
        <dl class="ev-effect__grid">
          <div><dt>Personas</dt><dd>${p.recipients.filter((r) => r.applied > 0).length}</dd></div>
          <div><dt>Cuentas</dt><dd>${p.accounts.filter((a) => a.applied > 0).length}</dd></div>
          <div><dt>Tu cuenta cubre</dt><dd>${money(p.hostNetoAntes)} <span class="ev-arrow">${evIcon('arrowRight')}</span> ${money(p.hostNetoDespues)}</dd></div>
        </dl>
        ${p.totalExcess > 0 ? `<p class="ev-note">${evIcon('info')}${money(p.totalExcess)} no se aplican: hay cuentas a las que ya les cubres todo lo que les toca.</p>` : ''}
        ${credit.length ? `
          <div class="ev-warn">
            <strong>${evIcon('alert')}${plural(credit.length, 'cuenta ya pagó', 'cuentas ya pagaron')} todo y quedaría${credit.length === 1 ? '' : 'n'} con saldo a favor</strong>
            <ul>${credit.slice(0, 6).map((c) => `<li>${escapeHtml(c.displayName)}${amounts ? ` · a favor ${money(c.aFavorDespues)}` : ''}</li>`).join('')}${credit.length > 6 ? `<li>y ${credit.length - 6} más</li>` : ''}</ul>
            <small>CS Travel Group les devuelve ese saldo o lo deja para otro viaje.</small>
          </div>` : ''}
      </div>`;
  };

  const readAmount = () => {
    const raw = overlay.querySelector('#ev-amount')?.value || '';
    return Number(raw.replace(/\D/g, '')) || 0;
  };
  const hint = () => {
    const el = overlay.querySelector('#ev-amount-hint');
    if (!el) return;
    const n = chosen().length;
    const v = readAmount();
    if (!v) { el.textContent = ''; return; }
    el.textContent = st.mode === 'total'
      ? `${money(v)} ÷ ${plural(n, 'persona')} ≈ ${money(n ? Math.floor(v / n / 1000) * 1000 : 0)} por persona`
      : `${plural(n, 'persona')} × ${money(v)} = ${money(v * n)}`;
  };

  const paint = (dir = 0) => {
    sub.textContent = `Paso ${st.step + 1} de 3 · ${STEPS[st.step]}`;
    overlay.querySelectorAll('.ev-wsteps li').forEach((li, i) => {
      li.classList.toggle('is-done', i < st.step);
      li.classList.toggle('is-current', i === st.step);
    });
    body.innerHTML = `<div class="ev-wpane ${dir > 0 ? 'from-right' : dir < 0 ? 'from-left' : ''}">${[stepWho, stepHow, stepConfirm][st.step]()}</div>`;
    back.hidden = st.step === 0;
    next.innerHTML = st.step === 2 && st.preview ? `${evIcon('gift')}Aportar ${money(st.preview.totalApplied)}` : `Siguiente${evIcon('arrowRight')}`;
    wireStyledSelects(body);
    bindPane();
  };

  const bindPane = () => {
    body.querySelectorAll('input[name="ev-who"]').forEach((r) => r.addEventListener('change', () => { st.who = r.value; paint(); }));
    body.querySelector('#ev-who-group')?.addEventListener('change', (e) => { st.group = e.target.value; });
    body.querySelectorAll('.ev-pick input[type="checkbox"]').forEach((c) => c.addEventListener('change', () => {
      if (c.checked) st.picked.add(c.value); else st.picked.delete(c.value);
      const small = body.querySelector('.ev-option.is-on small');
      if (small) small.textContent = st.picked.size ? plural(st.picked.size, 'elegida', 'elegidas') : 'Marca a quién';
    }));
    body.querySelector('.ev-pick-q')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      body.querySelectorAll('.ev-pick__row').forEach((row) => { row.hidden = q && !row.dataset.terms.includes(q); });
    });
    body.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { st.amount = readAmount(); st.mode = b.dataset.mode; paint(); }));
    const input = body.querySelector('#ev-amount');
    if (input) {
      input.addEventListener('input', () => {
        const v = Number(input.value.replace(/\D/g, '')) || 0;
        input.value = v ? v.toLocaleString('es-CO') : '';
        hint();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next.click(); } });
      setTimeout(() => input.focus(), 60);
      hint();
    }
    body.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
      input.value = Number(b.dataset.quick).toLocaleString('es-CO');
      hint();
      input.focus();
    }));
  };

  const close = () => {
    overlay.classList.remove('is-open');
    setHashQuery({ aportar: null });
    setTimeout(() => overlay.remove(), 360);
  };

  next.addEventListener('click', async () => {
    if (st.step === 0) {
      if (!chosen().length) { shakeError(next); showToast(st.who === 'personas' ? 'Marca al menos una persona.' : 'No hay personas confirmadas para ese aporte.', 'error'); return; }
      st.step = 1; paint(1); return;
    }
    if (st.step === 1) {
      const v = readAmount();
      if (!v || v % 1000 !== 0) { shakeError(overlay.querySelector('.ev-amount__box')); showToast('Escribe un valor en múltiplos de $ 1.000.', 'error'); return; }
      st.amount = v;
      setLoading(next, true);
      try {
        st.preview = await eventService.previewContribution(event.id, { target: target(), mode: st.mode, amount: v });
        if (st.preview.totalApplied <= 0) { showToast('Ninguna de esas personas puede recibir ese aporte: ya les cubres todo.', 'error'); return; }
        st.step = 2; paint(1);
      } catch (error) {
        showToast(error.message || 'No se pudo calcular el aporte.', 'error');
      } finally {
        setLoading(next, false);
        if (st.step === 2) next.innerHTML = `${evIcon('gift')}Aportar ${money(st.preview.totalApplied)}`;
      }
      return;
    }
    // Paso 3: confirmar.
    const p = st.preview;
    const ok = await confirmDialog({
      title: 'Confirmar el aporte',
      message: `<p>Vas a aportar <strong>${money(p.totalApplied)}</strong> a ${plural(p.recipients.filter((r) => r.applied > 0).length, 'persona')}. Su parte baja y la cuenta de ${escapeHtml(data.summary.host ? data.summary.host.displayName : 'el anfitrión')} sube lo mismo.</p>${p.accountsWithCredit.length ? `<p class="cst-modal__note">${plural(p.accountsWithCredit.length, 'cuenta quedará', 'cuentas quedarán')} con saldo a favor.</p>` : ''}<p class="cst-modal__note">Queda registrado en el libro del evento. Si hubo un error, CS Travel Group lo corrige con otro movimiento.</p>`,
      confirmLabel: 'Sí, aportar',
      cancelLabel: 'Revisar',
    });
    if (!ok) return;
    setLoading(next, true);
    try {
      await eventService.contribute(event.id, { target: target(), mode: st.mode, amount: st.amount });
      showToast(`Aporte registrado: ${money(p.totalApplied)}. Las metas de cada cuenta ya se recalcularon.`, 'success');
      close();
      onDone?.();
    } catch (error) {
      showToast(error.message || 'No se pudo registrar el aporte.', 'error');
    } finally {
      setLoading(next, false);
    }
  });
  back.addEventListener('click', () => { if (st.step > 0) { if (st.step === 1) st.amount = readAmount(); st.step -= 1; paint(-1); } });
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-close]')) close(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  paint();
  void overlay.offsetWidth;
  overlay.classList.add('is-open');
  setTimeout(() => overlay.querySelector('.ev-modal__close')?.focus({ preventScroll: true }), 80);
}

/* ---------------------------------------------------------------------------
 * Vista del organizador
 * ------------------------------------------------------------------------ */

let ctxCache = null;

export const EventMoneyView = {
  async render(ctx) {
    ctxCache = await loadOrganizerContext(ctx);
    const { user, events, data } = ctxCache;
    if (!data) return noEventsHtml(user);
    const { event } = data;
    return `
      <div class="evp">
        <div class="page-header ev-head">
          <div class="ev-head__text">
            <h1 class="page-title">Dinero</h1>
            <p class="page-subtitle">${escapeHtml(event.title)} · el dinero entra solo por los pagos del portal</p>
          </div>
          <div class="page-header__actions ev-head__actions">
            ${eventSwitcher(events, event, '#/event/money')}
          </div>
        </div>
        ${moneyKpisHtml(data)}
        <section class="ev-grid ev-grid--main">
          ${whoPaysHtml(data)}
          ${hostAccountHtml(data)}
        </section>
        ${planHtml(data)}
        <section class="ev-grid ev-grid--2">
          ${monthChartHtml(data)}
          ${accountsHtml(data)}
        </section>
        ${movementsPanelHtml(data)}
        <div class="modal-overlay modal-overlay--doctor" id="ev-month-modal">
          <div class="modal modal--period" role="dialog" aria-modal="true" aria-labelledby="ev-month-title">
            <div class="modal__header">
              <div><h2 class="modal__title" id="ev-month-title">Mes</h2><p class="modal__subtitle">Pagos que entraron en el mes</p></div>
              <button type="button" class="modal__close ev-modal__close" data-close-month aria-label="Cerrar">${evIcon('x')}</button>
            </div>
            <div id="ev-month-body"></div>
          </div>
        </div>
      </div>`;
  },

  async afterRender(ctx) {
    const { data } = ctxCache || {};
    if (!data) return;
    const root = document.querySelector('.evp');
    bindEventSwitcher(root);
    bindInfoModals();
    runCountUp(root);
    bindMoneyCommon(root, data);

    root.querySelector('#ev-open-aportar')?.addEventListener('click', () => openContributionModal(data, {}, { onDone: rerender }));
    if (ctx.query.aportar && data.view.can && data.view.can.contribute) {
      const ids = String(ctx.query.aportar).split(',').filter(Boolean);
      setTimeout(() => openContributionModal(data, { accountIds: ids }, { onDone: rerender }), 250);
    }
    if (ctx.query.ver === 'anfitrion') {
      root.querySelector('#anfitrion')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    refreshEventBell(data);
  },
};

/** Plan (filas clicables), barras del mes y CSV (organizador y admin). */
export function bindMoneyCommon(root, data) {
  root.querySelectorAll('.ev-plan tr[data-href]').forEach((tr) => tr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.location.hash = tr.dataset.href;
  }));
  const modal = portal(root.querySelector('#ev-month-modal'));
  const chart = root.querySelector('#ev-month-chart');
  const today = L.todayCO().slice(0, 7);
  const months = (data.summary.series || []).filter((m) => m.month <= today);
  const closeMonth = () => {
    modal?.classList.remove('is-open');
    chart?.querySelectorAll('.column-chart__col').forEach((c) => c.classList.remove('is-active', 'is-dimmed'));
  };
  chart?.querySelectorAll('.column-chart__col:not(.column-chart__col--empty)').forEach((col, _i, cols) => {
    col.classList.add('column-chart__col--clickable');
    col.setAttribute('tabindex', '0');
    col.setAttribute('role', 'button');
    const open = () => {
      const label = col.querySelector('small')?.textContent?.trim();
      const m = months.find((x) => monthLabel(x.month) === label);
      if (!m || !modal) return;
      cols.forEach((c) => { c.classList.toggle('is-active', c === col); c.classList.toggle('is-dimmed', c !== col); });
      modal.querySelector('#ev-month-title').textContent = monthLabelLong(m.month);
      modal.querySelector('#ev-month-body').innerHTML = monthDetailHtml(data, m.month);
      modal.classList.add('is-open');
    };
    col.addEventListener('click', open);
    col.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  modal?.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close-month]')) closeMonth(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal?.classList.contains('is-open')) closeMonth(); });

  root.querySelector('#ev-money-csv')?.addEventListener('click', () => {
    const name = (id) => (data.accounts.find((a) => L.sameId(a.id, id)) || {}).displayName || '';
    exportCsv(`movimientos-${data.event.slug || data.event.id}`, [
      ['Fecha', (l) => l.date],
      ['Cuenta', (l) => name(l.accountId)],
      ['Tipo', (l) => l.kind],
      ['Descripción', (l) => l.description],
      ['Valor', (l) => l.amount],
      ['Método', (l) => l.method || ''],
      ['Referencia', (l) => l.reference || ''],
    ], [...data.lines].sort((a, b) => (a.date < b.date ? 1 : -1)));
  });
}

registerTours({
  '#/event/money': {
    version: 1,
    title: 'Dinero del evento',
    intro: {
      que: 'Las cuentas del viaje: cuánto vale, cuánto ha entrado, cuánto falta y quién paga qué.',
      para: 'Seguir el recaudo sin Excel y pagar o aportar desde la cuenta del anfitrión.',
      como: 'Revisa las cuatro cifras de arriba, luego tu cuenta como anfitrión. Toca una fila del plan de pagos para ver quién no llega a esa meta.',
    },
    steps: [
      { sel: '.ev-kpis--four', title: 'Las cuatro cifras', text: 'Valor del evento, lo recaudado, lo que falta y lo vencido hoy. El botón «?» explica cada una con los números del evento.' },
      { panel: 'Quién paga qué', title: 'Quién paga qué', text: 'Lo que cubre el anfitrión frente a lo que pagan los invitados, con lo pagado de cada lado.' },
      { panel: 'Tu cuenta como anfitrión', title: 'Tu cuenta', text: 'Lo que cubres, lo que has pagado y tu próxima meta. «Pagar» abre la pasarela; «Aportar» reparte un valor entre los invitados.' },
      { panel: 'Plan de pagos', title: 'Plan de pagos', text: 'Las metas del evento con lo recaudado a cada fecha. Toca una fila para ver las cuentas que no llegan.' },
      { panel: 'Recaudo por mes', title: 'Mes a mes', text: 'Lo que entró cada mes. Toca una barra para ver el detalle.' },
      { panel: 'Cuentas', title: 'Cuentas', text: 'Las cuentas ordenadas por lo vencido: las primeras son las que más necesitan un recordatorio.' },
      { panel: 'Movimientos recientes', title: 'Movimientos', text: 'Pagos, coberturas y aportes, del más reciente al más antiguo. Exporta el CSV si lo necesitas.' },
    ],
  },
});

