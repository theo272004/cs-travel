/**
 * AdminEventsView.js  ·  #/admin/events
 * =============================================================================
 * PROPOSITO:
 *   Portafolio de eventos de CS Travel Group: todas las bodas, promociones y viajes
 *   de empresa con sus cifras (confirmados, recaudo, vencido, saldos a favor)
 *   y las próximas metas de todos. Desde aquí se entra a cada evento.
 *
 * DATOS: eventService.getPortfolio() (resúmenes calculados del libro) y, para
 *   el buscador de cuentas y personas, las colecciones eventAccounts y
 *   eventGuests. Solo el admin entra aquí (ruta con role 'admin').
 *
 * DEMO: el ítem «Eventos» del menú va marcado demoOnly: en el portal
 *   desplegado no aparece hasta que exista el backend.
 * =============================================================================
 */

import { eventService } from '../services/eventService.js';
import { apiService } from '../services/apiService.js';
import * as L from '../utils/eventLedger.js';
import { getTemplate } from '../utils/eventTemplates.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { registerTours } from '../components/Tour.js';
import {
  evIcon, money, moneyShort, pct, plural, fmtDay, fmtRange, countdownText, TEMPLATE_ICON,
  countNode, runCountUp, emptyHtml, setHashQuery, dayParts,
} from '../components/EventKit.js';

/** Un tono de la familia azul por plantilla (franja de la tarjeta). */
export const TEMPLATE_TONE = { boda: '#5a9df0', promocion: '#0058c1', empresa: '#06244d', otro: '#9cc6ff' };

const TYPE_FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'boda', label: 'Bodas' },
  { key: 'promocion', label: 'Promociones' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'otro', label: 'Otros' },
];
const STATUS_FILTERS = [
  { key: 'activos', label: 'Activos' },
  { key: 'borrador', label: 'Borradores' },
  { key: 'terminados', label: 'Terminados' },
  { key: 'todos', label: 'Todos los estados' },
];
const STATUS_TEST = {
  activos: (e) => ['abierto', 'cerrado', 'en_viaje'].includes(e.status),
  borrador: (e) => e.status === 'borrador',
  terminados: (e) => ['finalizado', 'cancelado'].includes(e.status),
  todos: () => true,
};

let cache = null;
const st = { type: 'todos', status: 'activos', q: '' };

