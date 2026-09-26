/**
 * AllyFlight.js
 * =============================================================================
 * PROPOSITO:
 *   La ruta de vuelo del registro de aliados. Es el mismo motivo del hero de
 *   cstravelgroup.com (ruta punteada dorada, linea solida que se dibuja detras
 *   y el avion dorado que la recorre), usado aqui como barra de progreso:
 *
 *     COL ── Perfil ── Beneficio ── ... ── Registro ── MUNDO
 *
 *   Cada cambio de paso hace volar el avion de una parada a otra; al enviar el
 *   registro, el avion despega fuera de la ruta.
 *
 * COMO SE MUEVE:
 *   Sin librerias: el avion se ubica en cada cuadro con getPointAtLength() y
 *   su angulo sale de la tangente de la curva, igual que MotionPath de GSAP en
 *   el sitio. Un vuelo nuevo arranca desde donde va el avion (no salta si se
 *   hace clic a mitad de camino). Con prefers-reduced-motion todo es inmediato.
 *
 * LEGIBILIDAD:
 *   Los puntos de parada son pequenos y se apagan cuando el avion pasa sobre
 *   ellos: la silueta del avion nunca queda encima de un punto. El avion lleva
 *   un contorno del color del panel para despegarse de la linea dorada.
 * =============================================================================
 */

// Misma curva suave del sitio, en horizontal y con dos ondas.
const ROUTE = 'M 16 70 C 90 18, 150 18, 210 48 S 330 96, 400 58 S 520 14, 604 44';
// Despegue: sigue la tangente del final y sube fuera del panel.
const TAKEOFF = 'M 590 38 C 640 30, 690 -12, 740 -70';

// Icono de avion del hero de cstravelgroup.com (nariz hacia la derecha).
const PLANE = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';
const PLANE_SCALE = 1.2;
const DOT_R = 3;

export const EASE_FLIGHT = 'cubic-bezier(0.16, 0.84, 0.26, 1)';
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeIn = (t) => t * t * t;

export const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Interpolacion por cuadros. Devuelve { promise, cancel }. cancel() deja el
 * valor donde iba y resuelve la promesa (quien espera no se queda colgado).
 */
export function tween(duration, ease, onUpdate) {
  let raf = 0;
  let done;
  const promise = new Promise((resolve) => { done = resolve; });
  if (prefersReducedMotion() || duration <= 0) {
    onUpdate(1);
    done();
    return { promise, cancel() {} };
  }
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    onUpdate(ease(t));
    if (t < 1) raf = requestAnimationFrame(frame);
    else done();
  };
  raf = requestAnimationFrame(frame);
  return { promise, cancel() { cancelAnimationFrame(raf); done(); } };
}

/** Paradas repartidas a lo largo de la ruta, dejando aire en los extremos. */
const stopFractions = (n) => Array.from({ length: n }, (_, i) => 0.03 + (0.94 * i) / Math.max(1, n - 1));

export function renderFlightRoute(labels) {
  return `
    <div class="flight" data-flight>
      <svg class="flight__svg" viewBox="0 0 620 120" aria-hidden="true" focusable="false">
        <path class="flight__route" d="${ROUTE}" />
        <path class="flight__active" d="${ROUTE}" />
        <path class="flight__takeoff" d="${TAKEOFF}" />
        ${labels.map((_, i) => `<circle class="flight__dot" data-dot="${i}" r="${DOT_R}" />`).join('')}
        <g class="flight__plane">
          <g class="flight__bob"><path d="${PLANE}" transform="rotate(90) translate(-12 -12)" /></g>
        </g>
      </svg>
      <span class="flight__end flight__end--from">COL</span>
      <span class="flight__end flight__end--to">MUNDO</span>
      <ol class="flight__stops">
        ${labels.map((label, i) => `
          <li><button type="button" class="flight__stop" data-flight-stop="${i}"><span>${label}</span></button></li>`).join('')}
      </ol>
    </div>`;
}

/**
 * Conecta la ruta ya pintada. onStop(i) se llama al hacer clic en una parada.
 */
