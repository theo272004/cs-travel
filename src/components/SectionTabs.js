/**
 * SectionTabs.js
 * =============================================================================
 * Pestañas de sección del administrador. Varias páginas que antes eran
 * entradas sueltas del menú ahora viven dentro de una sola sección:
 *
 *   Operaciones  = Lista · Tablero · Cotizaciones
 *   Aliados      = Solicitudes · Empresas · Médicos · Códigos
 *   Comunicación = Banners · Correos
 *
 * Cada pestaña sigue siendo su propia ruta (enlaces directos, guía y buscador
 * funcionan igual); el menú lateral muestra una sola entrada por sección.
 *
 * Movimiento: la píldora azul se desliza desde la pestaña anterior hasta la
 * nueva (se recuerda cuál estaba activa), así se nota de dónde viene el cambio.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';

export const SECTIONS = {
  operaciones: [
    { label: 'Lista', hash: '#/admin/requests' },
    { label: 'Tablero', hash: '#/admin/kanban' },
    { label: 'Cotizaciones', hash: '#/admin/quotes' },
  ],
  aliados: [
    { label: 'Solicitudes de alta', hash: '#/admin/allies' },
    { label: 'Empresas', hash: '#/admin/companies' },
    { label: 'Médicos', hash: '#/admin/doctors' },
    { label: 'Códigos', hash: '#/admin/codes' },
  ],
  comunicacion: [
    { label: 'Banners', hash: '#/admin/banners' },
    { label: 'Correos', hash: '#/admin/emails' },
  ],
};

const LAST_KEY = 'cs_section_tab';

/** HTML de las pestañas de una sección, con la actual marcada. */
export function SectionTabs(section, activeHash) {
  const tabs = SECTIONS[section] || [];
  const active = Math.max(0, tabs.findIndex((t) => t.hash === activeHash));
  return `
    <nav class="section-tabs" data-section="${escapeHtml(section)}" data-active="${escapeHtml(active)}" aria-label="Secciones">
      <span class="section-tabs__pill" aria-hidden="true"></span>
      ${tabs.map((t, i) => `
        <a href="${escapeHtml(t.hash)}" class="section-tabs__tab${i === active ? ' is-active' : ''}"${i === active ? ' aria-current="page"' : ''}>${escapeHtml(t.label)}</a>`).join('')}
    </nav>`;
}

/**
 * Coloca la píldora bajo la pestaña activa. Si antes estaba en otra pestaña de
 * la misma sección, arranca allí y se desliza (sin movimiento si la persona
 * pidió reducirlo).
 */
export function bindSectionTabs(root = document) {
  const nav = root.querySelector('.section-tabs');
  if (!nav) return;
  const pill = nav.querySelector('.section-tabs__pill');
  const tabs = [...nav.querySelectorAll('.section-tabs__tab')];
  const active = Number(nav.dataset.active) || 0;
  const place = (i) => {
    const el = tabs[i];
    if (!el) return;
    pill.style.width = `${el.offsetWidth}px`;
    pill.style.transform = `translateX(${el.offsetLeft}px)`;
  };
  let prev = null;
  try {
    const last = JSON.parse(sessionStorage.getItem(LAST_KEY) || 'null');
    if (last && last.section === nav.dataset.section) prev = last.index;
    sessionStorage.setItem(LAST_KEY, JSON.stringify({ section: nav.dataset.section, index: active }));
  } catch { /* sin almacenamiento: sin deslizamiento */ }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prev != null && prev !== active && !reduce) {
    pill.style.transition = 'none';
    place(prev);
    void pill.offsetWidth;
    pill.style.transition = '';
  }
  requestAnimationFrame(() => place(active));
  // Mantenerla en su sitio si cambia el ancho (fuentes que cargan, giro del celular).
  const ro = new ResizeObserver(() => { pill.style.transition = 'none'; place(active); void pill.offsetWidth; pill.style.transition = ''; });
  ro.observe(nav);
}
