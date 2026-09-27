// semilla-eventos.mjs
// =============================================================================
// PROPÓSITO:
//   Genera los datos DEMO del panel de Eventos y los escribe en src/data/db.json:
//     events, eventPackages, eventAccounts, eventGuests, eventLedger, eventLog
//   más los 3 usuarios organizadores (role 'event').
//
// REGLAS DE ESTE SCRIPT:
//   - DETERMINISTA: sin Math.random ni Date.now. Fecha de referencia del demo:
//     26 de septiembre de 2026 (SEED_TODAY). Nombres de listas fijas y pagos por
//     patrón: correrlo dos veces produce exactamente el mismo JSON.
//   - Las líneas del libro NO se escriben a mano: salen de las mismas funciones
//     de src/utils/eventLedger.js que usa la app (chargesOnConfirm,
//     contributionPreview/applyContribution, cancellationQuote, paymentDraft).
//   - IDEMPOTENTE: reemplaza las 6 colecciones de eventos y actualiza los 3
//     usuarios por correo. No toca las demás colecciones ni los demás usuarios.
//   - json-server corre con --watch y reescribe db.json cuando alguien inicia
//     sesión. Por eso, después de escribir, espera y comprueba que las
//     colecciones sigan ahí; si se perdieron, vuelve a escribir.
//   - Contraseña de los organizadores: la MISMA contraseña de prueba que ya usa
//     la mayoría de usuarios demo de db.json. Se lee del archivo; nunca se
//     imprime ni se escribe en este código.
//   - Los textos de invitación y recordatorio se guardan con sus marcadores
//     ({evento}, {destino}, {fechas}...); la app los llena al enviar.
//   - Todas las cuentas llevan `demo: true` (celulares inventados): su botón de
//     WhatsApp abre wa.me sin número.
//
// USO:
//   node scripts/semilla-eventos.mjs          (escribe src/data/db.json)
//   node scripts/semilla-eventos.mjs --dry    (solo muestra el resumen)
//
// Las pruebas (tests/eventLedger.test.mjs) importan buildEventSeed() para
// comprobar las cifras sin depender del archivo.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  chargesOnConfirm, contributionPreview, applyContribution, cancellationQuote,
  computeAccount, paymentDraft, addDays,
} from '../src/utils/eventLedger.js';
import { getTemplate, slugify } from '../src/utils/eventTemplates.js';

export const SEED_TODAY = '2026-09-26';
export const EVENT_COLLECTIONS = ['events', 'eventPackages', 'eventAccounts', 'eventGuests', 'eventLedger', 'eventLog'];

const ADVISOR = { name: 'Andrés Felipe Sánchez De La Parra', phone: '+57 314 610 3599', email: 'reservas@cstravelgroup.com' };
const ADMIN = { id: 1, role: 'admin' };
const INVITADO = { id: null, role: 'invitado' };

/** Organizadores demo. `preferredId` se respeta si está libre en users. */
export const ORGANIZERS = [
  { key: 'laura', preferredId: 6, name: 'Laura Martínez', email: 'laura@bodalauraandres.co', eventId: 2, notes: 'Organizadora (novia) del evento «Nos casamos en Cartagena».' },
  { key: 'patricia', preferredId: 7, name: 'Patricia Díaz', email: 'patricia.diaz@promo11.co', eventId: 1, notes: 'Tesorera del comité de padres de la promoción 11°.' },
  { key: 'luisa', preferredId: 8, name: 'Luisa Ortiz', email: 'luisa.ortiz@techglobal.com', eventId: 3, notes: 'Talento Humano de TechGlobal Solutions; organiza el viaje de incentivo.' },
];

/* ---------------------------------------------------------------------------
 * Utilidades deterministas
 * ------------------------------------------------------------------------ */

/** ISO a las 10:00 de Colombia (15:00 UTC) del día dado, más `minutes`. */
function iso(date, minutes = 0) {
  const h = 15 + Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
}

/** Hash FNV-1a de 32 bits (determinista) para los códigos personales. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Mismo alfabeto que makePublicCode (sin 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function accessCodeFor(accountId, used) {
  for (let salt = 0; ; salt += 1) {
    let h = fnv1a(`cs-travel-evento-${accountId}-${salt}`);
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += CODE_ALPHABET[h % CODE_ALPHABET.length];
      h = Math.floor(h / CODE_ALPHABET.length) ^ fnv1a(`${code}-${i}-${salt}`);
      h >>>= 0;
    }
    const full = `EVT-${code}`;
    if (!used.has(full)) {
      used.add(full);
      return full;
    }
  }
}

/**
 * Celular ficticio de las cuentas demo. En Colombia no hay un rango
 * reservado para ficción, así que se usa el prefijo 399 (hoy sin asignar)
 * y, sobre todo, cada cuenta de la semilla lleva `demo: true`: su botón de
 * WhatsApp abre wa.me SIN número (eventService.messageFor) y nadie le
 * escribe a un desconocido.
 */
function phoneFor(n) {
  return `+57399555${String(n).padStart(4, '0')}`;
}

/** Correo ficticio: nombre.apellido@dominio (sin tildes ni espacios). */
function emailFor(name, domain = 'example.com') {
  return `${slugify(name).replace(/-/g, '.')}@${domain}`;
}

/**
 * Parte un total en pagos redondeados a 1.000; el último absorbe la diferencia.
 * Devuelve [{ date, amount }].
 */
function split(total, dates) {
  if (dates.length === 0 || total <= 0) return [];
  const each = Math.floor(total / dates.length / 1000) * 1000;
  return dates.map((date, i) => ({ date, amount: i === dates.length - 1 ? total - each * (dates.length - 1) : each }));
}

/* ---------------------------------------------------------------------------
 * Constructor: guarda las colecciones y asigna ids en orden
 * ------------------------------------------------------------------------ */