export function createFlight(host, { onStop } = {}) {
  const svg = host.querySelector('.flight__svg');
  const route = host.querySelector('.flight__route');
  const active = host.querySelector('.flight__active');
  const takeoff = host.querySelector('.flight__takeoff');
  const plane = host.querySelector('.flight__plane');
  const dots = [...host.querySelectorAll('.flight__dot')];
  const stops = [...host.querySelectorAll('[data-flight-stop]')];
  const STOP_AT = stopFractions(dots.length);
  const L = route.getTotalLength();
  const T = takeoff.getTotalLength();
  const lenAt = (i) => L * STOP_AT[i];
  const dotPoints = STOP_AT.map((f) => route.getPointAtLength(L * f));

  let pos = 0;          // largo recorrido por el avion
  let current = 0;      // parada actual
  let flying = null;    // vuelo en curso

  active.style.strokeDasharray = `${L} ${L}`;

  const angleAt = (path, len, total) => {
    const a = path.getPointAtLength(Math.max(0, len - 1));
    const b = path.getPointAtLength(Math.min(total, len + 1));
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };

  // Cada punto se apaga cuando el avion lo tiene encima y vuelve a aparecer
  // cuando ya paso: la silueta del avion siempre se lee completa.
  const clearDots = (p, planeOpacity = 1) => {
    dotPoints.forEach((d, k) => {
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      const f = planeOpacity < 1 ? 1 : Math.min(1, Math.max(0, (dist - 10) / 16));
      dots[k].style.opacity = f.toFixed(3);
      dots[k].setAttribute('r', (DOT_R * (0.4 + 0.6 * f)).toFixed(2));
    });
  };

  const place = (len, { path = route, total = L, scale = PLANE_SCALE, opacity = 1 } = {}) => {
    const p = path.getPointAtLength(len);
    plane.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${angleAt(path, len, total).toFixed(2)}) scale(${scale.toFixed(3)})`);
    plane.style.opacity = opacity;
    if (path === route) {
      active.style.strokeDashoffset = `${L - len}`;
      clearDots(p);
    } else {
      clearDots(p, opacity - 1);
    }
  };

  // Paradas: posicion en % sobre la curva, para que los botones queden
  // exactamente debajo de cada punto a cualquier ancho.
  const vb = svg.viewBox.baseVal;
  dotPoints.forEach((p, i) => {
    dots[i].setAttribute('cx', p.x);
    dots[i].setAttribute('cy', p.y);
    stops[i].parentElement.style.setProperty('--x', `${(p.x / vb.width) * 100}%`);
  });

  const paintStops = (i) => {
    dots.forEach((d, k) => {
      d.classList.toggle('is-done', k < i);
      d.classList.toggle('is-current', k === i);
    });
    stops.forEach((s, k) => {
      s.classList.toggle('is-done', k < i);
      s.classList.toggle('is-current', k === i);
      if (k === i) s.setAttribute('aria-current', 'step');
      else s.removeAttribute('aria-current');
    });
  };

  stops.forEach((s, k) => {
    s.addEventListener('click', () => onStop?.(k));
    // Al pasar sobre una parada, su punto crece: se ve a donde volaria.
    s.addEventListener('pointerenter', () => dots[k].classList.add('is-hover'));
    s.addEventListener('pointerleave', () => dots[k].classList.remove('is-hover'));
  });

  place(lenAt(0));
  pos = lenAt(0);
  paintStops(0);

  return {
    get current() { return current; },

    /** Cambia los nombres de las paradas (p. ej. "Retorno" o "Ganancia"). */
    setLabels(labels) {
      stops.forEach((s, k) => { if (labels[k]) s.querySelector('span').textContent = labels[k]; });
    },

    /** Vuela hasta la parada i. La duracion crece con las paradas que cruza. */
    goTo(i) {
      flying?.cancel();
      current = i;
      paintStops(i);
      const from = pos;
      const to = lenAt(i);
      const legs = Math.abs(to - from) / (L * (STOP_AT[1] - STOP_AT[0]));
      host.classList.add('is-flying');
      flying = tween(560 + Math.min(3, legs) * 170, easeInOut, (e) => {
        pos = from + (to - from) * e;
        place(pos);
        if (e === 1) host.classList.remove('is-flying');
      });
      return flying.promise;
    },

    /** Recorre lo que falta de la ruta y despega fuera del panel. */
    async takeOff() {
      flying?.cancel();
      paintStops(dots.length);
      host.classList.add('is-departing', 'is-flying');
      const from = pos;
      flying = tween(700, easeInOut, (e) => {
        pos = from + (L - from) * e;
        place(pos);
      });
      await flying.promise;
      flying = tween(900, easeIn, (e) => {
        place(T * e, { path: takeoff, total: T, scale: PLANE_SCALE * (1 + e * 1.2), opacity: 1 - Math.max(0, e - 0.55) / 0.45 });
      });
      await flying.promise;
      host.classList.add('is-departed');
    },
  };
}
