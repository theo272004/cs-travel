/**
 * EventGuestView.js  ·  #/e/:code   (pública, layout 'blank')
 * =============================================================================
 * PROPOSITO:
 *   «Mi cuenta» del invitado (o del acudiente), con su enlace personal y sin
 *   usuario ni contraseña. Mismo estilo que el registro de aliados: portada
 *   azul a la izquierda (el viaje) y la acción a la derecha.
 *     - Si no ha respondido: confirmar quién va (hasta sus cupos) o «No podré
 *       asistir».
 *     - Si ya confirmó: un estado grande («Estás al día» / «Te faltan $X para
 *       el …»), cómo se paga su viaje (tú / cubierto por el anfitrión), metas,
 *       movimientos y personas; «Pagar la cuota sugerida» y «Pagar otro valor»
 *       (entre el abono mínimo y el saldo), que llevan a payHref.
 *     - «Simular pago aprobado» SOLO existe fuera del bundle desplegado.
 *
 * SEGURIDAD: solo se ve SU cuenta (eventService.getGuestView). En el portal
 *   desplegado esta ruta no se usa: en producción será una página Astro con
 *   un token largo guardado en hash (ver la especificación).
 * =============================================================================
 */

import { eventService } from '../services/eventService.js';
import * as L from '../utils/eventLedger.js';
import { getTemplate, AUDIENCE_LABELS, guestLink } from '../utils/eventTemplates.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { payHref, payTargetAttrs } from '../utils/payLink.js';
import { shakeError } from '../utils/feedback.js';
import { showToast } from '../utils/toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { wireStyledSelects } from '../components/StyledSelect.js';
import logoCs from '../assets/logo-cs.png';
import {
  evIcon, money, plural, fmtRange, fmtDayLong, countdownText, firstName, initials, TEMPLATE_ICON,
  fiveFiguresHtml, milestonesHtml, movementsHtml, setLoading, currentOrigin, copyText,
} from '../components/EventKit.js';

let state = null;

const actorFor = (code) => ({ id: null, role: 'invitado', accessCode: code });

/** Portada del viaje (panel azul). */
function coverHtml(v) {
  const { event } = v;
  const tpl = getTemplate(event.type);
  const days = event.startDate ? L.daysBetween(L.todayCO(), event.startDate) : null;
  const a = event.advisor || {};
  const phone = String(a.phone || '').replace(/\D/g, '');
  return `
    <aside class="eg-cover">
     <div class="eg-cover__in">
      <span class="eg-cover__kicker">${evIcon(TEMPLATE_ICON[event.type] || 'calendar')}${escapeHtml(tpl.label)} · te invita ${escapeHtml(event.hostDisplayName || v.hostName)}</span>
      <h1 class="eg-cover__title">${escapeHtml(event.title)}</h1>
      <div class="eg-cover__chips">
        <span>${evIcon('calendar')}${escapeHtml(fmtRange(event.startDate, event.endDate))}</span>
        <span>${evIcon('pin')}${escapeHtml(event.destination || '')}</span>
      </div>
      ${days != null && days > 0 ? `
        <div class="eg-count" aria-label="${escapeHtml(countdownText(event))}">
          <strong>${days}</strong><span>${days === 1 ? 'día' : 'días'} para el viaje</span>
        </div>` : `<div class="eg-count eg-count--text"><span>${escapeHtml(countdownText(event))}</span></div>`}
      ${(event.includes || []).length ? `
        <div class="eg-includes">
          <span class="eg-cover__label">Qué incluye</span>
          <ul>${event.includes.map((x) => `<li>${evIcon('check')}${escapeHtml(x)}</li>`).join('')}</ul>
        </div>` : ''}
      <div class="eg-cover__advisor">
        <span class="eg-cover__avatar">${escapeHtml(initials(a.name || 'CS Travel Group'))}</span>
        <span><small>Tu asesor de CS Travel Group</small><strong>${escapeHtml(a.name || 'Equipo CS Travel Group')}</strong></span>
        ${phone ? `<a class="eg-cover__wa" href="https://wa.me/${phone}?text=${encodeURIComponent(`Hola, ${firstName(a.name)}. Te escribo por el viaje «${event.title}» (${v.account.displayName}).`)}" target="_blank" rel="noopener">${evIcon('message')}Escribir</a>` : ''}
      </div>
     </div>
    </aside>`;
}