function createBuilder() {
  const out = { events: [], eventPackages: [], eventAccounts: [], eventGuests: [], eventLedger: [], eventLog: [] };
  const pending = []; // borradores de líneas con su orden de creación
  const usedCodes = new Set();
  let seq = 0;
  let phoneN = 0;

  const b = {
    out,
    pending,
    get lines() { return pending.map((p) => p.line); },

    event(data) { out.events.push(data); return data; },

    pkg(data) {
      const record = { id: out.eventPackages.length + 1, ...data, serviceFee: data.price - data.thirdPartyCost, capacity: data.capacity ?? null, status: 'activo' };
      out.eventPackages.push(record);
      return record;
    },

    account(event, data) {
      const id = out.eventAccounts.length + 1;
      phoneN += 1;
      const record = {
        id,
        eventId: event.id,
        kind: 'invitacion',
        displayName: '',
        groupTag: '',
        seatsAllowed: 1,
        contactName: '',
        contactPhone: phoneFor(phoneN),
        contactEmail: '',
        accessCode: accessCodeFor(id, usedCodes),
        rsvp: 'confirmada',
        confirmedAt: null,
        confirmedBy: null,
        inviteSentAt: null,
        lastReminderAt: null,
        reminderCount: 0,
        organizerNotes: '',
        adminNotes: '',
        createdAt: iso(isoDate(event.publishedAt), 30),
        demo: true, // datos inventados: WhatsApp sin número (ver phoneFor)
        ...data,
      };
      if (!record.contactEmail && record.contactName) record.contactEmail = emailFor(record.contactName);
      out.eventAccounts.push(record);
      return record;
    },

    guest(event, account, data) {
      const record = {
        id: out.eventGuests.length + 1,
        eventId: event.id,
        accountId: account.id,
        firstName: '',
        lastName: '',
        audience: 'adulto',
        packageId: null,
        isMinor: false,
        attendance: 'si',
        status: 'activo',
        cancelledAt: null,
        docsOk: null,
        extra: {},
        createdAt: account.createdAt,
        ...data,
      };
      out.eventGuests.push(record);
      return record;
    },

    /** Agrega borradores del libro con quién los creó. */
    add(drafts, createdBy = 'sistema') {
      for (const line of drafts) {
        seq += 1;
        pending.push({ seq, line: { ...line, createdBy: String(createdBy) } });
      }
    },

    log(event, entry) {
      out.eventLog.push({
        eventId: event.id,
        accountId: null,
        actorUserId: null,
        actorRole: 'sistema',
        channel: null,
        amount: null,
        ...entry,
      });
    },

    /** Ordena el libro por fecha (y orden de creación) y asigna ids y createdAt. */
    finish() {
      pending.sort((a, b2) => (a.line.date < b2.line.date ? -1 : a.line.date > b2.line.date ? 1 : a.seq - b2.seq));
      const perDay = new Map();
      out.eventLedger = pending.map((p, index) => {
        const n = perDay.get(p.line.date) || 0;
        perDay.set(p.line.date, n + 1);
        return { id: index + 1, ...p.line, createdAt: iso(p.line.date, Math.min(n, 400)) };
      });
      out.eventLog.sort((a, b2) => (a.at < b2.at ? -1 : a.at > b2.at ? 1 : 0));
      out.eventLog = out.eventLog.map((entry, index) => ({ id: index + 1, ...entry }));
      return out;
    },
  };
  return b;
}

function isoDate(value) {
  return String(value).slice(0, 10);
}

/** Confirma una cuenta: fecha, quién, y los cargos de sus personas (reglas 5 y 6). */
function confirm(b, event, account, guests, packages, host, date, by = 'invitado') {
  account.rsvp = 'confirmada';
  account.confirmedAt = iso(date, 45);
  account.confirmedBy = by;
  if (!account.inviteSentAt) account.inviteSentAt = iso(addDays(date, -3), 20);
  b.add(chargesOnConfirm({ event, guests, packages, hostAccount: host, date, pairPrefix: `cov-e${event.id}`, lines: b.lines }), 'sistema');
}

/** Registra pagos { date, amount } en una cuenta. */
function pay(b, event, account, payments, { method = 'bold', origin = 'pasarela', createdBy = 'sistema', reference } = {}) {
  payments.forEach((p, i) => {
    const line = paymentDraft({
      event, account, computed: { saldo: Number.MAX_SAFE_INTEGER }, amount: p.amount, date: p.date, method, origin,
      reference: reference || `${method.toUpperCase()}-${event.id}${String(account.id).padStart(3, '0')}${i + 1}`,
      description: method === 'transferencia' ? 'Transferencia verificada por CS Travel' : 'Pago en línea aprobado',
    });
    b.add([line], createdBy);
  });
}

/* ---------------------------------------------------------------------------
 * Listas fijas de nombres
 * ------------------------------------------------------------------------ */

const PROMO_STUDENTS = [
  ['Valeria', 'Acosta'], ['Santiago', 'Bermúdez'], ['Isabella', 'Cárdenas'], ['Nicolás', 'Duarte'], ['Mariana', 'Escobar'],
  ['Sebastián', 'Franco'], ['Gabriela', 'Guzmán'], ['Tomás', 'Hoyos'], ['Daniela', 'Jaramillo'], ['Emilio', 'Londoño'],
  ['Antonella', 'Mejía'], ['Martín', 'Navarro'], ['Salomé', 'Orozco'], ['Jerónimo', 'Palacio'], ['Luciana', 'Quintero'],
  ['David', 'Rincón'], ['María José', 'Salazar'], ['Julián', 'Téllez'], ['Manuela', 'Uribe'], ['Simón', 'Vargas'],
  ['Sara', 'Zapata'], ['Emmanuel', 'Arias'], ['Paula', 'Benítez'],
];
const PROMO_PARENTS = [
  'Claudia', 'Jorge', 'Adriana', 'Fernando', 'Liliana', 'Ricardo', 'Beatriz', 'Óscar', 'Natalia', 'Mauricio',
  'Carolina', 'Hernán', 'Patricia', 'Andrés', 'Gloria', 'Alejandro', 'Sandra', 'Felipe', 'Diana', 'Rodrigo',
  'Mónica', 'Javier', 'Ángela',
];

const BODA_FAMILIES = [
  // [nombre de la invitación, grupo, adultos, niños]
  ['Familia Arango Villa', 'Familia de la novia', ['Germán Arango', 'Luz Ángela Villa'], ['Mateo Arango', 'Sara Arango']],
  ['Familia Botero Lince', 'Familia del novio', ['Hugo Botero', 'Cecilia Lince'], ['Emilia Botero']],
  ['Camilo y Paula Torres', 'Amigos del novio', ['Camilo Torres', 'Paula Suárez'], []],
  ['Familia Cadavid', 'Familia de la novia', ['Rubén Cadavid', 'Nelly Ortiz', 'Andrea Cadavid'], []],
  ['Familia Durango Pino', 'Familia del novio', ['Iván Durango', 'Marcela Pino'], ['Samuel Durango', 'Lucía Durango']],
  ['Daniela Ríos', 'Amigos de la novia', ['Daniela Ríos'], []],
  ['Familia Echeverri', 'Familia de la novia', ['Alberto Echeverri', 'Rocío Mejía'], ['Pablo Echeverri']],
  ['Familia Fonseca Gil', 'Amigos del novio', ['Diego Fonseca', 'Tatiana Gil', 'Rosa Gil'], []],
  ['Familia Gaviria Rojas', 'Familia del novio', ['Luis Gaviria', 'Ana Rojas'], ['Martina Gaviria', 'Juan Gaviria']],
  ['Esteban y Laura Henao', 'Amigos de la novia', ['Esteban Henao', 'Laura Pardo'], []],
  ['Familia Isaza', 'Familia de la novia', ['Carlos Isaza', 'Diana Muñoz'], ['Valentina Isaza']],
  ['Familia Jiménez Toro', 'Familia del novio', ['Pedro Jiménez', 'Olga Toro'], ['Nicolás Jiménez', 'Elena Jiménez']],
  ['Familia Lozano', 'Compañeros de trabajo', ['Mario Lozano', 'Sonia Ramírez', 'Felipe Lozano'], []],
  ['Andrés y Carolina Marín', 'Amigos del novio', ['Andrés Marín', 'Carolina Peña'], []],
  ['Familia Naranjo Cruz', 'Familia de la novia', ['Óscar Naranjo', 'Eliana Cruz'], ['Tomás Naranjo', 'Isabel Naranjo']],
  ['Familia Ochoa', 'Familia del novio', ['Julio Ochoa', 'Marta Ruiz'], ['Jacobo Ochoa']],
  ['Ricardo Patiño', 'Compañeros de trabajo', ['Ricardo Patiño'], []],
  ['Familia Quiroga', 'Amigos de la novia', ['Fabio Quiroga', 'Lina Soto', 'Manuela Quiroga'], []],
  ['Familia Rendón Paz', 'Familia de la novia', ['Guillermo Rendón', 'Adriana Paz'], ['Simón Rendón', 'Luciana Rendón']],
  ['Juan y Mariana Sierra', 'Amigos del novio', ['Juan Sierra', 'Mariana López'], []],
  ['Familia Tobón', 'Familia del novio', ['Arturo Tobón', 'Gloria Vélez'], ['Miguel Tobón']],
  ['Familia Uribe Mora', 'Familia de la novia', ['Héctor Uribe', 'Patricia Mora'], ['Gabriel Uribe', 'Antonia Uribe']],
  ['Familia Valencia', 'Compañeros de trabajo', ['Sergio Valencia', 'Lorena Díaz', 'Kevin Valencia'], []],
  ['Felipe y Natalia Zuluaga', 'Amigos de la novia', ['Felipe Zuluaga', 'Natalia Ramos'], []],
  ['Familia Amaya Correa', 'Familia del novio', ['Jaime Amaya', 'Clara Correa'], ['Martín Amaya', 'Victoria Amaya']],
  ['Familia Bernal', 'Familia de la novia', ['Eduardo Bernal', 'Silvia Rueda'], ['Samuel Bernal']],
];

