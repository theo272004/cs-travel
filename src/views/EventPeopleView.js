/**
 * EventPeopleView.js  ·  #/event/people
 * =============================================================================
 * PROPOSITO:
 *   «Personas» del organizador: todas las invitaciones del evento con su
 *   asistencia, su estado de pago y sus documentos. Buscar, filtrar, recordar
 *   por WhatsApp (sin montos) y abrir la ficha de cada cuenta.
 *
 * URL: ?f=atrasados|por_vencer|sin_responder|confirmadas|pagados|no_asisten|canceladas
 *      &g=<grupo> &v=invitacion|persona|grupo &cuenta=<id>
 *   Los filtros viajan en la URL (sin volver a pintar): los indicadores del
 *   Inicio abren esta vista ya filtrada y ?cuenta= abre la ficha directo.
 *
 * QUE VE CADA ROL (regla 19): en una boda ('solo_estado') no hay montos de
 *   los invitados; la columna Pago muestra solo el estado.
 *
 * REUTILIZACION: renderPeoplePanel()/bindPeoplePanel() también los usa la
 *   pestaña Personas del administrador (con montos siempre y sus acciones).
 * =============================================================================
 */

import * as L from '../utils/eventLedger.js';
import { vocabFor, getTemplate, AUDIENCE_LABELS, RSVP_LABELS } from '../utils/eventTemplates.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { registerTours } from '../components/Tour.js';
import {
  evIcon, money, plural, fmtDay, loadOrganizerContext, noEventsHtml, eventSwitcher, bindEventSwitcher,
  accountBadge, subLine, rsvpBadge, isPendingRsvp, accountSemaphore, semaphoreHtml, nextGoalText, remindAccount,
  openAccountDrawer, emptyHtml, setHashQuery, copyText, groupMessage, exportCsv, refreshEventBell, rerender,
} from '../components/EventKit.js';

/* ---------------------------------------------------------------------------
 * Filas
 * ------------------------------------------------------------------------ */

export const PEOPLE_FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'confirmadas', label: 'Confirmadas' },
  { key: 'sin_responder', label: 'Sin responder' },
  { key: 'atrasados', label: 'Atrasados', tone: 'is-alert' },
  { key: 'por_vencer', label: 'Por vencer', tone: 'is-warn' },
  { key: 'pagados', label: 'Pagados' },
  { key: 'no_asisten', label: 'No asisten' },
  { key: 'canceladas', label: 'Canceladas' },
];

const FILTER_TEST = {
  todos: () => true,
  confirmadas: (r) => r.a.rsvp === 'confirmada' && r.yes > 0,
  sin_responder: (r) => isPendingRsvp(r.a.rsvp),
  atrasados: (r) => r.c && r.c.status === 'atrasado',
  por_vencer: (r) => r.c && r.c.status === 'por_vencer',
  pagados: (r) => r.c && ['pagado', 'cubierto', 'saldo_a_favor'].includes(r.c.status),
  no_asisten: (r) => r.a.rsvp === 'no_asiste',
  canceladas: (r) => r.cancelled > 0,
};

/** ¿Este evento lleva control de documentos? (colegio y empresa, o si alguien los tiene marcados). */
const docsOn = (data) => getTemplate(data.event.type).requiresDocs || data.guests.some((g) => g.docsOk === true || g.docsOk === false);

