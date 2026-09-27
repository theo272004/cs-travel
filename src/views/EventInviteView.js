/**
 * EventInviteView.js  ·  #/event/invite
 * =============================================================================
 * PROPOSITO:
 *   «Invitar» del organizador (permiso titular o colaborador). Tres caminos:
 *     1. Pegar una lista (columnas según la plantilla) con vista previa
 *        editable que valida celular, correo y duplicados.
 *     2. Agregar una por una.
 *     3. Cola de envío: una fila por invitación sin enviar o enviada, con
 *        «Enviar por WhatsApp» (texto de la plantilla, sin montos, con el
 *        enlace personal). Al enviar queda registrada y se resalta la siguiente.
 *
 * Las invitaciones se crean con eventService.createInvitations (rsvp
 * 'sin_enviar'); en colegio y empresa también se crea la persona.
 * =============================================================================
 */

import { eventService } from '../services/eventService.js';
import * as L from '../utils/eventLedger.js';
import { getTemplate, vocabFor, parseInviteList, normalizePhone, RSVP_LABELS } from '../utils/eventTemplates.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { shakeError } from '../utils/feedback.js';
import { showToast } from '../utils/toast.js';
import { registerTours } from '../components/Tour.js';
import {
  evIcon, plural, loadOrganizerContext, noEventsHtml, eventSwitcher, bindEventSwitcher, rsvpBadge,
  currentOrigin, copyPersonalLink, emptyHtml, refreshEventBell, setLoading, setHashQuery, relTime, subLine,
} from '../components/EventKit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ejemplo de lista para cada plantilla (lo que se ve en el campo vacío). */
const PASTE_EXAMPLE = {
  boda: 'Familia Rojas Díaz; 4; 300 123 4567\nTía Carmen Suárez; 1; 311 765 4321',
  promocion: 'Juan Pérez; 11A; Marta Díaz; 300 123 4567\nAna Gómez; 11B; Luis Gómez; 311 765 4321',
  empresa: 'Carlos Ruiz; carlos@empresa.com; Comercial\nDiana Mora; diana@empresa.com; Operaciones',
  otro: 'Camila Rey; 1; 300 123 4567',
};

/** Valida una fila (también después de editarla en la vista previa). */
function validateRows(type, rows) {
  rows.forEach((row) => {
    row.errors = [];
    if (!String(row.name || '').trim()) row.errors.push('Falta el nombre.');
    if (type === 'empresa') {
      if (!row.email) row.errors.push('Falta el correo.');
      else if (!EMAIL_RE.test(row.email)) row.errors.push('El correo no es válido.');
    } else if (!row.phoneRaw && !row.phone) {
      row.errors.push('Falta el celular.');
    } else if (!row.phone) {
      row.errors.push('El celular debe tener 10 dígitos y empezar por 3.');
    }
    if (!(row.seats >= 1 && row.seats <= 20)) row.errors.push('Los cupos deben estar entre 1 y 20.');
  });
  const seen = new Map();
  rows.forEach((row, i) => {
    [row.name && `n:${row.name.trim().toLowerCase()}`, row.phone && `p:${row.phone}`, row.email && `e:${row.email}`].filter(Boolean).forEach((key) => {
      if (seen.has(key)) row.errors.push(`Repetida con la fila ${seen.get(key) + 1}.`);
      else seen.set(key, i);
    });
  });
  return rows;
}

let ctxCache = null;
let pasted = [];

function tabsHtml(active, queueCount, sent) {
  const tabs = [
    { key: 'lista', icon: 'list', title: 'Pegar una lista', text: 'Copia las filas de Excel o de tus notas.' },
    { key: 'una', icon: 'plus', title: 'Agregar una por una', text: 'Un formulario corto para cada invitación.' },
    { key: 'cola', icon: 'send', title: 'Cola de envío', text: `Enviadas ${sent} de ${sent + queueCount}` },
  ];
  return `
    <div class="ev-invite-tabs" role="tablist" aria-label="Cómo invitar">
      ${tabs.map((t) => `
        <button type="button" class="ev-invite-tab ${active === t.key ? 'is-active' : ''}" role="tab" aria-selected="${active === t.key}" data-tab="${t.key}">
          <span class="ev-invite-tab__ico">${evIcon(t.icon)}</span>
          <span><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.text)}</small></span>
        </button>`).join('')}
    </div>`;
}

