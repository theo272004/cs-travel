/**
 * InventorySearch.js
 * =============================================================================
 * PROPOSITO:
 *   Panel (vista admin del caso) para buscar INVENTARIO REAL de viajes —vuelos
 *   y hoteles— con la API de Amadeus a traves de travelService. Sirve como
 *   herramienta de referencia para armar el "costo base" logistico del caso:
 *   el admin busca, selecciona un vuelo y un hotel, ve el total estimado y, si
 *   quiere, lo vuelca al campo de costo base (que luego puede ajustar).
 *
 *   Es DECISION-SUPPORT: el costo base final siempre lo confirma el admin. Las
 *   tarifas vienen en su propia moneda (USD por defecto); si la busqueda cae a
 *   datos de ejemplo (clave pendiente o sin resultados) se marca claramente.
 * =============================================================================
 */

import { travelService } from '../services/travelService.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { escapeHtml } from '../utils/escapeHtml.js';

const PLANE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.7.7 0 0 0-.7 1.1L8 11l-2 2-2.5-.5a.5.5 0 0 0-.5.8L6 16l1.7 2.9a.5.5 0 0 0 .8 0L11 16l3.6 4.5a.7.7 0 0 0 1.2-.2z"/></svg>';
const BED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 14h20"/><path d="M6 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

const isoDate = (v) => (v ? String(v).slice(0, 10) : '');