/** Una fila por invitación, con todo lo que se pinta y se filtra. */
function buildRows(data) {
  const pkgById = new Map(data.packages.map((p) => [String(p.id), p]));
  return data.accounts
    .filter((a) => a.kind !== 'anfitrion')
    .map((a) => {
      const guests = data.guests.filter((g) => L.sameId(g.accountId, a.id));
      const active = guests.filter((g) => g.status !== 'cancelado');
      const going = active.filter((g) => g.attendance === 'si');
      const c = data.summary.byId.get(String(a.id));
      const audiences = {};
      going.forEach((g) => { audiences[g.audience] = (audiences[g.audience] || 0) + 1; });
      const docsNeeded = going.filter((g) => g.docsOk === true || g.docsOk === false);
      const docsMissing = docsNeeded.filter((g) => g.docsOk === false).length;
      const pkgNames = [...new Set(going.map((g) => (pkgById.get(String(g.packageId)) || {}).name).filter(Boolean))];
      return {
        a,
        c,
        guests,
        yes: going.length,
        cancelled: guests.length - active.length,
        audiences,
        pkgNames,
        docs: docsNeeded.length ? (docsMissing ? `Faltan ${docsMissing}` : 'Completos') : '—',
        docsState: docsNeeded.length ? (docsMissing ? 'faltan' : 'completo') : 'no_aplica',
        sem: accountSemaphore(a, c, guests),
        terms: `${a.displayName} ${a.groupTag} ${a.contactName} ${guests.map(L.guestName).join(' ')}`
          .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
      };
    })
    .sort((x, y) => {
      const rank = (r) => (r.c && r.c.status === 'atrasado' ? 0 : r.c && r.c.status === 'por_vencer' ? 1 : isPendingRsvp(r.a.rsvp) ? 2 : r.a.rsvp === 'no_asiste' ? 4 : 3);
      return rank(x) - rank(y) || (y.c?.diasAtraso || 0) - (x.c?.diasAtraso || 0) || x.a.displayName.localeCompare(y.a.displayName, 'es');
    });
}

const AUD_PLURAL = {
  adulto: ['adulto', 'adultos'],
  nino: ['niño', 'niños'],
  estudiante: ['estudiante', 'estudiantes'],
  docente: ['docente', 'docentes'],
  colaborador: ['colaborador', 'colaboradores'],
  acompanante: ['acompañante', 'acompañantes'],
};

/** «2 adultos · 1 niño». */
const audienceText = (aud) => Object.entries(aud)
  .map(([k, n]) => {
    const [one, many] = AUD_PLURAL[k] || [String(AUDIENCE_LABELS[k] || k).toLowerCase(), `${String(AUDIENCE_LABELS[k] || k).toLowerCase()}s`];
    return `${n} ${n === 1 ? one : many}`;
  })
  .join(' · ');

function payCell(r, amounts) {
  if (!r.c || r.c.status === 'sin_cargos') return `<span class="ev-muted">${isPendingRsvp(r.a.rsvp) ? 'Sin confirmar' : '—'}</span>`;
  if (!amounts || r.c.amountsHidden) return accountBadge(r.c);
  const ratio = r.c.neto > 0 ? r.c.pagado / r.c.neto : 1;
  const tail = r.c.saldo < 0 ? `A favor ${money(-r.c.saldo)}` : r.c.saldo > 0 ? `Falta ${money(r.c.saldo)}` : 'Sin saldo';
  return `
    <div class="ev-paycell">
      ${accountBadge(r.c)}
      <span class="ev-paycell__bar"><b style="--w:${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%"></b></span>
      <small title="Pagado ${escapeHtml(money(r.c.pagado))} de ${escapeHtml(money(r.c.neto))}">${escapeHtml(tail)}</small>
    </div>`;
}

/** Próxima meta en dos líneas: la fecha y el nombre de la meta. */
function goalCell(c) {
  if (!c) return '<span class="ev-muted">—</span>';
  if (c.status === 'atrasado' && c.oldestUnmet) {
    const m = (c.milestones || []).find((x) => x.date === c.oldestUnmet.date);
    return `<b>Vencida el ${escapeHtml(fmtDay(c.oldestUnmet.date))}</b><small>${escapeHtml(m ? m.label : '')}</small>`;
  }
  if (c.next) return `<b>${c.next.daysLeft === 0 ? 'Hoy' : escapeHtml(fmtDay(c.next.date))}</b><small>${escapeHtml(c.next.label)}</small>`;
  const text = nextGoalText(c);
  return text ? `<small>${escapeHtml(text)}</small>` : '<span class="ev-muted">—</span>';
}

