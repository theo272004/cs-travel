/**
 * eventTemplates.js
 * =============================================================================
 * PROPÓSITO:
 *   Plantillas del panel de EVENTOS: boda, promoción de colegio, evento de
 *   empresa y «en blanco» (otro). Una plantilla solo cambia los VALORES POR
 *   DEFECTO (paquetes, plan de pagos, tramos de cancelación, privacidad,
 *   textos y vocabulario). La contabilidad es la misma para todas
 *   (src/utils/eventLedger.js).
 *
 * QUÉ HAY AQUÍ:
 *   - EVENT_TEMPLATES: la definición de cada plantilla.
 *   - buildEventDraft(): evento + paquetes listos para el asistente, con las
 *     fechas del plan calculadas a partir de la fecha de salida.
 *   - materializeTexts() / fillMessage(): textos de invitación y recordatorio.
 *     Los mensajes NUNCA llevan montos (regla 19); containsAmount() lo revisa.
 *   - parseInviteList(): lee la lista pegada en «Invitar» según la plantilla.
 *   - Etiquetas en español (rsvp, estado del evento, tipo de persona).
 *
 * Todo es puro (sin DOM ni red) para poder probarlo en Node.
 * Contenido legal (W-04): sin «tarifas mayoristas», sin marcas de OTAs, sin
 * urgencia falsa en los textos.
 * =============================================================================
 */

import { addDays, daysBetween } from './eventLedger.js';

export const EVENT_TYPES = Object.freeze(['boda', 'promocion', 'empresa', 'otro']);

/** Tipos de persona y su etiqueta. */
export const AUDIENCE_LABELS = Object.freeze({
  adulto: 'Adulto',
  nino: 'Niño',
  estudiante: 'Estudiante',
  docente: 'Docente',
  colaborador: 'Colaborador',
  acompanante: 'Acompañante',
});

/** Estado de la invitación (eventAccounts.rsvp). */
export const RSVP_LABELS = Object.freeze({
  sin_enviar: 'Sin enviar',
  enviada: 'Enviada',
  vista: 'Vista',
  confirmada: 'Confirmada',
  no_asiste: 'No asiste',
});

/** Estado del evento (events.status). */
export const EVENT_STATUS_LABELS = Object.freeze({
  borrador: 'Borrador',
  abierto: 'Abierto',
  cerrado: 'Cerrado',
  en_viaje: 'En viaje',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
});

/** Permisos de un organizador sobre su evento. */
export const ORGANIZER_PERMISSION_LABELS = Object.freeze({
  titular: 'Titular (puede aportar y pagar la cuenta anfitrión)',
  colaborador: 'Colaborador (invita y recuerda)',
  lectura: 'Solo lectura',
});

/** Etapas del stepper del evento, en orden. */
export const EVENT_STAGES = Object.freeze([
  { key: 'invitaciones', label: 'Invitaciones' },
  { key: 'confirmaciones', label: 'Confirmaciones' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'viaje', label: 'Viaje' },
  { key: 'cierre', label: 'Cierre' },
]);

/**
 * Definición de cada plantilla.
 *   - plan.hitos: metas con % ACUMULADO y `daysBefore` (días antes de la
 *     salida). buildEventDraft() las convierte en fechas.
 *   - packages: paquetes base. serviceFee se calcula (price − thirdPartyCost).
 *   - vocab: palabras que cambian según la plantilla.
 *   - pasteColumns: columnas que se esperan al pegar una lista.
 */