const EMPRESA_AREAS = ['Comercial', 'Operaciones', 'Mercadeo', 'Tecnología', 'Finanzas', 'Logística', 'Servicio al cliente'];
const EMPRESA_PEOPLE = [
  ['Andrea', 'Gómez'], ['Julián', 'Pardo'], ['Marcela', 'Rojas'], ['Camilo', 'Suárez'], ['Paola', 'Vanegas'],
  ['Ricardo', 'Aguirre'], ['Lina', 'Beltrán'], ['Mauricio', 'Castro'], ['Tatiana', 'Delgado'], ['Óscar', 'Espinosa'],
  ['Juliana', 'Forero'], ['Hernán', 'Galvis'], ['Sandra', 'Herrera'], ['Iván', 'Ibarra'], ['Carolina', 'Jaimes'],
  ['Esteban', 'Lara'], ['Mónica', 'Moreno'], ['Sergio', 'Niño'], ['Viviana', 'Ossa'], ['Fabián', 'Prieto'],
  ['Alejandra', 'Quiñones'],
];
const COMPANIONS = ['Laura Méndez', 'Diego Cortés', 'Natalia Pineda', 'Santiago Ríos', 'María Fernanda Gil', 'Pablo Serna'];

/** Separa 'Nombre Apellido' (el apellido es la última palabra). */
function splitName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/* ---------------------------------------------------------------------------
 * EVENTO 1 · PROMOCIÓN (San Andrés, 2 al 6 de diciembre de 2026)
 * ------------------------------------------------------------------------ */

