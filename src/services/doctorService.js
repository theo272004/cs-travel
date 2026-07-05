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

  /**
   * recompute()
   * Recalcula los agregados de UN medico a partir de sus casos reales y los
   * persiste. Mantiene en sincronia el dashboard del medico y el panel admin
   * cuando se cotiza, se ajusta el margen o cambia el estado de un caso.
   *   - estimatedLogistics: costo logistico total (base + margen CS Travel).
   *   - estimatedMargin: margen total del medico.
   */
  async recompute(doctorId) {
    // El recalculo de agregados es BEST-EFFORT y NUNCA debe romper la accion del
    // usuario. En produccion un no-admin (medico) NO puede escribir 'doctors'
    // (por seguridad server-side); ahi el servidor recalcula los agregados tras
    // su accion. En demo y para el admin, este update si persiste. Por eso
    // tragamos cualquier fallo (p. ej. 403) en vez de propagar un error enganoso.
    try {
      const cases = await apiService.get('medicalCases', { doctorId });
      const CLOSED = ['finalizada', 'cancelada'];
      const totals = cases.reduce(
        (acc, c) => {
          acc.totalCases += 1;
          if (!CLOSED.includes(c.status)) acc.activeCases += 1;
          acc.estimatedLogistics += (c.baseCost || 0) + (c.csTravelMargin || 0);
          acc.estimatedMargin += c.doctorMargin || 0;
          return acc;
        },
        { totalCases: 0, activeCases: 0, estimatedLogistics: 0, estimatedMargin: 0 }
      );
      return await this.update(doctorId, totals);
    } catch (e) {
      return null;
    }
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
