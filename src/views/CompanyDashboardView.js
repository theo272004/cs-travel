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
import { referralService } from '../services/referralService.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { greeting } from '../utils/greeting.js';
import {
  renderReturnsAnalytics, bindReturnsAnalytics, renderTrackingTable, bindTrackingPager,
  renderGamification, renderBenefitsCenter, bindBenefitsCenter,
  renderSupportStrip, bindSupportStrip,
  renderServicesDrawerTrigger, renderServicesDrawer, bindServicesDrawer,
} from '../components/AlliedValue.js';
import { bindInfoModals, infoBtn } from '../components/InfoModal.js';

export const CompanyDashboardView = {
  async render() {
    // companyId SIEMPRE desde la sesión: clave para el aislamiento de datos.
    const companyId = authService.getCompanyId();
    // Resiliente: si la cuenta aún no está vinculada a una empresa (companyId
    // vacío) o la empresa no se encuentra, mostramos un panel claro en vez de
    // romper el dashboard (que dejaba al usuario atrapado en un bucle sin salir).
    let company = null;
    try {
      if (companyId) company = await companyService.getById(companyId);
    } catch (e) {
      company = null;
    }
    if (!company) {
      return `
        <div class="page-header">
          <div>
            <h1 class="page-title">Bienvenido a CS Travel Group</h1>
            <p class="page-subtitle"><span class="chip">Cuenta de empresa</span></p>
          </div>
        </div>
        <section class="panel" style="text-align:center; padding:48px 24px;">
          <h2 class="panel__title" style="justify-content:center;">Tu cuenta aún no está vinculada a una empresa</h2>
          <p class="muted" style="max-width:460px; margin:10px auto 22px;">
            Un asesor de CS Travel debe asociar tu cuenta a tu empresa para activar tu panel.
            Si crees que es un error, contáctanos y lo resolvemos enseguida.
          </p>
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <a class="btn btn--primary" href="https://wa.me/573146103599?text=${encodeURIComponent('Hola CS Travel, mi cuenta de empresa no está vinculada y no puedo ver mi panel.')}" target="_blank" rel="noopener">Escribir a CS Travel</a>
            <button type="button" class="btn btn--ghost" data-action="logout">Cerrar sesión</button>
          </div>
        </section>
      `;
    }

    // Referidos REALES de la empresa (registrados a mano por el dueño). Alimentan
    // la analítica de retornos, la tabla de seguimiento y los incentivos.
    let refs = [];
    try { refs = await referralService.getByCompany(company.id); } catch (e) { refs = []; }

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
        <!-- Acciones del header retiradas: el botón flotante "+" (abajo a la
             derecha) ya crea solicitudes. "Servicios y solicitudes" sigue OCULTO
             (add-on fuera de cotización: Aportes Empresariales, Seguros, Talleres);
             para reactivarlo, agrega ${'$'}{renderServicesDrawerTrigger()} aquí. -->
      </div>

      <!-- Módulo 1: Analítica de retornos (protagonista). Números reales: la
           operación propia (company) + el programa de referidos (refs manuales). -->
      ${renderReturnsAnalytics(refs, company)}

      <!-- Módulo 2: Tracking en vivo de clientes referidos (reales). -->
      ${renderTrackingTable(refs)}

      <!-- Módulos 4+5: beneficios e incentivos lado a lado. -->
      <div class="av-mid-grid">
        ${renderBenefitsCenter(company.sharedCode)}
        ${renderGamification(refs)}
      </div>

      <!-- El nivel de convenio ahora vive en el encabezado (chip "Nivel 1" con "?"). -->

      <!-- Módulo 6: soporte CST + enlace de referidos (igual que médicos). -->
      ${renderSupportStrip(company)}

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
    bindSupportStrip();       // copiar enlace de referidos y código aliado
    bindServicesDrawer();     // drawer de servicios y solicitudes
    bindInfoModals();         // ventanas "?" (cómo se calcula el retorno)
  },
};
