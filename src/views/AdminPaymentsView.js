/**
 * AdminPaymentsView.js
 * =============================================================================
 * PROPOSITO:
 *   Cobros y links de pago del administrador, DENTRO del portal (con su menu
 *   lateral, sus paneles y sus componentes), en vez de una pagina suelta.
 *
 *   El admin crea un cobro (concepto, valor, a nombre de quien, su numero
 *   interno de factura u orden) y obtiene un CODIGO CORTO y un enlace para
 *   enviarle al cliente, que paga sin cuenta en /pago. Desde la tabla ve el
 *   estado, copia el enlace, anula o confirma una transferencia recibida.
 *
 * DATOS:
 *   Habla con /api/pagos/cobros (solo admin, valida la sesion en el servidor).
 *   En el demo de GitHub Pages ese endpoint no existe: se muestra un aviso.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { isDeployedBundle } from '../utils/env.js';
import { showToast } from '../utils/toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';

const STATUS = {
  created: { label: 'Pendiente', badge: 'badge--blue' },
  processing: { label: 'En pasarela', badge: 'badge--amber' },
  paid: { label: 'Pagado', badge: 'badge--green' },
  cancelled: { label: 'Anulado', badge: 'badge--gray' },
  failed: { label: 'Rechazado', badge: 'badge--red' },
  refunded: { label: 'Reversado', badge: 'badge--violet' },
};

let cached = [];

async function api(action, extra = {}) {
  const res = await fetch('/api/pagos/cobros', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const payLink = (code) => `${window.location.origin}/pago?codigo=${encodeURIComponent(code)}`;

function isExpired(o) {
  return o.expiresAt ? new Date(o.expiresAt).getTime() < Date.now() : false;
}

function invoiceCell(o) {
  if (!o.requiresInvoice) return '<span class="muted">No aplica</span>';
  if (o.invoiceNumber) return `<span class="badge badge--green">${escapeHtml(o.invoiceNumber)}</span>`;
  if (o.billingJson) return '<span class="badge badge--teal">Datos listos</span>';
  return '<span class="badge badge--amber">Pendiente</span>';
}

function renderRows(items) {
  if (!items.length) {
    return `<tr><td colspan="7" class="empty-state">Todavía no hay cobros. Crea el primero con «+ Nuevo cobro».</td></tr>`;
  }
  return items.map((o) => {
    const st = STATUS[o.status] || { label: o.status, badge: 'badge--gray' };
    const expired = o.status !== 'paid' && isExpired(o);
    const closed = ['paid', 'cancelled', 'refunded'].includes(o.status);
    const actions = closed
      ? '<span class="muted">—</span>'
      : `<div class="pay-actions">
           <button type="button" class="btn btn--ghost btn--sm" data-copy="${escapeHtml(o.publicCode)}">Copiar enlace</button>
           <button type="button" class="btn btn--ghost btn--sm" data-paid="${escapeHtml(o.orderId)}">Marcar pagado</button>
           <button type="button" class="btn btn--ghost btn--sm text-red" data-cancel="${escapeHtml(o.orderId)}">Anular</button>
         </div>`;
    return `
      <tr>
        <td>
          <span class="code-chip">${escapeHtml(o.publicCode || '—')}</span>
          ${o.referenceCode ? `<div class="muted" style="margin-top:4px;">${escapeHtml(o.referenceCode)}</div>` : ''}
        </td>
        <td>
          <strong>${escapeHtml(o.concept || '')}</strong>
          <div class="muted">${escapeHtml(o.payerName || 'Sin nombre')}</div>
        </td>
        <td><strong>${formatCurrency(o.amount)}</strong></td>
        <td>
          <span class="badge ${expired ? 'badge--gray' : st.badge}">${expired ? 'Vencido' : st.label}</span>
        </td>
        <td>${invoiceCell(o)}</td>
        <td>
          ${formatDate(o.createdAt)}
          <div class="muted">vence ${formatDate(o.expiresAt)}</div>
        </td>
        <td class="col-center">${actions}</td>
      </tr>`;
  }).join('');
}

function kpis(items) {
  const open = items.filter((o) => ['created', 'processing'].includes(o.status) && !isExpired(o));
  const paid = items.filter((o) => o.status === 'paid');
  const toInvoice = items.filter((o) => o.status === 'paid' && o.requiresInvoice && !o.invoiceNumber);
  const sum = (list) => list.reduce((acc, o) => acc + Number(o.amount || 0), 0);
  return { open, paid, toInvoice, openTotal: sum(open), paidTotal: sum(paid) };
}

export const AdminPaymentsView = {
  async render() {
    const deployed = isDeployedBundle();
    let loadError = '';
    cached = [];
    if (deployed) {
      try {
        cached = (await api('list')).items || [];
      } catch (e) {
        loadError = e.message;
      }
    }
    const k = kpis(cached);

    return `
      <style>
        .code-chip {
          display: inline-block;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-weight: 800;
          letter-spacing: 0.04em;
          background: #eef2fb;
          color: #0a2d66;
          border: 1px solid #d8e0f2;
          border-radius: 7px;
          padding: 3px 9px;
        }
        .pay-actions { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
        .pay-actions .btn--sm { white-space: nowrap; }
        .pay-link-box { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: #eef7f1; color: #1a7f4b; font-size: .88rem; }
        .pay-link-box code { background: #fff; border: 1px solid #cfe9da; border-radius: 8px; padding: 4px 8px; color: #0a2540; word-break: break-all; }
      </style>

      <div class="qb-page-hero">
        <div>
          <h1 class="page-title">Cobros y links de pago</h1>
          <p class="page-subtitle">Crea cobros para clientes sin cuenta en el portal. Pagan en <strong>/pago</strong> con un código corto.</p>
        </div>
        <div class="qb-hero-kpis">
          <div class="qb-hero-kpi"><strong>${k.open.length}</strong><span>Pendientes</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${formatCurrency(k.openTotal)}</strong><span>Por cobrar</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${formatCurrency(k.paidTotal)}</strong><span>Cobrado</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep ${k.toInvoice.length ? 'qb-hero-kpi--alert' : ''}"><strong>${k.toInvoice.length}</strong><span>Por facturar</span></div>
        </div>
      </div>

      ${!deployed ? `
        <section class="panel">
          <p class="empty-state">Los cobros funcionan en el portal real (cstravelgroup.com). En este demo no hay pasarela conectada.</p>
        </section>` : ''}

      ${deployed ? `
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Nuevo cobro</h2>
          <button type="button" class="btn btn--primary" id="toggle-create">+ Nuevo cobro</button>
        </div>
        <form id="charge-form" class="form form--grid" novalidate hidden>
          <div class="form__group form__group--full">
            <label class="form__label">Concepto *</label>
            <input name="concept" class="form__input" placeholder="Ej: Saldo paquete Cartagena · 2 personas" maxlength="120" />
          </div>
          <div class="form__group">
            <label class="form__label">Valor (COP) *</label>
            <input name="amount" type="number" min="1000" step="1000" class="form__input" placeholder="1500000" />
          </div>
          <div class="form__group">
            <label class="form__label">Tu número interno</label>
            <input name="referenceCode" class="form__input" placeholder="FAC-0125 / OC-88" maxlength="60" />
            <small class="form__hint">Factura, orden de compra o requisición.</small>
          </div>
          <div class="form__group">
            <label class="form__label">Vence en (días)</label>
            <input name="expiresDays" type="number" min="1" max="180" value="30" class="form__input" />
          </div>
          <div class="form__group">
            <label class="form__label">A nombre de</label>
            <input name="payerName" class="form__input" placeholder="Cliente o empresa" maxlength="120" />
          </div>
          <div class="form__group">
            <label class="form__label">Correo del pagador</label>
            <input name="payerEmail" type="email" class="form__input" placeholder="cliente@correo.com" maxlength="120" />
          </div>
          <div class="form__group">
            <label class="form__label">Nota interna</label>
            <input name="notes" class="form__input" placeholder="Solo la ves tú" maxlength="400" />
          </div>
          <div class="form__group form__group--full">
            <label class="checkbox">
              <input type="checkbox" name="requiresInvoice" />
              <span>Requiere factura electrónica · le pediremos sus datos fiscales al pagar</span>
            </label>
          </div>
          <div class="form__actions form__group--full">
            <button type="button" class="btn btn--ghost" id="cancel-create">Cancelar</button>
            <button type="submit" class="btn btn--primary" id="create-btn">Crear cobro</button>
          </div>
        </form>
        <div id="new-link" hidden></div>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Cobros</h2>
          <span class="muted">${cached.length} en total</span>
        </div>
        ${loadError ? `<p class="empty-state">No se pudo cargar la lista: ${escapeHtml(loadError)}</p>` : `
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Código</th><th>Concepto</th><th>Valor</th><th>Estado</th>
                <th>Factura</th><th>Creado</th><th class="col-center">Acciones</th>
              </tr>
            </thead>
            <tbody id="charge-rows">${renderRows(cached)}</tbody>
          </table>
        </div>`}
      </section>` : ''}
    `;
  },

  async afterRender() {
    if (!isDeployedBundle()) return;

    const form = document.getElementById('charge-form');
    const toggle = document.getElementById('toggle-create');
    const newLink = document.getElementById('new-link');

    const refresh = async () => {
      try {
        cached = (await api('list')).items || [];
        const rows = document.getElementById('charge-rows');
        if (rows) rows.innerHTML = renderRows(cached);
      } catch (e) {
        showToast(e.message, 'error');
      }
    };

    toggle?.addEventListener('click', () => {
      form.hidden = !form.hidden;
      if (!form.hidden) form.concept.focus();
    });
    document.getElementById('cancel-create')?.addEventListener('click', () => {
      form.reset();
      form.hidden = true;
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        concept: form.concept.value.trim(),
        amount: Number(form.amount.value),
        referenceCode: form.referenceCode.value.trim(),
        expiresDays: Number(form.expiresDays.value) || 30,
        payerName: form.payerName.value.trim(),
        payerEmail: form.payerEmail.value.trim(),
        notes: form.notes.value.trim(),
        requiresInvoice: form.requiresInvoice.checked,
      };
      if (!payload.concept || !payload.amount) {
        showToast('Falta el concepto o el valor.', 'error');
        return;
      }
      const btn = document.getElementById('create-btn');
      btn.disabled = true;
      try {
        const { item } = await api('create', payload);
        const link = payLink(item.publicCode);
        await navigator.clipboard?.writeText(link).catch(() => {});
        newLink.hidden = false;
        newLink.innerHTML = `
          <div class="pay-link-box">
            <strong>Cobro ${escapeHtml(item.publicCode)} creado · enlace copiado</strong>
            <code>${escapeHtml(link)}</code>
          </div>`;
        showToast(`Cobro ${item.publicCode} creado. El enlace quedó copiado.`, 'success', { title: 'Listo' });
        form.reset();
        form.hidden = true;
        await refresh();
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('charge-rows')?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;

      if (btn.dataset.copy) {
        await navigator.clipboard?.writeText(payLink(btn.dataset.copy)).catch(() => {});
        showToast('Enlace de pago copiado.', 'success');
        return;
      }

      if (btn.dataset.cancel) {
        const ok = await confirmDialog({
          title: 'Anular cobro',
          message: '<p>El enlace dejará de funcionar y el cliente ya no podrá pagarlo.</p>',
          confirmLabel: 'Sí, anular',
          danger: true,
        });
        if (!ok) return;
        try {
          await api('cancel', { orderId: btn.dataset.cancel });
          showToast('Cobro anulado.', 'success');
          await refresh();
        } catch (e) {
          showToast(e.message, 'error');
        }
        return;
      }

      if (btn.dataset.paid) {
        const ok = await confirmDialog({
          title: 'Confirmar pago recibido',
          message: '<p>Úsalo cuando el cliente pagó por <strong>transferencia</strong> y ya verificaste que el dinero entró a la cuenta.</p>',
          confirmLabel: 'Sí, recibí el pago',
        });
        if (!ok) return;
        try {
          await api('mark-paid', { orderId: btn.dataset.paid });
          showToast('Cobro marcado como pagado.', 'success');
          await refresh();
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    });
  },
};
