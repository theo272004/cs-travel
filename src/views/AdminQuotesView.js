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
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

let cachedQuotes = [];
let currentId = null; // id de la cotizacion en edicion (null = nueva)

function blockRow(b = {}) {
  return `
    <div class="qb-row qb-row--block">
      <input class="form__input qb-title" placeholder="Bloque (ej. Madrid - 3 noches)" value="${escapeHtml(b.title || '')}" />
      <input class="form__input qb-detail" placeholder="Hotel, noches, excursiones incluidas..." value="${escapeHtml(b.detail || '')}" />
      <input class="form__input qb-price" type="number" min="0" placeholder="Precio" value="${b.price != null ? b.price : ''}" />
      <button type="button" class="btn btn--ghost btn--sm qb-remove" aria-label="Quitar">✕</button>
    </div>
  `;
}

function transportRow(t = {}) {
  return `
    <div class="qb-row qb-row--transport">
      <input class="form__input qb-date" placeholder="Fecha (ej. 09 Sep)" value="${escapeHtml(t.date || '')}" />
      <input class="form__input qb-detail" placeholder="Tramo / descripcion (ej. Madrid -> Barcelona OUIGO)" value="${escapeHtml(t.detail || '')}" />
      <input class="form__input qb-type" placeholder="Tipo" value="${escapeHtml(t.type || '')}" />
      <input class="form__input qb-price" type="number" min="0" placeholder="Precio" value="${t.price != null ? t.price : ''}" />
      <button type="button" class="btn btn--ghost btn--sm qb-remove" aria-label="Quitar">✕</button>
    </div>
  `;
}

