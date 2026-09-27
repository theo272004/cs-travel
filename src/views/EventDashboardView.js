/**
 * EventDashboardView.js  ·  #/event/dashboard
 * =============================================================================
 * PROPOSITO:
 *   Inicio del ORGANIZADOR de un evento (la novia, la tesorera del comité,
 *   Talento Humano). En segundos: cuánto se ha recaudado, quién va atrasado,
 *   quién no ha respondido y en qué etapa va el evento. Misma composición que
 *   el panel del médico (hero + Pendientes + tres indicadores).
 *
 * QUE VE CADA ROL (regla 19): los datos llegan de eventService.getEventView(),
 *   ya filtrados. En una boda ('solo_estado') las cuentas de los invitados no
 *   traen montos: aquí solo se pintan estados y días de atraso.
 *
 * REUTILIZACION: renderOverview()/bindOverview() también los usa la pestaña
 *   Resumen del administrador (AdminEventDetailView).
 *
 * Los títulos de los paneles no deben cambiar: la guía los busca por texto.
 * =============================================================================
 */

import { eventService } from '../services/eventService.js';
import * as L from '../utils/eventLedger.js';
import { vocabFor } from '../utils/eventTemplates.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { SemiGaugeChart, LineChart } from '../components/Chart.js';
import { infoBtn, bindInfoModals } from '../components/InfoModal.js';
import { registerTours } from '../components/Tour.js';
import {
  evIcon, money, moneyShort, monthBarsHtml, pct, plural, fmtDay, fmtDayLong, saludo, firstName, monthLabel,
  loadOrganizerContext, noEventsHtml, eventSwitcher, bindEventSwitcher, eventChips,
  countNode, runCountUp, progressBar, stagesHtml, activityHtml, advisorStrip,
  accountBadge, subLine, isPendingRsvp, organizerLink, remindAccount, openAccountDrawer, emptyHtml, refreshEventBell,
} from '../components/EventKit.js';

/* ---------------------------------------------------------------------------
 * Piezas del resumen (compartidas con el admin)
 * ------------------------------------------------------------------------ */

/** Hero «Recaudado»: valor, avance con la meta a hoy y la próxima meta. */
function heroHtml(data) {
  const { totals, nextMilestone: next, series } = data.summary;
  const ratio = totals.valor > 0 ? totals.recaudado / totals.valor : 0;
  const today = L.todayCO().slice(0, 7);
  const months = (series || []).filter((m) => m.month <= today).slice(-8);
  const maxMonth = Math.max(1, ...months.map((m) => m.pagadoMes));
  const bars = months.map((m) => `<b style="--h:${Math.max(6, Math.round((m.pagadoMes / maxMonth) * 100))}%" data-tip="${escapeHtml(`${monthLabel(m.month)}: ${money(m.pagadoMes)}`)}"></b>`).join('');
  const nextText = next
    ? `<span class="gain-hero__pipe-label">Próxima meta · ${escapeHtml(fmtDay(next.date))}</span>
       <strong class="gain-hero__pipe-value">${next.falta > 0 ? `Faltan ${money(next.falta)} en ${plural(next.cuentas, 'cuenta')}` : next.meta > 0 ? 'Cumplida por todas las cuentas' : 'Aún no hay cuentas con cargos'}</strong>`
    : `<span class="gain-hero__pipe-label">Plan de pagos</span>
       <strong class="gain-hero__pipe-value">Sin metas pendientes</strong>`;
  return `
    <article class="gain-hero ev-hero" aria-label="Recaudado">
      <div class="gain-hero__head">
        <span class="gain-hero__label">Recaudado ${infoBtn({ target: '#ev-info-recaudo', title: 'Cómo se mide el recaudo' })}</span>
        <span class="gain-hero__year">${pct(ratio)} del evento</span>
      </div>
      <strong class="gain-hero__value">${countNode(totals.recaudado)}</strong>
      <span class="ev-hero__sub">de ${money(totals.valor)} del evento</span>
      <div class="ev-hero__track">
        ${progressBar({ value: totals.recaudado, max: totals.valor, marker: totals.metaAHoy, markerLabel: `Meta a hoy: ${money(totals.metaAHoy)}`, tone: 'light', label: 'Avance del recaudo' })}
        <span class="ev-hero__legend"><i></i>Meta a hoy ${money(totals.metaAHoy)}</span>
      </div>
      <div class="gain-hero__pipeline ev-hero__next">
        <span class="gain-hero__pipeicon" aria-hidden="true">${evIcon('flag')}</span>
        <div>${nextText}</div>
      </div>
      ${months.length ? `<span class="ev-hero__bars" aria-hidden="true">${bars}</span>` : ''}
    </article>
    <div id="ev-info-recaudo" hidden>
      <p><b>Recaudado</b> es la suma de lo que han pagado todas las cuentas, incluida la del anfitrión: ${money(totals.recaudado)} de ${money(totals.valor)}.</p>
      <p>Cada cuenta tiene <b>metas acumuladas</b> («al 15 de octubre deberías llevar el 85 %»). La <b>meta a hoy</b> suma lo que cada cuenta ya debería llevar: ${money(totals.metaAHoy)}.</p>
      ${next ? `<p>La <b>próxima meta</b> del evento es el ${escapeHtml(fmtDayLong(next.date))}. Para cumplirla faltan ${money(next.falta)} en ${plural(next.cuentas, 'cuenta')} (sin contar lo que ya está vencido).</p>` : ''}
      <p class="info-modal__hint">Las metas se recalculan solas cuando llega un aporte, alguien cancela o cambia de paquete.</p>
    </div>`;
}

