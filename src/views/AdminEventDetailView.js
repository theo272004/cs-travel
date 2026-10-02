/**
 * AdminEventDetailView.js  ·  #/admin/events/:id?tab=resumen|personas|dinero
 * =============================================================================
 * PROPOSITO:
 *   Un evento visto por CS Travel Group, en pestañas:
 *     - Resumen: el mismo Inicio del organizador (EventDashboardView) más el
 *       servicio CS Travel Group estimado (F-03), las alertas y «Ver como
 *       organizador» (la vista con SUS permisos y SU privacidad).
 *     - Personas: la misma lista del organizador, con montos siempre, y en la
 *       ficha las acciones que solo hace CS Travel Group: registrar pago y
 *       reembolso, cancelar a una persona (con la penalidad cotizada antes),
 *       documentos, enlace personal nuevo y notas internas.
 *     - Dinero: cifras, plan de pagos, saldos a favor por reembolsar y el
 *       libro completo (filtrable), con «Corregir» por línea y el CSV F-03.
 *   Todas las escrituras piden confirmación (confirmDialog) y pasan por las
 *   funciones de dominio de eventService (nunca un patch libre al libro).
 *
 * Las pestañas cambian sin recargar (se desliza el contenido) y quedan en
 * ?tab= para tener enlace directo.
 * =============================================================================
 */

import { eventService } from '../services/eventService.js';
import { authService } from '../services/authService.js';
import { apiService } from '../services/apiService.js';
import * as L from '../utils/eventLedger.js';
import { vocabFor, AUDIENCE_LABELS } from '../utils/eventTemplates.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { shakeError } from '../utils/feedback.js';
import { showToast } from '../utils/toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { closeDrawer } from '../components/Drawer.js';
import { registerTours } from '../components/Tour.js';
import { wireStyledSelects } from '../components/StyledSelect.js';
import { renderOverview, bindOverview, kpiCard } from './EventDashboardView.js';
import { renderPeoplePanel, bindPeoplePanel, exportPeopleCsv } from './EventPeopleView.js';
import {
  moneyKpisHtml, whoPaysHtml, planHtml, monthChartHtml, bindMoneyCommon, openContributionModal,
} from './EventMoneyView.js';
import {
  evIcon, money, plural, fmtDay, eventChips, countNode, runCountUp, adminLink, rerender, setHashQuery,
  setLoading, portal, emptyHtml, exportCsv, accountBadge, relTime, initials,
} from '../components/EventKit.js';

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: 'grid' },
  { key: 'personas', label: 'Personas', icon: 'users' },
  { key: 'dinero', label: 'Dinero', icon: 'wallet' },
];

const KIND_LABEL = {
  cargo: 'Cargo', aporte_anfitrion: 'Cobertura', descuento: 'Descuento', cancelacion: 'Cancelación',
  penalidad: 'Penalidad', pago: 'Pago', reembolso: 'Reembolso', reverso_pago: 'Reverso',
};
const METHOD_LABEL = { transferencia: 'Transferencia', bold: 'Bold', wompi: 'Wompi' };

let ctxCache = null;

/* ---------------------------------------------------------------------------
 * Resumen
 * ------------------------------------------------------------------------ */

function alertsHtml(data) {
  const { alerts } = data.summary;
  const link = adminLink(data.event.id);
  const items = [];
  alerts.atrasadas30.forEach((a) => items.push(`
    <li><a class="ev-alertrow ev-alertrow--red" href="${escapeHtml(link('people', { cuenta: a.accountId }))}">
      <span class="ev-alertrow__ico">${evIcon('alert')}</span>
      <span class="ev-alertrow__txt"><strong>${escapeHtml(a.displayName)}</strong><small>Atrasada ${plural(a.diasAtraso, 'día')}${a.exigible != null ? ` · ${money(a.exigible)} vencidos` : ''}</small></span>
      ${evIcon('chevronRight', 'ev-alertrow__chev')}
    </a></li>`));
  alerts.saldosAFavor.forEach((a) => items.push(`
    <li><a class="ev-alertrow ev-alertrow--blue" href="${escapeHtml(link('money', { cuenta: a.accountId }))}">
      <span class="ev-alertrow__ico">${evIcon('undo')}</span>
      <span class="ev-alertrow__txt"><strong>${escapeHtml(a.displayName)}</strong><small>Saldo a favor por reembolsar${a.aFavor != null ? ` · ${money(a.aFavor)}` : ''}</small></span>
      ${evIcon('chevronRight', 'ev-alertrow__chev')}
    </a></li>`));
  if (alerts.metaBaja) {
    const m = alerts.metaBaja;
    items.push(`
      <li><a class="ev-alertrow ev-alertrow--amber" href="${escapeHtml(link('money'))}">
        <span class="ev-alertrow__ico">${evIcon('flag')}</span>
        <span class="ev-alertrow__txt"><strong>Meta del ${escapeHtml(fmtDay(m.date))} con recaudo bajo</strong><small>Va en ${Math.round(m.pct * 100)} % · faltan ${money(m.falta)} en ${plural(m.cuentas, 'cuenta')}</small></span>
        ${evIcon('chevronRight', 'ev-alertrow__chev')}
      </a></li>`);
  }
  return `
    <section class="panel ev-alerts">
      <div class="panel__header"><h2 class="panel__title">Alertas</h2><span class="muted ev-small">También llegan a la Cola de trabajo</span></div>
      ${items.length ? `<ul class="ev-alertlist ev-rows">${items.join('')}</ul>` : emptyHtml('Sin alertas', 'Nadie con más de 30 días de atraso, sin saldos a favor y sin metas en riesgo.')}
    </section>`;
}

