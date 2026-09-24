/**
 * CompanyPartnerView.js
 * =============================================================================
 * PROPOSITO:
 *   EXPEDIENTE DEL ALIADO (orden de trabajo A-06), dentro del usuario de la
 *   empresa aliada:
 *     - estado del convenio y su recorrido,
 *     - su codigo de marca, enlace corto y QR descargable para imprimir,
 *     - tablero de seguimiento de lo que llego por su enlace,
 *     - contrato firmado (llega con la firma en linea, A-04),
 *     - material comercial (piezas de marketing).
 *
 * DATOS:
 *   /api/aliados/expediente (valida la sesion y devuelve SOLO lo del usuario).
 *   Del seguimiento solo llegan conteos: nunca datos de las personas.
 *   En el demo de GitHub Pages se muestra un expediente de ejemplo.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/formatDate.js';
import { isDeployedBundle } from '../utils/env.js';
import { showToast } from '../utils/toast.js';
import { drawPartnerQr, partnerLink, downloadCanvas } from '../utils/partnerQr.js';

const STATUS = {
  registrado: { label: 'Falta firmar el acuerdo', badge: 'badge--amber', step: 1 },
  en_evaluacion: { label: 'En evaluación', badge: 'badge--blue', step: 2 },
  // Estados del flujo anterior (solicitudes que venían de la gestión manual).
  pendiente: { label: 'En revisión', badge: 'badge--amber', step: 1 },
  contactado: { label: 'En conversación', badge: 'badge--blue', step: 1 },
  aprobado: { label: 'Aprobado', badge: 'badge--teal', step: 2 },
  contrato_enviado: { label: 'Contrato por firmar', badge: 'badge--violet', step: 1 },
  firmado: { label: 'Acuerdo firmado', badge: 'badge--teal', step: 2 },
  activo: { label: 'Convenio activo', badge: 'badge--green', step: 3 },
  rechazado: { label: 'Convenio no activo', badge: 'badge--gray', step: -1 },
};
const STEPS = ['Registro', 'Firma del acuerdo', 'Evaluación', 'Activo'];
const TARGETS = { '/': 'la página de inicio', '/empresas': 'la página de Empresas', '/medicos': 'la página de Médicos', '/reservas': 'Reservas', '/contacto': 'Contacto' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

let ally = null;
let agreement = null;

async function loadAgreement() {
  if (agreement) return agreement;
  const res = await fetch('/api/aliados/firma', { credentials: 'same-origin' });
  agreement = await res.json().catch(() => ({ sections: [] }));
  return agreement;
}

async function load() {
  const res = await fetch('/api/aliados/expediente', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Error ${res.status}`);
  return data.ally;
}

function demoAlly() {
  const now = new Date();
  const byMonth = {};
  [3, 5, 2, 7, 4, 6].forEach((n, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    byMonth[d.toISOString().slice(0, 7)] = n;
  });
  return {
    company: 'Empresa Demo', channel: 'colaboradores', status: 'activo', partnerCode: 'demo', partnerTarget: '/',
    signedAt: new Date(Date.now() - 35 * 86400000).toISOString(), needsSignature: false,
    since: new Date(Date.now() - 40 * 86400000).toISOString(),
    history: [
      { at: new Date(Date.now() - 40 * 86400000).toISOString(), to: 'pendiente' },
      { at: new Date(Date.now() - 38 * 86400000).toISOString(), to: 'aprobado' },
      { at: new Date(Date.now() - 30 * 86400000).toISOString(), to: 'activo' },
    ],
    tracking: { totalLeads: 27, leadsThisMonth: 6, byMonth, referredAllies: 1 },
  };
}

/** Ultimos 6 meses, aunque no tengan datos (la barra vacia tambien informa). */
function lastMonths(byMonth) {
  const now = new Date();
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ label: MONTHS[d.getMonth()], value: Number(byMonth?.[key] || 0) });
  }
  return out;
}

function renderSteps(status) {
  const current = STATUS[status]?.step ?? 0;
  if (current < 0) return '';
  return `
    <ol class="pv-steps">
      ${STEPS.map((label, i) => `<li class="${i < current ? 'is-done' : i === current ? 'is-current' : ''}"><span>${i + 1}</span>${label}</li>`).join('')}
    </ol>`;
}

function shareMessage(code) {
  return `¡Hola! Como parte de nuestra comunidad tienes acceso preferencial a CS Travel Group. Conoce tu beneficio aquí: ${partnerLink(code)}`;
}