const PEND_CATS = [
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'por_vencer', label: 'Por vencer' },
  { key: 'sin_responder', label: 'Sin responder' },
];

/** Cuentas que requieren atención, en orden de urgencia. */
function pendingItems(data) {
  const byId = data.summary.byId;
  const items = [];
  data.accounts.forEach((a) => {
    if (a.kind === 'anfitrion') return;
    const c = byId.get(String(a.id));
    if (c && c.status === 'atrasado') items.push({ a, c, cat: 'atrasados', rank: 0, sort: -c.diasAtraso });
    else if (c && c.status === 'por_vencer') items.push({ a, c, cat: 'por_vencer', rank: 1, sort: c.next ? c.next.daysLeft : 99 });
    else if (isPendingRsvp(a.rsvp)) items.push({ a, c, cat: 'sin_responder', rank: 2, sort: a.rsvp === 'vista' ? 0 : a.rsvp === 'enviada' ? 1 : 2 });
  });
  return items.sort((x, y) => x.rank - y.rank || x.sort - y.sort);
}

function pendRowsHtml(items, data) {
  if (!items.length) return emptyHtml('Todo al día', 'Nadie está atrasado ni sin responder en esta categoría.');
  const canRemind = data.view.can && data.view.can.remind;
  const tail = items.length < 3 ? `<p class="ev-pend__tail">${evIcon('checkCircle')}Las demás cuentas van al día.</p>` : '';
  return items.slice(0, 30).map(({ a, c, cat }) => {
    const status = cat === 'sin_responder'
      ? `<span class="badge badge--gray">${a.rsvp === 'vista' ? 'Vio la invitación' : a.rsvp === 'enviada' ? 'Sin abrir' : 'Sin enviar'}</span>`
      : accountBadge(c);
    const action = canRemind && a.rsvp !== 'sin_enviar'
      ? `<button type="button" class="btn btn--sm ev-pend__act" data-remind="${a.id}">${evIcon('message')}Recordar</button>`
      : `<button type="button" class="btn btn--sm btn--ghost ev-pend__act" data-open="${a.id}">Ver</button>`;
    return `
      <div class="ev-pend__row">
        <button type="button" class="ev-pend__main" data-open="${a.id}">
          <strong>${escapeHtml(a.displayName)}</strong>
          <small>${escapeHtml(subLine(a))}</small>
        </button>
        <span class="ev-pend__status">${status}</span>
        ${action}
      </div>`;
  }).join('') + tail;
}

function pendingPanelHtml(data, link) {
  const items = pendingItems(data);
  const counts = { todos: items.length };
  PEND_CATS.forEach((cat) => { counts[cat.key] = items.filter((x) => x.cat === cat.key).length; });
  const chips = [{ key: 'todos', label: 'Todos' }, ...PEND_CATS].map((cat, i) => `
    <button type="button" class="ev-chipbtn ${i === 0 ? 'is-active' : ''}" data-pend="${cat.key}" aria-pressed="${i === 0}">
      ${escapeHtml(cat.label)} <span>${counts[cat.key]}</span>
    </button>`).join('');
  return `
    <article class="panel ev-pend">
      <div class="panel__header">
        <h2 class="panel__title">${items.length ? '<span class="pulse-dot ev-pulse" aria-hidden="true"></span>' : ''}Pendientes</h2>
        <a class="link ev-link" href="${link('people')}">Ver personas ${evIcon('arrowRight')}</a>
      </div>
      <div class="ev-chipbar" role="group" aria-label="Filtrar pendientes">${chips}</div>
      <div class="ev-pend__list ev-rows" id="ev-pend-list">${pendRowsHtml(items, data)}</div>
    </article>`;
}

