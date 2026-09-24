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
 *     - exporta toda la base a CSV (abre en Excel),
 *     - activa al aliado (A-05): le asigna su codigo de marca, su enlace
 *       cstravelgroup.com/codigo y un QR descargable para imprimir,
 *     - CRM ligero (A-08, alcance cerrado): recordatorio de siguiente accion con
 *       alerta al vencer, etiquetas libres, responsable, vista de contactos sin
 *       actividad y tablero con arrastre entre estados.
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
import { authService } from '../services/authService.js';
import { DEMO_ALLY_REQUESTS_KEY } from './RegisterView.js';
import { drawPartnerQr as drawQr, partnerLink as shortLink, downloadCanvas } from '../utils/partnerQr.js';

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

// Paginas a las que puede llevar el enlace del aliado.
const TARGETS = { '/': 'Inicio', '/empresas': 'Empresas', '/medicos': 'Médicos', '/reservas': 'Reservas', '/contacto': 'Contacto' };


// ---------------------------------------------------------------------------
// Estandar de codificacion AVP (anexo de la orden de trabajo). Espejo de la
// validacion del servidor: el codigo es la MARCA del aliado, 4 a 10
// caracteres en minuscula, sin tildes, espacios, guiones ni numeros correlativos.
// ---------------------------------------------------------------------------
const RESERVED = ['aliados', 'pago', 'pagar', 'portal', 'empresas', 'medicos', 'contacto', 'reservas', 'terminos', 'privacidad', 'reembolso', 'accesibilidad', 'api', 'admin', 'assets', 'css', 'js', 'login', 'cstravel', 'cstravelgroup', 'inicio', 'index'];
const STOP = ['sas', 'sa', 'ltda', 'de', 'la', 'el', 'los', 'las', 'y', 'grupo', 'group', 'the', 'fundacion', 'clinica', 'empresa'];

