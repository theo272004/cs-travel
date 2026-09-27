import logoCs from '../assets/logo-cs.png';
import { escapeHtml } from '../utils/escapeHtml.js';
import { isDeployedBundle } from '../utils/env.js';
import { payHref } from '../utils/payLink.js';
import { showToast } from '../utils/toast.js';
import { LEGAL_W02 } from '../services/settingsService.js';

// =============================================================================
// CHECKOUT (pasarela de pago) — ruta PUBLICA #/doctor/dashboard/pagos.
//
// Es el checkout de DEMOSTRACION del portal: los botones «Pagar» del demo
// llegan aqui con ?reference=&concept=&amount= (ver utils/payLink.js). En el
// portal publicado esos botones van directo a cstravelgroup.com/pagar, que
// resuelve el valor en el servidor; si alguien abre esta ruta alli,
// «Continuar con Bold» lo lleva a ese flujo real.
//
// SEGURIDAD:
//   - Todo lo que viene de la URL (concepto, referencia, monto) es dato de un
//     desconocido: se escapa con escapeHtml en CADA interpolacion.
//   - Sin referencia ni concepto no se inventa un cobro: «No encontramos el
//     cobro».
//   - Fuera del portal publicado no se promete «validado por el servidor»:
//     aqui el monto sale del enlace.
//
// Cuentas para transferencia: las EMPRESARIALES de CS Travel Group Colombia
// S.A.S., las mismas del sitio real (cstravelgroup/src/pages/pago.astro). La
// cuenta personal que se mostraba antes quedo retirada.
// Estilos: bloque ".pagar" de src/styles/main.css + los ajustes de esta vista
// (PAGAR_STYLES, al final del archivo).
// =============================================================================

const BANK = {
  titular: LEGAL_W02.legalName,
  nit: LEGAL_W02.nit,
  correo: LEGAL_W02.email,
  wa: '573146103599',
  cuentas: [
    { banco: 'Bancolombia', tipo: 'Cuenta de Ahorros', numero: '442-000115-82' },
    { banco: 'Davivienda', tipo: 'Cuenta de Ahorros', numero: '108900894347' },
    { banco: 'Bold', tipo: 'Cuenta de Ahorros', numero: '1700-1123-2557' },
  ],
};

/** Pago sin cuenta con el codigo CST-XXXXXX (flujo real del sitio). */
const PAY_BY_CODE_URL = 'https://www.cstravelgroup.com/pago';

const COPY_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const LOCK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const INFO_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>';
const WA_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2z"/></svg>';
const BACK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 999999999999;

function fmtCop(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n || 0));
}

/** Texto de la URL: sin controles, recortado. Se escapa aparte al pintarlo. */
function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Monto de la URL: entero positivo dentro de un rango razonable, o 0. */
function cleanAmount(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= MIN_AMOUNT && n <= MAX_AMOUNT ? n : 0;
}

/**
 * Monto escrito a mano en «Pagar un servicio». Acepta como se escribe en
 * Colombia: «1.500.000», «$ 1.500.000», «1500000» o «1.500.000,00». Los
 * centavos finales (,00 o .5) se descartan; el resto de signos se ignoran.
 */
function typedAmount(value) {
  const s = String(value ?? '').trim().replace(/[.,]\d{1,2}$/, '');
  const digits = s.replace(/\D/g, '');
  return digits ? cleanAmount(digits) : 0;
}

/**
 * Enlace «Volver» según la referencia: case:<id> -> el caso médico,
 * request:<id> -> la solicitud. Solo ids simples (letras, números, - y _).
 */
function backLinkFor(reference, role) {
  const m = /^(case|request):([A-Za-z0-9_-]{1,64})$/.exec(reference || '');
  if (!m) return null;
  const id = encodeURIComponent(m[2]);
  if (m[1] === 'case') {
    return { href: role === 'admin' ? `#/admin/medical-cases/${id}` : `#/doctor/cases/${id}`, label: 'Volver al caso' };
  }
  return { href: role === 'admin' ? `#/admin/requests/${id}` : `#/company/requests/${id}`, label: 'Volver a la solicitud' };
}

