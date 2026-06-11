import { apiService } from './apiService.js';

const RESOURCE = 'users';

export const USER_ROLES = ['admin', 'company', 'doctor'];
export const USER_STATUSES = ['active', 'inactive', 'pending'];

export const userService = {
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
      email: data.email,
      password: data.password || 'Temporal123',
      role: data.role,
      profileType: data.profileType || data.role,
      companyId: data.companyId ? Number(data.companyId) : null,
      doctorId: data.doctorId ? Number(data.doctorId) : null,
      status: data.status || 'pending',
      firstLoginRequired: Boolean(data.firstLoginRequired ?? true),
      createdAt: now,
      lastLogin: null,
      internalNotes: data.internalNotes || '',
    });
  },

  update(id, data) {
    return apiService.patch(RESOURCE, id, data);
  },

  remove(id) {
    return apiService.remove(RESOURCE, id);
  },

  toggleStatus(user) {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    return this.update(user.id, { status: nextStatus });
  },

  getWelcomeEmail(user) {
    return {
      subject: 'Bienvenido al portal de CS Travel',
      body: `Hola ${user.name},

Hemos creado tu acceso al portal de CS Travel.

Usuario: ${user.email}

Para ingresar, utiliza el enlace del portal y sigue las instrucciones de activacion. En tu primer ingreso deberas configurar una nueva contrasena para proteger tu cuenta.

Desde el portal podras consultar tus solicitudes, revisar estados, ver cotizaciones y hacer seguimiento a la informacion relacionada con tu cuenta.

Si tienes algun inconveniente con el acceso, puedes comunicarte con el equipo de CS Travel.

Bienvenido,
Equipo CS Travel`,
    };
  },
};
