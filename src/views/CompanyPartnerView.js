/**
 * CompanyPartnerView.js
 * =============================================================================
 * PROPOSITO:
 *   EXPEDIENTE DEL ALIADO (orden de trabajo A-06), dentro del usuario de la
 *   empresa aliada:
 *     - mientras el acceso es TEMPORAL (registrado / correccion): el
 *       expediente en "un solo mandado": sube sus documentos (todo queda en
 *       PDF; la cedula tambien acepta fotos) y firma el acuerdo en la misma
 *       pantalla, y lo envia a revision,
 *     - estado del convenio y su recorrido,
 *     - su codigo de marca, enlace corto y QR descargable para imprimir,
 *     - tablero de seguimiento de lo que llego por su enlace,
 *     - contrato firmado y material comercial.
 *
 * DATOS:
 *   /api/aliados/expediente (valida la sesion y devuelve SOLO lo del usuario),
 *   /api/aliados/documento, /api/aliados/firma, /api/aliados/reenviar.
 *   Contrato completo en docs/PLAN-ALTA-ALIADOS.md.
 *   Del seguimiento solo llegan conteos: nunca datos de las personas.
 *   En el demo el expediente vive en este navegador (allyOnboarding.js) y lo
 *   revisa el admin demo en la bandeja de Aliados.
 * =============================================================================
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/formatDate.js';
import { isDeployedBundle } from '../utils/env.js';
import { showToast } from '../utils/toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { drawPartnerQr, partnerLink, downloadCanvas } from '../utils/partnerQr.js';
import {
  allyStatus, EDITABLE_STATES, PERSON_TYPES, MAX_PDF_MB,
  normalizePersonType, docSlots, expedienteProgress, daysLeft, formatSize,
  prepareFile, sha256, expedienteApi, demoExpediente, resetDemoExpediente,
} from '../utils/allyOnboarding.js';

const STEPS = ['Registro', 'Expediente', 'Revisión', 'Activo'];
const TARGETS = { '/': 'la página de inicio', '/empresas': 'la página de Empresas', '/medicos': 'la página de Médicos', '/reservas': 'Reservas', '/contacto': 'Contacto' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

let ally = null;
let agreement = null;

const DEMO_AGREEMENT = {
  title: 'Acuerdo del Programa de Aliados',
  version: '2026-09-17-borrador',
  notice: 'Texto preliminar en revisión legal. Al activarse tu convenio te enviaremos la versión definitiva para tu firma.',
  intro: 'Este documento resume las condiciones del Programa de Aliados de CS Travel Group Colombia S.A.S. Léelo completo antes de firmarlo. Al firmar, tu empresa queda en periodo de evaluación.',
  sections: [
    { title: '1. Quiénes somos', body: ['CS Travel Group Colombia S.A.S., NIT 902.096.878-3, RNT 299.130, Barranquilla, Colombia.', 'La empresa que se registra actúa como Aliado del programa.'] },
    { title: '2. Qué hace cada parte', body: ['El Aliado difunde el beneficio con el enlace y el material que le entregamos.', 'CS Travel Group atiende a cada persona que llegue por ese enlace. El Aliado no vende viajes ni maneja dinero de los viajeros.'] },
    { title: '3. Periodo de evaluación', body: ['Al firmar, la solicitud entra en evaluación. La activación depende del aval de CS Travel Group.'] },
    { title: '4. Código y enlace', body: ['Con el aval se asigna un código con la marca del Aliado y su enlace propio, junto con el código QR.'] },
    { title: '5. Firma electrónica', body: ['Al marcar las casillas y escribir nombre y documento, el firmante acepta el acuerdo conforme a la Ley 527 de 1999.'] },
  ],
};

async function loadAgreement() {
  if (agreement) return agreement;
  if (!isDeployedBundle()) {
    agreement = DEMO_AGREEMENT;
    return agreement;
  }
  const res = await fetch('/api/aliados/firma', { credentials: 'same-origin' });
  agreement = await res.json().catch(() => ({ sections: [] }));
  return agreement;
}

/** Texto exacto del acuerdo que se muestra: de el sale la huella de la firma. */
const agreementText = (doc) => [doc.title, doc.intro, ...(doc.sections || []).flatMap((s) => [s.title, ...s.body])].join('\n');

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

