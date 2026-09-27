/**
 * motion.js
 * =============================================================================
 * Hace que TODA ventana emergente del portal salga del boton que la abrio y
 * vuelva a el al cerrarse (docs/GUIA-DE-ESTILO.md, seccion 6). Asi no hace
 * falta programar la animacion en cada vista:
 *
 *   1. Se recuerda el ultimo control que la persona activo (clic o teclado).
 *   2. Cuando una capa .modal-overlay / .info-modal-overlay / .cst-modal-overlay
 *      recibe la clase is-open, se calcula donde queda ese control respecto de
 *      la ventana y se guarda en --from-x / --from-y.
 *   3. ui.css usa esas variables como transform-origin: la ventana crece desde
 *      ese punto y, al cerrarse, se encoge hacia el mismo punto.
 *
 * Si no hay control (se abrio sola), crece desde el centro.
 * =============================================================================
 */

const OVERLAYS = '.modal-overlay, .info-modal-overlay, .cst-modal-overlay';
const BOXES = '.modal, .info-modal, .cst-modal';

let lastTrigger = null;
let lastPoint = null;

function remember(event) {
  const el = event.target?.closest?.('button, a, [role="button"], [data-action], [tabindex]');
  if (!el || el.closest(OVERLAYS + ', .cs-guide')) return;
  lastTrigger = el;
  lastPoint = event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : null;
}

/** Punto de origen (en px, relativo a la ventana) para el transform-origin. */
function originFor(box) {
  let x = null;
  let y = null;
  if (lastTrigger && lastTrigger.isConnected) {
    const r = lastTrigger.getBoundingClientRect();
    if (r.width || r.height) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
  }
  if (x == null && lastPoint) ({ x, y } = lastPoint);
  if (x == null) return null;
  // Se mide la ventana sin la escala inicial, para que el punto sea exacto.
  const prevT = box.style.transition;
  const prevTr = box.style.transform;
  box.style.transition = 'none';
  box.style.transform = 'none';
  const b = box.getBoundingClientRect();
  box.style.transform = prevTr;
  void box.offsetWidth;
  box.style.transition = prevT;
  return { x: x - b.left, y: y - b.top };
}

function onOpen(overlay) {
  const box = overlay.querySelector(BOXES);
  if (!box) return;
  const o = originFor(box);
  if (o) {
    box.style.setProperty('--from-x', `${Math.round(o.x)}px`);
    box.style.setProperty('--from-y', `${Math.round(o.y)}px`);
  } else {
    box.style.removeProperty('--from-x');
    box.style.removeProperty('--from-y');
  }
}

export function initMotion() {
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') remember(e); }, true);

  const seen = new WeakSet();
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (r.type !== 'attributes' || !(el instanceof Element) || !el.matches(OVERLAYS)) continue;
      const open = el.classList.contains('is-open');
      if (open && !seen.has(el)) { seen.add(el); onOpen(el); }
      if (!open) seen.delete(el);
    }
  });
  obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}
