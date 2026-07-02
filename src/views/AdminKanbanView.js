/**
 * AdminKanbanView.js
 * =============================================================================
 * PROPOSITO:
 *   Tablero Kanban de seguimiento operativo para solicitudes de empresas y
 *   casos medicos, con DRAG & DROP nativo (HTML5):
 *   - Arrastra una tarjeta a otra columna para cambiar su estado.
 *   - Busqueda libre (codigo, cliente, ruta) y filtros por tipo y prioridad.
 *   - En movil (tactil) el cambio de estado se hace con el selector de la tarjeta.
 *
 * NOTA TECNICA:
 *   El tablero se re-renderiza parcialmente (solo #kanban-board) al filtrar,
 *   para no perder el foco del campo de busqueda; los listeners de drag & drop
 *   se re-enlazan en cada re-render del tablero.
 * =============================================================================
 */

import { companyService } from '../services/companyService.js';
import { doctorService } from '../services/doctorService.js';
import { requestService, STATUSES } from '../services/requestService.js';
import { medicalCaseService, MEDICAL_CASE_STATUSES } from '../services/medicalCaseService.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';
import { escapeHtml } from '../utils/escapeHtml.js';

// Cada columna agrupa estados equivalentes de solicitudes y casos medicos.
// Los estados antiguos (caso enviado / en revision / en cotizacion) caen en la
// primera columna por compatibilidad con datos previos.
const COLUMNS = [
  { label: 'Solicitud enviada', values: ['solicitud enviada', 'caso enviado', 'en revision', 'en cotizacion'] },
  { label: 'Cotizacion enviada', values: ['cotizacion enviada'] },
  { label: 'Aprobada', values: ['aprobada'] },
  { label: 'En gestion', values: ['en gestion'] },
  { label: 'Finalizada', values: ['finalizada'] },
  { label: 'Cancelada', values: ['cancelada'] },
];

const PRIORITY_LABEL = { alta: 'Alta', normal: 'Normal', baja: 'Baja' };

// Indices de columna por rol semantico (para la maquina de estados del tablero).
const COL = { START: 0, QUOTED: 1, APPROVED: 2, MANAGING: 3, DONE: 4, CANCELLED: 5 };

/** A que columna (0..5) pertenece un estado (mapea estados legacy a su columna). */
function columnIndexOf(status) {
  return COLUMNS.findIndex((c) => c.values.includes(status));
}

/**
 * Maquina de estados del tablero (capa de seguridad del admin sobre el flujo).
 * Solo permite avanzar/retroceder UN paso, cancelar desde estados activos y
 * reabrir una cancelada. Bloquea saltos ilogicos y exige prerrequisitos.
 * Devuelve un "plan": { ok, silent?, msg?, confirm?, needsReason? }.
 */
function transitionDecision(fromIdx, toIdx, card) {
  if (fromIdx === toIdx) return { ok: false, silent: true };

  // Cancelar: permitido desde estados activos (no desde finalizada).
  if (toIdx === COL.CANCELLED) {
    if (fromIdx === COL.DONE) return { ok: false, msg: 'Una operación finalizada no se cancela.' };
    return { ok: true, needsReason: true };
  }
  // Reabrir una cancelada -> solo a "Solicitud enviada".
  if (fromIdx === COL.CANCELLED) {
    if (toIdx === COL.START) return { ok: true, confirm: '¿Reabrir esta operación cancelada? Volverá a "Solicitud enviada".' };
    return { ok: false, msg: 'Una operación cancelada solo se reabre a "Solicitud enviada".' };
  }
  // Avanzar exactamente un paso.
  if (toIdx === fromIdx + 1) {
    if (toIdx === COL.QUOTED && (Number(card.cost) || 0) <= 0) {
      return { ok: false, msg: 'Asigna primero el costo de la cotización (en el detalle) antes de marcarla como enviada.' };
    }
    if (toIdx === COL.MANAGING) {
      return { ok: true, confirm: '¿La operación ya fue pagada? Al pasar a "En gestión" se da por pagada y en curso.' };
    }
    if (toIdx === COL.DONE) {
      return { ok: true, confirm: '¿Marcar como finalizada? Esto cierra la operación.' };
    }
    return { ok: true };
  }
  // Retroceder exactamente un paso.
  if (toIdx === fromIdx - 1) {
    return { ok: true, confirm: '¿Devolver la operación al estado anterior?' };
  }
  // Cualquier otro salto: bloqueado.
  return { ok: false, msg: `No puedes saltar de "${COLUMNS[fromIdx].label}" a "${COLUMNS[toIdx].label}". Avanza paso a paso.` };
}

