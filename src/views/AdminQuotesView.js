/**
 * AdminQuotesView.js
 * =============================================================================
 * PROPOSITO:
 *   Generador de COTIZACIONES editables (estilo "itinerario Ruby Europa"):
 *     - Lista de cotizaciones guardadas.
 *     - Constructor: encabezado (pasajero, ruta, fechas) + bloques dinamicos
 *       (ciudad/hotel/excursiones + precio) + tramos de transporte + incluye /
 *       no incluye + total automatico.
 *     - MARCA BLANCA: presentar la cotizacion con la marca del aliado (o neutra)
 *       en lugar de la de CS Travel.
 *     - Exportar a PDF (ventana imprimible) con el pie legal (RNT) de Config.
 * =============================================================================
 */

import { quoteService, sumPrices, quoteTotal } from '../services/quoteService.js';
import { settingsService } from '../services/settingsService.js';
import { requestService } from '../services/requestService.js';
import { medicalCaseService } from '../services/medicalCaseService.js';
import { companyService } from '../services/companyService.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { ensureSharedDatalists } from '../utils/options.js';

let cachedQuotes = [];
let currentId = null; // id de la cotizacion en edicion (null = nueva)
let pendingRequests = []; // solicitudes enviadas que aun no tienen cotizacion
let prefillFrom = null; // datos pre-cargados desde un caso/solicitud (?from=...)

function renderPendingWidget(items, companiesMap) {
  if (!items.length) return '';
  const PRIORITY_COLOR = { alta: '#d64545', normal: '#0058c1', baja: '#6b7280' };
  const rows = items.map((r) => `
    <a href="#/admin/requests/${r.id}" class="qb-pending-row">
      <span class="qb-pending-row__code">${escapeHtml(r.requestCode)}</span>
      <span class="qb-pending-row__client">${escapeHtml(companiesMap[r.companyId] || '')}</span>
      <span class="qb-pending-row__route muted">${escapeHtml(r.origin)} → ${escapeHtml(r.destination)}</span>
      <span class="qb-pending-row__priority" style="color:${PRIORITY_COLOR[r.priority||'normal']}">
        ${(r.priority||'normal').charAt(0).toUpperCase()+(r.priority||'normal').slice(1)}
      </span>
      <span class="qb-pending-row__date muted">${formatDate(r.createdAt, true)}</span>
    </a>
  `).join('');

  return `
    <section class="panel qb-pending-panel">
      <div class="panel__header">
        <h2 class="panel__title">Cotizaciones pendientes</h2>
        <span class="badge badge--amber">${items.length} pendiente${items.length !== 1 ? 's' : ''}</span>
      </div>
      <p class="muted" style="font-size:0.84rem;margin-bottom:10px;">
        Solicitudes en estado <strong>Solicitud enviada</strong> que aun no tienen cotizacion generada.
      </p>
      <div class="qb-pending-list">${rows}</div>
    </section>
  `;
}

function blockRow(b = {}) {
  return `
    <div class="qb-row qb-row--block">
      <input class="form__input qb-title" placeholder="Destino / bloque (ej. Madrid · 3 noches)" value="${escapeHtml(b.title || '')}" />
      <input class="form__input qb-detail" placeholder="Hotel, excursiones, servicios incluidos..." value="${escapeHtml(b.detail || '')}" />
      <input class="form__input qb-price" type="number" min="0" placeholder="Precio" value="${b.price != null ? b.price : ''}" />
      <button type="button" class="btn btn--ghost btn--sm qb-remove" aria-label="Quitar">✕</button>
    </div>
  `;
}

function transportRow(t = {}) {
  return `
    <div class="qb-row qb-row--transport">
      <input class="form__input qb-date" placeholder="Fecha (ej. 09 Sep)" value="${escapeHtml(t.date || '')}" />
      <input class="form__input qb-detail" placeholder="Tramo / descripcion (ej. Madrid → Barcelona OUIGO)" value="${escapeHtml(t.detail || '')}" />
      <input class="form__input qb-type" placeholder="Tipo" value="${escapeHtml(t.type || '')}" />
      <input class="form__input qb-price" type="number" min="0" placeholder="Precio" value="${t.price != null ? t.price : ''}" />
      <button type="button" class="btn btn--ghost btn--sm qb-remove" aria-label="Quitar">✕</button>
    </div>
  `;
}

