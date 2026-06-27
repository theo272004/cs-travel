import logoCs from '../assets/logo-cs.png';

// =============================================================================
// CHECKOUT (pasarela de pago) — PROTOTIPO VISUAL para iterar el front en GitHub.
// Sara pule aqui toda la parte visual; luego se extrae a Wix (cstravelgroup.com/pagar).
// Diseno de 2 columnas: izquierda metodo de pago, derecha resumen (monto grande +
// desglose). Mantiene el fondo de nubes. Sin backend real: el monto/concepto salen
// del query (?amount=&concept=&reference=) o de un ejemplo.
// Estilos: ver bloque ".pagar" al final de src/styles/main.css.
// =============================================================================

const BANK = {
  banco: 'Davivienda', tipo: 'Cuenta de Ahorros', numero: '488426026677',
  titular: 'Andrés Felipe Sánchez De La Parra', cc: '1140886086',
  breb: '@DAVI3167423835', wa: '573146103599',
};

const COPY_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

function fmtCop(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n || 0));
}

export const PagarView = {
  async render(ctx) {
    const concept = ctx?.query?.concept || 'MED-2026-0009 · Rinoplastia';
    const reference = ctx?.query?.reference || '';
    const amount = Number(ctx?.query?.amount) || 6500000;
    const amountLabel = fmtCop(amount);
    const waLink = `https://wa.me/${BANK.wa}?text=${encodeURIComponent(`Hola CS Travel, adjunto el comprobante de mi transferencia por ${concept}.`)}`;

    return `
      <div class="pagar">

        <header class="pagar__header">
          <img src="${logoCs}" alt="CS Travel Group" class="pagar__logo">
          <div class="pagar__brand-name">CS TRAVEL GROUP</div>
          <div class="pagar__brand-sub">Portal seguro de pagos</div>
          <span class="pagar__secure">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Conexión segura SSL
          </span>
        </header>

        <main class="pagar__card">

          <section class="pagar__main">
            <p class="pagar__eyebrow">Último paso</p>
            <h1 class="pagar__title">Completa tu pago</h1>
            <p class="pagar__lead">Revisa los datos de tu cotización y elige cómo deseas pagar. CS Travel nunca almacena información de tarjetas.</p>

            <div class="pagar__context">
              <div class="pagar__ctx-card"><span>Cotización / referencia</span><strong>${concept}</strong></div>
              <div class="pagar__ctx-card pagar__ctx-card--ok"><span>Estado</span><strong>Lista para pago</strong></div>
            </div>

            <div class="pagar__section-label">Selecciona un método de pago</div>
            <div class="pagar__methods" role="radiogroup" aria-label="Método de pago">
              <button class="pagar__method pagar__method--selected" type="button" data-method="online" role="radio" aria-checked="true">
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
              <button class="pagar__method" type="button" data-method="transfer" role="radio" aria-checked="false">
                <span class="pagar__radio"><span class="pagar__radio-dot"></span></span>
                <span class="pagar__method-body">
                  <span class="pagar__method-title">Transferencia o Bre-B</span>
                  <span class="pagar__method-sub">Desde cualquier banco · sin recargo</span>
                </span>
                <span class="pagar__method-logos">
                  <span class="pagar__badge pagar__badge--breb">Bre-B</span>
                  <span class="pagar__badge pagar__badge--davi">Davivienda</span>
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>
                <span>Bold abrirá su pasarela segura para que elijas tarjeta, PSE y el banco correspondiente. No debes ingresar datos bancarios en esta página.</span>
              </div>
              <button class="pagar__btn" type="button">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Continuar con Bold · ${amountLabel}
              </button>
              <div class="pagar__processor">
                <span class="pagar__bold-chip">Bold</span>
                <span class="pagar__processor-text">Procesado de forma segura · no almacenamos tu tarjeta</span>
              </div>
            </div>

            <div class="pagar__panel" data-panel="transfer" hidden>
              <div class="pagar__providers">
                <span class="pagar__badge pagar__badge--breb">Bre-B</span>
                <span class="pagar__badge pagar__badge--davi">Davivienda</span>
              </div>
              <div class="pagar__notice">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>
                <span>Transfiere con tu <b>llave Bre-B</b> (desde cualquier banco) o a la cuenta. Tu pago se confirma cuando CS Travel verifica el comprobante.</span>
              </div>
              <dl class="pagar__bank">
                <dt>Llave Bre-B</dt><dd class="pagar__bank-breb" data-copy>${BANK.breb}</dd><button type="button" class="pagar__copy" aria-label="Copiar llave Bre-B">${COPY_SVG}</button>
                <dt>Banco</dt><dd data-copy>${BANK.banco}</dd><button type="button" class="pagar__copy" aria-label="Copiar banco">${COPY_SVG}</button>
                <dt>Cuenta</dt><dd data-copy>${BANK.tipo} · ${BANK.numero}</dd><button type="button" class="pagar__copy" aria-label="Copiar cuenta">${COPY_SVG}</button>
                <dt>Titular</dt><dd data-copy>${BANK.titular}</dd><button type="button" class="pagar__copy" aria-label="Copiar titular">${COPY_SVG}</button>
                <dt>C.C.</dt><dd data-copy>${BANK.cc}</dd><button type="button" class="pagar__copy" aria-label="Copiar cédula">${COPY_SVG}</button>
              </dl>
              <span class="pagar__no-fee">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                Sin recargo por consignación o transferencia
              </span>
              <a class="pagar__btn pagar__btn--wa" href="${waLink}" target="_blank" rel="noopener">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2z"/></svg>
                Enviar comprobante por WhatsApp
              </a>
            </div>
          </section>

          <aside class="pagar__summary">
            <span class="pagar__sum-label">Total a pagar</span>
            <div class="pagar__amount">${amountLabel}</div>
            <span class="pagar__sum-currency">COP</span>
            <div class="pagar__concept">
              <strong>${concept}</strong>
              <span>Cotización de servicios CS Travel</span>
            </div>
            <div class="pagar__breakdown">
              <div><span>Servicios de viaje</span><strong>${amountLabel}</strong></div>
              <div><span>Costo adicional por pagar en línea</span><strong>$0</strong></div>
              <div class="pagar__breakdown-total"><span>Total</span><strong>${amountLabel}</strong></div>
            </div>
            <div class="pagar__sum-status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>
              Monto protegido y validado por el servidor
            </div>
            <div class="pagar__trust">
              <div class="pagar__trust-item"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg><span>El monto se obtiene de la cotización aprobada y no puede modificarse desde el navegador.</span></div>
              <div class="pagar__trust-item"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg><span>La pasarela Bold procesa el pago con certificación PCI DSS. No almacenamos números de tarjeta.</span></div>
            </div>
          </aside>

        </main>

        <footer class="pagar__footer">
          <div class="pagar__footer-logos">
            <span class="pagar__bold-chip pagar__bold-chip--lg">Bold</span>
            <span class="pagar__logo-pill"><span class="pagar__visa">VISA</span></span>
            <span class="pagar__logo-pill pagar__logo-pill--mc"><span class="pagar__mc-red"></span><span class="pagar__mc-yel"></span></span>
            <span class="pagar__badge pagar__badge--pse">PSE</span>
            <span class="pagar__badge pagar__badge--breb">Bre-B</span>
            <span class="pagar__badge pagar__badge--davi">Davivienda</span>
          </div>
          <p class="pagar__legal">Procesamiento PCI DSS a cargo de la pasarela Bold. No almacenamos datos de tarjetas.</p>
          <p class="pagar__brand-line">CS Travel Group <span class="pagar__dot"></span> RNT 264837 <span class="pagar__dot"></span> Barranquilla, Colombia.</p>
        </footer>

      </div>
    `;
  },

  async afterRender() {
    // Cambio de método (en línea / transferencia).
    const methods = Array.from(document.querySelectorAll('.pagar__method'));
    const panels = Array.from(document.querySelectorAll('.pagar__panel'));
    methods.forEach((el) => {
      const activate = () => {
        methods.forEach((m) => {
          m.classList.toggle('pagar__method--selected', m === el);
          m.setAttribute('aria-checked', String(m === el));
        });
        const which = el.dataset.method;
        panels.forEach((p) => { p.hidden = p.dataset.panel !== which; });
      };
      el.addEventListener('click', activate);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });

    // Copiar datos bancarios: el botón es un ícono de copiar; al copiar muestra
    // un check verde por un momento y vuelve al ícono.
    const CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    document.querySelectorAll('.pagar__copy').forEach((btn) => {
      const original = btn.innerHTML;
      btn.addEventListener('click', async () => {
        const value = btn.previousElementSibling?.textContent || '';
        await navigator.clipboard.writeText(value).catch(() => {});
        btn.innerHTML = CHECK;
        btn.classList.add('pagar__copy--done');
        setTimeout(() => { btn.innerHTML = original; btn.classList.remove('pagar__copy--done'); }, 1200);
      });
    });
  },
};