function summaryHtml(data, asOrganizer = null) {
  const link = adminLink(data.event.id);
  const banner = asOrganizer ? `
    <div class="ev-asorg">
      <span class="ev-asorg__ico">${evIcon('eye')}</span>
      <p>Estás viendo lo que ve <b>${escapeHtml(asOrganizer.name)}</b> (permiso ${escapeHtml(data.permission || 'lectura')}${data.view.amounts ? ', con montos' : ', solo estados: sin montos de los invitados'}).</p>
      <button type="button" class="btn btn--ghost btn--sm" id="ev-as-admin">Volver a la vista de CS Travel Group</button>
    </div>` : '';
  const service = !asOrganizer && data.summary.serviceEstimate != null ? kpiCard({
    label: 'Servicio CS Travel Group (estimado)',
    value: countNode(data.summary.serviceEstimate),
    hint: 'Precio menos costo de terceros (F-03)',
    icon: 'briefcase',
    accent: 'teal',
  }) : '';
  return `
    ${banner}
    ${renderOverview(data, { link, extraKpi: service, beforeCharts: asOrganizer ? '' : alertsHtml(data) })}`;
}

/* ---------------------------------------------------------------------------
 * Formularios de dinero (pago y reembolso)
 * ------------------------------------------------------------------------ */

/**
 * Registrar pago (transferencia verificada) o reembolso de saldo a favor.
 * @param {'pago'|'reembolso'} kind
 */
