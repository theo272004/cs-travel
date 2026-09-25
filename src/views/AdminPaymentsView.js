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
 *   Ademas, desde aqui se registra la FACTURA de cada cobro pagado: el numero,
 *   el CUFE y el enlace. Ojo con la regla contable: la factura se emite por el
 *   SERVICIO DE INTERMEDIACIÓN, no por el valor bruto del paquete; lo que se
 *   recibe para pagarle a aerolineas, hoteles y operadores es recaudo a favor
 *   de terceros, no ingreso.
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

/** Cobros de ejemplo, solo para el demo de GitHub Pages. */
let demoData = null;

function demoCharges() {
  const dia = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const billing = JSON.stringify({
    personType: 'juridica', docType: 'NIT', docNumber: '900123456', dv: '7',
    name: 'Clínica Atlántico S.A.S.', address: 'Calle 84 #45-12', city: 'Barranquilla',
    phone: '+57 300 555 0101', email: 'facturacion@clinicaatlantico.co', taxDuties: 'O-48',
  });
  return [
    { orderId: 'demo-1', publicCode: 'CST-4K7QP2', concept: 'Paquete Cartagena · 2 personas', referenceCode: 'FAC-0125',
      amount: 4850000, status: 'paid', requiresInvoice: true, billingJson: billing, payerName: 'Clínica Atlántico S.A.S.',
      createdAt: dia(6), paidAt: dia(4), expiresAt: dia(-24), invoiceNumber: '', invoiceStatus: 'pendiente',
      serviceAmount: 0, thirdPartyAmount: 0 },
    { orderId: 'demo-2', publicCode: 'CST-9TR3MX', concept: 'Tiquetes Bogotá – Medellín', referenceCode: 'OC-88',
      amount: 980000, status: 'created', requiresInvoice: false, billingJson: '', payerName: 'Logística del Caribe',
      createdAt: dia(1), paidAt: null, expiresAt: dia(-29) },
    { orderId: 'demo-3', publicCode: 'CST-2WD8LK', concept: 'Convención comercial · 8 personas', referenceCode: 'FAC-0119',
      amount: 12500000, status: 'paid', requiresInvoice: true, billingJson: billing, payerName: 'Fundación Mar Azul',
      createdAt: dia(30), paidAt: dia(28), expiresAt: dia(0), invoiceNumber: 'FV-2291', invoiceStatus: 'emitida',
      serviceAmount: 1250000, thirdPartyAmount: 11250000 },
  ];
}

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

/** Cobros pagados que pidieron factura y todavía no la tienen. */
const porFacturar = (items) => items.filter((o) => o.status === 'paid' && o.requiresInvoice && !o.invoiceNumber);

