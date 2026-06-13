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
};

export const settingsService = {
  getAll() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { ...DEFAULTS, ...stored, booking: { ...DEFAULTS.booking, ...(stored.booking || {}) } };
    } catch {
      return { ...DEFAULTS };
    }
  },

  saveProvider(provider, data) {
    const all = this.getAll();
    all[provider] = { ...all[provider], ...data };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return all[provider];
  },
};