function openMoneyForm({ kind, data, accountId = null, onDone }) {
  const isRefund = kind === 'reembolso';
  const today = L.todayCO();
  const accounts = data.accounts
    .map((a) => ({ a, c: data.summary.byId.get(String(a.id)) }))
    .filter(({ c }) => c && (isRefund ? c.saldo < 0 : c.status !== 'sin_cargos'))
    .sort((x, y) => (x.a.kind === 'anfitrion' ? -1 : 0) - (y.a.kind === 'anfitrion' ? -1 : 0) || x.a.displayName.localeCompare(y.a.displayName, 'es'));
  if (!accounts.length) { showToast(isRefund ? 'No hay cuentas con saldo a favor.' : 'No hay cuentas con cargos.', 'info'); return; }
  const chosen = accounts.find(({ a }) => L.sameId(a.id, accountId)) || accounts[0];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay ev-modal-overlay';
  overlay.innerHTML = `
    <div class="modal ev-modal ev-modal--form" role="dialog" aria-modal="true" aria-labelledby="ev-mf-title">
      <div class="modal__header ev-modal__header">
        <div>
          <h2 class="modal__title" id="ev-mf-title">${isRefund ? 'Registrar reembolso' : 'Registrar pago'}</h2>
          <p class="modal__subtitle">${isRefund ? 'Devolución de un saldo a favor, con su comprobante.' : 'Transferencia verificada por CS Travel Group, con su comprobante.'}</p>
        </div>
        <button type="button" class="modal__close ev-modal__close" data-close aria-label="Cerrar">${evIcon('x')}</button>
      </div>
      <form class="form form--grid ev-mf" novalidate>
        <div class="form__group form__group--full">
          <label class="form__label" for="ev-mf-account">Cuenta</label>
          <select class="form__input" id="ev-mf-account">
            ${accounts.map(({ a, c }) => `<option value="${escapeHtml(a.id)}" ${a === chosen.a ? 'selected' : ''}>${escapeHtml(a.displayName)} · ${isRefund ? `a favor ${money(-c.saldo)}` : c.saldo > 0 ? `saldo ${money(c.saldo)}` : c.statusLabel}</option>`).join('')}
          </select>
        </div>
        <div class="form__group">
          <label class="form__label" for="ev-mf-amount">Valor</label>
          <div class="ev-amount__box ev-amount__box--sm"><span>$</span><input id="ev-mf-amount" inputmode="numeric" autocomplete="off" /></div>
          <small class="form__hint" id="ev-mf-hint"></small>
        </div>
        <div class="form__group">
          <label class="form__label" for="ev-mf-date">Fecha del movimiento</label>
          <input class="form__input" type="date" id="ev-mf-date" value="${escapeHtml(today)}" max="${escapeHtml(today)}" />
        </div>
        <div class="form__group">
          <label class="form__label" for="ev-mf-method">Método</label>
          <select class="form__input" id="ev-mf-method">
            ${Object.entries(METHOD_LABEL).map(([k, v]) => `<option value="${escapeHtml(k)}">${v}</option>`).join('')}
          </select>
        </div>
        <div class="form__group">
          <label class="form__label" for="ev-mf-ref">Referencia o comprobante</label>
          <input class="form__input" id="ev-mf-ref" placeholder="Ej. TRF-102938" />
        </div>
        ${isRefund
          ? '<div class="form__group form__group--full"><label class="form__label" for="ev-mf-reason">Motivo</label><textarea class="form__input" id="ev-mf-reason" rows="2" placeholder="Ej. Aporte del fondo después de pagar todo"></textarea></div>'
          : '<label class="ev-check form__group--full"><input type="checkbox" id="ev-mf-credit" /><span>El pago supera el saldo y genera <b>saldo a favor</b></span></label>'}
      </form>
      <div class="ev-modal__foot">
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="button" class="btn btn--primary" id="ev-mf-save">${evIcon(isRefund ? 'undo' : 'receipt')}${isRefund ? 'Registrar reembolso' : 'Registrar pago'}</button>
      </div>
    </div>`;
  portal(overlay);
  wireStyledSelects(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const current = () => accounts.find(({ a }) => L.sameId(a.id, $('#ev-mf-account').value)) || chosen;
  const readAmount = () => Number(($('#ev-mf-amount').value || '').replace(/\D/g, '')) || 0;
  const hint = () => {
    const { c } = current();
    $('#ev-mf-hint').textContent = isRefund ? `Máximo ${money(-c.saldo)}` : c.saldo > 0 ? `Saldo pendiente: ${money(c.saldo)}` : 'La cuenta no tiene saldo pendiente.';
  };
  $('#ev-mf-amount').addEventListener('input', (e) => {
    const n = Number(e.target.value.replace(/\D/g, '')) || 0;
    e.target.value = n ? n.toLocaleString('es-CO') : '';
  });
  $('#ev-mf-account').addEventListener('change', hint);
  hint();
  const close = () => { overlay.classList.remove('is-open'); setTimeout(() => overlay.remove(), 360); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-close]')) close(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  $('#ev-mf-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const { a, c } = current();
    const amount = readAmount();
    const date = $('#ev-mf-date').value;
    const method = $('#ev-mf-method').value;
    const reference = $('#ev-mf-ref').value.trim();
    const reason = isRefund ? $('#ev-mf-reason').value.trim() : null;
    const allowCredit = !isRefund && $('#ev-mf-credit').checked;
    const fail = (el, msg) => { shakeError(el); showToast(msg, 'error'); };
    if (!amount) return fail($('#ev-mf-amount').closest('.ev-amount__box'), 'Escribe el valor.');
    const dateProblem = L.moneyDateProblem(date, { today, event: data.event });
    if (dateProblem) return fail($('#ev-mf-date'), dateProblem);
    if (!reference) return fail($('#ev-mf-ref'), 'Escribe la referencia o el número del comprobante.');
    if (isRefund && amount > -c.saldo) return fail($('#ev-mf-amount').closest('.ev-amount__box'), `El reembolso no puede pasar de ${money(-c.saldo)}.`);
    if (isRefund && !reason) return fail($('#ev-mf-reason'), 'Escribe el motivo del reembolso.');
    if (!isRefund && amount > Math.max(0, c.saldo) && !allowCredit) return fail($('#ev-mf-credit').closest('.ev-check'), 'El pago supera el saldo: márcalo como «genera saldo a favor» si es correcto.');
    const ok = await confirmDialog({
      title: isRefund ? 'Confirmar reembolso' : 'Confirmar pago',
      message: `<p>${isRefund ? 'Reembolso' : 'Pago'} de <strong>${money(amount)}</strong> ${isRefund ? 'a' : 'de'} <strong>${escapeHtml(a.displayName)}</strong> por ${escapeHtml(METHOD_LABEL[method])}, el ${escapeHtml(fmtDay(date, { year: true }))} (ref. ${escapeHtml(reference)}).</p><p class="cst-modal__note">Queda en el libro del evento. Si hay un error, se corrige con otro movimiento.</p>`,
      confirmLabel: isRefund ? 'Registrar reembolso' : 'Registrar pago',
      cancelLabel: 'Revisar',
    });
    if (!ok) return;
    setLoading(btn, true);
    try {
      if (isRefund) await eventService.refund(a.id, { amount, method, reference, reason, date });
      else await eventService.registerPayment(a.id, { amount, date, method, reference, allowCredit });
      showToast(isRefund ? `Reembolso de ${money(amount)} registrado.` : `Pago de ${money(amount)} registrado para ${a.displayName}.`, 'success');
      close();
      onDone?.();
    } catch (error) {
      showToast(error.message || 'No se pudo registrar.', 'error');
      setLoading(btn, false);
    }
  });

  void overlay.offsetWidth;
  overlay.classList.add('is-open');
  setTimeout(() => $('#ev-mf-amount').focus(), 120);
}

