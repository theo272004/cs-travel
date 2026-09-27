/**
 * settingsService.js
 * =============================================================================
 * PROPOSITO:
 *   Configuración del sistema para el admin: datos legales y de marca que salen
 *   en el pie de las cotizaciones y la tasa para mostrar precios en USD.
 *
 * DONDE VIVE CADA COSA:
 *   - Demo (vite + json-server): todo se guarda en localStorage para poder
 *     probar el flujo de configuración sin servidor.
 *   - Portal real (bundle bajo /portal-app/): los datos LEGALES son constantes
 *     del ítem W-02 de la orden (LEGAL_W02) y no se pueden cambiar desde el
 *     navegador. Si cada operador pudiera editarlos, cada uno sacaría un pie
 *     legal distinto en sus PDF. Solo el "Asesor por defecto" sigue siendo una
 *     preferencia de cada navegador. La tasa USD la fija el servidor
 *     (window.__CST_FX__).
 *
 * SEGURIDAD (ítem 0.4 de la orden):
 *   Aquí NO se guarda ninguna llave de proveedor. El panel de Booking (API key
 *   en localStorage que ningún código usaba) se retiró, y getAll() borra las
 *   llaves que hubieran quedado guardadas en navegadores de versiones viejas.
 *   Las credenciales de proveedores viven solo en las variables del servidor.
 * =============================================================================
 */

import { isDeployedBundle } from '../utils/env.js';

const STORAGE_KEY = 'cs_travel_settings';

/**
 * Version de los datos legales de la empresa. Los ajustes viven en localStorage
 * y se mezclan ENCIMA de DEFAULTS, asi que a quien ya hubiera guardado la
 * configuracion le seguirian saliendo el RNT superado y el telefono de EE.UU.
 * en el pie de sus cotizaciones aunque aqui esten corregidos. Al subir este
 * numero, los datos guardados se descartan una sola vez y vuelven a los
 * oficiales. Subirlo cada vez que cambie la identificacion legal.
 */
const LEGAL_VERSION = 4; // 4: domicilio y asesor con tildes; vigencia del RNT

/**
 * Llaves de integraciones retiradas (Booking, Despegar, Amadeus). Se borran
 * del localStorage la primera vez que se lee la configuración (ítem 0.4).
 */
const RETIRED_PROVIDERS = ['booking', 'despegar', 'amadeus'];

/**
 * Identificación legal exigida por el ítem W-02 de la orden de trabajo. Debe
 * coincidir con el Registro Nacional de Turismo. El RNT 264837 y la matrícula
 * 926484 son de la anterior estructura de persona natural y quedaron
 * superados: no pueden reaparecer en ninguna cotización (ver LEGAL_VERSION).
 */
export const LEGAL_W02 = Object.freeze({
  agencyName: 'CS TRAVEL GROUP',
  legalName: 'CS Travel Group Colombia S.A.S.',
  nit: '902.096.878-3',
  rnt: '299.130',
  rntValidity: 'del 25/08/2026 al 31/03/2027',
  registroMercantil: '945.293',
  email: 'reservas@cstravelgroup.com',
  // Solo el número de Colombia: un número extranjero en una agencia con RNT
  // colombiano genera ambigüedad de jurisdicción (ítem W-01).
  phones: '+57 314 610 3599',
  web: 'www.cstravelgroup.com',
  city: 'CR 64 No. 91-105, Barranquilla, Atlántico, Colombia',
});

const DEFAULTS = {
  // Datos legales y de marca que aparecen en el pie de las cotizaciones.
  company: {
    ...LEGAL_W02,
    advisorName: 'Andrés Felipe Sánchez De La Parra',
  },
  // Tipo de cambio para MOSTRAR precios en USD (solo display; el cobro por Bold
  // siempre es en COP). usdToCop = cuantos pesos vale 1 USD; showUsd activa el
  // "(~USD $Y)" junto a cada monto. Lo fija el dueño manualmente.
  fx: { usdToCop: 4000, showUsd: false },
};

/** Campos de "company" que el portal real deja cambiar por navegador. */
const DEPLOYED_EDITABLE_COMPANY = ['advisorName'];

function readStored() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
  if (typeof stored !== 'object' || Array.isArray(stored)) stored = {};

  let dirty = false;
  if (Number(stored.legalVersion || 0) < LEGAL_VERSION) {
    delete stored.company; // vuelven los datos oficiales de DEFAULTS
    stored.legalVersion = LEGAL_VERSION;
    dirty = true;
  }
  // Ítem 0.4: ninguna llave de proveedor puede quedar en el navegador.
  RETIRED_PROVIDERS.forEach((key) => {
    if (key in stored) { delete stored[key]; dirty = true; }
  });
  if (dirty) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Si el navegador no deja escribir, igual se devuelven los correctos.
    }
  }
  return stored;
}

export const settingsService = {
  /** true cuando los datos legales son de solo lectura (portal real). */
  isLegalLocked() {
    return isDeployedBundle();
  },

  getAll() {
    const stored = readStored();
    const storedCompany = stored.company || {};
    let company;
    if (this.isLegalLocked()) {
      // Portal real: la identificación legal sale SIEMPRE de W-02.
      company = { ...DEFAULTS.company };
      DEPLOYED_EDITABLE_COMPANY.forEach((key) => {
        if (storedCompany[key]) company[key] = storedCompany[key];
      });
    } else {
      company = { ...DEFAULTS.company, ...storedCompany };
    }
    return {
      legalVersion: LEGAL_VERSION,
      company,
      fx: { ...DEFAULTS.fx, ...(stored.fx || {}) },
    };
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

  /**
   * saveSection()
   * Guarda una sección ('company' o 'fx') en este navegador. En el portal real
   * solo se aceptan los campos de company que son preferencia del operador.
   * @returns {object} La sección tal como queda.
   */
  saveSection(section, data) {
    if (!['company', 'fx'].includes(section)) {
      throw new Error(`Sección de configuración desconocida: ${section}`);
    }
    let patch = { ...(data || {}) };
    if (section === 'company' && this.isLegalLocked()) {
      patch = Object.fromEntries(
        Object.entries(patch).filter(([key]) => DEPLOYED_EDITABLE_COMPANY.includes(key)),
      );
    }
    const stored = readStored();
    stored[section] = { ...(stored[section] || {}), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return this.getAll()[section];
  },

  /** Alias del nombre anterior (compatibilidad con código existente). */
  saveProvider(section, data) {
    return this.saveSection(section, data);
  },
};