/** Formulario para confirmar (o no) la asistencia. */
function rsvpHtml(v) {
  const { account, guests, packages, event } = v;
  const seats = Math.max(1, Number(account.seatsAllowed) || 1);
  const active = guests.filter((g) => g.status !== 'cancelado');
  const audiences = [...new Set(packages.map((p) => p.audience))];
  const closed = event.status !== 'abierto' || (event.rsvpDeadline && L.todayCO() > event.rsvpDeadline);
  const rows = active.length
    ? active.map((g) => `
        <label class="eg-person">
          <input type="checkbox" data-guest="${g.id}" checked />
          <span class="eg-person__avatar">${escapeHtml(initials(L.guestName(g)))}</span>
          <span><strong>${escapeHtml(L.guestName(g))}</strong><small>${escapeHtml(AUDIENCE_LABELS[g.audience] || g.audience)}</small></span>
          <em class="eg-person__yes">Va</em>
        </label>`).join('')
    : Array.from({ length: seats }, (_, i) => `
        <div class="eg-newperson">
          <span class="eg-newperson__n">${i + 1}</span>
          <input class="form__input" data-first="${i}" placeholder="Nombre" aria-label="Nombre de la persona ${i + 1}" ${i === 0 ? `value="${escapeHtml(firstName(account.contactName))}"` : ''} />
          <input class="form__input" data-last="${i}" placeholder="Apellido" aria-label="Apellido de la persona ${i + 1}" ${i === 0 ? `value="${escapeHtml(String(account.contactName || '').split(/\s+/).slice(1).join(' '))}"` : ''} />
          ${audiences.length > 1 ? `
            <select class="form__input" data-aud="${i}" aria-label="Tipo de persona ${i + 1}">
              ${audiences.map((a) => `<option value="${a}">${escapeHtml(AUDIENCE_LABELS[a] || a)}${a === 'nino' ? ' (2 a 11 años)' : ''}</option>`).join('')}
            </select>` : ''}
        </div>`).join('');
  return `
    <div class="eg-step">
      <span class="eg-kicker">Hola, ${escapeHtml(firstName(account.contactName || account.displayName))}</span>
      <h2 class="eg-title">¿Vienes al viaje?</h2>
      <p class="eg-lead">${active.length ? 'Marca quién va.' : `Tu invitación tiene ${plural(seats, 'cupo')}. Escribe el nombre de cada persona que viaja; deja en blanco los cupos que no uses.`}</p>
      ${closed ? `<p class="eg-note">${evIcon('info')}La fecha para responder ya pasó. Escríbele a tu asesor de CS Travel Group.</p>` : `
        <div class="eg-people">${rows}</div>
        <div class="eg-actions">
          <button type="button" class="eg-btn eg-btn--gold" id="eg-confirm">Confirmar asistencia${evIcon('arrowRight')}</button>
          <button type="button" class="eg-btn eg-btn--ghost" id="eg-decline">No podré asistir</button>
        </div>
        ${event.rsvpDeadline ? `<p class="eg-hint">${evIcon('clock')}Puedes responder hasta el ${escapeHtml(fmtDayLong(event.rsvpDeadline))}.</p>` : ''}`}
    </div>`;
}

/** Estado grande de la cuenta. */
function bigStatus(c, v) {
  const host = v.event.hostDisplayName || v.hostName;
  switch (c.status) {
    case 'atrasado':
      return { tone: 'late', icon: 'alert', title: `Tienes ${money(c.exigible)} pendientes`, text: `Tu meta del ${fmtDayLong(c.oldestUnmet?.date)} ya pasó. Ponte al día cuando puedas.` };
    case 'por_vencer':
      return { tone: 'soon', icon: 'clock', title: `Te faltan ${money(c.next.target - c.pagado)} para el ${fmtDayLong(c.next.date)}`, text: `Es tu meta «${c.next.label}». Puedes abonar desde ${money(c.payment.min)}.` };
    case 'pagado':
      return { tone: 'ok', icon: 'checkCircle', title: '¡Pagaste todo tu viaje!', text: 'No tienes nada pendiente. Nos vemos en el viaje.' };
    case 'cubierto':
      return { tone: 'ok', icon: 'gift', title: 'Tu viaje está cubierto', text: `${host} cubre todo lo que te toca. No tienes que pagar nada.` };
    case 'saldo_a_favor':
      return { tone: 'ok', icon: 'wallet', title: `Tienes ${money(-c.saldo)} a favor`, text: 'CS Travel Group te contactará para devolverlo o dejarlo para otro viaje.' };
    case 'sin_cargos':
      return { tone: 'ok', icon: 'info', title: 'Todavía no tienes cargos', text: 'Cuando se asigne tu paquete verás aquí tu plan de pagos.' };
    default:
      return c.next
        ? { tone: 'ok', icon: 'checkCircle', title: 'Estás al día', text: `Tu próxima meta es el ${fmtDayLong(c.next.date)}: ${money(c.next.target)} en total (te faltan ${money(c.next.target - c.pagado)}).` }
        : { tone: 'ok', icon: 'checkCircle', title: 'Estás al día', text: `Te faltan ${money(c.saldo)} para completar tu viaje.` };
  }
}

