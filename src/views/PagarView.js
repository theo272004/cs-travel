import logoCs from '../assets/logo-cs.png';

export const PagarView = {
  async render(ctx) {
    const concept  = ctx?.query?.concept  || '';
    const reference = ctx?.query?.reference || '';

    return `
      <div class="pagar">

        <header class="pagar__header">
          <img src="${logoCs}" alt="CS Travel Group" class="pagar__logo">
          <div class="pagar__brand-name">CS TRAVEL GROUP</div>
          <div class="pagar__brand-sub">Plataforma de viajes corporativos</div>
          <span class="pagar__secure">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Pago 100% seguro · cifrado SSL
          </span>
        </header>

        <div class="pagar__card">

          <div class="pagar__card-head">
            <div>
              <div class="pagar__meta-label">Tu pago</div>
              <div class="pagar__reference">${concept || 'MED-2026-0009'}</div>
            </div>
            <div style="text-align:right">
              <div class="pagar__meta-label">Acceso</div>
              <a href="#/login" class="pagar__login-link">Inicia sesión</a>
              <div class="pagar__currency">COP</div>
            </div>
          </div>

          <div class="pagar__divider"></div>

          <div class="pagar__section-label">Método de pago</div>

          <div class="pagar__method pagar__method--selected" role="radio" aria-checked="true" tabindex="0">
            <div class="pagar__radio"><div class="pagar__radio-dot"></div></div>
            <div class="pagar__method-body">
              <div class="pagar__method-title">Tarjeta o PSE</div>
              <div class="pagar__method-sub">Débito, crédito o PSE</div>
            </div>
            <div class="pagar__method-logos">
              <div class="pagar__logo-pill"><span class="pagar__visa">VISA</span></div>
              <div class="pagar__logo-pill pagar__logo-pill--mc">
                <span class="pagar__mc-red"></span><span class="pagar__mc-yel"></span>
              </div>
              <span class="pagar__badge pagar__badge--pse">PSE</span>
            </div>
          </div>

          <div class="pagar__method" role="radio" aria-checked="false" tabindex="0">
            <div class="pagar__radio"><div class="pagar__radio-dot"></div></div>
            <div class="pagar__method-body">
              <div class="pagar__method-title">Transferencia o Bre-B</div>
              <div class="pagar__method-sub">Desde cualquier banco · sin recargo</div>
            </div>
            <div class="pagar__method-logos">
              <span class="pagar__badge pagar__badge--breb">Bre-B</span>
              <span class="pagar__badge pagar__badge--davi">Davivienda</span>
            </div>
          </div>

          <div class="pagar__divider"></div>

          <button class="pagar__btn" type="button">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Pagar
          </button>

          <div class="pagar__card-note">
            ${reference ? `<div class="pagar__not-found">Referencia: ${reference}</div>` : '<div class="pagar__not-found">Cotización no encontrada.</div>'}
            <div class="pagar__processor">
              <span class="pagar__bold-chip">
                <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                  <rect width="11" height="11" rx="2.5" fill="#fff"/>
                  <rect x="2.5" y="2.5" width="6" height="6" rx="1" fill="#111"/>
                </svg>
                Bold
              </span>
              <span class="pagar__processor-text">Procesado de forma segura · no almacenamos tu tarjeta</span>
            </div>
          </div>
        </div>

        <footer class="pagar__footer">
          <div class="pagar__footer-logos">
            <span class="pagar__bold-chip pagar__bold-chip--lg">
              <svg width="12" height="12" viewBox="0 0 11 11" aria-hidden="true">
                <rect width="11" height="11" rx="2.5" fill="#fff"/>
                <rect x="2.5" y="2.5" width="6" height="6" rx="1" fill="#111"/>
              </svg>
              Bold
            </span>
            <div class="pagar__logo-pill"><span class="pagar__visa">VISA</span></div>
            <div class="pagar__logo-pill pagar__logo-pill--mc">
              <span class="pagar__mc-red"></span><span class="pagar__mc-yel"></span>
            </div>
            <span class="pagar__badge pagar__badge--pse">PSE</span>
            <span class="pagar__badge pagar__badge--breb">Bre-B</span>
            <span class="pagar__badge pagar__badge--davi">Davivienda</span>
          </div>
          <p class="pagar__legal">
            Procesamiento PCI DSS a cargo de la pasarela Bold.<br>
            No almacenamos datos de tarjetas.
          </p>
          <p class="pagar__brand-line">
            CS Travel Group
            <span class="pagar__dot"></span>
            RNT 264837
            <span class="pagar__dot"></span>
            Barranquilla, Colombia.
          </p>
        </footer>

      </div>
    `;
  },

  async afterRender() {
    document.querySelectorAll('.pagar__method').forEach((el) => {
      const activate = () => {
        document.querySelectorAll('.pagar__method').forEach((m) => {
          m.classList.remove('pagar__method--selected');
          m.setAttribute('aria-checked', 'false');
        });
        el.classList.add('pagar__method--selected');
        el.setAttribute('aria-checked', 'true');
      };
      el.addEventListener('click', activate);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });
  },
};