/** Todas las personas de la cuenta cancelaron su viaje. */
const allCancelled = (r) => r.guests.length > 0 && r.cancelled === r.guests.length;

function remindButton(r, data) {
  const can = data.view.can && data.view.can.remind;
  if (!can || r.a.rsvp === 'no_asiste' || r.a.rsvp === 'sin_enviar' || allCancelled(r)) return '<span class="row-actions__slot"></span>';
  const recent = r.a.lastReminderAt && !L.reminderCheck(r.a).allowed;
  return `<button type="button" class="btn btn--sm ev-act-soft ${recent ? 'is-recent' : ''}" data-remind="${r.a.id}" title="${recent ? 'Ya se le recordó hace poco' : 'Abrir WhatsApp con su enlace personal'}">${evIcon('message')}${recent ? 'Recordado' : 'Recordar'}</button>`;
}

function accountRowHtml(r, data, amounts) {
  return `
    <tr class="clickable-row ev-prow" data-open="${r.a.id}" tabindex="0">
      <td>
        <div class="ev-who">
          <strong>${escapeHtml(r.a.displayName)}</strong>
          <small>${escapeHtml(subLine(r.a))}</small>
        </div>
      </td>
      <td class="ev-num"><b>${r.yes}</b><span class="ev-muted"> / ${Number(r.a.seatsAllowed) || 0}</span></td>
      <td class="ev-pkg">${r.yes ? escapeHtml(audienceText(r.audiences)) : '<span class="ev-muted">—</span>'}</td>
      <td class="ev-center">${rsvpBadge(r.a.rsvp)}</td>
      <td>${payCell(r, amounts)}</td>
      <td class="ev-goal ${r.c && r.c.status === 'atrasado' ? 'is-late' : ''}">${goalCell(r.c)}</td>
      ${docsOn(data) ? `<td class="ev-center"><span class="ev-docs ev-docs--${r.docsState}">${escapeHtml(r.docs)}</span></td>` : ''}
      <td class="ev-actcol"><div class="row-actions">${remindButton(r, data)}</div></td>
    </tr>`;
}

function tableHead(docs = true) {
  return `
    <thead>
      <tr>
        <th>Invitación y grupo</th>
        <th class="ev-num">Personas</th>
        <th>Paquete</th>
        <th class="ev-center">Asistencia</th>
        <th>Pago</th>
        <th>Próxima meta</th>
        ${docs ? '<th class="ev-center">Documentos</th>' : ''}
        <th class="ev-actcol"><span class="sr-only">Acción</span></th>
      </tr>
    </thead>`;
}

