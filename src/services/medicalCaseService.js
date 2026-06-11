import { apiService } from './apiService.js';

const RESOURCE = 'medicalCases';

export const MEDICAL_CASE_STATUSES = [
  'caso enviado',
  'en revision',
  'en cotizacion',
  'cotizacion enviada',
  'aprobada',
  'en gestion',
  'finalizada',
  'cancelada',
];

const ACTIVE_STATUSES = [
  'caso enviado',
  'en revision',
  'en cotizacion',
  'cotizacion enviada',
  'aprobada',
  'en gestion',
];

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
      doctorId: Number(data.doctorId),
      caseCode: `MED-${new Date().getFullYear()}-${nextNumber}`,
      patientName: data.patientName,
      origin: data.origin,
      destination: data.destination,
      travelDate: data.travelDate,
      procedure: data.procedure,
      hasFlight: Boolean(data.hasFlight),
      requiresLodging: Boolean(data.requiresLodging),
      requiresTransfers: Boolean(data.requiresTransfers),
      requiresInsurance: Boolean(data.requiresInsurance),
      requiresCompanion: Boolean(data.requiresCompanion),
      languageOrSpecialCondition: data.languageOrSpecialCondition || '',
      observations: data.observations || '',
      status: 'caso enviado',
      baseCost: 0,
      csTravelMargin: 0,
      doctorMargin: 0,
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