function readCharge(ctx) {
  const q = ctx?.query || {};
  const deployed = isDeployedBundle();
  const concept = cleanText(q.concept, 120);
  const reference = cleanText(q.reference, 80);
  const amount = cleanAmount(q.amount);
  // «Pagar un servicio» (sin referencia ni monto): el cliente escribe el valor,
  // igual que en cstravelgroup.com/pagar.
  const openAmount = !reference && !!concept && !amount;
  const found = deployed ? !!(reference || concept) : !!(reference || concept) && (amount > 0 || openAmount);
  return {
    deployed, concept, reference, amount, openAmount, found,
    back: backLinkFor(reference, ctx?.user?.role),
    label: concept || reference,
  };
}

function waLink(text) {
  return `https://wa.me/${BANK.wa}?text=${encodeURIComponent(text)}`;
}

function header(charge) {
  return `
    <header class="pagar__header">
      <img src="${logoCs}" alt="CS Travel Group" class="pagar__logo">
      <div class="pagar__brand-name">CS TRAVEL GROUP</div>
      <div class="pagar__brand-sub">Portal de pagos</div>
      ${charge.deployed ? `
        <span class="pagar__secure">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Conexión segura SSL
        </span>` : `
        <span class="pagar__demo-pill">
          ${INFO_SVG}
          Vista de demostración · no se cobra nada
        </span>`}
    </header>`;
}

function topbar(charge) {
  if (!charge.back) return '';
  return `
    <nav class="pagar__topbar" aria-label="Navegación">
      <a class="pagar__back" href="${escapeHtml(charge.back.href)}">${BACK_SVG}<span>${escapeHtml(charge.back.label)}</span></a>
    </nav>`;
}

function footer() {
  return `
    <footer class="pagar__footer">
      <div class="pagar__footer-logos">
        <span class="pagar__bold-chip pagar__bold-chip--lg">Bold</span>
        <span class="pagar__logo-pill"><span class="pagar__visa">VISA</span></span>
        <span class="pagar__logo-pill pagar__logo-pill--mc"><span class="pagar__mc-red"></span><span class="pagar__mc-yel"></span></span>
        <span class="pagar__badge pagar__badge--pse">PSE</span>
        <span class="pagar__badge pagar__badge--bank">Bancolombia</span>
        <span class="pagar__badge pagar__badge--bank">Davivienda</span>
      </div>
      <p class="pagar__legal">Procesamiento PCI DSS a cargo de la pasarela Bold. No almacenamos datos de tarjetas.</p>
      <p class="pagar__brand-line">
        <span>${escapeHtml(LEGAL_W02.legalName)}</span><span class="pagar__dot"></span>
        <span>NIT ${escapeHtml(LEGAL_W02.nit)}</span><span class="pagar__dot"></span>
        <span>RNT ${escapeHtml(LEGAL_W02.rnt)} (vigente ${escapeHtml(LEGAL_W02.rntValidity)})</span><span class="pagar__dot"></span>
        <span>Matrícula mercantil ${escapeHtml(LEGAL_W02.registroMercantil)}</span><span class="pagar__dot"></span>
        <span>${escapeHtml(LEGAL_W02.city)}</span>
      </p>
    </footer>`;
}

