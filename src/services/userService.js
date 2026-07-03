import { apiService } from './apiService.js';

const RESOURCE = 'users';

export const USER_ROLES = ['admin', 'company', 'doctor'];
export const USER_STATUSES = ['active', 'inactive', 'pending'];

/**
 * Rol canónico. El SPA usa 'company'/'doctor' pero producción (Wix) guarda
 * 'empresa'/'medico'. Esto los unifica para comparar/filtrar/mostrar sin importar
 * el vocabulario, y evita que un rol con el otro vocabulario "desaparezca" de los
 * filtros. Mismo criterio que el backend (session.ts canonicalRole).
 */
export function canonicalRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'doctor' || r === 'medico') return 'medico';
  if (r === 'company' || r === 'empresa') return 'empresa';
  if (r === 'admin') return 'admin';
  return r;
}

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

  /**
   * Activa/desactiva un usuario. Al DESACTIVAR se guarda el motivo
   * (incumplimiento de contrato, etc.) en `deactivationReason` y se deja
   * traza con fecha en `internalNotes`. Al reactivar se limpia el motivo.
   */
  toggleStatus(user, reason = '') {
    const isDeactivating = user.status === 'active';
    const nextStatus = isDeactivating ? 'inactive' : 'active';
    const stamp = new Date().toISOString().slice(0, 10);
    const prevNotes = user.internalNotes ? `${user.internalNotes}\n` : '';

    const patch = { status: nextStatus };
    if (isDeactivating) {
      patch.deactivationReason = reason || '';
      patch.internalNotes = `${prevNotes}[${stamp}] Desactivado${reason ? `: ${reason}` : ''}`;
    } else {
      patch.deactivationReason = '';
      patch.internalNotes = `${prevNotes}[${stamp}] Reactivado`;
    }
    return this.update(user.id, patch);
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
