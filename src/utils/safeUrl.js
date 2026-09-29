/**
 * safeUrl.js
 * =============================================================================
 * PROPOSITO:
 *   Filtrar las direcciones que vienen de DATOS (servidor, localStorage, lo que
 *   escribio otra persona) antes de ponerlas en un href o un src.
 *
 * POR QUE:
 *   escapeHtml() evita que un valor rompa el atributo, pero no impide un
 *   enlace «javascript:...» o «data:text/html,...»: el atributo queda bien
 *   formado y el codigo corre al hacer clic (o al cargar un iframe). Aqui solo
 *   pasan los esquemas que el portal usa de verdad.
 *
 * USO:
 *   `<a href="${escapeHtml(safeUrl(valor))}">`  (siempre ademas de escapeHtml)
 *   safeUrl(valor, { images: true }) acepta ademas data:image/... (miniaturas
 *   de banners subidas desde el propio navegador).
 * =============================================================================
 */

const ALLOWED = ['http:', 'https:', 'mailto:', 'tel:', 'blob:'];
// data:image/svg+xml puede traer codigo: solo imagenes de mapa de bits.
const DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;

/**
 * safeUrl()
 * @param {*} value - Direccion a revisar.
 * @param {object} [opts]
 * @param {boolean} [opts.images=false] - Permitir data:image/(png|jpg|webp|gif|avif).
 * @param {string} [opts.fallback='']   - Lo que se devuelve si no es segura.
 * @returns {string} La direccion tal cual si es segura; si no, `fallback`.
 */
export function safeUrl(value, { images = false, fallback = '' } = {}) {
  const url = String(value ?? '').trim();
  if (!url) return fallback;
  // Los navegadores ignoran tabs, saltos de linea y controles dentro del
  // esquema («java\tscript:»): se quitan antes de mirarlo.
  const compact = url.replace(/[\u0000-\u001F\u007F\s]+/g, '');
  // Relativas (misma pagina o mismo sitio): #/ruta, /ruta, ./x, ../x, ?q=
  // «//otro-sitio.com» NO es relativa: cambia de dominio.
  if (/^(#|\?|\.{1,2}\/|\/(?!\/))/.test(compact)) return url;
  if (images && DATA_IMAGE.test(url)) return url;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (!scheme) {
    // Sin esquema ni barra inicial («archivo.pdf», «ruta/x»): relativa.
    return /^[\w\-.~%]+(\/|$|\?|#)/.test(compact) && !compact.includes(':') ? url : fallback;
  }
  return ALLOWED.includes(scheme[1].toLowerCase() + ':') ? url : fallback;
}

/**
 * safeHashRoute()
 * Solo rutas internas de la SPA («#/...»). Para navegar con datos que vienen
 * de un atributo o de la URL sin abrir la puerta a otro sitio.
 */
export function safeHashRoute(value, fallback = '#/') {
  const hash = String(value ?? '').trim();
  return /^#\/[^\s"'<>`\\]*$/.test(hash) ? hash : fallback;
}