/** Tarjeta KPI con el patrón del panel del médico (doctor-kpi) y una mini barra. */
export function kpiCard({ label, value, hint, icon, href, bar = null, accent = 'blue', info = '' }) {
  const tag = href ? 'a' : 'article';
  return `
    <${tag} class="doctor-kpi doctor-kpi--${accent} ev-kpi ${href ? 'doctor-kpi--clickable' : ''}" ${href ? `href="${href}"` : ''}>
      <div class="doctor-kpi__head">
        <span>${escapeHtml(label)}${info}</span>
        <i aria-hidden="true">${evIcon(icon)}</i>
      </div>
      <strong>${value}</strong>
      <div class="doctor-kpi__foot ev-kpi__foot">
        <small>${escapeHtml(hint)}</small>
      </div>
      ${bar != null ? `<span class="ev-kpi__bar"><b style="--w:${Math.round(Math.max(0, Math.min(1, bar)) * 100)}%"></b></span>` : ''}
    </${tag}>`;
}

function kpisHtml(data, link, { extra = '' } = {}) {
  const { summary, event } = data;
  const vocab = vocabFor(event.type, summary.host ? summary.host.displayName : event.hostDisplayName);
  const people = summary.people;
  const inv = summary.invitations;
  const host = summary.host;
  return `
    <section class="doctor-kpi-row doctor-kpi-row--trio ev-kpis ${extra ? 'ev-kpis--four' : ''}" aria-label="Indicadores">
      ${kpiCard({
        label: 'Confirmados',
        value: `${countNode(people.confirmadas, 'int')}<small class="ev-kpi__of"> / ${people.cupo || '—'}</small>`,
        hint: `${inv.respondidas} de ${plural(inv.total, 'invitación', 'invitaciones')} respondidas`,
        icon: 'userCheck',
        href: link('people', { f: 'confirmadas' }),
        bar: people.cupo ? people.confirmadas / people.cupo : null,
      })}
      ${kpiCard({
        label: 'Cuentas al día',
        value: summary.totals.cuentasConCargos ? countNode(summary.totals.pctAlDia, 'pct') : '—',
        hint: `${summary.totals.cuentasAlDia} de ${plural(summary.totals.cuentasConCargos, 'cuenta')} · ${plural(summary.byStatus.atrasado || 0, 'atrasada')}`,
        icon: 'checkCircle',
        href: link('people', { f: 'atrasados' }),
        bar: summary.totals.cuentasConCargos ? summary.totals.pctAlDia : 0,
        accent: 'violet',
      })}
      ${host ? kpiCard({
        label: vocab.anfitrionCard,
        value: countNode(host.neto),
        hint: host.saldo > 0 ? `Pagado ${money(host.pagado)} · falta ${money(host.saldo)}` : `Pagado ${money(host.pagado)}`,
        icon: 'gift',
        href: link('money', { ver: 'anfitrion' }),
        bar: host.neto > 0 ? host.pagado / host.neto : 0,
        accent: 'amber',
      }) : ''}
      ${extra}
    </section>`;
}

/** Gráficos: asistencia (medidor) y recaudo acumulado: meta frente a real. */
function chartsHtml(data) {
  const p = data.summary.people;
  const gauge = SemiGaugeChart({
    segments: [
      { label: 'Confirmadas', value: p.confirmadas, color: '#0058c1' },
      { label: 'Sin responder', value: p.sinResponder, color: '#9cc6ff' },
      { label: 'No asisten', value: p.noAsisten, color: '#c3ccd8' },
      { label: 'Canceladas', value: p.canceladas, color: '#6b7787' },
    ],
    centerValue: String(p.confirmadas),
    centerLabel: 'personas van',
    formatValue: (v) => plural(v, 'persona'),
  });
  const today = L.todayCO().slice(0, 7);
  const months = (data.summary.series || []).filter((m) => m.month <= today);
  const line = months.length >= 2
    ? LineChart({
      labels: months.map((m) => monthLabel(m.month)),
      series: [
        { name: 'Meta acumulada', values: months.map((m) => m.metaAcum), color: '#9cc6ff' },
        { name: 'Recaudado', values: months.map((m) => m.pagadoAcum), color: '#0058c1' },
      ],
      formatValue: (v) => moneyShort(v),
      id: `ev-line-${data.event.id}`,
    })
    : '<p class="ev-empty">El gráfico aparece cuando haya pagos de al menos dos meses.</p>';
  const lineBlock = months.length >= 2
    ? `<div class="only-desktop">${line}</div><div class="only-mobile">${monthBarsHtml(months)}</div>`
    : line;
  return `
    <section class="ev-grid ev-grid--charts">
      <article class="panel ev-chart-panel">
        <div class="panel__header"><h2 class="panel__title">Asistencia</h2><span class="muted ev-small">${plural(p.confirmadas + p.sinResponder + p.noAsisten + p.canceladas, 'persona')}</span></div>
        <div class="ev-gauge">${gauge}</div>
      </article>
      <article class="panel ev-chart-panel">
        <div class="panel__header"><h2 class="panel__title">Recaudo: meta vs real</h2><span class="muted ev-small">Acumulado por mes hasta hoy</span></div>
        <div class="ev-line">${lineBlock}</div>
      </article>
    </section>`;
}