/** Cancelar a una persona: primero la cotización (regla 14), luego la confirmación. */
async function cancelGuestFlow(guest, data, button, onDone) {
  let quote;
  setLoading(button, true);
  try {
    quote = await eventService.quoteCancellation(guest.id);
  } catch (error) {
    showToast(error.message || 'No se pudo cotizar la cancelación.', 'error');
    return;
  } finally {
    setLoading(button, false);
  }
  const name = (id) => (data.accounts.find((a) => L.sameId(a.id, id)) || {}).displayName || 'Cuenta';
  const ok = await confirmDialog({
    title: `Cancelar el viaje de ${L.guestName(guest)}`,
    message: `
      <p>Faltan <strong>${plural(quote.days, 'día')}</strong> para el viaje: aplica el tramo del <strong>${quote.pct} %</strong>.</p>
      <ul class="ev-quote">
        ${quote.returned > 0 ? `<li><span>Aportes que vuelven al anfitrión</span><b>${money(quote.returned)}</b></li>` : ''}
        ${quote.perAccount.map((x) => `<li><span>${escapeHtml(name(x.accountId))}${x.isHost ? ' (anfitrión)' : ''}: se cancela ${money(-x.cancelacion)}</span><b>${x.penalidad ? `penalidad ${money(x.penalidad)}` : 'sin penalidad'}</b></li>`).join('')}
      </ul>
      <label class="form__label" for="ev-cancel-reason">Motivo (obligatorio)</label>
      <textarea class="form__input" id="ev-cancel-reason" rows="2" placeholder="Ej. Enfermedad; avisó el acudiente por WhatsApp"></textarea>`,
    confirmLabel: 'Cancelar su viaje',
    cancelLabel: 'Volver',
    danger: true,
  });
  if (!ok) return;
  const reason = (document.getElementById('ev-cancel-reason')?.value || '').trim();
  if (!reason) { showToast('Escribe el motivo de la cancelación.', 'error'); shakeError(button); return; }
  setLoading(button, true);
  try {
    const done = await eventService.cancelGuest(guest.id, { reason });
    showToast(`Viaje de ${L.guestName(guest)} cancelado${done.penaltyTotal ? ` con penalidad de ${money(done.penaltyTotal)}` : ' sin penalidad'}.`, 'success');
    onDone?.();
  } catch (error) {
    showToast(error.message || 'No se pudo cancelar.', 'error');
    setLoading(button, false);
  }
}

/** Acciones de CS Travel Group dentro de la ficha de una cuenta. */
function adminDrawerExtra(data, onDone) {
  return {
    extraHtml: (account, c) => {
      const guests = data.guests.filter((g) => L.sameId(g.accountId, account.id));
      const usesDocs = guests.some((g) => g.docsOk === true || g.docsOk === false);
      return `
        <section class="ev-drawer__section ev-admin">
          <h3>Solo CS Travel Group</h3>
          <div class="ev-admin__actions">
            ${c && c.status !== 'sin_cargos' ? `<button type="button" class="btn btn--ghost btn--sm" data-adm="pay">${evIcon('receipt')}Registrar pago</button>` : ''}
            ${c && c.saldo < 0 ? `<button type="button" class="btn btn--ghost btn--sm" data-adm="refund">${evIcon('undo')}Registrar reembolso</button>` : ''}
            ${account.kind !== 'anfitrion' ? `<button type="button" class="btn btn--ghost btn--sm" data-adm="regen">${evIcon('refresh')}Nuevo enlace personal</button>` : ''}
          </div>
          ${guests.length ? `
            <ul class="ev-admin__people">
              ${guests.map((g) => `
                <li class="${g.status === 'cancelado' ? 'is-cancelled' : ''}">
                  <span class="ev-people__avatar">${escapeHtml(initials(L.guestName(g)))}</span>
                  <span class="ev-admin__who"><strong>${escapeHtml(L.guestName(g))}</strong><small>${escapeHtml(AUDIENCE_LABELS[g.audience] || g.audience)}${g.status === 'cancelado' ? ` · canceló ${escapeHtml(relTime(g.cancelledAt))}` : ''}</small></span>
                  ${usesDocs && g.status !== 'cancelado' ? `<button type="button" class="btn btn--ghost btn--sm ev-docbtn ${g.docsOk ? 'is-ok' : ''}" data-adm="docs" data-guest="${escapeHtml(g.id)}" aria-pressed="${Boolean(g.docsOk)}">${evIcon(g.docsOk ? 'checkCircle' : 'file')}${g.docsOk ? 'Docs completos' : 'Faltan docs'}</button>` : '<span></span>'}
                  ${g.status !== 'cancelado' && g.attendance === 'si' ? `<button type="button" class="btn btn--danger btn--sm" data-adm="cancel" data-guest="${escapeHtml(g.id)}">${evIcon('ban')}Cancelar</button>` : '<span></span>'}
                </li>`).join('')}
            </ul>` : ''}
          <label class="form__label" for="ev-admin-notes">Notas internas de CS Travel Group</label>
          <textarea class="form__input ev-notes" id="ev-admin-notes" rows="3" maxlength="2000" placeholder="No las ve el organizador ni el invitado.">${escapeHtml(account.adminNotes || '')}</textarea>
          <div class="ev-drawer__row-end"><button type="button" class="btn btn--ghost btn--sm" data-adm="notes">Guardar nota interna</button></div>
        </section>`;
    },
    bindExtra: (root, account) => {
      root.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-adm]');
        if (!btn) return;
        const act = btn.dataset.adm;
        const guest = btn.dataset.guest ? data.guests.find((g) => L.sameId(g.id, btn.dataset.guest)) : null;
        if (act === 'pay' || act === 'refund') {
          closeDrawer();
          openMoneyForm({ kind: act === 'pay' ? 'pago' : 'reembolso', data, accountId: account.id, onDone: () => { setHashQuery({ cuenta: account.id }); onDone?.(); } });
        } else if (act === 'cancel' && guest) {
          await cancelGuestFlow(guest, data, btn, onDone);
        } else if (act === 'docs' && guest) {
          setLoading(btn, true);
          try {
            await eventService.setDocsOk(guest.id, !guest.docsOk);
            showToast(`Documentos de ${L.guestName(guest)}: ${guest.docsOk ? 'faltan' : 'completos'}.`, 'success');
            onDone?.();
          } catch (error) {
            showToast(error.message || 'No se pudo guardar.', 'error');
            setLoading(btn, false);
          }
        } else if (act === 'regen') {
          const ok = await confirmDialog({
            title: 'Nuevo enlace personal',
            message: `<p>El enlace actual de <strong>${escapeHtml(account.displayName)}</strong> dejará de funcionar. Habrá que enviarle el nuevo.</p>`,
            confirmLabel: 'Generar enlace nuevo',
            danger: true,
          });
          if (!ok) return;
          setLoading(btn, true);
          try {
            await eventService.regenerateAccessCode(account.id);
            showToast('Enlace nuevo generado. Envíaselo desde su ficha.', 'success');
            onDone?.();
          } catch (error) {
            showToast(error.message || 'No se pudo generar.', 'error');
            setLoading(btn, false);
          }
        } else if (act === 'notes') {
          setLoading(btn, true);
          try {
            const value = root.querySelector('#ev-admin-notes').value;
            await eventService.updateAdminNotes(account.id, value);
            account.adminNotes = value;
            showToast('Nota interna guardada.', 'success');
          } catch (error) {
            showToast(error.message || 'No se pudo guardar.', 'error');
          } finally {
            setLoading(btn, false);
          }
        }
      });
    },
  };
}