function renderEmpty() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Mi convenio</h1>
        <p class="page-subtitle">Tu expediente como aliado de CS Travel Group.</p>
      </div>
    </div>
    <section class="panel" style="text-align:center; padding:48px 24px;">
      <h2 class="panel__title" style="justify-content:center;">Todavía no tienes un convenio de aliado</h2>
      <p class="muted" style="max-width:480px; margin:10px auto 22px;">
        Si tu empresa quiere ofrecer los beneficios de CS Travel a su equipo o a su comunidad,
        solicita el acceso y te contactamos.
      </p>
      <a class="btn btn--primary" href="/aliados" target="_blank" rel="noopener">Solicitar convenio</a>
    </section>`;
}

export const CompanyPartnerView = {
  async render() {
    const deployed = isDeployedBundle();
    let loadError = '';
    ally = null;
    if (deployed) {
      try { ally = await load(); } catch (e) { loadError = e.message; }
    } else {
      ally = demoAlly();
    }

    if (loadError) {
      return `<section class="panel"><p class="empty-state">No se pudo cargar tu expediente: ${escapeHtml(loadError)}</p></section>`;
    }
    if (!ally) return renderEmpty();

    const st = STATUS[ally.status] || { label: ally.status, badge: 'badge--gray' };
    const t = ally.tracking || {};
    const months = lastMonths(t.byMonth);
    const max = Math.max(1, ...months.map((m) => m.value));
    const code = ally.partnerCode;

    return `
      <style>
        .pv-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: var(--space-5, 20px); }
        @media (max-width: 960px) { .pv-grid { grid-template-columns: 1fr; } }
        .pv-steps { list-style: none; display: flex; gap: 8px; margin: 0; padding: 0; flex-wrap: wrap; }
        .pv-steps li { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: #f2f5fa; color: #667386; font-size: .84rem; font-weight: 600; }
        .pv-steps li span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #dfe6f0; color: #45546b; font-size: .75rem; font-weight: 800; }
        .pv-steps li.is-done { background: #e3f3ea; color: #1a7f4b; }
        .pv-steps li.is-done span { background: #1a7f4b; color: #fff; }
        .pv-steps li.is-current { background: #e8efff; color: #0a2d66; }
        .pv-steps li.is-current span { background: #0058c1; color: #fff; }
        .pv-code { display: grid; grid-template-columns: 170px 1fr; gap: 18px; align-items: center; }
        @media (max-width: 560px) { .pv-code { grid-template-columns: 1fr; justify-items: center; text-align: center; } }
        .pv-qr { display: grid; place-items: center; padding: 10px; background: #fff; border: 1px dashed #cfdbe8; border-radius: 12px; min-height: 150px; }
        .pv-qr canvas { width: 150px; height: auto; display: block; }
        .pv-link { font-size: 1.15rem; font-weight: 800; color: #0a2d66; word-break: break-all; margin: 6px 0 4px; }
        .pv-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
        .pv-bars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; align-items: end; height: 150px; margin-top: 8px; }
        .pv-bar { display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; }
        .pv-bar__fill { width: 100%; max-width: 38px; border-radius: 8px 8px 3px 3px; background: linear-gradient(180deg, #2f7de1, #0a2d66); min-height: 4px; }
        .pv-bar__value { font-size: .8rem; font-weight: 800; color: #0a2540; }
        .pv-bar__label { font-size: .75rem; color: #667386; text-transform: capitalize; }
        .pv-doc { display: flex; gap: 14px; align-items: center; padding: 14px; border: 1px solid #e6ecf4; border-radius: 12px; background: #fbfcfe; }
        .pv-doc + .pv-doc { margin-top: 10px; }
        .pv-doc__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: #eef2fb; color: #0a2d66; flex: none; }
        .pv-doc__text { flex: 1; min-width: 0; }
        .pv-doc__text strong { display: block; color: #0a2540; }
        .pv-doc-box { max-height: 340px; overflow-y: auto; padding: 20px 22px; border: 1px solid #e6ecf4; border-radius: 14px; background: #fbfcfe; margin: 4px 0 18px; }
        .pv-doc-box h3 { font-size: .98rem; margin: 18px 0 8px; color: #061953; }
        .pv-doc-box h3:first-child { margin-top: 0; }
        .pv-doc-box p { margin: 0 0 8px; font-size: .9rem; line-height: 1.65; color: #45546b; }
        .pv-doc-note { margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; background: #fdf0e3; color: #a35b12; font-size: .84rem; }
        .pv-check { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; font-size: .9rem; line-height: 1.5; }
        .pv-sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0 18px; }
        @media (max-width: 640px) { .pv-sign-grid { grid-template-columns: 1fr; } }
      </style>

      <div class="qb-page-hero">
        <div>
          <h1 class="page-title">Mi convenio</h1>
          <p class="page-subtitle"><span class="badge ${st.badge}">${escapeHtml(st.label)}</span> Aliado desde ${formatDate(ally.since)}</p>
        </div>
        <div class="qb-hero-kpis">
          <div class="qb-hero-kpi"><strong>${Number(t.totalLeads || 0)}</strong><span>Solicitudes por tu enlace</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${Number(t.leadsThisMonth || 0)}</strong><span>Este mes</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${Number(t.referredAllies || 0)}</strong><span>Empresas referidas</span></div>
        </div>
      </div>

      ${ally.status !== 'rechazado' ? `
      <section class="panel">
        <div class="panel__header"><h2 class="panel__title">Estado del convenio</h2></div>
        ${renderSteps(ally.status)}
      </section>` : ''}

      ${ally.needsSignature ? `
      <section class="panel" id="pv-sign">
        <div class="panel__header">
          <h2 class="panel__title">Lee y firma tu acuerdo</h2>
          <span class="badge badge--amber">Paso pendiente</span>
        </div>
        <p class="muted" style="margin-top:0;">Sin este paso no podemos evaluar tu solicitud ni activar tu código.</p>
        <div class="pv-doc-box" id="pv-agreement"><p class="muted">Cargando el acuerdo…</p></div>
        <label class="checkbox pv-check"><input type="checkbox" id="pv-accept-terms" /> <span>He leído y acepto el acuerdo del Programa de Aliados en nombre de mi empresa.</span></label>
        <label class="checkbox pv-check"><input type="checkbox" id="pv-accept-data" /> <span>Autorizo el tratamiento de mis datos conforme a la Ley 1581 de 2012.</span></label>
        <div class="pv-sign-grid">
          <div class="form__group">
            <label class="form__label" for="pv-name">Nombre de quien firma</label>
            <input id="pv-name" class="form__input" maxlength="120" placeholder="Como aparece en tu documento" />
          </div>
          <div class="form__group">
            <label class="form__label" for="pv-doc">Documento</label>
            <input id="pv-doc" class="form__input" maxlength="30" placeholder="Cédula o NIT" />
          </div>
        </div>
        <button type="button" class="btn btn--primary" id="pv-sign-btn">Firmar y enviar a evaluación</button>
      </section>` : ''}

      ${ally.status === 'en_evaluacion' ? `
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Tu solicitud está en evaluación</h2>
          <span class="badge badge--blue">En curso</span>
        </div>
        <p class="muted" style="margin:0;">
          Firmaste el acuerdo el ${formatDate(ally.signedAt)}. Nuestro equipo está verificando la información de tu empresa.
          Cuando demos el aval te avisamos por correo y aquí mismo aparecerá tu código, tu enlace y tu QR.
        </p>
      </section>` : ''}

      <div class="pv-grid">
        <section class="panel">
          <div class="panel__header"><h2 class="panel__title">Tu código y enlace</h2></div>
          ${code ? `
            <div class="pv-code">
              <div class="pv-qr" id="pv-qr"><span class="muted">Generando QR…</span></div>
              <div>
                <span class="code-chip" style="font-family:ui-monospace,Menlo,monospace;font-weight:800;background:#eef2fb;color:#0a2d66;border:1px solid #d8e0f2;border-radius:7px;padding:3px 9px;">${escapeHtml(code)}</span>
                <p class="pv-link">cstravelgroup.com/${escapeHtml(code)}</p>
                <p class="muted" style="margin:0;">Quien entre por este enlace o escanee el QR llega a ${escapeHtml(TARGETS[ally.partnerTarget] || 'la página de inicio')} y queda registrado como tuyo.</p>
                <div class="pv-actions">
                  <a class="btn btn--wa btn--sm" href="https://wa.me/?text=${encodeURIComponent(shareMessage(code))}" target="_blank" rel="noopener">Compartir por WhatsApp</a>
                  <button type="button" class="btn btn--ghost btn--sm" id="pv-copy">Copiar enlace</button>
                  <button type="button" class="btn btn--primary btn--sm" id="pv-download">Descargar QR</button>
                </div>
              </div>
            </div>` : `
            <p class="empty-state" style="padding:20px 12px;">${ally.needsSignature ? 'Primero firma el acuerdo de arriba.' : 'Tu código y tu enlace se generan cuando CS Travel Group da el aval.'}</p>`}
        </section>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">Seguimiento</h2>
            <span class="muted">Solicitudes por mes</span>
          </div>
          ${code ? `
            <div class="pv-bars">
              ${months.map((m) => `
                <div class="pv-bar">
                  <span class="pv-bar__value">${m.value}</span>
                  <div class="pv-bar__fill" style="height:${Math.round((m.value / max) * 100)}%"></div>
                  <span class="pv-bar__label">${m.label}</span>
                </div>`).join('')}
            </div>
            <p class="panel__footnote">Cuenta las solicitudes de cotización que llegaron por tu enlace o tu QR.</p>` : `
            <p class="empty-state" style="padding:20px 12px;">El seguimiento empieza cuando tu enlace esté activo.</p>`}
        </section>
      </div>

      <section class="panel">
        <div class="panel__header"><h2 class="panel__title">Documentos</h2></div>
        <div class="pv-doc">
          <div class="pv-doc__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg></div>
          <div class="pv-doc__text">
            <strong>Contrato de convenio</strong>
            <span class="muted">${['firmado', 'activo'].includes(ally.status) ? 'Firmado. La copia descargable aparecerá aquí cuando se habilite la firma en línea.' : 'Lo firmarás en línea, sin imprimir ni escanear. Aparecerá aquí para descargarlo.'}</span>
          </div>
        </div>
        <div class="pv-doc">
          <div class="pv-doc__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg></div>
          <div class="pv-doc__text">
            <strong>Material comercial</strong>
            <span class="muted">Piezas listas para compartir con tu equipo y tu comunidad. Muy pronto disponibles aquí.</span>
          </div>
        </div>
      </section>
    `;
  },

  async afterRender() {
    // Acuerdo por firmar: se carga el texto y se habilita la firma.
    const box = document.getElementById('pv-agreement');
    if (box) {
      try {
        const doc = await loadAgreement();
        box.innerHTML = `
          ${doc.notice ? `<p class="pv-doc-note">${escapeHtml(doc.notice)}</p>` : ''}
          <p>${escapeHtml(doc.intro || '')}</p>
          ${(doc.sections || []).map((sec) => `
            <h3>${escapeHtml(sec.title)}</h3>
            ${sec.body.map((t) => `<p>${escapeHtml(t)}</p>`).join('')}`).join('')}`;
      } catch {
        box.innerHTML = '<p class="muted">No pudimos cargar el acuerdo. Recarga la página.</p>';
      }
    }

    document.getElementById('pv-sign-btn')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      const payload = {
        acceptTerms: document.getElementById('pv-accept-terms').checked,
        acceptData: document.getElementById('pv-accept-data').checked,
        name: document.getElementById('pv-name').value.trim(),
        doc: document.getElementById('pv-doc').value.trim(),
      };
      if (!payload.acceptTerms || !payload.acceptData) return showToast('Marca las dos casillas para firmar.', 'error');
      if (!payload.name || !payload.doc) return showToast('Escribe tu nombre y tu documento.', 'error');
      btn.disabled = true;
      try {
        const res = await fetch('/api/aliados/firma', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) throw new Error(out.error || `Error ${res.status}`);
        showToast('Acuerdo firmado. Tu solicitud pasó a evaluación.', 'success', { title: 'Listo' });
        window.location.reload();
      } catch (e) {
        showToast(e.message, 'error');
        btn.disabled = false;
      }
    });

    if (!ally?.partnerCode) return;
    const host = document.getElementById('pv-qr');
    if (host) {
      drawPartnerQr(host, ally.partnerCode).catch((e) => { host.innerHTML = `<span class="muted">${escapeHtml(e.message)}</span>`; });
    }
    document.getElementById('pv-copy')?.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(partnerLink(ally.partnerCode)).catch(() => {});
      showToast('Enlace copiado.', 'success');
    });
    document.getElementById('pv-download')?.addEventListener('click', () => {
      const canvas = document.querySelector('#pv-qr canvas');
      if (!canvas) return showToast('El QR todavía se está generando.', 'error');
      downloadCanvas(canvas, `qr-${ally.partnerCode}.png`);
    });
  },
};