/** Suma N dias a una fecha YYYY-MM-DD. */
function addDays(dateStr, days) {
  const t = Date.parse(dateStr);
  if (!t) return dateStr;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

export function renderInventorySearch(item) {
  const origin = escapeHtml(item.origin || '');
  const destination = escapeHtml(item.destination || '');
  const depart = isoDate(item.travelDate);
  const ret = isoDate(item.returnDate);
  // Pasajeros: paciente (+ acompanante si aplica).
  const adults = 1 + (item.requiresCompanion ? 1 : 0);

  return `
    <section class="panel inv">
      <div class="panel__header">
        <h2 class="panel__title"><span class="title-icon" aria-hidden="true">${PLANE}</span>Inventario real de viajes</h2>
        <span class="inv__src" id="inv-src" hidden></span>
      </div>
      <p class="muted inv__hint">Busca vuelos y hoteles reales para estimar el costo base logistico. Es una referencia: el costo base final lo defines tu abajo.</p>

      <div class="inv__form">
        <div class="form__group"><label class="form__label">Origen</label><input class="form__input" id="inv-origin" value="${origin}" placeholder="Bogota / BOG" /></div>
        <div class="form__group"><label class="form__label">Destino</label><input class="form__input" id="inv-destination" value="${destination}" placeholder="Ciudad de Mexico / MEX" /></div>
        <div class="form__group"><label class="form__label">Ida</label><input class="form__input" type="date" id="inv-depart" value="${depart}" /></div>
        <div class="form__group"><label class="form__label">Regreso</label><input class="form__input" type="date" id="inv-return" value="${ret}" /></div>
        <div class="form__group"><label class="form__label">Pasajeros</label><input class="form__input" type="number" min="1" max="9" id="inv-adults" value="${adults}" /></div>
        <div class="form__group"><label class="form__label">Moneda</label>
          <select class="form__input" id="inv-currency">
            <option value="USD">USD</option>
            <option value="COP">COP</option>
            <option value="EUR">EUR</option>
            <option value="MXN">MXN</option>
          </select>
        </div>
      </div>

      <div class="inv__actions">
        <button type="button" class="btn btn--ghost" id="inv-flights-btn">${PLANE} Buscar vuelos</button>
        <button type="button" class="btn btn--ghost" id="inv-hotels-btn">${BED} Buscar hoteles</button>
      </div>

      <div class="inv__cols">
        <div class="inv__col">
          <h3 class="inv__col-title">Vuelos</h3>
          <div id="inv-flights" class="inv__list"><p class="muted inv__empty">Sin busqueda aun.</p></div>
        </div>
        <div class="inv__col">
          <h3 class="inv__col-title">Hoteles</h3>
          <div id="inv-hotels" class="inv__list"><p class="muted inv__empty">Sin busqueda aun.</p></div>
        </div>
      </div>

      <div class="inv__summary">
        <div class="inv__summary-lines">
          <span>Vuelo: <strong id="inv-sel-flight">—</strong></span>
          <span>Hotel: <strong id="inv-sel-hotel">—</strong></span>
          <span class="inv__total">Total estimado: <strong id="inv-total">—</strong></span>
        </div>
        <button type="button" class="btn btn--primary" id="inv-apply" disabled>Usar como costo base</button>
      </div>
    </section>
  `;
}

/* ------------------------------------------------------------------------- */

function srcBadge(source) {
  const el = document.getElementById('inv-src');
  if (!el) return;
  el.hidden = false;
  if (source === 'live') {
    el.textContent = 'Datos reales (Amadeus)';
    el.className = 'inv__src inv__src--live';
  } else {
    el.textContent = 'Datos de ejemplo';
    el.className = 'inv__src inv__src--demo';
  }
}

function flightCard(f) {
  const route = `${escapeHtml(f.outbound?.from || '')} → ${escapeHtml(f.outbound?.to || '')}`;
  const stops = f.outbound?.stops ? `${f.outbound.stops} escala(s)` : 'Directo';
  const back = f.inbound ? ' · ida y vuelta' : ' · solo ida';
  return `
    <div class="inv-card" data-id="${escapeHtml(f.id)}">
      <div class="inv-card__main">
        <strong class="inv-card__title">${escapeHtml(f.airline || 'Aerolinea')}</strong>
        <span class="inv-card__meta">${route} · ${escapeHtml(f.outbound?.durationLabel || '')} · ${stops}${back}</span>
      </div>
      <div class="inv-card__right">
        <span class="inv-card__price">${formatCurrency(f.price, f.currency || 'USD')}</span>
        <button type="button" class="btn btn--ghost btn--sm inv-pick" data-kind="flight">Usar</button>
      </div>
    </div>
  `;
}

function hotelCard(h) {
  return `
    <div class="inv-card" data-id="${escapeHtml(h.id)}">
      <div class="inv-card__main">
        <strong class="inv-card__title">${escapeHtml(h.name || 'Hotel')}</strong>
        <span class="inv-card__meta">${escapeHtml(h.roomType || '')} · ${h.nights} noche(s)</span>
      </div>
      <div class="inv-card__right">
        <span class="inv-card__price">${formatCurrency(h.price, h.currency || 'USD')}</span>
        <button type="button" class="btn btn--ghost btn--sm inv-pick" data-kind="hotel">Usar</button>
      </div>
    </div>
  `;
}

export function wireInventorySearch() {
  const root = document.querySelector('.inv');
  if (!root) return;

  const $ = (id) => document.getElementById(id);
  const state = { flight: null, hotel: null, flights: [], hotels: [] };

  const currency = () => $('inv-currency').value || 'USD';

  const updateSummary = () => {
    const cur = currency();
    const fCur = state.flight ? state.flight.currency || cur : null;
    const hCur = state.hotel ? state.hotel.currency || cur : null;
    $('inv-sel-flight').textContent = state.flight ? formatCurrency(state.flight.price, fCur) : '—';
    $('inv-sel-hotel').textContent = state.hotel ? formatCurrency(state.hotel.price, hCur) : '—';

    // Si vuelo y hotel quedaron en monedas distintas, sumarlos no tiene sentido.
    const mixed = state.flight && state.hotel && fCur !== hCur;
    const total = (state.flight?.price || 0) + (state.hotel?.price || 0);

    if (mixed) {
      $('inv-total').textContent = `Monedas distintas (${fCur} / ${hCur})`;
      $('inv-apply').disabled = true;
    } else {
      // La moneda del total es la de los items elegidos, no la del selector.
      const totalCur = fCur || hCur || cur;
      $('inv-total').textContent = total > 0 ? formatCurrency(total, totalCur) : '—';
      $('inv-apply').disabled = total <= 0;
    }
  };

  const setBusy = (containerId, label) => {
    $(containerId).innerHTML = `<p class="muted inv__empty">${label}</p>`;
  };

  // Marca visualmente la tarjeta elegida dentro de su columna.
  const highlight = (containerId, id) => {
    $(containerId)
      .querySelectorAll('.inv-card')
      .forEach((c) => c.classList.toggle('is-picked', c.dataset.id === id));
  };

  $('inv-flights-btn').addEventListener('click', async () => {
    const origin = $('inv-origin').value.trim();
    const destination = $('inv-destination').value.trim();
    const departureDate = $('inv-depart').value;
    if (!origin || !destination || !departureDate) {
      setBusy('inv-flights', 'Completa origen, destino y fecha de ida.');
      return;
    }
    setBusy('inv-flights', 'Buscando vuelos...');
    try {
      const { source, data } = await travelService.flights({
        origin,
        destination,
        departureDate,
        returnDate: $('inv-return').value || undefined,
        adults: Number($('inv-adults').value) || 1,
        currency: currency(),
        max: 8,
      });
      srcBadge(source);
      state.flights = data || [];
      $('inv-flights').innerHTML = state.flights.length
        ? state.flights.map(flightCard).join('')
        : '<p class="muted inv__empty">Sin resultados para esa ruta/fecha.</p>';
    } catch (e) {
      setBusy('inv-flights', `Error: ${e.message}`);
    }
  });

  $('inv-hotels-btn').addEventListener('click', async () => {
    const city = $('inv-destination').value.trim();
    const checkInDate = $('inv-depart').value;
    // Si no hay regreso, estimamos 3 noches para poder cotizar el hotel.
    const checkOutDate = $('inv-return').value || (checkInDate ? addDays(checkInDate, 3) : '');
    if (!city || !checkInDate || !checkOutDate) {
      setBusy('inv-hotels', 'Completa destino y fecha de ida.');
      return;
    }
    setBusy('inv-hotels', 'Buscando hoteles...');
    try {
      const { source, data } = await travelService.hotels({
        city,
        checkInDate,
        checkOutDate,
        adults: Number($('inv-adults').value) || 1,
        currency: currency(),
        max: 12,
      });
      srcBadge(source);
      state.hotels = data || [];
      $('inv-hotels').innerHTML = state.hotels.length
        ? state.hotels.map(hotelCard).join('')
        : '<p class="muted inv__empty">Sin hoteles para esa ciudad/fechas.</p>';
    } catch (e) {
      setBusy('inv-hotels', `Error: ${e.message}`);
    }
  });

  // Seleccion de una tarjeta (delegacion de eventos en las dos columnas).
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.inv-pick');
    if (!btn) return;
    const card = btn.closest('.inv-card');
    const id = card?.dataset.id;
    const kind = btn.dataset.kind;
    if (kind === 'flight') {
      state.flight = state.flights.find((f) => f.id === id) || null;
      highlight('inv-flights', id);
    } else {
      state.hotel = state.hotels.find((h) => h.id === id) || null;
      highlight('inv-hotels', id);
    }
    updateSummary();
  });

  // Volcar el total estimado al campo de costo base del formulario de gestion.
  $('inv-apply').addEventListener('click', () => {
    const cur = currency();
    const fCur = state.flight ? state.flight.currency || cur : null;
    const hCur = state.hotel ? state.hotel.currency || cur : null;
    // No aplicar una suma de monedas distintas (corromperia el costo base).
    if (state.flight && state.hotel && fCur !== hCur) return;
    const total = (state.flight?.price || 0) + (state.hotel?.price || 0);
    if (total <= 0) return;
    const baseInput = document.getElementById('mc-base-cost');
    if (!baseInput) return;
    baseInput.value = String(Math.round(total));
    baseInput.dispatchEvent(new Event('input', { bubbles: true }));
    baseInput.classList.add('field-flash');
    setTimeout(() => baseInput.classList.remove('field-flash'), 1200);
    baseInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