function personTable(rows, data) {
  const pkgById = new Map(data.packages.map((p) => [String(p.id), p]));
  const people = [];
  rows.forEach((r) => r.guests.forEach((g) => people.push({ r, g })));
  if (!people.length) return emptyHtml('Nadie con esos filtros', 'Prueba con otro filtro o borra la búsqueda.');
  return `
    <div class="table-wrapper">
      <table class="data-table ev-table">
        <thead><tr><th>Persona</th><th>Invitación</th><th>Paquete</th><th>${docsOn(data) ? 'Asistencia · Pago · Documentos' : 'Asistencia · Pago'}</th></tr></thead>
        <tbody>
          ${people.map(({ r, g }) => {
            const sem = L.personSemaphore(g, r.c, data.lines);
            const label = sem.pago === 'cubierto' ? 'Cubierto' : r.c ? r.c.statusLabel : 'Sin cargos';
            return `
              <tr class="clickable-row ev-prow" data-open="${r.a.id}" tabindex="0">
                <td><div class="ev-who"><strong>${escapeHtml(L.guestName(g))}</strong><small>${escapeHtml(AUDIENCE_LABELS[g.audience] || g.audience)}${g.isMinor ? ' · menor de edad' : ''}</small></div></td>
                <td><div class="ev-who"><span>${escapeHtml(r.a.displayName)}</span><small>${escapeHtml(r.a.groupTag || '')}</small></div></td>
                <td class="ev-pkg ev-pkg--wide">${escapeHtml((pkgById.get(String(g.packageId)) || {}).name || '—')}</td>
                <td>${semaphoreHtml({ ...sem, pagoLabel: label }, { docs: docsOn(data) })}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function accountTable(rows, data, amounts, { grouped = false } = {}) {
  if (!rows.length) return emptyHtml('Nadie con esos filtros', 'Prueba con otro filtro o borra la búsqueda.');
  let body = '';
  if (grouped) {
    const groups = new Map();
    rows.forEach((r) => {
      const key = r.a.groupTag || 'Sin grupo';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    [...groups.entries()].sort((x, y) => x[0].localeCompare(y[0], 'es')).forEach(([name, list]) => {
      const late = list.filter((r) => r.c && r.c.status === 'atrasado').length;
      const yes = list.reduce((s, r) => s + r.yes, 0);
      body += `
        <tr class="ev-group-row"><td colspan="${docsOn(data) ? 8 : 7}">
          <span class="ev-group-row__name">${escapeHtml(name)}</span>
          <span class="ev-group-row__meta">${plural(list.length, 'invitación', 'invitaciones')} · ${plural(yes, 'persona')} ${late ? `· <b>${plural(late, 'atrasada')}</b>` : ''}</span>
        </td></tr>
        ${list.map((r) => accountRowHtml(r, data, amounts)).join('')}`;
    });
  } else {
    body = rows.map((r) => accountRowHtml(r, data, amounts)).join('');
  }
  return `
    <div class="table-wrapper">
      <table class="data-table ev-table">
        ${tableHead(docsOn(data))}
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function cardsHtml(rows, data, amounts) {
  if (!rows.length) return emptyHtml('Nadie con esos filtros', 'Prueba con otro filtro o borra la búsqueda.');
  const can = data.view.can && data.view.can.remind;
  return `
    <div class="ev-cards ev-rows">
      ${rows.map((r) => {
        const showRemind = can && !['no_asiste', 'sin_enviar'].includes(r.a.rsvp) && !allCancelled(r);
        const money2 = amounts && r.c && !r.c.amountsHidden && r.c.status !== 'sin_cargos';
        return `
          <article class="ev-card">
            <button type="button" class="ev-card__head" data-open="${r.a.id}">
              <span class="ev-card__name"><strong>${escapeHtml(r.a.displayName)}</strong><small>${escapeHtml([subLine(r.a), `${r.yes} de ${plural(Number(r.a.seatsAllowed) || 0, 'cupo')}`].filter(Boolean).join(' · '))}</small></span>
              ${evIcon('chevronRight', 'ev-card__chev')}
            </button>
            ${semaphoreHtml(r.sem, { docs: docsOn(data) })}
            ${money2 ? `
              <div class="ev-card__money">
                <span class="ev-paycell__bar"><b style="--w:${Math.round(Math.max(0, Math.min(1, r.c.neto > 0 ? r.c.pagado / r.c.neto : 1)) * 100)}%"></b></span>
                <small>${money(r.c.pagado)} de ${money(r.c.neto)}${r.c.saldo > 0 ? ` · falta ${money(r.c.saldo)}` : r.c.saldo < 0 ? ` · a favor ${money(-r.c.saldo)}` : ''}</small>
              </div>` : ''}
            ${nextGoalText(r.c) ? `<p class="ev-card__goal ${r.c && r.c.status === 'atrasado' ? 'is-late' : ''}">${evIcon('flag')}${escapeHtml(nextGoalText(r.c))}</p>` : ''}
            ${showRemind ? `<button type="button" class="btn btn--primary btn--block ev-card__cta" data-remind="${r.a.id}">${evIcon('message')}Recordar por WhatsApp</button>` : ''}
          </article>`;
      }).join('')}
    </div>`;
}

/* ---------------------------------------------------------------------------
 * Panel completo (compartido con el admin)
 * ------------------------------------------------------------------------ */

/** Estado del panel (filtros) — uno por pantalla. */
const state = { f: 'todos', g: '', q: '', v: 'invitacion' };

export function renderPeoplePanel(data, { query = {} } = {}) {
  state.f = FILTER_TEST[query.f] ? query.f : 'todos';
  state.g = query.g || '';
  state.q = '';
  state.v = ['invitacion', 'persona', 'grupo'].includes(query.v) ? query.v : 'invitacion';
  const vocab = vocabFor(data.event.type);
  const rows = buildRows(data);
  const counts = Object.fromEntries(PEOPLE_FILTERS.map((f) => [f.key, rows.filter(FILTER_TEST[f.key]).length]));
  const groups = [...new Set(rows.map((r) => r.a.groupTag).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return `
    <section class="panel ev-people-panel" aria-label="Personas del evento">
      <div class="ev-toolbar">
        <label class="ev-search">
          ${evIcon('search')}
          <input type="search" class="form__input" id="ev-people-q" placeholder="Buscar nombre, familia, ${escapeHtml(vocab.grupo.toLowerCase())}..." aria-label="Buscar personas" autocomplete="off" />
        </label>
        ${groups.length > 1 ? `
          <select class="form__input ev-group-select" id="ev-people-g" aria-label="${escapeHtml(vocab.grupo)}">
            <option value="">Todos los grupos</option>
            ${groups.map((g) => `<option value="${escapeHtml(g)}" ${g === state.g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
          </select>` : ''}
        <span class="ev-toolbar__count" id="ev-people-count" aria-live="polite"></span>
        <div class="ev-seg" role="group" aria-label="Ver por">
          <button type="button" data-view="invitacion" class="${state.v === 'invitacion' ? 'is-active' : ''}">${evIcon('list')}<span>Por invitación</span></button>
          <button type="button" data-view="persona" class="${state.v === 'persona' ? 'is-active' : ''}">${evIcon('user')}<span>Por persona</span></button>
          <button type="button" data-view="grupo" class="${state.v === 'grupo' ? 'is-active' : ''}">${evIcon('layers')}<span>Por grupo</span></button>
        </div>
      </div>
      <div class="ev-chipbar ev-chipbar--scroll" role="group" aria-label="Filtrar">
        ${PEOPLE_FILTERS.map((f) => `
          <button type="button" class="ev-chipbtn ${f.tone || ''} ${state.f === f.key ? 'is-active' : ''}" data-filter="${f.key}" aria-pressed="${state.f === f.key}">
            ${escapeHtml(f.label)} <span>${counts[f.key]}</span>
          </button>`).join('')}
      </div>
      <div id="ev-people-body" class="ev-people-body"></div>
    </section>`;
}

/** Enlaza el panel: búsqueda, filtros, vista, fichas y recordatorios. */
export function bindPeoplePanel(root, data, { query = {}, onChange, onContribute, drawerExtra } = {}) {
  const rows = buildRows(data);
  const amounts = data.view.amounts || data.view.role === 'admin';
  const body = root.querySelector('#ev-people-body');
  const count = root.querySelector('#ev-people-count');
  const input = root.querySelector('#ev-people-q');

  const visible = () => {
    const q = state.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return rows.filter((r) => FILTER_TEST[state.f](r) && (!state.g || r.a.groupTag === state.g) && (!q || r.terms.includes(q)));
  };
  const paint = (animate = true) => {
    const list = visible();
    count.textContent = `${list.length} de ${plural(rows.length, 'invitación', 'invitaciones')}`;
    const desktop = state.v === 'persona' ? personTable(list, data) : accountTable(list, data, amounts, { grouped: state.v === 'grupo' });
    body.innerHTML = `
      <div class="only-desktop ev-desk">${desktop}</div>
      <div class="only-mobile ev-mob">${cardsHtml(list, data, amounts)}</div>`;
    if (animate) {
      body.classList.remove('is-swapping');
      void body.offsetWidth;
      body.classList.add('is-swapping');
    }
  };

  root.querySelectorAll('[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
    state.f = chip.dataset.filter;
    root.querySelectorAll('[data-filter]').forEach((b) => { b.classList.toggle('is-active', b === chip); b.setAttribute('aria-pressed', String(b === chip)); });
    setHashQuery({ f: state.f });
    paint();
  }));
  root.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => {
    state.v = btn.dataset.view;
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('is-active', b === btn));
    setHashQuery({ v: state.v === 'invitacion' ? null : state.v });
    paint();
  }));
  root.querySelector('#ev-people-g')?.addEventListener('change', (e) => {
    state.g = e.target.value;
    setHashQuery({ g: state.g || null });
    paint();
  });
  let t = null;
  input?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = input.value; paint(false); }, 120);
  });

  const open = (id, trigger) => {
    setHashQuery({ cuenta: id });
    openAccountDrawer({
      data,
      accountId: id,
      trigger,
      onChange,
      onContribute,
      onClose: () => setHashQuery({ cuenta: null }),
      ...(drawerExtra || {}),
    });
  };

  body.addEventListener('click', async (e) => {
    const remind = e.target.closest('[data-remind]');
    if (remind) {
      e.stopPropagation();
      const account = data.accounts.find((a) => L.sameId(a.id, remind.dataset.remind));
      const updated = await remindAccount({ event: data.event, account, button: remind });
      if (updated) {
        Object.assign(account, updated);
        body.querySelectorAll(`[data-remind="${account.id}"]`).forEach((b) => {
          b.classList.add('is-done');
          b.innerHTML = `${evIcon('check')}Enviado`;
        });
      }
      return;
    }
    const row = e.target.closest('[data-open]');
    if (row) open(row.dataset.open, row);
  });
  body.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-open]')) {
      e.preventDefault();
      open(e.target.dataset.open, e.target);
    }
  });

  paint(false);
  if (query.cuenta && data.accounts.some((a) => L.sameId(a.id, query.cuenta))) {
    setTimeout(() => open(query.cuenta, null), 120);
  }

  return {
    /** Filas visibles (para exportar solo lo que se ve). */
    visibleRows: visible,
  };
}

