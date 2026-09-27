/**
 * ConfirmDialog.js
 * =============================================================================
 * Modal de confirmación PROPIO del sistema (reemplaza window.confirm) con el
 * estilo CS Travel. Devuelve una Promesa<boolean>.
 *
 * Uso:
 *   const ok = await confirmDialog({ title, message, confirmLabel, cancelLabel });
 *   if (!ok) return;
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

let _c = null;

function ensure() {
  if (_c) return _c;
  const host = document.createElement('div');
  host.className = 'cst-modal-overlay';
  host.innerHTML = `
    <div class="cst-modal" role="dialog" aria-modal="true" aria-labelledby="cst-modal-title">
      <h2 class="cst-modal__title" id="cst-modal-title"></h2>
      <div class="cst-modal__body"></div>
      <div class="cst-modal__actions">
        <button type="button" class="btn btn--ghost cst-modal__cancel"></button>
        <button type="button" class="btn btn--primary cst-modal__ok"></button>
      </div>
    </div>`;
  document.body.appendChild(host);
  _c = {
    host,
    title:  host.querySelector('.cst-modal__title'),
    body:   host.querySelector('.cst-modal__body'),
    cancel: host.querySelector('.cst-modal__cancel'),
    ok:     host.querySelector('.cst-modal__ok'),
  };
  return _c;
}

/**
 * confirmDialog()
 * @param {{ title?:string, message?:string, confirmLabel?:string, cancelLabel?:string, danger?:boolean }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = 'Confirmar',
  message = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
} = {}) {
  const c = ensure();
  c.title.textContent = title;
  // `message` puede traer <strong>/<br> del llamador (contenido controlado).
  c.body.innerHTML = message;
  c.cancel.textContent = cancelLabel;
  c.ok.textContent = confirmLabel;
  c.ok.classList.toggle('btn--danger', !!danger);
  c.ok.classList.toggle('btn--primary', !danger);

  void c.host.offsetWidth;
  c.host.classList.add('is-open');

  return new Promise((resolve) => {
    const done = (val) => {
      c.host.classList.remove('is-open');
      c.ok.onclick = c.cancel.onclick = c.host.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') done(true);
    };
    c.ok.onclick = () => done(true);
    c.cancel.onclick = () => done(false);
    c.host.onclick = (e) => { if (e.target === c.host) done(false); };
    document.addEventListener('keydown', onKey);
  });
}

/**
 * promptDialog()
 * Igual que confirmDialog, pero pide un texto (por ejemplo el motivo de una
 * cancelacion). Reemplaza window.prompt, que se ve distinto al portal.
 * Devuelve el texto escrito, o null si la persona cancela. Con required, el
 * boton de confirmar no hace nada hasta que haya texto (y lo dice).
 */
export function promptDialog({
  title = 'Escribe un dato',
  message = '',
  label = '',
  placeholder = '',
  value = '',
  required = false,
  confirmLabel = 'Guardar',
  cancelLabel = 'Cancelar',
  danger = false,
} = {}) {
  const c = ensure();
  const trigger = document.activeElement;
  c.title.textContent = title;
  const id = `cst-prompt-${Date.now()}`;
  c.body.innerHTML = `${message}
    <label class="form__label cst-modal__label" for="${id}">${escapeHtml(label)}</label>
    <textarea id="${id}" class="form__input cst-modal__input" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
    <small class="form__error cst-modal__error" aria-live="polite"></small>`;
  const input = c.body.querySelector('textarea');
  const err = c.body.querySelector('.cst-modal__error');
  c.cancel.textContent = cancelLabel;
  c.ok.textContent = confirmLabel;
  c.ok.classList.toggle('btn--danger', !!danger);
  c.ok.classList.toggle('btn--primary', !danger);

  void c.host.offsetWidth;
  c.host.classList.add('is-open');
  setTimeout(() => input.focus(), 60);

  return new Promise((resolve) => {
    const done = (val) => {
      c.host.classList.remove('is-open');
      c.ok.onclick = c.cancel.onclick = c.host.onclick = null;
      document.removeEventListener('keydown', onKey);
      trigger?.focus?.({ preventScroll: true });
      resolve(val);
    };
    const accept = () => {
      const text = input.value.trim();
      if (required && !text) {
        err.textContent = 'Este dato es obligatorio.';
        input.focus();
        return;
      }
      done(text);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) accept();
    };
    c.ok.onclick = accept;
    c.cancel.onclick = () => done(null);
    c.host.onclick = (e) => { if (e.target === c.host) done(null); };
    document.addEventListener('keydown', onKey);
  });
}