function seedPromocion(b, organizerId) {
  const tpl = getTemplate('promocion');
  const event = b.event({
    id: 1,
    slug: 'promocion-11-santa-clara-2026',
    type: 'promocion',
    title: 'Viaje de promoción 11° 2026',
    hostDisplayName: 'Promoción 11° · Colegio Santa Clara',
    companyId: null,
    originCode: null,
    destination: 'San Andrés Isla',
    startDate: '2026-12-02',
    endDate: '2026-12-06',
    rsvpDeadline: '2026-05-15',
    status: 'cerrado',
    capacity: 34,
    hostVisibility: 'montos',
    plan: {
      reserva: { amount: 300000, dueDays: 7 },
      hitos: [
        { key: 'm30', label: '30 % del viaje', date: '2026-06-30', pct: 30 },
        { key: 'm60', label: '60 % del viaje', date: '2026-08-31', pct: 60 },
        { key: 'm85', label: '85 % del viaje', date: '2026-10-15', pct: 85 },
        { key: 'total', label: 'Pago total', date: '2026-11-01', pct: 100 },
      ],
      minAbono: 100000,
    },
    cancellationTiers: [{ minDays: 90, pct: 0 }, { minDays: 60, pct: 20 }, { minDays: 30, pct: 50 }, { minDays: 0, pct: 100 }],
    organizers: [{ userId: organizerId, permission: 'titular' }],
    advisor: ADVISOR,
    includes: [
      'Tiquetes aéreos Bogotá – San Andrés – Bogotá',
      'Hotel 4 noches con plan todo incluido',
      'Tarjeta de turismo de San Andrés',
      'Traslados aeropuerto – hotel – aeropuerto',
      'Tour en lancha a Johnny Cay y el Acuario',
      'Asistencia médica en viaje',
      'Coordinador de CS Travel durante todo el viaje',
    ],
    // Textos con marcadores: messageFor() los llena con los datos actuales al enviar.
    inviteText: tpl.inviteText,
    reminderText: tpl.reminderText,
    publishedAt: iso('2026-02-02'),
    createdAt: iso('2026-01-26'),
    updatedAt: iso('2026-09-20', 30),
  });

  const pEst = b.pkg({ eventId: 1, name: 'Estudiante · 4 noches todo incluido', audience: 'estudiante', price: 2890000, thirdPartyCost: 2540000, hostCoversType: 'none', hostCoversValue: 0, hostCoversLabel: '', sortOrder: 1 });
  const pDoc = b.pkg({ eventId: 1, name: 'Docente acompañante', audience: 'docente', price: 2890000, thirdPartyCost: 2540000, hostCoversType: 'pct', hostCoversValue: 100, hostCoversLabel: 'El viaje completo del docente', sortOrder: 2 });
  const packages = [pEst, pDoc];

  const host = b.account(event, {
    kind: 'anfitrion', displayName: 'Fondo de la promoción 11°', groupTag: 'Anfitrión', seatsAllowed: 0,
    contactName: 'Patricia Díaz', contactEmail: 'patricia.diaz@promo11.co', rsvp: 'confirmada',
    confirmedAt: event.publishedAt, confirmedBy: 'admin', createdAt: event.createdAt,
    organizerNotes: 'Aquí entra lo recogido en la rifa y el bazar; luego se reparte con «Aportar».',
  });

  const students = [];
  /** Crea la cuenta de un estudiante (o de las gemelas) y la confirma. */
  const student = (display, group, contact, kids, confirmDate, extra = {}) => {
    const account = b.account(event, {
      displayName: display, groupTag: group, seatsAllowed: kids.length, contactName: contact,
      createdAt: iso('2026-02-02', 30), inviteSentAt: iso('2026-02-03', 10), ...extra.account,
    });
    const guests = kids.map(([firstName, lastName], i) => b.guest(event, account, {
      firstName, lastName, audience: 'estudiante', packageId: pEst.id, isMinor: true, docsOk: true,
      extra: { talla: ['S', 'M', 'L', 'M'][(account.id + i) % 4] }, ...(extra.guest || {}),
    }));
    confirm(b, event, account, guests, packages, host, confirmDate, 'invitado');
    students.push(...guests);
    return { account, guests };
  };

  // Cuentas vitrina (cifras exactas de la especificación).
  const juan = student('Juan Gómez · 11A', '11A', 'Marta Ruiz', [['Juan', 'Gómez']], '2026-02-10');
  const gemelas = student('Sofía y Valentina Pérez · 11B', '11B', 'Adriana Pérez', [['Sofía', 'Pérez'], ['Valentina', 'Pérez']], '2026-02-12');
  const andres = student('Andrés Martínez · 11A', '11A', 'Luis Martínez', [['Andrés', 'Martínez']], '2026-02-20', { guest: { docsOk: false } });
  const samuel = student('Samuel Ortega · 11B', '11B', 'Gloria Ortega', [['Samuel', 'Ortega']], '2026-03-02', { guest: { docsOk: false } });
  const lauraC = student('Laura Castillo · 11A', '11A', 'Jorge Castillo', [['Laura', 'Castillo']], '2026-02-18');
  const camila = student('Camila Rodríguez · 11B', '11B', 'Sandra Rodríguez', [['Camila', 'Rodríguez']], '2026-02-06');
  const mateo = student('Mateo Herrera · 11A', '11A', 'Óscar Herrera', [['Mateo', 'Herrera']], '2026-02-24');

  // Relleno: 23 estudiantes (17 al día, 4 atrasados, 2 pagados). Patrón fijo.
  const kinds = 'AATAAPAAATAAAATAPATAAAA'.split(''); // A = al día · T = atrasado · P = pagado (17 / 4 / 2)
  const alDia = [1584000, 1600000, 1650000, 1700000, 1720000, 1750000, 1800000, 1820000, 1850000, 1880000, 1900000, 1950000, 1980000, 2000000, 2040000, 2080000, 2100000];
  const atrasados = [1200000, 1300000, 1400000, 1500000];
  const docsFaltan = new Set([3, 11, 19]); // 3 del relleno + Andrés y Samuel = 5 sin documentos
  const relleno = [];
  PROMO_STUDENTS.forEach(([firstName, lastName], i) => {
    const group = i % 2 === 0 ? '11A' : '11B';
    const confirmDate = addDays('2026-02-05', i * 3);
    const s = student(`${firstName} ${lastName} · ${group}`, group, `${PROMO_PARENTS[i]} ${lastName}`, [[firstName, lastName]], confirmDate, { guest: { docsOk: !docsFaltan.has(i) } });
    relleno.push({ ...s, kind: kinds[i], confirmDate });
  });

  // Docentes: cada uno en su cuenta, cubiertos 100 % por el fondo.
  const docentes = [['Ricardo', 'Peña'], ['Ana Lucía', 'Torres']].map(([firstName, lastName]) => {
    const account = b.account(event, {
      displayName: `Prof. ${firstName} ${lastName}`, groupTag: 'Docentes', seatsAllowed: 1, contactName: `${firstName} ${lastName}`,
      contactEmail: emailFor(`${firstName} ${lastName}`, 'colegiosantaclara.edu.co'), createdAt: iso('2026-02-02', 30), inviteSentAt: iso('2026-02-02', 40),
    });
    const guest = b.guest(event, account, { firstName, lastName, audience: 'docente', packageId: pDoc.id, isMinor: false, docsOk: true });
    confirm(b, event, account, [guest], packages, host, '2026-02-03', 'admin');
    return { account, guest };
  });

  // 20 de agosto: el fondo aporta $250.000 a cada uno de los 31 estudiantes.
  const preview = contributionPreview({
    event, accounts: b.out.eventAccounts.filter((a) => a.eventId === 1), guests: b.out.eventGuests.filter((g) => g.eventId === 1),
    lines: b.lines, target: { guestIds: students.map((g) => g.id) }, mode: 'por_persona', amount: 250000, today: '2026-08-20',
  });
  if (preview.totalApplied !== 7750000) throw new Error(`Aporte del fondo: esperaba 7.750.000 y salió ${preview.totalApplied}`);
  b.add(applyContribution(preview, { event, hostAccount: host, guests: b.out.eventGuests, date: '2026-08-20', pairPrefix: 'apt-e1-0820', reason: 'Reparto de la rifa y el bazar' }), organizerId);

  // Pagos de las cuentas vitrina.
  pay(b, event, juan.account, [
    { date: '2026-02-14', amount: 300000 }, { date: '2026-03-20', amount: 250000 }, { date: '2026-05-18', amount: 250000 },
    { date: '2026-07-15', amount: 400000 }, { date: '2026-09-12', amount: 400000 },
  ]);
  pay(b, event, gemelas.account, [
    { date: '2026-02-16', amount: 300000 }, { date: '2026-04-10', amount: 700000 }, { date: '2026-06-25', amount: 1000000 }, { date: '2026-08-05', amount: 1000000 },
  ]);
  pay(b, event, andres.account, [{ date: '2026-02-25', amount: 300000 }, { date: '2026-06-28', amount: 492000 }]);
  pay(b, event, samuel.account, [{ date: '2026-03-08', amount: 300000 }]);
  pay(b, event, lauraC.account, [{ date: '2026-02-22', amount: 300000 }, { date: '2026-05-10', amount: 492000 }, { date: '2026-08-28', amount: 792000 }]);
  pay(b, event, camila.account, [{ date: '2026-02-09', amount: 2890000 }], { method: 'wompi' });
  pay(b, event, mateo.account, [{ date: '2026-03-01', amount: 300000 }, { date: '2026-05-20', amount: 700000 }]);

  // Pagos del relleno por patrón: reserva a los 4 días y el resto en cuotas.
  let a = 0;
  let t = 0;
  for (const r of relleno) {
    const reserva = { date: addDays(r.confirmDate, 4), amount: 300000 };
    let rest = [];
    if (r.kind === 'A') rest = split(alDia[a++] - 300000, ['2026-04-15', '2026-05-15', '2026-07-15', '2026-08-25']);
    if (r.kind === 'T') rest = split(atrasados[t++] - 300000, ['2026-04-15', '2026-06-15', '2026-08-10']);
    if (r.kind === 'P') rest = split(2640000 - 300000, ['2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', '2026-09-10']);
    pay(b, event, r.account, [reserva, ...rest], { method: r.account.id % 3 === 0 ? 'wompi' : 'bold' });
  }

  // El fondo paga lo de la rifa y el bazar (18 ago) y otro abono (15 sep).
  pay(b, event, host, [{ date: '2026-08-18', amount: 7750000 }], { method: 'transferencia', origin: 'admin', createdBy: ADMIN.id, reference: 'Consignación rifa y bazar' });
  pay(b, event, host, [{ date: '2026-09-15', amount: 2000000 }], { method: 'transferencia', origin: 'admin', createdBy: ADMIN.id, reference: 'Consignación comité 15-sep' });

  // 20 de septiembre: Mateo cancela (73 días antes: tramo del 20 %).
  const quote = cancellationQuote({
    event, guest: mateo.guests[0], lines: b.lines, hostAccount: host, today: '2026-09-20', date: '2026-09-20',
    reason: 'Retiro del viaje por motivos familiares',
  });
  b.add(quote.lines, ADMIN.id);
  Object.assign(mateo.guests[0], { status: 'cancelado', cancelledAt: iso('2026-09-20', 60) });
  mateo.account.adminNotes = 'Saldo a favor por reembolsar después de la cancelación. Pedir certificación bancaria al acudiente.';

  // Recordatorios (tope: 1 cada 3 días) y actividad reciente.
  const org = { actorUserId: organizerId, actorRole: 'event' };
  const remind = (account, date, minutes = 0) => {
    account.lastReminderAt = iso(date, minutes);
    account.reminderCount += 1;
    b.log(event, { accountId: account.id, ...org, action: 'recordatorio', channel: 'whatsapp', detail: `Recordatorio enviado a ${account.displayName}`, at: iso(date, minutes) });
  };
  const atras = relleno.filter((r) => r.kind === 'T').map((r) => r.account);
  b.log(event, { accountId: null, actorUserId: ADMIN.id, actorRole: 'admin', action: 'config', detail: 'Se cerraron las confirmaciones nuevas; los pagos siguen abiertos', at: iso('2026-08-16', 30) });
  b.log(event, { accountId: host.id, actorUserId: ADMIN.id, actorRole: 'admin', action: 'pago', channel: null, detail: 'CS Travel verificó la consignación de la rifa y el bazar', amount: 7750000, at: iso('2026-08-18', 90) });
  b.log(event, { accountId: host.id, ...org, action: 'aporte', detail: 'El fondo aportó a los 31 estudiantes confirmados', amount: 7750000, at: iso('2026-08-20', 120) });
  remind(samuel.account, '2026-09-02');
  remind(gemelas.account, '2026-09-05');
  b.log(event, { accountId: juan.account.id, actorRole: 'invitado', action: 'pago', detail: 'Juan Gómez · 11A registró un pago en línea', amount: 400000, at: iso('2026-09-12', 200) });
  b.log(event, { accountId: host.id, actorUserId: ADMIN.id, actorRole: 'admin', action: 'pago', detail: 'CS Travel verificó un nuevo abono del fondo', amount: 2000000, at: iso('2026-09-15', 60) });
  remind(andres.account, '2026-09-16');
  remind(atras[0], '2026-09-17');
  b.log(event, { accountId: mateo.account.id, actorUserId: ADMIN.id, actorRole: 'admin', action: 'cancelacion', detail: 'Se canceló el viaje de Mateo Herrera (tramo del 20 %); su aporte volvió al fondo', amount: quote.penaltyTotal, at: iso('2026-09-20', 90) });
  remind(atras[1], '2026-09-21');
  remind(atras[2], '2026-09-22');
  remind(samuel.account, '2026-09-24', 30);
  remind(atras[3], '2026-09-25');

  return { event, host };
}