// En el demo se puede ver el convenio activo de ejemplo o llenar el expediente
// de verdad (queda en este navegador y lo revisa el admin demo).
let demoMode = 'activo';

function demoActiveAlly() {
  const now = new Date();
  const byMonth = {};
  [3, 5, 2, 7, 4, 6].forEach((n, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    byMonth[d.toISOString().slice(0, 7)] = n;
  });
  return {
    company: 'Empresa Demo', channel: 'colaboradores', status: 'activo', partnerCode: 'demo', partnerTarget: '/', personType: 'juridica',
    signature: { name: 'Camila Torres', doc: '1.045.678.912', signedAt: new Date(Date.now() - 35 * 86400000).toISOString() },
    since: new Date(Date.now() - 40 * 86400000).toISOString(),
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
  const current = allyStatus(status).step ?? 0;
  if (current < 0) return '';
  return `
    <ol class="pv-steps">
      ${STEPS.map((label, i) => `<li class="${i < current || status === 'activo' ? 'is-done' : i === current ? 'is-current' : ''}"><span>${i + 1}</span>${label}</li>`).join('')}
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
        regístrala y completa tu expediente en línea.
      </p>
      <a class="btn btn--primary" href="#/registro">Registrar mi empresa</a>
    </section>`;
}

// ---------------------------------------------------------------------------
// Expediente
// ---------------------------------------------------------------------------

const FILE_ICON = {
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></svg>',
  fix: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5" /><path d="M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>',
};

function renderFile(slot, editable) {
  const f = slot.file;
  const state = !f ? 'missing' : f.status === 'aprobado' ? 'approved' : f.status === 'rechazado' ? 'fix' : 'ready';
  const icon = { missing: FILE_ICON.up, approved: FILE_ICON.ok, fix: FILE_ICON.fix, ready: FILE_ICON.doc }[state];
  const format = slot.images ? 'PDF o fotos (frente y reverso)' : 'Solo PDF';
  const accept = slot.images ? 'application/pdf,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif' : 'application/pdf,.pdf';
  const canChange = editable && state !== 'approved';
  return `
    <li class="pv-file is-${state}" data-slot="${slot.type}">
      <span class="pv-file__icon">${icon}</span>
      <div class="pv-file__text">
        <strong>${escapeHtml(slot.title)}</strong>
        <span class="pv-file__hint">${escapeHtml(slot.hint)}</span>
        <span class="pv-file__rules">${format} · máx. ${MAX_PDF_MB} MB${slot.maxAgeDays ? ` · expedido hace ${slot.maxAgeDays} días o menos` : ''}</span>
        ${f ? `<span class="pv-file__name">${escapeHtml(f.fileName)} · ${escapeHtml(formatSize(f.size || 0))} · <button type="button" class="pv-link-btn" data-pv-view="${slot.type}">Ver</button></span>` : ''}
        ${state === 'fix' && f.reviewNote ? `<span class="pv-file__note"><strong>Corrige:</strong> ${escapeHtml(f.reviewNote)}</span>` : ''}
        <span class="pv-file__error" data-pv-error="${slot.type}" hidden></span>
      </div>
      <div class="pv-file__side">
        ${state === 'approved' ? '<span class="badge badge--green">Aprobado</span>' : ''}
        ${state === 'ready' && !editable ? '<span class="badge badge--blue">En revisión</span>' : ''}
        ${canChange ? `
          <label class="btn ${f && state !== 'fix' ? 'btn--ghost' : 'btn--primary'} btn--sm pv-file__btn">
            <span>${!f ? 'Subir' : 'Reemplazar'}</span>
            <input type="file" data-pv-upload="${slot.type}" accept="${accept}" ${slot.images ? 'multiple' : ''} />
          </label>` : ''}
      </div>
    </li>`;
}

function renderFiles(a) {
  const editable = EDITABLE_STATES.includes(a.status);
  return docSlots(a).map((s) => renderFile(s, editable)).join('');
}

function progressBadge(a) {
  const p = expedienteProgress(a);
  return `<span class="badge ${p.complete ? 'badge--green' : 'badge--amber'}">${p.uploaded} de ${p.total} documentos</span>`;
}

function renderExpediente(a) {
  const correcting = a.status === 'correccion';
  const left = daysLeft(a);
  const p = expedienteProgress(a);
  const natural = normalizePersonType(a.personType) === 'natural';
  return `
    <section class="panel pv-xp" id="pv-expediente">
      <div class="panel__header">
        <h2 class="panel__title">${correcting ? 'Corrige tu expediente' : 'Completa tu expediente'}</h2>
        <span id="pv-progress-badge">${progressBadge(a)}</span>
      </div>
      <p class="muted pv-xp__lead">
        ${correcting
          ? 'Revisamos tu expediente y hay que cambiar lo que está marcado. Reemplázalo y vuelve a enviarlo: tu firma sigue vigente.'
          : `Sube los documentos de tu ${natural ? 'negocio' : 'empresa'} y firma el acuerdo en esta misma pantalla. Todo queda guardado: puedes salir y volver cuando quieras.`}
        ${left !== null ? `<br><strong>Tu acceso temporal vence el ${formatDate(a.accessExpiresAt)}</strong> (${left === 0 ? 'hoy' : left === 1 ? 'mañana' : `en ${left} días`}).` : ''}
      </p>
      ${correcting && a.correctionNote ? `<p class="pv-doc-note">${escapeHtml(a.correctionNote)}</p>` : ''}
      <div class="pv-meter" aria-hidden="true"><span id="pv-meter-fill" style="width:${Math.round((p.uploaded / p.total) * 100)}%"></span></div>
      <ul class="pv-files" id="pv-files">${renderFiles(a)}</ul>

      ${correcting ? `
        <div class="pv-xp__submit">
          <button type="button" class="btn btn--primary" id="pv-resubmit" ${p.complete ? '' : 'disabled'}>Reenviar a revisión</button>
          <span class="muted" id="pv-submit-hint">${p.complete ? 'Todo listo para reenviar.' : 'Reemplaza lo marcado para poder reenviar.'}</span>
        </div>` : `
        <div class="pv-xp__sign">
          <h3 class="pv-xp__subtitle">Lee y firma el acuerdo</h3>
          <div class="pv-doc-box" id="pv-agreement"><p class="muted">Cargando el acuerdo…</p></div>
          <label class="checkbox pv-check"><input type="checkbox" id="pv-accept-terms" /> <span>He leído y acepto el acuerdo del Programa de Aliados${natural ? '.' : ' en nombre de mi empresa.'}</span></label>
          <label class="checkbox pv-check"><input type="checkbox" id="pv-accept-authority" /> <span>${natural ? 'Firmo en mi propio nombre, como titular del negocio.' : 'Declaro que soy el representante legal de la empresa o tengo facultades para firmar en su nombre.'}</span></label>
          <label class="checkbox pv-check"><input type="checkbox" id="pv-accept-data" /> <span>Autorizo el tratamiento de mis datos y de los documentos que subí conforme a la Ley 1581 de 2012, para verificar la información y gestionar el convenio.</span></label>
          <div class="pv-sign-grid">
            <div class="form__group">
              <label class="form__label" for="pv-name">Nombre de quien firma</label>
              <input id="pv-name" class="form__input" maxlength="120" autocomplete="name" placeholder="Como aparece en la cédula" value="${escapeHtml(a.contactName || '')}" />
            </div>
            <div class="form__group">
              <label class="form__label" for="pv-doc">Cédula</label>
              <input id="pv-doc" class="form__input" maxlength="20" inputmode="numeric" placeholder="Número de cédula" />
            </div>
            <div class="form__group">
              <label class="form__label" for="pv-position">Cargo</label>
              <input id="pv-position" class="form__input" maxlength="80" placeholder="${natural ? 'Titular' : 'Representante legal'}" value="${escapeHtml(natural ? 'Titular' : a.position || '')}" />
            </div>
          </div>
          <div class="pv-xp__submit">
            <button type="button" class="btn btn--primary" id="pv-sign-btn" ${p.complete ? '' : 'disabled'}>Firmar y enviar a revisión</button>
            <span class="muted" id="pv-submit-hint">${p.complete ? 'Todo listo: firma y envía.' : `Sube los ${p.total - p.uploaded === 1 ? 'documento que falta' : `${p.total - p.uploaded} documentos que faltan`} para poder enviar.`}</span>
          </div>
        </div>`}
    </section>`;
}

/**
 * Servidor anterior (sin expediente): no manda `documents`. Si este portal llega
 * a produccion antes que el servidor nuevo, se conserva la firma sola de antes
 * para no dejar a nadie trabado. Se puede borrar cuando el servidor este al dia.
 */
const legacyServer = (a) => isDeployedBundle() && !Array.isArray(a?.documents);

function renderLegacySign() {
  return `
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
      <button type="button" class="btn btn--primary" id="pv-legacy-sign">Firmar y enviar a evaluación</button>
    </section>`;
}

function renderStatusPanel(a) {
  if (a.status === 'en_evaluacion') {
    return `
      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Tu expediente está en revisión</h2>
          <span class="badge badge--blue">En curso</span>
        </div>
        <p class="muted" style="margin:0;">
          Lo recibimos el ${formatDate(a.submittedAt || a.signature?.signedAt || a.signedAt, true)}. Estamos verificando la información de tu empresa.
          Te avisamos por correo apenas terminemos: si todo está bien, aquí mismo aparecerán tu código, tu enlace y tu QR.
        </p>
      </section>`;
  }
  if (a.status === 'rechazado' || a.status === 'vencido') {
    const expired = a.status === 'vencido';
    return `
      <section class="panel">
        <div class="panel__header"><h2 class="panel__title">${expired ? 'Tu acceso temporal venció' : 'Tu convenio no fue aprobado'}</h2></div>
        <p class="muted" style="margin:0 0 14px;">
          ${expired
            ? 'Pasaron los días para completar el expediente sin que lo enviaras.'
            : escapeHtml(a.rejectReason || 'Revisamos tu expediente y por ahora no podemos activar el convenio.')}
          Puedes volver a registrar tu empresa cuando quieras.
        </p>
        <a class="btn btn--primary" href="#/registro">Registrarme de nuevo</a>
      </section>`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

async function currentAlly() {
  if (isDeployedBundle()) return load();
  return demoMode === 'expediente' ? demoExpediente() : demoActiveAlly();
}

async function repaint() {
  const host = document.querySelector('.content');
  if (!host) return;
  host.innerHTML = await CompanyPartnerView.render();
  await CompanyPartnerView.afterRender();
}

export const CompanyPartnerView = {
  async render() {
    const deployed = isDeployedBundle();
    let loadError = '';
    ally = null;
    try { ally = await currentAlly(); } catch (e) { loadError = e.message; }

    if (loadError) {
      return `<section class="panel"><p class="empty-state">No se pudo cargar tu expediente: ${escapeHtml(loadError)}</p></section>`;
    }
    if (!ally) return renderEmpty();

    const st = allyStatus(ally.status);
    const t = ally.tracking || {};
    const months = lastMonths(t.byMonth);
    const max = Math.max(1, ...months.map((m) => m.value));
    const code = ally.partnerCode;
    const editable = EDITABLE_STATES.includes(ally.status);
    const pending = editable || ally.status === 'en_evaluacion';

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
        .pv-doc-box { max-height: 300px; overflow-y: auto; padding: 20px 22px; border: 1px solid #e6ecf4; border-radius: 14px; background: #fbfcfe; margin: 4px 0 18px; }
        .pv-doc-box h3 { font-size: .98rem; margin: 18px 0 8px; color: #061953; }
        .pv-doc-box h3:first-child { margin-top: 0; }
        .pv-doc-box p { margin: 0 0 8px; font-size: .9rem; line-height: 1.65; color: #45546b; }
        .pv-doc-note { margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; background: #fdf0e3; color: #a35b12; font-size: .84rem; }
        .pv-check { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; font-size: .9rem; line-height: 1.5; }
        .pv-demo-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; padding: 10px 14px; border-radius: 12px; background: #fdf6ec; border: 1px solid #f3dfc2; font-size: .84rem; color: #a35b12; font-weight: 600; }
        .pv-demo-bar button { border: 1px solid #e6cfa8; background: #fff; color: #a35b12; border-radius: 999px; padding: 5px 13px; font-weight: 700; font-size: .82rem; cursor: pointer; }
        .pv-demo-bar button.is-active { background: #0a2d66; border-color: #0a2d66; color: #fff; }
        .pv-sign-grid { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 16px; margin: 16px 0 18px; }
        @media (max-width: 760px) { .pv-sign-grid { grid-template-columns: 1fr; } }

        .pv-xp__lead { margin: 0 0 14px; line-height: 1.6; }
        .pv-meter { height: 6px; border-radius: 999px; background: #e8edf5; overflow: hidden; margin-bottom: 16px; }
        .pv-meter span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #0058c1, #1a7f4b); transition: width .5s var(--ease-panel, ease); }
        .pv-files { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
        .pv-file { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 14px 16px; border: 1px solid #e3e9f2; border-radius: 14px; background: #fff; transition: border-color .2s ease, background .2s ease; }
        .pv-file.is-approved { background: #f5fbf7; border-color: #cfe9da; }
        .pv-file.is-fix { background: #fff8f1; border-color: #f3cfa8; }
        .pv-file.is-busy { opacity: .6; pointer-events: none; }
        .pv-file__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: #eef2fb; color: #0a2d66; }
        .pv-file.is-approved .pv-file__icon { background: #1a7f4b; color: #fff; }
        .pv-file.is-fix .pv-file__icon { background: #f0b90f; color: #3b2500; }
        .pv-file.is-ready .pv-file__icon { background: #0a2d66; color: #fff; }
        .pv-file__icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
        .pv-file__text { display: grid; gap: 2px; min-width: 0; }
        .pv-file__text strong { color: #0a2540; font-size: .92rem; }
        .pv-file__hint { color: #45546b; font-size: .82rem; line-height: 1.45; }
        .pv-file__rules { color: #7a8699; font-size: .76rem; }
        .pv-file__name { margin-top: 4px; font-size: .8rem; font-weight: 600; color: #0a2d66; word-break: break-all; }
        .pv-file__note { margin-top: 6px; padding: 7px 10px; border-radius: 8px; background: #fdf0e3; color: #8a4b0f; font-size: .8rem; }
        .pv-file__error { margin-top: 4px; color: #b3261e; font-size: .8rem; font-weight: 600; }
        .pv-file__side { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
        .pv-file__btn { position: relative; overflow: hidden; cursor: pointer; margin: 0; }
        .pv-file__btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; font-size: 0; }
        .pv-file__btn:focus-within { box-shadow: 0 0 0 3px rgba(0, 88, 193, .25); }
        .pv-link-btn { border: 0; background: none; padding: 0; color: #0058c1; font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; }
        @media (max-width: 560px) {
          .pv-file { grid-template-columns: 36px minmax(0, 1fr); }
          .pv-file__side { grid-column: 1 / -1; justify-content: stretch; }
          .pv-file__side .btn { flex: 1; }
        }
        .pv-xp__sign { margin-top: 24px; padding-top: 22px; border-top: 1px solid #e6ecf4; }
        .pv-xp__subtitle { margin: 0 0 10px; font-size: 1rem; font-weight: 800; color: #061953; }
        .pv-xp__submit { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 18px; }
      </style>

      ${!deployed ? `
      <div class="pv-demo-bar">
        <span>Vista de demostración:</span>
        <button type="button" data-demo-mode="expediente" class="${demoMode === 'expediente' ? 'is-active' : ''}">Llenar el expediente</button>
        <button type="button" data-demo-mode="activo" class="${demoMode === 'activo' ? 'is-active' : ''}">Convenio activo</button>
        ${demoMode === 'expediente' ? '<button type="button" id="pv-demo-reset">Empezar de nuevo</button><span style="font-weight:500;">Lo que envíes aquí lo revisa el admin demo en «Aliados», en este navegador.</span>' : ''}
      </div>` : ''}

      <div class="qb-page-hero">
        <div>
          <h1 class="page-title">Mi convenio</h1>
          <p class="page-subtitle"><span class="badge ${st.badge}">${escapeHtml(st.allyLabel)}</span>
            ${pending ? 'Acceso temporal mientras revisamos tu empresa' : `Aliado desde ${formatDate(ally.since || ally.createdAt)}`}</p>
        </div>
        ${pending ? '' : `
        <div class="qb-hero-kpis">
          <div class="qb-hero-kpi"><strong>${Number(t.totalLeads || 0)}</strong><span>Solicitudes por tu enlace</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${Number(t.leadsThisMonth || 0)}</strong><span>Este mes</span></div>
          <div class="qb-hero-kpi qb-hero-kpi--sep"><strong>${Number(t.referredAllies || 0)}</strong><span>Empresas referidas</span></div>
        </div>`}
      </div>

      ${allyStatus(ally.status).step >= 0 ? `
      <section class="panel">
        <div class="panel__header"><h2 class="panel__title">Estado del convenio</h2></div>
        ${renderSteps(ally.status)}
      </section>` : ''}

      ${legacyServer(ally)
        ? (ally.needsSignature ? renderLegacySign() : renderStatusPanel(ally))
        : editable ? renderExpediente(ally) : renderStatusPanel(ally)}

      ${pending ? '' : `
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
            <p class="empty-state" style="padding:20px 12px;">Tu código y tu enlace se generan cuando CS Travel Group da el aval.</p>`}
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
      </div>`}

      <section class="panel">
        <div class="panel__header"><h2 class="panel__title">Documentos</h2></div>
        <div class="pv-doc">
          <div class="pv-doc__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg></div>
          <div class="pv-doc__text">
            <strong>Acuerdo del Programa de Aliados</strong>
            <span class="muted">${ally.signature
              ? `Firmado el ${formatDate(ally.signature.signedAt)} por ${escapeHtml(ally.signature.name)}. La copia descargable aparecerá aquí.`
              : 'Lo firmas en línea junto con tu expediente, sin imprimir ni escanear.'}</span>
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
    // Selector del demo: convenio activo de ejemplo o expediente real del navegador.
    document.querySelectorAll('[data-demo-mode]').forEach((b) => b.addEventListener('click', async () => {
      demoMode = b.dataset.demoMode;
      agreement = null;
      await repaint();
    }));
    document.getElementById('pv-demo-reset')?.addEventListener('click', async () => {
      await resetDemoExpediente();
      showToast('Expediente del demo vacío otra vez.', 'success');
      await repaint();
    });

    if (legacyServer(ally)) bindLegacySign();
    else if (EDITABLE_STATES.includes(ally?.status)) bindExpediente();

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

/** Firma sola del flujo anterior (ver legacyServer). */
async function bindLegacySign() {
  const box = document.getElementById('pv-agreement');
  if (!box) return;
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
  document.getElementById('pv-legacy-sign')?.addEventListener('click', async (event) => {
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
}

/** Eventos del expediente: subir, ver, firmar y reenviar. */
async function bindExpediente() {
  const list = document.getElementById('pv-files');
  if (!list) return;

  // Tras cada subida solo se re-pinta la lista y el avance: lo que la persona
  // ya escribio en la firma no se pierde.
  const refresh = () => {
    list.innerHTML = renderFiles(ally);
    const p = expedienteProgress(ally);
    document.getElementById('pv-progress-badge').innerHTML = progressBadge(ally);
    document.getElementById('pv-meter-fill').style.width = `${Math.round((p.uploaded / p.total) * 100)}%`;
    const btn = document.getElementById('pv-sign-btn') || document.getElementById('pv-resubmit');
    if (btn) btn.disabled = !p.complete;
    const hint = document.getElementById('pv-submit-hint');
    if (hint) {
      const missing = p.total - p.uploaded;
      hint.textContent = p.complete
        ? (ally.status === 'correccion' ? 'Todo listo para reenviar.' : 'Todo listo: firma y envía.')
        : (ally.status === 'correccion' ? 'Reemplaza lo marcado para poder reenviar.' : `Sube ${missing === 1 ? 'el documento que falta' : `los ${missing} documentos que faltan`} para poder enviar.`);
    }
  };

  list.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-pv-upload]');
    if (!input || !input.files.length) return;
    const type = input.dataset.pvUpload;
    const slot = docSlots(ally).find((s) => s.type === type);
    const row = input.closest('.pv-file');
    const error = list.querySelector(`[data-pv-error="${type}"]`);
    error.hidden = true;
    row.classList.add('is-busy');
    const label = input.closest('label')?.querySelector('span');
    if (label) label.textContent = 'Subiendo…';
    try {
      const file = await prepareFile(slot, input.files);
      ally = await expedienteApi.upload(type, file);
      refresh();
      showToast(`${slot.title}: listo.`, 'success');
    } catch (e) {
      row.classList.remove('is-busy');
      if (label) label.textContent = slot.file ? 'Reemplazar' : 'Subir';
      error.textContent = e.message;
      error.hidden = false;
      input.value = '';
    }
  });

  list.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-pv-view]');
    if (!btn) return;
    // La pestaña se abre en el mismo clic (si no, el navegador la bloquea).
    const tab = window.open('', '_blank');
    try {
      const url = await expedienteApi.fileUrl(btn.dataset.pvView);
      if (!url) throw new Error('No encontramos el archivo. Vuelve a subirlo.');
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      showToast(e.message, 'error');
    }
  });

  document.getElementById('pv-resubmit')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      ally = await expedienteApi.resubmit();
      showToast('Recibimos la corrección. Te avisamos por correo cuando terminemos de revisar.', 'success', { title: 'Expediente enviado' });
      await repaint();
    } catch (e) {
      showToast(e.message, 'error');
      btn.disabled = false;
    }
  });

  // Acuerdo: se carga el texto y se habilita la firma.
  const box = document.getElementById('pv-agreement');
  if (!box) return;
  let doc;
  try {
    doc = await loadAgreement();
    box.innerHTML = `
      ${doc.notice ? `<p class="pv-doc-note">${escapeHtml(doc.notice)}</p>` : ''}
      <p>${escapeHtml(doc.intro || '')}</p>
      ${(doc.sections || []).map((sec) => `
        <h3>${escapeHtml(sec.title)}</h3>
        ${sec.body.map((t) => `<p>${escapeHtml(t)}</p>`).join('')}`).join('')}`;
  } catch {
    box.innerHTML = '<p class="muted">No pudimos cargar el acuerdo. Recarga la página.</p>';
  }

  document.getElementById('pv-sign-btn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    const value = (id) => document.getElementById(id).value.trim();
    const checked = (id) => document.getElementById(id).checked;
    if (!doc) return showToast('El acuerdo no cargó. Recarga la página.', 'error');
    if (!checked('pv-accept-terms') || !checked('pv-accept-authority') || !checked('pv-accept-data')) {
      return showToast('Marca las tres casillas para firmar.', 'error');
    }
    const name = value('pv-name');
    const cedula = value('pv-doc').replace(/[^\d]/g, '');
    const position = value('pv-position');
    if (name.split(/\s+/).length < 2) return showToast('Escribe tu nombre completo, como aparece en la cédula.', 'error');
    if (cedula.length < 5 || cedula.length > 12) return showToast('Revisa el número de cédula.', 'error');
    if (!position) return showToast('Escribe tu cargo.', 'error');

    const ok = await confirmDialog({
      title: 'Firmar y enviar',
      message: `<p>Vas a firmar el acuerdo como <strong>${escapeHtml(name)}</strong>, cédula <strong>${escapeHtml(cedula)}</strong>, y a enviar tu expediente a revisión.</p><p>Después de enviarlo no podrás cambiar los documentos, salvo que te pidamos corregir alguno.</p>`,
      confirmLabel: 'Firmar y enviar',
    });
    if (!ok) return;

    btn.disabled = true;
    try {
      ally = await expedienteApi.submit({
        acceptTerms: true,
        acceptAuthority: true,
        acceptData: true,
        name,
        doc: cedula,
        position,
        agreementVersion: doc.version || '',
        agreementHash: await sha256(agreementText(doc)),
      });
      showToast('Recibimos tu expediente. Te avisamos por correo cuando terminemos de revisarlo.', 'success', { title: 'Expediente enviado' });
      await repaint();
    } catch (e) {
      showToast(e.message, 'error');
      btn.disabled = false;
    }
  });
}