export const EVENT_TEMPLATES = Object.freeze({
  boda: {
    type: 'boda',
    label: 'Boda',
    description: 'Invitaciones por familia. Los novios cubren una parte a todos y ven «al día» o «atrasado», sin montos.',
    preloads: ['Paquetes adulto y niño', 'Los novios cubren la cena de bienvenida', 'Reserva del 20 % y dos metas', 'Privacidad: solo estado'],
    accent: '#c2677e',
    hostVisibility: 'solo_estado',
    requiresDocs: false,
    hostAccountName: '{anfitrion}',
    packages: [
      { name: 'Adulto · habitación doble · 3 noches', audience: 'adulto', price: 1380000, thirdPartyCost: 1230000, hostCoversType: 'fixed', hostCoversValue: 180000, hostCoversLabel: 'La cena de bienvenida y el traslado' },
      { name: 'Niño de 2 a 11 años · 3 noches', audience: 'nino', price: 620000, thirdPartyCost: 560000, hostCoversType: 'fixed', hostCoversValue: 180000, hostCoversLabel: 'La cena de bienvenida y el traslado' },
    ],
    plan: {
      reserva: { pct: 20, dueDays: 10 },
      hitos: [
        { key: 'mitad', label: 'Mitad del viaje', pct: 50, daysBefore: 90 },
        { key: 'total', label: 'Pago total', pct: 100, daysBefore: 30 },
      ],
      minAbono: 100000,
    },
    cancellationTiers: [{ minDays: 120, pct: 0 }, { minDays: 60, pct: 30 }, { minDays: 0, pct: 100 }],
    inviteText: '¡Hola, {nombre}! {anfitrion} queremos celebrar contigo en {destino} ({fechas}). Confirma tu asistencia y mira los detalles del viaje aquí: {enlace}',
    reminderText: 'Hola, {nombre}. Te recordamos revisar tu cuenta del viaje «{evento}». Ahí ves tu próxima meta y puedes pagar en línea: {enlace}',
    groupText: '¡Hola a todos! Cada familia ya puede revisar su cuenta del viaje «{evento}» con el enlace personal que le enviamos. Cualquier duda, nos escriben.',
    vocab: {
      cuenta: 'Invitación', cuentas: 'Invitaciones', cuentaAlt: 'Familia',
      persona: 'Invitado', personas: 'Invitados',
      contacto: 'Titular', grupo: 'Grupo',
      anfitrion: 'los novios', anfitrionCard: 'Cubierto por los novios',
    },
    pasteColumns: [
      { key: 'invitacion', label: 'Invitación' },
      { key: 'cupos', label: 'Cupos' },
      { key: 'celular', label: 'Celular' },
    ],
    extraFields: ['dieta'],
  },

  promocion: {
    type: 'promocion',
    label: 'Promoción de colegio',
    description: 'Una cuenta por estudiante con su acudiente. El fondo de la promoción aporta a todos y el comité ve los montos.',
    preloads: ['Paquete estudiante y docente', 'Docentes cubiertos por el fondo', 'Reserva de $ 300.000 y cuatro metas', 'Privacidad: con montos'],
    accent: '#2f7dd1',
    hostVisibility: 'montos',
    requiresDocs: true,
    hostAccountName: 'Fondo de la promoción',
    packages: [
      { name: 'Estudiante · 4 noches todo incluido', audience: 'estudiante', price: 2890000, thirdPartyCost: 2540000, hostCoversType: 'none', hostCoversValue: 0, hostCoversLabel: '' },
      { name: 'Docente acompañante', audience: 'docente', price: 2890000, thirdPartyCost: 2540000, hostCoversType: 'pct', hostCoversValue: 100, hostCoversLabel: 'El viaje completo del docente' },
    ],
    plan: {
      reserva: { amount: 300000, dueDays: 7 },
      hitos: [
        { key: 'm30', label: '30 % del viaje', pct: 30, daysBefore: 150 },
        { key: 'm60', label: '60 % del viaje', pct: 60, daysBefore: 90 },
        { key: 'm85', label: '85 % del viaje', pct: 85, daysBefore: 45 },
        { key: 'total', label: 'Pago total', pct: 100, daysBefore: 30 },
      ],
      minAbono: 100000,
    },
    cancellationTiers: [{ minDays: 90, pct: 0 }, { minDays: 60, pct: 20 }, { minDays: 30, pct: 50 }, { minDays: 0, pct: 100 }],
    inviteText: 'Hola, {nombre}. Este es el enlace personal para el viaje «{evento}» a {destino} ({fechas}). Ahí confirmas la asistencia del estudiante y ves su plan de pagos: {enlace}',
    reminderText: 'Hola, {nombre}. Te recordamos revisar la cuenta del viaje «{evento}». Ahí ves la próxima meta y puedes pagar en línea: {enlace}',
    groupText: 'Buen día, familias. Ya pueden revisar la cuenta del viaje «{evento}» con el enlace personal que les llegó. Cualquier duda, escríbannos por aquí.',
    vocab: {
      cuenta: 'Estudiante', cuentas: 'Estudiantes', cuentaAlt: 'Estudiante',
      persona: 'Estudiante', personas: 'Estudiantes',
      contacto: 'Acudiente', grupo: 'Curso',
      anfitrion: 'el fondo de la promoción', anfitrionCard: 'Fondo de la promoción',
    },
    pasteColumns: [
      { key: 'estudiante', label: 'Estudiante' },
      { key: 'curso', label: 'Curso' },
      { key: 'acudiente', label: 'Acudiente' },
      { key: 'celular', label: 'Celular' },
    ],
    extraFields: ['talla', 'dieta'],
  },

  empresa: {
    type: 'empresa',
    label: 'Evento de empresa',
    description: 'La empresa paga el viaje de cada colaborador y el colaborador paga el de su acompañante. Talento Humano ve los montos.',
    preloads: ['Paquete colaborador y acompañante', 'La empresa cubre al colaborador', 'Tres metas sin reserva', 'Privacidad: con montos'],
    accent: '#1f9d8a',
    hostVisibility: 'montos',
    requiresDocs: true,
    hostAccountName: '{anfitrion}',
    packages: [
      { name: 'Colaborador · 3 noches', audience: 'colaborador', price: 2450000, thirdPartyCost: 2150000, hostCoversType: 'pct', hostCoversValue: 100, hostCoversLabel: 'El viaje completo del colaborador' },
      { name: 'Acompañante · 3 noches', audience: 'acompanante', price: 2100000, thirdPartyCost: 1850000, hostCoversType: 'none', hostCoversValue: 0, hostCoversLabel: '' },
    ],
    plan: {
      reserva: null,
      hitos: [
        { key: 'm30', label: '30 % del viaje', pct: 30, daysBefore: 65 },
        { key: 'm70', label: '70 % del viaje', pct: 70, daysBefore: 35 },
        { key: 'total', label: 'Pago total', pct: 100, daysBefore: 15 },
      ],
      minAbono: 100000,
    },
    cancellationTiers: [{ minDays: 60, pct: 0 }, { minDays: 30, pct: 50 }, { minDays: 0, pct: 100 }],
    inviteText: 'Hola, {nombre}. Te invitamos al viaje «{evento}» a {destino} ({fechas}). Confirma si vas, si llevas acompañante y mira los detalles aquí: {enlace}',
    reminderText: 'Hola, {nombre}. Te recordamos revisar tu cuenta del viaje «{evento}». Ahí ves tu próxima meta y puedes pagar en línea: {enlace}',
    groupText: 'Hola, equipo. Ya pueden revisar su cuenta del viaje «{evento}» con el enlace personal que les enviamos. Cualquier duda, escriban a Talento Humano.',
    vocab: {
      cuenta: 'Colaborador', cuentas: 'Colaboradores', cuentaAlt: 'Colaborador',
      persona: 'Viajero', personas: 'Viajeros',
      contacto: 'Colaborador', grupo: 'Área',
      anfitrion: 'la empresa', anfitrionCard: 'Parte de {anfitrion}',
    },
    pasteColumns: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'correo', label: 'Correo' },
      { key: 'area', label: 'Área' },
    ],
    extraFields: ['area', 'talla'],
  },

  otro: {
    type: 'otro',
    label: 'En blanco',
    description: 'Para un congreso u otro viaje de grupo. Arranca con un paquete sin cobertura y dos metas; todo se puede cambiar.',
    preloads: ['Un paquete por persona', 'Sin cobertura del anfitrión', 'Dos metas', 'Privacidad: solo estado'],
    accent: '#7c6fd6',
    hostVisibility: 'solo_estado',
    requiresDocs: false,
    hostAccountName: '{anfitrion}',
    packages: [
      { name: 'Participante', audience: 'adulto', price: 1000000, thirdPartyCost: 880000, hostCoversType: 'none', hostCoversValue: 0, hostCoversLabel: '' },
    ],
    plan: {
      reserva: null,
      hitos: [
        { key: 'mitad', label: 'Mitad del viaje', pct: 50, daysBefore: 60 },
        { key: 'total', label: 'Pago total', pct: 100, daysBefore: 20 },
      ],
      minAbono: 100000,
    },
    cancellationTiers: [{ minDays: 60, pct: 0 }, { minDays: 30, pct: 50 }, { minDays: 0, pct: 100 }],
    inviteText: 'Hola, {nombre}. Te invitamos al viaje «{evento}» a {destino} ({fechas}). Confirma tu asistencia y mira los detalles aquí: {enlace}',
    reminderText: 'Hola, {nombre}. Te recordamos revisar tu cuenta del viaje «{evento}». Ahí ves tu próxima meta y puedes pagar en línea: {enlace}',
    groupText: '¡Hola a todos! Ya pueden revisar su cuenta del viaje «{evento}» con el enlace personal que les enviamos.',
    vocab: {
      cuenta: 'Inscripción', cuentas: 'Inscripciones', cuentaAlt: 'Inscripción',
      persona: 'Participante', personas: 'Participantes',
      contacto: 'Titular', grupo: 'Grupo',
      anfitrion: 'el anfitrión', anfitrionCard: 'Cubierto por el anfitrión',
    },
    pasteColumns: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'cupos', label: 'Cupos' },
      { key: 'celular', label: 'Celular' },
    ],
    extraFields: [],
  },
});

