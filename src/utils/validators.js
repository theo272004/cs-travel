/**
 * validators.js
 * =============================================================================
 * PROPOSITO:
 *   Funciones puras de validacion reutilizables en los formularios (login,
 *   nueva empresa, nueva solicitud).
 *
 * RESPONSABILIDADES:
 *   - Validar formato de email.
 *   - Validar campos obligatorios.
 *   - Validar reglas especificas (numero de personas, fechas, etc).
 *   - validateRequestForm() / validateCompanyForm(): validan un formulario
 *     completo y devuelven un objeto de errores (vacio si todo es valido).
 *
 * CONVENCION:
 *   Cada validador de formulario devuelve { isValid: boolean, errors: {} }.
 *   Las vistas usan ese objeto para mostrar mensajes junto a cada campo.
 * =============================================================================
 */

/** true si el texto tiene formato de email valido. */
export function isValidEmail(email) {
  // Expresion regular sencilla: algo@algo.algo
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(String(email).trim());
}

/** true si el valor no esta vacio (ignora espacios). */
export function isNotEmpty(value) {
  return String(value || '').trim().length > 0;
}

/** true si el numero es entero y mayor o igual al minimo indicado. */
export function isPositiveInteger(value, min = 1) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min;
}

/** true si la fecha ISO yyyy-mm-dd es hoy o una fecha futura. */
export function isTodayOrFutureDate(value) {
  if (!isNotEmpty(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

/**
 * validateLoginForm()
 * Valida el formulario de inicio de sesion.
 * @param {object} data - { email, password }
 * @returns {{ isValid: boolean, errors: object }}
 */
export function validateLoginForm({ email, password }) {
  const errors = {};

  if (!isNotEmpty(email)) {
    errors.email = 'El email es obligatorio.';
  } else if (!isValidEmail(email)) {
    errors.email = 'El email no tiene un formato valido.';
  }

  if (!isNotEmpty(password)) {
    errors.password = 'La contrasena es obligatoria.';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * validateCompanyForm()
 * Valida el formulario de creacion/edicion de empresa.
 * @param {object} data - { name, contactName, email, phone, sharedCode }
 */
export function validateCompanyForm({ name, contactName, email, phone, sharedCode }) {
  const errors = {};

  if (!isNotEmpty(name)) errors.name = 'El nombre de la empresa es obligatorio.';
  if (!isNotEmpty(contactName)) errors.contactName = 'El nombre de contacto es obligatorio.';

  if (!isNotEmpty(email)) {
    errors.email = 'El email es obligatorio.';
  } else if (!isValidEmail(email)) {
    errors.email = 'El email no tiene un formato valido.';
  }

  if (!isNotEmpty(phone)) errors.phone = 'El telefono es obligatorio.';
  if (!isNotEmpty(sharedCode)) errors.sharedCode = 'El codigo compartido es obligatorio.';

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * validateRequestForm()
 * Valida el formulario de nueva solicitud de viaje.
 * @param {object} data - { requestType, origin, destination, peopleCount, travelDate, travelClass }
 *
 * `requestType` es multi-valor ("vuelo, hotel"): se exige al menos un tipo y los
 * campos obligatorios DEPENDEN del tipo (origen y clase solo aplican a servicios
 * con punto de salida: vuelo, traslado, paquete). Así un "Hotel" no obliga a
 * poner origen ni clase de viaje, que no le corresponden.
 */
export function validateRequestForm({ requestType, origin, destination, peopleCount, travelDate, travelClass }) {
  const errors = {};

  const types = String(requestType || '')
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const needsOrigin = types.some((t) => ['vuelo', 'paquete', 'traslado'].includes(t));
  const needsClass = types.some((t) => ['vuelo', 'paquete'].includes(t));

  if (!types.length) errors.requestType = 'Elige al menos un tipo de solicitud.';

  if (needsOrigin && !isNotEmpty(origin)) {
    errors.origin = 'El origen es obligatorio para vuelos, traslados o paquetes.';
  }
  if (!isNotEmpty(destination)) errors.destination = 'El destino es obligatorio.';

  if (!isPositiveInteger(peopleCount, 1)) {
    errors.peopleCount = 'Indica al menos 1 persona.';
  }

  if (!isNotEmpty(travelDate)) {
    errors.travelDate = 'La fecha del viaje es obligatoria.';
  } else if (!isTodayOrFutureDate(travelDate)) {
    errors.travelDate = 'La fecha del viaje no puede ser anterior a hoy.';
  }

  if (needsClass && !['turista', 'ejecutiva'].includes(travelClass)) {
    errors.travelClass = 'Selecciona una clase de viaje valida.';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * validateMedicalCaseForm()
 * Valida un caso medico/logistico creado por medico o admin.
 * @param {object} data - { patientName, origin, destination, travelDate, procedure, peopleCount?, caseKind? }
 *
 * caseKind='interna' (solicitud del propio medico/clinica) hace OPCIONAL el
 * paciente; el resto (ruta, fecha, motivo) sigue obligatorio en ambos casos.
 */
export function validateMedicalCaseForm({ patientName, origin, destination, travelDate, procedure, peopleCount, caseKind }) {
  const errors = {};
  const isInternal = caseKind === 'interna';

  if (!isInternal && !isNotEmpty(patientName)) errors.patientName = 'El nombre o identificador del paciente es obligatorio.';
  if (!isNotEmpty(origin)) errors.origin = 'El origen es obligatorio.';
  if (!isNotEmpty(destination)) errors.destination = 'El destino es obligatorio.';
  if (!isNotEmpty(procedure)) errors.procedure = 'El procedimiento o motivo es obligatorio.';

  if (peopleCount !== undefined && peopleCount !== '' && !isPositiveInteger(peopleCount, 1)) {
    errors.peopleCount = 'Indica al menos 1 persona.';
  }

  if (!isNotEmpty(travelDate)) {
    errors.travelDate = 'La fecha estimada de viaje es obligatoria.';
  } else if (!isTodayOrFutureDate(travelDate)) {
    errors.travelDate = 'La fecha estimada no puede ser anterior a hoy.';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