function accountHtml(v) {
  const { computed: c, event, account, guests, packages } = v;
  const s = bigStatus(c, v);
  const pay = c.payment || { canPay: false };
  const pkgName = (id) => (packages.find((p) => L.sameId(p.id, id)) || {}).name || '';
  const going = guests.filter((g) => g.status !== 'cancelado' && g.attendance === 'si');
  const href = pay.canPay ? payHref({ reference: `event:${account.id}`, concept: `${event.title} · ${account.displayName}`, amount: pay.suggested }) : '';
  return `
    <div class="eg-step">
      <span class="eg-kicker">Mi cuenta · ${escapeHtml(account.displayName)}</span>
      <div class="eg-status eg-status--${s.tone}">
        <span class="eg-status__icon">${evIcon(s.icon)}</span>
        <div><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.text)}</p></div>
      </div>

      ${pay.canPay ? `
        <div class="eg-pay">
          <a class="eg-btn eg-btn--gold" id="eg-pay" href="${href}"${payTargetAttrs()}>${evIcon('card')}Pagar ${money(pay.suggested)}</a>
          <button type="button" class="eg-btn eg-btn--ghost" id="eg-other" aria-expanded="false">Pagar otro valor</button>
        </div>
        <div class="eg-other" id="eg-other-box" hidden>
          <label class="eg-other__label" for="eg-other-input">¿Cuánto quieres abonar? Entre ${money(pay.min)} y ${money(pay.max)}.</label>
          <div class="eg-other__row">
            <span class="eg-other__box"><span>$</span><input id="eg-other-input" inputmode="numeric" autocomplete="off" placeholder="${pay.min.toLocaleString('es-CO')}" /></span>
            <button type="button" class="eg-btn eg-btn--blue" id="eg-other-go">Pagar este valor</button>
          </div>
        </div>
        <div class="eg-links">
          <button type="button" class="eg-link" id="eg-share">${evIcon('link')}Compartir este pago</button>
          ${v.canSimulatePayment ? `<button type="button" class="eg-link eg-link--demo" id="eg-simulate" title="Solo existe en el demo">${evIcon('sparkle')}Simular pago aprobado (demo)</button>` : ''}
        </div>` : ''}

      <section class="eg-section">
        <h3>Así se paga tu viaje</h3>
        ${c.status === 'sin_cargos' ? '<p class="ev-empty">Sin cargos todavía.</p>' : fiveFiguresHtml(c, { hostName: event.hostDisplayName || v.hostName, you: true })}
      </section>

      ${(c.milestones || []).length ? `<section class="eg-section"><h3>Tus metas</h3>${milestonesHtml(c)}</section>` : ''}

      <section class="eg-section">
        <h3>Quiénes viajan</h3>
        <ul class="eg-travelers">
          ${going.map((g) => `<li><span class="eg-person__avatar">${escapeHtml(initials(L.guestName(g)))}</span><span><strong>${escapeHtml(L.guestName(g))}</strong><small>${escapeHtml(pkgName(g.packageId) || AUDIENCE_LABELS[g.audience] || '')}</small></span></li>`).join('') || '<li class="ev-empty">Nadie confirmado.</li>'}
        </ul>
      </section>

      <section class="eg-section">
        <h3>Movimientos</h3>
        ${movementsHtml(v.lines, { limit: 20 })}
      </section>
    </div>`;
}

function declinedHtml(v) {
  return `
    <div class="eg-step">
      <span class="eg-kicker">Hola, ${escapeHtml(firstName(v.account.contactName || v.account.displayName))}</span>
      <div class="eg-status eg-status--muted">
        <span class="eg-status__icon">${evIcon('heart')}</span>
        <div><h2>Gracias por avisarnos</h2><p>Quedó registrado que no podrás asistir. Si cambias de opinión, escríbele a tu asesor de CS Travel Group.</p></div>
      </div>
    </div>`;
}

