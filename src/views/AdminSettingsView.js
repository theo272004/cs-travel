/**
 * AdminSettingsView.js
 * =============================================================================
 * PROPOSITO:
 *   Configuración del sistema para el admin:
 *     1) Datos legales y de marca del pie de las cotizaciones.
 *        - Portal real (bundle /portal-app/): SOLO LECTURA con la identificación
 *          del ítem W-02 (settingsService.LEGAL_W02). Así todos los operadores
 *          sacan el mismo pie legal. Solo el "Asesor por defecto" se ajusta por
 *          navegador.
 *        - Demo: editables, para probar cómo se ven en el PDF.
 *     2) Tasa para mostrar precios en USD (en el portal real la fija el servidor).
 *     3) Respaldo completo de la información (pregunta 7 de la orden).
 *
 *   El panel de Booking (API key guardada en localStorage que ningún código
 *   usaba) se retiró por el ítem 0.4 de la orden: ninguna credencial de
 *   proveedor puede vivir en el navegador.
 * =============================================================================
 */

import { settingsService } from '../services/settingsService.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { isDeployedBundle } from '../utils/env.js';

/** Campos de la identificación legal, en el orden en que se muestran. */
const LEGAL_FIELDS = [
  { name: 'agencyName', label: 'Nombre comercial' },
  { name: 'legalName', label: 'Razón social' },
  { name: 'nit', label: 'NIT' },
  { name: 'rnt', label: 'RNT (Registro Nacional de Turismo)' },
  { name: 'rntValidity', label: 'Vigencia del RNT' },
  { name: 'registroMercantil', label: 'Matrícula mercantil' },
  { name: 'city', label: 'Domicilio', full: true },
  { name: 'email', label: 'Correo de contacto', type: 'email' },
  { name: 'phones', label: 'Teléfono' },
  { name: 'web', label: 'Sitio web' },
];

function legalReadOnly(company) {
  return `
    <div class="form__alert form__alert--success" style="margin-bottom:14px">
      Identificación legal oficial (ítem W-02). En el portal publicado no se edita desde el navegador:
      así todas las cotizaciones salen con el mismo pie legal.
    </div>
    <dl class="detail-list" style="margin-bottom:18px">
      ${LEGAL_FIELDS.map((f) => `
        <div class="${f.full ? 'detail-list__full' : ''}">
          <dt>${escapeHtml(f.label)}</dt>
          <dd>${escapeHtml(company[f.name] || '—')}</dd>
        </div>`).join('')}
    </dl>
    <p class="muted" style="margin:0 0 14px">
      ¿Cambió algún dato en la Cámara de Comercio o en el RNT? Avísanos y lo actualizamos en el portal
      para todos a la vez.
    </p>
    <form id="company-form" class="form form--grid">
      <div class="form__group">
        <label class="form__label" for="set-advisor">Asesor por defecto</label>
        <input type="text" id="set-advisor" name="advisorName" class="form__input" value="${escapeHtml(company.advisorName)}" maxlength="80" />
        <small class="muted">Nombre que firma tus cotizaciones. Se guarda solo en este navegador.</small>
      </div>
      <div class="form__alert form__group--full" id="company-alert" role="status" hidden></div>
      <div class="form__actions form__group--full">
        <button type="submit" class="btn btn--primary">Guardar asesor</button>
      </div>
    </form>`;
}

function legalEditable(company) {
  return `
    <p class="muted" style="margin-bottom:14px">
      Aparecen en el pie de las cotizaciones que generes. La razón social, el NIT, el RNT y la
      matrícula mercantil deben coincidir con el Registro Nacional de Turismo. En este demo se
      guardan en tu navegador; en el portal publicado son de solo lectura.
    </p>
    <form id="company-form" class="form form--grid">
      ${LEGAL_FIELDS.map((f) => `
        <div class="form__group${f.full ? ' form__group--full' : ''}">
          <label class="form__label" for="set-${escapeHtml(f.name)}">${escapeHtml(f.label)}</label>
          <input type="${f.type || 'text'}" id="set-${escapeHtml(f.name)}" name="${escapeHtml(f.name)}" class="form__input" value="${escapeHtml(company[f.name] || '')}" />
        </div>`).join('')}
      <div class="form__group">
        <label class="form__label" for="set-advisor">Asesor por defecto</label>
        <input type="text" id="set-advisor" name="advisorName" class="form__input" value="${escapeHtml(company.advisorName)}" maxlength="80" />
      </div>
      <div class="form__alert form__group--full" id="company-alert" role="status" hidden></div>
      <div class="form__actions form__group--full">
        <button type="submit" class="btn btn--primary">Guardar datos de la empresa</button>
      </div>
    </form>`;
}