function suggestCode(company) {
  const words = String(company || '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter((w) => w && !STOP.includes(w) && !/^\d+$/.test(w));
  const first = words[0] || '';
  return first.length >= 4 ? first.slice(0, 10) : words.join('').slice(0, 10);
}

function codeError(code) {
  if (!/^[a-z0-9]+$/.test(code)) return 'Solo letras minúsculas y números: sin tildes, espacios, guiones ni guiones bajos.';
  if (code.length < 4 || code.length > 10) return 'El código debe tener entre 4 y 10 caracteres.';
  if (!/^[a-z]/.test(code)) return 'El código debe empezar por una letra.';
  if (/\d{2,}$/.test(code) || /(19|20)\d\d/.test(code)) return 'Sin números correlativos ni años: usa la marca del aliado.';
  if (RESERVED.includes(code)) return 'Ese nombre está reservado por una página del sitio.';
  return '';
}


let cached = [];
let selectedId = '';
const FILTER_DEFAULTS = { q: '', status: 'todos', origin: 'todos', from: '', to: '', owner: 'todos', idle: '0', due: false };
const filters = { ...FILTER_DEFAULTS };
let viewMode = 'list'; // list | board

// Estados cerrados: ya no necesitan seguimiento comercial.
const CLOSED = ['activo', 'rechazado'];
// Fecha LOCAL (no UTC): en Colombia, despues de las 7 p. m. UTC ya es "manana".
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Una fecha sola ("2026-09-18") se lee como medianoche UTC y en Colombia se veria
// como el dia anterior: la anclamos al mediodia.
const fmtDay = (d) => (d ? formatDate(`${d}T12:00:00`) : '-');
const isOverdue = (a) => Boolean(a.nextActionAt) && a.nextActionAt <= today() && !CLOSED.includes(a.status);
const idleDays = (a) => {
  const last = Date.parse(a.updatedAt || a.createdAt || '');
  return Number.isFinite(last) ? Math.floor((Date.now() - last) / 86400000) : 0;
};
const me = () => String(authService.getSession()?.email || '').toLowerCase();

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

/** Solicitudes hechas desde el registro del portal en este navegador (demo). */
function demoRegistered() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_ALLY_REQUESTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function demoItems() {
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
  return [
    ...demoRegistered(),
    { id: 'demo-1', company: 'Clínica Atlántico S.A.S.', nit: '900456789-1', contactName: 'Laura Mendoza', position: 'Gerente de talento humano', phone: '+57 300 555 0101', email: 'laura@clinicaatlantico.co', employees: '51-200', channel: 'colaboradores', origin: 'drchapman', status: 'pendiente', nextAction: 'Primera llamada', nextActionAt: day(1).slice(0, 10), tags: ['salud', 'prioridad alta'], owner: 'admin@cstravel.com', notes: [], history: [{ at: day(0), by: 'formulario', from: '', to: 'pendiente' }], memberId: '', createdAt: day(0) },
    { id: 'demo-2', company: 'Logística del Caribe', nit: '901234567-3', contactName: 'Andrés Pérez', position: 'Director financiero', phone: '+57 315 555 0202', email: 'aperez@logcaribe.com', employees: '11-50', channel: 'ejecutivo', origin: '', status: 'contactado', nextAction: 'Enviar propuesta', nextActionAt: day(-2).slice(0, 10), tags: ['logística'], owner: '', updatedAt: day(20), notes: [{ at: day(1), by: 'admin', text: 'Llamada inicial. Interesado en viajes de la gerencia a Miami.' }], history: [], memberId: '', createdAt: day(3) },
    { id: 'demo-3', company: 'Fundación Mar Azul', nit: '800111222-9', contactName: 'Sofía Ríos', position: 'Directora ejecutiva', phone: '+57 320 555 0303', email: 'sofia@marazul.org', employees: '201-500', channel: 'comunidad', origin: 'kaiva', status: 'activo', notes: [], history: [], memberId: 'x', partnerCode: 'marazul', partnerTarget: '/', createdAt: day(12) },
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
    if (filters.owner === 'sin' && a.owner) return false;
    if (filters.owner !== 'todos' && filters.owner !== 'sin' && a.owner !== filters.owner) return false;
    if (Number(filters.idle) > 0 && (CLOSED.includes(a.status) || idleDays(a) < Number(filters.idle))) return false;
    if (filters.due && !isOverdue(a)) return false;
    if (q) {
      const hay = fold([a.company, a.nit, a.contactName, a.email, a.phone, a.origin, ...(a.tags || [])].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function tagChips(tags) {
  if (!tags?.length) return '';
  return `<div class="ally-tags">${tags.map((t) => `<span class="ally-tag">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function nextActionCell(a) {
  if (CLOSED.includes(a.status)) return '<span class="muted">—</span>';
  if (!a.nextActionAt) {
    const idle = idleDays(a);
    return `<span class="muted">Sin programar${idle >= 7 ? ` · ${idle} d sin actividad` : ''}</span>`;
  }
  const overdue = isOverdue(a);
  return `
    <span class="badge ${overdue ? 'badge--red' : 'badge--blue'}">${overdue ? 'Vencida' : 'Programada'} · ${fmtDay(a.nextActionAt)}</span>
    ${a.nextAction ? `<div class="muted" style="margin-top:4px;">${escapeHtml(a.nextAction)}</div>` : ''}
    ${a.owner ? `<div class="muted">${escapeHtml(a.owner.split('@')[0])}</div>` : ''}`;
}

function renderBoard(items) {
  return `
    <div class="kanban-board ally-board">
      ${STATUS_ORDER.map((st, i) => {
        const col = items.filter((a) => a.status === st);
        return `
          <article class="kanban-column" data-status="${st}" data-col-index="${i}">
            <header class="kanban-column__header"><h2>${STATUS[st].label}</h2><span>${col.length}</span></header>
            <div class="kanban-column__body">
              ${col.map((a) => `
                <div class="kanban-card ${isOverdue(a) ? 'ally-card--due' : ''}" draggable="true" data-id="${escapeHtml(a.id)}">
                  <div class="kanban-card__top">
                    <strong>${escapeHtml(a.company)}</strong>
                    ${a.origin ? `<span class="code-chip" style="font-size:.7rem;">${escapeHtml(a.origin)}</span>` : ''}
                  </div>
                  <p class="kanban-card__route muted">${escapeHtml(a.contactName)} · ${escapeHtml(CHANNEL[a.channel] || a.channel)}</p>
                  ${tagChips(a.tags)}
                  ${!CLOSED.includes(a.status) && a.nextActionAt ? `<span class="badge ${isOverdue(a) ? 'badge--red' : 'badge--blue'}">${escapeHtml(a.nextAction || 'Seguimiento')} · ${fmtDay(a.nextActionAt)}</span>` : ''}
                  <select class="form__input only-mobile" data-board-status="${escapeHtml(a.id)}" aria-label="Cambiar estado">
                    ${STATUS_ORDER.map((o) => `<option value="${o}" ${o === a.status ? 'selected' : ''}>${STATUS[o].label}</option>`).join('')}
                  </select>
                </div>`).join('') || '<p class="muted" style="font-size:.82rem;text-align:center;margin:12px 0;">Sin solicitudes</p>'}
            </div>
          </article>`;
      }).join('')}
    </div>`;
}

function renderRows(items) {
  if (!items.length) {
    return `<tr><td colspan="8" class="empty-state">${cached.length ? 'Ninguna solicitud coincide con los filtros.' : 'Todavía no hay solicitudes. Comparte el enlace <strong>/aliados</strong> para recibir las primeras.'}</td></tr>`;
  }
  return items.map((a) => `
    <tr class="ally-row ${a.id === selectedId ? 'is-selected' : ''}" data-id="${escapeHtml(a.id)}">
      <td>${formatDate(a.createdAt)}</td>
      <td>
        <strong>${escapeHtml(a.company)}</strong>
        <div class="muted">NIT ${escapeHtml(a.nit)}</div>
        ${tagChips(a.tags)}
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
      <td>${nextActionCell(a)}</td>
      <td class="col-center"><button type="button" class="btn btn--ghost btn--sm" data-open="${escapeHtml(a.id)}">Gestionar</button></td>
    </tr>`).join('');
}

function renderDetail(a) {
  if (!a) return '';
  const wa = waLink(a.phone);
  const notes = (a.notes || []).slice().reverse();
  const history = (a.history || []).slice().reverse();
  const canApprove = !a.memberId && a.status !== 'rechazado';
  const suggestion = suggestCode(a.company);
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
              ${STATUS_ORDER.map((s) => `<option value="${s}" ${s === a.status ? 'selected' : ''} ${(s === 'aprobado' && !a.memberId) || (s === 'activo' && !a.partnerCode) ? 'disabled' : ''}>${STATUS[s].label}</option>`).join('')}
            </select>
            <button type="button" class="btn btn--ghost" id="save-status">Guardar</button>
          </div>
          <small class="form__hint">«Aprobado» crea el acceso al portal y «Activo» asigna el código: se hacen con los botones de abajo.</small>
        </div>
        ${canApprove ? `<button type="button" class="btn btn--primary btn--block" id="approve-btn">Aprobar y crear acceso</button>` : ''}

        <div class="ally-code">
          <h3 class="ally-code__title">Código y enlace del aliado</h3>
          ${a.partnerCode ? `
            <div class="ally-code__row">
              <span class="code-chip">${escapeHtml(a.partnerCode)}</span>
              <span class="muted">lleva a ${escapeHtml(TARGETS[a.partnerTarget] || 'Inicio')}</span>
            </div>
            <div class="ally-code__link"><code>${escapeHtml(shortLink(a.partnerCode))}</code></div>
            <div class="ally-qr" id="ally-qr"><span class="muted">Generando QR…</span></div>
            <div class="ally-quick">
              <button type="button" class="btn btn--ghost btn--sm" id="copy-link">Copiar enlace</button>
              <button type="button" class="btn btn--primary btn--sm" id="download-qr">Descargar QR (PNG)</button>
            </div>` : a.memberId ? `
            <p class="muted" style="margin:0 0 10px;">Al activarlo se crea su enlace corto y su QR. Usa la marca reconocible del aliado, no la razón social.</p>
            <div class="form__group">
              <label class="form__label" for="ally-code">Código</label>
              <div class="ally-inline">
                <span class="muted">cstravelgroup.com/</span>
                <input id="ally-code" class="form__input" maxlength="10" value="${escapeHtml(suggestion)}" autocomplete="off" spellcheck="false" />
              </div>
              <small class="form__hint" id="ally-code-hint">4 a 10 letras en minúscula. Ej.: angopi, aportes.</small>
            </div>
            <div class="form__group">
              <label class="form__label" for="ally-target">Lleva a</label>
              <select id="ally-target" class="form__input">
                ${Object.entries(TARGETS).map(([path, label]) => `<option value="${path}">${label}</option>`).join('')}
              </select>
            </div>
            <button type="button" class="btn btn--primary btn--block" id="activate-btn">Activar aliado</button>`
            : '<p class="muted" style="margin:0;">Se habilita cuando la solicitud esté aprobada.</p>'}
        </div>

        <div class="ally-code">
          <h3 class="ally-code__title">Seguimiento</h3>
          <div class="form__group">
            <label class="form__label" for="fu-action">Siguiente acción</label>
            <input id="fu-action" class="form__input" maxlength="200" value="${escapeHtml(a.nextAction || '')}" placeholder="Ej: llamar para presentar la propuesta" />
          </div>
          <div class="ally-inline" style="align-items:flex-start;">
            <div class="form__group" style="flex:1;">
              <label class="form__label" for="fu-date">Fecha</label>
              <input id="fu-date" type="date" class="form__input" value="${escapeHtml(a.nextActionAt || '')}" />
            </div>
            <div class="form__group" style="flex:1;">
              <label class="form__label" for="fu-owner">Responsable</label>
              <input id="fu-owner" class="form__input" list="fu-owners" maxlength="120" value="${escapeHtml(a.owner || '')}" placeholder="correo del equipo" />
              <datalist id="fu-owners">${[...new Set([me(), ...cached.map((x) => x.owner)].filter(Boolean))].map((o) => `<option value="${escapeHtml(o)}"></option>`).join('')}</datalist>
            </div>
          </div>
          <div class="form__group">
            <label class="form__label" for="fu-tags">Etiquetas</label>
            <input id="fu-tags" class="form__input" maxlength="300" value="${escapeHtml((a.tags || []).join(', '))}" placeholder="sector, prioridad... separadas por coma" />
          </div>
          <div class="ally-inline" style="justify-content:space-between;">
            ${isOverdue(a) ? '<span class="badge badge--red">Acción vencida</span>' : '<span></span>'}
            <button type="button" class="btn btn--primary btn--sm" id="save-followup">Guardar seguimiento</button>
          </div>
        </div>

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
        <details class="ally-history" id="ally-emails">
          <summary>Correos enviados</summary>
          <ul id="ally-emails-list"><li class="muted">Cargando…</li></ul>
        </details>
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
    due: items.filter(isOverdue).length,
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
    ['Código de aliado', (a) => a.partnerCode || ''],
    ['Enlace', (a) => (a.partnerCode ? shortLink(a.partnerCode) : '')],
    ['Responsable', (a) => a.owner || ''],
    ['Etiquetas', (a) => (a.tags || []).join(', ')],
    ['Siguiente acción', (a) => a.nextAction || ''],
    ['Fecha siguiente acción', (a) => a.nextActionAt || ''],
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
    const owners = [...new Set(cached.map((a) => a.owner).filter(Boolean))].sort();

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
        .ally-code { margin-top: 18px; padding: 16px; border: 1px solid #e6ecf4; border-radius: 14px; background: #fbfcfe; }
        .ally-code__title { margin: 0 0 12px; font-size: .95rem; font-weight: 800; color: #061953; }
        .ally-code__row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .ally-code__link { margin-top: 10px; }
        .ally-code__link code { background: #fff; border: 1px solid #d8e0f2; border-radius: 8px; padding: 5px 9px; color: #0a2540; word-break: break-all; font-size: .86rem; }
        .ally-qr { display: grid; place-items: center; margin-top: 14px; padding: 12px; background: #fff; border: 1px dashed #cfdbe8; border-radius: 12px; min-height: 120px; }
        .ally-qr__canvas { width: 180px; height: auto; display: block; }
        .ally-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
        .ally-tag { font-size: .7rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #eef2fb; color: #45546b; }
        .ally-card--due { border-color: #f3b4b4; box-shadow: 0 0 0 1px #f3b4b4; }
        .ally-board { margin-top: 4px; }
        .ally-board .kanban-column { flex-basis: 230px; }
        .ally-board .kanban-card__top strong { font-size: .9rem; color: #0a2540; }
        .ally-mode { display: inline-flex; border: 1px solid #d8e0f2; border-radius: 10px; overflow: hidden; }
        .ally-mode button { border: 0; background: #fff; padding: 7px 14px; font-weight: 700; font-size: .84rem; color: #45546b; cursor: pointer; }
        .ally-mode button.is-active { background: #0a2d66; color: #fff; }
        .ally-due-toggle { display: inline-flex; gap: 6px; align-items: center; font-size: .86rem; font-weight: 600; color: #45546b; white-space: nowrap; }
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
          <div class="qb-hero-kpi qb-hero-kpi--sep ${k.due ? 'qb-hero-kpi--alert' : ''}"><strong>${k.due}</strong><span>Seguimientos vencidos</span></div>
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
          <select id="ally-owner-filter" class="form__input table-toolbar__select">
            <option value="todos">Responsable: todos</option>
            <option value="sin">Sin responsable</option>
            ${owners.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
          </select>
          <select id="ally-idle-filter" class="form__input table-toolbar__select">
            <option value="0">Actividad: toda</option>
            <option value="7">Sin actividad 7+ días</option>
            <option value="15">Sin actividad 15+ días</option>
            <option value="30">Sin actividad 30+ días</option>
          </select>
          <label class="ally-due-toggle"><input type="checkbox" id="ally-due-filter" /> Solo vencidos</label>
          <div class="table-toolbar__spacer"></div>
          <div class="ally-mode" role="group" aria-label="Vista">
            <button type="button" data-mode="list" class="is-active">Lista</button>
            <button type="button" data-mode="board">Tablero</button>
          </div>
          <span class="table-toolbar__count" id="ally-count"></span>
          <button type="button" class="btn btn--ghost btn--sm" id="ally-export">Exportar CSV</button>
        </div>
        <div class="table-wrapper" id="ally-list">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Empresa</th><th>Decisor</th><th>Canal</th>
                <th>Origen</th><th>Estado</th><th>Próxima acción</th><th class="col-center">Acciones</th>
              </tr>
            </thead>
            <tbody id="ally-rows"></tbody>
          </table>
        </div>
        <div id="ally-board" hidden></div>`}
      </section>
    `;
  },

  async afterRender() {
    const deployed = isDeployedBundle();
    const rows = document.getElementById('ally-rows');
    const detail = document.getElementById('ally-detail-panel');
    if (!rows) return;

    const board = document.getElementById('ally-board');
    const listWrap = document.getElementById('ally-list');

    const paint = () => {
      const list = applyFilters(cached);
      listWrap.hidden = viewMode !== 'list';
      board.hidden = viewMode !== 'board';
      if (viewMode === 'list') rows.innerHTML = renderRows(list);
      else board.innerHTML = renderBoard(list);
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
      const qrHost = document.getElementById('ally-qr');
      if (a?.partnerCode && qrHost) {
        drawQr(qrHost, a.partnerCode).catch((e) => { qrHost.innerHTML = `<span class="muted">${escapeHtml(e.message)}</span>`; });
      }
      const emailsBox = document.getElementById('ally-emails');
      emailsBox?.addEventListener('toggle', async () => {
        if (!emailsBox.open || emailsBox.dataset.loaded) return;
        emailsBox.dataset.loaded = '1';
        const list = document.getElementById('ally-emails-list');
        if (!deployed) { list.innerHTML = '<li class="muted">En el demo no se envían correos.</li>'; return; }
        try {
          const items = (await api('emails', { id })).items || [];
          const LABEL = { solicitud_recibida: 'Solicitud recibida', solicitud_aprobada: 'Solicitud aprobada', contrato_listo: 'Contrato listo', contrato_firmado: 'Bienvenida', recordatorio_firma: 'Recordatorio de firma', pago_aprobado: 'Pago aprobado' };
          const STATE = { sent: 'enviado', delivered: 'entregado', opened: 'abierto', clicked: 'abierto', skipped: 'omitido', error: 'error', hard_bounce: 'rebotado', soft_bounce: 'rebote temporal', spam: 'spam', blocked: 'bloqueado', unsubscribed: 'baja' };
          list.innerHTML = items.length
            ? items.map((m) => `<li>${formatDate(m.sentAt)} · ${escapeHtml(LABEL[m.event] || m.event)} · <strong>${escapeHtml(STATE[m.status] || m.status)}</strong>${m.detail ? ` <span class="muted">(${escapeHtml(m.detail)})</span>` : ''}</li>`).join('')
            : '<li class="muted">Todavía no hay correos para este aliado.</li>';
        } catch (e) {
          list.innerHTML = `<li class="muted">${escapeHtml(e.message)}</li>`;
        }
      });
      const codeInput = document.getElementById('ally-code');
      codeInput?.addEventListener('input', () => {
        const hint = document.getElementById('ally-code-hint');
        const err = codeError(codeInput.value.trim());
        hint.textContent = err || `Enlace: cstravelgroup.com/${codeInput.value.trim()}`;
        hint.classList.toggle('text-red', Boolean(err));
      });
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
      if (action === 'follow-up') {
        const tags = String(extra.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        return { ...a, nextAction: extra.nextAction, nextActionAt: extra.nextActionAt, owner: extra.owner.toLowerCase(), tags, updatedAt: now };
      }
      if (action === 'activate') return { ...a, status: 'activo', partnerCode: extra.code, partnerTarget: extra.target };
      return a;
    };

    const moveTo = async (id, status) => {
      const a = cached.find((x) => x.id === id);
      if (!a || a.status === status) return;
      if (status === 'aprobado' && !a.memberId) {
        showToast('Para aprobar usa «Aprobar y crear acceso» en la ficha.', 'error');
        openDetail(id);
        return;
      }
      if (status === 'activo' && !a.partnerCode) {
        showToast('Para activar usa «Activar aliado» en la ficha: asigna su código.', 'error');
        openDetail(id);
        return;
      }
      try {
        replace(await run('status', { id, status }));
        showToast(`${a.company}: ${STATUS[status].label}.`, 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
      paint();
    };

    board.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.kanban-card');
      if (!card) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('is-dragging');
    });
    board.addEventListener('dragend', (event) => event.target.closest?.('.kanban-card')?.classList.remove('is-dragging'));
    board.addEventListener('dragover', (event) => {
      const col = event.target.closest('.kanban-column');
      if (!col) return;
      event.preventDefault();
      board.querySelectorAll('.is-drop-target').forEach((b) => b.classList.remove('is-drop-target'));
      col.querySelector('.kanban-column__body').classList.add('is-drop-target');
    });
    board.addEventListener('drop', (event) => {
      const col = event.target.closest('.kanban-column');
      board.querySelectorAll('.is-drop-target').forEach((b) => b.classList.remove('is-drop-target'));
      if (!col) return;
      event.preventDefault();
      moveTo(event.dataTransfer.getData('text/plain'), col.dataset.status);
    });
    board.addEventListener('change', (event) => {
      const sel = event.target.closest('[data-board-status]');
      if (sel) moveTo(sel.dataset.boardStatus, sel.value);
    });
    board.addEventListener('click', (event) => {
      if (event.target.closest('select')) return;
      const card = event.target.closest('.kanban-card');
      if (card) openDetail(card.dataset.id);
    });

    document.querySelectorAll('.ally-mode [data-mode]').forEach((b) => b.addEventListener('click', () => {
      viewMode = b.dataset.mode;
      document.querySelectorAll('.ally-mode [data-mode]').forEach((x) => x.classList.toggle('is-active', x === b));
      paint();
    }));

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

      if (btn.id === 'save-followup') {
        btn.disabled = true;
        try {
          replace(await run('follow-up', {
            id: selectedId,
            nextAction: document.getElementById('fu-action').value.trim(),
            nextActionAt: document.getElementById('fu-date').value,
            owner: document.getElementById('fu-owner').value.trim(),
            tags: document.getElementById('fu-tags').value,
          }));
          showToast('Seguimiento guardado.', 'success');
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

      if (btn.id === 'copy-link') {
        const a = cached.find((x) => x.id === selectedId);
        await navigator.clipboard?.writeText(shortLink(a.partnerCode)).catch(() => {});
        showToast('Enlace del aliado copiado.', 'success');
        return;
      }

      if (btn.id === 'download-qr') {
        const a = cached.find((x) => x.id === selectedId);
        const canvas = document.querySelector('#ally-qr canvas');
        if (!canvas) return showToast('El QR todavía se está generando.', 'error');
        downloadCanvas(canvas, `qr-${a.partnerCode}.png`);
        return;
      }

      if (btn.id === 'activate-btn') {
        const a = cached.find((x) => x.id === selectedId);
        const code = document.getElementById('ally-code').value.trim();
        const target = document.getElementById('ally-target').value;
        const err = codeError(code);
        if (err) return showToast(err, 'error');
        const ok = await confirmDialog({
          title: 'Activar aliado',
          message: `<p>Se creará el enlace <strong>cstravelgroup.com/${escapeHtml(code)}</strong> para <strong>${escapeHtml(a.company)}</strong>, con su QR.</p><p>El código no se puede cambiar después: queda impreso en su material.</p>`,
          confirmLabel: 'Sí, activar',
        });
        if (!ok) return;
        btn.disabled = true;
        try {
          replace(await run('activate', { id: selectedId, code, target }));
          showToast(`Aliado activo. Su enlace es cstravelgroup.com/${code}`, 'success', { title: 'Listo' });
          openDetail(selectedId);
        } catch (e) {
          showToast(e.message, 'error');
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
    document.getElementById('ally-owner-filter')?.addEventListener('change', (e) => { filters.owner = e.target.value; paint(); });
    document.getElementById('ally-idle-filter')?.addEventListener('change', (e) => { filters.idle = e.target.value; paint(); });
    document.getElementById('ally-due-filter')?.addEventListener('change', (e) => { filters.due = e.target.checked; paint(); });
    document.getElementById('ally-export')?.addEventListener('click', () => {
      if (!cached.length) return showToast('No hay solicitudes para exportar.', 'error');
      exportCsv(cached);
    });

    // Los filtros se reinician al entrar a la vista.
    Object.assign(filters, FILTER_DEFAULTS);
    viewMode = 'list';
    paint();
  },
};
