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
