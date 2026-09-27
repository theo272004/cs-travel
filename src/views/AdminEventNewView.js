/**
 * AdminEventNewView.js  ·  #/admin/events/new
 * =============================================================================
 * PROPOSITO:
 *   Asistente de 4 pasos para crear un evento a partir de una plantilla:
 *     1. Plantilla (boda, promoción de colegio, empresa o en blanco).
 *     2. Datos: título, anfitrión, destino, fechas, cupo, plazo para responder,
 *        código de origen, asesor, organizador y lo que incluye.
 *     3. Paquetes y quién paga: precio, costo de terceros (el servicio sale
 *        solo) y cobertura del anfitrión, con la vista previa «Así lo verá un
 *        invitado».
 *     4. Plan, privacidad y publicación: reserva, metas (con generador de
 *        pagos mensuales), abono mínimo, tramos de cancelación, privacidad y
 *        textos. Se guarda como borrador o se publica (confirmDialog).
 *
 * VALIDACIONES (shakeError): L.validateEventSetup (metas en aumento, la última
 *   en 100 % y 15 días antes del viaje, precio ≥ costo de terceros...) y
 *   textos sin montos (containsAmount).
 *
 * La ruta va declarada ANTES de '#/admin/events/:id' en router.js.
 * =============================================================================
 */

import { eventService } from '../services/eventService.js';
import { userService } from '../services/userService.js';
import * as L from '../utils/eventLedger.js';
import {
  EVENT_TEMPLATES, getTemplate, buildEventDraft, planFor, AUDIENCE_LABELS, ORGANIZER_PERMISSION_LABELS,
  containsAmount, fillMessage,
} from '../utils/eventTemplates.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { shakeError } from '../utils/feedback.js';
import { showToast } from '../utils/toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { registerTours } from '../components/Tour.js';
import { wireStyledSelects } from '../components/StyledSelect.js';
import { evIcon, money, plural, fmtRange, TEMPLATE_ICON, setLoading } from '../components/EventKit.js';
import { TEMPLATE_TONE, AdminEventsView } from './AdminEventsView.js';

// El portafolio muestra «Nuevo evento» solo si el asistente existe.
AdminEventsView.hasWizard = true;

const STEPS = ['Plantilla', 'Datos', 'Paquetes', 'Plan y publicación'];
const DEFAULT_ADVISOR = { name: 'Andrés Felipe Sánchez De La Parra', phone: '+57 314 610 3599', email: 'reservas@cstravelgroup.com' };

let st = null;
let organizers = [];

function freshState(type = null) {
  const today = L.todayCO();
  const start = L.addDays(today, 120);
  const draft = type ? buildEventDraft(type, { startDate: start, endDate: L.addDays(start, 3), advisor: { ...DEFAULT_ADVISOR } }, today) : null;
  return {
    step: 0,
    type,
    event: draft ? draft.event : null,
    packages: draft ? draft.packages.map((p) => ({ ...p })) : [],
    hostAccountName: draft ? draft.hostAccountName : '',
    organizer: { userId: '', permission: 'titular' },
    monthly: { n: 4, until: draft ? (draft.event.plan.hitos.slice(-1)[0] || {}).date : '' },
  };
}

/* ---------------------------------------------------------------------------
 * Pasos
 * ------------------------------------------------------------------------ */

function stepTemplate() {
  return `
    <div class="ev-tpls" role="radiogroup" aria-label="Plantilla">
      ${Object.values(EVENT_TEMPLATES).map((t) => `
        <button type="button" class="ev-tpl ${st.type === t.type ? 'is-on' : ''}" role="radio" aria-checked="${st.type === t.type}" data-tpl="${t.type}" style="--tone:${TEMPLATE_TONE[t.type]}">
          <span class="ev-tpl__ico">${evIcon(TEMPLATE_ICON[t.type])}</span>
          <strong>${escapeHtml(t.label)}</strong>
          <p>${escapeHtml(t.description)}</p>
          <ul>${t.preloads.map((x) => `<li>${evIcon('check')}${escapeHtml(x)}</li>`).join('')}</ul>
        </button>`).join('')}
    </div>`;
}

function field(label, input, { full = false, hint = '' } = {}) {
  return `<div class="form__group ${full ? 'form__group--full' : ''}"><label class="form__label">${escapeHtml(label)}</label>${input}${hint ? `<small class="form__hint">${escapeHtml(hint)}</small>` : ''}</div>`;
}

