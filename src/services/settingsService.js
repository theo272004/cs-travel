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

/**
 * Version de los datos legales de la empresa. Los ajustes viven en localStorage
 * y se mezclan ENCIMA de DEFAULTS, asi que a quien ya hubiera guardado la
 * configuracion le seguirian saliendo el RNT superado y el telefono de EE.UU.
 * en el pie de sus cotizaciones aunque aqui esten corregidos. Al subir este
 * numero, los datos guardados se descartan una sola vez y vuelven a los
 * oficiales. Subirlo cada vez que cambie la identificacion legal.
 */
const LEGAL_VERSION = 3; // 3: correo corporativo en vez del Gmail

const DEFAULTS = {
  booking: { enabled: false, apiKey: '', affiliateId: '' },
  despegar: { enabled: false, apiKey: '' },
  amadeus: { enabled: false, apiKey: '' },
  // Datos legales y de marca que aparecen en el pie de las cotizaciones.
  // Identificacion legal exigida por el item W-02 de la orden de trabajo; debe
  // coincidir con el Registro Nacional de Turismo. El RNT 264837 y la matricula
  // 926484 son de la anterior estructura de persona natural y quedaron
  // superados: no pueden reaparecer en ninguna cotizacion (ver LEGAL_VERSION).
  company: {
    agencyName: 'CS TRAVEL GROUP',
    legalName: 'CS Travel Group Colombia S.A.S.',
    nit: '902.096.878-3',
    rnt: '299.130',
    registroMercantil: '945.293',
    email: 'reservas@cstravelgroup.com',
    // Solo el numero de Colombia: un numero extranjero en una agencia con RNT
    // colombiano genera ambiguedad de jurisdiccion (item W-01).
    phones: '+57 314 610 3599',
    web: 'www.cstravelgroup.com',
    city: 'CR 64 No. 91-105, Barranquilla, Atlantico, Colombia',
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

      if (Number(stored.legalVersion || 0) < LEGAL_VERSION) {
        delete stored.company; // vuelven los datos oficiales de DEFAULTS
        stored.legalVersion = LEGAL_VERSION;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch {
          // Si el navegador no deja escribir, igual se devuelven los correctos.
        }
      }

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
