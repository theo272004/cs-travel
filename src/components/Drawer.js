/**
 * Drawer.js
 * =============================================================================
 * Panel lateral flotante (glass azul CS Travel) que entra desde la derecha.
 * Singleton en <body>. Usa TRANSICIÓN (no animation) para que el estado final
 * sea visible aunque la pestaña no repinte.
 *
 * Uso:
 *   openDrawer({ title, bodyHtml, primary: { label, onClick } });
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

let _d = null;

function ensure() {
  if (_d) return _d;
  const host = document.createElement('div');
  host.className = 'drawer-overlay';
  host.innerHTML = `
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div class="drawer__head">
        <h2 class="drawer__title" id="drawer-title"></h2>
        <button type="button" class="drawer__close" aria-label="Cerrar">✕</button>
      </div>
      <div class="drawer__body"></div>
      <div class="drawer__foot"></div>
    </aside>`;
  document.body.appendChild(host);

  const close = () => closeDrawer();
  host.addEventListener('click', (e) => { if (e.target === host) close(); });
  host.querySelector('.drawer__close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && host.classList.contains('is-open')) close();
  });

  _d = {
    host,
    title: host.querySelector('.drawer__title'),
    body:  host.querySelector('.drawer__body'),
    foot:  host.querySelector('.drawer__foot'),
  };
  return _d;
}

/**
 * openDrawer()
 * @param {{ title?:string, bodyHtml?:string, primary?:{label:string,onClick:Function} }} opts
 */
export function openDrawer({ title = '', bodyHtml = '', primary = null } = {}) {
  const d = ensure();
  d.title.textContent = title;
  d.body.innerHTML = bodyHtml;
  if (primary) {
    d.foot.hidden = false;
    d.foot.innerHTML = `<button type="button" class="btn btn--primary drawer__primary">${escapeHtml(primary.label)}</button>`;
    d.foot.querySelector('.drawer__primary').onclick = () => { closeDrawer(); primary.onClick?.(); };
  } else {
    d.foot.hidden = true;
    d.foot.innerHTML = '';
  }
  void d.host.offsetWidth; // reflow: dispara la transición de entrada
  d.host.classList.add('is-open');
}

export function closeDrawer() {
  if (_d) _d.host.classList.remove('is-open');
}