function stepData() {
  const e = st.event;
  const tpl = getTemplate(st.type);
  const val = (v) => escapeHtml(v ?? '');
  return `
    <form class="form form--grid ev-wform" data-form="datos" novalidate>
      ${field('Título del evento', `<input class="form__input" name="title" value="${val(e.title)}" placeholder="${st.type === 'boda' ? 'Nos casamos en Cartagena' : st.type === 'promocion' ? 'Viaje de promoción 11° 2027' : 'Viaje de incentivo 2027'}" />`, { full: true })}
      ${field('Anfitrión (como lo verán los invitados)', `<input class="form__input" name="hostDisplayName" value="${val(e.hostDisplayName)}" placeholder="${st.type === 'boda' ? 'Laura & Andrés' : st.type === 'promocion' ? 'Promoción 11° · Colegio' : 'Nombre de la empresa'}" />`)}
      ${field('Destino', `<input class="form__input" name="destination" value="${val(e.destination)}" placeholder="San Andrés Isla" />`)}
      ${field('Salida', `<input class="form__input" type="date" name="startDate" value="${val(e.startDate)}" min="${L.todayCO()}" />`)}
      ${field('Regreso', `<input class="form__input" type="date" name="endDate" value="${val(e.endDate)}" />`)}
      ${field('Cupo (personas)', `<input class="form__input" name="capacity" inputmode="numeric" value="${val(e.capacity || '')}" placeholder="120" />`)}
      ${field('Responder hasta', `<input class="form__input" type="date" name="rsvpDeadline" value="${val(e.rsvpDeadline)}" />`, { hint: 'Opcional' })}
      ${field('Código de origen (aliado que trajo el evento)', `<input class="form__input" name="originCode" value="${val(e.originCode)}" placeholder="CST-XXXX" />`, { hint: 'No se puede cambiar después de crear el evento.' })}
      ${field('Organizador', `
        <select class="form__input" name="organizer">
          <option value="">Sin organizador por ahora</option>
          ${organizers.map((u) => `<option value="${u.id}" ${String(u.id) === String(st.organizer.userId) ? 'selected' : ''}>${escapeHtml(u.name)} · ${escapeHtml(u.email)}</option>`).join('')}
        </select>`, { hint: 'Usuarios con rol «Organizador de evento» (se crean en Usuarios).' })}
      ${field('Permiso del organizador', `
        <select class="form__input" name="permission">
          ${Object.entries(ORGANIZER_PERMISSION_LABELS).map(([k, v]) => `<option value="${k}" ${st.organizer.permission === k ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}
        </select>`)}
      ${field('Asesor de CS Travel Group', `<input class="form__input" name="advisorName" value="${val(e.advisor?.name)}" />`)}
      ${field('Celular del asesor', `<input class="form__input" name="advisorPhone" value="${val(e.advisor?.phone)}" />`)}
      ${field('Qué incluye (una línea por cosa)', `<textarea class="form__input" name="includes" rows="3" placeholder="Hotel 3 noches con desayuno&#10;Traslados aeropuerto – hotel – aeropuerto">${escapeHtml((e.includes || []).join('\n'))}</textarea>`, { full: true })}
      <p class="ev-note form__group--full">${evIcon('info')}Plantilla ${escapeHtml(tpl.label.toLowerCase())}: ${escapeHtml(tpl.description)}</p>
    </form>`;
}

function coverageFor(p) {
  return L.hostCoverageFor({ price: Number(p.price) || 0, hostCoversType: p.hostCoversType, hostCoversValue: Number(p.hostCoversValue) || 0 });
}

function stepPackages() {
  const rows = st.packages.map((p, i) => `
    <div class="ev-pkgrow" data-pkg="${i}">
      <div class="ev-pkgrow__main">
        <input class="form__input" data-k="name" value="${escapeHtml(p.name)}" aria-label="Nombre del paquete" />
        <select class="form__input" data-k="audience" aria-label="Tipo de persona">
          ${Object.entries(AUDIENCE_LABELS).map(([k, v]) => `<option value="${k}" ${p.audience === k ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}
        </select>
        ${st.packages.length > 1 ? `<button type="button" class="btn btn--ghost btn--sm ev-icon-btn" data-remove-pkg="${i}" aria-label="Quitar paquete">${evIcon('x')}</button>` : ''}
      </div>
      <div class="ev-pkgrow__nums">
        <label><span>Precio por persona</span><span class="ev-amount__box ev-amount__box--sm"><span>$</span><input data-k="price" inputmode="numeric" value="${(Number(p.price) || 0).toLocaleString('es-CO')}" /></span></label>
        <label><span>Costo de terceros</span><span class="ev-amount__box ev-amount__box--sm"><span>$</span><input data-k="thirdPartyCost" inputmode="numeric" value="${(Number(p.thirdPartyCost) || 0).toLocaleString('es-CO')}" /></span></label>
        <label><span>Servicio CS Travel Group</span><b class="ev-pkgrow__svc">${money((Number(p.price) || 0) - (Number(p.thirdPartyCost) || 0))}</b></label>
      </div>
      <div class="ev-pkgrow__cover">
        <span class="ev-pkgrow__lbl">El anfitrión cubre</span>
        <div class="ev-seg ev-seg--sm" role="group" aria-label="Cobertura">
          ${[['none', 'Nada'], ['pct', '%'], ['fixed', 'Valor fijo']].map(([k, v]) => `<button type="button" data-cover="${k}" class="${p.hostCoversType === k ? 'is-active' : ''}">${v}</button>`).join('')}
        </div>
        ${p.hostCoversType !== 'none' ? `
          <span class="ev-amount__box ev-amount__box--sm ev-pkgrow__cv"><span>${p.hostCoversType === 'pct' ? '%' : '$'}</span><input data-k="hostCoversValue" inputmode="numeric" value="${(Number(p.hostCoversValue) || 0).toLocaleString('es-CO')}" /></span>
          <input class="form__input ev-pkgrow__cl" data-k="hostCoversLabel" value="${escapeHtml(p.hostCoversLabel || '')}" placeholder="Qué cubre (lo lee el invitado)" />` : ''}
      </div>
    </div>`).join('');
  const p0 = st.packages[0] || { price: 0 };
  const cov = coverageFor(p0);
  const host = st.event.hostDisplayName || 'el anfitrión';
  return `
    <div class="ev-pkgs">${rows}</div>
    <button type="button" class="btn btn--ghost btn--sm" id="ev-add-pkg">${evIcon('plus')}Agregar paquete</button>
    <div class="ev-guestpreview">
      <span class="ev-guestpreview__lbl">Así lo verá un invitado · ${escapeHtml(p0.name || 'Paquete')}</span>
      <div class="ev-five__grid">
        <div class="ev-five__row"><dt>Cuesta</dt><dd>${money(p0.price)}</dd></div>
        <div class="ev-five__row"><dt>Cubierto por ${escapeHtml(host)}</dt><dd>${cov ? `− ${money(cov)}` : money(0)}</dd></div>
        <div class="ev-five__row is-strong"><dt>Le toca</dt><dd>${money((Number(p0.price) || 0) - cov)}</dd></div>
      </div>
      ${cov && p0.hostCoversLabel ? `<small>${escapeHtml(host)} cubre: ${escapeHtml(p0.hostCoversLabel)}.</small>` : ''}
    </div>`;
}

function stepPlan() {
  const e = st.event;
  const plan = e.plan;
  const reserva = plan.reserva;
  const sampleName = st.type === 'promocion' ? 'Marta' : st.type === 'empresa' ? 'Carlos' : 'Familia';
  const previewText = fillMessage(e.inviteText, { nombre: sampleName, enlace: 'https://…/e/EVT-XXXXXX', event: { ...e, hostDisplayName: e.hostDisplayName || 'el anfitrión' } });
  return `
    <div class="ev-planform">
      <section class="ev-wsec">
        <h3>Reserva</h3>
        <div class="ev-seg ev-seg--sm" role="group" aria-label="Reserva">
          ${[['none', 'Sin reserva'], ['pct', 'Porcentaje'], ['amount', 'Valor fijo']].map(([k, v]) => `<button type="button" data-res="${k}" class="${(!reserva && k === 'none') || (reserva && reserva.pct && k === 'pct') || (reserva && reserva.amount && !reserva.pct && k === 'amount') ? 'is-active' : ''}">${v}</button>`).join('')}
        </div>
        ${reserva ? `
          <div class="ev-inline">
            <span class="ev-amount__box ev-amount__box--sm"><span>${reserva.pct ? '%' : '$'}</span><input data-res-val inputmode="numeric" value="${(reserva.pct || reserva.amount || 0).toLocaleString('es-CO')}" /></span>
            <span class="ev-inline__txt">a</span>
            <span class="ev-amount__box ev-amount__box--sm ev-inline__days"><input data-res-days inputmode="numeric" value="${reserva.dueDays ?? 7}" /><span>días</span></span>
            <span class="ev-inline__txt">de confirmar</span>
          </div>` : ''}
      </section>
      <section class="ev-wsec">
        <h3>Metas acumuladas</h3>
        <div class="ev-gen">
          <span>Generar</span>
          <span class="ev-amount__box ev-amount__box--sm ev-inline__days"><input data-gen-n inputmode="numeric" value="${st.monthly.n}" /></span>
          <span>pagos mensuales hasta</span>
          <input class="form__input ev-gen__date" type="date" data-gen-until value="${escapeHtml(st.monthly.until || '')}" />
          <button type="button" class="btn btn--ghost btn--sm" id="ev-gen">${evIcon('refresh')}Generar</button>
        </div>
        <div class="ev-hitos">
          ${plan.hitos.map((h, i) => `
            <div class="ev-hito" data-hito="${i}">
              <input class="form__input" data-h="label" value="${escapeHtml(h.label)}" aria-label="Nombre de la meta" />
              <input class="form__input" type="date" data-h="date" value="${escapeHtml(h.date)}" aria-label="Fecha" />
              <span class="ev-amount__box ev-amount__box--sm"><input data-h="pct" inputmode="numeric" value="${h.pct}" aria-label="% acumulado" /><span>%</span></span>
              ${plan.hitos.length > 1 ? `<button type="button" class="btn btn--ghost btn--sm ev-icon-btn" data-remove-hito="${i}" aria-label="Quitar meta">${evIcon('x')}</button>` : '<span></span>'}
            </div>`).join('')}
        </div>
        <button type="button" class="btn btn--ghost btn--sm" id="ev-add-hito">${evIcon('plus')}Agregar meta</button>
        <div class="ev-inline ev-inline--gap">
          <span class="ev-inline__txt">Abono mínimo</span>
          <span class="ev-amount__box ev-amount__box--sm"><span>$</span><input data-minabono inputmode="numeric" value="${(plan.minAbono || 0).toLocaleString('es-CO')}" /></span>
        </div>
      </section>
      <section class="ev-wsec">
        <h3>Tramos de cancelación</h3>
        <div class="ev-tiers">
          ${e.cancellationTiers.map((t, i) => `
            <div class="ev-tier" data-tier="${i}">
              <span class="ev-inline__txt">Con</span>
              <span class="ev-amount__box ev-amount__box--sm ev-inline__days"><input data-t="minDays" inputmode="numeric" value="${t.minDays}" /></span>
              <span class="ev-inline__txt">días o más, penalidad del</span>
              <span class="ev-amount__box ev-amount__box--sm ev-inline__days"><input data-t="pct" inputmode="numeric" value="${t.pct}" /><span>%</span></span>
            </div>`).join('')}
        </div>
      </section>
      <section class="ev-wsec">
        <h3>Privacidad del organizador</h3>
        <div class="ev-options">
          <label class="ev-option ${e.hostVisibility === 'solo_estado' ? 'is-on' : ''}"><input type="radio" name="vis" value="solo_estado" ${e.hostVisibility === 'solo_estado' ? 'checked' : ''} /><span class="ev-option__ico">${evIcon('lock')}</span><span><strong>Solo estados</strong><small>Ve «al día» o «atrasado», sin montos de cada invitado (bodas).</small></span></label>
          <label class="ev-option ${e.hostVisibility === 'montos' ? 'is-on' : ''}"><input type="radio" name="vis" value="montos" ${e.hostVisibility === 'montos' ? 'checked' : ''} /><span class="ev-option__ico">${evIcon('eye')}</span><span><strong>Con montos</strong><small>Ve cuánto ha pagado y cuánto debe cada cuenta (colegios y empresas).</small></span></label>
        </div>
      </section>
      <section class="ev-wsec">
        <h3>Textos de WhatsApp (sin montos)</h3>
        <div class="form form--grid">
          ${field('Invitación', `<textarea class="form__input" data-text="inviteText" rows="3">${escapeHtml(e.inviteText)}</textarea>`, { full: true })}
          ${field('Recordatorio', `<textarea class="form__input" data-text="reminderText" rows="3">${escapeHtml(e.reminderText)}</textarea>`, { full: true, hint: 'Marcadores: {nombre}, {evento}, {destino}, {fechas}, {anfitrion}, {enlace}.' })}
        </div>
        <div class="ev-bubble ev-bubble--sm">${escapeHtml(previewText)}</div>
      </section>
    </div>`;
}

function summaryHtml() {
  if (!st.type) return '<p class="ev-empty">Elige una plantilla para empezar.</p>';
  const e = st.event;
  const tpl = getTemplate(st.type);
  return `
    <div class="ev-wsum" style="--tone:${TEMPLATE_TONE[st.type]}">
      <span class="ev-pcard__type">${evIcon(TEMPLATE_ICON[st.type])}${escapeHtml(tpl.label)}</span>
      <strong class="ev-wsum__title">${escapeHtml(e.title || 'Sin título')}</strong>
      <span>${escapeHtml(e.hostDisplayName || 'Anfitrión por definir')}</span>
      <span>${evIcon('pin')}${escapeHtml(e.destination || 'Destino por definir')}</span>
      <span>${evIcon('calendar')}${escapeHtml(e.startDate ? fmtRange(e.startDate, e.endDate) : 'Fechas por definir')}</span>
      <hr />
      <span class="ev-wsum__lbl">Paquetes</span>
      ${st.packages.map((p) => `<span class="ev-wsum__pkg"><b>${escapeHtml(p.name)}</b><em>${money(p.price)}${coverageFor(p) ? ` · cubre ${money(coverageFor(p))}` : ''}</em></span>`).join('')}
      <span class="ev-wsum__lbl">Plan</span>
      <span>${e.plan.reserva ? `Reserva ${e.plan.reserva.pct ? `del ${e.plan.reserva.pct} %` : `de ${money(e.plan.reserva.amount)}`} · ` : ''}${plural(e.plan.hitos.length, 'meta')}</span>
      <span>Privacidad: ${e.hostVisibility === 'montos' ? 'con montos' : 'solo estados'}</span>
    </div>`;
}

/* ---------------------------------------------------------------------------
 * Lectura y validación de cada paso
 * ------------------------------------------------------------------------ */

const num = (v) => Number(String(v ?? '').replace(/\D/g, '')) || 0;

function readStep(root) {
  const e = st.event;
  if (st.step === 1) {
    const f = root.querySelector('[data-form="datos"]');
    const get = (n) => (f.elements[n] ? f.elements[n].value.trim() : '');
    const prevStart = e.startDate;
    e.title = get('title');
    e.hostDisplayName = get('hostDisplayName');
    e.destination = get('destination');
    e.startDate = get('startDate') || null;
    e.endDate = get('endDate') || null;
    e.capacity = num(get('capacity'));
    e.rsvpDeadline = get('rsvpDeadline') || null;
    e.originCode = get('originCode') ? get('originCode').toUpperCase() : null;
    e.advisor = { ...(e.advisor || {}), name: get('advisorName'), phone: get('advisorPhone') };
    e.includes = get('includes').split('\n').map((x) => x.trim()).filter(Boolean);
    st.organizer = { userId: get('organizer'), permission: get('permission') || 'titular' };
    // Si cambió la salida, las metas de la plantilla se vuelven a calcular.
    if (e.startDate && e.startDate !== prevStart) {
      e.plan = { ...planFor(st.type, e.startDate), reserva: e.plan.reserva };
      e.plan.hitos = e.plan.hitos.map((h) => (h.date < L.todayCO() ? { ...h, date: L.todayCO() } : h));
      st.monthly.until = (e.plan.hitos.slice(-1)[0] || {}).date;
    }
  } else if (st.step === 2) {
    root.querySelectorAll('[data-pkg]').forEach((row) => {
      const p = st.packages[Number(row.dataset.pkg)];
      row.querySelectorAll('[data-k]').forEach((input) => {
        const k = input.dataset.k;
        p[k] = ['price', 'thirdPartyCost', 'hostCoversValue'].includes(k) ? num(input.value) : input.value.trim();
      });
    });
  } else if (st.step === 3) {
    const plan = e.plan;
    if (plan.reserva) {
      const v = num(root.querySelector('[data-res-val]')?.value);
      const days = num(root.querySelector('[data-res-days]')?.value) || 7;
      plan.reserva = plan.reserva.pct ? { pct: v, dueDays: days } : { amount: v, dueDays: days };
    }
    root.querySelectorAll('[data-hito]').forEach((row) => {
      const h = plan.hitos[Number(row.dataset.hito)];
      h.label = row.querySelector('[data-h="label"]').value.trim() || h.label;
      h.date = row.querySelector('[data-h="date"]').value;
      h.pct = num(row.querySelector('[data-h="pct"]').value);
    });
    plan.minAbono = num(root.querySelector('[data-minabono]')?.value);
    root.querySelectorAll('[data-tier]').forEach((row) => {
      const t = e.cancellationTiers[Number(row.dataset.tier)];
      t.minDays = num(row.querySelector('[data-t="minDays"]').value);
      t.pct = num(row.querySelector('[data-t="pct"]').value);
    });
    const vis = root.querySelector('input[name="vis"]:checked');
    if (vis) e.hostVisibility = vis.value;
    root.querySelectorAll('[data-text]').forEach((t) => { e[t.dataset.text] = t.value.trim(); });
    st.monthly.n = num(root.querySelector('[data-gen-n]')?.value) || st.monthly.n;
    st.monthly.until = root.querySelector('[data-gen-until]')?.value || st.monthly.until;
  }
}

/** Errores del paso actual (lista vacía si todo está bien). */
function stepErrors() {
  const e = st.event;
  if (st.step === 0) return st.type ? [] : ['Elige una plantilla.'];
  if (st.step === 1) {
    const errs = [];
    if (!e.title) errs.push('Escribe el título del evento.');
    if (!e.hostDisplayName) errs.push('Escribe el nombre del anfitrión.');
    if (!e.destination) errs.push('Escribe el destino.');
    if (!e.startDate) errs.push('Elige la fecha de salida.');
    if (e.startDate && e.endDate && e.endDate < e.startDate) errs.push('La fecha de regreso no puede ser antes de la salida.');
    if (e.rsvpDeadline && e.startDate && e.rsvpDeadline > e.startDate) errs.push('La fecha para responder debe ser antes del viaje.');
    if (!(e.capacity > 0)) errs.push('Escribe el cupo del evento.');
    return errs;
  }
  if (st.step === 2) {
    return L.validateEventSetup({ plan: { hitos: [{ pct: 100, date: '2000-01-01' }] }, packages: st.packages, startDate: null })
      .concat(st.packages.some((p) => !p.name) ? ['Cada paquete necesita un nombre.'] : []);
  }
  const errs = L.validateEventSetup({ plan: e.plan, packages: st.packages, startDate: e.startDate, endDate: e.endDate, cancellationTiers: e.cancellationTiers });
  if (containsAmount(e.inviteText) || containsAmount(e.reminderText)) errs.push('Los textos de invitación y recordatorio no pueden llevar montos.');
  if (!String(e.inviteText).includes('{enlace}') || !String(e.reminderText).includes('{enlace}')) errs.push('Los textos deben incluir {enlace} para que cada familia reciba el suyo.');
  return errs;
}

/* ---------------------------------------------------------------------------
 * Vista
 * ------------------------------------------------------------------------ */

function paint(root, dir = 0) {
  root.querySelectorAll('.ev-wsteps li').forEach((li, i) => { li.classList.toggle('is-done', i < st.step); li.classList.toggle('is-current', i === st.step); });
  const body = root.querySelector('#ev-wiz-body');
  body.innerHTML = `<div class="ev-wpane ${dir > 0 ? 'from-right' : dir < 0 ? 'from-left' : ''}">${[stepTemplate, stepData, stepPackages, stepPlan][st.step]()}</div>`;
  root.querySelector('#ev-wiz-title').textContent = `Paso ${st.step + 1} de 4 · ${STEPS[st.step]}`;
  root.querySelector('#ev-wiz-sum').innerHTML = summaryHtml();
  root.querySelector('[data-back]').hidden = st.step === 0;
  root.querySelector('[data-next]').hidden = st.step === 3;
  root.querySelector('#ev-wiz-final').hidden = st.step !== 3;
  wireStyledSelects(body);
  bindStep(root);
}

function bindStep(root) {
  const body = root.querySelector('#ev-wiz-body');
  body.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
    if (st.type !== b.dataset.tpl) { const keep = organizers; st = freshState(b.dataset.tpl); organizers = keep; }
    st.step = 1;
    paint(root, 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  // Paquetes
  body.querySelectorAll('[data-cover]').forEach((b) => b.addEventListener('click', () => {
    readStep(root);
    const p = st.packages[Number(b.closest('[data-pkg]').dataset.pkg)];
    p.hostCoversType = b.dataset.cover;
    if (p.hostCoversType === 'pct' && !(p.hostCoversValue > 0 && p.hostCoversValue <= 100)) p.hostCoversValue = 100;
    paint(root);
  }));
  body.querySelectorAll('[data-k="price"], [data-k="thirdPartyCost"], [data-k="hostCoversValue"]').forEach((input) => input.addEventListener('change', () => { readStep(root); paint(root); }));
  body.querySelectorAll('[data-k="name"], [data-k="hostCoversLabel"]').forEach((input) => input.addEventListener('change', () => { readStep(root); root.querySelector('#ev-wiz-sum').innerHTML = summaryHtml(); }));
  body.querySelectorAll('[data-remove-pkg]').forEach((b) => b.addEventListener('click', () => { readStep(root); st.packages.splice(Number(b.dataset.removePkg), 1); paint(root); }));
  body.querySelector('#ev-add-pkg')?.addEventListener('click', () => {
    readStep(root);
    st.packages.push({ name: 'Paquete nuevo', audience: 'adulto', price: 1000000, thirdPartyCost: 880000, hostCoversType: 'none', hostCoversValue: 0, hostCoversLabel: '', status: 'activo' });
    paint(root);
  });
  // Plan
  body.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', () => {
    readStep(root);
    const k = b.dataset.res;
    st.event.plan.reserva = k === 'none' ? null : k === 'pct' ? { pct: 20, dueDays: 10 } : { amount: 300000, dueDays: 7 };
    paint(root);
  }));
  body.querySelector('#ev-gen')?.addEventListener('click', () => {
    readStep(root);
    if (!st.monthly.until || !(st.monthly.n >= 1 && st.monthly.n <= 24)) { shakeError(body.querySelector('.ev-gen')); showToast('Indica entre 1 y 24 pagos y la fecha del último.', 'error'); return; }
    st.event.plan.hitos = L.generateMonthlyHitos({ n: st.monthly.n, until: st.monthly.until });
    paint(root);
  });
  body.querySelectorAll('[data-remove-hito]').forEach((b) => b.addEventListener('click', () => { readStep(root); st.event.plan.hitos.splice(Number(b.dataset.removeHito), 1); paint(root); }));
  body.querySelector('#ev-add-hito')?.addEventListener('click', () => {
    readStep(root);
    const h = st.event.plan.hitos;
    const last = h[h.length - 1];
    h.push({ key: `hito${h.length + 1}`, label: `Meta ${h.length + 1}`, date: last ? L.addDays(last.date, 30) : L.todayCO(), pct: 100 });
    paint(root);
  });
  body.querySelectorAll('input[name="vis"]').forEach((r) => r.addEventListener('change', () => { readStep(root); paint(root); }));
  body.querySelectorAll('[data-text]').forEach((t) => t.addEventListener('change', () => { readStep(root); paint(root); }));
  body.querySelectorAll('.ev-amount__box input').forEach((input) => input.addEventListener('input', () => {
    const n = num(input.value);
    input.value = n ? n.toLocaleString('es-CO') : (input.value === '' ? '' : '0');
  }));
}