const STAGE_TEXT = {
  invitaciones: () => 'Se están enviando las invitaciones.',
  confirmaciones: (d) => {
    const pending = d.summary.rsvp.enviada + d.summary.rsvp.vista + d.summary.rsvp.sin_enviar;
    return `${plural(pending, 'invitación', 'invitaciones')} sin responder${d.event.rsvpDeadline ? ` · plazo para responder: ${fmtDayLong(d.event.rsvpDeadline)}` : ''}.`;
  },
  pagos: (d) => (d.summary.nextMilestone ? `Próxima meta del plan: ${fmtDayLong(d.summary.nextMilestone.date)}.` : 'Las confirmaciones cerraron; siguen los pagos.'),
  viaje: () => 'El grupo está de viaje. CS Travel Group acompaña cada traslado.',
  cierre: () => 'El viaje terminó. Quedan los saldos y el cierre de cuentas.',
};

function stagesPanelHtml(data) {
  const text = (STAGE_TEXT[data.summary.stage] || (() => ''))(data);
  return `
    <section class="panel ev-stages-panel">
      <div class="panel__header"><h2 class="panel__title">Etapas del evento</h2><span class="muted ev-small">${escapeHtml(text)}</span></div>
      ${stagesHtml(data.summary.stage)}
    </section>`;
}

function activityPanelHtml(data) {
  return `
    <section class="panel ev-activity-panel">
      <div class="panel__header"><h2 class="panel__title">Actividad reciente</h2><span class="muted ev-small">${data.view.amounts || data.view.role === 'admin' ? '' : 'Sin montos de los invitados'}</span></div>
      ${activityHtml(data.log, { limit: 8 })}
    </section>`;
}

/**
 * Secciones del resumen (hero + Pendientes, indicadores, gráficos, etapas y
 * actividad). `link` arma los enlaces (organizerLink o adminLink de EventKit).
 */
export function renderOverview(data, { link = organizerLink(data.event.id), extraKpi = '', beforeCharts = '' } = {}) {
  return `
    <section class="doctor-top-grid ev-top" aria-label="Recaudo y pendientes">
      ${heroHtml(data)}
      ${pendingPanelHtml(data, link)}
    </section>
    ${kpisHtml(data, link, { extra: extraKpi })}
    ${beforeCharts}
    ${chartsHtml(data)}
    ${stagesPanelHtml(data)}
    ${activityPanelHtml(data)}`;
}

/** Enlaza el resumen: chips de Pendientes, Recordar, fichas y cifras. */
export function bindOverview(root, data, { onChange, onContribute } = {}) {
  const list = root.querySelector('#ev-pend-list');
  const items = pendingItems(data);
  root.querySelectorAll('[data-pend]').forEach((chip) => {
    chip.addEventListener('click', () => {
      root.querySelectorAll('[data-pend]').forEach((b) => { b.classList.toggle('is-active', b === chip); b.setAttribute('aria-pressed', String(b === chip)); });
      const cat = chip.dataset.pend;
      list.classList.remove('is-swapping');
      void list.offsetWidth;
      list.classList.add('is-swapping');
      list.innerHTML = pendRowsHtml(cat === 'todos' ? items : items.filter((x) => x.cat === cat), data);
    });
  });
  list?.addEventListener('click', async (e) => {
    const remind = e.target.closest('[data-remind]');
    const open = e.target.closest('[data-open]');
    if (remind) {
      const account = data.accounts.find((a) => L.sameId(a.id, remind.dataset.remind));
      const updated = await remindAccount({ event: data.event, account, button: remind });
      if (updated) {
        Object.assign(account, updated);
        remind.classList.add('is-done');
        remind.innerHTML = `${evIcon('check')}Enviado`;
      }
    } else if (open) {
      openAccountDrawer({ data, accountId: open.dataset.open, trigger: open, onChange, onContribute });
    }
  });
  bindInfoModals();
  runCountUp(root);
}