/** Toast no bloqueante (feedback profesional, sin depender del CSS del proyecto). */
let _toastTimer = null;
function toast(message, type = 'info') {
  let el = document.getElementById('kanban-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kanban-toast';
    el.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(8px);z-index:9999;' +
      'max-width:90vw;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:600;color:#fff;' +
      'box-shadow:0 12px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .2s ease,transform .2s ease;pointer-events:none;';
    document.body.appendChild(el);
  }
  const colors = { success: '#1a7f4b', error: '#c0392b', info: '#0a2540' };
  el.style.background = colors[type] || colors.info;
  el.textContent = message;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}

// Filtros activos (persisten mientras dura la sesion de navegacion).
let typeFilter = 'todos';
let priorityFilter = 'todas';
let searchQuery = '';

// Tarjetas sin filtrar (cache del ultimo render completo).
let allCards = [];

export const AdminKanbanView = {
  async render() {
    const [companies, doctors, requests, cases] = await Promise.all([
      companyService.getAll(),
      doctorService.getAll(),
      requestService.getAll(),
      medicalCaseService.getAll(),
    ]);

    const companiesMap = Object.fromEntries(companies.map((company) => [company.id, company.name]));
    const doctorsMap = Object.fromEntries(doctors.map((doctor) => [doctor.id, doctor.clinicName]));

    allCards = [
      ...requests.map((item) => ({
        id: item.id,
        kind: 'request',
        code: item.requestCode,
        type: item.requestType || 'paquete completo',
        owner: companiesMap[item.companyId] || `Empresa #${item.companyId}`,
        origin: item.origin,
        destination: item.destination,
        travelDate: item.travelDate,
        status: item.status,
        cost: item.estimatedCost,
        priority: item.priority || 'normal',
        detailHref: `#/admin/requests/${item.id}`,
      })),
      ...cases.map((item) => ({
        id: item.id,
        kind: 'case',
        code: item.caseCode,
        type: 'caso medico',
        owner: doctorsMap[item.doctorId] || `Medico #${item.doctorId}`,
        origin: item.origin,
        destination: item.destination,
        travelDate: item.travelDate,
        status: item.status,
        cost: item.finalPatientValue,
        priority: item.priority || 'normal',
        detailHref: `#/admin/medical-cases/${item.id}`,
      })),
    ];

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Seguimiento operativo</h1>
          <p class="page-subtitle">Arrastra las tarjetas entre columnas para actualizar su estado.</p>
        </div>
      </div>

      <section class="toolbar toolbar--kanban">
        <input id="kanban-search" class="form__input table-toolbar__search" type="search"
          placeholder="Buscar codigo, cliente o destino..." value="${escapeHtml(searchQuery)}" />
        <div class="chip-group" id="kanban-type-chips">
          <button type="button" class="chip-btn" data-kanban-filter="todos">Todos</button>
          <button type="button" class="chip-btn" data-kanban-filter="requests">Solicitudes</button>
          <button type="button" class="chip-btn" data-kanban-filter="cases">Casos medicos</button>
        </div>
        <div class="chip-group" id="kanban-priority-chips">
          <button type="button" class="chip-btn" data-kanban-priority="todas">Toda prioridad</button>
          <button type="button" class="chip-btn" data-kanban-priority="alta">Alta</button>
          <button type="button" class="chip-btn" data-kanban-priority="normal">Normal</button>
          <button type="button" class="chip-btn" data-kanban-priority="baja">Baja</button>
        </div>
        <span class="table-toolbar__count" id="kanban-count"></span>
      </section>

      <section class="kanban-board" id="kanban-board"></section>
    `;
  },

  async afterRender() {
    const board = document.getElementById('kanban-board');
    const search = document.getElementById('kanban-search');
    const countLabel = document.getElementById('kanban-count');

    /** Tarjetas visibles segun busqueda + tipo + prioridad. */
    const getFiltered = () => {
      const q = searchQuery.trim().toLowerCase();
      return allCards.filter((card) => {
        const byType =
          typeFilter === 'todos' ||
          (typeFilter === 'requests' && card.kind === 'request') ||
          (typeFilter === 'cases' && card.kind === 'case');
        const byPriority = priorityFilter === 'todas' || card.priority === priorityFilter;
        const byText = !q || [card.code, card.owner, card.origin, card.destination, card.type]
          .join(' ').toLowerCase().includes(q);
        return byType && byPriority && byText;
      });
    };

    /** Marca el chip activo de cada grupo. */
    const syncChips = () => {
      document.querySelectorAll('[data-kanban-filter]').forEach((chip) => {
        chip.classList.toggle('is-active', chip.dataset.kanbanFilter === typeFilter);
      });
      document.querySelectorAll('[data-kanban-priority]').forEach((chip) => {
        chip.classList.toggle('is-active', chip.dataset.kanbanPriority === priorityFilter);
      });
    };

    /** Persiste el cambio de estado (+ campos extra), refresca cache y tablero. */
    const updateStatus = async (kind, id, status, extra = {}) => {
      const card = allCards.find((c) => c.kind === kind && String(c.id) === String(id));
      const cardEl = board.querySelector(`.kanban-card[data-kind="${kind}"][data-id="${id}"]`);
      if (cardEl) { cardEl.style.opacity = '0.5'; cardEl.style.pointerEvents = 'none'; }
      try {
        if (kind === 'request') await requestService.update(id, { status, ...extra });
        else await medicalCaseService.update(id, { status, ...extra });
        if (card) card.status = status;
        toast('Estado actualizado.', 'success');
        renderBoard();
      } catch (error) {
        if (cardEl) { cardEl.style.opacity = ''; cardEl.style.pointerEvents = ''; }
        toast(`No se pudo cambiar el estado: ${error.message}`, 'error');
      }
    };

    /**
     * Punto unico de cambio de estado (drag-drop Y selector movil pasan por aqui).
     * Valida la transicion con la maquina de estados, pide confirmacion/motivo
     * cuando corresponde, y solo entonces persiste.
     */
    const requestTransition = async (card, toStatus) => {
      const fromIdx = columnIndexOf(card.status);
      const toIdx = columnIndexOf(toStatus);
      const plan = transitionDecision(fromIdx, toIdx, card);

      if (!plan.ok) {
        if (!plan.silent) toast(plan.msg, 'error');
        renderBoard(); // restaura la posicion/selector si la movida no procede
        return;
      }

      const extra = {};
      if (plan.needsReason) {
        const reason = window.prompt('Motivo de la cancelación (para análisis):', '');
        if (reason === null) { renderBoard(); return; } // el admin desistio
        extra.lostReason = reason.trim();
      } else if (plan.confirm && !window.confirm(plan.confirm)) {
        renderBoard();
        return;
      }

      await updateStatus(card.kind, card.id, toStatus, extra);
    };

    /** Devuelve el estado destino de una columna para el tipo de tarjeta. */
    const targetStatusForColumn = (colEl, kind) => {
      const column = COLUMNS[Number(colEl?.dataset.colIndex)];
      if (!column) return null;
      const validStatuses = kind === 'request' ? STATUSES : MEDICAL_CASE_STATUSES;
      return column.values.find((value) => validStatuses.includes(value)) || null;
    };

    /**
     * Drag TACTIL (Pointer Events) para tablet/movil. El drag & drop nativo de
     * HTML5 no dispara eventos con el dedo, por eso en tablet era imposible
     * mover tarjetas. Aqui, al ser las columnas horizontales, un desplazamiento
     * HORIZONTAL sobre una tarjeta la "levanta" y la arrastra; el vertical se
     * deja al scroll de la pagina (touch-action: pan-y en la tarjeta). Solo
     * actua para pointerType 'touch': el mouse sigue usando el DnD nativo.
     */
    const startTouchDrag = (downEvent, cardEl) => {
      const pointerId = downEvent.pointerId;
      const startX = downEvent.clientX;
      const startY = downEvent.clientY;
      const rect = cardEl.getBoundingClientRect();
      const grabX = startX - rect.left;
      const grabY = startY - rect.top;
      let dragging = false;
      let ghost = null;
      let hotCol = null;

      const columnUnder = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('.kanban-column') : null;
      };
      const setHot = (colEl) => {
        if (colEl === hotCol) return;
        hotCol?.querySelector('.kanban-column__body')?.classList.remove('is-drop-target');
        hotCol = colEl;
        hotCol?.querySelector('.kanban-column__body')?.classList.add('is-drop-target');
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        cardEl.classList.remove('is-dragging');
        hotCol?.querySelector('.kanban-column__body')?.classList.remove('is-drop-target');
        ghost?.remove();
      };

      const onMove = (event) => {
        if (event.pointerId !== pointerId) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (!dragging) {
          // Solo levantamos la tarjeta ante intencion HORIZONTAL clara; asi el
          // gesto vertical sigue haciendo scroll de la pagina con naturalidad.
          if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
          dragging = true;
          cardEl.classList.add('is-dragging');
          ghost = cardEl.cloneNode(true);
          ghost.classList.add('kanban-card--ghost');
          ghost.style.cssText +=
            `position:fixed;left:0;top:0;width:${rect.width}px;margin:0;z-index:9998;pointer-events:none;`;
          document.body.appendChild(ghost);
        }
        event.preventDefault();
        ghost.style.transform =
          `translate(${event.clientX - grabX}px, ${event.clientY - grabY}px) rotate(2.5deg)`;
        setHot(columnUnder(event.clientX, event.clientY));
      };

      const onUp = async (event) => {
        if (event.pointerId !== pointerId) return;
        const dropCol = dragging ? columnUnder(event.clientX, event.clientY) : null;
        cleanup();
        if (!dropCol) return;
        const card = allCards.find(
          (c) => c.kind === cardEl.dataset.kind && String(c.id) === String(cardEl.dataset.id)
        );
        if (!card) return;
        const targetStatus = targetStatusForColumn(dropCol, card.kind);
        if (targetStatus) await requestTransition(card, targetStatus);
      };

      const onCancel = (event) => {
        if (event.pointerId !== pointerId) return;
        cleanup();
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };

    /** Enlaza drag & drop y selects sobre el contenido actual del tablero. */
    const bindBoard = () => {
      board.querySelectorAll('.kanban-card[draggable="true"]').forEach((card) => {
        card.addEventListener('dragstart', (event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', JSON.stringify({
            id: card.dataset.id,
            kind: card.dataset.kind,
          }));
          card.classList.add('is-dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('is-dragging'));

        // Arrastre tactil (tablet/movil): no interfiere con el DnD nativo del
        // mouse porque solo reacciona a pointerType 'touch'. Se ignora si el
        // gesto empieza sobre el enlace del codigo o el selector de estado.
        card.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'touch') return;
          if (event.target.closest('a, select, button')) return;
          startTouchDrag(event, card);
        });
      });

      // Escucha en el article completo: cualquier zona de la columna
      // (encabezado, espacio vacío bajo las tarjetas) es válida para soltar.
      board.querySelectorAll('.kanban-column').forEach((colEl) => {
        const body = colEl.querySelector('.kanban-column__body');
        colEl.addEventListener('dragover', (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          body.classList.add('is-drop-target');
        });
        colEl.addEventListener('dragleave', (event) => {
          if (!colEl.contains(event.relatedTarget)) body.classList.remove('is-drop-target');
        });
        colEl.addEventListener('drop', async (event) => {
          event.preventDefault();
          body.classList.remove('is-drop-target');

          let payload;
          try {
            payload = JSON.parse(event.dataTransfer.getData('text/plain'));
          } catch {
            return;
          }

          const column = COLUMNS[Number(colEl.dataset.colIndex)];
          if (!column || !payload?.id) return;

          // Cada tipo de tarjeta tiene su propio catalogo de estados.
          const validStatuses = payload.kind === 'request' ? STATUSES : MEDICAL_CASE_STATUSES;
          const targetStatus = column.values.find((value) => validStatuses.includes(value));
          if (!targetStatus) return;

          const card = allCards.find((c) => c.kind === payload.kind && String(c.id) === String(payload.id));
          if (!card) return;
          await requestTransition(card, targetStatus);
        });
      });

      board.querySelectorAll('[data-kanban-status]').forEach((select) => {
        select.addEventListener('change', async () => {
          const card = allCards.find((c) => c.kind === select.dataset.kind && String(c.id) === String(select.dataset.id));
          if (!card) { renderBoard(); return; }
          await requestTransition(card, select.value);
        });
      });
    };

    /** Re-renderiza SOLO el tablero (la busqueda no pierde el foco). */
    const renderBoard = () => {
      const cards = getFiltered();
      countLabel.textContent = `${cards.length} tarjeta(s)`;
      board.innerHTML = COLUMNS.map((column, index) => renderColumn(column, index, cards)).join('');
      bindBoard();
      syncChips();
    };

    // --- Filtros ---
    search.addEventListener('input', () => {
      searchQuery = search.value;
      renderBoard();
    });
    document.querySelectorAll('[data-kanban-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        typeFilter = chip.dataset.kanbanFilter;
        renderBoard();
      });
    });
    document.querySelectorAll('[data-kanban-priority]').forEach((chip) => {
      chip.addEventListener('click', () => {
        priorityFilter = chip.dataset.kanbanPriority;
        renderBoard();
      });
    });

    renderBoard();
  },
};

function renderColumn(column, index, cards) {
  const items = cards.filter((card) => column.values.includes(card.status));
  return `
    <article class="kanban-column" data-col-index="${index}">
      <header class="kanban-column__header">
        <h2>${escapeHtml(column.label)}</h2>
        <span>${items.length}</span>
      </header>
      <div class="kanban-column__body" data-col-index="${index}">
        ${items.length ? items.map(renderCard).join('') : '<p class="empty-state">Sin elementos.</p>'}
      </div>
    </article>
  `;
}

const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function renderCard(card) {
  const statuses = card.kind === 'request' ? STATUSES : MEDICAL_CASE_STATUSES;
  const options = statuses
    .map((status) => `<option value="${status}" ${status === card.status ? 'selected' : ''}>${status}</option>`)
    .join('');
  const priority = String(card.priority).toLowerCase();

  return `
    <div class="kanban-card" draggable="true" data-id="${card.id}" data-kind="${card.kind}">
      <div class="kanban-card__top">
        <a href="${card.detailHref}"><strong>${escapeHtml(card.code)}</strong></a>
        <span class="badge priority--${escapeHtml(priority)}">${escapeHtml(PRIORITY_LABEL[priority] || priority)}</span>
      </div>
      <p class="kanban-card__owner">${escapeHtml(card.owner)}</p>
      <p class="kanban-card__route muted">${escapeHtml(capitalize(card.type))} · ${escapeHtml(card.origin)} → ${escapeHtml(card.destination)}</p>
      <div class="kanban-card__footer">
        <span>Viaje: ${formatDate(card.travelDate)}</span>
        <strong>${formatCurrency(card.cost || 0)}</strong>
      </div>
      <select class="form__input only-mobile" data-kanban-status data-kind="${card.kind}" data-id="${card.id}" aria-label="Cambiar estado">
        ${options}
      </select>
    </div>
  `;
}