function renderList(quotes) {
  if (!quotes.length) {
    return '<p class="empty-state">Aun no has creado cotizaciones. Usa el generador de abajo.</p>';
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
  async render() {
    cachedQuotes = await quoteService.getAll();
    currentId = null;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Cotizaciones</h1>
          <p class="page-subtitle">Genera cotizaciones editables tipo itinerario y exportalas a PDF.</p>
        </div>
      </div>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">Cotizaciones guardadas</h2>
          <span class="table-toolbar__count" id="quotes-count">${cachedQuotes.length}</span>
        </div>
        <div id="quotes-list">${renderList(cachedQuotes)}</div>
      </section>

      <section class="panel" id="quote-builder">
        <div class="panel__header">
          <h2 class="panel__title" id="qb-heading">Nueva cotizacion</h2>
          <button type="button" class="btn btn--ghost btn--sm" id="qb-reset" hidden>Nueva (limpiar)</button>
        </div>

        <form id="qb-form" class="form form--grid">
          <div class="form__group form__group--full">
            <label class="form__label">Titulo del itinerario</label>
            <input name="title" class="form__input" placeholder="Itinerario Europa - Espana, Francia, Italia (14 dias)" />
          </div>
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
            <input name="nationality" class="form__input" />
          </div>
          <div class="form__group">
            <label class="form__label">Pasajeros</label>
            <input name="pax" class="form__input" placeholder="1 adulto" />
          </div>
          <div class="form__group">
            <label class="form__label">Origen</label>
            <input name="origin" class="form__input" />
          </div>
          <div class="form__group">
            <label class="form__label">Destino(s)</label>
            <input name="destination" class="form__input" placeholder="Madrid - Barcelona - Paris - Roma" />
          </div>
          <div class="form__group">
            <label class="form__label">Fecha de ida</label>
            <input name="startDate" type="date" class="form__input" />
          </div>
          <div class="form__group">
            <label class="form__label">Fecha de regreso</label>
            <input name="endDate" type="date" class="form__input" />
          </div>
          <div class="form__group form__group--full">
            <label class="form__label">Resumen / subtitulo</label>
            <input name="summary" class="form__input" placeholder="14 dias / 13 noches - 6 ciudades" />
          </div>

          <!-- Bloques (ciudades / hoteles / excursiones) -->
          <div class="form__group form__group--full">
            <div class="qb-section-head">
              <span class="form__label">Bloques del itinerario</span>
              <button type="button" class="btn btn--ghost btn--sm" id="qb-add-block">+ Agregar bloque</button>
            </div>
            <div id="qb-blocks">${blockRow()}</div>
          </div>

          <!-- Transporte -->
          <div class="form__group form__group--full">
            <div class="qb-section-head">
              <span class="form__label">Tramos de transporte (opcional)</span>
              <button type="button" class="btn btn--ghost btn--sm" id="qb-add-transport">+ Agregar tramo</button>
            </div>
            <div id="qb-transport"></div>
          </div>

          <div class="form__group">
            <label class="form__label">Incluye (uno por linea)</label>
            <textarea name="includes" class="form__input" rows="5" placeholder="Hoteles con desayuno&#10;Excursiones con entradas&#10;Traslados"></textarea>
          </div>
          <div class="form__group">
            <label class="form__label">No incluye (uno por linea)</label>
            <textarea name="excludes" class="form__input" rows="5" placeholder="Tiquetes aereos internacionales&#10;Gastos personales&#10;Seguro medico"></textarea>
          </div>

          <!-- Marca blanca -->
          <div class="form__group form__group--full">
            <label class="checkbox"><input type="checkbox" name="whiteLabel" id="qb-white" /> <span><strong>Marca blanca</strong> — presentar sin la marca de CS Travel</span></label>
          </div>
          <div class="form__group qb-brand-fields" hidden>
            <label class="form__label">Marca a mostrar</label>
            <input name="brandName" class="form__input" placeholder="Nombre de la agencia aliada" />
          </div>
          <div class="form__group qb-brand-fields" hidden>
            <label class="form__label">Contacto a mostrar</label>
            <input name="brandContact" class="form__input" placeholder="Telefono / email / web del aliado" />
          </div>

          <div class="qb-total form__group--full">
            <span>Total de la cotizacion</span>
            <strong id="qb-total-value">$ 0</strong>
          </div>

          <div class="form__alert form__group--full" id="qb-alert" hidden></div>
          <div class="form__actions form__group--full">
            <button type="button" class="btn btn--ghost" id="qb-preview">Vista previa / PDF</button>
            <button type="submit" class="btn btn--primary">Guardar cotizacion</button>
          </div>
        </form>
      </section>
    `;
  },

  async afterRender() {
    const form = document.getElementById('qb-form');
    const blocksBox = document.getElementById('qb-blocks');
    const transportBox = document.getElementById('qb-transport');
    const totalValue = document.getElementById('qb-total-value');
    const alert = document.getElementById('qb-alert');
    const heading = document.getElementById('qb-heading');
    const resetBtn = document.getElementById('qb-reset');
    const whiteToggle = document.getElementById('qb-white');
    const listBox = document.getElementById('quotes-list');
    const countBox = document.getElementById('quotes-count');

    // --- Total en vivo (lee todos los precios del DOM) ---
    const recalcTotal = () => {
      const prices = [...form.querySelectorAll('.qb-price')].map((i) => Number(i.value) || 0);
      totalValue.textContent = formatCurrency(prices.reduce((a, b) => a + b, 0));
    };

    // --- Lee el formulario completo a un objeto cotizacion ---
    const readForm = () => {
      const blocks = [...blocksBox.querySelectorAll('.qb-row')].map((r) => ({
        title: r.querySelector('.qb-title').value.trim(),
        detail: r.querySelector('.qb-detail').value.trim(),
        price: Number(r.querySelector('.qb-price').value) || 0,
      })).filter((b) => b.title || b.detail || b.price);

      const transport = [...transportBox.querySelectorAll('.qb-row')].map((r) => ({
        date: r.querySelector('.qb-date').value.trim(),
        detail: r.querySelector('.qb-detail').value.trim(),
        type: r.querySelector('.qb-type').value.trim(),
        price: Number(r.querySelector('.qb-price').value) || 0,
      })).filter((t) => t.detail || t.price);

      const lines = (name) => form[name].value.split('\n').map((s) => s.trim()).filter(Boolean);

      return {
        title: form.title.value.trim(),
        passengerName: form.passengerName.value.trim(),
        document: form.document.value.trim(),
        nationality: form.nationality.value.trim(),
        pax: form.pax.value.trim(),
        origin: form.origin.value.trim(),
        destination: form.destination.value.trim(),
        startDate: form.startDate.value,
        endDate: form.endDate.value,
        summary: form.summary.value.trim(),
        blocks,
        transport,
        includes: lines('includes'),
        excludes: lines('excludes'),
        whiteLabel: form.whiteLabel.checked,
        brandName: form.brandName.value.trim(),
        brandContact: form.brandContact.value.trim(),
      };
    };

    // --- Carga una cotizacion guardada en el formulario (editar) ---
    const fillForm = (q) => {
      currentId = q.id;
      heading.textContent = `Editando ${q.code}`;
      resetBtn.hidden = false;
      form.title.value = q.title || '';
      form.passengerName.value = q.passengerName || '';
      form.document.value = q.document || '';
      form.nationality.value = q.nationality || '';
      form.pax.value = q.pax || '';
      form.origin.value = q.origin || '';
      form.destination.value = q.destination || '';
      form.startDate.value = q.startDate || '';
      form.endDate.value = q.endDate || '';
      form.summary.value = q.summary || '';
      form.includes.value = (q.includes || []).join('\n');
      form.excludes.value = (q.excludes || []).join('\n');
      form.whiteLabel.checked = !!q.whiteLabel;
      form.brandName.value = q.brandName || '';
      form.brandContact.value = q.brandContact || '';
      blocksBox.innerHTML = (q.blocks && q.blocks.length ? q.blocks : [{}]).map(blockRow).join('');
      transportBox.innerHTML = (q.transport || []).map(transportRow).join('');
      toggleBrand();
      recalcTotal();
      document.getElementById('quote-builder').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const resetForm = () => {
      currentId = null;
      heading.textContent = 'Nueva cotizacion';
      resetBtn.hidden = true;
      form.reset();
      blocksBox.innerHTML = blockRow();
      transportBox.innerHTML = '';
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

    // --- Guardar ---
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alert.hidden = true;
      const data = readForm();
      if (!data.title) {
        alert.textContent = 'Ponle un titulo a la cotizacion.';
        alert.className = 'form__alert';
        alert.hidden = false;
        return;
      }
      try {
        if (currentId) {
          await quoteService.update(currentId, data);
        } else {
          await quoteService.create(data);
        }
        cachedQuotes = await quoteService.getAll();
        listBox.innerHTML = renderList(cachedQuotes);
        countBox.textContent = String(cachedQuotes.length);
        alert.textContent = 'Cotizacion guardada correctamente.';
        alert.className = 'form__alert form__alert--success';
        alert.hidden = false;
        resetForm();
      } catch (error) {
        alert.textContent = `No se pudo guardar: ${error.message}`;
        alert.className = 'form__alert';
        alert.hidden = false;
      }
    });

    // --- Vista previa / PDF de lo que esta en el formulario ahora ---
    document.getElementById('qb-preview').addEventListener('click', () => {
      const data = readForm();
      data.code = currentId ? (cachedQuotes.find((q) => String(q.id) === String(currentId))?.code || 'BORRADOR') : 'BORRADOR';
      openQuotePdf(data, settingsService.getCompany());
    });

    // --- Acciones de la lista (editar / pdf / eliminar) ---
    listBox.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const q = cachedQuotes.find((x) => String(x.id) === String(btn.dataset.id));
      if (!q) return;

      if (btn.dataset.action === 'quote-edit') fillForm(q);
      if (btn.dataset.action === 'quote-pdf') openQuotePdf(q, settingsService.getCompany());
      if (btn.dataset.action === 'quote-delete') {
        if (!window.confirm(`¿Eliminar la cotizacion ${q.code}?`)) return;
        await quoteService.remove(q.id);
        cachedQuotes = await quoteService.getAll();
        listBox.innerHTML = renderList(cachedQuotes);
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
  const total = quoteTotal(q);
  const blocksTotal = sumPrices(q.blocks);
  const transportTotal = sumPrices(q.transport);
  const wl = q.whiteLabel;

  const brand = wl ? (q.brandName || 'Agencia de viajes') : company.agencyName;
  const contactLine = wl
    ? (q.brandContact || '')
    : `${company.email} · ${company.phones} · ${company.web}`;
  const legalLine = wl
    ? '' // en marca blanca no exponemos el RNT/registro de CS Travel
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

  ${(q.includes && q.includes.length) || (q.excludes && q.excludes.length) ? `
  <h2>Condiciones</h2>
  <div class="grid2">
    <div><strong>Incluye</strong>${list(q.includes)}</div>
    <div><strong>No incluye</strong>${list(q.excludes)}</div>
  </div>` : ''}

  <div class="total">
    <span>Total de la cotizacion</span>
    <strong>${formatCurrency(total)}</strong>
  </div>
  <div class="subtotals">
    ${blocksTotal ? `<span>Servicios: ${formatCurrency(blocksTotal)}</span>` : ''}
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