/* ---------------------------------------------------------------------------
 * EVENTO 2 · BODA (Cartagena, 19 al 22 de marzo de 2027)
 * ------------------------------------------------------------------------ */

function seedBoda(b, organizerId) {
  const tpl = getTemplate('boda');
  const event = b.event({
    id: 2,
    slug: 'boda-laura-andres-cartagena',
    type: 'boda',
    title: 'Nos casamos en Cartagena',
    hostDisplayName: 'Laura & Andrés',
    companyId: null,
    originCode: null,
    destination: 'Cartagena de Indias',
    startDate: '2027-03-19',
    endDate: '2027-03-22',
    rsvpDeadline: '2026-11-30',
    status: 'abierto',
    capacity: 120,
    hostVisibility: 'solo_estado',
    plan: {
      reserva: { pct: 20, dueDays: 10 },
      hitos: [
        { key: 'mitad', label: 'Mitad del viaje', date: '2026-12-15', pct: 50 },
        { key: 'total', label: 'Pago total', date: '2027-02-15', pct: 100 },
      ],
      minAbono: 100000,
    },
    cancellationTiers: [{ minDays: 120, pct: 0 }, { minDays: 60, pct: 30 }, { minDays: 0, pct: 100 }],
    organizers: [{ userId: organizerId, permission: 'titular' }],
    advisor: ADVISOR,
    includes: [
      'Hotel 3 noches en habitación doble con desayuno',
      'Cena de bienvenida el viernes (la invitan los novios)',
      'Traslados aeropuerto – hotel – aeropuerto',
      'Traslado a la ceremonia y a la fiesta',
      'Acompañamiento de CS Travel durante el fin de semana',
    ],
    // Textos con marcadores: messageFor() los llena con los datos actuales al enviar.
    inviteText: tpl.inviteText,
    reminderText: tpl.reminderText,
    publishedAt: iso('2026-07-15'),
    createdAt: iso('2026-07-08'),
    updatedAt: iso('2026-09-23', 30),
  });

  const cover = { hostCoversType: 'fixed', hostCoversValue: 180000, hostCoversLabel: 'La cena de bienvenida y el traslado' };
  const pAd = b.pkg({ eventId: 2, name: 'Adulto · habitación doble · 3 noches', audience: 'adulto', price: 1380000, thirdPartyCost: 1230000, ...cover, sortOrder: 1 });
  const pNi = b.pkg({ eventId: 2, name: 'Niño de 2 a 11 años · 3 noches', audience: 'nino', price: 620000, thirdPartyCost: 560000, ...cover, sortOrder: 2 });
  const packages = [pAd, pNi];

  const host = b.account(event, {
    kind: 'anfitrion', displayName: 'Laura & Andrés', groupTag: 'Anfitrión', seatsAllowed: 0,
    contactName: 'Laura Martínez', contactEmail: 'laura@bodalauraandres.co', rsvp: 'confirmada',
    confirmedAt: event.publishedAt, confirmedBy: 'admin', createdAt: event.createdAt,
  });

  const sent = iso('2026-07-16', 30);
  /** Invitación de boda: adultos y niños por nombre completo. */
  const invite = (display, group, adults, kids, seats, extra = {}) => {
    const account = b.account(event, {
      displayName: display, groupTag: group, seatsAllowed: seats, contactName: adults[0] || display,
      createdAt: iso('2026-07-15', 40), inviteSentAt: sent, rsvp: 'enviada', ...extra,
    });
    const guests = [
      ...adults.map((n) => b.guest(event, account, { ...splitName(n), audience: 'adulto', packageId: pAd.id, extra: {} })),
      ...kids.map((n) => b.guest(event, account, { ...splitName(n), audience: 'nino', packageId: pNi.id, isMinor: true, extra: {} })),
    ];
    return { account, guests };
  };
  const confirmed = (inv, date) => confirm(b, event, inv.account, inv.guests, packages, host, date, 'invitado');

  // Vitrina confirmada.
  const perez = invite('Familia Pérez Gómez', 'Familia de la novia', ['Álvaro Pérez', 'Martha Gómez'], ['Tomás Pérez'], 4);
  confirmed(perez, '2026-08-05');
  const mendoza = invite('Tíos Mendoza', 'Familia del novio', ['Hernando Mendoza', 'Luz Marina Mendoza'], [], 2);
  confirmed(mendoza, '2026-09-01');
  const carolina = invite('Carolina Vélez', 'Amigos de la novia', ['Carolina Vélez'], [], 1);
  confirmed(carolina, '2026-09-21');
  const salcedo = invite('Padrinos Jorge y Marta Salcedo', 'Padrinos', ['Jorge Salcedo', 'Marta Salcedo'], [], 2);
  confirmed(salcedo, '2026-07-20');
  const llinas = invite('Sebastián Llinás', 'Amigos del novio', ['Sebastián Llinás'], [], 1);
  confirmed(llinas, '2026-07-28');
  perez.guests[0].extra = { dieta: 'Sin mariscos' };

  // Relleno: 26 invitaciones confirmadas (77 personas): 16 al día, 4 por vencer, 6 atrasadas.
  const pattern = 'AATAAPATAAATPAATAAPTAATPAA'.split('');
  const porVencer = ['2026-09-17', '2026-09-19', '2026-09-22', '2026-09-23'];
  const atrasadas = ['2026-08-01', '2026-08-12', '2026-08-20', '2026-08-28', '2026-09-03', '2026-09-08'];
  const rellenoAlDia = [];
  const rellenoAtrasadas = [];
  let pv = 0;
  let at = 0;
  let ad = 0;
  BODA_FAMILIES.forEach(([display, group, adults, kids], i) => {
    const inv = invite(display, group, adults, kids, adults.length + kids.length + (i % 5 === 0 ? 1 : 0));
    const kind = pattern[i];
    if (kind === 'P') {
      confirmed(inv, porVencer[pv++]);
    } else if (kind === 'T') {
      const date = atrasadas[at++];
      confirmed(inv, date);
      rellenoAtrasadas.push({ ...inv, date, partial: at % 3 === 0 });
    } else {
      const date = addDays('2026-07-18', ad * 3 + (ad > 10 ? 10 : 0));
      ad += 1;
      confirmed(inv, date);
      rellenoAlDia.push({ ...inv, date });
    }
  });

  // Invitaciones sin confirmar: 5 no asisten, 2 vistas y 2 enviadas.
  const noAsiste = (display, group, seats, date) => {
    const inv = invite(display, group, [], [], seats, { rsvp: 'no_asiste', confirmedBy: 'invitado', contactName: display.replace(/^Familia /, '') });
    inv.account.organizerNotes = `Respondió que no el ${Number(date.slice(8))}/${Number(date.slice(5, 7))}.`;
    return inv;
  };
  noAsiste('Familia Ospina', 'Familia del novio', 3, '2026-07-25');
  noAsiste('Familia Cárdenas', 'Amigos de la novia', 2, '2026-08-02');
  noAsiste('Ernesto Villalba', 'Compañeros de trabajo', 1, '2026-08-09');
  noAsiste('Familia Buitrago', 'Familia de la novia', 4, '2026-08-21');
  const juliana = noAsiste('Juliana Montoya', 'Amigos del novio', 1, '2026-09-10');
  const restrepo = invite('Familia Restrepo', 'Familia de la novia', [], [], 4, { rsvp: 'vista', contactName: 'Beatriz Restrepo' });
  invite('Andrés y Sofía Quintero', 'Amigos del novio', [], [], 2, { rsvp: 'vista', contactName: 'Andrés Quintero' });
  invite('Familia Salazar Mejía', 'Familia del novio', [], [], 3, { rsvp: 'enviada', contactName: 'Rodrigo Salazar' });
  const lemus = invite('Mauricio Lemus', 'Compañeros de trabajo', [], [], 1, { rsvp: 'enviada', contactName: 'Mauricio Lemus' });
  restrepo.account.organizerNotes = 'La tía Beatriz dijo que confirma cuando sepa las vacaciones de los primos.';

  // Los novios pagan el hotel de los padrinos: aporte de $1.200.000 por persona.
  const eventAccounts = () => b.out.eventAccounts.filter((a) => a.eventId === 2);
  const eventGuests = () => b.out.eventGuests.filter((g) => g.eventId === 2);
  const aporte = contributionPreview({
    event, accounts: eventAccounts(), guests: eventGuests(), lines: b.lines,
    target: { accountIds: [salcedo.account.id] }, mode: 'por_persona', amount: 1200000, today: '2026-07-22',
  });
  b.add(applyContribution(aporte, { event, hostAccount: host, guests: eventGuests(), date: '2026-07-22', pairPrefix: 'apt-e2-0722', reason: 'Los novios invitan el hotel de los padrinos' }), organizerId);

  // Pagos.
  pay(b, event, perez.account, [{ date: '2026-08-12', amount: 568000 }]);
  pay(b, event, llinas.account, [{ date: '2026-08-02', amount: 1200000 }], { method: 'wompi' });
  const lines = () => b.lines;
  rellenoAlDia.forEach((inv, i) => {
    const c = computeAccount({ event, account: inv.account, lines: lines(), today: SEED_TODAY });
    const reserva = c.milestones[0].target;
    const payments = [{ date: addDays(inv.date, 5), amount: reserva }];
    if (i % 3 === 1) payments.push({ date: addDays(inv.date, 35) > SEED_TODAY ? addDays(inv.date, 8) : addDays(inv.date, 35), amount: 300000 });
    pay(b, event, inv.account, payments, { method: i % 4 === 0 ? 'wompi' : 'bold' });
  });
  rellenoAtrasadas.forEach((inv) => {
    if (!inv.partial) return;
    pay(b, event, inv.account, [{ date: addDays(inv.date, 6), amount: 200000 }]);
  });
  pay(b, event, host, [{ date: '2026-09-01', amount: 5000000 }], { method: 'transferencia', origin: 'admin', createdBy: ADMIN.id, reference: 'Transferencia novios 01-sep' });

  // Actividad reciente (sin montos en el texto: el evento es 'solo_estado').
  const org = { actorUserId: organizerId, actorRole: 'event' };
  const remind = (account, date, minutes = 0) => {
    account.lastReminderAt = iso(date, minutes);
    account.reminderCount += 1;
    b.log(event, { accountId: account.id, ...org, action: 'recordatorio', channel: 'whatsapp', detail: `Recordatorio enviado a ${account.displayName}`, at: iso(date, minutes) });
  };
  const confirmedLog = (inv, date) => b.log(event, { accountId: inv.account.id, actorRole: 'invitado', action: 'confirmo', detail: `Confirmación de ${inv.account.displayName} (${inv.guests.length} ${inv.guests.length === 1 ? 'persona' : 'personas'})`, at: iso(date, 45) });
  b.log(event, { accountId: host.id, actorUserId: ADMIN.id, actorRole: 'admin', action: 'pago', detail: 'CS Travel verificó una transferencia de los novios', amount: 5000000, at: iso('2026-09-01', 30) });
  confirmedLog(mendoza, '2026-09-01');
  b.log(event, { accountId: juliana.account.id, actorRole: 'invitado', action: 'no_asiste', detail: 'Juliana Montoya respondió que no podrá asistir', at: iso('2026-09-10', 60) });
  remind(rellenoAtrasadas[0].account, '2026-09-12');
  remind(mendoza.account, '2026-09-14');
  const pvInvs = b.out.eventAccounts.filter((a) => a.eventId === 2 && porVencer.includes(isoDate(a.confirmedAt || '')));
  for (const acc of pvInvs) {
    const guests = b.out.eventGuests.filter((g) => g.accountId === acc.id);
    confirmedLog({ account: acc, guests }, isoDate(acc.confirmedAt));
  }
  confirmedLog(carolina, '2026-09-21');
  remind(rellenoAtrasadas[1].account, '2026-09-20');
  remind(rellenoAtrasadas[0].account, '2026-09-22');
  remind(mendoza.account, '2026-09-24', 20);
  b.log(event, { accountId: lemus.account.id, ...org, action: 'invitacion_enviada', channel: 'whatsapp', detail: 'Invitación reenviada a Mauricio Lemus', at: iso('2026-09-25', 30) });
  lemus.account.inviteSentAt = iso('2026-09-25', 30);

  return { event, host };
}

