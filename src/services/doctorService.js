import { apiService } from './apiService.js';

const RESOURCE = 'doctors';

export const doctorService = {
  getAll() {
    return apiService.get(RESOURCE);
  },

  getById(id) {
    return apiService.getById(RESOURCE, id);
  },

  create(data) {
    const now = new Date().toISOString();
    return apiService.post(RESOURCE, {
      name: data.name,
      clinicName: data.clinicName,
      specialty: data.specialty,
      email: data.email,
      phone: data.phone,
      status: data.status || 'active',
      sharedCode: data.sharedCode,
      totalCases: 0,
      activeCases: 0,
      estimatedLogistics: 0,
      estimatedMargin: 0,
      lastUpdate: now,
    });
  },

  update(id, data) {
    return apiService.patch(RESOURCE, id, {
      ...data,
      lastUpdate: new Date().toISOString(),
    });
  },

  toggleStatus(doctor) {
    const nextStatus = doctor.status === 'active' ? 'inactive' : 'active';
    return this.update(doctor.id, { status: nextStatus });
  },

  async getMetrics() {
    const doctors = await this.getAll();
    return doctors.reduce(
      (acc, doctor) => {
        acc.totalDoctors += 1;
        if (doctor.status === 'active') acc.activeDoctors += 1;
        acc.totalCases += doctor.totalCases || 0;
        acc.activeCases += doctor.activeCases || 0;
        acc.estimatedLogistics += doctor.estimatedLogistics || 0;
        acc.estimatedMargin += doctor.estimatedMargin || 0;
        return acc;
      },
      {
        totalDoctors: 0,
        activeDoctors: 0,
        totalCases: 0,
        activeCases: 0,
        estimatedLogistics: 0,
        estimatedMargin: 0,
      }
    );
  },
};