function eventCard({ event, summary }) {
  const tpl = getTemplate(event.type);
  const t = summary.totals;
  const p = summary.people;
  const late30 = summary.alerts.atrasadas30.length;
  const favor = summary.alerts.saldosAFavor.length;
  const next = summary.nextMilestone;
  return `
    <a class="ev-pcard" href="#/admin/events/${event.id}" style="--tone:${TEMPLATE_TONE[event.type] || TEMPLATE_TONE.otro}">
      <span class="ev-pcard__stripe" aria-hidden="true"></span>
      <div class="ev-pcard__top">
        <span class="ev-pcard__type">${evIcon(TEMPLATE_ICON[event.type] || 'calendar')}${escapeHtml(tpl.label)}</span>
        ${StatusBadge(event.status)}
      </div>
      <h3 class="ev-pcard__title">${escapeHtml(event.title)}</h3>
      <p class="ev-pcard__host">${escapeHtml(event.hostDisplayName || '')}</p>
      <p class="ev-pcard__meta">${evIcon('pin')}${escapeHtml(event.destination || '—')}<span>·</span>${evIcon('calendar')}${escapeHtml(fmtRange(event.startDate, event.endDate))}</p>
      <span class="ev-pcard__count">${evIcon('hourglass')}${escapeHtml(countdownText(event))}</span>
      <div class="ev-pcard__bars">
        <div>
          <span class="ev-pcard__lbl">Confirmados <b>${p.confirmadas} / ${p.cupo || '—'}</b></span>
          <span class="ev-paycell__bar"><b style="--w:${Math.round(Math.min(1, p.cupo ? p.confirmadas / p.cupo : 0) * 100)}%"></b></span>
        </div>
        <div>
          <span class="ev-pcard__lbl">Recaudo <b>${pct(t.pctRecaudado)}</b></span>
          <span class="ev-paycell__bar"><b style="--w:${Math.round(Math.min(1, t.pctRecaudado) * 100)}%"></b></span>
        </div>
      </div>
      <dl class="ev-pcard__nums">
        <div><dt>Recaudado</dt><dd>${moneyShort(t.recaudado)}</dd></div>
        <div><dt>Por recaudar</dt><dd>${moneyShort(t.porRecaudar)}</dd></div>
        <div><dt>Vencido</dt><dd class="${t.vencido > 0 ? 'ev-late' : ''}">${moneyShort(t.vencido)}</dd></div>
      </dl>
      <div class="ev-pcard__alerts">
        ${late30 ? `<span class="ev-alert ev-alert--red">${evIcon('alert')}${plural(late30, 'cuenta', 'cuentas')} con más de 30 días de atraso</span>` : ''}
        ${favor ? `<span class="ev-alert ev-alert--blue">${evIcon('undo')}${plural(favor, 'saldo', 'saldos')} a favor por reembolsar</span>` : ''}
        ${summary.alerts.metaBaja ? `<span class="ev-alert ev-alert--amber">${evIcon('flag')}Meta del ${escapeHtml(fmtDay(summary.alerts.metaBaja.date))} con recaudo bajo</span>` : ''}
        ${!late30 && !favor && !summary.alerts.metaBaja ? `<span class="ev-alert ev-alert--ok">${evIcon('checkCircle')}Sin alertas${next ? ` · próxima meta ${escapeHtml(fmtDay(next.date))}` : ''}</span>` : ''}
      </div>
      <span class="ev-pcard__open">Abrir evento ${evIcon('arrowRight')}</span>
    </a>`;
}

function upcomingHtml(portfolio) {
  const rows = [];
  portfolio.forEach(({ event, summary }) => {
    (summary.milestones || []).filter((m) => !m.vencida).slice(0, 2).forEach((m) => rows.push({ event, m, next: summary.nextMilestone }));
  });
  rows.sort((a, b) => a.m.date.localeCompare(b.m.date));
  if (!rows.length) return emptyHtml('Sin metas pendientes', 'Cuando haya eventos abiertos, aquí verás sus próximas metas.');
  return `
    <ul class="ev-upcoming ev-rows">
      ${rows.slice(0, 8).map(({ event, m, next }) => {
        const isNext = next && next.key === m.key;
        const falta = isNext ? next.falta : m.falta;
        const cuentas = isNext ? next.cuentas : m.cuentas;
        return `
          <li>
            <a class="ev-upcoming__row" href="#/admin/events/${event.id}?tab=dinero">
              <span class="ev-upcoming__date"><b>${escapeHtml(dayParts(m.date).day)}</b><small>${escapeHtml(dayParts(m.date).month)}</small></span>
              <span class="ev-upcoming__main"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(m.label)} · ${m.daysLeft === 0 ? 'hoy' : `en ${plural(m.daysLeft, 'día')}`}</small></span>
              <span class="ev-upcoming__amt"><b>${money(falta)}</b><small>faltan en ${plural(cuentas, 'cuenta')}</small></span>
            </a>
          </li>`;
      }).join('')}
    </ul>`;
}

