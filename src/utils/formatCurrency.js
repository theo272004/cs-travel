/**
 * formatCurrency.js
 * =============================================================================
 * PROPOSITO:
 *   Formatear numeros como moneda (pesos colombianos por defecto) para
 *   mostrarlos de forma legible en la interfaz.
 *
 * RESPONSABILIDAD:
 *   Convertir 18450000 -> "$ 18.450.000". Centraliza el formato para que toda
 *   la app muestre los montos de la misma manera.
 * =============================================================================
 */

/**
 * formatCurrency()
 * @param {number} value    - Monto numerico.
 * @param {string} currency - Codigo ISO de moneda (por defecto "COP").
 * @returns {string}        - Texto formateado. Si value no es valido, "$ 0".
 *
 * Usa Intl.NumberFormat, la API estandar del navegador para internacionalizar
 * numeros, fechas y monedas segun la configuracion regional ("es-CO").
 */
export function formatCurrency(value, currency = 'COP') {
  const number = Number(value);
  if (Number.isNaN(number)) return '$ 0';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0, // Sin decimales: los montos son enteros.
    maximumFractionDigits: 0,
  }).format(number);
}

// Import diferido para evitar ciclos: settingsService no depende de este modulo.
import { settingsService } from '../services/settingsService.js';

/**
 * formatWithUsd()
 * Igual que formatCurrency (COP) pero, si el dueño activó "mostrar USD", añade el
 * equivalente aproximado en dólares: "$ X (~US$ Y)". El cobro SIEMPRE es en COP;
 * el USD es solo referencia con la tasa que fija el dueño (ver settingsService).
 * Devuelve texto plano (seguro para innerHTML y textContent).
 *
 * @param {number} value - Monto en COP.
 * @returns {string}
 */
export function formatWithUsd(value) {
  const cop = formatCurrency(value, 'COP');
  let fx = null;
  try { fx = settingsService.getFx(); } catch { fx = null; }
  if (!fx || !fx.showUsd || !fx.usdToCop) return cop;

  // currencyDisplay:'code' -> "USD 695" (no confundir el $ del USD con el $ COP).
  const usd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) / fx.usdToCop);
  return `${cop} (~${usd})`;
}
