/**
 * AdminAlliesView.js
 * =============================================================================
 * PROPOSITO:
 *   Bandeja de SOLICITUDES DE ALIADOS (orden de trabajo A-03), dentro del
 *   portal del administrador.
 *
 *   Las empresas piden acceso en el formulario publico /aliados. Aqui el equipo:
 *     - filtra por origen (codigo que las trajo), estado y fecha,
 *     - mueve cada solicitud por los estados del proceso,
 *     - deja notas de cada llamada,
 *     - aprueba en un clic (crea el usuario del portal y le envia el correo
 *       para crear su contrasena),
 *     - exporta toda la base a CSV (abre en Excel).
 *
 *   El ORIGEN se muestra pero no se edita: es la base de las comisiones.
 *
 * DATOS:
 *   Habla con /api/aliados/admin (solo admin, valida la sesion en el servidor).
 *   En el demo de GitHub Pages se muestran solicitudes de ejemplo en memoria.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/formatDate.js';
import { isDeployedBundle } from '../utils/env.js';
import { showToast } from '../utils/toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';

const STATUS = {
  pendiente: { label: 'Pendiente', badge: 'badge--amber' },
  contactado: { label: 'Contactado', badge: 'badge--blue' },
  aprobado: { label: 'Aprobado', badge: 'badge--teal' },
  contrato_enviado: { label: 'Contrato enviado', badge: 'badge--violet' },
  firmado: { label: 'Firmado', badge: 'badge--green' },
  activo: { label: 'Activo', badge: 'badge--green' },
  rechazado: { label: 'Rechazado', badge: 'badge--red' },
};
const STATUS_ORDER = Object.keys(STATUS);

const CHANNEL = { ejecutivo: 'Ejecutivo', comunidad: 'Comunidad', colaboradores: 'Colaboradores' };

let cached = [];
let selectedId = '';
const filters = { q: '', status: 'todos', origin: 'todos', from: '', to: '' };

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

async function api(action, extra = {}) {
  const res = await fetch('/api/aliados/admin', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function demoItems() {
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
  return [
    { id: 'demo-1', company: 'Clínica Atlántico S.A.S.', nit: '900456789-1', contactName: 'Laura Mendoza', position: 'Gerente de talento humano', phone: '+57 300 555 0101', email: 'laura@clinicaatlantico.co', employees: '51-200', channel: 'colaboradores', origin: 'drchapman', status: 'pendiente', notes: [], history: [{ at: day(0), by: 'formulario', from: '', to: 'pendiente' }], memberId: '', createdAt: day(0) },
    { id: 'demo-2', company: 'Logística del Caribe', nit: '901234567-3', contactName: 'Andrés Pérez', position: 'Director financiero', phone: '+57 315 555 0202', email: 'aperez@logcaribe.com', employees: '11-50', channel: 'ejecutivo', origin: '', status: 'contactado', notes: [{ at: day(1), by: 'admin', text: 'Llamada inicial. Interesado en viajes de la gerencia a Miami.' }], history: [], memberId: '', createdAt: day(3) },
    { id: 'demo-3', company: 'Fundación Mar Azul', nit: '800111222-9', contactName: 'Sofía Ríos', position: 'Directora ejecutiva', phone: '+57 320 555 0303', email: 'sofia@marazul.org', employees: '201-500', channel: 'comunidad', origin: 'kaiva', status: 'activo', notes: [], history: [], memberId: 'x', createdAt: day(12) },
  ];
}

// ---------------------------------------------------------------------------
// Utilidades de vista
// ---------------------------------------------------------------------------

const statusBadge = (s) => {
  const st = STATUS[s] || { label: s, badge: 'badge--gray' };
  return `<span class="badge ${st.badge}">${escapeHtml(st.label)}</span>`;
};

const waLink = (phone) => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) digits = '57' + digits;
  return digits ? `https://wa.me/${digits}` : '';
};

// Sin tildes ni mayusculas: "fundacion" encuentra "Fundación".
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function applyFilters(items) {
  const q = fold(filters.q.trim());
  return items.filter((a) => {
    if (filters.status !== 'todos' && a.status !== filters.status) return false;
    if (filters.origin === 'directo' && a.origin) return false;
    if (filters.origin !== 'todos' && filters.origin !== 'directo' && a.origin !== filters.origin) return false;
    const day = (a.createdAt || '').slice(0, 10);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    if (q) {
      const hay = fold([a.company, a.nit, a.contactName, a.email, a.phone, a.origin].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderRows(items) {
  if (!items.length) {
    return `<tr><td colspan="7" class="empty-state">${cached.length ? 'Ninguna solicitud coincide con los filtros.' : 'Todavía no hay solicitudes. Comparte el enlace <strong>/aliados</strong> para recibir las primeras.'}</td></tr>`;
  }
  return items.map((a) => `
    <tr class="ally-row ${a.id === selectedId ? 'is-selected' : ''}" data-id="${escapeHtml(a.id)}">
      <td>${formatDate(a.createdAt)}</td>
      <td>
        <strong>${escapeHtml(a.company)}</strong>
        <div class="muted">NIT ${escapeHtml(a.nit)}</div>
      </td>
      <td>
        ${escapeHtml(a.contactName)}
        <div class="muted">${escapeHtml(a.position)}</div>
      </td>
      <td>
        ${escapeHtml(CHANNEL[a.channel] || a.channel)}
        <div class="muted">${escapeHtml(a.employees)} colaboradores</div>
      </td>
      <td>${a.origin ? `<span class="code-chip">${escapeHtml(a.origin)}</span>` : '<span class="muted">Directo</span>'}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="col-center"><button type="button" class="btn btn--ghost btn--sm" data-open="${escapeHtml(a.id)}">Gestionar</button></td>
    </tr>`).join('');
}

function renderDetail(a) {
  if (!a) return '';
  const wa = waLink(a.phone);
  const notes = (a.notes || []).slice().reverse();
  const history = (a.history || []).slice().reverse();
  const canApprove = !a.memberId && a.status !== 'rechazado';
  return `
    <div class="panel__header">
      <h2 class="panel__title">${escapeHtml(a.company)}</h2>
      <button type="button" class="btn btn--ghost btn--sm" id="close-detail">Cerrar</button>
    </div>
    <div class="ally-detail">
      <div>
        <dl class="ally-dl">
          <div><dt>NIT</dt><dd>${escapeHtml(a.nit)}</dd></div>
          <div><dt>Decisor</dt><dd>${escapeHtml(a.contactName)} · ${escapeHtml(a.position)}</dd></div>
          <div><dt>Celular</dt><dd>${escapeHtml(a.phone)}</dd></div>
          <div><dt>Correo</dt><dd><a href="mailto:${escapeHtml(a.email)}">${escapeHtml(a.email)}</a></dd></div>
          <div><dt>Colaboradores</dt><dd>${escapeHtml(a.employees)}</dd></div>
          <div><dt>Canal</dt><dd>${escapeHtml(CHANNEL[a.channel] || a.channel)}</dd></div>
          <div><dt>Origen</dt><dd>${a.origin ? `<span class="code-chip">${escapeHtml(a.origin)}</span>` : 'Directo (sin código)'} <span class="muted">· no editable</span></dd></div>
          ${a.utmSource ? `<div><dt>Campaña</dt><dd>${escapeHtml([a.utmSource, a.utmMedium, a.utmCampaign].filter(Boolean).join(' / '))}</dd></div>` : ''}
          <div><dt>Recibida</dt><dd>${formatDate(a.createdAt)}</dd></div>
          <div><dt>Acceso al portal</dt><dd>${a.memberId ? '<span class="badge badge--green">Creado</span>' : '<span class="muted">Sin crear</span>'}</dd></div>
        </dl>
        <div class="ally-quick">
          ${wa ? `<a class="btn btn--ghost btn--sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <a class="btn btn--ghost btn--sm" href="tel:${escapeHtml(a.phone)}">Llamar</a>
          <a class="btn btn--ghost btn--sm" href="mailto:${escapeHtml(a.email)}">Correo</a>
        </div>
      </div>

      <div>
        <div class="form__group">
          <label class="form__label" for="ally-status">Estado</label>
          <div class="ally-inline">
            <select id="ally-status" class="form__input">
              ${STATUS_ORDER.map((s) => `<option value="${s}" ${s === a.status ? 'selected' : ''} ${s === 'aprobado' && !a.memberId ? 'disabled' : ''}>${STATUS[s].label}</option>`).join('')}
            </select>
            <button type="button" class="btn btn--ghost" id="save-status">Guardar</button>
          </div>
          <small class="form__hint">«Aprobado» se asigna con el botón de abajo: crea el acceso al portal.</small>
        </div>
        ${canApprove ? `<button type="button" class="btn btn--primary btn--block" id="approve-btn">Aprobar y crear acceso</button>` : ''}

        <div class="form__group" style="margin-top:18px;">
          <label class="form__label" for="ally-note">Nueva nota</label>
          <textarea id="ally-note" class="form__input" rows="3" maxlength="2000" placeholder="Resumen de la llamada, próximos pasos..."></textarea>
          <div class="ally-inline" style="justify-content:flex-end;margin-top:8px;">
            <button type="button" class="btn btn--primary btn--sm" id="add-note">Agregar nota</button>
          </div>
        </div>

        <ul class="ally-notes">
          ${notes.length ? notes.map((n) => `
            <li><div class="muted">${formatDate(n.at)} · ${escapeHtml(n.by)}</div>${escapeHtml(n.text)}</li>`).join('') : '<li class="muted">Sin notas todavía.</li>'}
        </ul>
        ${history.length ? `
        <details class="ally-history">
          <summary>Historial de estados (${history.length})</summary>
          <ul>
            ${history.map((h) => `<li>${formatDate(h.at)} · ${escapeHtml(STATUS[h.to]?.label || h.to)} <span class="muted">(${escapeHtml(h.by)})</span></li>`).join('')}
          </ul>
        </details>` : ''}
      </div>
    </div>`;
}

function kpis(items) {
  const count = (list) => items.filter((a) => list.includes(a.status)).length;
  return {
    pending: count(['pendiente']),
    contacted: count(['contactado']),
    inProcess: count(['aprobado', 'contrato_enviado', 'firmado']),
    active: count(['activo']),
  };
}

// CSV con BOM y ";" como separador: Excel en espanol lo abre en columnas.
function exportCsv(items) {
  const cols = [
    ['Fecha', (a) => a.createdAt],
    ['Empresa', (a) => a.company],
    ['NIT', (a) => a.nit],
    ['Decisor', (a) => a.contactName],
    ['Cargo', (a) => a.position],
    ['Celular', (a) => a.phone],
    ['Correo', (a) => a.email],
    ['Colaboradores', (a) => a.employees],
    ['Canal', (a) => CHANNEL[a.channel] || a.channel],
    ['Origen', (a) => a.origin || 'directo'],
    ['UTM source', (a) => a.utmSource || ''],
    ['UTM medium', (a) => a.utmMedium || ''],
    ['UTM campaign', (a) => a.utmCampaign || ''],
    ['Estado', (a) => STATUS[a.status]?.label || a.status],
    ['Acceso creado', (a) => (a.memberId ? 'si' : 'no')],
    ['Notas', (a) => (a.notes || []).map((n) => `[${(n.at || '').slice(0, 10)}] ${n.text}`).join(' | ')],
    ['Consentimiento', (a) => (a.consentData === 'si' ? `si (${a.consentVersion || ''} ${a.consentAt || ''})` : '')],
  ];
  const cell = (v) => {
    const s = String(v ?? '').replace(/\r?\n/g, ' ');
    return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(([h]) => h).join(';'), ...items.map((a) => cols.map(([, get]) => cell(get(a))).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `aliados-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

export const AdminAlliesView = {
  async render() {
    const deployed = isDeployedBundle();
    let loadError = '';
    selectedId = '';
    cached = deployed ? [] : demoItems();
    if (deployed) {
      try {
        cached = (await api('list')).items || [];
      } catch (e) {
        loadError = e.message;
      }
    }
    const k = kpis(cached);
    const origins = [...new Set(cached.map((a) => a.origin).filter(Boolean))].sort();

    return `
      <style>
        .code-chip { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; letter-spacing: .04em; background: #eef2fb; color: #0a2d66; border: 1px solid #d8e0f2; border-radius: 7px; padding: 3px 9px; }
        .ally-row { cursor: pointer; }
        .ally-row.is-selected td { background: #f2f6fd; }
        .ally-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        @media (max-width: 900px) { .ally-detail { grid-template-columns: 1fr; } }
        .ally-dl { display: grid; gap: 10px; margin: 0; }
        .ally-dl > div { display: grid; grid-template-columns: 130px 1fr; gap: 10px; font-size: .9rem; }
        .ally-dl dt { color: var(--gray-500, #667386); font-weight: 600; }
        .ally-dl dd { margin: 0; color: #0a2540; word-break: break-word; }
        .ally-quick { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
        .ally-inline { display: flex; gap: 8px; align-items: center; }
        .ally-inline .form__input { flex: 1; }
        .ally-notes { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 10px; max-height: 280px; overflow: auto; }
        .ally-notes li { background: #f7f9fc; border: 1px solid #e6ecf4; border-radius: 10px; padding: 10px 12px; font-size: .88rem; white-space: pre-wrap; }
        .ally-history { margin-top: 14px; font-size: .86rem; }
        .ally-history summary { cursor: pointer; font-weight: 600; color: #0058c1; }
        .ally-history ul { margin: 8px 0 0; padding-left: 18px; line-height: 1.7; }
        .ally-dates { display: flex; gap: 6px; align-items: center; }
        .ally-dates .form__input { width: auto; }
      </style>

      <div class="qb-page-hero">
        <div>
          <h1 class="page-title">Solicitudes de aliados</h1>
          <p class="page-subtitle">Empresas que pidieron acceso en <strong>/aliados</strong>. Contáctalas, deja notas y apruébalas en un clic.</p>
        </div>
        <div class="qb-hero-kpis">
          <div class="qb-hero-kpi ${k.pending ? 'qb-hero-kpi--alert' : ''}"><strong>${k.pending}</strong><span>Pendientes</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${k.contacted}</strong><span>Contactados</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${k.inProcess}</strong><span>En proceso</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${k.active}</strong><span>Activos</span></div>
        </div>
      </div>

      ${!deployed ? `
        <section class="panel">
          <p class="empty-state">Demo: estas solicitudes son de ejemplo. En el portal real llegan desde el formulario /aliados.</p>
        </section>` : ''}

      <section class="panel" id="ally-detail-panel" hidden></section>

      <section class="panel">
        ${loadError ? `<p class="empty-state">No se pudo cargar la bandeja: ${escapeHtml(loadError)}</p>` : `
        <div class="table-toolbar">
          <input id="ally-search" class="form__input table-toolbar__search" type="search" placeholder="Buscar empresa, NIT, persona o correo..." />
          <select id="ally-status-filter" class="form__input table-toolbar__select">
            <option value="todos">Estado: todos</option>
            ${STATUS_ORDER.map((s) => `<option value="${s}">${STATUS[s].label}</option>`).join('')}
          </select>
          <select id="ally-origin-filter" class="form__input table-toolbar__select">
            <option value="todos">Origen: todos</option>
            <option value="directo">Directo (sin código)</option>
            ${origins.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
          </select>
          <div class="ally-dates">
            <input id="ally-from" type="date" class="form__input" aria-label="Desde" />
            <span class="muted">a</span>
            <input id="ally-to" type="date" class="form__input" aria-label="Hasta" />
          </div>
          <div class="table-toolbar__spacer"></div>
          <span class="table-toolbar__count" id="ally-count"></span>
          <button type="button" class="btn btn--ghost btn--sm" id="ally-export">Exportar CSV</button>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Empresa</th><th>Decisor</th><th>Canal</th>
                <th>Origen</th><th>Estado</th><th class="col-center">Acciones</th>
              </tr>
            </thead>
            <tbody id="ally-rows"></tbody>
          </table>
        </div>`}
      </section>
    `;
  },

  async afterRender() {
    const deployed = isDeployedBundle();
    const rows = document.getElementById('ally-rows');
    const detail = document.getElementById('ally-detail-panel');
    if (!rows) return;

    const paint = () => {
      const list = applyFilters(cached);
      rows.innerHTML = renderRows(list);
      const count = document.getElementById('ally-count');
      if (count) count.textContent = `${list.length} de ${cached.length}`;
    };

    const replace = (item) => {
      cached = cached.map((a) => (a.id === item.id ? item : a));
    };

    const openDetail = (id) => {
      selectedId = id;
      const a = cached.find((x) => x.id === id);
      detail.innerHTML = renderDetail(a);
      detail.hidden = !a;
      paint();
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const closeDetail = () => {
      selectedId = '';
      detail.hidden = true;
      detail.innerHTML = '';
      paint();
    };

    // En el demo las acciones se simulan en memoria.
    const run = async (action, extra) => {
      if (deployed) return (await api(action, extra)).item;
      const a = cached.find((x) => x.id === extra.id);
      const now = new Date().toISOString();
      if (action === 'status') return { ...a, status: extra.status, history: [...(a.history || []), { at: now, by: 'demo', from: a.status, to: extra.status }] };
      if (action === 'note') return { ...a, notes: [...(a.notes || []), { at: now, by: 'demo', text: extra.text }] };
      if (action === 'approve') return { ...a, status: 'aprobado', memberId: 'demo' };
      return a;
    };

    rows.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-id]');
      if (row) openDetail(row.dataset.id);
    });

    detail.addEventListener('click', async (event) => {
      const btn = event.target.closest('button');
      if (!btn || !selectedId) return;

      if (btn.id === 'close-detail') return closeDetail();

      if (btn.id === 'save-status') {
        const status = document.getElementById('ally-status').value;
        btn.disabled = true;
        try {
          replace(await run('status', { id: selectedId, status }));
          showToast(`Estado actualizado: ${STATUS[status].label}.`, 'success');
          openDetail(selectedId);
        } catch (e) {
          showToast(e.message, 'error');
        } finally {
          btn.disabled = false;
        }
        return;
      }

      if (btn.id === 'add-note') {
        const text = document.getElementById('ally-note').value.trim();
        if (!text) return showToast('Escribe la nota.', 'error');
        btn.disabled = true;
        try {
          replace(await run('note', { id: selectedId, text }));
          showToast('Nota guardada.', 'success');
          openDetail(selectedId);
        } catch (e) {
          showToast(e.message, 'error');
        } finally {
          btn.disabled = false;
        }
        return;
      }

      if (btn.id === 'approve-btn') {
        const a = cached.find((x) => x.id === selectedId);
        const ok = await confirmDialog({
          title: 'Aprobar solicitud',
          message: `<p>Se creará el acceso al portal para <strong>${escapeHtml(a.contactName)}</strong> (${escapeHtml(a.email)}) como empresa <strong>${escapeHtml(a.company)}</strong>, y le llegará un correo para crear su contraseña.</p>`,
          confirmLabel: 'Sí, aprobar',
        });
        if (!ok) return;
        btn.disabled = true;
        try {
          replace(await run('approve', { id: selectedId }));
          showToast('Acceso creado. Le enviamos el correo para crear su contraseña.', 'success', { title: 'Aprobado' });
          openDetail(selectedId);
        } catch (e) {
          showToast(e.message, 'error');
          btn.disabled = false;
        }
      }
    });

    document.getElementById('ally-search')?.addEventListener('input', (e) => { filters.q = e.target.value; paint(); });
    document.getElementById('ally-status-filter')?.addEventListener('change', (e) => { filters.status = e.target.value; paint(); });
    document.getElementById('ally-origin-filter')?.addEventListener('change', (e) => { filters.origin = e.target.value; paint(); });
    document.getElementById('ally-from')?.addEventListener('change', (e) => { filters.from = e.target.value; paint(); });
    document.getElementById('ally-to')?.addEventListener('change', (e) => { filters.to = e.target.value; paint(); });
    document.getElementById('ally-export')?.addEventListener('click', () => {
      if (!cached.length) return showToast('No hay solicitudes para exportar.', 'error');
      exportCsv(cached);
    });

    // Los filtros se reinician al entrar a la vista.
    Object.assign(filters, { q: '', status: 'todos', origin: 'todos', from: '', to: '' });
    paint();
  },
};
