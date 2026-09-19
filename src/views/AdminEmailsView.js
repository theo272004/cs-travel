/**
 * AdminEmailsView.js
 * =============================================================================
 * PROPOSITO:
 *   Correos automaticos por evento (orden de trabajo E-02..E-04), opcion A:
 *   las plantillas se disenan en Brevo; aqui se elige cual se dispara en cada
 *   evento, se activa o pausa, se envia una prueba y se ve el registro de cada
 *   envio (entregado, abierto, rebotado...).
 *
 *   Mientras Brevo no este conectado (falta dominio verificado y llave), nada
 *   se envia pero cada intento queda registrado como "omitido" con su motivo.
 *
 * DATOS:
 *   /api/correos/admin (solo admin). En el demo se muestra un ejemplo.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/formatDate.js';
import { isDeployedBundle } from '../utils/env.js';
import { showToast } from '../utils/toast.js';

const STATUS = {
  sent: { label: 'Enviado', badge: 'badge--blue' },
  deferred: { label: 'En cola', badge: 'badge--amber' },
  delivered: { label: 'Entregado', badge: 'badge--teal' },
  opened: { label: 'Abierto', badge: 'badge--green' },
  clicked: { label: 'Clic', badge: 'badge--green' },
  soft_bounce: { label: 'Rebote temporal', badge: 'badge--amber' },
  hard_bounce: { label: 'Rebotado', badge: 'badge--red' },
  blocked: { label: 'Bloqueado', badge: 'badge--red' },
  spam: { label: 'Marcado spam', badge: 'badge--red' },
  unsubscribed: { label: 'Se dio de baja', badge: 'badge--gray' },
  error: { label: 'Error', badge: 'badge--red' },
  skipped: { label: 'Omitido', badge: 'badge--gray' },
};

let data = null;

async function api(action, extra = {}) {
  const res = await fetch('/api/correos/admin', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || `Error ${res.status}`);
  return out;
}

function demoData() {
  const ev = (label, description, params) => ({ label, description, params });
  const events = {
    solicitud_recibida: ev('Solicitud recibida', 'Acuse al prospecto y enlace de agenda.', ['NOMBRE', 'EMPRESA', 'ENLACE_AGENDA']),
    solicitud_aprobada: ev('Solicitud aprobada', 'Acceso al portal.', ['NOMBRE', 'EMPRESA', 'ENLACE_PORTAL']),
    contrato_listo: ev('Contrato listo para firma', 'Enlace directo al sobre de firma.', ['NOMBRE', 'EMPRESA', 'ENLACE_FIRMA']),
    contrato_firmado: ev('Contrato firmado · bienvenida', 'Bienvenida formal con código y enlace.', ['NOMBRE', 'EMPRESA', 'CODIGO', 'ENLACE', 'ENLACE_PORTAL']),
    recordatorio_firma: ev('Recordatorio de firma', 'A los 3 y a los 7 días.', ['NOMBRE', 'EMPRESA', 'DIAS', 'ENLACE_FIRMA']),
    pago_aprobado: ev('Pago aprobado', 'Confirmación del pago.', ['NOMBRE', 'CONCEPTO', 'VALOR', 'REFERENCIA', 'FECHA']),
  };
  const settings = Object.fromEntries(Object.keys(events).map((k) => [k, { event: k, templateId: '', enabled: false }]));
  return {
    status: { brevo: false, sender: false, webhook: false, cron: false },
    events, settings, templates: [], templatesError: '',
    log: [{ id: 'd1', event: 'solicitud_recibida', toEmail: 'laura@empresa.co', status: 'skipped', detail: 'Brevo sin configurar (falta BREVO_API_KEY)', sentAt: new Date().toISOString() }],
  };
}

const statusBadge = (s) => {
  const st = STATUS[s] || { label: s, badge: 'badge--gray' };
  return `<span class="badge ${st.badge}">${escapeHtml(st.label)}</span>`;
};

function checkItem(ok, label, help) {
  return `
    <li class="em-check ${ok ? 'is-ok' : ''}">
      <span class="em-check__dot">${ok ? '✓' : '!'}</span>
      <div><strong>${escapeHtml(label)}</strong><div class="muted">${escapeHtml(help)}</div></div>
    </li>`;
}

function templateField(key, setting, templates) {
  if (templates.length) {
    return `
      <select class="form__input" data-template="${key}">
        <option value="">Sin plantilla</option>
        ${templates.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === setting.templateId ? 'selected' : ''}>#${escapeHtml(t.id)} · ${escapeHtml(t.name)}</option>`).join('')}
      </select>`;
  }
  return `<input class="form__input" data-template="${key}" inputmode="numeric" maxlength="10" placeholder="ID de plantilla" value="${escapeHtml(setting.templateId || '')}" />`;
}

function renderLog(log) {
  if (!log.length) return '<tr><td colspan="5" class="empty-state">Todavía no hay envíos registrados.</td></tr>';
  return log.map((l) => `
    <tr>
      <td>${formatDate(l.sentAt, true)}</td>
      <td>${escapeHtml(data.events[l.event]?.label || l.event)}${l.refType === 'prueba' ? ' <span class="badge badge--outline">prueba</span>' : ''}</td>
      <td>${escapeHtml(l.toEmail)}</td>
      <td>${statusBadge(l.status)}${l.openedAt ? `<div class="muted">abierto ${formatDate(l.openedAt, true)}</div>` : ''}</td>
      <td class="muted">${escapeHtml(l.detail || '')}</td>
    </tr>`).join('');
}

export const AdminEmailsView = {
  async render() {
    const deployed = isDeployedBundle();
    let loadError = '';
    data = null;
    if (deployed) {
      try { data = await api('overview'); } catch (e) { loadError = e.message; }
    } else {
      data = demoData();
    }
    if (loadError) return `<section class="panel"><p class="empty-state">No se pudo cargar: ${escapeHtml(loadError)}</p></section>`;

    const s = data.status;
    const enabledCount = Object.values(data.settings).filter((x) => x.enabled && x.templateId).length;
    const sentCount = data.log.filter((l) => !['skipped', 'error'].includes(l.status)).length;
    const openedCount = data.log.filter((l) => ['opened', 'clicked'].includes(l.status)).length;

    return `
      <style>
        .em-checks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
        .em-check { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: #fdf6ec; border: 1px solid #f3dfc2; font-size: .88rem; }
        .em-check.is-ok { background: #eef8f2; border-color: #cfe9da; }
        .em-check__dot { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #a35b12; color: #fff; font-weight: 800; font-size: .78rem; flex: none; }
        .em-check.is-ok .em-check__dot { background: #1a7f4b; }
        .em-params { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
        .em-params code { font-size: .72rem; background: #eef2fb; color: #0a2d66; border-radius: 6px; padding: 2px 6px; }
        .em-row-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
        .em-table td { vertical-align: top; }
        .em-table .form__input { min-width: 170px; }
      </style>

      <div class="qb-page-hero">
        <div>
          <h1 class="page-title">Correos automáticos</h1>
          <p class="page-subtitle">Las plantillas se diseñan en Brevo. Aquí eliges cuál sale en cada momento y ves qué pasó con cada envío.</p>
        </div>
        <div class="qb-hero-kpis">
          <div class="qb-hero-kpi ${s.brevo ? '' : 'qb-hero-kpi--alert'}"><strong>${s.brevo ? 'Sí' : 'No'}</strong><span>Brevo conectado</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${enabledCount}/6</strong><span>Eventos activos</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${sentCount}</strong><span>Enviados</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${openedCount}</strong><span>Abiertos</span></div>
        </div>
      </div>

      <section class="panel">
        <div class="panel__header"><h2 class="panel__title">Estado de la conexión</h2></div>
        <ul class="em-checks">
          ${checkItem(s.brevo, 'Llave de Brevo', s.brevo ? 'Configurada en el servidor.' : 'Falta BREVO_API_KEY. Requiere el dominio de envío verificado (SPF, DKIM y DMARC).')}
          ${checkItem(s.sender, 'Remitente', s.sender ? 'Correo remitente definido.' : 'Falta BREVO_SENDER_EMAIL (ej. no-responder@cstravelgroup.com).')}
          ${checkItem(s.webhook, 'Seguimiento de estados', s.webhook ? 'Webhook protegido: se registran entregas, aperturas y rebotes.' : 'Falta BREVO_WEBHOOK_TOKEN para recibir entregado/abierto/rebote.')}
          ${checkItem(s.cron, 'Recordatorios diarios', s.cron ? 'Cron externo configurado.' : 'Opcional: también se revisan cada vez que abres Aliados.')}
        </ul>
        ${data.templatesError ? `<p class="empty-state">Brevo respondió con un error al listar plantillas: ${escapeHtml(data.templatesError)}</p>` : ''}
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Eventos</h2>
          <span class="muted">Variables disponibles en cada plantilla: <code>{{ params.NOMBRE }}</code></span>
        </div>
        <div class="table-wrapper">
          <table class="data-table em-table">
            <thead><tr><th>Evento</th><th>Plantilla</th><th class="col-center">Activo</th><th></th></tr></thead>
            <tbody>
              ${Object.entries(data.events).map(([key, ev]) => {
                const st = data.settings[key] || { templateId: '', enabled: false };
                return `
                  <tr data-event="${key}">
                    <td>
                      <strong>${escapeHtml(ev.label)}</strong>
                      <div class="muted">${escapeHtml(ev.description)}</div>
                      <div class="em-params">${ev.params.map((p) => `<code>${escapeHtml(p)}</code>`).join('')}</div>
                    </td>
                    <td>${templateField(key, st, data.templates)}</td>
                    <td class="col-center"><input type="checkbox" data-enabled="${key}" ${st.enabled ? 'checked' : ''} aria-label="Activo" /></td>
                    <td>
                      <div class="em-row-actions">
                        <button type="button" class="btn btn--ghost btn--sm" data-test="${key}">Enviar prueba</button>
                        <button type="button" class="btn btn--primary btn--sm" data-save="${key}">Guardar</button>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <p class="panel__footnote">Cada plantilla comercial debe incluir enlace de baja, razón social, NIT y dirección, y la referencia a la política de datos. Las de credenciales y pagos son transaccionales: no mezcles publicidad en ellas.</p>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Registro de envíos</h2>
          <span class="muted">Evidencia ante un «no me llegó»</span>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Correo</th><th>Para</th><th>Estado</th><th>Detalle</th></tr></thead>
            <tbody id="em-log">${renderLog(data.log)}</tbody>
          </table>
        </div>
      </section>
    `;
  },

  async afterRender() {
    if (!data) return;
    const deployed = isDeployedBundle();
    const table = document.querySelector('.em-table');

    const refreshLog = async () => {
      if (!deployed) return;
      try {
        data.log = (await api('log')).items || [];
        document.getElementById('em-log').innerHTML = renderLog(data.log);
      } catch { /* el registro se vera al recargar */ }
    };

    table?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;
      const key = btn.dataset.save || btn.dataset.test;
      if (!key) return;
      const templateId = String(document.querySelector(`[data-template="${key}"]`)?.value || '').trim();
      const enabled = Boolean(document.querySelector(`[data-enabled="${key}"]`)?.checked);

      if (!deployed) return showToast('Demo: en el portal real esto guarda y envía con Brevo.', 'info');

      btn.disabled = true;
      try {
        if (btn.dataset.save) {
          if (enabled && !templateId) throw new Error('Elige una plantilla antes de activar el evento.');
          const out = await api('save', { event: key, templateId, enabled });
          data.settings = out.settings;
          showToast(`«${data.events[key].label}» guardado.`, 'success');
        } else {
          const out = await api('test', { event: key, templateId });
          const st = out.entry?.status;
          if (st === 'sent') showToast('Prueba enviada a tu correo.', 'success');
          else showToast(`No se envió: ${out.entry?.detail || st || 'revisa la configuración'}.`, 'error');
          await refreshLog();
        }
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  },
};
