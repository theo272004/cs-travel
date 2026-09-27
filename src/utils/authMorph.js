/**
 * authMorph.js
 * =============================================================================
 * Transicion por etapas entre el login y el registro (en los dos sentidos).
 *
 * Antes se usaba una View Transition del navegador: tomaba una FOTO de la
 * tarjeta del login y la estiraba hasta el tamano del panel del registro, asi
 * que el texto se agrandaba deformado y el panel aparecia corrido y luego
 * saltaba a su sitio. Ahora la coreografia es propia y nada se estira:
 *
 *   1. El contenido que se va sube un poco y se desvanece (180 ms). La
 *      tarjeta, vacia, se queda donde estaba.
 *   2. Una tarjeta "fantasma" (blanca, sin contenido) crece desde esa
 *      posicion hasta la del panel nuevo. Mientras crece, la mitad azul del
 *      registro entra desde su lado (o se recoge, al volver al login).
 *   3. Aparece la pantalla nueva debajo del fantasma y su contenido entra en
 *      cascada; el fantasma se desvanece.
 *
 * Con "reducir movimiento" (o sin Web Animations) el cambio es directo.
 * =============================================================================
 */

const EASE_OUT = 'cubic-bezier(0.22, 0.9, 0.24, 1)';
const EASE_IN = 'cubic-bezier(0.55, 0, 0.8, 0.2)';

const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

const px = (r) => ({
  left: `${r.left}px`,
  top: `${r.top}px`,
  width: `${r.width}px`,
  height: `${r.height}px`,
});

/** Geometria de la mitad azul (register__info) relativa a su panel. */
function wingOf(panel) {
  const info = panel?.querySelector('.register__info');
  if (!info) return null;
  const p = panel.getBoundingClientRect();
  const i = info.getBoundingClientRect();
  const cs = getComputedStyle(info);
  return {
    // En celular el panel va en una columna: la mitad azul queda arriba.
    vertical: i.width > p.width * 0.8,
    width: i.width,
    height: i.height,
    background: cs.backgroundImage !== 'none' ? `${cs.backgroundImage}, ${cs.backgroundColor}` : cs.backgroundColor,
  };
}

const finished = (anims) => Promise.all(anims.map((a) => a.finished.catch(() => {})));

/**
 * @param {HTMLElement} app       contenedor del router
 * @param {() => void} paint      pinta la vista nueva (sincrono)
 * @param {{ toRegister: boolean }} opts
 */
export async function morphAuth(app, paint, { toRegister }) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const oldCard = app.querySelector(toRegister ? '.login__card' : '.register');
  if (reduce || !oldCard || typeof oldCard.animate !== 'function') {
    paint();
    return;
  }

  // --- Medidas de la pantalla que se va ---
  const from = rectOf(oldCard);
  const oldStyle = getComputedStyle(oldCard);
  const wingFrom = toRegister ? null : wingOf(oldCard);

  // --- Etapa 1: el contenido se despide; la tarjeta se queda ---
  const leaving = [...oldCard.children];
  const outside = [...app.querySelectorAll('.login__benefits')];
  const out = [
    ...leaving.map((el, i) =>
      el.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }],
        { duration: 180, delay: Math.min(i, 6) * 22, easing: EASE_IN, fill: 'forwards' },
      ),
    ),
    ...outside.map((el) =>
      el.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(14px)' }],
        { duration: 200, easing: EASE_IN, fill: 'forwards' },
      ),
    ),
  ];
  await finished(out);

  // --- Fantasma: una tarjeta identica, vacia, encima de la que se va ---
  const ghost = document.createElement('div');
  ghost.className = 'auth-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, px(from), {
    borderRadius: oldStyle.borderRadius,
    background: '#ffffff',
    boxShadow: oldStyle.boxShadow,
  });
  const wing = document.createElement('div');
  wing.className = 'auth-ghost__wing';
  ghost.appendChild(wing);
  document.body.appendChild(ghost);

  // --- Pantalla nueva, pintada pero invisible hasta que llegue el fantasma ---
  paint();
  const newCard = app.querySelector(toRegister ? '.register' : '.login__card');
  if (!newCard) {
    ghost.remove();
    return;
  }
  newCard.classList.add('is-morphed', 'morph-pending');
  const newOutside = [...app.querySelectorAll('.login__benefits')];
  newOutside.forEach((el) => { el.style.opacity = '0'; });

  const to = rectOf(newCard);
  const newStyle = getComputedStyle(newCard);
  const wingTo = toRegister ? wingOf(newCard) : null;
  const w = wingTo || wingFrom;

  // --- Etapa 2: la tarjeta crece (o se encoge) hasta su nuevo sitio ---
  const DURATION = 480;
  const grow = ghost.animate(
    [
      { ...px(from), borderRadius: oldStyle.borderRadius, boxShadow: oldStyle.boxShadow },
      { ...px(to), borderRadius: newStyle.borderRadius, boxShadow: newStyle.boxShadow },
    ],
    { duration: DURATION, easing: EASE_OUT, fill: 'forwards' },
  );

  const anims = [grow];
  if (w) {
    wing.style.background = w.background;
    const lado = w.vertical ? 'height' : 'width';
    const lleno = `${w.vertical ? w.height : w.width}px`;
    wing.classList.toggle('is-vertical', w.vertical);
    anims.push(
      wing.animate(
        toRegister
          ? [{ [lado]: '0px' }, { [lado]: lleno }]
          : [{ [lado]: lleno }, { [lado]: '0px' }],
        { duration: DURATION - 60, delay: toRegister ? 80 : 0, easing: EASE_OUT, fill: 'forwards' },
      ),
    );
  }
  // El contenido empieza a entrar cuando el fantasma va al 65% del recorrido
  // (con esta curva ya esta a pocos pixeles de su sitio): asi el panel nunca
  // se ve vacio mucho tiempo.
  await Promise.race([finished(anims), new Promise((r) => setTimeout(r, DURATION * 0.65))]);

  // --- Etapa 3: aparece la pantalla nueva y su contenido entra en cascada ---
  newCard.classList.remove('morph-pending');
  if (!toRegister) {
    [...newCard.children].forEach((el, i) =>
      el.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, delay: 40 + Math.min(i, 8) * 40, easing: EASE_OUT, fill: 'backwards' },
      ),
    );
  }
  newOutside.forEach((el) => {
    el.style.opacity = '';
    el.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, delay: 220, easing: EASE_OUT, fill: 'backwards' },
    );
  });
  const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
  fade.finished.catch(() => {}).then(() => ghost.remove());
}