/** En el celular, lo que incluye y el asesor van al final (la acción va primero). */
function mobileExtras(v) {
  const { event } = v;
  const a = event.advisor || {};
  const phone = String(a.phone || '').replace(/\D/g, '');
  return `
    <section class="eg-section eg-mobile-only">
      ${(event.includes || []).length ? `<h3>Qué incluye</h3><ul class="eg-inc-list">${event.includes.map((x) => `<li>${evIcon('check')}${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
      ${phone ? `<a class="eg-btn eg-btn--ghost eg-advisor-m" href="https://wa.me/${phone}?text=${encodeURIComponent(`Hola, ${firstName(a.name)}. Te escribo por el viaje «${event.title}» (${v.account.displayName}).`)}" target="_blank" rel="noopener">${evIcon('message')}Escribir a ${escapeHtml(firstName(a.name) || 'CS Travel Group')}, tu asesor</a>` : ''}
    </section>`;
}

function mainHtml(v) {
  const body = v.account.rsvp === 'no_asiste' ? declinedHtml(v) : v.account.rsvp === 'confirmada' ? accountHtml(v) : rsvpHtml(v);
  const at = body.lastIndexOf('</div>');
  return `${body.slice(0, at)}${mobileExtras(v)}${body.slice(at)}`;
}

export const EventGuestView = {
  async render(ctx) {
    const code = String(ctx.params.code || '').toUpperCase();
    let v = await eventService.getGuestView(code);
    if (v && ['sin_enviar', 'enviada'].includes(v.account.rsvp)) {
      try {
        await eventService.markInvitationViewed(code);
        v = await eventService.getGuestView(code);
      } catch {
        // Si no se puede marcar como vista, la página funciona igual.
      }
    }
    state = { code, v };
    if (!v) {
      return `
        <div class="eg eg--missing">
          <div class="eg-masthead"><img src="${logoCs}" alt="" /><span><strong>CS Travel Group</strong><small>Viajes de grupo</small></span></div>
          <div class="eg-missing">
            <span class="ev-empty-panel__icon">${evIcon('link')}</span>
            <h1>No encontramos esta invitación</h1>
            <p>Revisa que el enlace esté completo o pídele uno nuevo a quien te invitó.</p>
          </div>
        </div>`;
    }
    return `
      <div class="eg">
        <div class="eg-masthead"><img src="${logoCs}" alt="" /><span><strong>CS Travel Group</strong><small>Viajes de grupo</small></span></div>
        <article class="eg-card">
          ${coverHtml(v)}
          <main class="eg-main" id="eg-main">${mainHtml(v)}</main>
        </article>
        <p class="eg-foot">${evIcon('lock')}Este es tu enlace personal. Solo tú ves esta cuenta.</p>
      </div>`;
  },

  async afterRender() {
    if (!state || !state.v) return;
    const previous = document.title;
    document.title = `${state.v.event.title} · CS Travel Group`;
    window.addEventListener('hashchange', () => { document.title = previous; }, { once: true });
    bindMain();
  },
};

/** Vuelve a pintar solo el panel derecho (con deslizamiento). */
async function refresh() {
  state.v = await eventService.getGuestView(state.code);
  const main = document.getElementById('eg-main');
  if (!main) return;
  main.innerHTML = mainHtml(state.v);
  main.firstElementChild?.classList.add('ev-slide-right');
  bindMain();
}

function bindMain() {
  const main = document.getElementById('eg-main');
  const { v, code } = state;
  if (!main) return;
  wireStyledSelects(main);
  const actor = actorFor(code);

  main.querySelector('#eg-confirm')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const active = v.guests.filter((g) => g.status !== 'cancelado');
    let persons;
    if (active.length) {
      persons = active.map((g) => ({ id: g.id, attendance: main.querySelector(`[data-guest="${g.id}"]`)?.checked ? 'si' : 'no' }));
      if (!persons.some((p) => p.attendance === 'si')) { shakeError(btn); showToast('Marca al menos a una persona o toca «No podré asistir».', 'error'); return; }
    } else {
      const seats = Math.max(1, Number(v.account.seatsAllowed) || 1);
      persons = Array.from({ length: seats }, (_, i) => ({
        firstName: (main.querySelector(`[data-first="${i}"]`)?.value || '').trim(),
        lastName: (main.querySelector(`[data-last="${i}"]`)?.value || '').trim(),
        audience: main.querySelector(`[data-aud="${i}"]`)?.value || (v.packages[0] ? v.packages[0].audience : 'adulto'),
        attendance: 'si',
      })).filter((p) => p.firstName);
      if (!persons.length) { shakeError(btn); showToast('Escribe el nombre de al menos una persona.', 'error'); return; }
    }
    const n = persons.filter((p) => p.attendance === 'si').length;
    const ok = await confirmDialog({
      title: 'Confirmar asistencia',
      message: `<p>Vas a confirmar <strong>${plural(n, 'persona')}</strong> para «${escapeHtml(v.event.title)}».</p><p class="cst-modal__note">Después verás cuánto te toca y tu plan de pagos. Para cambios posteriores, escríbele a tu asesor.</p>`,
      confirmLabel: 'Sí, confirmar',
      cancelLabel: 'Revisar',
    });
    if (!ok) return;
    setLoading(btn, true);
    try {
      await eventService.confirmAttendance(v.account.id, persons, actor);
      showToast('¡Listo! Tu asistencia quedó confirmada.', 'success');
      await refresh();
    } catch (error) {
      showToast(error.message || 'No se pudo confirmar.', 'error');
      setLoading(btn, false);
    }
  });

  main.querySelector('#eg-decline')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = await confirmDialog({
      title: '¿No podrás asistir?',
      message: `<p>Le avisaremos a ${escapeHtml(v.event.hostDisplayName || v.hostName)} que no podrás ir a «${escapeHtml(v.event.title)}».</p>`,
      confirmLabel: 'Sí, no podré ir',
      cancelLabel: 'Volver',
    });
    if (!ok) return;
    setLoading(btn, true);
    try {
      await eventService.declineInvitation(v.account.id, actor);
      await refresh();
    } catch (error) {
      showToast(error.message || 'No se pudo registrar tu respuesta.', 'error');
      setLoading(btn, false);
    }
  });

  const otherBtn = main.querySelector('#eg-other');
  const otherBox = main.querySelector('#eg-other-box');
  const otherInput = main.querySelector('#eg-other-input');
  otherBtn?.addEventListener('click', () => {
    const open = otherBox.hidden;
    otherBox.hidden = !open;
    otherBtn.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => otherInput.focus(), 40);
  });
  otherInput?.addEventListener('input', () => {
    const n = Number(otherInput.value.replace(/\D/g, '')) || 0;
    otherInput.value = n ? n.toLocaleString('es-CO') : '';
  });
  const readOther = () => Number((otherInput?.value || '').replace(/\D/g, '')) || 0;
  main.querySelector('#eg-other-go')?.addEventListener('click', (e) => {
    const amount = readOther();
    const problem = L.validatePaymentAmount(amount, v.computed.payment);
    if (problem) { shakeError(otherInput.closest('.eg-other__box')); showToast(problem, 'error'); return; }
    const href = payHref({ reference: `event:${v.account.id}`, concept: `${v.event.title} · ${v.account.displayName}`, amount });
    if (href.startsWith('http')) window.open(href, '_blank', 'noopener');
    else window.location.hash = href;
    e.currentTarget.blur();
  });

  main.querySelector('#eg-share')?.addEventListener('click', (e) => {
    const link = guestLink(v.account.accessCode, currentOrigin());
    copyText(link, 'Enlace copiado: quien lo abra puede ver esta cuenta y pagar por ti.', e.currentTarget);
  });

  main.querySelector('#eg-simulate')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const other = readOther();
    const amount = other || v.computed.payment.suggested;
    const problem = L.validatePaymentAmount(amount, v.computed.payment);
    if (problem) { showToast(problem, 'error'); return; }
    const ok = await confirmDialog({
      title: 'Simular pago aprobado',
      message: `<p>Esto solo existe en el demo: registra un pago aprobado de <strong>${money(amount)}</strong> como si viniera de la pasarela.</p>`,
      confirmLabel: 'Simular pago',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    setLoading(btn, true);
    try {
      await eventService.simulateDemoPayment(v.account.id, amount, actor);
      showToast(`Pago de ${money(amount)} aprobado (simulación).`, 'success');
      await refresh();
    } catch (error) {
      showToast(error.message || 'No se pudo simular el pago.', 'error');
      setLoading(btn, false);
    }
  });
}
