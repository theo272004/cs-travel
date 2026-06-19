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

    /** Actualiza el estado de una tarjeta, refresca la cache y el tablero. */
    const updateStatus = async (kind, id, status) => {
      try {
        if (kind === 'request') await requestService.update(id, { status });
        else await medicalCaseService.update(id, { status });
        const card = allCards.find((c) => c.kind === kind && String(c.id) === String(id));
        if (card) card.status = status;
        renderBoard();
      } catch (error) {
        window.alert(`No se pudo cambiar el estado: ${error.message}`);
      }
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

          await updateStatus(payload.kind, payload.id, targetStatus);
        });
      });

      board.querySelectorAll('[data-kanban-status]').forEach((select) => {
        select.addEventListener('change', async () => {
          select.disabled = true;
          await updateStatus(select.dataset.kind, select.dataset.id, select.value);
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
      <p class="kanban-card__route muted">${escapeHtml(card.type)} · ${escapeHtml(card.origin)} → ${escapeHtml(card.destination)}</p>
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