/** Estado vacío: el enlace no trae un cobro que podamos mostrar. */
function notFound(charge) {
  const wa = waLink('Hola CS Travel Group, necesito el enlace de pago de mi cotización.');
  return `
    <div class="pagar">
      ${topbar(charge)}
      ${header(charge)}
      <div class="pagar__card pagar__card--single">
        <section class="pagar__main pagar__empty" aria-labelledby="pagar-empty-title">
          <span class="pagar__empty-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8.5 11h5"/></svg>
          </span>
          <p class="pagar__eyebrow">Enlace de pago</p>
          <h1 class="pagar__title" id="pagar-empty-title">No encontramos el cobro</h1>
          <p class="pagar__empty-text">
            Este enlace no trae los datos de ningún cobro: puede estar incompleto o haberse copiado
            por partes. No te vamos a mostrar un valor que no corresponde a tu cotización.
          </p>
          <ul class="pagar__empty-steps">
            <li>Abre de nuevo el botón <b>Pagar</b> desde tu caso o solicitud en el portal.</li>
            <li>Si recibiste un código <b>CST-…</b> por correo o WhatsApp, págalo sin cuenta.</li>
            <li>¿Dudas? Escríbenos y te enviamos el enlace correcto.</li>
          </ul>
          <div class="pagar__empty-actions">
            ${charge.back ? `<a class="pagar__btn" href="${escapeHtml(charge.back.href)}">${BACK_SVG}${escapeHtml(charge.back.label)}</a>` : ''}
            <a class="pagar__btn ${charge.back ? 'pagar__btn--ghost' : ''}" href="${PAY_BY_CODE_URL}" target="_blank" rel="noopener">${LOCK_SVG}Pagar con un código</a>
            <a class="pagar__btn pagar__btn--wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener">${WA_SVG}Escribir a CS Travel Group</a>
          </div>
          <p class="pagar__proof-mail">O escríbenos a <a href="mailto:${escapeHtml(BANK.correo)}">${escapeHtml(BANK.correo)}</a>.</p>
        </section>
      </div>
      ${footer()}
      ${PAGAR_STYLES}
    </div>`;
}

