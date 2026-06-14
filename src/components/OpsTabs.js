/**
 * OpsTabs.js
 * =============================================================================
 * PROPOSITO:
 *   Barra de pestañas para la seccion "Operaciones" del admin. Permite alternar
 *   entre Solicitudes (empresas) y Casos medicos sin recargar, manteniendo la
 *   sensacion de una sola seccion unificada en el menu lateral.
 *
 * USO:
 *   OpsTabs('requests')  -> pestaña "Solicitudes" activa.
 *   OpsTabs('cases')     -> pestaña "Casos medicos" activa.
 * =============================================================================
 */

export function OpsTabs(active = 'requests') {
  const tabs = [
    { key: 'requests', label: 'Solicitudes', hash: '#/admin/requests' },
    { key: 'cases', label: 'Casos medicos', hash: '#/admin/medical-cases' },
  ];

  return `
    <div class="ops-tabs" role="tablist" aria-label="Tipo de operacion">
      ${tabs.map((t) => `
        <a href="${t.hash}" class="ops-tab ${t.key === active ? 'is-active' : ''}"
           role="tab" aria-selected="${t.key === active}">${t.label}</a>
      `).join('')}
    </div>
  `;
}