/* ---------------------------------------------------------------------------
 * Vista del organizador
 * ------------------------------------------------------------------------ */

let ctxCache = null;

export const EventDashboardView = {
  async render(ctx) {
    ctxCache = await loadOrganizerContext(ctx);
    const { user, events, data } = ctxCache;
    if (!data) return noEventsHtml(user);
    const { event } = data;
    const canInvite = data.view.can && data.view.can.invite;
    return `
      <div class="evp">
        <div class="page-header ev-head">
          <div class="ev-head__text">
            <h1 class="page-title"><span class="page-title__greet">${saludo()},</span> ${escapeHtml(firstName(user.name))}</h1>
            <p class="ev-head__event">${escapeHtml(event.title)}</p>
            <p class="page-subtitle ev-chips">${eventChips(event)}</p>
          </div>
          <div class="page-header__actions ev-head__actions">
            ${eventSwitcher(events, event, '#/event/dashboard')}
            ${canInvite ? `<a class="btn btn--primary" href="#/event/invite?e=${event.id}">${evIcon('plus')}Invitar</a>` : ''}
          </div>
        </div>
        ${renderOverview(data)}
        ${advisorStrip(event, { who: user.name })}
      </div>`;
  },

  async afterRender() {
    const { data } = ctxCache || {};
    if (!data) return;
    const root = document.querySelector('.evp');
    bindEventSwitcher(root);
    bindOverview(root, data, {
      onChange: () => window.dispatchEvent(new HashChangeEvent('hashchange')),
      onContribute: (target) => { window.location.hash = `#/event/money?e=${data.event.id}&aportar=${(target.accountIds || []).join(',')}`; },
    });
    refreshEventBell(data);
  },
};

/* ---------------------------------------------------------------------------
 * Guía de la página
 * ------------------------------------------------------------------------ */

registerTours({
  '#/event/dashboard': {
    version: 1,
    title: 'Inicio del evento',
    intro: {
      que: 'El tablero de tu evento: cuánto se ha recaudado, quién va y quién necesita un recordatorio.',
      para: 'Saber en segundos cómo va el viaje sin llevar cuentas en Excel ni preguntar a cada familia.',
      como: 'Empieza por Pendientes: toca «Recordar» y se abre WhatsApp con un mensaje listo, sin montos. Toca un nombre para ver su ficha.',
    },
    steps: [
      { sel: '.ev-head', title: 'Tu evento', text: 'El nombre del viaje, las fechas, el destino, su estado y cuántos días faltan.' },
      { sel: '.ev-hero', title: 'Recaudado', text: 'Lo que han pagado todas las cuentas frente al valor del evento. La marca blanca es la meta a hoy; abajo, la próxima meta y cuánto falta.' },
      { panel: 'Pendientes', title: 'Pendientes', text: 'Atrasados, metas por vencer e invitaciones sin responder. «Recordar» abre WhatsApp con el enlace personal de esa familia y queda registrado.' },
      { sel: '.ev-kpis', title: 'Indicadores', text: 'Personas confirmadas frente al cupo, el porcentaje de cuentas al día y lo que cubre el anfitrión. Toca una tarjeta para ver la lista filtrada.' },
      { panel: 'Asistencia', title: 'Asistencia', text: 'Cuántas personas van, cuántas no han respondido y cuántas no asisten.' },
      { panel: 'Recaudo: meta vs real', title: 'Meta frente a lo real', text: 'Mes a mes, lo que se debería llevar recaudado y lo que de verdad entró.' },
      { panel: 'Etapas del evento', title: 'Etapas', text: 'De las invitaciones al cierre: la etapa resaltada es la actual.' },
      { panel: 'Actividad reciente', title: 'Actividad', text: 'Confirmaciones, pagos, aportes y recordatorios, del más reciente al más antiguo.' },
      { sel: '.ev-advisor', title: 'Tu asesor', text: 'La persona de CS Travel Group que acompaña tu evento. Escríbele por WhatsApp para cualquier cambio.' },
    ],
  },
});
