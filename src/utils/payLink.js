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
 *
 * SEGURIDAD: el monto NUNCA viaja en el enlace real (lo decide el servidor);
 * en el demo solo pasa un entero positivo. Referencia y concepto se recortan y
 * se les quitan caracteres de control; PagarView los vuelve a validar al leer.
 * =============================================================================
 */
import { isDeployedBundle } from './env.js';

/** Texto para la URL: sin caracteres de control y con un largo maximo. */
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function payHref({ reference = '', concept = '', amount = 0 } = {}) {
  const params = [];
  const ref = clean(reference, 80);
  const con = clean(concept, 120);
  if (ref) params.push('reference=' + encodeURIComponent(ref));
  if (con) params.push('concept=' + encodeURIComponent(con));
  if (isDeployedBundle()) {
    return 'https://www.cstravelgroup.com/pagar' + (params.length ? '?' + params.join('&') : '');
  }
  const value = Math.round(Number(amount));
  if (Number.isFinite(value) && value > 0) params.push('amount=' + value);
  return '#/doctor/dashboard/pagos' + (params.length ? '?' + params.join('&') : '');
}

/** Atributos del enlace: nueva pestaña solo cuando va a Wix (bundle real). */
export function payTargetAttrs() {
  return isDeployedBundle() ? ' target="_blank" rel="noopener noreferrer"' : '';
}
