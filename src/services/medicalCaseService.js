import { apiService } from './apiService.js';

const RESOURCE = 'medicalCases';

// Mismo modelo de 6 estados que las solicitudes (ver requestService.js).
export const MEDICAL_CASE_STATUSES = [
  'solicitud enviada',
  'cotizacion enviada',
  'aprobada',
  'en gestion',
  'finalizada',
  'cancelada',
];

const ACTIVE_STATUSES = [
  'solicitud enviada',
  'cotizacion enviada',
  'aprobada',
  'en gestion',
];

/** true si el caso es una solicitud INTERNA del medico/clinica (no de un paciente). */
export function isInternalCase(item) {
  return item?.caseKind === 'interna';
}

export const medicalCaseService = {
  getAll() {
    return apiService.get(RESOURCE);
  },

  getByDoctor(doctorId) {
    return apiService.get(RESOURCE, { doctorId });
  },

  getById(id) {
    return apiService.getById(RESOURCE, id);
  },

  async create(data) {
    const existing = await this.getAll();
    const nextNumber = String(existing.length + 1).padStart(4, '0');
    const now = new Date().toISOString();

    return apiService.post(RESOURCE, {
      // doctorId puede ser numerico (demo) o el memberId de Wix (portal real).
      doctorId: data.doctorId,
      caseCode: `MED-${new Date().getFullYear()}-${nextNumber}`,
      // Tipo de solicitud del medico: 'paciente' (externo) o 'interna' (para el
      // medico/clinica). Ver isInternalCase().
      caseKind: data.caseKind || 'paciente',
      patientName: data.patientName,
      procedure: data.procedure,
      peopleCount: Number(data.peopleCount) || 1,
      travelClass: data.travelClass || 'turista',
      origin: data.origin,
      destination: data.destination,
      travelDate: data.travelDate,
      returnDate: data.returnDate || '',
      // Identidad del paciente (para emitir tiquetes).
      fullName: data.fullName || '',
      documentType: data.documentType || '',
      documentNumber: data.documentNumber || '',
      nationality: data.nationality || '',
      hasFlight: Boolean(data.hasFlight),
      requiresLodging: Boolean(data.requiresLodging),
      requiresTransfers: Boolean(data.requiresTransfers),
      requiresInsurance: Boolean(data.requiresInsurance),
      requiresCompanion: Boolean(data.requiresCompanion),
      languageOrSpecialCondition: data.languageOrSpecialCondition || '',
      observations: data.observations || '',
      // Código de referido/descuento anotado por el médico (manual). Atribuye la
      // venta a un socio y se contabiliza en el panel de códigos.
      referralCode: data.referralCode || '',
      status: 'solicitud enviada',
      baseCost: 0,
      csTravelMargin: 0,
      doctorMargin: 0,
      doctorMarginSuggested: 0,
      doctorMarginMax: 0,
      marketReferenceCost: 0,
      finalPatientValue: 0,
      quoteDetails: '',
      adminNotes: '',
      clientNotes: '',
      priority: data.priority || 'normal',
      createdAt: now,
      updatedAt: now,
    });
  },

  update(id, data) {
    return apiService.patch(RESOURCE, id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  },

  getActive(cases) {
    return cases.filter((item) => ACTIVE_STATUSES.includes(item.status));
  },
};