function renderList(quotes) {
  if (!quotes.length) {
    return `
      <div class="qb-empty-inline">
        <div class="qb-empty-inline__left">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <div>
            <p class="qb-empty-inline__title">Cotizaciones guardadas</p>
            <p class="qb-empty-inline__sub">Aun no has creado cotizaciones. Usa el generador de abajo.</p>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr><th>Codigo</th><th>Titulo</th><th>Pasajero</th><th>Total</th><th>Actualizada</th><th></th></tr>
        </thead>
        <tbody>
          ${quotes.map((q) => `
            <tr>
              <td><strong>${escapeHtml(q.code)}</strong>${q.whiteLabel ? ' <span class="badge badge--violet">Marca blanca</span>' : ''}</td>
              <td>${escapeHtml(q.title || '—')}</td>
              <td>${escapeHtml(q.passengerName || '—')}</td>
              <td><strong>${formatCurrency(quoteTotal(q))}</strong></td>
              <td>${formatDate(q.updatedAt || q.createdAt, true)}</td>
              <td class="qb-actions">
                <button type="button" class="btn btn--ghost btn--sm" data-action="quote-edit" data-id="${q.id}">Editar</button>
                <button type="button" class="btn btn--ghost btn--sm" data-action="quote-pdf" data-id="${q.id}">PDF</button>
                <button type="button" class="btn btn--ghost btn--sm" data-action="quote-delete" data-id="${q.id}">Eliminar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export const AdminQuotesView = {
  async render(ctx) {
    const [quotes, requests, companies] = await Promise.all([
      quoteService.getAll(),
      requestService.getAll(),
      companyService.getAll(),
    ]);
    cachedQuotes = quotes;
    currentId = null;

    // Pre-carga desde un caso/solicitud ya cotizado (?from=case:id / request:id):
    // el botón "Generar itinerario PDF" del detalle abre el constructor con los
    // datos del pasajero/ruta/fechas ya puestos. Así las 2 cotizaciones se conectan.
    prefillFrom = null;
    const from = ctx?.query?.from || '';
    if (from) {
      const sep = from.indexOf(':');
      const type = from.slice(0, sep), id = from.slice(sep + 1);
      try {
        if (type === 'case') {
          // Cotización nacida de un CASO médico -> marca blanca (del médico/clínica) por defecto.
          const c = await medicalCaseService.getById(id);
          prefillFrom = { isMedical: true, title: `Cotización ${c.caseCode || ''}`.trim(), passengerName: c.patientName || c.fullName || '', document: c.documentNumber || '', nationality: c.nationality || '', origin: c.origin || '', destination: c.destination || '', startDate: c.travelDate || '' };
        } else if (type === 'request') {
          const r = await requestService.getById(id);
          prefillFrom = { isMedical: false, title: `Cotización ${r.requestCode || ''}`.trim(), passengerName: r.fullName || '', document: r.documentNumber || '', nationality: r.nationality || '', origin: r.origin || '', destination: r.destination || '', startDate: r.travelDate || '', pax: r.peopleCount ? `${r.peopleCount} pax` : '' };
        }
      } catch { prefillFrom = null; }
    }

    const companiesMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));
    pendingRequests = requests.filter((r) => r.status === 'solicitud enviada');

    const now = new Date();
    const thisMonthCount = cachedQuotes.filter((q) => {
      const d = new Date(q.createdAt || q.updatedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const totalValue = cachedQuotes.reduce((sum, q) => sum + quoteTotal(q), 0);

    return `
      <!-- Hero compacto con mini KPIs -->
      <div class="qb-page-hero">
        <div>
          <h1 class="page-title">Cotizaciones</h1>
          <p class="page-subtitle">Genera cotizaciones editables tipo itinerario y exportalas a PDF.</p>
        </div>
        <div class="qb-hero-kpis">
          <div class="qb-hero-kpi">
            <strong>${cachedQuotes.length}</strong>
            <span>Creadas</span>
          </div>
          <div class="qb-hero-kpi qb-hero-kpi--sep">
            <strong>${thisMonthCount}</strong>
            <span>Este mes</span>
          </div>
          <div class="qb-hero-kpi qb-hero-kpi--sep">
            <strong>${formatCurrency(totalValue)}</strong>
            <span>Valor total</span>
          </div>
          <div class="qb-hero-kpi qb-hero-kpi--sep qb-hero-kpi--alert">
            <strong>${pendingRequests.length}</strong>
            <span>Pendientes</span>
          </div>
        </div>
      </div>

      <!-- Widget de solicitudes pendientes de cotizar -->
      ${renderPendingWidget(pendingRequests, companiesMap)}

      <!-- Lista de cotizaciones guardadas -->
      <section class="panel qb-saved-panel">
        <div class="panel__header">
          <h2 class="panel__title">Cotizaciones guardadas</h2>
          <span class="table-toolbar__count" id="quotes-count">${cachedQuotes.length}</span>
        </div>
        <div id="quotes-list">${renderList(cachedQuotes)}</div>
      </section>

      <!-- Constructor -->
      <section class="panel qb-builder-panel" id="quote-builder">
        <button type="button" class="qb-builder-toggle" id="qb-toggle" aria-expanded="false">
          <span class="qb-builder-toggle__lead">
            <span class="qb-builder-toggle__plus" aria-hidden="true">+</span>
            <h2 class="panel__title" id="qb-heading">Nueva cotizacion</h2>
          </span>
          <div class="qb-builder-toggle__right">
            <span class="btn btn--ghost btn--sm" id="qb-reset" hidden>&#8635; Nueva (limpiar)</span>
            <svg class="qb-builder-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </button>

        <div id="qb-body" class="qb-builder-body" hidden>
        <form id="qb-form" class="form">

          <!-- Titulo del itinerario -->
          <div class="qb-fieldset qb-fieldset--title">
            <div class="form__group">
              <label class="form__label">Titulo del itinerario</label>
              <input name="title" class="form__input qb-title-input"
                placeholder="Itinerario Europa — Espana, Francia, Italia (14 dias)" />
            </div>
          </div>

          <!-- Seccion: Viajero -->
          <div class="qb-fieldset">
            <div class="qb-fieldset__legend">Viajero</div>
            <div class="qb-fieldset__grid">
              <div class="form__group">
                <label class="form__label">Pasajero</label>
                <input name="passengerName" class="form__input" placeholder="Nombre completo" />
              </div>
              <div class="form__group">
                <label class="form__label">Documento</label>
                <input name="document" class="form__input" placeholder="Pasaporte / cedula" />
              </div>
              <div class="form__group">
                <label class="form__label">Nacionalidad</label>
                <input name="nationality" class="form__input" list="dl-nationalities" autocomplete="off" placeholder="Selecciona nacionalidad" />
              </div>
              <div class="form__group">
                <label class="form__label">Pasajeros</label>
                <input name="pax" class="form__input" placeholder="1 adulto" />
              </div>
            </div>
          </div>

          <!-- Seccion: Itinerario -->
          <div class="qb-fieldset">
            <div class="qb-fieldset__legend">Itinerario</div>
            <div class="qb-fieldset__grid">
              <div class="form__group">
                <label class="form__label">Origen</label>
                <input name="origin" class="form__input" list="dl-cities" autocomplete="off" placeholder="Ciudad de origen" />
              </div>
              <div class="form__group">
                <label class="form__label">Destino(s)</label>
                <input name="destination" class="form__input" list="dl-cities" autocomplete="off" placeholder="Madrid - Barcelona - Paris - Roma" />
              </div>
              <div class="form__group">
                <label class="form__label">Fecha de ida</label>
                <input name="startDate" type="date" class="form__input" />
              </div>
              <div class="form__group">
                <label class="form__label">Fecha de regreso</label>
                <input name="endDate" type="date" class="form__input" />
              </div>
            </div>
          </div>

          <!-- Seccion: Resumen -->
          <div class="qb-fieldset">
            <div class="qb-fieldset__legend">Resumen <span class="qb-optional">opcional</span></div>
            <div class="form__group">
              <label class="form__label">Subtitulo del itinerario</label>
              <input name="summary" class="form__input"
                placeholder="14 dias / 13 noches · 6 ciudades" />
            </div>
          </div>

          <!-- Seccion: Bloques del itinerario -->
          <div class="qb-fieldset">
            <div class="qb-section-head">
              <div class="qb-fieldset__legend">Bloques del itinerario</div>
              <button type="button" class="btn btn--ghost btn--sm" id="qb-add-block">+ Agregar bloque</button>
            </div>
            <div id="qb-blocks">${blockRow()}</div>
          </div>

          <!-- Seccion: Transporte -->
          <div class="qb-fieldset">
            <div class="qb-section-head">
              <div class="qb-fieldset__legend">Tramos de transporte <span class="qb-optional">opcional</span></div>
              <button type="button" class="btn btn--ghost btn--sm" id="qb-add-transport">+ Agregar tramo</button>
            </div>
            <div id="qb-transport"></div>
          </div>

          <!-- Seccion: Condiciones -> lo que INCLUYE la cotizacion (chips).
               Escribe arriba + Agregar; los items aparecen abajo en "Incluye". -->
          <div class="qb-fieldset">
            <div class="qb-fieldset__legend">Condiciones</div>
            <div class="qb-conditions-add">
              <input type="text" class="form__input" id="inc-chip-input"
                placeholder="Ej: Hoteles con desayuno, traslados incluidos..." />
              <button type="button" class="btn btn--ghost btn--sm" id="inc-chip-btn">+ Agregar</button>
            </div>
            <span class="qb-conditions-col__label qb-conditions-col__label--inc">Incluye</span>
            <div class="qb-chips-wrap" id="inc-chips-wrap"></div>
            <textarea name="includes" id="qb-includes" hidden></textarea>
          </div>

          <!-- Seccion: Marca blanca (switch moderno) -->
          <div class="qb-fieldset qb-fieldset--switch">
            <div class="qb-switch-row">
              <div class="qb-switch-info">
                <div class="qb-fieldset__legend">Marca blanca</div>
                <p class="qb-switch-desc">Presenta esta cotizacion con la marca de tu aliado en lugar de CS Travel.</p>
              </div>
              <label class="qb-switch-toggle">
                <input type="checkbox" name="whiteLabel" id="qb-white" />
                <span class="qb-switch-track"><span class="qb-switch-thumb"></span></span>
              </label>
            </div>
            <div class="qb-brand-fields qb-fieldset__grid" hidden>
              <div class="form__group">
                <label class="form__label">Marca a mostrar</label>
                <input name="brandName" class="form__input" placeholder="Nombre de la agencia aliada" />
              </div>
              <div class="form__group">
                <label class="form__label">Contacto a mostrar</label>
                <input name="brandContact" class="form__input" placeholder="Telefono / email / web del aliado" />
              </div>
            </div>
          </div>

          <!-- Total como tarjeta financiera -->
          <div class="qb-total-card">
            <div class="qb-total-card__icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="qb-total-card__meta">
              <span class="qb-total-card__label">Total estimado</span>
              <span class="qb-total-card__sub">Actualizacion en tiempo real</span>
            </div>
            <strong class="qb-total-card__value" id="qb-total-value">$ 0</strong>
          </div>

          <div class="form__alert" id="qb-alert" hidden></div>

          <div class="form__actions qb-form-actions">
            <button type="button" class="btn btn--ghost" id="qb-cancel">Cancelar</button>
            <button type="button" class="btn btn--ghost" id="qb-preview">Vista previa / PDF</button>
            <button type="submit" class="btn btn--primary">Crear cotizacion &rarr;</button>
          </div>

        </form>
        </div>
      </section>
    `;
  },

  async afterRender() {
    const form        = document.getElementById('qb-form');
    const blocksBox   = document.getElementById('qb-blocks');
    const transportBox= document.getElementById('qb-transport');
    const totalValue  = document.getElementById('qb-total-value');
    const alertEl     = document.getElementById('qb-alert');
    const heading     = document.getElementById('qb-heading');
    const resetBtn    = document.getElementById('qb-reset');
    const whiteToggle = document.getElementById('qb-white');
    const listBox     = document.getElementById('quotes-list');
    const countBox    = document.getElementById('quotes-count');
    const submitBtn   = form.querySelector('button[type="submit"]');

    ensureSharedDatalists(); // listas buscables (ciudades, nacionalidad) en el builder

    // Toggle collapse del builder
    const toggleBtn = document.getElementById('qb-toggle');
    const builderBody = document.getElementById('qb-body');
    toggleBtn.addEventListener('click', (e) => {
      if (e.target.closest('#qb-reset')) return;
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      builderBody.hidden = expanded;
    });

    // Pre-carga desde un caso/solicitud (?from=...): rellena el header del
    // constructor y lo abre, para no re-escribir pasajero/ruta/fechas a mano.
    if (prefillFrom && form) {
      const setVal = (n, v) => { if (form[n] && v) form[n].value = v; };
      setVal('title', prefillFrom.title);
      setVal('passengerName', prefillFrom.passengerName);
      setVal('document', prefillFrom.document);
      setVal('nationality', prefillFrom.nationality);
      setVal('origin', prefillFrom.origin);
      setVal('destination', prefillFrom.destination);
      setVal('startDate', prefillFrom.startDate);
      setVal('pax', prefillFrom.pax);
      // Marca blanca ENCENDIDA por defecto si la cotización nace de un caso
      // médico/clínica (para empresas queda apagada). `toggleBrand` aún no está
      // definido en esta posición, así que revelamos los campos de marca inline.
      if (prefillFrom.isMedical && whiteToggle && !whiteToggle.checked) {
        whiteToggle.checked = true;
        document.querySelectorAll('.qb-brand-fields').forEach((el) => { el.hidden = false; });
      }
      toggleBtn.setAttribute('aria-expanded', 'true');
      builderBody.hidden = false;
      builderBody.scrollIntoView({ behavior: 'smooth', block: 'start' });
      prefillFrom = null;
    }

    // --- Chip lists para Incluye / No incluye ---
    function setupChipList(textareaId, wrapId, inputId, btnId, isInc) {
      const textarea = document.getElementById(textareaId);
      const wrap     = document.getElementById(wrapId);
      const input    = document.getElementById(inputId);
      const btn      = document.getElementById(btnId);

      const getItems = () => textarea.value.split('\n').map((s) => s.trim()).filter(Boolean);

      const render = () => {
        const items = getItems();
        if (!items.length) {
          wrap.innerHTML = `<span class="qb-chips-empty">Sin ítems ${isInc ? 'incluidos' : 'excluidos'} · agrega arriba</span>`;
          return;
        }
        wrap.innerHTML = items.map((item, i) => `
          <span class="qb-chip ${isInc ? 'qb-chip--inc' : 'qb-chip--exc'}">
            <span class="qb-chip__icon">${isInc ? '✓' : '✕'}</span>
            <span class="qb-chip__text">${escapeHtml(item)}</span>
            <button type="button" class="qb-chip__rm" data-i="${i}" aria-label="Quitar">×</button>
          </span>
        `).join('');
      };

      const addItem = () => {
        const val = input.value.trim();
        if (!val) return;
        const items = getItems();
        items.push(val);
        textarea.value = items.join('\n');
        input.value = '';
        render();
      };

      btn.addEventListener('click', addItem);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
      wrap.addEventListener('click', (e) => {
        const rm = e.target.closest('.qb-chip__rm');
        if (!rm) return;
        const items = getItems();
        items.splice(Number(rm.dataset.i), 1);
        textarea.value = items.join('\n');
        render();
      });

      render();
      return render;
    }

    const refreshInc = setupChipList('qb-includes', 'inc-chips-wrap', 'inc-chip-input', 'inc-chip-btn', true);

    // --- Total en vivo (lee todos los precios del DOM) ---
    const recalcTotal = () => {
      const prices = [...form.querySelectorAll('.qb-price')].map((i) => Number(i.value) || 0);
      totalValue.textContent = formatCurrency(prices.reduce((a, b) => a + b, 0));
    };

    // --- Lee el formulario completo a un objeto cotizacion ---
    const readForm = () => {
      const blocks = [...blocksBox.querySelectorAll('.qb-row')].map((r) => ({
        title:  r.querySelector('.qb-title').value.trim(),
        detail: r.querySelector('.qb-detail').value.trim(),
        price:  Number(r.querySelector('.qb-price').value) || 0,
      })).filter((b) => b.title || b.detail || b.price);

      const transport = [...transportBox.querySelectorAll('.qb-row')].map((r) => ({
        date:   r.querySelector('.qb-date').value.trim(),
        detail: r.querySelector('.qb-detail').value.trim(),
        type:   r.querySelector('.qb-type').value.trim(),
        price:  Number(r.querySelector('.qb-price').value) || 0,
      })).filter((t) => t.detail || t.price);

      const lines = (name) => form[name].value.split('\n').map((s) => s.trim()).filter(Boolean);

      return {
        title:        form.title.value.trim(),
        passengerName:form.passengerName.value.trim(),
        document:     form.document.value.trim(),
        nationality:  form.nationality.value.trim(),
        pax:          form.pax.value.trim(),
        origin:       form.origin.value.trim(),
        destination:  form.destination.value.trim(),
        startDate:    form.startDate.value,
        endDate:      form.endDate.value,
        summary:      form.summary.value.trim(),
        blocks,
        transport,
        includes:     lines('includes'),
        whiteLabel:   form.whiteLabel.checked,
        brandName:    form.brandName.value.trim(),
        brandContact: form.brandContact.value.trim(),
      };
    };

    // --- Carga una cotizacion guardada en el formulario (editar) ---
    const fillForm = (q) => {
      currentId = q.id;
      heading.textContent = `Editando ${q.code}`;
      resetBtn.hidden = false;
      if (submitBtn) submitBtn.innerHTML = 'Guardar cambios';
      form.title.value         = q.title || '';
      form.passengerName.value = q.passengerName || '';
      form.document.value      = q.document || '';
      form.nationality.value   = q.nationality || '';
      form.pax.value           = q.pax || '';
      form.origin.value        = q.origin || '';
      form.destination.value   = q.destination || '';
      form.startDate.value     = q.startDate || '';
      form.endDate.value       = q.endDate || '';
      form.summary.value       = q.summary || '';
      form.includes.value      = (q.includes || []).join('\n');
      form.whiteLabel.checked  = !!q.whiteLabel;
      form.brandName.value     = q.brandName || '';
      form.brandContact.value  = q.brandContact || '';
      blocksBox.innerHTML   = (q.blocks && q.blocks.length ? q.blocks : [{}]).map(blockRow).join('');
      transportBox.innerHTML= (q.transport || []).map(transportRow).join('');
      refreshInc();
      toggleBrand();
      recalcTotal();
      toggleBtn.setAttribute('aria-expanded', 'true');
      builderBody.hidden = false;
      document.getElementById('quote-builder').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const resetForm = () => {
      currentId = null;
      heading.textContent = 'Nueva cotizacion';
      resetBtn.hidden = true;
      if (submitBtn) submitBtn.innerHTML = 'Crear cotizacion &rarr;';
      form.reset();
      blocksBox.innerHTML    = blockRow();
      transportBox.innerHTML = '';
      refreshInc();
      toggleBrand();
      recalcTotal();
    };

    const toggleBrand = () => {
      document.querySelectorAll('.qb-brand-fields').forEach((el) => { el.hidden = !whiteToggle.checked; });
    };

    // --- Eventos: agregar / quitar filas, total en vivo ---
    document.getElementById('qb-add-block').addEventListener('click', () => {
      blocksBox.insertAdjacentHTML('beforeend', blockRow());
    });
    document.getElementById('qb-add-transport').addEventListener('click', () => {
      transportBox.insertAdjacentHTML('beforeend', transportRow());
    });
    form.addEventListener('click', (e) => {
      const rm = e.target.closest('.qb-remove');
      if (rm) { rm.closest('.qb-row').remove(); recalcTotal(); }
    });
    form.addEventListener('input', (e) => {
      if (e.target.classList.contains('qb-price')) recalcTotal();
    });
    whiteToggle.addEventListener('change', toggleBrand);
    resetBtn.addEventListener('click', resetForm);
    document.getElementById('qb-cancel').addEventListener('click', resetForm);

    // --- Guardar ---
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertEl.hidden = true;
      const data = readForm();
      if (!data.title) {
        alertEl.textContent = 'Ponle un titulo a la cotizacion.';
        alertEl.className = 'form__alert';
        alertEl.hidden = false;
        return;
      }
      try {
        if (currentId) {
          await quoteService.update(currentId, data);
        } else {
          await quoteService.create(data);
        }
        cachedQuotes = await quoteService.getAll();
        listBox.innerHTML  = renderList(cachedQuotes);
        countBox.textContent = String(cachedQuotes.length);
        alertEl.textContent = 'Cotizacion guardada correctamente.';
        alertEl.className = 'form__alert form__alert--success';
        alertEl.hidden = false;
        resetForm();
      } catch (error) {
        alertEl.textContent = `No se pudo guardar: ${error.message}`;
        alertEl.className = 'form__alert';
        alertEl.hidden = false;
      }
    });

    // --- Vista previa / PDF ---
    document.getElementById('qb-preview').addEventListener('click', () => {
      const data = readForm();
      data.code = currentId
        ? (cachedQuotes.find((q) => String(q.id) === String(currentId))?.code || 'BORRADOR')
        : 'BORRADOR';
      openQuotePdf(data, settingsService.getCompany());
    });

    // --- Acciones de la lista (editar / pdf / eliminar) ---
    listBox.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const q = cachedQuotes.find((x) => String(x.id) === String(btn.dataset.id));
      if (!q) return;

      if (btn.dataset.action === 'quote-edit')   fillForm(q);
      if (btn.dataset.action === 'quote-pdf')    openQuotePdf(q, settingsService.getCompany());
      if (btn.dataset.action === 'quote-delete') {
        if (!window.confirm(`¿Eliminar la cotizacion ${q.code}?`)) return;
        await quoteService.remove(q.id);
        cachedQuotes = await quoteService.getAll();
        listBox.innerHTML    = renderList(cachedQuotes);
        countBox.textContent = String(cachedQuotes.length);
      }
    });

    recalcTotal();
  },
};