/* ---------------------------------------------------------------------------
 * EVENTO 3 · EMPRESA (Santa Marta, 20 al 23 de noviembre de 2026)
 * ------------------------------------------------------------------------ */

function seedEmpresa(b, organizerId) {
  const tpl = getTemplate('empresa');
  const event = b.event({
    id: 3,
    slug: 'techglobal-incentivo-2026',
    type: 'empresa',
    title: 'Viaje de incentivo · Mejores vendedores 2026',
    hostDisplayName: 'TechGlobal Solutions',
    companyId: 2,
    originCode: 'CST-TECH-02',
    destination: 'Santa Marta',
    startDate: '2026-11-20',
    endDate: '2026-11-23',
    rsvpDeadline: '2026-09-05',
    status: 'abierto',
    capacity: 40,
    hostVisibility: 'montos',
    plan: {
      reserva: null,
      hitos: [
        { key: 'm30', label: '30 % del viaje', date: '2026-09-15', pct: 30 },
        { key: 'm70', label: '70 % del viaje', date: '2026-10-15', pct: 70 },
        { key: 'total', label: 'Pago total', date: '2026-11-05', pct: 100 },
      ],
      minAbono: 100000,
    },
    cancellationTiers: [{ minDays: 60, pct: 0 }, { minDays: 30, pct: 50 }, { minDays: 0, pct: 100 }],
    organizers: [{ userId: organizerId, permission: 'titular' }],
    advisor: ADVISOR,
    includes: [
      'Tiquetes aéreos Bogotá – Santa Marta – Bogotá',
      'Hotel 3 noches frente al mar con alimentación completa',
      'Traslados aeropuerto – hotel – aeropuerto',
      'Noche de premiación con cena y música en vivo',
      'Asistencia médica en viaje',
    ],
    // Textos con marcadores: messageFor() los llena con los datos actuales al enviar.
    inviteText: tpl.inviteText,
    reminderText: tpl.reminderText,
    publishedAt: iso('2026-08-10'),
    createdAt: iso('2026-08-03'),
    updatedAt: iso('2026-09-14', 45),
  });

  const pCol = b.pkg({ eventId: 3, name: 'Colaborador · 3 noches', audience: 'colaborador', price: 2450000, thirdPartyCost: 2150000, hostCoversType: 'pct', hostCoversValue: 100, hostCoversLabel: 'El viaje completo del colaborador', sortOrder: 1 });
  const pAco = b.pkg({ eventId: 3, name: 'Acompañante · 3 noches', audience: 'acompanante', price: 2100000, thirdPartyCost: 1850000, hostCoversType: 'none', hostCoversValue: 0, hostCoversLabel: '', sortOrder: 2 });
  const packages = [pCol, pAco];

  const host = b.account(event, {
    kind: 'anfitrion', displayName: 'TechGlobal Solutions', groupTag: 'Anfitrión', seatsAllowed: 0,
    contactName: 'Luisa Ortiz', contactEmail: 'luisa.ortiz@techglobal.com', rsvp: 'confirmada',
    confirmedAt: event.publishedAt, confirmedBy: 'admin', createdAt: event.createdAt,
  });

  /** Cuenta de un colaborador, con acompañante opcional. */
  const collaborator = (fullName, area, companion, date, docs = [true, true]) => {
    const account = b.account(event, {
      displayName: `${fullName} · ${area}`, groupTag: area, seatsAllowed: 2, contactName: fullName,
      contactEmail: emailFor(fullName, 'techglobal.com'), createdAt: iso('2026-08-10', 40), inviteSentAt: iso('2026-08-11', 20),
    });
    const guests = [b.guest(event, account, { ...splitName(fullName), audience: 'colaborador', packageId: pCol.id, docsOk: docs[0], extra: { area } })];
    if (companion) guests.push(b.guest(event, account, { ...splitName(companion), audience: 'acompanante', packageId: pAco.id, docsOk: docs[1], extra: {} }));
    confirm(b, event, account, guests, packages, host, date, 'invitado');
    return { account, guests };
  };

  const carlos = collaborator('Carlos Ruiz', 'Comercial', 'Juliana Díaz', '2026-08-14');
  carlos.account.contactEmail = 'carlos@techglobal.com';
  const diana = collaborator('Diana Morales', 'Comercial', 'Mauricio Pardo', '2026-08-20', [true, false]);
  const felipe = collaborator('Felipe Andrade', 'Operaciones', null, '2026-08-18');
  const natalia = collaborator('Natalia Rey', 'Mercadeo', 'Camilo Rey', '2026-08-12');

  // Relleno: 21 colaboradores; 6 con acompañante (4 al día, 1 atrasado, 1 pagado) y 15 solos (cubiertos).
  const withCompanion = new Map([[1, 'A'], [4, 'A'], [7, 'T'], [10, 'A'], [13, 'P'], [16, 'A']]);
  const alDia = [630000, 700000, 900000, 1050000];
  let c = 0;
  let comp = 0;
  const rellenoAtrasado = [];
  EMPRESA_PEOPLE.forEach(([firstName, lastName], i) => {
    const kind = withCompanion.get(i);
    const companion = kind ? COMPANIONS[comp++] : null;
    const date = addDays('2026-08-12', i + (i > 12 ? 4 : 0));
    const col = collaborator(`${firstName} ${lastName}`, EMPRESA_AREAS[i % EMPRESA_AREAS.length], companion, date, [i !== 9, true]);
    // Los pagos siempre caen después de confirmar y antes de hoy (26 sep).
    if (kind === 'A') pay(b, event, col.account, split(alDia[c++], i % 2 ? [addDays(date, 12)] : [addDays(date, 10), addDays(date, 20)]));
    if (kind === 'T') { pay(b, event, col.account, [{ date: addDays(date, 14), amount: 300000 }]); rellenoAtrasado.push(col); }
    if (kind === 'P') pay(b, event, col.account, [{ date: addDays(date, 3), amount: 2100000 }], { method: 'wompi' });
  });

  pay(b, event, carlos.account, [{ date: '2026-09-10', amount: 630000 }]);
  pay(b, event, natalia.account, [{ date: '2026-08-25', amount: 1050000 }, { date: '2026-09-20', amount: 1050000 }]);
  pay(b, event, host, [{ date: '2026-09-14', amount: 18375000 }], { method: 'transferencia', origin: 'admin', createdBy: ADMIN.id, reference: 'Transferencia TechGlobal NIT 900.555.222-1' });

  const org = { actorUserId: organizerId, actorRole: 'event' };
  const remind = (account, date, minutes = 0) => {
    account.lastReminderAt = iso(date, minutes);
    account.reminderCount += 1;
    b.log(event, { accountId: account.id, ...org, action: 'recordatorio', channel: 'whatsapp', detail: `Recordatorio enviado a ${account.displayName}`, at: iso(date, minutes) });
  };
  b.log(event, { accountId: null, ...org, action: 'invitacion_enviada', channel: 'copiado', detail: 'Se copió el mensaje para el grupo de los ganadores', at: iso('2026-08-11', 30) });
  b.log(event, { accountId: felipe.account.id, actorRole: 'invitado', action: 'confirmo', detail: 'Confirmación de Felipe Andrade · Operaciones (1 persona)', at: iso('2026-08-18', 45) });
  b.log(event, { accountId: diana.account.id, actorRole: 'invitado', action: 'confirmo', detail: 'Confirmación de Diana Morales · Comercial (2 personas)', at: iso('2026-08-20', 45) });
  b.log(event, { accountId: carlos.account.id, actorRole: 'invitado', action: 'pago', detail: 'Carlos Ruiz · Comercial registró un pago en línea', amount: 630000, at: iso('2026-09-10', 120) });
  b.log(event, { accountId: host.id, actorUserId: ADMIN.id, actorRole: 'admin', action: 'pago', detail: 'CS Travel verificó la transferencia de TechGlobal Solutions', amount: 18375000, at: iso('2026-09-14', 60) });
  remind(diana.account, '2026-09-16');
  remind(rellenoAtrasado[0].account, '2026-09-19');
  b.log(event, { accountId: natalia.account.id, actorRole: 'invitado', action: 'pago', detail: 'Natalia Rey · Mercadeo completó el pago de su acompañante', amount: 1050000, at: iso('2026-09-20', 90) });
  remind(diana.account, '2026-09-23');
  remind(rellenoAtrasado[0].account, '2026-09-25');
  diana.account.organizerNotes = 'Dijo que paga con la prima de diciembre; recordarle que la meta es el 15 de octubre.';

  return { event, host };
}

