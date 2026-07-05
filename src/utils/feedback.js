/**
 * feedback.js
 * =============================================================================
 * Feedback de "esto no lo puedes hacer" estilo apps modernas: el elemento
 * VIBRA/tiembla, se le pone un borde rojo momentaneo y aparece una nota inline
 * que EXPLICA con voz humana que esa accion la gestiona CS Travel (en vez de un
 * window.alert seco). Pensado para el gating por rol del portal.
 *
 * Uso:
 *   shakeError(boton);                       // solo sacudir + borde rojo
 *   gateNote(boton, 'Esto lo hace <strong>CS Travel</strong>. Te avisaremos.');
 * =============================================================================
 */

/**
 * shakeError()
 * Sacude un elemento (boton/campo), le pone borde rojo un instante y vibra en
 * movil. No lanza si el elemento no existe.
 */
export function shakeError(el, { vibrate = true } = {}) {
  if (!el) return;
  el.classList.remove('is-shaking', 'is-gate-error');
  // Reinicia la animacion (forzar reflow) para que se repita en clics seguidos.
  void el.offsetWidth;
  el.classList.add('is-shaking', 'is-gate-error');
  if (vibrate && navigator.vibrate) {
    try { navigator.vibrate(55); } catch (e) { /* no-op */ }
  }
  setTimeout(() => el.classList.remove('is-shaking'), 600);
  setTimeout(() => el.classList.remove('is-gate-error'), 1600);
}

/**
 * gateNote()
 * Muestra (o reutiliza) una nota inline "esto lo hace CS Travel" justo despues
 * de `anchor`, y sacude `shakeEl`. La nota se autodescarta.
 * @param {HTMLElement} anchor - elemento tras el cual insertar la nota.
 * @param {string} html - mensaje (admite <strong> para resaltar "CS Travel").
 * @param {HTMLElement} [shakeEl=anchor] - elemento a sacudir/marcar en rojo.
 */
export function gateNote(anchor, html, shakeEl = anchor) {
  shakeError(shakeEl || anchor);
  if (!anchor || !anchor.parentNode) return;

  let note = anchor.parentNode.querySelector('.gate-note[data-auto="1"]');
  if (!note) {
    note = document.createElement('div');
    note.className = 'gate-note';
    note.dataset.auto = '1';
    note.setAttribute('role', 'status');
    anchor.insertAdjacentElement('afterend', note);
  }
  note.innerHTML = `<span class="gate-note__icon" aria-hidden="true">🔒</span><span class="gate-note__text">${html}</span>`;
  clearTimeout(note._t);
  note._t = setTimeout(() => note.remove(), 7000);
}