/* ---------------------------------------------------------------------------
 * Exportacion a PDF (ventana imprimible) estilo itinerario.
 * Honra la MARCA BLANCA: en ese modo usa la marca/contacto del aliado y omite
 * la identidad y el RNT de CS Travel.
 * ------------------------------------------------------------------------- */
function openQuotePdf(q, company) {
  const total          = quoteTotal(q);
  const blocksTotal    = sumPrices(q.blocks);
  const transportTotal = sumPrices(q.transport);
  const wl = q.whiteLabel;

  const brand = wl ? (q.brandName || 'Agencia de viajes') : company.agencyName;
  const contactLine = wl
    ? (q.brandContact || '')
    : `${company.email} · ${company.phones} · ${company.web}`;
  const legalLine = wl
    ? ''
    : `RNT: ${company.rnt} · Registro Mercantil: ${company.registroMercantil} · ${company.city}`;

  const win = window.open('', '_blank');
  if (!win) {
    window.alert('Tu navegador bloqueo la ventana. Permite ventanas emergentes para ver la cotizacion.');
    return;
  }

  const datesLine = [q.startDate && formatDate(q.startDate), q.endDate && formatDate(q.endDate)]
    .filter(Boolean).join('  →  ');

  const blocksRows = (q.blocks || []).filter((b) => b.title || b.detail || b.price).map((b) => `
    <tr>
      <td><strong>${escapeHtml(b.title || '')}</strong>${b.detail ? `<br/><span class="muted">${escapeHtml(b.detail)}</span>` : ''}</td>
      <td class="num">${b.price ? formatCurrency(b.price) : ''}</td>
    </tr>`).join('');

  const transportRows = (q.transport || []).filter((t) => t.detail || t.price).map((t) => `
    <tr>
      <td>${t.date ? `<strong>${escapeHtml(t.date)}</strong> · ` : ''}${escapeHtml(t.detail || '')}${t.type ? ` <span class="muted">(${escapeHtml(t.type)})</span>` : ''}</td>
      <td class="num">${t.price ? formatCurrency(t.price) : ''}</td>
    </tr>`).join('');

  const list = (items) => (items && items.length)
    ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    : '<p class="muted">—</p>';

  win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" />
<title>${escapeHtml(q.code || 'Cotizacion')} - ${escapeHtml(brand)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #16233a; margin: 40px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #0a2540; padding-bottom:16px; }
  .brand { font-size:1.6rem; font-weight:800; color:#0a2540; letter-spacing:.04em; }
  .muted { color:#6b7787; font-size:.88rem; }
  h1.title { font-size:1.25rem; color:#0a2540; margin:22px 0 4px; }
  h2 { color:#0a2540; margin-top:26px; font-size:1.05rem; border-left:4px solid #1d6fd8; padding-left:10px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  td { padding:9px 0; border-bottom:1px solid #e8ecf1; font-size:.95rem; vertical-align:top; }
  td.num { text-align:right; white-space:nowrap; font-weight:700; width:30%; }
  ul { margin:8px 0; padding-left:18px; } li { margin:4px 0; font-size:.93rem; }
  .grid2 { display:flex; gap:30px; } .grid2 > div { flex:1; }
  .total { margin-top:24px; padding:18px 22px; background:#0a2540; color:#fff; border-radius:12px; display:flex; justify-content:space-between; align-items:center; }
  .total strong { font-size:1.7rem; }
  .subtotals { margin-top:10px; font-size:.9rem; color:#6b7787; display:flex; gap:24px; }
  .foot { margin-top:34px; font-size:.78rem; color:#97a1ad; border-top:1px solid #e8ecf1; padding-top:12px; }
  .meta td:first-child { color:#6b7787; width:32%; }
  @media print { body { margin:14px; } }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="brand">${escapeHtml(brand)}</div>
      <div class="muted">${escapeHtml(wl ? 'Agencia de viajes' : 'Travel & Corporate')}</div>
    </div>
    <div class="muted" style="text-align:right">
      Cotizacion ${escapeHtml(q.code || '')}<br/>
      ${contactLine ? escapeHtml(contactLine) : ''}
    </div>
  </div>

  <h1 class="title">${escapeHtml(q.title || 'Itinerario de viaje')}</h1>
  ${q.summary ? `<div class="muted">${escapeHtml(q.summary)}</div>` : ''}

  <h2>Datos del viaje</h2>
  <table class="meta">
    ${q.passengerName ? `<tr><td>Pasajero</td><td>${escapeHtml(q.passengerName)}${q.pax ? ` · ${escapeHtml(q.pax)}` : ''}</td></tr>` : ''}
    ${q.document ? `<tr><td>Documento</td><td>${escapeHtml(q.document)}${q.nationality ? ` · ${escapeHtml(q.nationality)}` : ''}</td></tr>` : ''}
    ${(q.origin || q.destination) ? `<tr><td>Ruta</td><td>${escapeHtml(q.origin || '')}${q.destination ? ` → ${escapeHtml(q.destination)}` : ''}</td></tr>` : ''}
    ${datesLine ? `<tr><td>Fechas</td><td>${escapeHtml(datesLine)}</td></tr>` : ''}
  </table>

  ${blocksRows ? `<h2>Itinerario y servicios</h2><table>${blocksRows}</table>` : ''}
  ${transportRows ? `<h2>Transporte e interconexion</h2><table>${transportRows}</table>` : ''}

  ${q.includes && q.includes.length ? `
  <h2>Condiciones</h2>
  <div><strong>Incluye</strong>${list(q.includes)}</div>` : ''}

  <div class="total">
    <span>Total de la cotizacion</span>
    <strong>${formatCurrency(total)}</strong>
  </div>
  <div class="subtotals">
    ${blocksTotal    ? `<span>Servicios: ${formatCurrency(blocksTotal)}</span>` : ''}
    ${transportTotal ? `<span>Transporte: ${formatCurrency(transportTotal)}</span>` : ''}
  </div>

  <div class="foot">
    Cotizacion sujeta a disponibilidad y a re-cotizacion a las tarifas vigentes al momento de la reserva.
    ${company.advisorName && !wl ? `<br/>Asesor: ${escapeHtml(company.advisorName)} · ${escapeHtml(brand)}.` : ''}
    ${legalLine ? `<br/>${escapeHtml(legalLine)}` : ''}
  </div>
  <script>window.print();</scr` + `ipt>
</body></html>`);
  win.document.close();
}