/** Plantilla de un tipo (con respaldo en 'otro'). */
export function getTemplate(type) {
  return EVENT_TEMPLATES[type] || EVENT_TEMPLATES.otro;
}

/** Vocabulario de la plantilla, con {anfitrion} ya reemplazado. */
export function vocabFor(type, hostName = '') {
  const vocab = { ...getTemplate(type).vocab };
  vocab.anfitrionCard = vocab.anfitrionCard.replace('{anfitrion}', hostName || 'la empresa');
  return vocab;
}

/* ---------------------------------------------------------------------------
 * Fechas legibles para los textos (sin depender de Intl para poder probar)
 * ------------------------------------------------------------------------ */

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-12-02' -> '2 de diciembre de 2026'. */
export function longDate(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** Rango de fechas del viaje: 'del 2 al 6 de diciembre de 2026'. */
export function tripDates(startDate, endDate) {
  if (!startDate) return '';
  if (!endDate || endDate === startDate) return `el ${longDate(startDate)}`;
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `del ${d1} al ${d2} de ${MONTHS[m2 - 1]} de ${y2}`;
  if (y1 === y2) return `del ${d1} de ${MONTHS[m1 - 1]} al ${d2} de ${MONTHS[m2 - 1]} de ${y2}`;
  return `del ${longDate(startDate)} al ${longDate(endDate)}`;
}

/* ---------------------------------------------------------------------------
 * Textos de WhatsApp (regla 19: nunca montos; el del grupo, sin nombres)
 * ------------------------------------------------------------------------ */

/**
 * ¿El texto trae algo que parezca un monto? Signo $, la palabra «pesos» o
 * «COP», cifras con puntos de miles o de 5 dígitos o más. (Los años, de 4
 * dígitos, sí se permiten: «diciembre de 2026».)
 */
export function containsAmount(text) {
  const t = String(text || '').replace(/\{[a-z]+\}/g, '');
  return /\$|\bpesos\b|\bCOP\b|\d{1,3}(?:[.,]\d{3})+|\d{5,}/i.test(t);
}

/**
 * Reemplaza los datos del EVENTO en un texto de plantilla y deja {nombre} y
 * {enlace} para cuando se envíe a cada cuenta.
 */
export function materializeTexts(text, event) {
  return String(text || '')
    .replaceAll('{evento}', event.title || '')
    .replaceAll('{anfitrion}', event.hostDisplayName || '')
    .replaceAll('{destino}', event.destination || '')
    .replaceAll('{fechas}', tripDates(event.startDate, event.endDate));
}

/**
 * Arma el mensaje final para una cuenta. Acepta también los datos del evento
 * por si el texto guardado todavía trae {evento}, {destino}, etc.
 */
export function fillMessage(text, { nombre = '', enlace = '', event = null } = {}) {
  const base = event ? materializeTexts(text, event) : String(text || '');
  return base.replaceAll('{nombre}', nombre).replaceAll('{enlace}', enlace).replace(/\s+\n/g, '\n').trim();
}

/** Enlace personal del invitado (en el demo, ruta #/e/<code> del SPA). */
export function guestLink(accessCode, origin = '') {
  return `${origin}#/e/${accessCode}`;
}

/* ---------------------------------------------------------------------------
 * Evento nuevo a partir de una plantilla (asistente de 4 pasos)
 * ------------------------------------------------------------------------ */

/**
 * Metas con fecha a partir de la plantilla: fecha = salida − daysBefore.
 * La última meta nunca queda a menos de 15 días del viaje.
 */
export function planFor(type, startDate) {
  const tpl = getTemplate(type);
  const hitos = tpl.plan.hitos.map((h) => ({
    key: h.key,
    label: h.label,
    pct: h.pct,
    date: startDate ? addDays(startDate, -Math.max(h.daysBefore, 15)) : null,
  }));
  return {
    reserva: tpl.plan.reserva ? { ...tpl.plan.reserva } : null,
    hitos,
    minAbono: tpl.plan.minAbono,
  };
}

/**
 * Borrador de evento listo para el asistente. No tiene ids: eventService
 * lo guarda con createEvent(). `overrides` pisa cualquier campo.
 * Si la salida está tan cerca que alguna meta cae antes de hoy, esa meta
 * se deja en hoy (el admin la puede editar).
 */
export function buildEventDraft(type, overrides = {}, today = null) {
  const tpl = getTemplate(type);
  const startDate = overrides.startDate || null;
  const plan = overrides.plan ? JSON.parse(JSON.stringify(overrides.plan)) : planFor(tpl.type, startDate);
  if (today && plan.hitos) {
    plan.hitos = plan.hitos.map((h) => (h.date && daysBetween(today, h.date) < 0 ? { ...h, date: today } : h));
  }
  const event = {
    slug: '',
    type: tpl.type,
    title: '',
    hostDisplayName: '',
    companyId: null,
    originCode: null,
    destination: '',
    startDate,
    endDate: null,
    rsvpDeadline: null,
    status: 'borrador',
    capacity: 0,
    hostVisibility: tpl.hostVisibility,
    plan,
    cancellationTiers: tpl.cancellationTiers.map((t) => ({ ...t })),
    organizers: [],
    advisor: { name: '', phone: '', email: '' },
    includes: [],
    inviteText: tpl.inviteText,
    reminderText: tpl.reminderText,
    publishedAt: null,
    ...overrides,
    plan,
  };
  const packages = (overrides.packages || tpl.packages).map((p, index) => ({
    ...p,
    serviceFee: p.price - (p.thirdPartyCost || 0),
    capacity: p.capacity ?? null,
    status: p.status || 'activo',
    sortOrder: p.sortOrder ?? index + 1,
  }));
  delete event.packages;
  return { event, packages, hostAccountName: tpl.hostAccountName };
}

/** Slug estable a partir del título: 'Nos casamos en Cartagena' -> 'nos-casamos-en-cartagena'. */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'evento';
}