/** CSV con las columnas visibles (sin montos si el evento es 'solo_estado'). */
export function exportPeopleCsv(data, rows) {
  const amounts = data.view.amounts || data.view.role === 'admin';
  const cols = [
    ['Invitación', (r) => r.a.displayName],
    ['Grupo', (r) => r.a.groupTag || ''],
    ['Personas confirmadas', (r) => r.yes],
    ['Cupos', (r) => Number(r.a.seatsAllowed) || 0],
    ['Paquete', (r) => audienceText(r.audiences)],
    ['Asistencia', (r) => RSVP_LABELS[r.a.rsvp] || r.a.rsvp],
    ['Pago', (r) => (r.c ? r.c.statusLabel : '')],
  ];
  if (amounts) {
    cols.push(['Le toca', (r) => (r.c && !r.c.amountsHidden ? r.c.neto : '')]);
    cols.push(['Pagado', (r) => (r.c && !r.c.amountsHidden ? r.c.pagado : '')]);
    cols.push(['Saldo', (r) => (r.c && !r.c.amountsHidden ? r.c.saldo : '')]);
  }
  cols.push(['Próxima meta', (r) => nextGoalText(r.c)]);
  cols.push(['Documentos', (r) => r.docs]);
  exportCsv(`personas-${data.event.slug || data.event.id}`, cols, rows);
}

