/*
 * =============================================================================
 * AdminLeadsView.js
 * =============================================================================
 * PROPOSITO:
 *   Solicitudes que llegan por los formularios del sitio y del registro. Antes
 *   solo se veian en Wix: el equipo no tenia desde el portal quien escribio ni
 *   de que aliado o campana venia (trazabilidad, I-03).
 *
 *   Solo lectura y solo para administradores (portalData.ts lo aplica).
 * =============================================================================
 */
import { apiService } from '../services/apiService.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/formatDate.js';
import { downloadCsv } from '../utils/csv.js';
import { SectionTabs, bindSectionTabs } from '../components/SectionTabs.js';

const SOURCE_LABEL = {
  ally_application: 'Registro de aliado',
  website_quote_form: 'Formulario web',
};

const leadDate = (l) => l.consentAt || l.createdAt || l._createdDate || '';
const sourceOf = (l) => SOURCE_LABEL[l.source] || l.source || 'Sitio web';
const originOf = (l) => String(l.origin || '').trim();

let leads = [];
let loadError = '';

function matches(l, q, origin) {
  if (origin === 'con' && !originOf(l)) return false;
  if (origin === 'sin' && originOf(l)) return false;
  if (origin !== 'todos' && origin !== 'con' && origin !== 'sin' && originOf(l) !== origin) return false;
  if (!q) return true;
  return [l.name, l.email, l.phone, l.organization, l.origin, l.utmCampaign]
    .some((v) => String(v || '').toLowerCase().includes(q));
}

function rowHtml(l) {
  const origin = originOf(l);
  const contact = [l.email, l.phone].filter(Boolean).map(escapeHtml).join(' · ');
  const campaign = [l.utmSource, l.utmCampaign].filter(Boolean).map(escapeHtml).join(' · ');
  return `
    <li class="lead-row">
      <div class="lead-row__main">
        <strong>${escapeHtml(l.name || 'Sin nombre')}</strong>
        ${l.organization ? `<span>${escapeHtml(l.organization)}</span>` : ''}
        <span class="muted">${contact || 'Sin datos de contacto'}</span>
      </div>
      <div class="lead-row__meta">
        <span class="badge ${origin ? 'badge--teal' : 'badge--outline'}">${origin ? `Aliado: ${escapeHtml(origin)}` : 'Directo'}</span>
        <span class="muted">${escapeHtml(sourceOf(l))} · ${formatDate(leadDate(l))}</span>
        ${campaign ? `<span class="muted">Campaña: ${campaign}</span>` : ''}
      </div>
      ${l.summary ? `<details class="lead-row__more"><summary>Ver detalle</summary><p>${escapeHtml(l.summary)}</p></details>` : ''}
    </li>`;
}

function listHtml(items) {
  if (!items.length) return '<p class="empty-state">No hay solicitudes con ese filtro.</p>';
  return `<ul class="lead-list">${items.map(rowHtml).join('')}</ul>`;
}

export const AdminLeadsView = {
  async render() {
    loadError = '';
    try {
      const rows = await apiService.get('leads');
      leads = (rows || []).slice().sort((a, b) => String(leadDate(b)).localeCompare(String(leadDate(a))));
    } catch (error) {
      leads = [];
      loadError = error.message || 'No se pudo cargar.';
    }
    const origins = [...new Set(leads.map(originOf).filter(Boolean))].sort();
    const conAliado = leads.filter(originOf).length;
    return `
      <style>
        .lead-list { list-style: none; margin: 0; padding: 0; }
        .lead-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; padding: 14px 0; border-bottom: 1px solid #e6ecf4; }
        .lead-row:last-child { border-bottom: 0; }
        .lead-row__main, .lead-row__meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
        .lead-row__meta { align-items: flex-start; }
        .lead-row__more { grid-column: 1 / -1; font-size: .88rem; }
        .lead-row__more summary { cursor: pointer; color: #0058c1; font-weight: 600; }
        .lead-row__more p { margin: 8px 0 0; white-space: pre-line; }
        .lead-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 8px; }
        .lead-filters .form__input { flex: 1 1 200px; max-width: 340px; }
        @media (max-width: 768px) { .lead-row { grid-template-columns: 1fr; } }
      </style>

      ${SectionTabs('operaciones', '#/admin/leads')}
      <div class="qb-page-hero">
        <div>
          <h1 class="page-title">Solicitudes web</h1>
          <p class="page-subtitle">Quién escribió por el sitio o se registró, y de qué aliado o campaña viene.</p>
        </div>
        <div class="qb-hero-kpis">
          <div class="qb-hero-kpi"><strong>${leads.length}</strong><span>Total</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${conAliado}</strong><span>Por aliado</span></div>
        </div>
      </div>

      <section class="panel">
        ${loadError ? `<p class="empty-state">No se pudo cargar la lista: ${escapeHtml(loadError)}</p>` : `
        <div class="lead-filters">
          <input id="lead-q" class="form__input" type="search" placeholder="Buscar nombre, correo, empresa…" aria-label="Buscar solicitud" />
          <select id="lead-origin" class="form__input" style="flex:0 1 200px" aria-label="Filtrar por origen">
            <option value="todos">Origen: todos</option>
            <option value="con">Con aliado</option>
            <option value="sin">Directo</option>
            ${origins.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
          </select>
          <span class="muted" id="lead-count">${leads.length} de ${leads.length}</span>
          <button type="button" class="btn btn--ghost btn--sm" id="lead-csv">Exportar CSV</button>
        </div>
        <div id="lead-rows">${listHtml(leads)}</div>`}
      </section>`;
  },

  async afterRender() {
    bindSectionTabs();
    const q = document.getElementById('lead-q');
    const origin = document.getElementById('lead-origin');
    if (!q || !origin) return;
    const filtered = () => leads.filter((l) => matches(l, q.value.trim().toLowerCase(), origin.value));
    const paint = () => {
      const items = filtered();
      document.getElementById('lead-rows').innerHTML = listHtml(items);
      document.getElementById('lead-count').textContent = `${items.length} de ${leads.length}`;
    };
    q.addEventListener('input', paint);
    origin.addEventListener('change', paint);
    document.getElementById('lead-csv')?.addEventListener('click', () => {
      downloadCsv(`solicitudes-web-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['Fecha', (l) => leadDate(l)],
        ['Nombre', (l) => l.name],
        ['Correo', (l) => l.email],
        ['Teléfono', (l) => l.phone],
        ['Empresa', (l) => l.organization],
        ['Tipo', (l) => sourceOf(l)],
        ['Origen', (l) => originOf(l) || 'Directo'],
        ['Fuente de campaña', (l) => l.utmSource],
        ['Campaña', (l) => l.utmCampaign],
        ['Página de entrada', (l) => l.landingPage],
      ], filtered());
    });
  },
};