/* ---------------------------------------------------------------------------
 * Dinero: libro completo
 * ------------------------------------------------------------------------ */

const LEDGER_FILTERS = [
  { key: 'todos', label: 'Todo', kinds: null },
  { key: 'caja', label: 'Pagos y reembolsos', kinds: L.CAJA },
  { key: 'cargos', label: 'Cargos', kinds: ['cargo', 'descuento'] },
  { key: 'coberturas', label: 'Coberturas y aportes', kinds: L.COBERTURA },
  { key: 'cancelaciones', label: 'Cancelaciones', kinds: ['cancelacion', 'penalidad'] },
];

const ledgerState = { f: 'todos', account: '', limit: 40 };

function ledgerRowsHtml(data) {
  const byId = new Map(data.accounts.map((a) => [String(a.id), a]));
  const corrected = new Set(data.lines.filter((l) => l.correctsId != null).map((l) => String(l.correctsId)));
  const kinds = LEDGER_FILTERS.find((f) => f.key === ledgerState.f)?.kinds;
  const list = data.lines
    .filter((l) => (!kinds || kinds.includes(l.kind)) && (!ledgerState.account || L.sameId(l.accountId, ledgerState.account)))
    .sort((a, b) => (a.date === b.date ? Number(b.id) - Number(a.id) : a.date < b.date ? 1 : -1));
  if (!list.length) return { html: emptyHtml('Sin movimientos con esos filtros'), total: 0, shown: 0 };
  const shown = list.slice(0, ledgerState.limit);
  return {
    total: list.length,
    shown: shown.length,
    html: `
      <div class="table-wrapper">
        <table class="data-table ev-table ev-ledger">
          <thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Descripción</th><th class="ev-num">Valor</th><th class="ev-actcol"><span class="sr-only">Acción</span></th></tr></thead>
          <tbody>
            ${shown.map((l) => {
              const isCorr = l.correctsId != null;
              const wasCorr = corrected.has(String(l.id));
              const cash = L.CAJA.includes(l.kind);
              return `
                <tr class="${isCorr || wasCorr ? 'is-muted' : ''}">
                  <td class="ev-nowrap">${escapeHtml(fmtDay(l.date, { year: true }))}</td>
                  <td><div class="ev-who"><span>${escapeHtml((byId.get(String(l.accountId)) || {}).displayName || '—')}</span></div></td>
                  <td><span class="ev-kind ev-kind--${escapeHtml(l.kind)}">${escapeHtml(KIND_LABEL[l.kind] || l.kind)}</span></td>
                  <td class="ev-desc">${escapeHtml(l.description || '')}${l.reference ? `<small> · ${escapeHtml(l.reference)}</small>` : ''}${isCorr ? `<small class="ev-corr">Corrige el movimiento #${escapeHtml(l.correctsId)}${l.reason ? ` · ${escapeHtml(l.reason)}` : ''}</small>` : ''}${wasCorr ? '<small class="ev-corr">Corregido</small>' : ''}</td>
                  <td class="ev-num ${cash ? 'is-cash' : ''}">${cash ? (l.amount < 0 ? `+ ${money(-l.amount)}` : `− ${money(l.amount)}`) : (l.amount >= 0 ? money(l.amount) : `− ${money(-l.amount)}`)}</td>
                  <td class="ev-actcol"><div class="row-actions">${!isCorr && !wasCorr ? `<button type="button" class="btn btn--ghost btn--sm" data-correct="${escapeHtml(l.id)}">${evIcon('edit')}Corregir</button>` : '<span class="row-actions__slot"></span>'}</div></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${list.length > shown.length ? `<div class="ev-more"><button type="button" class="btn btn--ghost btn--sm" id="ev-ledger-more">Mostrar ${Math.min(40, list.length - shown.length)} más</button></div>` : ''}`,
  };
}

function moneyTabHtml(data) {
  const link = adminLink(data.event.id);
  const favors = data.summary.alerts.saldosAFavor;
  const accountsWithLines = data.accounts.filter((a) => data.lines.some((l) => L.sameId(l.accountId, a.id)))
    .sort((a, b) => (a.kind === 'anfitrion' ? -1 : 0) - (b.kind === 'anfitrion' ? -1 : 0) || a.displayName.localeCompare(b.displayName, 'es'));
  return `
    ${moneyKpisHtml(data)}
    <section class="ev-grid ev-grid--main">
      ${whoPaysHtml(data)}
      <article class="panel ev-favors">
        <div class="panel__header"><h2 class="panel__title">Saldos a favor por reembolsar</h2><span class="muted ev-small">${money(data.summary.totals.saldosAFavor)}</span></div>
        ${favors.length ? `
          <ul class="ev-acclist ev-rows">
            ${favors.map((f) => `
              <li><div class="ev-acclist__row">
                <span class="ev-acclist__name"><strong>${escapeHtml(f.displayName)}</strong><small>A favor ${money(f.aFavor)}</small></span>
                <span></span>
                <button type="button" class="btn btn--sm ev-act-soft" data-refund="${escapeHtml(f.accountId)}">${evIcon('undo')}Reembolsar</button>
              </div></li>`).join('')}
          </ul>` : emptyHtml('Nada por reembolsar', 'Cuando una cuenta pague de más o reciba un aporte después de pagar todo, aparece aquí.')}
      </article>
    </section>
    ${planHtml(data, link)}
    <section class="ev-grid ev-grid--2 ev-grid--ledger">
      ${monthChartHtml(data)}
      <article class="panel ev-f03">
        <div class="panel__header"><h2 class="panel__title">Servicio CS Travel Group (F-03)</h2></div>
        <p class="ev-f03__big">${money(data.summary.serviceEstimate || 0)}</p>
        <p class="muted ev-small">Servicio estimado del evento: precio de cada paquete menos el costo de terceros, de las personas activas. El recaudo es un pasivo a favor de terceros; solo el servicio es ingreso. Las penalidades se exportan aparte.</p>
        <button type="button" class="btn btn--ghost btn--sm" id="ev-f03-csv">${evIcon('download')}Exportar libro con reparto F-03</button>
      </article>
    </section>
    <section class="panel ev-ledger-panel">
      <div class="panel__header">
        <h2 class="panel__title">Libro del evento</h2>
        <div class="ev-ledger__actions">
          <button type="button" class="btn btn--primary btn--sm" id="ev-register-pay">${evIcon('receipt')}Registrar pago</button>
        </div>
      </div>
      <div class="ev-toolbar">
        <select class="form__input ev-group-select" id="ev-ledger-account" aria-label="Cuenta">
          <option value="">Todas las cuentas</option>
          ${accountsWithLines.map((a) => `<option value="${escapeHtml(a.id)}" ${L.sameId(a.id, ledgerState.account) ? 'selected' : ''}>${escapeHtml(a.displayName)}</option>`).join('')}
        </select>
        <div class="ev-chipbar ev-chipbar--inline" role="group" aria-label="Tipo de movimiento">
          ${LEDGER_FILTERS.map((f) => `<button type="button" class="ev-chipbtn ev-chipbtn--plain ${ledgerState.f === f.key ? 'is-active' : ''}" data-lf="${escapeHtml(f.key)}">${escapeHtml(f.label)}</button>`).join('')}
        </div>
        <span class="ev-toolbar__count" id="ev-ledger-count"></span>
      </div>
      <div id="ev-ledger-body"></div>
      <div class="modal-overlay modal-overlay--doctor" id="ev-month-modal">
        <div class="modal modal--period" role="dialog" aria-modal="true" aria-labelledby="ev-month-title">
          <div class="modal__header">
            <div><h2 class="modal__title" id="ev-month-title">Mes</h2><p class="modal__subtitle">Pagos que entraron en el mes</p></div>
            <button type="button" class="modal__close ev-modal__close" data-close-month aria-label="Cerrar">${evIcon('x')}</button>
          </div>
          <div id="ev-month-body"></div>
        </div>
      </div>
    </section>`;
}

function bindMoneyTab(root, data) {
  const body = root.querySelector('#ev-ledger-body');
  const count = root.querySelector('#ev-ledger-count');
  const paint = () => {
    const { html, total, shown } = ledgerRowsHtml(data);
    body.innerHTML = html;
    count.textContent = total ? `${shown} de ${plural(total, 'movimiento')}` : '';
    body.querySelector('#ev-ledger-more')?.addEventListener('click', () => { ledgerState.limit += 40; paint(); });
  };
  root.querySelector('#ev-ledger-account')?.addEventListener('change', (e) => { ledgerState.account = e.target.value; ledgerState.limit = 40; paint(); });
  root.querySelectorAll('[data-lf]').forEach((b) => b.addEventListener('click', () => {
    ledgerState.f = b.dataset.lf;
    ledgerState.limit = 40;
    root.querySelectorAll('[data-lf]').forEach((x) => x.classList.toggle('is-active', x === b));
    paint();
  }));
  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-correct]');
    if (!btn) return;
    const line = data.lines.find((l) => L.sameId(l.id, btn.dataset.correct));
    const ok = await confirmDialog({
      title: 'Corregir movimiento',
      message: `
        <p>Se agrega una línea contraria a «${escapeHtml(line.description)}» (${money(Math.abs(line.amount))}). El movimiento original no se borra: queda la historia completa.</p>
        <label class="form__label" for="ev-corr-reason">Motivo (obligatorio)</label>
        <textarea class="form__input" id="ev-corr-reason" rows="2" placeholder="Ej. Se registró dos veces"></textarea>`,
      confirmLabel: 'Corregir',
      cancelLabel: 'Volver',
      danger: true,
    });
    if (!ok) return;
    const reason = (document.getElementById('ev-corr-reason')?.value || '').trim();
    if (!reason) { showToast('Escribe el motivo de la corrección.', 'error'); return; }
    setLoading(btn, true);
    try {
      await eventService.correctLine(line.id, { reason });
      showToast('Movimiento corregido.', 'success');
      rerender();
    } catch (error) {
      showToast(error.message || 'No se pudo corregir.', 'error');
      setLoading(btn, false);
    }
  });
  root.querySelector('#ev-register-pay')?.addEventListener('click', () => openMoneyForm({ kind: 'pago', data, accountId: ledgerState.account || null, onDone: rerender }));
  root.querySelectorAll('[data-refund]').forEach((b) => b.addEventListener('click', () => openMoneyForm({ kind: 'reembolso', data, accountId: b.dataset.refund, onDone: rerender })));
  root.querySelector('#ev-f03-csv')?.addEventListener('click', () => {
    const rows = L.f03Rows({ lines: data.lines, accounts: data.accounts, guests: data.guests });
    const name = (id) => (data.accounts.find((a) => L.sameId(a.id, id)) || {}).displayName || '';
    exportCsv(`libro-f03-${data.event.slug || data.event.id}`, [
      ['Fecha', (l) => l.date],
      ['Cuenta', (l) => name(l.accountId)],
      ['Tipo', (l) => KIND_LABEL[l.kind] || l.kind],
      ['Descripción', (l) => l.description],
      ['Valor', (l) => l.amount],
      ['Método', (l) => l.method || ''],
      ['Referencia', (l) => l.reference || ''],
      ['Parte terceros', (l) => l.thirdPartyPart ?? ''],
      ['Parte servicio', (l) => l.servicePart ?? ''],
      ['Penalidad', (l) => (l.isPenalty ? 'sí' : '')],
      ['Corrige', (l) => l.correctsId ?? ''],
      ['Motivo', (l) => l.reason || ''],
    ], rows);
  });
  bindMoneyCommon(root, data);
  paint();
}

/* ---------------------------------------------------------------------------
 * Vista
 * ------------------------------------------------------------------------ */

function paneHtml(tab, data, asOrg) {
  if (tab === 'personas') return renderPeoplePanel(data, { query: ctxCache.query });
  if (tab === 'dinero') return moneyTabHtml(data);
  return summaryHtml(asOrg ? asOrg.data : data, asOrg);
}

function bindPane(tab, root, data, asOrg) {
  const pane = root.querySelector('#ev-tabpane');
  const onDone = rerender;
  if (tab === 'personas') {
    bindPeoplePanel(pane, data, {
      query: ctxCache.query,
      onChange: onDone,
      onContribute: (target, btn) => openContributionModal(data, target, { onDone }),
      drawerExtra: adminDrawerExtra(data, onDone),
    });
  } else if (tab === 'dinero') {
    bindMoneyTab(pane, data);
  } else {
    bindOverview(pane, asOrg ? asOrg.data : data, { onChange: onDone, onContribute: (target) => openContributionModal(data, target, { onDone }) });
    pane.querySelector('#ev-as-admin')?.addEventListener('click', () => { ctxCache.asOrg = null; switchTab('resumen', { force: true }); });
  }
  runCountUp(pane, `admin-event-${data.event.id}-${tab}`);
}

function switchTab(tab, { force = false } = {}) {
  const root = document.querySelector('.evp');
  if (!root) return;
  const pane = root.querySelector('#ev-tabpane');
  if (!force && pane.dataset.tab === tab) return;
  const order = TABS.map((t) => t.key);
  const dir = order.indexOf(tab) - order.indexOf(pane.dataset.tab);
  pane.dataset.tab = tab;
  ctxCache.query = { tab };
  pane.innerHTML = paneHtml(tab, ctxCache.data, ctxCache.asOrg);
  pane.classList.remove('ev-slide-right', 'ev-slide-left');
  void pane.offsetWidth;
  pane.classList.add(dir < 0 ? 'ev-slide-left' : 'ev-slide-right');
  root.querySelectorAll('.ev-tabs__tab').forEach((b) => { b.classList.toggle('is-active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  movePill(root);
  setHashQuery({ tab: tab === 'resumen' ? null : tab, f: null, v: null, g: null, cuenta: null });
  wireStyledSelects(pane);
  bindPane(tab, root, ctxCache.data, ctxCache.asOrg);
}

/** La píldora azul de las pestañas se desliza a la pestaña activa. */
function movePill(root, { instant = false } = {}) {
  const bar = root.querySelector('.ev-tabs');
  const active = bar?.querySelector('.ev-tabs__tab.is-active');
  const pill = bar?.querySelector('.ev-tabs__pill');
  if (!active || !pill) return;
  if (instant) pill.style.transition = 'none';
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  if (instant) { void pill.offsetWidth; pill.style.transition = ''; }
}

export const AdminEventDetailView = {
  async render(ctx) {
    const user = ctx.user || authService.getSession();
    const data = await eventService.getEventView(ctx.params.id, { actor: user });
    const tab = TABS.some((t) => t.key === ctx.query.tab) ? ctx.query.tab : 'resumen';
    ctxCache = { data, query: ctx.query, asOrg: null };
    const { event } = data;
    const vocab = vocabFor(event.type);
    const organizer = (event.organizers || [])[0];
    return `
      <div class="evp">
        <div class="page-header ev-head">
          <div class="ev-head__text">
            <a class="ev-back" href="#/admin/events">${evIcon('arrowLeft')}Eventos</a>
            <h1 class="page-title">${escapeHtml(event.title)}</h1>
            <p class="ev-head__event ev-head__event--sm">${escapeHtml(event.hostDisplayName || '')} · ${plural(data.summary.invitations.total, vocab.cuenta.toLowerCase(), vocab.cuentas.toLowerCase())}${event.originCode ? ` · origen ${escapeHtml(event.originCode)}` : ''}</p>
            <p class="page-subtitle ev-chips">${eventChips(event)}</p>
          </div>
          <div class="page-header__actions ev-head__actions">
            ${organizer ? `<button type="button" class="btn btn--ghost" id="ev-as-org">${evIcon('eye')}Ver como organizador</button>` : ''}
            <button type="button" class="btn btn--ghost" id="ev-people-csv">${evIcon('download')}Exportar personas</button>
          </div>
        </div>
        <div class="ev-tabs" role="tablist" aria-label="Secciones del evento">
          <span class="ev-tabs__pill" aria-hidden="true"></span>
          ${TABS.map((t) => `<button type="button" role="tab" class="ev-tabs__tab ${t.key === tab ? 'is-active' : ''}" aria-selected="${t.key === tab}" data-tab="${escapeHtml(t.key)}">${evIcon(t.icon)}${escapeHtml(t.label)}</button>`).join('')}
        </div>
        <div id="ev-tabpane" data-tab="${escapeHtml(tab)}">${paneHtml(tab, data, null)}</div>
      </div>`;
  },

  async afterRender() {
    const root = document.querySelector('.evp');
    const { data } = ctxCache;
    movePill(root, { instant: true });
    // Las fuentes llegan después del primer pintado: se vuelve a medir la píldora.
    document.fonts?.ready?.then(() => movePill(root, { instant: true }));
    const onResize = () => { if (!root.isConnected) { window.removeEventListener('resize', onResize); return; } movePill(root, { instant: true }); };
    window.addEventListener('resize', onResize);
    root.querySelectorAll('.ev-tabs__tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    bindPane(root.querySelector('#ev-tabpane').dataset.tab, root, data, null);
    root.querySelector('#ev-people-csv')?.addEventListener('click', () => {
      const rows = data.accounts.filter((a) => a.kind !== 'anfitrion');
      exportPeopleCsv(data, rows.map((a) => {
        const guests = data.guests.filter((g) => L.sameId(g.accountId, a.id));
        const going = guests.filter((g) => g.status !== 'cancelado' && g.attendance === 'si');
        const aud = {};
        going.forEach((g) => { aud[g.audience] = (aud[g.audience] || 0) + 1; });
        return { a, c: data.summary.byId.get(String(a.id)), yes: going.length, audiences: aud, docs: '' };
      }));
    });
    root.querySelector('#ev-as-org')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const entry = (data.event.organizers || []).find((o) => o.permission === 'titular') || data.event.organizers[0];
      setLoading(btn, true);
      try {
        const u = await apiService.getById('users', entry.userId);
        const orgData = await eventService.getEventView(data.event.id, { actor: { id: u.id, role: 'event', name: u.name } });
        ctxCache.asOrg = { name: u.name, data: orgData };
        switchTab('resumen', { force: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        showToast(error.message || 'No se pudo cargar la vista del organizador.', 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  },
};

registerTours({
  '#/admin/events/:id': {
    version: 1,
    title: 'Detalle del evento',
    intro: {
      que: 'Un evento completo visto por CS Travel Group: resumen, personas y el libro de dinero.',
      para: 'Registrar pagos verificados, reembolsos y cancelaciones, y ver exactamente lo que ve el organizador.',
      como: 'Usa las pestañas. En Personas toca una fila para abrir la ficha con las acciones de CS Travel Group; en Dinero está el libro completo.',
    },
    steps: [
      { sel: '.ev-head', title: 'El evento', text: 'Plantilla, fechas, destino, estado y cuántos días faltan.' },
      { sel: '#ev-as-org', title: 'Ver como organizador', text: 'Muestra el resumen con los permisos y la privacidad del organizador: en una boda, sin montos de los invitados.' },
      { sel: '.ev-tabs', title: 'Pestañas', text: 'Resumen, Personas y Dinero. Cada una queda en la dirección para compartirla.' },
      { sel: '#ev-tabpane', title: 'Contenido', text: 'En Resumen verás las alertas y el servicio estimado; en Personas, la ficha con «Registrar pago» y «Cancelar»; en Dinero, el libro con «Corregir».' },
    ],
  },
});