async function save(root, publish, button) {
  readStep(root);
  const errs = stepErrors();
  if (errs.length) { shakeError(button); showToast(errs[0], 'error'); return; }
  const e = st.event;
  const ok = await confirmDialog({
    title: publish ? 'Publicar el evento' : 'Guardar como borrador',
    message: publish
      ? `<p><strong>${escapeHtml(e.title)}</strong> quedará <strong>abierto</strong>: ya se podrán crear invitaciones, confirmar y pagar. El plan de la cuenta del anfitrión arranca hoy.</p><p class="cst-modal__note">El código de origen no se podrá cambiar después.</p>`
      : `<p>Se guarda <strong>${escapeHtml(e.title)}</strong> como borrador. Nadie lo ve hasta que lo publiques.</p>`,
    confirmLabel: publish ? 'Publicar' : 'Guardar borrador',
    cancelLabel: 'Revisar',
  });
  if (!ok) return;
  setLoading(button, true);
  try {
    const event = {
      ...e,
      status: publish ? 'abierto' : 'borrador',
      organizers: st.organizer.userId ? [{ userId: Number(st.organizer.userId), permission: st.organizer.permission }] : [],
    };
    const packages = st.packages.map((p, i) => ({ ...p, price: Number(p.price) || 0, thirdPartyCost: Number(p.thirdPartyCost) || 0, hostCoversValue: Number(p.hostCoversValue) || 0, sortOrder: i + 1 }));
    const created = await eventService.createEvent({ event, packages, hostAccountName: st.hostAccountName });
    showToast(publish ? `Evento publicado: ${created.title}.` : `Borrador guardado: ${created.title}.`, 'success');
    window.location.hash = `#/admin/events/${created.id}`;
  } catch (error) {
    showToast(error.message || 'No se pudo crear el evento.', 'error');
    setLoading(button, false);
  }
}