function matchesHtml() {
  const q = st.q.trim().toLowerCase();
  if (q.length < 2 || !cache) return '';
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nq = norm(q);
  const evById = new Map(cache.portfolio.map((x) => [String(x.event.id), x.event]));
  const hits = [];
  cache.accounts.forEach((a) => {
    if (a.kind === 'anfitrion') return;
    const people = cache.guests.filter((g) => L.sameId(g.accountId, a.id));
    const person = people.find((g) => norm(L.guestName(g)).includes(nq));
    if (norm(`${a.displayName} ${a.contactName} ${a.groupTag}`).includes(nq) || person) {
      hits.push({ a, person, event: evById.get(String(a.eventId)) });
    }
  });
  if (!hits.length) return `<p class="ev-empty">Ninguna cuenta ni persona coincide con «${escapeHtml(st.q)}».</p>`;
  return `
    <div class="ev-matches">
      <span class="ev-matches__title">Cuentas y personas</span>
      <ul class="ev-rows">
        ${hits.slice(0, 8).map(({ a, person, event }) => `
          <li><a class="ev-acclist__row" href="#/admin/events/${a.eventId}?tab=personas&cuenta=${a.id}">
            <span class="ev-acclist__name"><strong>${escapeHtml(person ? L.guestName(person) : a.displayName)}</strong><small>${escapeHtml(person ? `${a.displayName} · ` : '')}${escapeHtml(event ? event.title : '')}</small></span>
            <span></span>
            <span class="ev-acclist__amt">${evIcon('arrowRight')}</span>
          </a></li>`).join('')}
      </ul>
    </div>`;
}

function gridHtml() {
  const q = st.q.trim().toLowerCase();
  const list = cache.portfolio.filter(({ event }) => (st.type === 'todos' || event.type === st.type)
    && STATUS_TEST[st.status](event)
    && (!q || `${event.title} ${event.hostDisplayName} ${event.destination}`.toLowerCase().includes(q)));
  return `
    ${matchesHtml()}
    ${list.length ? `<div class="ev-pgrid ev-rows">${list.map(eventCard).join('')}</div>` : emptyHtml('No hay eventos con esos filtros', 'Cambia la plantilla o el estado.')}`;
}