export const PagarView = {
  async render(ctx) {
    const charge = readCharge(ctx);
    if (!charge.found) return notFound(charge);

    const { deployed, concept, reference, amount, openAmount, label } = charge;
    const amountLabel = amount ? fmtCop(amount) : '—';
    const waProof = waLink(`Hola CS Travel Group, adjunto el comprobante de mi transferencia por ${label}.`);
    const realHref = payHref({ reference, concept });

    // Botón principal: en el portal publicado es un enlace al flujo real
    // (/pagar resuelve el valor en el servidor); en el demo, un aviso.
    const payBtn = deployed
      ? `<a class="pagar__btn" id="pay-online" href="${escapeHtml(realHref)}">${LOCK_SVG}Continuar con Bold${amount ? ` · <span class="pagar__btn-amount">${escapeHtml(amountLabel)}</span>` : ''}</a>`
      : `<button class="pagar__btn" id="pay-online" type="button">${LOCK_SVG}Continuar con Bold · <span class="pagar__btn-amount" id="btn-amount">${escapeHtml(amountLabel)}</span></button>`;

    const statusText = deployed
      ? 'El valor final lo confirma el servidor con tu cotización al continuar'
      : 'Vista de demostración: el valor viene del enlace y no se cobra';
    const trustAmount = deployed
      ? 'El monto se toma de la cotización aprobada y el servidor lo confirma en la pasarela antes de cobrar.'
      : 'En el portal publicado, el monto sale de la cotización aprobada y el servidor lo confirma antes de cobrar.';

    return `
      <div class="pagar">
        ${topbar(charge)}
        ${header(charge)}

        <div class="pagar__card">

          <section class="pagar__main">
            <p class="pagar__eyebrow">Último paso</p>
            <h1 class="pagar__title">Completa tu pago</h1>
            <p class="pagar__lead">Revisa los datos de tu cotización y elige cómo deseas pagar. CS Travel Group nunca almacena información de tarjetas.</p>

            <div class="pagar__context">
              <div class="pagar__ctx-card"><span>Cotización / referencia</span><strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong></div>
              <div class="pagar__ctx-card pagar__ctx-card--ok"><span>Estado</span><strong>${openAmount ? 'Escribe el valor' : 'Lista para pago'}</strong></div>
            </div>

            <div class="pagar__section-label" id="pagar-methods-label">Selecciona un método de pago</div>
            <div class="pagar__methods" role="radiogroup" aria-labelledby="pagar-methods-label">
              <button class="pagar__method pagar__method--selected" type="button" data-method="online" role="radio" aria-checked="true" tabindex="0">
                <span class="pagar__radio"><span class="pagar__radio-dot"></span></span>
                <span class="pagar__method-body">
                  <span class="pagar__method-title">Pago en línea</span>
                  <span class="pagar__method-sub">Tarjeta, PSE y otros medios</span>
                </span>
                <span class="pagar__method-logos">
                  <span class="pagar__logo-pill"><span class="pagar__visa">VISA</span></span>
                  <span class="pagar__logo-pill pagar__logo-pill--mc"><span class="pagar__mc-red"></span><span class="pagar__mc-yel"></span></span>
                  <span class="pagar__badge pagar__badge--pse">PSE</span>
                </span>
              </button>
              <button class="pagar__method" type="button" data-method="transfer" role="radio" aria-checked="false" tabindex="-1">
                <span class="pagar__radio"><span class="pagar__radio-dot"></span></span>
                <span class="pagar__method-body">
                  <span class="pagar__method-title">Transferencia bancaria</span>
                  <span class="pagar__method-sub">Desde cualquier banco · sin recargo</span>
                </span>
                <span class="pagar__method-logos">
                  <span class="pagar__badge pagar__badge--bank">Bancolombia</span>
                  <span class="pagar__badge pagar__badge--bank">Davivienda</span>
                </span>
              </button>
            </div>

            <div class="pagar__panel" data-panel="online">
              <div class="pagar__providers">
                <span class="pagar__bold-chip">Bold</span>
                <span class="pagar__logo-pill"><span class="pagar__visa">VISA</span></span>
                <span class="pagar__logo-pill pagar__logo-pill--mc"><span class="pagar__mc-red"></span><span class="pagar__mc-yel"></span></span>
                <span class="pagar__badge pagar__badge--pse">PSE</span>
              </div>
              <div class="pagar__notice">
                ${INFO_SVG}
                <span>Bold abrirá su pasarela segura para que elijas tarjeta, PSE y el banco correspondiente. No debes ingresar datos bancarios en esta página.</span>
              </div>
              ${openAmount && !deployed ? `
                <label class="pagar__field">
                  <span>Valor a pagar (COP)</span>
                  <input class="pagar__amount-input" id="amount-input" type="text" inputmode="numeric" maxlength="20" placeholder="Ej.: 1.500.000" autocomplete="off" aria-describedby="amount-hint">
                  <small class="pagar__field-hint" id="amount-hint">Monto en pesos, sin centavos. Mínimo ${escapeHtml(fmtCop(MIN_AMOUNT))}.</small>
                </label>` : ''}
              ${payBtn}
              <div class="pagar__message" id="online-message" role="status" aria-live="polite" hidden></div>
              <div class="pagar__processor">
                <span class="pagar__bold-chip">Bold</span>
                <span class="pagar__processor-text">Procesado de forma segura · no almacenamos tu tarjeta</span>
              </div>
            </div>

            <div class="pagar__panel" data-panel="transfer" hidden>
              <div class="pagar__notice">
                ${INFO_SVG}
                <span>Transfiere desde cualquier banco a una de nuestras <b>cuentas empresariales</b> e indica la referencia <b>${escapeHtml(label)}</b>. Tu pago se confirma cuando CS Travel Group verifica el comprobante.</span>
              </div>
              <dl class="pagar__bank">
                ${BANK.cuentas.map((c) => `
                  <dt>${escapeHtml(c.banco)}</dt><dd>${escapeHtml(c.tipo)} · <span class="pagar__nowrap">${escapeHtml(c.numero)}</span></dd><button type="button" class="pagar__copy" data-copy="${escapeHtml(c.numero)}" aria-label="Copiar número de cuenta ${escapeHtml(c.banco)}">${COPY_SVG}</button>`).join('')}
                <dt>Titular</dt><dd>${escapeHtml(BANK.titular)}</dd><button type="button" class="pagar__copy" data-copy="${escapeHtml(BANK.titular)}" aria-label="Copiar titular">${COPY_SVG}</button>
                <dt>NIT</dt><dd>${escapeHtml(BANK.nit)}</dd><button type="button" class="pagar__copy" data-copy="${escapeHtml(BANK.nit)}" aria-label="Copiar NIT">${COPY_SVG}</button>
              </dl>
              <span class="pagar__no-fee">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                Sin recargo por consignación o transferencia
              </span>
              <a class="pagar__btn pagar__btn--wa" href="${escapeHtml(waProof)}" target="_blank" rel="noopener">${WA_SVG}Enviar comprobante por WhatsApp</a>
              <p class="pagar__proof-mail">O envíalo a <a href="mailto:${escapeHtml(BANK.correo)}">${escapeHtml(BANK.correo)}</a> para confirmar tu reserva.</p>
            </div>
          </section>

          <aside class="pagar__summary" aria-label="Resumen del pago">
            <span class="pagar__sum-label">${deployed && amount ? 'Valor de referencia' : 'Total a pagar'}</span>
            <div class="pagar__amount" id="sum-amount">${escapeHtml(amountLabel)}</div>
            <span class="pagar__sum-currency">COP</span>
            <div class="pagar__concept">
              <strong>${escapeHtml(label)}</strong>
              <span>Cotización de servicios CS Travel Group</span>
            </div>
            <div class="pagar__breakdown">
              <div><span>Servicios de viaje</span><strong data-sum>${escapeHtml(amountLabel)}</strong></div>
              <div><span>Costo adicional por pagar en línea</span><strong>$0</strong></div>
              <div class="pagar__breakdown-total"><span>Total</span><strong data-sum>${escapeHtml(amountLabel)}</strong></div>
            </div>
            <div class="pagar__sum-status ${deployed ? '' : 'pagar__sum-status--demo'}">
              ${deployed
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>'
                : INFO_SVG}
              ${escapeHtml(statusText)}
            </div>
            <div class="pagar__trust">
              <div class="pagar__trust-item"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg><span>${escapeHtml(trustAmount)}</span></div>
              <div class="pagar__trust-item"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg><span>La pasarela Bold procesa el pago con certificación PCI DSS. No almacenamos números de tarjeta.</span></div>
            </div>
          </aside>

        </div>

        ${footer()}
        ${PAGAR_STYLES}
      </div>
    `;
  },

  async afterRender(ctx) {
    const charge = readCharge(ctx);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // --- Método de pago (radiogroup accesible: clic, Enter/Espacio y flechas) ---
    const methods = Array.from(document.querySelectorAll('.pagar__method'));
    const panels = Array.from(document.querySelectorAll('.pagar__panel'));
    const activate = (el, focus = false) => {
      methods.forEach((m) => {
        const on = m === el;
        m.classList.toggle('pagar__method--selected', on);
        m.setAttribute('aria-checked', String(on));
        m.tabIndex = on ? 0 : -1;
      });
      panels.forEach((p) => { p.hidden = p.dataset.panel !== el.dataset.method; });
      if (focus) el.focus();
    };
    methods.forEach((el, i) => {
      el.addEventListener('click', () => activate(el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(el); return; }
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (step) {
          e.preventDefault();
          activate(methods[(i + step + methods.length) % methods.length], true);
        }
      });
    });

    // --- Copiar datos bancarios: ícono de copiar -> check verde un momento ---
    document.querySelectorAll('.pagar__copy').forEach((btn) => {
      const original = btn.innerHTML;
      btn.addEventListener('click', async () => {
        const value = btn.dataset.copy || btn.previousElementSibling?.textContent || '';
        let ok = true;
        try { await navigator.clipboard.writeText(value); } catch { ok = false; }
        if (!ok) { showToast('No se pudo copiar. Selecciona el dato y cópialo a mano.', 'error'); return; }
        btn.innerHTML = CHECK_SVG;
        btn.classList.add('pagar__copy--done');
        setTimeout(() => { btn.innerHTML = original; btn.classList.remove('pagar__copy--done'); }, 1200);
      });
    });

    // --- «Continuar con Bold» ---
    // En el portal publicado es un <a> al flujo real: no hace falta JS.
    if (charge.deployed) return;

    const payBtn = document.getElementById('pay-online');
    const msg = document.getElementById('online-message');
    const input = document.getElementById('amount-input');
    const showMsg = (html, kind) => {
      if (!msg) return;
      msg.className = `pagar__message ${kind ? `is-${kind}` : ''}`;
      msg.innerHTML = html;
      msg.hidden = false;
      if (!reduceMotion) msg.animate?.([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
    };

    // Monto abierto («Pagar un servicio»): el resumen sigue lo que se escribe.
    // Acepta puntos de miles («1.500.000»); al salir del campo se deja con ese
    // formato para que la persona vea el valor que se va a cobrar.
    if (input) {
      const sync = () => {
        const n = typedAmount(input.value);
        const text = n ? fmtCop(n) : '—';
        document.getElementById('sum-amount').textContent = text;
        document.getElementById('btn-amount').textContent = text;
        document.querySelectorAll('[data-sum]').forEach((el) => { el.textContent = text; });
        input.removeAttribute('aria-invalid');
      };
      input.addEventListener('input', sync);
      input.addEventListener('blur', () => {
        const n = typedAmount(input.value);
        if (n) input.value = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); payBtn?.click(); }
      });
    }

    payBtn?.addEventListener('click', () => {
      if (input && !typedAmount(input.value)) {
        input.setAttribute('aria-invalid', 'true');
        showMsg(`Escribe el valor a pagar (mínimo ${escapeHtml(fmtCop(MIN_AMOUNT))}).`, 'error');
        input.focus();
        return;
      }
      showMsg(
        '<strong>Vista de demostración.</strong> Aquí no se abre la pasarela ni se cobra nada. ' +
        'En el portal publicado, este botón abre Bold con el valor exacto de tu cotización.',
        'info',
      );
      // Sin toast: el aviso de arriba ya lo dice (role="status") y el toast
      // tapaba el propio botón en escritorio.
    });
  },
};

