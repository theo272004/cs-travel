/**
 * payLink.js
 * =============================================================================
 * Enlace de pago CONTEXT-AWARE para los botones "Pagar" del portal.
 *
 *   - Bundle real (portal Wix, bajo /portal-app/): abre la pasarela REAL
 *     cstravelgroup.com/pagar (resuelve el monto desde Wix).
 *   - Demo (GitHub Pages): abre el CHECKOUT INTERNO #/doctor/dashboard/pagos
 *     (PagarView) con datos de ejemplo, para que el front se itere sin Wix.
 *
 * `amount` solo se anexa en el demo (la pasarela real lo resuelve sola). Recibe
 * valores SIN codificar (la función codifica). Ver [[checkout-pagar-rediseno]].
 * =============================================================================
 */
import { isDeployedBundle } from './env.js';

export function payHref({ reference = '', concept = '', amount = 0 } = {}) {
  const params = [];
  if (reference) params.push('reference=' + encodeURIComponent(reference));
  if (concept) params.push('concept=' + encodeURIComponent(concept));
  if (isDeployedBundle()) {
    return 'https://www.cstravelgroup.com/pagar' + (params.length ? '?' + params.join('&') : '');
  }
  if (amount) params.push('amount=' + Math.round(amount));
  return '#/doctor/dashboard/pagos' + (params.length ? '?' + params.join('&') : '');
}

/** Atributos del enlace: nueva pestaña solo cuando va a Wix (bundle real). */
export function payTargetAttrs() {
  return isDeployedBundle() ? ' target="_blank" rel="noopener"' : '';
}
