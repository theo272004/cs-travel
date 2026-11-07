/*
 * InvoiceBox.js
 *   Factura de una solicitud o caso ya pagado, a la vista de quien lo creó y del
 *   admin (Andrés, 30 jun, L762: «en todos los portales»). El servidor comprueba
 *   el permiso en /api/pagos/mi-factura; una factura sin enviar a la DIAN no sale.
 *   Tambien: la regla de 20 minutos para mostrar «Editar» (el servidor la exige).
 */
import { escapeHtml } from '../utils/escapeHtml.js';
import { isDeployedBundle } from '../utils/env.js';
import { showToast } from '../utils/toast.js';

const EDIT_WINDOW_MS = 20 * 60 * 1000;

export function withinEditWindow(item, now = Date.now()) {
  const at = Date.parse(String(item?._createdDate || item?.createdAt || ''));
  return !Number.isFinite(at) || now - at <= EDIT_WINDOW_MS;
}

export function invoiceBoxHtml(item) {
  if (!isDeployedBundle() || item?.paymentStatus !== 'paid') return '';
  return `<div id="invoice-box" data-id="${escapeHtml(item.id)}" class="panel" style="margin-bottom:16px;" hidden></div>`;
}

const pedir = async (body) => {
  const res = await fetch('/api/pagos/mi-factura', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || 'No pudimos traer la factura.');
  return out;
};

export async function loadInvoiceBox(resource) {
  const box = document.getElementById('invoice-box');
  if (!box) return;
  const id = box.dataset.id;
  let invoice = null;
  try {
    ({ invoice } = await pedir({ resource, id }));
  } catch {
    return; // La factura es un extra de la ficha: si falla, la ficha sigue igual.
  }
  box.hidden = false;
  if (!invoice) {
    box.innerHTML = '<strong>Factura</strong><p class="muted" style="margin:6px 0 0;">Tu pago está confirmado. La factura aparecerá aquí cuando se emita.</p>';
    return;
  }
  const action = invoice.canDownload
    ? '<button type="button" class="btn btn--ghost btn--sm" id="invoice-pdf">Descargar PDF</button>'
    : invoice.url && /^https:\/\//.test(invoice.url)
      ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(invoice.url)}" target="_blank" rel="noopener noreferrer">Ver factura</a>`
      : '';
  box.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;">
      <div><strong>Factura ${escapeHtml(invoice.number || '')}</strong><p class="muted" style="margin:4px 0 0;">Factura electrónica de este pago.</p></div>
      ${action}
    </div>`;
  box.querySelector('#invoice-pdf')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { base64, filename } = await pedir({ resource, id, action: 'pdf' });
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${base64}`;
      link.download = filename;
      link.click();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