export const AdminEventsView = {
  async render(ctx) {
    const [portfolio, accounts, guests] = await Promise.all([
      eventService.getPortfolio(),
      apiService.get('eventAccounts'),
      apiService.get('eventGuests'),
    ]);
    portfolio.sort((a, b) => String(a.event.startDate).localeCompare(String(b.event.startDate)));
    cache = { portfolio, accounts, guests };
    st.type = TYPE_FILTERS.some((f) => f.key === ctx.query.tipo) ? ctx.query.tipo : 'todos';
    st.status = STATUS_TEST[ctx.query.estado] ? ctx.query.estado : 'activos';
    st.q = '';
    const active = portfolio.filter(({ event }) => STATUS_TEST.activos(event));
    const sum = (fn) => active.reduce((s, x) => s + fn(x.summary), 0);
    const confirmed = sum((s) => s.people.confirmadas);
    const recaudado = sum((s) => s.totals.recaudado);
    const vencido = sum((s) => s.totals.vencido);
    const favor = sum((s) => s.totals.saldosAFavor);
    const count = (key) => portfolio.filter(({ event }) => key === 'todos' || event.type === key).length;
    const hasWizard = Boolean(AdminEventsView.hasWizard);
    return `
      <div class="evp">
        <div class="qb-page-hero ev-phero">
          <div>
            <h1 class="page-title">Eventos</h1>
            <p class="page-subtitle">Bodas, promociones y viajes de empresa: cada invitado con su cuenta.</p>
          </div>
          <div class="qb-hero-kpis ev-hero-kpis" aria-label="Resumen de eventos activos">
            <div class="qb-hero-kpi"><strong>${countNode(active.length, 'int')}</strong><span>Eventos activos</span></div>
            <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${countNode(confirmed, 'int')}</strong><span>Personas confirmadas</span></div>
            <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${escapeHtml(moneyShort(recaudado))}</strong><span>Recaudado</span></div>
            <div class="qb-hero-kpi qb-hero-kpi--sep ${vencido > 0 ? 'qb-hero-kpi--alert' : ''}"><strong>${escapeHtml(moneyShort(vencido))}</strong><span>Vencido</span></div>
            <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${escapeHtml(moneyShort(favor))}</strong><span>Saldos a favor</span></div>
          </div>
        </div>

        <section class="ev-grid ev-grid--portfolio">
          <div class="panel ev-portfolio">
            <div class="ev-toolbar">
              <label class="ev-search">
                ${evIcon('search')}
                <input type="search" class="form__input" id="ev-pf-q" placeholder="Buscar evento, cuenta o persona..." aria-label="Buscar" autocomplete="off" />
              </label>
              <div class="ev-chipbar ev-chipbar--inline" role="group" aria-label="Estado">
                ${STATUS_FILTERS.map((f) => `<button type="button" class="ev-chipbtn ev-chipbtn--plain ${st.status === f.key ? 'is-active' : ''}" data-status="${f.key}" aria-pressed="${st.status === f.key}">${escapeHtml(f.label)}</button>`).join('')}
              </div>
              ${hasWizard ? `<a class="btn btn--primary ev-toolbar__cta" href="#/admin/events/new">${evIcon('plus')}Nuevo evento</a>` : ''}
            </div>
            <div class="ev-chipbar" role="group" aria-label="Plantilla">
              ${TYPE_FILTERS.map((f) => `<button type="button" class="ev-chipbtn ${st.type === f.key ? 'is-active' : ''}" data-type="${f.key}" aria-pressed="${st.type === f.key}">${f.key !== 'todos' ? evIcon(TEMPLATE_ICON[f.key]) : ''}${escapeHtml(f.label)} <span>${count(f.key)}</span></button>`).join('')}
            </div>
            <div id="ev-pf-grid">${gridHtml()}</div>
          </div>
          <aside class="panel ev-upcoming-panel">
            <div class="panel__header"><h2 class="panel__title">Próximas metas</h2><span class="muted ev-small">De todos los eventos</span></div>
            ${upcomingHtml(active)}
          </aside>
        </section>
      </div>`;
  },

  async afterRender() {
    const root = document.querySelector('.evp');
    const grid = root.querySelector('#ev-pf-grid');
    const paint = () => {
      grid.innerHTML = gridHtml();
      grid.classList.remove('is-swapping');
      void grid.offsetWidth;
      grid.classList.add('is-swapping');
    };
    root.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
      st.type = b.dataset.type;
      root.querySelectorAll('[data-type]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      setHashQuery({ tipo: st.type });
      paint();
    }));
    root.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
      st.status = b.dataset.status;
      root.querySelectorAll('[data-status]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      setHashQuery({ estado: st.status === 'activos' ? null : st.status });
      paint();
    }));
    let t = null;
    root.querySelector('#ev-pf-q').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { st.q = e.target.value; grid.innerHTML = gridHtml(); }, 140);
    });
    runCountUp(root);
  },
};

registerTours({
  '#/admin/events': {
    version: 1,
    title: 'Eventos',
    intro: {
      que: 'Todos los viajes de grupo: bodas, promociones de colegio y viajes de incentivo de empresas.',
      para: 'Ver de un vistazo cómo va cada evento (confirmados, recaudo y alertas) y entrar a gestionarlo.',
      como: 'Filtra por plantilla o estado, busca un evento, una cuenta o una persona, y toca una tarjeta para abrir el evento.',
    },
    steps: [
      { sel: '.ev-hero-kpis', title: 'Resumen', text: 'Eventos activos, personas confirmadas, lo recaudado, lo vencido y los saldos a favor por devolver.' },
      { sel: '.ev-portfolio .ev-toolbar', title: 'Buscar y filtrar', text: 'El buscador también encuentra cuentas y personas de cualquier evento.' },
      { sel: '.ev-pgrid', title: 'Tarjetas de evento', text: 'Confirmados frente al cupo, porcentaje de recaudo y las alertas: atrasos de más de 30 días, saldos a favor y metas con recaudo bajo.' },
      { panel: 'Próximas metas', title: 'Próximas metas', text: 'Las fechas que vienen en todos los eventos y cuánto falta para cumplirlas.' },
    ],
  },
});
