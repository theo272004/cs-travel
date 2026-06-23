/**
 * CompanyDashboardView.js
 * =============================================================================
 * PROPOSITO:
 *   Dashboard de una EMPRESA aliada bajo el modelo "Allied Value Partnership"
 *   (retorno-céntrico): la empresa GANA un retorno por referir a su comunidad;
 *   CS Travel opera todo. Se compone de los módulos Allied Value, con la misma
 *   jerarquía visual del panel de Médicos (lo más valioso arriba).
 *
 * RESPONSABILIDADES:
 *   - render(): cargar LA empresa del usuario logueado y armar los módulos.
 *   - AISLAMIENTO de datos: companyId tomado de la sesión.
 * =============================================================================
 */

import { authService } from '../services/authService.js';
import { companyService } from '../services/companyService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';
import {
  renderReturnsAnalytics, bindReturnsAnalytics, renderTrackingTable, bindTrackingPager,
  renderGamification, renderBenefitsCenter, bindBenefitsCenter,
  renderServicesDrawerTrigger, renderServicesDrawer, bindServicesDrawer,
} from '../components/AlliedValue.js';
import { bindInfoModals, infoBtn } from '../components/InfoModal.js';

export const CompanyDashboardView = {
  async render() {
    // companyId SIEMPRE desde la sesión: clave para el aislamiento de datos.
    const companyId = authService.getCompanyId();
    const company = await companyService.getById(companyId);

    return `
      <!-- Encabezado: saludo, nombre y estado de la empresa. -->
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="page-title__greet">${greeting()},</span> ${escapeHtml(company.name)}</h1>
          <p class="page-subtitle">
            ${StatusBadge(company.status)}
            <span class="chip">Alianza: ${escapeHtml(company.sharedCode)}</span>
            <span class="chip chip--level">Nivel 1 · Directivo ${infoBtn('empresa-niveles')}</span>
          </p>
        </div>
        <div class="page-header__actions">
          ${renderServicesDrawerTrigger()}
          <button type="button" class="btn btn--primary" data-action="open-quick-create">+ Nueva solicitud</button>
        </div>
      </div>

      <!-- Módulo 1: Analítica de retornos (protagonista). -->
      ${renderReturnsAnalytics()}

      <!-- Módulo 2: Tracking en vivo de clientes referidos. -->
      ${renderTrackingTable()}

      <!-- Módulos 4+5: beneficios e incentivos lado a lado. -->
      <div class="av-mid-grid">
        ${renderBenefitsCenter(company.sharedCode)}
        ${renderGamification()}
      </div>

      <!-- El nivel de convenio ahora vive en el encabezado (chip "Nivel 1" con "?"). -->

      <!-- El pago NO va en el dashboard: la empresa gana retorno, no paga. El
           pago aparece de forma contextual cuando hay un viaje corporativo
           propio que liquidar (cotización directa del drawer). -->

      <!-- Módulo 3: drawer de servicios y cotización directa. -->
      ${renderServicesDrawer()}
    `;
  },

  async afterRender() {
    bindReturnsAnalytics();   // drill-down del gráfico de retornos
    bindTrackingPager();      // paginador de clientes referidos
    bindBenefitsCenter();     // copiar enlace en el centro de beneficios
    bindServicesDrawer();     // drawer de servicios y solicitudes
    bindInfoModals();         // ventanas "?" (cómo se calcula el retorno)
  },
};
