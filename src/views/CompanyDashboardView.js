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
  renderReturnsAnalytics, bindReturnsAnalytics, renderTrackingTable,
  renderGamification, renderBenefitsCenter, bindBenefitsCenter, renderConvenioLevels,
  renderServicesDrawerTrigger, renderServicesDrawer, bindServicesDrawer,
} from '../components/AlliedValue.js';
import { bindInfoModals } from '../components/InfoModal.js';

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

      <!-- Módulo 4: Centro de distribución de beneficios. -->
      ${renderBenefitsCenter(company.sharedCode)}

      <!-- Módulo 5: Incentivos / gamificación. -->
      ${renderGamification()}

      <!-- Módulo 6: Niveles de convenio. -->
      ${renderConvenioLevels()}

      <!-- El pago NO va en el dashboard: la empresa gana retorno, no paga. El
           pago aparece de forma contextual cuando hay un viaje corporativo
           propio que liquidar (cotización directa del drawer). -->

      <!-- Módulo 3: drawer de servicios y cotización directa. -->
      ${renderServicesDrawer()}
    `;
  },

  async afterRender() {
    bindReturnsAnalytics();   // drill-down del gráfico de retornos
    bindBenefitsCenter();     // copiar enlace en el centro de beneficios
    bindServicesDrawer();     // drawer de servicios y solicitudes
    bindInfoModals();         // ventanas "?" (cómo se calcula el retorno)
  },
};
