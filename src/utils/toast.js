/**
 * toast.js
 * =============================================================================
 * Notificacion breve en pantalla (toast). Es un SINGLETON que cuelga de <body>,
 * asi sobrevive al re-render de las vistas (p. ej. tras crear una solicitud y
 * refrescar la lista, el toast sigue visible).
 *
 * Uso:
 *   showToast('Tu solicitud fue enviada.', 'success');
 *   showToast('Algo salio mal', 'error', { title: 'Ups' });
 * =============================================================================
 */

const ICONS = { success: '✓', error: '⚠', info: 'ℹ' };

/**
 * showToast()
 * @param {string} message - Texto principal (se inserta como texto seguro).
 * @param {'success'|'error'|'info'} type
 * @param {{ title?: string, timeout?: number }} opts
 * @returns {() => void} funcion para cerrarlo manualmente.
 */
export function showToast(message, type = 'success', { title = '', timeout = 4200 } = {}) {
  let host = document.getElementById('app-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'app-toast-host';
    host.className = 'app-toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }

  const el = document.createElement('div');
  el.className = `app-toast app-toast--${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span class="app-toast__icon" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
    <div class="app-toast__body">
      ${title ? '<strong class="app-toast__title"></strong>' : ''}
      <span class="app-toast__msg"></span>
    </div>
    <button type="button" class="app-toast__close" aria-label="Cerrar">✕</button>
  `;
  // Texto seguro (evita inyeccion): usamos textContent, no innerHTML.
  if (title) el.querySelector('.app-toast__title').textContent = title;
  el.querySelector('.app-toast__msg').textContent = message;

  // La ENTRADA se anima por CSS (animation en .app-toast), sin depender de
  // requestAnimationFrame (que no dispara si la pestaña no pinta). Solo la salida
  // se controla por JS con la clase .is-out.
  host.appendChild(el);

  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 320);
  };
  el.querySelector('.app-toast__close').addEventListener('click', dismiss);
  if (timeout) setTimeout(dismiss, timeout);
  return dismiss;
}
