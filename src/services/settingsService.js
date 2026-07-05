/**
 * settingsService.js
 * =============================================================================
 * PROPOSITO:
 *   Configuracion del sistema (integraciones con proveedores) para el admin.
 *   En este prototipo se guarda en localStorage; al migrar a Wix/Velo o a un
 *   backend real, estas claves deben vivir en el servidor (nunca en el cliente).
 *
 * SEGURIDAD (nota):
 *   Las API keys de proveedores NO deben quedar expuestas en el navegador en
 *   produccion. Aqui es solo para maquetar el flujo de configuracion.
 * =============================================================================
 */

const STORAGE_KEY = 'cs_travel_settings';

const DEFAULTS = {
  booking: { enabled: false, apiKey: '', affiliateId: '' },
  despegar: { enabled: false, apiKey: '' },
  amadeus: { enabled: false, apiKey: '' },
  // Datos legales y de marca que aparecen en el pie de las cotizaciones.
  company: {
    agencyName: 'CS TRAVEL GROUP',
    rnt: '264837',
    registroMercantil: '926484',
    email: 'info.cstravelgroup@gmail.com',
    phones: '+57 314 610 3599 / +1 929 272 8933',
    web: 'www.cstravelgroup.com',
    city: 'Barranquilla, Colombia',
    advisorName: 'Andres Felipe Sanchez De La Parra',
  },
  // Tipo de cambio para MOSTRAR precios en USD (solo display; el cobro por Bold
  // siempre es en COP). usdToCop = cuantos pesos vale 1 USD; showUsd activa el
  // "(~USD $Y)" junto a cada monto. Lo fija el dueño manualmente.
  fx: { usdToCop: 4000, showUsd: false },
};

export const settingsService = {
  getAll() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        ...DEFAULTS,
        ...stored,
        booking: { ...DEFAULTS.booking, ...(stored.booking || {}) },
        company: { ...DEFAULTS.company, ...(stored.company || {}) },
        fx: { ...DEFAULTS.fx, ...(stored.fx || {}) },
      };
    } catch {
      return { ...DEFAULTS };
    }
  },

  /** Datos legales/de marca de CS Travel (RNT, registro, contacto). */
  getCompany() {
    return this.getAll().company;
  },

  /**
   * getFx()
   * Tasa de cambio COMPARTIDA para mostrar precios en USD. En produccion el
   * servidor inyecta `window.__CST_FX__` (misma tasa para todos los usuarios);
   * en la demo cae al valor local que ajusta el admin. El cobro sigue en COP.
   * @returns {{usdToCop:number, showUsd:boolean}}
   */
  getFx() {
    const injected = (typeof window !== 'undefined' && window.__CST_FX__) || null;
    if (injected && Number(injected.usdToCop) > 0) {
      return { usdToCop: Number(injected.usdToCop), showUsd: injected.showUsd !== false };
    }
    const fx = this.getAll().fx || {};
    return { usdToCop: Number(fx.usdToCop) || 0, showUsd: !!fx.showUsd };
  },

  saveProvider(provider, data) {
    const all = this.getAll();
    all[provider] = { ...all[provider], ...data };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return all[provider];
  },
};
