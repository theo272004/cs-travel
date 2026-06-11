# Guia de implementacion Wix/Velo - CS Travel Etapa 1

Esta guia define como llevar el prototipo actual al ecosistema Wix Studio sin rehacer el alcance en tecnologias externas.

## Paginas Wix necesarias

### Publicas

- `/login`: pagina de inicio de sesion con Wix Members.
- `/no-autorizado`: mensaje de acceso denegado.

### Privadas Empresa

- `/empresa/dashboard`: resumen privado de la empresa autenticada.
- `/empresa/solicitudes`: listado de solicitudes propias.
- `/empresa/solicitudes/nueva`: formulario de nueva solicitud.
- `/empresa/solicitudes/detalle`: detalle de solicitud propia.

### Privadas Admin CS Travel

- `/admin/dashboard`: metricas globales.
- `/admin/empresas`: listado y gestion basica de empresas.
- `/admin/empresas/detalle`: detalle de empresa.
- `/admin/solicitudes`: listado global de solicitudes.
- `/admin/solicitudes/detalle`: detalle y gestion de solicitud.
- `/admin/medicos`: listado y gestion basica de medicos/clinicas.
- `/admin/medicos/detalle`: detalle de medico/clinica.
- `/admin/casos-medicos`: listado global de casos medicos.
- `/admin/casos-medicos/detalle`: detalle y gestion de caso medico.

### Privadas Medico / Clinica

- `/medico/dashboard`: resumen privado del medico/clinica autenticado.
- `/medico/casos`: listado de casos propios.
- `/medico/casos/nuevo`: formulario de nuevo caso logistico.
- `/medico/casos/detalle`: detalle de caso propio.

## Roles Wix

- `CS Travel Admin`: acceso a todas las paginas admin y operaciones globales.
- `Company Member`: acceso solo al dashboard y solicitudes de su empresa.
- `Doctor Member`: acceso solo al dashboard y casos de su perfil medico/clinica.

## Colecciones Wix CMS

### Companies

Campos:

- `companyName` - Text
- `contactName` - Text
- `email` - Text
- `phone` - Text
- `status` - Text: `active` o `inactive`
- `sharedCode` - Text
- `totalRequests` - Number
- `totalTrips` - Number
- `totalCost` - Number
- `estimatedSavings` - Number
- `estimatedReturn` - Number
- `lastUpdate` - Date and Time
- `memberId` - Text, id del miembro Wix asociado

Permisos recomendados:

- Read: Admin
- Create: Admin
- Update: Admin
- Delete: Admin

Las empresas no deben leer esta coleccion directamente desde frontend. Deben recibir solo su registro mediante backend Velo filtrado por `memberId`.

### TravelRequests

Campos:

- `companyId` - Reference a `Companies`
- `requestCode` - Text
- `origin` - Text
- `destination` - Text
- `peopleCount` - Number
- `travelDate` - Date
- `travelClass` - Text: `turista` o `ejecutiva`
- `hasInsurance` - Boolean
- `hasActivities` - Boolean
- `hasTransfers` - Boolean
- `observations` - Rich Text o Text
- `status` - Text
- `estimatedCost` - Number
- `bookingReferenceCost` - Number
- `estimatedSavings` - Number
- `estimatedReturn` - Number
- `createdAt` - Date and Time
- `updatedAt` - Date and Time

Permisos recomendados:

- Read: Admin
- Create: Admin
- Update: Admin
- Delete: Admin

La empresa no debe consultar ni crear registros directamente en la coleccion. Debe usar funciones backend que asignen la empresa desde el miembro autenticado.

### UserRoles

Campos:

- `memberId` - Text
- `role` - Text: `admin`, `company` o `doctor`
- `companyId` - Reference a `Companies`
- `doctorId` - Reference a `Doctors`
- `status` - Text: `active` o `inactive`

Permisos recomendados:

- Read: Admin
- Create: Admin
- Update: Admin
- Delete: Admin

## Backend Velo sugerido

Crear un archivo `backend/csTravel.jsw` con funciones equivalentes:

