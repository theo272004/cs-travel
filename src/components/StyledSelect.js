/**
 * StyledSelect.js
 * =============================================================================
 * Convierte CUALQUIER <select> nativo en un desplegable con estilo propio,
 * idéntico al combobox de "Origen" (lista blanca redondeada .combo-menu). No
 * cambia la lógica: el <select> queda OCULTO como fuente de datos — su `value`,
 * su `selectedIndex` y sus eventos `change`/`input` siguen funcionando igual, así
 * que ningún formulario ni filtro existente se rompe.
 *
 * Uso: se llama `wireStyledSelects(root)` tras pintar cada vista (hook global en
 * el router). Es idempotente: marca cada select con data-styled y no lo repite.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

// Un único menú compartido, reposicionado bajo el control activo (igual patrón
// que Combobox.js). Reutiliza la clase visual .combo-menu / .combo-option.
let menu = null;
let curSel = null;   // <select> nativo activo (fuente de datos)
let curCtrl = null;  // botón visible que lo representa
let opts = [];       // [{ label, disabled }]
let hi = -1;         // índice resaltado

function ensureMenu() {
  if (menu) return menu;
  menu = document.createElement('div');
  menu.className = 'combo-menu select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  document.body.appendChild(menu);
  // mousedown (antes del blur) para que la selección registre.
  menu.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.combo-option');
    if (opt && !opt.disabled) { e.preventDefault(); choose(Number(opt.dataset.i)); }
  });
  window.addEventListener('scroll', () => { if (curSel) position(); }, true);
  window.addEventListener('resize', close);
  document.addEventListener('mousedown', (e) => {
    if (curSel && !menu.contains(e.target) && !curCtrl.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!curSel) return;
    if (e.key === 'Escape') { e.preventDefault(); const c = curCtrl; close(); c.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (hi >= 0) choose(hi); }
  });
  return menu;
}

function position() {
  if (!curCtrl) return;
  const r = curCtrl.getBoundingClientRect();
  menu.style.minWidth = `${r.width}px`;
  menu.style.left = `${r.left}px`;
  menu.hidden = false; // visible para poder medir su alto
  const mh = menu.offsetHeight;
  const roomBelow = window.innerHeight - r.bottom;
  // Cae hacia abajo; si no hay espacio y sí arriba, se voltea hacia arriba.
  menu.style.top = (roomBelow < mh + 8 && r.top > mh + 8)
    ? `${r.top - mh - 4}px`
    : `${r.bottom + 4}px`;
}

function open(sel, ctrl) {
  ensureMenu();
  curSel = sel; curCtrl = ctrl;
  opts = [...sel.options].map((o) => ({ label: o.textContent, disabled: o.disabled }));
  const si = sel.selectedIndex;
  menu.innerHTML = opts.map((o, i) =>
    `<button type="button" class="combo-option${i === si ? ' is-selected' : ''}" role="option" data-i="${i}"${o.disabled ? ' disabled' : ''}>${escapeHtml(o.label)}</button>`
  ).join('');
  position();
  highlight(si >= 0 ? si : 0);
  menu.children[si >= 0 ? si : 0]?.scrollIntoView({ block: 'nearest' });
  ctrl.setAttribute('aria-expanded', 'true');
}

function move(d) {
  if (!opts.length) return;
  let n = hi;
  for (let k = 0; k < opts.length; k++) { n = (n + d + opts.length) % opts.length; if (!opts[n].disabled) break; }
  highlight(n);
  menu.children[n]?.scrollIntoView({ block: 'nearest' });
}

function highlight(i) {
  hi = i;
  [...menu.children].forEach((el, idx) => el.classList.toggle('is-hi', idx === i));
}

function choose(i) {
  if (!curSel || !opts[i] || opts[i].disabled) return;
  const sel = curSel;
  const ctrl = curCtrl;
  if (sel.selectedIndex !== i) {
    sel.selectedIndex = i;
    sync(sel, ctrl);
    // Mismos eventos que dispararía un cambio nativo: los listeners existentes
    // (filtros, formularios) reaccionan igual.
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  close();
  ctrl.focus();
}

/** Copia la etiqueta de la opción seleccionada al control visible. */
function sync(sel, ctrl) {
  const o = sel.options[sel.selectedIndex];
  const valEl = ctrl.querySelector('.styled-select__value');
  if (valEl) valEl.textContent = o ? o.textContent : '';
  ctrl.classList.toggle('is-empty', !sel.value);
}

function close() {
  if (menu) menu.hidden = true;
  curCtrl?.setAttribute('aria-expanded', 'false');
  curSel = null; curCtrl = null; opts = []; hi = -1;
}

const CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

/** Enlaza el estilo propio a todos los <select> de `root` (idempotente). */
export function wireStyledSelects(root = document) {
  // Al re-renderizar una vista, cerramos cualquier menú abierto (su control pudo
  // quedar destruido por el innerHTML) para no dejar un desplegable huérfano.
  close();
  root.querySelectorAll('select').forEach((sel) => {
    if (sel.dataset.styled || sel.multiple) return;
    sel.dataset.styled = '1';

    const ctrl = document.createElement('button');
    ctrl.type = 'button';
    // Hereda las clases del select (form__input, table-toolbar__select, etc.)
    // para verse EXACTAMENTE igual que el resto de inputs de esa zona.
    ctrl.className = `styled-select__control ${sel.className}`.trim();
    ctrl.setAttribute('aria-haspopup', 'listbox');
    ctrl.setAttribute('aria-expanded', 'false');
    if (sel.disabled) ctrl.disabled = true;
    ctrl.innerHTML = `<span class="styled-select__value"></span><span class="styled-select__chev" aria-hidden="true">${CHEVRON}</span>`;

    sel.insertAdjacentElement('afterend', ctrl);
    sync(sel, ctrl);

    // Si el value cambia por código (reset de formulario, set programático), el
    // control se re-sincroniza al vuelo.
    sel.addEventListener('change', () => sync(sel, ctrl));

    ctrl.addEventListener('click', (e) => {
      e.preventDefault();
      if (curSel === sel) { close(); return; }
      if (curSel) close();
      open(sel, ctrl);
    });
    ctrl.addEventListener('keydown', (e) => {
      if (curSel === sel) return; // ya lo maneja el listener global
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(sel, ctrl); }
    });
  });
}