function renderRows(items) {
  if (!items.length) {
    return `<tr><td colspan="7" class="empty-state">Todavía no hay cobros. Crea el primero con «+ Nuevo cobro».</td></tr>`;
  }
  return items.map((o) => {
    const st = STATUS[o.status] || { label: o.status, badge: 'badge--gray' };
    const expired = o.status !== 'paid' && isExpired(o);
    const closed = ['paid', 'cancelled', 'refunded'].includes(o.status);
    const puedeFacturar = o.status === 'paid' && o.requiresInvoice;
    const actions = puedeFacturar
      ? `<button type="button" class="btn btn--ghost btn--sm" data-invoice="${escapeHtml(o.orderId)}">${o.invoiceNumber ? 'Ver factura' : 'Registrar factura'}</button>`
      : closed
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

// -------------------------------------------------------------- cierre contable
// El servidor manda el cierre bueno (lib/accountingExport.ts). Esto es su
// espejo, solo para que el demo de GitHub Pages muestre algo coherente.
const IVA_RATE = 0.19;
const mesDe = (valor) => (/^\d{4}-\d{2}/.test(String(valor || '')) ? String(valor).slice(0, 7) : '');

function cierreLocal(items, mes) {
  const pagados = items.filter((o) => o.status === 'paid'
    && (!mes || mesDe(o.paidAt || o.updatedAt || o.createdAt) === mes));
  const resumen = {
    mes: mes || 'todos', cobros: pagados.length, total: 0, terceros: 0,
    servicio: 0, baseGravable: 0, ivaEstimado: 0, sinRepartir: 0,
    sinFacturar: 0, sinDatosFiscales: 0,
  };
  for (const o of pagados) {
    const total = Math.round(Number(o.amount) || 0);
    const servicio = Math.round(Number(o.serviceAmount) || 0);
    const terceros = Math.round(Number(o.thirdPartyAmount) || 0);
    const base = servicio ? Math.round(servicio / (1 + IVA_RATE)) : 0;
    resumen.total += total;
    resumen.servicio += servicio;
    resumen.terceros += terceros;
    resumen.baseGravable += base;
    resumen.ivaEstimado += servicio - base;
    resumen.sinRepartir += Math.max(0, total - servicio - terceros);
    if (!['emitida', 'no_aplica'].includes(o.invoiceStatus || 'pendiente')) resumen.sinFacturar += 1;
  }
  const meses = [...new Set(items
    .filter((o) => o.status === 'paid')
    .map((o) => mesDe(o.paidAt || o.updatedAt || o.createdAt))
    .filter(Boolean))].sort().reverse();
  return { resumen, meses };
}

/** '2026-09' -> 'septiembre de 2026'. */
function nombreMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes)) return 'todos los meses';
  const [a, m] = mes.split('-');
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[Number(m) - 1]} de ${a}`;
}

/** Descarga un texto como archivo, sin pasar por el servidor. */
function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    // En el demo los ejemplos se crean una sola vez, para que los cambios
    // (registrar una factura, por ejemplo) se mantengan al repintar.
    if (!deployed && !demoData) demoData = demoCharges();
    cached = deployed ? [] : demoData;
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
        .inv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
        @media (max-width: 900px) { .inv-grid { grid-template-columns: 1fr; } }
        .inv-dl { display: grid; gap: 9px; margin: 0; }
        .inv-dl > div { display: grid; grid-template-columns: 150px 1fr; gap: 10px; font-size: .89rem; }
        .inv-dl dt { color: #667386; font-weight: 600; }
        .inv-dl dd { margin: 0; color: #0a2540; word-break: break-word; }
        .inv-rule { margin: 0 0 16px; padding: 12px 14px; border-radius: 12px; background: #fdf0e3; color: #a35b12; font-size: .85rem; line-height: 1.55; }
        .inv-split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 560px) { .inv-split { grid-template-columns: 1fr; } }
        .inv-total { display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e6ecf4; font-size: .9rem; }
        .inv-total strong { color: #0a2540; }
        .inv-warn { color: #b91c1c; font-weight: 700; }
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
          <p class="empty-state">Demo: estos cobros son de ejemplo. En el portal real se crean y se cobran de verdad por la pasarela.</p>
        </section>` : ''}

      ${true ? `
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

      <section class="panel" id="invoice-panel" hidden></section>

      ${porFacturar(cached).length ? `
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Por facturar</h2>
          <span class="muted">${porFacturar(cached).length} cobro(s) pagados esperando factura</span>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Código</th><th>Concepto</th><th>Valor</th><th>Pagado</th><th class="col-center">Acción</th></tr></thead>
            <tbody>
              ${porFacturar(cached).map((o) => `
                <tr>
                  <td><span class="code-chip">${escapeHtml(o.publicCode || '—')}</span></td>
                  <td>${escapeHtml(o.concept || '')}<div class="muted">${escapeHtml(o.payerName || '')}</div></td>
                  <td><strong>${formatCurrency(o.amount)}</strong></td>
                  <td>${formatDate(o.paidAt)}</td>
                  <td class="col-center"><button type="button" class="btn btn--primary btn--sm" data-invoice="${escapeHtml(o.orderId)}">Registrar factura</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>` : ''}

      <section class="panel" id="cierre-panel">
        <div class="panel__header">
          <h2 class="panel__title">Cierre contable</h2>
          <span class="muted">Lo que el contador necesita para facturar</span>
        </div>
        <p class="muted" style="margin:-4px 0 14px;">
          Se factura únicamente el <strong>servicio de intermediación</strong>. El dinero recibido para
          aerolíneas, hoteles y operadores es <strong>recaudo a favor de terceros</strong>, no ingreso.
        </p>
        <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">
          <div class="form__group" style="max-width:260px;flex:1 1 220px;margin:0;">
            <label class="form__label" for="cierre-mes">Mes</label>
            <select id="cierre-mes" class="form__input"><option value="">Todos los meses</option></select>
          </div>
          <button type="button" class="btn btn--primary" id="cierre-csv">Descargar CSV</button>
        </div>
        <div id="cierre-resumen" class="muted" style="margin-top:12px;">Cargando…</div>
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
    const deployed = isDeployedBundle();

    // ---------------------------------------------------------- cierre contable
    const selMes = document.getElementById('cierre-mes');
    const cajaResumen = document.getElementById('cierre-resumen');

    const pintarResumen = (r) => {
      if (!cajaResumen) return;
      if (!r.cobros) {
        cajaResumen.innerHTML = `<p class="empty-state">No hay cobros pagados en ${escapeHtml(nombreMes(r.mes === 'todos' ? '' : r.mes))}.</p>`;
        return;
      }
      const dato = (titulo, valor, nota = '') => `
        <div class="metric-card" style="gap:6px;padding:16px 18px;">
          <span class="metric-card__label">${titulo}</span>
          <strong class="metric-card__value" style="font-size:1.3rem;">${formatCurrency(valor)}</strong>
          ${nota ? `<span class="metric-card__subtitle">${nota}</span>` : ''}
        </div>`;
      const avisos = [];
      if (r.sinRepartir > 0) avisos.push(`${formatCurrency(r.sinRepartir)} sin repartir entre servicio y terceros.`);
      if (r.sinFacturar) avisos.push(`${r.sinFacturar} cobro(s) sin factura registrada.`);
      if (r.sinDatosFiscales) avisos.push(`${r.sinDatosFiscales} sin datos fiscales del cliente.`);
      cajaResumen.innerHTML = `
        <div class="metrics-grid" style="margin-bottom:10px;">
          ${dato('Recaudado', r.total, `${r.cobros} cobro(s) pagados`)}
          ${dato('Recaudo a terceros', r.terceros, 'No es ingreso: es un pasivo')}
          ${dato('Servicio de intermediación', r.servicio, 'Lo que sí se factura')}
          ${dato('Base gravable estimada', r.baseGravable, `IVA 19 %: ${formatCurrency(r.ivaEstimado)}`)}
        </div>
        ${avisos.length ? `<p class="muted"><strong>Por revisar:</strong> ${avisos.map(escapeHtml).join(' ')}</p>` : ''}
        <p class="muted">El IVA se calcula como incluido dentro del valor del servicio. Es un estimado: lo confirma el contador.</p>`;
    };

    const cargarCierre = async () => {
      const mes = selMes ? selMes.value : '';
      try {
        const datos = deployed ? await api('cierre', { mes }) : cierreLocal(cached, mes);
        if (selMes && selMes.options.length <= 1 && Array.isArray(datos.meses)) {
          for (const m of datos.meses) {
            const op = document.createElement('option');
            op.value = m;
            op.textContent = nombreMes(m);
            selMes.appendChild(op);
          }
          if (datos.meses.length) {
            selMes.value = datos.meses[0];
            return cargarCierre(); // primera carga: se centra en el mes mas reciente
          }
        }
        pintarResumen(datos.resumen);
      } catch (error) {
        if (cajaResumen) cajaResumen.innerHTML = `<p class="empty-state">No se pudo calcular el cierre: ${escapeHtml(error.message || '')}</p>`;
      }
      return undefined;
    };

    if (selMes) selMes.addEventListener('change', cargarCierre);
    document.getElementById('cierre-csv')?.addEventListener('click', async () => {
      const mes = selMes ? selMes.value : '';
      const nombre = `cierre-contable-${mes || 'todos'}.csv`;
      if (!deployed) {
        showToast('En el demo el CSV se genera en el portal real.', 'info');
        return;
      }
      try {
        const datos = await api('cierre', { mes, csv: 'si' });
        if (!datos.csv || !datos.resumen.cobros) return showToast('No hay cobros pagados en ese mes.', 'info');
        descargar(nombre, datos.csv);
        showToast(`Descargado: ${datos.resumen.cobros} cobro(s).`, 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo generar el archivo.', 'error');
      }
    });
    cargarCierre();

    // En el demo las acciones no llaman al servidor: se resuelven en memoria.
    const pedir = async (action, extra = {}) => {
      if (deployed) return api(action, extra);
      const item = cached.find((o) => o.orderId === extra.orderId);
      if (action === 'invoice-draft') {
        let billing = {};
        try { billing = JSON.parse(item.billingJson || '{}'); } catch { billing = {}; }
        const total = Number(item.amount || 0);
        const servicio = Number(item.serviceAmount || 0);
        const terceros = Number(item.thirdPartyAmount || 0);
        return { draft: {
          orderId: item.orderId, code: item.publicCode, concept: item.concept, paidAt: item.paidAt,
          total, serviceAmount: servicio, thirdPartyAmount: terceros,
          sinRepartir: Math.max(0, total - servicio - terceros),
          cliente: { ...billing, name: billing.name || item.payerName },
          invoiceNumber: item.invoiceNumber || '', invoiceCufe: item.invoiceCufe || '',
          invoiceUrl: item.invoiceUrl || '', invoiceStatus: item.invoiceStatus || 'pendiente',
          invoiceNotes: item.invoiceNotes || '',
        } };
      }
      if (action === 'invoice') {
        Object.assign(item, {
          serviceAmount: extra.serviceAmount, thirdPartyAmount: extra.thirdPartyAmount,
          invoiceNumber: extra.invoiceNumber, invoiceCufe: extra.invoiceCufe,
          invoiceUrl: extra.invoiceUrl, invoiceStatus: extra.invoiceStatus, invoiceNotes: extra.invoiceNotes,
        });
        return { item };
      }
      if (action === 'list') return { items: cached };
      return { item };
    };

    const form = document.getElementById('charge-form');
    const toggle = document.getElementById('toggle-create');
    const newLink = document.getElementById('new-link');

    const refresh = async () => {
      try {
        cached = (await pedir('list')).items || [];
        const rows = document.getElementById('charge-rows');
        if (rows) rows.innerHTML = renderRows(cached);
      } catch (e) {
        showToast(e.message, 'error');
      }
    };

    if (!deployed) {
      document.getElementById('toggle-create')?.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Demo: crear cobros funciona en el portal real.', 'info');
      });
    }

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

    const invoicePanel = document.getElementById('invoice-panel');

    const renderInvoice = (d) => {
      const money = (n) => formatCurrency(Number(n || 0));
      const c = d.cliente || {};
      invoicePanel.innerHTML = `
        <div class="panel__header">
          <h2 class="panel__title">Factura de ${escapeHtml(d.code || d.orderId)}</h2>
          <button type="button" class="btn btn--ghost btn--sm" id="inv-close">Cerrar</button>
        </div>
        <p class="inv-rule">
          <strong>Recuerda:</strong> la factura se emite por el <strong>servicio de intermediación</strong>,
          no por el valor bruto. Lo que se recibe para pagar a aerolíneas, hoteles y operadores es
          recaudo a favor de terceros, no ingreso de CS Travel.
        </p>
        <div class="inv-grid">
          <div>
            <h3 class="panel__title" style="font-size:.95rem;margin-bottom:12px;">Datos del cliente</h3>
            <dl class="inv-dl">
              <div><dt>Nombre o razón social</dt><dd>${escapeHtml(c.name || '—')}</dd></div>
              <div><dt>Tipo de persona</dt><dd>${escapeHtml(c.personType || '—')}</dd></div>
              <div><dt>Documento</dt><dd>${escapeHtml(c.docType || '')} ${escapeHtml(c.docNumber || '')}${c.dv ? '-' + escapeHtml(c.dv) : ''}</dd></div>
              <div><dt>Responsabilidad fiscal</dt><dd>${escapeHtml(c.taxDuties || '—')}</dd></div>
              <div><dt>Dirección</dt><dd>${escapeHtml(c.address || '—')}</dd></div>
              <div><dt>Ciudad</dt><dd>${escapeHtml(c.city || '—')}</dd></div>
              <div><dt>Teléfono</dt><dd>${escapeHtml(c.phone || '—')}</dd></div>
              <div><dt>Correo</dt><dd>${escapeHtml(c.email || '—')}</dd></div>
              <div><dt>Concepto</dt><dd>${escapeHtml(d.concept || '')}</dd></div>
              <div><dt>Pagado el</dt><dd>${formatDate(d.paidAt)}</dd></div>
            </dl>
          </div>

          <div>
            <h3 class="panel__title" style="font-size:.95rem;margin-bottom:12px;">Reparto del valor</h3>
            <div class="inv-split">
              <div class="form__group">
                <label class="form__label">Servicio de intermediación (base de la factura)</label>
                <input id="inv-service" type="number" min="0" step="1000" class="form__input" value="${Number(d.serviceAmount || 0)}" />
              </div>
              <div class="form__group">
                <label class="form__label">Recaudo para terceros</label>
                <input id="inv-third" type="number" min="0" step="1000" class="form__input" value="${Number(d.thirdPartyAmount || 0)}" />
              </div>
            </div>
            <div class="inv-total"><span>Total cobrado</span><strong>${money(d.total)}</strong></div>
            <div class="inv-total"><span>Sin repartir</span><strong id="inv-rest">${money(d.sinRepartir)}</strong></div>

            <div class="form__group" style="margin-top:18px;">
              <label class="form__label" for="inv-number">Número de factura</label>
              <input id="inv-number" class="form__input" maxlength="40" value="${escapeHtml(d.invoiceNumber || '')}" placeholder="FV-1234" />
            </div>
            <div class="form__group">
              <label class="form__label" for="inv-cufe">CUFE</label>
              <input id="inv-cufe" class="form__input" maxlength="120" value="${escapeHtml(d.invoiceCufe || '')}" placeholder="Código único de la DIAN" />
            </div>
            <div class="form__group">
              <label class="form__label" for="inv-url">Enlace al PDF</label>
              <input id="inv-url" class="form__input" maxlength="500" value="${escapeHtml(d.invoiceUrl || '')}" placeholder="https://..." />
            </div>
            <div class="form__group">
              <label class="form__label" for="inv-status">Estado</label>
              <select id="inv-status" class="form__input">
                <option value="pendiente" ${d.invoiceStatus === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="emitida" ${d.invoiceStatus === 'emitida' ? 'selected' : ''}>Emitida</option>
                <option value="anulada" ${d.invoiceStatus === 'anulada' ? 'selected' : ''}>Anulada</option>
                <option value="no_aplica" ${d.invoiceStatus === 'no_aplica' ? 'selected' : ''}>No aplica</option>
              </select>
            </div>
            <div class="form__group">
              <label class="form__label" for="inv-notes">Nota interna</label>
              <input id="inv-notes" class="form__input" maxlength="400" value="${escapeHtml(d.invoiceNotes || '')}" />
            </div>
            <button type="button" class="btn btn--primary btn--block" id="inv-save" data-order="${escapeHtml(d.orderId)}">Guardar factura</button>
          </div>
        </div>`;
      invoicePanel.hidden = false;
      invoicePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const recalcular = () => {
        const total = Number(d.total || 0);
        const resto = total - Number(document.getElementById('inv-service').value || 0) - Number(document.getElementById('inv-third').value || 0);
        const el = document.getElementById('inv-rest');
        el.textContent = formatCurrency(resto);
        el.classList.toggle('inv-warn', resto < 0);
      };
      document.getElementById('inv-service').addEventListener('input', recalcular);
      document.getElementById('inv-third').addEventListener('input', recalcular);
    };

    const abrirFactura = async (orderId) => {
      try {
        const { draft } = await pedir('invoice-draft', { orderId });
        renderInvoice(draft);
      } catch (e) {
        showToast(e.message, 'error');
      }
    };

    invoicePanel?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;
      if (btn.id === 'inv-close') { invoicePanel.hidden = true; invoicePanel.innerHTML = ''; return; }
      if (btn.id !== 'inv-save') return;
      btn.disabled = true;
      try {
        await pedir('invoice', {
          orderId: btn.dataset.order,
          serviceAmount: Number(document.getElementById('inv-service').value || 0),
          thirdPartyAmount: Number(document.getElementById('inv-third').value || 0),
          invoiceNumber: document.getElementById('inv-number').value.trim(),
          invoiceCufe: document.getElementById('inv-cufe').value.trim(),
          invoiceUrl: document.getElementById('inv-url').value.trim(),
          invoiceStatus: document.getElementById('inv-status').value,
          invoiceNotes: document.getElementById('inv-notes').value.trim(),
        });
        showToast('Factura registrada.', 'success', { title: 'Listo' });
        // Se vuelve a pintar la vista completa: la lista "Por facturar" y los
        // indicadores de arriba tienen que reflejar el cambio al instante.
        const host = document.querySelector('.content');
        if (host) {
          host.innerHTML = await AdminPaymentsView.render();
          await AdminPaymentsView.afterRender();
        } else {
          invoicePanel.hidden = true;
          await refresh();
        }
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.querySelectorAll('[data-invoice]').forEach((b) => b.addEventListener('click', () => abrirFactura(b.dataset.invoice)));

    document.getElementById('charge-rows')?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;

      if (btn.dataset.invoice) return abrirFactura(btn.dataset.invoice);

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
