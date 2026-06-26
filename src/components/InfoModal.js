/**
 * InfoModal.js
 * =============================================================================
 * Botón "?" reutilizable + ventana informativa. Sirve para explicar a fondo
 * cómo funciona algo (cómo monetiza un médico, de dónde sale el retorno, etc.)
 * sin saturar la pantalla: la info detallada queda "si quieres saber más".
 *
 * USO:
 *   - Estático (contenido del registro TOPICS):
 *       infoBtn('medico-ingresos')
 *   - Dinámico (contenido de un elemento oculto de la página):
 *       infoBtn({ target: '#mi-detalle', title: 'Título' })
 *   - Llamar bindInfoModals() una vez en afterRender (es idempotente).
 * =============================================================================
 */

// Contenido estático reutilizable.
const TOPICS = {
  'medico-ingresos': {
    title: '¿Cómo ganas como médico aliado?',
    html: `
      <p>Monetizas <b>sin operar y sin invertir</b>:</p>
      <ul>
        <li>Refieres a tu paciente y <b>CS Travel arma toda la logística</b> del viaje médico: vuelos, hospedaje, traslados y seguros, y la ejecuta de principio a fin.</li>
        <li>Tú <b>defines tu margen</b> sobre el costo logístico. El paciente paga el valor final y <b>tú ganas tu margen</b> en cada caso.</li>
        <li>Tu <b>enlace de afiliado</b> acredita automáticamente a cada paciente que llega por ti.</li>
        <li>CS Travel asume el <b>100% de la operación y el riesgo</b>; tú te llevas el crédito y la ganancia.</li>
      </ul>
      <p class="info-modal__hint">En tu panel: "Ganancias acumuladas" es lo que ya ganaste; "Generado por tu link" es el negocio total que trajo tu enlace.</p>
    `,
  },
  'medico-link': {
    title: 'Tu enlace de afiliado',
    html: `
      <p>Es tu <b>enlace personal</b> para compartir con pacientes. Quien reserve a través de él queda <b>acreditado a tu nombre</b>, y los casos que genere suman a tu cuenta.</p>
      <p>Compártelo por WhatsApp, redes o tu sitio. El indicador <b>"Generado por tu link"</b> muestra el valor total en viajes que ha traído.</p>
    `,
  },
  'empresa-niveles': {
    title: 'Tu convenio · niveles activos',
    html: `
      <div class="lvl-modal">
        <article class="lvl-card lvl-card--1">
          <div class="lvl-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div class="lvl-card__main">
            <span class="lvl-card__tag">Nivel 1 · Directivo</span>
            <strong class="lvl-card__title">Business Travel Program.</strong>
            <p class="lvl-card__desc">Para dueños y representantes legales (y su núcleo familiar primario): tarifas mayoristas netas a <b>precio de costo</b>, sin cargos administrativos de agencia.</p>
          </div>
        </article>

        <article class="lvl-card lvl-card--2">
          <div class="lvl-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div class="lvl-card__main">
            <span class="lvl-card__tag">Nivel 2 · Colaboradores</span>
            <strong class="lvl-card__title">Beneficio institucional.</strong>
            <p class="lvl-card__desc">Condiciones preferenciales, códigos privados de reserva y opciones de <b>financiación sin intereses</b> para el equipo administrativo y operativo.</p>
          </div>
        </article>

        <div class="lvl-cta">
          <span class="lvl-cta__text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <span>Los niveles se activan según tu convenio. <b>¿Quieres habilitar el Nivel 2 para tu equipo? Escríbenos.</b></span>
          </span>
          <a class="btn btn--primary btn--sm lvl-cta__btn" href="mailto:info.cstravelgroup@gmail.com?subject=${encodeURIComponent('Activar Nivel 2 · convenio CS Travel')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            Escribir ahora
          </a>
        </div>
      </div>
    `,
  },
  'empresa-retorno': {
    title: '¿Cómo se calcula tu retorno?',
    html: `
      <p>Tu retorno se calcula sobre la <b>Utilidad Neta de la Operación (UNC)</b>, no sobre la venta bruta:</p>
      <ol>
        <li>Se parte de la <b>comisión bruta</b> de la operación.</li>
        <li>Se restan <b>IVA</b>, <b>costos de pasarela de pago</b> y <b>costos operativos</b> → así queda la <b>Utilidad Neta (UNC)</b>.</li>
        <li>Se aplica tu <b>% de tramo</b> según tu volumen quincenal.</li>
      </ol>
      <p><b>Tramos:</b> Inicial (≤ $20M) 25% · Plata ($20–55M) 30% · Oro ($55–120M) 35% · Platino (+$120M) 40%.</p>
      <p class="info-modal__hint">Solo cuentan transacciones confirmadas, pagadas y sin novedad del período. Los porcentajes y costos se configuran por convenio.</p>
    `,
  },
};

let bound = false;
let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'info-modal-overlay';
  overlay.innerHTML = `
    <div class="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title">
      <div class="info-modal__head">
        <h2 class="info-modal__title" id="info-modal-title"></h2>
        <button type="button" class="info-modal__close" data-info-close aria-label="Cerrar">✕</button>
      </div>
      <div class="info-modal__body" id="info-modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function openFromButton(btn) {
  const ov = ensureOverlay();
  let title = btn.getAttribute('data-info-title') || 'Información';
  let html = '';
  const target = btn.getAttribute('data-info-target');
  const topic = btn.getAttribute('data-info');
  if (target) {
    const el = document.querySelector(target);
    if (el) html = el.innerHTML;
  } else if (topic && TOPICS[topic]) {
    title = TOPICS[topic].title;
    html = TOPICS[topic].html;
  }
  ov.querySelector('#info-modal-title').textContent = title;
  ov.querySelector('#info-modal-body').innerHTML = html;
  ov.classList.add('is-open');
}

function close() {
  overlay?.classList.remove('is-open');
}

/**
 * Botón "?" — acepta un topic (string) o un objeto { target, title, topic }.
 */
export function infoBtn(opts) {
  if (typeof opts === 'string') {
    return `<button type="button" class="info-btn" data-info="${opts}" aria-label="Más información">?</button>`;
  }
  const attrs = [];
  if (opts.topic) attrs.push(`data-info="${opts.topic}"`);
  if (opts.target) attrs.push(`data-info-target="${opts.target}"`);
  if (opts.title) attrs.push(`data-info-title="${opts.title.replace(/"/g, '&quot;')}"`);
  return `<button type="button" class="info-btn" ${attrs.join(' ')} aria-label="Más información">?</button>`;
}

/** Enlaza (una sola vez) la apertura/cierre de las ventanas informativas. */
export function bindInfoModals() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.info-btn');
    if (btn) { e.preventDefault(); openFromButton(btn); return; }
    if (e.target.closest('[data-info-close]')) { close(); return; }
    if (e.target.classList.contains('info-modal-overlay')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('is-open')) close();
  });
}
