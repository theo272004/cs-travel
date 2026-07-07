/**
 * Combobox.js
 * =============================================================================
 * Input con lista desplegable BUSCABLE y estilizada (blanca, cae hacia abajo,
 * coherente con el resto del sistema). Reemplaza el <datalist> nativo (que se
 * pintaba oscuro y no combinaba). Acepta valor libre: la lista solo SUGIERE.
 *
 * Uso:
 *   - Marca el input:  class="form__input combo-input" data-combo="cities"
 *     (o data-combo="nationalities"). Quita el atributo list=.
 *   - Tras renderizar el formulario:  wireComboboxes(form)
 *
 * Teclado: ↓/↑ resaltan, Enter elige, Esc cierra. Clic elige. Fuera cierra.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { COMBO_LISTS } from '../utils/options.js';

let menu = null;
let current = null;   // input activo
let opts = [];        // opciones filtradas visibles
let hi = -1;          // índice resaltado

function ensureMenu() {
  if (menu) return menu;
  menu = document.createElement('div');
  menu.className = 'combo-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  document.body.appendChild(menu);
  // mousedown (antes del blur) para que la selección registre.
  menu.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.combo-option');
    if (opt) { e.preventDefault(); choose(opt.dataset.value); }
  });
  // Reposicionar/cerrar al hacer scroll o resize.
  window.addEventListener('scroll', () => { if (current) reposition(); }, true);
  window.addEventListener('resize', close);
  document.addEventListener('mousedown', (e) => {
    if (current && e.target !== current && !menu.contains(e.target)) close();
  });
  return menu;
}

function reposition() {
  if (!current) return;
  const r = current.getBoundingClientRect();
  menu.style.left = `${r.left}px`;
  menu.style.top = `${r.bottom + 4}px`;
  menu.style.width = `${r.width}px`;
}

function renderList() {
  if (!current) return;
  const list = COMBO_LISTS[current.dataset.combo] || [];
  const q = current.value.trim().toLowerCase();
  let filtered = q ? list.filter((v) => v.toLowerCase().includes(q)) : list.slice();
  if (q) {
    filtered = filtered.sort((a, b) =>
      Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)));
  }
  opts = filtered.slice(0, 8);
  hi = -1;
  if (!opts.length) { close(); return; }
  menu.innerHTML = opts.map((v, i) =>
    `<button type="button" class="combo-option" role="option" data-i="${i}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`
  ).join('');
  ensureMenu();
  reposition();
  menu.hidden = false;
}

function highlight(next) {
  if (!opts.length) return;
  hi = (next + opts.length) % opts.length;
  [...menu.children].forEach((el, i) => el.classList.toggle('is-hi', i === hi));
  menu.children[hi]?.scrollIntoView({ block: 'nearest' });
}

function choose(value) {
  if (!current) return;
  current.value = value;
  current.dispatchEvent(new Event('input', { bubbles: true }));
  current.dispatchEvent(new Event('change', { bubbles: true }));
  close();
  current.focus();
}

function close() {
  if (menu) menu.hidden = true;
  current = null;
  opts = [];
  hi = -1;
}

/** Enlaza el comportamiento de combobox a los inputs [data-combo] de `root`. */
export function wireComboboxes(root = document) {
  ensureMenu();
  root.querySelectorAll('input[data-combo]').forEach((input) => {
    if (input.dataset.comboWired) return;
    input.dataset.comboWired = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');

    input.addEventListener('focus', () => { current = input; renderList(); });
    input.addEventListener('input', () => { current = input; renderList(); });
    input.addEventListener('blur', () => { setTimeout(() => { if (current === input) close(); }, 120); });
    input.addEventListener('keydown', (e) => {
      if (current !== input) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (menu.hidden) renderList(); else highlight(hi + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(hi - 1); }
      else if (e.key === 'Enter') { if (hi >= 0 && opts[hi]) { e.preventDefault(); choose(opts[hi]); } }
      else if (e.key === 'Escape') { close(); }
    });
  });
}