// Ajustes propios de esta vista (demo, estado vacío, volver, monto abierto).
// Pedido pendiente: mover este bloque a la sección ".pagar" de main.css.
const PAGAR_STYLES = `
<style>
  .pagar__topbar { width: 100%; max-width: 960px; display: flex; margin: 0 0 6px; }
  .pagar__back { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px 8px 10px; border-radius: 9999px; color: #fff; font-size: 13px; font-weight: 700; text-decoration: none; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(6px); transition: background .15s, transform .15s; }
  .pagar__back:hover { background: rgba(255,255,255,.2); transform: translateX(-2px); }
  /* Foco: celeste sobre el fondo oscuro (volver) y azul #1060e8 dentro de la
     tarjeta blanca (contraste 5,4:1). Los botones de copiar viven en .pagar__bank,
     que recorta lo que sale (overflow: hidden): su contorno va por dentro. */
  .pagar__back:focus-visible { outline: 3px solid #7fb0ff; outline-offset: 2px; }
  .pagar__btn:focus-visible, .pagar__method:focus-visible { outline: 3px solid #1060e8; outline-offset: 2px; }
  .pagar__copy:focus-visible { outline: 3px solid #1060e8; outline-offset: -3px; background: #eef4ff; }
  .pagar__proof-mail a:focus-visible { outline: 2px solid #1060e8; outline-offset: 2px; border-radius: 3px; }
  .pagar__demo-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 9999px; font-size: 12.5px; font-weight: 700; color: #ffe7a8; background: rgba(255,196,0,.14); border: 1px solid rgba(255,196,0,.35); }
  .pagar__badge--bank { color: #0a2d66; background: #eef3fb; }
  .pagar__btn--ghost { background: #fff; color: #0a2d66; border: 1.5px solid #cfd9e8; box-shadow: none; }
  .pagar__btn-amount, .pagar__nowrap { white-space: nowrap; }
  .pagar__field { display: grid; gap: 6px; margin: 0 0 12px; font-size: 12px; font-weight: 800; color: #34415a; }
  .pagar__amount-input { width: 100%; min-height: 48px; padding: 0 14px; border: 1.5px solid #dfe6f0; border-radius: 12px; font-size: 16px; font-weight: 700; color: #0a1f50; background: #fff; }
  .pagar__amount-input:focus { outline: none; border-color: #1060e8; box-shadow: 0 0 0 3px rgba(16,96,232,.15); }
  .pagar__amount-input[aria-invalid="true"] { border-color: #c62828; }
  .pagar__field-hint { font-size: 11.5px; font-weight: 600; color: #69758a; }
  .pagar__message { margin: 10px 0 0; padding: 10px 12px; border-radius: 11px; font-size: 12.5px; line-height: 1.45; color: #0a2d66; background: #eef4ff; border: 1px solid #d5e3ff; }
  .pagar__message.is-error { color: #9b1c1c; background: #fdecec; border-color: #f6caca; }
  .pagar__message[hidden] { display: none; }
  .pagar__proof-mail { margin: 10px 0 0; font-size: 12.5px; color: #69758a; text-align: center; }
  .pagar__proof-mail a { color: #1060e8; font-weight: 700; }
  .pagar__sum-status--demo { color: #7a4b00; background: #fff4d6; }
  .pagar__panel:not([hidden]) { animation: pagar-panel-in .22s ease-out both; }
  @keyframes pagar-panel-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .pagar__card--single { grid-template-columns: 1fr; max-width: 560px; }
  .pagar__empty { text-align: center; padding: 34px 32px 28px; }
  .pagar__empty-icon { display: inline-grid; place-items: center; width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 50%; color: #1060e8; background: radial-gradient(circle at 30% 30%, #eef4ff, #dde8ff); animation: pagar-pop .45s cubic-bezier(.2,.8,.3,1.2) both; }
  @keyframes pagar-pop { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
  .pagar__empty-text { margin: 8px auto 16px; max-width: 420px; color: #405069; font-size: 14px; line-height: 1.55; }
  .pagar__empty-steps { list-style: none; margin: 0 auto 20px; padding: 0; max-width: 420px; display: grid; gap: 8px; text-align: left; counter-reset: paso; }
  .pagar__empty-steps li { position: relative; padding: 10px 12px 10px 42px; border: 1px solid #e9edf4; border-radius: 12px; font-size: 13px; line-height: 1.45; color: #34415a; background: #fbfcfe; counter-increment: paso; }
  .pagar__empty-steps li::before { content: counter(paso); position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; font-weight: 800; color: #fff; background: #0a2d66; }
  .pagar__empty-actions { display: grid; gap: 10px; max-width: 420px; margin: 0 auto; }
  /* Datos legales W-02: legibles (antes blanco al 34 %, contraste < 3:1). */
  .pagar__brand-line { flex-wrap: wrap; row-gap: 4px; line-height: 1.5; color: rgba(255,255,255,.66); }
  @media (max-width: 440px) {
    /* Los bancos ya se listan en el panel: en celular no apretamos el título. */
    .pagar__method[data-method="transfer"] .pagar__method-logos { display: none; }
  }
  @media (max-width: 520px) {
    .pagar__empty { padding: 26px 18px 22px; }
    .pagar__topbar { margin-bottom: 10px; }
    .pagar__bank dd { white-space: normal; overflow-wrap: break-word; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pagar__panel:not([hidden]), .pagar__empty-icon { animation: none; }
    .pagar__back, .pagar__method { transition: none; }
    .pagar__back:hover { transform: none; }
  }
</style>`;