export const AdminEventNewView = {
  async render() {
    st = freshState(null);
    try {
      organizers = (await userService.getAll()).filter((u) => u.role === 'event' && u.status !== 'inactive');
    } catch {
      organizers = [];
    }
    return `
      <div class="evp">
        <div class="page-header ev-head">
          <div class="ev-head__text">
            <a class="ev-back" href="#/admin/events">${evIcon('arrowLeft')}Eventos</a>
            <h1 class="page-title">Nuevo evento</h1>
            <p class="page-subtitle">Parte de una plantilla: todo se puede ajustar antes de publicar.</p>
          </div>
        </div>
        <section class="ev-grid ev-grid--wizard">
          <div class="panel ev-wizard">
            <ol class="ev-wsteps ev-wsteps--four" aria-hidden="true">${STEPS.map((s, i) => `<li><span>${i + 1}</span>${escapeHtml(s)}</li>`).join('')}</ol>
            <h2 class="panel__title ev-wizard__title" id="ev-wiz-title"></h2>
            <div class="ev-wbody ev-wbody--page" id="ev-wiz-body"></div>
            <div class="ev-modal__foot">
              <button type="button" class="btn btn--ghost" data-back>${evIcon('arrowLeft')}Atrás</button>
              <button type="button" class="btn btn--primary" data-next>Siguiente${evIcon('arrowRight')}</button>
              <div class="ev-wizard__final" id="ev-wiz-final" hidden>
                <button type="button" class="btn btn--ghost" id="ev-save-draft">Guardar borrador</button>
                <button type="button" class="btn btn--primary" id="ev-publish">${evIcon('send')}Publicar evento</button>
              </div>
            </div>
          </div>
          <aside class="panel ev-wizard-sum">
            <div class="panel__header"><h2 class="panel__title">Resumen</h2></div>
            <div id="ev-wiz-sum"></div>
          </aside>
        </section>
      </div>`;
  },

  async afterRender() {
    const root = document.querySelector('.evp');
    paint(root);
    root.querySelector('[data-next]').addEventListener('click', (e) => {
      if (st.step >= STEPS.length - 1) return;
      readStep(root);
      const errs = stepErrors();
      if (errs.length) { shakeError(e.currentTarget); showToast(errs[0], 'error'); return; }
      st.step += 1;
      paint(root, 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    root.querySelector('[data-back]').addEventListener('click', () => {
      readStep(root);
      st.step = Math.max(0, st.step - 1);
      paint(root, -1);
    });
    root.querySelector('#ev-save-draft').addEventListener('click', (e) => save(root, false, e.currentTarget));
    root.querySelector('#ev-publish').addEventListener('click', (e) => save(root, true, e.currentTarget));
  },
};

registerTours({
  '#/admin/events/new': {
    version: 1,
    title: 'Nuevo evento',
    intro: {
      que: 'El asistente para crear una boda, una promoción de colegio o un viaje de empresa.',
      para: 'Dejar listo el evento con sus paquetes, quién paga qué y el plan de pagos, sin empezar de cero.',
      como: 'Elige la plantilla, completa los datos, ajusta paquetes y coberturas, y revisa el plan. Guarda un borrador o publícalo.',
    },
    steps: [
      { sel: '.ev-wsteps', title: 'Cuatro pasos', text: 'Plantilla, datos, paquetes y plan. Puedes volver atrás sin perder lo escrito.' },
      { sel: '#ev-wiz-body', title: 'El paso actual', text: 'Cada plantilla trae paquetes, coberturas, metas, tramos de cancelación y textos listos para ajustar.' },
      { sel: '.ev-wizard-sum', title: 'Resumen', text: 'Lo que llevas del evento, siempre a la vista.', optional: 'en el celular el resumen va al final' },
    ],
  },
});