/* ---------------------------------------------------------------------------
 * «Pegar una lista» (Invitar)
 * ------------------------------------------------------------------------ */

/**
 * Celular colombiano: 10 dígitos que empiezan por 3. Acepta espacios,
 * guiones y el +57 delante. Devuelve '+573001234567' o null.
 */
export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('57')) digits = digits.slice(2);
  if (digits.length !== 10 || !digits.startsWith('3')) return null;
  return `+57${digits}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parte una línea pegada en celdas: tabulador, punto y coma, barra o coma. */
function splitCells(line) {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : line.includes('|') ? '|' : ',';
  return line.split(sep).map((c) => c.trim()).filter(Boolean);
}

/**
 * Lee la lista pegada (una línea por invitación) según la plantilla:
 *   boda:      invitación, cupos, celular
 *   promoción: estudiante, curso, acudiente, celular
 *   empresa:   nombre, correo, área
 * El celular y el correo se reconocen estén en la columna que estén.
 * Devuelve filas con `errors` por fila y marca duplicados (mismo nombre o
 * mismo celular/correo). No escribe nada.
 */
export function parseInviteList(type, text) {
  const rows = [];
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const raw of lines) {
    const cells = splitCells(raw);
    let phone = null;
    let email = null;
    let seats = null;
    const rest = [];
    for (const cell of cells) {
      if (!email && EMAIL_RE.test(cell)) { email = cell.toLowerCase(); continue; }
      const maybePhone = /\d{7,}/.test(cell.replace(/[\s-]/g, '')) ? normalizePhone(cell) : null;
      if (!phone && maybePhone) { phone = maybePhone; continue; }
      if (!phone && /^\+?[\d\s-]{7,}$/.test(cell)) { phone = 'invalido'; continue; }
      if (seats == null && /^\d{1,2}$/.test(cell) && type !== 'promocion') { seats = Number(cell); continue; }
      rest.push(cell);
    }
    const row = { raw, name: rest[0] || '', group: '', contactName: '', seats: seats || 1, phone: phone === 'invalido' ? null : phone, email, errors: [] };
    if (type === 'promocion') {
      row.group = rest[1] || '';
      row.contactName = rest[2] || '';
    } else if (type === 'empresa') {
      row.group = rest[1] || '';
      row.contactName = row.name;
    } else {
      row.contactName = row.name;
    }
    if (!row.name) row.errors.push('Falta el nombre.');
    if (phone === 'invalido') row.errors.push('El celular debe tener 10 dígitos y empezar por 3.');
    if (type === 'empresa' && !email) row.errors.push('Falta el correo.');
    if (type !== 'empresa' && !row.phone) row.errors.push('Falta el celular.');
    if (row.seats < 1 || row.seats > 20) row.errors.push('Los cupos deben estar entre 1 y 20.');
    rows.push(row);
  }
  // Duplicados dentro de la misma lista.
  const seen = new Map();
  rows.forEach((row, index) => {
    for (const key of [row.name && `n:${row.name.toLowerCase()}`, row.phone && `p:${row.phone}`, row.email && `e:${row.email}`]) {
      if (!key) continue;
      if (seen.has(key)) row.errors.push(`Repetida con la línea ${seen.get(key) + 1}.`);
      else seen.set(key, index);
    }
  });
  return rows;
}
