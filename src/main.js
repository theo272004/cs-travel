/**
 * main.js
 * =============================================================================
 * PROPOSITO:
 *   Punto de entrada de la aplicacion (lo carga index.html). Arranca el router
 *   y registra los manejadores de eventos GLOBALES mediante delegacion.
 *
 * RESPONSABILIDADES:
 *   - Inicializar el enrutador (initRouter).
 *   - Escuchar clics globales en document y reaccionar a atributos:
 *       data-action="logout"          -> cerrar sesion.
 *       data-action="toggle-sidebar"  -> abrir/cerrar menu lateral en movil.
 *       data-action="close-sidebar"   -> cerrar menu al tocar el overlay.
 *       data-href="#/ruta"            -> filas/tarjetas clicables que navegan.
 *
 * POR QUE DELEGACION DE EVENTOS:
 *   El contenido del DOM se reemplaza por completo en cada cambio de vista.
 *   Si enlazaramos listeners a cada boton, tendriamos que volver a enlazarlos
 *   tras cada render. En su lugar, escuchamos UNA sola vez en `document` y
 *   detectamos el elemento real con event.target.closest(). Asi los eventos
 *   globales siguen funcionando sin importar cuantas veces se re-renderice.
 * =============================================================================
 */

import './styles/main.css';
import { initRouter, navigate } from './router/router.js';
import { authService } from './services/authService.js';

/**
 * Manejador global de clics.
 * Usa "delegacion": un solo listener en document atiende toda la app.
 */
document.addEventListener('click', (event) => {
  // closest() sube por el arbol DOM buscando el ancestro con data-action.
  const actionEl = event.target.closest('[data-action]');

  if (actionEl) {
    const action = actionEl.dataset.action;

    switch (action) {
      // --- Cerrar sesion ---
      case 'logout':
        authService.logout();        // Borra la sesion de localStorage.
        navigate('#/login');         // Redirige al login.
        break;

      // --- Abrir/cerrar menu lateral (movil) ---
      case 'toggle-sidebar':
        document.getElementById('sidebar')?.classList.toggle('is-open');
        document.querySelector('.sidebar-overlay')?.classList.toggle('is-visible');
        break;

      // --- Cerrar menu lateral al tocar el overlay (movil) ---
      case 'close-sidebar':
        document.getElementById('sidebar')?.classList.remove('is-open');
        document.querySelector('.sidebar-overlay')?.classList.remove('is-visible');
        break;
    }
    return; // Ya gestionamos un data-action; no seguimos.
  }

  // --- Filas/tarjetas clicables que navegan a una ruta ---
  // Buscamos un ancestro con data-href y, si existe, navegamos alli.
  const rowEl = event.target.closest('[data-href]');
  if (rowEl) {
    navigate(rowEl.dataset.href);
  }
});

/**
 * Tooltip flotante global para graficos y elementos con [data-tip].
 * Un unico div reutilizable sigue al cursor; el contenido se asigna con
 * textContent (seguro frente a XSS). Registrado UNA vez por delegacion,
 * sobrevive a todos los re-renders de vistas.
 */
let tooltipEl = null;

function ensureTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tip';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function positionTooltip(event) {
  const tip = ensureTooltip();
  const margin = 14;
  let x = event.clientX + margin;
  let y = event.clientY - 12;
  const rect = tip.getBoundingClientRect();
  if (x + rect.width + 8 > window.innerWidth) x = event.clientX - rect.width - margin;
  if (y + rect.height + 8 > window.innerHeight) y = window.innerHeight - rect.height - 8;
  if (y < 8) y = 8;
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

document.addEventListener('mouseover', (event) => {
  const target = event.target.closest('[data-tip]');
  if (!target) return;
  const tip = ensureTooltip();
  tip.textContent = target.dataset.tip;
  tip.classList.add('is-visible');
  positionTooltip(event);
});

document.addEventListener('mousemove', (event) => {
  if (tooltipEl?.classList.contains('is-visible')) positionTooltip(event);
});

document.addEventListener('mouseout', (event) => {
  if (event.target.closest?.('[data-tip]')) {
    tooltipEl?.classList.remove('is-visible');
  }
});

// Al cambiar de vista, ocultamos el tooltip por si quedo visible.
window.addEventListener('hashchange', () => {
  tooltipEl?.classList.remove('is-visible');
});

/**
 * Tecla Escape: cierra cualquier ventana flotante (modal) abierta.
 */
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.is-open').forEach((modal) => {
      modal.classList.remove('is-open');
    });
  }
});

/**
 * Al navegar (cambiar de hash), cerramos el menu lateral por si quedo abierto
 * en movil. Mejora la experiencia de uso.
 */
window.addEventListener('hashchange', () => {
  document.getElementById('sidebar')?.classList.remove('is-open');
  document.querySelector('.sidebar-overlay')?.classList.remove('is-visible');
});

// Arrancamos el enrutador: registra listeners y resuelve la ruta inicial.
initRouter();