/* ---------------------------------------------------------------------------
 * Vista del organizador
 * ------------------------------------------------------------------------ */

let ctxCache = null;
let panelApi = null;

export const EventPeopleView = {
  async render(ctx) {
    ctxCache = await loadOrganizerContext(ctx);
    const { user, events, data } = ctxCache;
    if (!data) return noEventsHtml(user);
    const { event, summary } = data;
    const vocab = vocabFor(event.type);
    const canInvite = data.view.can && data.view.can.invite;
    return `
      <div class="evp">
        <div class="page-header ev-head">
          <div class="ev-head__text">
            <h1 class="page-title">Personas</h1>
            <p class="page-subtitle">${escapeHtml(event.title)} · ${plural(summary.invitations.total, vocab.cuenta.toLowerCase(), vocab.cuentas.toLowerCase())} · ${plural(summary.people.confirmadas, 'persona confirmada', 'personas confirmadas')}</p>
          </div>
          <div class="page-header__actions ev-head__actions">
            ${eventSwitcher(events, event, '#/event/people')}
            <button type="button" class="btn btn--ghost" id="ev-group-msg" title="Un mensaje general sin nombres ni montos">${evIcon('copy')}Mensaje para el grupo</button>
            <button type="button" class="btn btn--ghost" id="ev-export">${evIcon('download')}Exportar CSV</button>
            ${canInvite ? `<a class="btn btn--primary" href="#/event/invite?e=${event.id}">${evIcon('plus')}Invitar</a>` : ''}
          </div>
        </div>
        ${renderPeoplePanel(data, { query: ctx.query })}
        ${data.view.amounts ? '' : `<p class="ev-note">${evIcon('lock')}En este evento ves el estado de cada invitación, no cuánto debe. Los montos solo los ven la familia y CS Travel Group.</p>`}
      </div>`;
  },

  async afterRender(ctx) {
    const { data } = ctxCache || {};
    if (!data) return;
    const root = document.querySelector('.evp');
    bindEventSwitcher(root);
    panelApi = bindPeoplePanel(root, data, {
      query: ctx.query,
      onChange: rerender,
      onContribute: (target) => { window.location.hash = `#/event/money?e=${data.event.id}&aportar=${(target.accountIds || []).join(',')}`; },
    });
    root.querySelector('#ev-group-msg')?.addEventListener('click', (e) => {
      copyText(groupMessage(data.event), 'Mensaje copiado. Pégalo en el grupo de WhatsApp: no lleva nombres ni montos.', e.currentTarget);
    });
    root.querySelector('#ev-export')?.addEventListener('click', () => exportPeopleCsv(data, panelApi.visibleRows()));
    refreshEventBell(data);
  },
};