function pastePaneHtml(data) {
  const tpl = getTemplate(data.event.type);
  return `
    <section class="panel ev-invite-pane">
      <div class="panel__header">
        <h2 class="panel__title">Pegar una lista</h2>
        <span class="muted ev-small">Una línea por invitación: ${escapeHtml(tpl.pasteColumns.map((c) => c.label.toLowerCase()).join(', '))}</span>
      </div>
      <textarea class="form__input ev-paste" id="ev-paste" rows="6" placeholder="${escapeHtml(PASTE_EXAMPLE[data.event.type] || PASTE_EXAMPLE.otro)}"></textarea>
      <div class="ev-invite-actions">
        <span class="muted ev-small">Separa las columnas con tabulador, punto y coma o coma. El celular y el correo se reconocen solos.</span>
        <button type="button" class="btn btn--primary" id="ev-paste-check">${evIcon('checkCircle')}Revisar lista</button>
      </div>
      <div id="ev-paste-preview"></div>
    </section>`;
}

function previewHtml(data) {
  if (!pasted.length) return '';
  const type = data.event.type;
  const vocab = vocabFor(type);
  const ok = pasted.filter((r) => !r.errors.length).length;
  const cols = type === 'empresa'
    ? [['name', 'Nombre'], ['email', 'Correo'], ['group', 'Área']]
    : type === 'promocion'
      ? [['name', 'Estudiante'], ['group', 'Curso'], ['contactName', 'Acudiente'], ['phone', 'Celular']]
      : [['name', vocab.cuenta], ['seats', 'Cupos'], ['phone', 'Celular']];
  return `
    <div class="ev-preview">
      <div class="ev-preview__head">
        <strong>${plural(pasted.length, 'fila')} · <span class="${ok === pasted.length ? 'ev-ok' : ''}">${ok} listas</span>${pasted.length - ok ? ` · <span class="ev-late">${pasted.length - ok} por corregir</span>` : ''}</strong>
        <small>Corrige aquí mismo lo que esté en rojo.</small>
      </div>
      <div class="table-wrapper">
        <table class="data-table ev-table ev-preview__table">
          <thead><tr><th>#</th>${cols.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th>Estado</th><th><span class="sr-only">Quitar</span></th></tr></thead>
          <tbody>
            ${pasted.map((r, i) => `
              <tr class="${r.errors.length ? 'has-error' : ''}" data-row="${i}">
                <td class="ev-muted">${i + 1}</td>
                ${cols.map(([key]) => `<td><input class="form__input ev-cell" data-key="${key}" value="${escapeHtml(key === 'phone' ? (r.phone || r.phoneRaw || '') : r[key] ?? '')}" ${key === 'seats' ? 'inputmode="numeric"' : ''} aria-label="${escapeHtml(key)} fila ${i + 1}" /></td>`).join('')}
                <td class="ev-preview__state">${r.errors.length ? `<span class="ev-late">${escapeHtml(r.errors[0])}</span>` : `<span class="ev-ok">${evIcon('check')} Lista</span>`}</td>
                <td><button type="button" class="btn btn--ghost btn--sm ev-icon-btn" data-remove="${i}" aria-label="Quitar fila ${i + 1}">${evIcon('x')}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="ev-invite-actions">
        <button type="button" class="btn btn--ghost" id="ev-paste-clear">Borrar la lista</button>
        <button type="button" class="btn btn--primary" id="ev-paste-create" ${ok ? '' : 'disabled'}>${evIcon('plus')}Crear ${plural(ok, 'invitación', 'invitaciones')}</button>
      </div>
    </div>`;
}

function onePaneHtml(data) {
  const type = data.event.type;
  const vocab = vocabFor(type);
  return `
    <section class="panel ev-invite-pane">
      <div class="panel__header"><h2 class="panel__title">Agregar una por una</h2></div>
      <form class="form form--grid ev-one" id="ev-one" novalidate>
        <div class="form__group"><label class="form__label" for="ev-one-name">${escapeHtml(type === 'boda' ? 'Invitación (familia o persona)' : type === 'promocion' ? 'Estudiante' : 'Nombre')}</label><input class="form__input" id="ev-one-name" name="name" required /></div>
        ${type !== 'boda' && type !== 'otro' ? `<div class="form__group"><label class="form__label" for="ev-one-group">${escapeHtml(vocab.grupo)}</label><input class="form__input" id="ev-one-group" name="group" /></div>` : ''}
        ${type === 'promocion' ? '<div class="form__group"><label class="form__label" for="ev-one-contact">Acudiente</label><input class="form__input" id="ev-one-contact" name="contactName" /></div>' : ''}
        ${type === 'empresa'
          ? '<div class="form__group"><label class="form__label" for="ev-one-email">Correo</label><input class="form__input" id="ev-one-email" name="email" type="email" /></div>'
          : '<div class="form__group"><label class="form__label" for="ev-one-phone">Celular</label><input class="form__input" id="ev-one-phone" name="phone" inputmode="tel" placeholder="300 123 4567" /></div>'}
        ${type === 'boda' || type === 'otro' ? '<div class="form__group"><label class="form__label" for="ev-one-seats">Cupos</label><input class="form__input" id="ev-one-seats" name="seats" inputmode="numeric" value="2" /></div>' : ''}
        <div class="form__actions form__group--full"><button type="submit" class="btn btn--primary">${evIcon('plus')}Crear invitación</button></div>
      </form>
    </section>`;
}

function queueRows(data) {
  return data.accounts
    .filter((a) => a.kind !== 'anfitrion' && ['sin_enviar', 'enviada'].includes(a.rsvp))
    .sort((a, b) => (a.rsvp === b.rsvp ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.rsvp === 'sin_enviar' ? -1 : 1));
}

function queuePaneHtml(data) {
  const rows = queueRows(data);
  const first = rows.find((a) => a.rsvp === 'sin_enviar') || rows[0];
  const sample = first ? eventService.messageFor(data.event, first, 'invite', currentOrigin()).text : '';
  return `
    <section class="ev-grid ev-grid--main ev-invite-pane">
      <article class="panel">
        <div class="panel__header"><h2 class="panel__title">Cola de envío</h2><span class="muted ev-small">Toca «Enviar» y vuelve aquí: se resalta la siguiente</span></div>
        ${rows.length ? `
          <ul class="ev-queue ev-rows">
            ${rows.map((a) => `
              <li class="ev-queue__row ${first && L.sameId(a.id, first.id) ? 'is-next' : ''}" data-id="${a.id}">
                <span class="ev-queue__name"><strong>${escapeHtml(a.displayName)}</strong><small>${escapeHtml(subLine(a) || a.contactPhone || a.contactEmail || '')}${a.inviteSentAt ? ` · enviada ${escapeHtml(relTime(a.inviteSentAt))}` : ''}</small></span>
                ${rsvpBadge(a.rsvp)}
                <div class="row-actions">
                  <button type="button" class="btn btn--ghost btn--sm" data-copy="${a.id}">${evIcon('link')}Copiar enlace</button>
                  <button type="button" class="btn btn--sm ${a.rsvp === 'sin_enviar' ? 'btn--primary' : 'ev-act-soft'}" data-send="${a.id}">${evIcon('send')}${a.rsvp === 'sin_enviar' ? 'Enviar' : 'Reenviar'}</button>
                </div>
              </li>`).join('')}
          </ul>` : emptyHtml('No hay invitaciones por enviar', 'Las nuevas aparecen aquí apenas las crees.')}
      </article>
      <article class="panel ev-message">
        <div class="panel__header"><h2 class="panel__title">Así llega el mensaje</h2></div>
        <div class="ev-bubble">${escapeHtml(sample || 'Crea una invitación para ver el mensaje.').replace(/\n/g, '<br>')}</div>
        <p class="ev-note">${evIcon('lock')}El mensaje nunca lleva montos. Cada familia recibe su enlace personal, sin usuario ni contraseña. Si quieres cambiar el texto, pídeselo a tu asesor de CS Travel Group.</p>
      </article>
    </section>`;
}

export const EventInviteView = {
  async render(ctx) {
    ctxCache = await loadOrganizerContext(ctx);
    const { user, events, data } = ctxCache;
    if (!data) return noEventsHtml(user);
    const { event } = data;
    const can = data.view.can && data.view.can.invite;
    const rows = queueRows(data);
    const sent = data.accounts.filter((a) => a.kind !== 'anfitrion' && a.rsvp !== 'sin_enviar').length;
    const tab = ['lista', 'una', 'cola'].includes(ctx.query.tab) ? ctx.query.tab : (rows.some((a) => a.rsvp === 'sin_enviar') ? 'cola' : 'lista');
    pasted = [];
    return `
      <div class="evp">
        <div class="page-header ev-head">
          <div class="ev-head__text">
            <h1 class="page-title">Invitar</h1>
            <p class="page-subtitle">${escapeHtml(event.title)} · ${plural(data.summary.invitations.total, 'invitación', 'invitaciones')} creadas</p>
          </div>
          <div class="page-header__actions ev-head__actions">${eventSwitcher(events, event, '#/event/invite')}</div>
        </div>
        ${can ? `
          ${tabsHtml(tab, rows.filter((a) => a.rsvp === 'sin_enviar').length, sent)}
          <div id="ev-invite-pane" data-tab="${tab}">${tab === 'lista' ? pastePaneHtml(data) : tab === 'una' ? onePaneHtml(data) : queuePaneHtml(data)}</div>
        ` : `<section class="panel ev-empty-panel"><span class="ev-empty-panel__icon">${evIcon('lock')}</span><h2 class="panel__title">Tu permiso es de solo lectura</h2><p class="muted">Invitar lo hacen el titular del evento y sus colaboradores.</p></section>`}
      </div>`;
  },

  async afterRender() {
    const { data } = ctxCache || {};
    if (!data) return;
    const root = document.querySelector('.evp');
    bindEventSwitcher(root);
    refreshEventBell(data);
    if (!(data.view.can && data.view.can.invite)) return;
    const pane = root.querySelector('#ev-invite-pane');
    const order = ['lista', 'una', 'cola'];
    const show = (tab) => {
      const dir = order.indexOf(tab) - order.indexOf(pane.dataset.tab);
      pane.dataset.tab = tab;
      pane.innerHTML = tab === 'lista' ? pastePaneHtml(data) : tab === 'una' ? onePaneHtml(data) : queuePaneHtml(data);
      pane.firstElementChild?.classList.add(dir >= 0 ? 'ev-slide-right' : 'ev-slide-left');
      root.querySelectorAll('[data-tab]').forEach((b) => { if (b.classList.contains('ev-invite-tab')) { b.classList.toggle('is-active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); } });
      setHashQuery({ tab });
      bindPane(tab);
    };
    root.querySelectorAll('.ev-invite-tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

    const create = async (rows, button) => {
      setLoading(button, true);
      try {
        const created = await eventService.createInvitations(data.event.id, rows);
        showToast(`${plural(created.length, 'invitación creada', 'invitaciones creadas')}. Ahora envíalas desde la cola.`, 'success');
        window.location.hash = `#/event/invite?e=${data.event.id}&tab=cola`;
      } catch (error) {
        showToast(error.message || 'No se pudieron crear las invitaciones.', 'error');
        setLoading(button, false);
      }
    };

    const bindPane = (tab) => {
      if (tab === 'lista') {
        const preview = pane.querySelector('#ev-paste-preview');
        const repaint = () => {
          preview.innerHTML = previewHtml(data);
          preview.querySelectorAll('.ev-cell').forEach((input) => input.addEventListener('change', () => {
            const i = Number(input.closest('tr').dataset.row);
            const key = input.dataset.key;
            const v = input.value.trim();
            if (key === 'phone') { pasted[i].phoneRaw = v; pasted[i].phone = normalizePhone(v); }
            else if (key === 'seats') pasted[i].seats = Number(v) || 0;
            else if (key === 'email') pasted[i].email = v.toLowerCase();
            else pasted[i][key] = v;
            if (key === 'name' && data.event.type !== 'promocion') pasted[i].contactName = v;
            validateRows(data.event.type, pasted);
            repaint();
          }));
          preview.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
            pasted.splice(Number(b.dataset.remove), 1);
            validateRows(data.event.type, pasted);
            repaint();
          }));
          preview.querySelector('#ev-paste-clear')?.addEventListener('click', () => { pasted = []; pane.querySelector('#ev-paste').value = ''; repaint(); });
          preview.querySelector('#ev-paste-create')?.addEventListener('click', (e) => create(pasted.filter((r) => !r.errors.length), e.currentTarget));
        };
        pane.querySelector('#ev-paste-check').addEventListener('click', (e) => {
          const text = pane.querySelector('#ev-paste').value;
          if (!text.trim()) { shakeError(pane.querySelector('#ev-paste')); showToast('Pega al menos una línea.', 'error'); return; }
          // Se guarda el celular tal como vino para poder corregirlo en la vista previa.
          const rawPhone = (r) => r.raw.split(/[	;|,]/).map((c) => c.trim()).find((c) => /d{7,}/.test(c.replace(/[s-]/g, ''))) || '';
          pasted = parseInviteList(data.event.type, text).map((r) => ({ ...r, phoneRaw: r.phone || rawPhone(r) }));
          validateRows(data.event.type, pasted);
          repaint();
          e.currentTarget.blur();
        });
        repaint();
      } else if (tab === 'una') {
        const form = pane.querySelector('#ev-one');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const name = String(fd.get('name') || '').trim();
          const row = {
            name,
            group: String(fd.get('group') || '').trim(),
            contactName: String(fd.get('contactName') || '').trim() || name,
            phoneRaw: String(fd.get('phone') || '').trim(),
            phone: normalizePhone(fd.get('phone')),
            email: String(fd.get('email') || '').trim().toLowerCase() || null,
            seats: Number(fd.get('seats') || 1),
          };
          validateRows(data.event.type, [row]);
          if (row.errors.length) {
            shakeError(form.querySelector('button[type="submit"]'));
            showToast(row.errors[0], 'error');
            return;
          }
          create([row], form.querySelector('button[type="submit"]'));
        });
      } else {
        pane.firstElementChild.addEventListener('click', async (e) => {
          const send = e.target.closest('[data-send]');
          const copy = e.target.closest('[data-copy]');
          if (copy) {
            const a = data.accounts.find((x) => L.sameId(x.id, copy.dataset.copy));
            copyPersonalLink(a, copy);
            return;
          }
          if (!send) return;
          const a = data.accounts.find((x) => L.sameId(x.id, send.dataset.send));
          const { href } = eventService.messageFor(data.event, a, 'invite', currentOrigin());
          window.open(href, '_blank', 'noopener');
          setLoading(send, true);
          try {
            const updated = await eventService.markInvitationSent(a.id, { channel: 'whatsapp' });
            Object.assign(a, updated);
            const row = send.closest('.ev-queue__row');
            row.classList.remove('is-next');
            row.classList.add('is-sent');
            row.querySelector('.badge').outerHTML = rsvpBadge(a.rsvp);
            send.classList.remove('btn--primary');
            send.classList.add('ev-act-soft');
            send.innerHTML = `${evIcon('check')}Enviada`;
            const next = [...pane.querySelectorAll('.ev-queue__row')].find((r) => !r.classList.contains('is-sent') && r.querySelector('[data-send].btn--primary'));
            if (next) { next.classList.add('is-next'); next.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
            const counter = root.querySelector('.ev-invite-tab[data-tab="cola"] small');
            const total = data.accounts.filter((x) => x.kind !== 'anfitrion').length;
            const sentNow = data.accounts.filter((x) => x.kind !== 'anfitrion' && x.rsvp !== 'sin_enviar').length;
            if (counter) counter.textContent = `Enviadas ${sentNow} de ${total}`;
            showToast(`Invitación a ${a.displayName} registrada como ${RSVP_LABELS.enviada.toLowerCase()}.`, 'success');
          } catch (error) {
            showToast(error.message || 'No se pudo registrar el envío.', 'error');
          } finally {
            setLoading(send, false);
          }
        });
      }
    };
    bindPane(pane.dataset.tab);
  },
};

registerTours({
  '#/event/invite': {
    version: 1,
    title: 'Invitar',
    intro: {
      que: 'Donde creas las invitaciones de tu evento y se las mandas a cada familia por WhatsApp.',
      para: 'Cargar a todos los invitados de una vez y enviarles su enlace personal sin copiar y pegar a mano.',
      como: 'Pega tu lista (o agrega una por una), revisa lo que esté en rojo y crea las invitaciones. Luego ve a la cola y toca «Enviar» en cada una.',
    },
    steps: [
      { sel: '.ev-invite-tabs', title: 'Tres caminos', text: 'Pegar una lista, agregar una por una o enviar las que están en cola.' },
      { sel: '#ev-invite-pane', title: 'Tu lista', text: 'En «Pegar una lista» cada línea es una invitación. La vista previa marca en rojo el celular o el correo que no sirve y las filas repetidas.' },
    ],
  },
});