```js
import wixData from 'wix-data';
import { currentMember } from 'wix-members-backend';

const ACTIVE_STATUSES = [
  'nueva',
  'en cotizacion',
  'cotizacion enviada',
  'aprobada',
  'en gestion',
];

export async function getCurrentUserContext() {
  const member = await currentMember.getMember();
  if (!member) throw new Error('No autenticado.');

  const roleResult = await wixData.query('UserRoles')
    .eq('memberId', member._id)
    .eq('status', 'active')
    .limit(1)
    .find({ suppressAuth: true });

  const role = roleResult.items[0];
  if (!role) throw new Error('Usuario sin rol activo.');

  return {
    memberId: member._id,
    role: role.role,
    companyId: role.companyId,
  };
}

export async function getMyCompanyDashboard() {
  const ctx = await getCurrentUserContext();
  if (ctx.role !== 'company') throw new Error('Acceso no autorizado.');

  const company = await wixData.get('Companies', ctx.companyId, { suppressAuth: true });
  const requests = await wixData.query('TravelRequests')
    .eq('companyId', ctx.companyId)
    .descending('createdAt')
    .find({ suppressAuth: true });

  return {
    company,
    requests: requests.items,
    activeRequests: requests.items.filter((item) => ACTIVE_STATUSES.includes(item.status)),
  };
}

export async function createMyTravelRequest(data) {
  const ctx = await getCurrentUserContext();
  if (ctx.role !== 'company') throw new Error('Acceso no autorizado.');

  validateTravelRequest(data);

  const count = await wixData.query('TravelRequests').count({ suppressAuth: true });
  const now = new Date();
  const requestCode = `REQ-${now.getFullYear()}-${String(count + 1).padStart(4, '0')}`;

  const request = await wixData.insert('TravelRequests', {
    companyId: ctx.companyId,
    requestCode,
    origin: data.origin,
    destination: data.destination,
    peopleCount: Number(data.peopleCount),
    travelDate: new Date(data.travelDate),
    travelClass: data.travelClass,
    hasInsurance: Boolean(data.hasInsurance),
    hasActivities: Boolean(data.hasActivities),
    hasTransfers: Boolean(data.hasTransfers),
    observations: data.observations || '',
    status: 'nueva',
    estimatedCost: 0,
    bookingReferenceCost: 0,
    estimatedSavings: 0,
    estimatedReturn: 0,
    createdAt: now,
    updatedAt: now,
  }, { suppressAuth: true });

  const company = await wixData.get('Companies', ctx.companyId, { suppressAuth: true });
  await wixData.update('Companies', {
    ...company,
    totalRequests: Number(company.totalRequests || 0) + 1,
    lastUpdate: now,
  }, { suppressAuth: true });

  return request;
}

export async function listAdminCompanies() {
  const ctx = await getCurrentUserContext();
  if (ctx.role !== 'admin') throw new Error('Acceso no autorizado.');

  const result = await wixData.query('Companies')
    .ascending('companyName')
    .find({ suppressAuth: true });

  return result.items;
}

export async function listAdminRequests() {
  const ctx = await getCurrentUserContext();
  if (ctx.role !== 'admin') throw new Error('Acceso no autorizado.');

  const result = await wixData.query('TravelRequests')
    .descending('createdAt')
    .include('companyId')
    .find({ suppressAuth: true });

  return result.items;
}

export async function updateAdminTravelRequest(requestId, data) {
  const ctx = await getCurrentUserContext();
  if (ctx.role !== 'admin') throw new Error('Acceso no autorizado.');

  const current = await wixData.get('TravelRequests', requestId, { suppressAuth: true });

  return wixData.update('TravelRequests', {
    ...current,
    status: data.status,
    estimatedCost: Number(data.estimatedCost || 0),
    bookingReferenceCost: Number(data.bookingReferenceCost || 0),
    estimatedSavings: Number(data.estimatedSavings || 0),
    estimatedReturn: Number(data.estimatedReturn || 0),
    updatedAt: new Date(),
  }, { suppressAuth: true });
}

function validateTravelRequest(data) {
  if (!data.origin || !data.destination || !data.travelDate) {
    throw new Error('Origen, destino y fecha son obligatorios.');
  }
  if (!Number.isInteger(Number(data.peopleCount)) || Number(data.peopleCount) < 1) {
    throw new Error('El numero de personas debe ser mayor o igual a 1.');
  }
  if (!['turista', 'ejecutiva'].includes(data.travelClass)) {
    throw new Error('Clase de viaje invalida.');
  }
}
```

## Reglas de seguridad

- El frontend nunca debe enviar un `companyId` elegido por la empresa.
- El frontend nunca debe enviar un `doctorId` elegido por el medico.
- El backend debe obtener la empresa o medico desde `currentMember` + `UserRoles`.
- Las colecciones deben quedar cerradas a miembros normales.
- Las funciones admin deben validar rol antes de consultar o actualizar datos.
- Las paginas admin deben estar protegidas por rol de Wix y por validacion backend.
- No guardar contrasenas propias en colecciones. Usar Wix Members.

## Colecciones medicas para esta version

### Doctors

Campos:

- `name` - Text
- `clinicName` - Text
- `specialty` - Text
- `email` - Text
- `phone` - Text
- `status` - Text: `active` o `inactive`
- `sharedCode` - Text
- `totalCases` - Number
- `activeCases` - Number
- `estimatedLogistics` - Number
- `estimatedMargin` - Number
- `lastUpdate` - Date and Time
- `memberId` - Text, id del miembro Wix asociado

Permisos recomendados:

- Read: Admin
- Create: Admin
- Update: Admin
- Delete: Admin

### MedicalCases

Campos:

- `doctorId` - Reference a `Doctors`
- `caseCode` - Text
- `patientName` - Text
- `origin` - Text
- `destination` - Text
- `travelDate` - Date
- `procedure` - Text
- `requiresLodging` - Boolean
- `requiresTransfers` - Boolean
- `requiresInsurance` - Boolean
- `requiresCompanion` - Boolean
- `observations` - Text
- `status` - Text
- `baseCost` - Number
- `csTravelMargin` - Number
- `doctorMargin` - Number
- `finalPatientValue` - Number
- `createdAt` - Date and Time
- `updatedAt` - Date and Time

Permisos recomendados:

- Read: Admin
- Create: Admin
- Update: Admin
- Delete: Admin

El medico no debe consultar ni crear casos directamente sobre la coleccion. Debe usar backend Velo para que el `doctorId` salga del miembro autenticado.

## Elementos Wix recomendados

- Repeater para cards de metricas.
- Repeater o Table para solicitudes en escritorio.
- Repeater compacto para solicitudes en movil.
- Input, Dropdown, DatePicker, CheckboxGroup y TextBox para nueva solicitud.
- Badges de estado con estilos condicionales.
- Botones de accion primaria: nueva solicitud, guardar cambios, actualizar estado.

## Pendientes fuera de esta etapa

- Integraciones Booking, vuelos u hoteles.
- Cotizaciones automaticas.
- Reportes PDF.
- Exportaciones avanzadas.
- Automatizaciones de correo.
- Tracking avanzado de codigos.
- Dashboard financiero avanzado.