export const AdminSettingsView = {
  async render() {
    const cfg = settingsService.getAll();
    const fx = settingsService.getFx(); // tasa efectiva (servidor en prod, local en demo)
    const locked = settingsService.isLegalLocked();

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Configuración</h1>
          <p class="page-subtitle">Datos legales de las cotizaciones, moneda y respaldo de la información.</p>
        </div>
      </div>

      <section class="panel">
        <h2 class="panel__title">Datos legales y de marca (cotizaciones)</h2>
        ${locked ? legalReadOnly(cfg.company) : legalEditable(cfg.company)}
      </section>

      <section class="panel">
        <h2 class="panel__title">Moneda · mostrar precios en dólares (USD)</h2>
        <p class="muted" style="margin-bottom:14px">
          El cobro <strong>siempre es en pesos (COP)</strong>; esto solo añade el equivalente
          aproximado en USD (“$ X (~USD Y)”) junto a los montos. Es la <strong>misma tasa para
          todos</strong> (admin, empresas y médicos).
        </p>
        ${isDeployedBundle() ? `
          <div class="form__alert form__alert--success" style="margin-bottom:12px">
            Tasa activa: <strong>${(Number(fx.usdToCop) || 0).toLocaleString('es-CO')} COP por USD</strong> ·
            ${fx.showUsd && fx.usdToCop ? 'mostrando USD' : 'USD oculto'}.
          </div>
          <p class="muted" style="margin:0">
            En el portal en vivo la tasa la fija el dueño en el servidor
            (variable <code>CST_USD_TO_COP</code>) para que sea idéntica para todos. Para
            cambiarla, avísanos y la ajustamos en segundos.
          </p>
        ` : `
        <form id="fx-form" class="form form--grid">
          <div class="form__group">
            <label class="form__label" for="set-fx">1 USD = ___ COP</label>
            <input type="number" id="set-fx" name="usdToCop" class="form__input" min="0" step="1"
              value="${Number(cfg.fx.usdToCop) || 0}" placeholder="Ej.: 4000" />
            <small class="muted">Tú la actualizas cuando quieras (no se conecta a ninguna tasa automática).</small>
          </div>
          <div class="form__group">
            <span class="form__label">Mostrar USD</span>
            <label class="checkbox"><input type="checkbox" name="showUsd" ${cfg.fx.showUsd ? 'checked' : ''} /> <span>Ver el equivalente en dólares en todo el portal</span></label>
          </div>
          <div class="form__group form__group--full">
            <p class="muted" id="fx-preview" style="margin:0"></p>
          </div>
          <div class="form__alert form__group--full" id="fx-alert" role="status" hidden></div>
          <div class="form__actions form__group--full">
            <button type="submit" class="btn btn--primary">Guardar tasa de cambio</button>
          </div>
        </form>
        `}
      </section>

      <section class="panel" id="backup-panel">
        <h2 class="panel__title">Respaldo de la información</h2>
        <p class="muted" style="margin-bottom:14px">
          Descarga en un solo archivo todo lo que guarda el portal: aliados, solicitudes, casos, cobros,
          códigos, banners y el registro de correos. Guárdalo en Drive con la fecha. Contiene datos
          personales: no lo compartas. Las claves de la verificación en dos pasos no se incluyen.
        </p>
        <div class="form__actions" style="justify-content:flex-start">
          <button type="button" class="btn btn--primary" id="backup-btn">Descargar respaldo completo</button>
        </div>
        <p class="muted" id="backup-msg" role="status" style="margin:10px 0 0"></p>
      </section>
    `;
  },

  async afterRender() {
    // --- Respaldo completo (pregunta 7 de la orden) ---
    const backupBtn = document.getElementById('backup-btn');
    const backupMsg = document.getElementById('backup-msg');
    backupBtn?.addEventListener('click', async () => {
      if (!isDeployedBundle()) {
        backupMsg.textContent = 'El respaldo se descarga desde el portal publicado (cstravelgroup.com/portal): aquí es un demo sin base real.';
        return;
      }
      backupBtn.disabled = true;
      backupMsg.textContent = 'Preparando el respaldo... puede tardar unos segundos.';
      try {
        const res = await fetch('/api/respaldo', { method: 'POST', credentials: 'same-origin' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Error ${res.status}`);
        }
        const blob = await res.blob();
        const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'respaldo-cstravel.json';
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        backupMsg.textContent = `Listo: ${name}. Guárdalo en un lugar seguro.`;
      } catch (err) {
        backupMsg.textContent = 'No se pudo descargar: ' + err.message;
      } finally {
        backupBtn.disabled = false;
      }
    });

    // --- Datos legales / marca ---
    // En el portal real el formulario solo trae "Asesor por defecto" y el
    // servicio ignora cualquier otro campo (defensa doble).
    const companyForm = document.getElementById('company-form');
    const companyAlert = document.getElementById('company-alert');
    companyForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = {};
      Array.from(companyForm.elements).forEach((el) => {
        if (el.name && typeof el.value === 'string') data[el.name] = el.value.trim();
      });
      settingsService.saveSection('company', data);
      const locked = settingsService.isLegalLocked();
      companyAlert.textContent = locked ? 'Asesor guardado en este navegador.' : 'Datos de la empresa guardados.';
      companyAlert.className = 'form__alert form__alert--success form__group--full';
      companyAlert.hidden = false;
    });

    // --- Moneda / tipo de cambio (USD display). En el bundle desplegado la tasa
    // es de solo lectura (la fija el servidor), asi que el form no existe. ---
    const fxForm = document.getElementById('fx-form');
    if (fxForm) {
      const fxAlert = document.getElementById('fx-alert');
      const fxPreview = document.getElementById('fx-preview');
      const SAMPLE_COP = 4200000;
      const refreshFxPreview = () => {
        const rate = Number(fxForm.usdToCop.value) || 0;
        const on = fxForm.showUsd.checked;
        if (!on || !rate) { fxPreview.textContent = 'Ejemplo: se mostrará solo en pesos.'; return; }
        const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(SAMPLE_COP / rate);
        fxPreview.innerHTML = `Ejemplo: un monto de <strong>$ 4.200.000</strong> se verá como <strong>$ 4.200.000 (~${usd})</strong>.`;
      };
      fxForm.addEventListener('input', refreshFxPreview);
      refreshFxPreview();
      fxForm.addEventListener('submit', (event) => {
        event.preventDefault();
        settingsService.saveSection('fx', {
          usdToCop: Number(fxForm.usdToCop.value) || 0,
          showUsd: fxForm.showUsd.checked,
        });
        fxAlert.textContent = 'Tasa de cambio guardada. Los montos ya reflejan el equivalente en USD.';
        fxAlert.className = 'form__alert form__alert--success form__group--full';
        fxAlert.hidden = false;
      });
    }
  },
};