/* ---------------------------------------------------------------------------
 * Semilla completa
 * ------------------------------------------------------------------------ */

/**
 * Construye las 6 colecciones de eventos.
 * @param {object} [options]
 * @param {object} [options.organizerIds] - { laura, patricia, luisa } -> userId
 */
export function buildEventSeed({ organizerIds = { laura: 6, patricia: 7, luisa: 8 } } = {}) {
  const b = createBuilder();
  seedPromocion(b, organizerIds.patricia);
  seedBoda(b, organizerIds.laura);
  seedEmpresa(b, organizerIds.luisa);
  return b.finish();
}

/** Usuarios organizadores (sin contraseña: la pone writeSeed). */
export function organizerUsers(organizerIds) {
  return ORGANIZERS.map((o) => ({
    id: organizerIds[o.key],
    name: o.name,
    email: o.email,
    role: 'event',
    profileType: 'event',
    companyId: null,
    doctorId: null,
    status: 'active',
    firstLoginRequired: false,
    createdAt: iso('2026-07-01'),
    lastLogin: null,
    internalNotes: o.notes,
  }));
}

/**
 * La contraseña de prueba que más se repite entre los usuarios demo que NO
 * son organizadores ni admin. Nunca se imprime.
 */
function sharedDemoPassword(users) {
  const organizerEmails = new Set(ORGANIZERS.map((o) => o.email));
  const counts = new Map();
  for (const u of users) {
    if (organizerEmails.has(u.email) || u.role === 'admin' || !u.password) continue;
    counts.set(u.password, (counts.get(u.password) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [pw, n] of counts) if (n > bestCount) { best = pw; bestCount = n; }
  if (!best) throw new Error('No encontré una contraseña de prueba en db.json para copiarla a los organizadores.');
  return best;
}

/** Ids de los organizadores: el que ya tenga su correo, el preferido si está libre o el siguiente libre. */
function resolveOrganizerIds(users) {
  const ids = {};
  const taken = new Set(users.map((u) => Number(u.id)));
  for (const o of ORGANIZERS) {
    const existing = users.find((u) => u.email === o.email);
    if (existing) { ids[o.key] = Number(existing.id); continue; }
    let id = o.preferredId;
    while (taken.has(id)) id += 1;
    taken.add(id);
    ids[o.key] = id;
  }
  return ids;
}

/** Aplica la semilla sobre un objeto db (sin tocar el resto de colecciones). */
export function applySeedToDb(db) {
  const users = Array.isArray(db.users) ? db.users : (db.users = []);
  const password = sharedDemoPassword(users);
  const organizerIds = resolveOrganizerIds(users);
  for (const user of organizerUsers(organizerIds)) {
    const index = users.findIndex((u) => u.email === user.email);
    if (index >= 0) {
      users[index] = { ...users[index], ...user, password, lastLogin: users[index].lastLogin ?? null };
    } else {
      users.push({ ...user, password });
    }
  }
  users.sort((a, b) => Number(a.id) - Number(b.id));
  const seed = buildEventSeed({ organizerIds });
  for (const name of EVENT_COLLECTIONS) db[name] = seed[name];
  return { db, seed, organizerIds };
}

/* ---------------------------------------------------------------------------
 * Escritura en src/data/db.json (con verificación por json-server --watch)
 * ------------------------------------------------------------------------ */

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(here, '..', 'src', 'data', 'db.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

/** ¿El archivo tiene las colecciones de la semilla y los organizadores? */
function seedIsPresent(db, seed, organizerIds) {
  const collectionsOk = EVENT_COLLECTIONS.every((name) => Array.isArray(db[name]) && db[name].length === seed[name].length);
  const usersOk = Object.values(organizerIds).every((id) => (db.users || []).some((u) => Number(u.id) === id && u.role === 'event'));
  return collectionsOk && usersOk;
}

async function main() {
  const dry = process.argv.includes('--dry');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const db = readDb();
    const { seed, organizerIds } = applySeedToDb(db);
    if (dry) {
      console.log('Simulación (no se escribió nada).');
      summary(seed, organizerIds);
      return;
    }
    // Mismo formato que json-server (2 espacios, sin salto final) para no ensuciar el diff.
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    console.log(`Intento ${attempt}: escrito ${path.relative(process.cwd(), DB_PATH)}. Esperando a json-server...`);
    await sleep(4000);
    const check = readDb();
    if (seedIsPresent(check, seed, organizerIds)) {
      summary(seed, organizerIds);
      console.log('Listo: las colecciones de eventos siguen en db.json.');
      return;
    }
    console.log('json-server reescribió db.json sin las colecciones; vuelvo a intentar.');
  }
  throw new Error('No pude dejar las colecciones en db.json (json-server las sigue pisando).');
}

function summary(seed, organizerIds) {
  console.log('Organizadores (ids):', organizerIds);
  for (const name of EVENT_COLLECTIONS) console.log(`  ${name}: ${seed[name].length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