registerTours({
  '#/event/people': {
    version: 1,
    title: 'Personas',
    intro: {
      que: 'La lista de todas las invitaciones de tu evento: quién va, cómo va con sus pagos y si tiene sus documentos.',
      para: 'Encontrar rápido a quien hay que recordarle algo y revisar la ficha de cada familia.',
      como: 'Usa los filtros de arriba (Atrasados, Sin responder...) y toca «Recordar». Toca una fila para abrir su ficha.',
    },
    steps: [
      { sel: '.ev-search', title: 'Buscar', text: 'Escribe un nombre, un apellido o un grupo.' },
      { sel: '.ev-chipbar--scroll', title: 'Filtros', text: 'Cada filtro muestra cuántas invitaciones hay. Atrasados y Por vencer son los que más conviene recordar.' },
      { sel: '.ev-seg', title: 'Cómo ver la lista', text: 'Por invitación (una fila por familia o cuenta), por persona o agrupada.', optional: 'en el celular se muestran tarjetas' },
      { sel: '#ev-people-body', title: 'La lista', text: 'Asistencia, estado de pago, próxima meta y documentos. «Recordar» abre WhatsApp con su enlace personal y un mensaje sin montos.' },
      { sel: '#ev-group-msg', title: 'Mensaje para el grupo', text: 'Copia un mensaje general para el grupo de WhatsApp, sin nombres ni montos.' },
      { sel: '#ev-export', title: 'Exportar', text: 'Descarga en CSV lo que estás viendo, con los mismos filtros.' },
    ],
  },
});

