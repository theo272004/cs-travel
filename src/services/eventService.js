/**
 * eventService.js
 * =============================================================================
 * PROPÓSITO:
 *   Lecturas y escrituras del panel de EVENTOS a través de apiService (mismo
 *   patrón que companyService / doctorService). Las cuentas se CALCULAN con
 *   src/utils/eventLedger.js; aquí solo se lee, se valida y se guarda.
 *
 * COLECCIONES (ver la especificación de Eventos):
 *   events · eventPackages · eventAccounts · eventGuests · eventLedger · eventLog
 *
 * REGLAS QUE ESTE ARCHIVO GARANTIZA:
 *   - El libro (eventLedger) SOLO se escribe con las funciones de dominio de
 *     abajo (confirmar, aportar, registrar pago, simular pago demo, cancelar,
 *     reembolsar, corregir, cambiar paquete). Nunca se hace patch/put/remove
 *     de una línea: un error se corrige con otra línea (regla 2).
 *   - Cada función de dominio deja su línea en eventLog. El campo `detail`
 *     NUNCA lleva montos; el monto va aparte en `amount` y la vista lo oculta
 *     con redactLogEntry() cuando el rol no puede verlo (regla 19).
 *   - El organizador NUNCA registra dinero (regla 17): registerPayment y
 *     refund son solo del admin; simulateDemoPayment solo existe fuera del
 *     bundle desplegado (isDeployedBundle).
 *   - Permisos: admin todo; organizador (role 'event') según su permiso en
 *     events.organizers (titular / colaborador / lectura); invitado solo su
 *     propia cuenta (por su accessCode).
 *
 * ACTOR:
 *   Todas las escrituras reciben `actor` = { id, role, name? }. Si no se pasa,
 *   se usa la sesión (authService). Para el invitado de #/e/:code:
 *   { id: null, role: 'invitado', accessCode }.
 *
 * FECHAS:
 *   'hoy' = fecha local de Colombia (eventLedger.todayCO). Todas las funciones
 *   aceptan { today } para el demo y las pruebas. Un pago o un reembolso lleva
 *   la fecha del movimiento real: nunca posterior a hoy (moneyDateProblem).
 *
 * TEXTOS DE WHATSAPP:
 *   events.inviteText / reminderText se guardan CON sus marcadores ({evento},
 *   {destino}, {fechas}, {anfitrion}, {nombre}, {enlace}) y se llenan al
 *   enviar (messageFor): si cambian el título o las fechas, los mensajes
 *   salen con los datos nuevos.
 *
 * CUENTAS DEMO:
 *   Las cuentas de la semilla llevan `demo: true` y celulares inventados que
 *   podrían existir. Su botón de WhatsApp abre wa.me SIN número, para que
 *   WhatsApp pida elegir el contacto y nadie le escriba a un desconocido.
 *
 * CONFIRMACIONES:
 *   confirmAttendance es idempotente: una persona que ya existe (por id o, si
 *   no trae id, por nombre y apellido) se actualiza y nunca se cobra dos
 *   veces. Dos confirmaciones de la misma cuenta en esta pestaña se hacen una
 *   después de la otra (withAccountLock), así un doble clic no duplica. En
 *   producción el servidor debe hacer lo mismo dentro de una transacción.
 *
 * PRODUCCIÓN:
 *   Estas colecciones NO están en REAL (realApiAdapter.js): en el portal
 *   desplegado caerían al localStorage del navegador. Por eso el menú
 *   «Eventos» debe ir marcado demoOnly hasta que exista el backend. El build
 *   del portal real (scripts/rebundle-local.mjs) tampoco lleva la semilla de
 *   Eventos: allí estas colecciones arrancan vacías.
 * =============================================================================
 */

import { apiService } from './apiService.js';
import { authService } from './authService.js';
import { isDeployedBundle } from '../utils/env.js';
import * as L from '../utils/eventLedger.js';
import { getTemplate, vocabFor, slugify, fillMessage, guestLink, containsAmount } from '../utils/eventTemplates.js';

/** Nombres de los recursos en json-server / adaptador local. */
export const EVENT_RESOURCES = Object.freeze({
  events: 'events',
  packages: 'eventPackages',
  accounts: 'eventAccounts',
  guests: 'eventGuests',
  ledger: 'eventLedger',
  log: 'eventLog',
});
const R = EVENT_RESOURCES;

/** Clave de localStorage con el evento activo del organizador (?e=<id> manda). */
const CURRENT_KEY = 'cs_event_current';

/** Mismo alfabeto que makePublicCode (sin 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Campos del evento que se pueden editar en Ajustes. */
const EDITABLE_EVENT_FIELDS = [
  'title', 'hostDisplayName', 'companyId', 'destination', 'startDate', 'endDate', 'rsvpDeadline',
  'capacity', 'hostVisibility', 'plan', 'cancellationTiers', 'advisor', 'includes', 'inviteText', 'reminderText', 'slug',
];

/** Campos de un paquete que se pueden editar (el precio solo aplica a confirmaciones nuevas). */
const EDITABLE_PACKAGE_FIELDS = [
  'name', 'audience', 'price', 'thirdPartyCost', 'hostCoversType', 'hostCoversValue', 'hostCoversLabel', 'capacity', 'status', 'sortOrder',
];

/* ---------------------------------------------------------------------------
 * Utilidades internas
 * ------------------------------------------------------------------------ */

const nowIso = () => new Date().toISOString();

/** Error con código para que la vista decida (p. ej. pedir confirmación). */
function domainError(message, code = 'EVENT_RULE') {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Ejecuta una función pura de eventLedger y marca sus errores de regla con
 * code 'EVENT_RULE' (p. ej. «Ese movimiento ya fue corregido»), para que la
 * vista los muestre igual que los demás errores de dominio.
 */
function rule(fn) {
  try {
    return fn();
  } catch (error) {
    if (!error.code) error.code = 'EVENT_RULE';
    throw error;
  }
}

/** Actor de la operación: el que llega o la sesión actual. */
function resolveActor(actor) {
  if (actor && actor.role) return actor;
  const session = authService.getSession && authService.getSession();
  if (session) return { id: session.id, role: session.role, name: session.name };
  return { id: null, role: 'invitado' };
}

/** Rol tal como lo guarda eventLog. */
function logRole(actor) {
  if (actor.role === 'admin') return 'admin';
  if (actor.role === 'event') return 'event';
  if (actor.role === 'invitado') return 'invitado';
  return 'sistema';
}

/** Permiso del organizador en el evento, o null si no es organizador. */
export function organizerPermission(event, actor) {
  if (!actor || actor.role !== 'event') return null;
  const entry = (event.organizers || []).find((o) => L.sameId(o.userId, actor.id));
  return entry ? entry.permission : null;
}

/** Qué ve este actor en este evento (regla 19). */
export function viewFor(event, actor) {
  const who = resolveActor(actor);
  if (who.role === 'admin') return L.visibleFor('admin', event.hostVisibility);
  if (who.role === 'event') return L.visibleFor('event', event.hostVisibility, organizerPermission(event, who) || 'lectura');
  return L.visibleFor('invitado', event.hostVisibility);
}

/**
 * Lanza un error si el actor no puede hacer `action` en el evento.
 *   action: 'admin' | 'contribute' | 'payHost' | 'invite' | 'remind' | 'markConfirmed' | 'read'
 *   Para el invitado, `account` debe ser SU cuenta (mismo accessCode).
 */
function assertCan(event, actor, action, account = null) {
  if (actor.role === 'admin') return;
  if (actor.role === 'event') {
    const permission = organizerPermission(event, actor);
    if (!permission) throw domainError('No eres organizador de este evento.', 'FORBIDDEN');
    if (action === 'read') return;
    if (action === 'admin') throw domainError('Esta acción la hace CS Travel Group.', 'FORBIDDEN');
    const can = L.visibleFor('event', event.hostVisibility, permission).can;
    if (!can[action]) throw domainError('Tu permiso en este evento no permite esta acción.', 'FORBIDDEN');
    return;
  }
  if (actor.role === 'invitado') {
    if (account && actor.accessCode && account.accessCode === actor.accessCode && ['read', 'confirm', 'demoPay'].includes(action)) return;
    throw domainError('Solo puedes ver y responder tu propia invitación.', 'FORBIDDEN');
  }
  throw domainError('No tienes permiso para esta acción.', 'FORBIDDEN');
}

/** Código personal nuevo EVT-XXXXXX que no exista todavía. */
function newAccessCode(existing = []) {
  const used = new Set(existing.map((a) => a.accessCode));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const bytes = new Uint8Array(6);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    let code = 'EVT-';
    for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    if (!used.has(code)) return code;
  }
  throw domainError('No pude generar un código personal único. Intenta de nuevo.');
}

/** Prefijo único para los pairId de una operación. */
function pairPrefix(tag) {
  return `${tag}-${Date.now().toString(36)}`;
}

/**
 * Operaciones en curso por cuenta. withAccountLock encadena las operaciones
 * de una misma cuenta: la segunda espera a que termine la primera y lee los
 * datos ya guardados (un doble clic en «Confirmar» no crea dos veces).
 */
const accountLocks = new Map();

async function withAccountLock(accountId, fn) {
  const key = String(accountId);
  const previous = accountLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  accountLocks.set(key, run);
  try {
    return await run;
  } finally {
    if (accountLocks.get(key) === run) accountLocks.delete(key);
  }
}

/** Nombre y apellido comparables: sin tildes, sin mayúsculas ni espacios de más. */
function nameKey(person) {
  const clean = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  return `${clean(person.firstName)}|${clean(person.lastName)}`;
}

/** Lanza VALIDATION si la fecha de un pago o reembolso no es válida. */
function assertMoneyDate(date, event, today) {
  const problem = L.moneyDateProblem(date, { today, event });
  if (problem) throw domainError(problem, 'VALIDATION');
}

/* ---------------------------------------------------------------------------
 * Lecturas
 * ------------------------------------------------------------------------ */

async function loadBundle(eventId) {
  const [event, packages, accounts, guests, lines, log] = await Promise.all([
    apiService.getById(R.events, eventId),
    apiService.get(R.packages, { eventId }),
    apiService.get(R.accounts, { eventId }),
    apiService.get(R.guests, { eventId }),
    apiService.get(R.ledger, { eventId }),
    apiService.get(R.log, { eventId }),
  ]);
  return { event, packages, accounts, guests, lines, log };
}

async function loadAccount(accountId) {
  const account = await apiService.getById(R.accounts, accountId);
  const bundle = await loadBundle(account.eventId);
  const fresh = bundle.accounts.find((a) => L.sameId(a.id, account.id)) || account;
  return { ...bundle, account: fresh };
}

function hostOf(bundle) {
  const host = bundle.accounts.find((a) => a.kind === 'anfitrion');
  if (!host) throw domainError('El evento no tiene cuenta anfitrión.');
  return host;
}

/* ---------------------------------------------------------------------------
 * Escrituras internas (libro y bitácora)
 * ------------------------------------------------------------------------ */

/** Guarda borradores del libro, uno por uno, sellando createdBy/createdAt. */
async function writeLines(drafts, actor) {
  const createdAt = nowIso();
  const createdBy = actor.id != null ? String(actor.id) : 'sistema';
  const saved = [];
  for (const draft of drafts) {
    saved.push(await apiService.post(R.ledger, { ...draft, createdBy, createdAt }));
  }
  return saved;
}

/** Deja una línea en eventLog. `detail` NUNCA lleva montos. */
async function writeLog(event, actor, { accountId = null, action, channel = null, detail, amount = null }) {
  if (containsAmount(detail)) throw new Error('El texto de la actividad no debe llevar montos.');
  return apiService.post(R.log, {
    eventId: event.id,
    accountId,
    actorUserId: actor.id ?? null,
    actorRole: logRole(actor),
    action,
    channel,
    detail,
    amount,
    at: nowIso(),
  });
}

/* ---------------------------------------------------------------------------
 * Confirmación de asistencia (se llama con withAccountLock)
 * ------------------------------------------------------------------------ */

/**
 * Hace la confirmación con los datos YA guardados de la cuenta. Primero
 * valida todo y después escribe: un error no deja personas a medias.
 */
async function confirmAttendanceNow(accountId, persons, actor, today) {
  const who = resolveActor(actor);
  const bundle = await loadAccount(accountId);
  const { event, account } = bundle;
  if (account.kind === 'anfitrion') throw domainError('La cuenta anfitrión no confirma asistencia.');
  if (who.role === 'invitado') assertCan(event, who, 'confirm', account);
  else assertCan(event, who, 'markConfirmed');
  if (who.role !== 'admin') {
    if (event.status !== 'abierto') throw domainError('Este evento ya no recibe confirmaciones nuevas.');
    if (who.role === 'invitado' && event.rsvpDeadline && today > event.rsvpDeadline) {
      throw domainError('La fecha para responder ya pasó. Escríbele al asesor de CS Travel Group.');
    }
  }
  if (!Array.isArray(persons) || persons.length === 0) throw domainError('Indica quiénes van a viajar.', 'VALIDATION');

  // 1) A quién corresponde cada persona: por id o, si no trae id, por nombre
  //    y apellido (reenviar el formulario de la boda no crea a nadie otra vez).
  const own = bundle.guests.filter((g) => L.sameId(g.accountId, account.id));
  const claimed = new Set();
  const plan = persons.map((person) => {
    let existing = null;
    if (person.id != null) {
      existing = own.find((g) => L.sameId(g.id, person.id)) || null;
      if (!existing) throw domainError('Esa persona no pertenece a esta invitación.', 'VALIDATION');
    } else {
      const key = nameKey(person);
      existing = own.find((g) => g.status !== 'cancelado' && !claimed.has(String(g.id)) && nameKey(g) === key) || null;
    }
    if (existing) {
      if (claimed.has(String(existing.id))) throw domainError(`${L.guestName(existing)} aparece dos veces en la confirmación.`, 'VALIDATION');
      claimed.add(String(existing.id));
    }
    return { person, existing };
  });

  // 2) El invitado que ya confirmó no agrega personas nuevas por su cuenta.
  if (who.role === 'invitado' && account.rsvp === 'confirmada' && plan.some((p) => !p.existing)) {
    throw domainError('Ya confirmaste; para cambios escríbele a CS Travel Group.');
  }

  // 3) Campos de cada persona, validados ANTES de escribir nada.
  const packageById = (id) => bundle.packages.find((p) => L.sameId(p.id, id)) || null;
  const defaultPackage = (audience) => bundle.packages.find((p) => p.audience === audience && p.status !== 'oculto') || null;
  const steps = plan.map(({ person, existing }) => {
    if (existing && existing.status === 'cancelado') return { existing, skip: true };
    const audience = person.audience || (existing && existing.audience) || 'adulto';
    const sameAudience = Boolean(existing) && audience === existing.audience;
    let pkg = null;
    if (person.packageId != null) {
      pkg = packageById(person.packageId);
      if (!pkg) throw domainError('Ese paquete no es de este evento.', 'VALIDATION');
    } else if (sameAudience && existing.packageId != null) {
      pkg = packageById(existing.packageId);
    } else {
      pkg = defaultPackage(audience);
    }
    const attendance = person.attendance === 'si' ? 'si' : 'no';
    const fields = {
      firstName: String(person.firstName ?? (existing ? existing.firstName : '') ?? '').trim(),
      lastName: String(person.lastName ?? (existing ? existing.lastName : '') ?? '').trim(),
      audience,
      packageId: pkg ? pkg.id : null,
      isMinor: person.isMinor ?? (sameAudience ? existing.isMinor : undefined) ?? ['nino', 'estudiante'].includes(audience),
      attendance,
      ...(person.extra ? { extra: person.extra } : {}),
    };
    if (!fields.firstName) throw domainError('Escribe el nombre de cada persona.', 'VALIDATION');
    if (attendance === 'si' && !pkg) throw domainError(`Elige un paquete para ${L.guestName(fields)}.`, 'VALIDATION');
    if (existing && L.hasLiveCharge(bundle.lines, existing)) {
      if (attendance === 'no') throw domainError(`${L.guestName(existing)} ya tiene cargos; para cancelar su viaje escríbele a CS Travel Group.`);
      if (!L.sameId(fields.packageId, existing.packageId)) {
        throw domainError(`${L.guestName(existing)} ya tiene cargos; para cambiar su paquete escríbele a CS Travel Group.`);
      }
    }
    return { existing, fields };
  });

  // 4) Cupos: los «sí» que quedan = los de la cuenta que no vienen aquí + los de aquí.
  const isYes = (g) => g.status !== 'cancelado' && g.attendance === 'si';
  const currentYes = own.filter(isYes).length;
  const finalYes = own.filter((g) => isYes(g) && !claimed.has(String(g.id))).length
    + steps.filter((s) => !s.skip && s.fields.attendance === 'si').length;
  const seats = Number(account.seatsAllowed || 0);
  if (finalYes > seats && finalYes > currentYes) {
    throw domainError(`Esta invitación tiene ${seats} ${seats === 1 ? 'cupo' : 'cupos'} y quedarían ${finalYes} personas confirmadas.`, 'VALIDATION');
  }
  const confirmedElsewhere = bundle.guests.filter((g) => isYes(g) && !L.sameId(g.accountId, account.id)).length;
  if (who.role !== 'admin' && event.capacity && finalYes > currentYes && confirmedElsewhere + finalYes > event.capacity) {
    throw domainError('El evento ya no tiene cupo para tantas personas. Escríbele al asesor de CS Travel Group.', 'CAPACITY');
  }

  // 5) Personas: se actualizan (solo si algo cambió) o se crean.
  const now = nowIso();
  const saved = [];
  let touched = false;
  for (const step of steps) {
    if (step.skip) continue;
    const { existing, fields } = step;
    if (existing) {
      const changed = Object.keys(fields).some((key) => JSON.stringify(fields[key]) !== JSON.stringify(existing[key]));
      if (changed) {
        saved.push(await apiService.patch(R.guests, existing.id, fields));
        touched = true;
      } else {
        saved.push(existing);
      }
    } else {
      saved.push(await apiService.post(R.guests, {
        eventId: event.id, accountId: account.id, ...fields, status: 'activo', cancelledAt: null,
        docsOk: getTemplate(event.type).requiresDocs ? false : null, extra: fields.extra || {}, createdAt: now,
      }));
      touched = true;
    }
  }

  // 6) Cargos de quienes van y no tienen cargo vivo (chargesOnConfirm salta a los demás).
  const allGuests = [...bundle.guests.filter((g) => !saved.some((s) => L.sameId(s.id, g.id))), ...saved];
  const accountGuests = allGuests.filter((g) => L.sameId(g.accountId, account.id));
  const rsvp = L.rsvpFromAttendance(accountGuests);
  const drafts = rule(() => L.chargesOnConfirm({
    event, guests: accountGuests, packages: bundle.packages, hostAccount: hostOf(bundle), date: today,
    pairPrefix: pairPrefix(`cov-e${event.id}`), lines: bundle.lines,
  }));
  if (!touched && drafts.length === 0 && rsvp === account.rsvp) {
    // Reenvío idéntico (doble clic, formulario enviado otra vez o «confirmó por
    // teléfono» de alguien que ya había confirmado): no hay nada que guardar.
    return { account, guests: accountGuests, lines: [], unchanged: true };
  }
  await writeLines(drafts, who);
  const by = who.role === 'admin' ? 'admin' : who.role === 'event' ? 'organizador' : 'invitado';
  const updated = await apiService.patch(R.accounts, account.id, {
    rsvp,
    confirmedAt: rsvp === 'confirmada' ? (account.confirmedAt || now) : account.confirmedAt,
    confirmedBy: account.confirmedBy || by,
  });
  const n = accountGuests.filter(isYes).length;
  if (drafts.length === 0 && rsvp === account.rsvp && account.rsvp === 'confirmada') {
    // Ya estaba confirmada y no hay cargos nuevos: solo cambiaron datos (nombres, dieta...).
    await writeLog(event, who, { accountId: account.id, action: 'config', detail: `Se actualizaron los datos de las personas de ${account.displayName}` });
  } else if (rsvp === 'no_asiste') {
    await writeLog(event, who, { accountId: account.id, action: 'no_asiste', detail: `${account.displayName} respondió que no podrá asistir` });
  } else {
    await writeLog(event, who, {
      accountId: account.id,
      action: who.role === 'invitado' ? 'confirmo' : 'marco_confirmado',
      channel: who.role === 'invitado' ? null : 'whatsapp',
      detail: who.role === 'invitado'
        ? `Confirmación de ${account.displayName} (${n} ${n === 1 ? 'persona' : 'personas'})`
        : `Se marcó que ${account.displayName} confirmó por teléfono (${n} ${n === 1 ? 'persona' : 'personas'})`,
    });
  }
  return { account: updated, guests: accountGuests, lines: drafts, unchanged: false };
}

/* ---------------------------------------------------------------------------
 * Servicio público
 * ------------------------------------------------------------------------ */

export const eventService = {
  /* ------------------------------ Lecturas ------------------------------ */

  /** Todos los eventos (portafolio del admin). */
  getAll() {
    return apiService.get(R.events);
  },

  getById(id) {
    return apiService.getById(R.events, id);
  },

  /** Eventos que organiza un usuario (role 'event'). */
  async getForOrganizer(userId) {
    const all = await apiService.get(R.events);
    return all.filter((e) => (e.organizers || []).some((o) => L.sameId(o.userId, userId)));
  },

  /** Las 6 colecciones de un evento, sin filtrar por rol (uso interno y admin). */
  getBundle(eventId) {
    return loadBundle(eventId);
  },

  /**
   * Todo lo que necesita una pantalla del evento, YA filtrado por rol:
   *   { event, view, packages, accounts, guests, summary, lines, log }
   * - summary = computeEvent(); sus cuentas pasan por redactAccount.
   * - lines: el organizador en 'solo_estado' solo ve las de su cuenta anfitrión.
   */
  async getEventView(eventId, { actor, today = L.todayCO() } = {}) {
    const who = resolveActor(actor);
    const bundle = await loadBundle(eventId);
    assertCan(bundle.event, who, 'read');
    const view = viewFor(bundle.event, who);
    const summary = L.computeEvent({ ...bundle, today });
    const host = bundle.accounts.find((a) => a.kind === 'anfitrion');
    const hostId = host ? host.id : null;
    const redacted = summary.accounts.map((c) => L.redactAccount(view, c));
    // Las alertas por cuenta llevan montos: sin permiso de montos, solo nombre y días.
    const alerts = view.amounts ? summary.alerts : {
      saldosAFavor: summary.alerts.saldosAFavor.filter((a) => L.sameId(a.accountId, hostId)),
      atrasadas30: summary.alerts.atrasadas30.map(({ accountId, displayName, diasAtraso }) => ({ accountId, displayName, diasAtraso })),
      metaBaja: summary.alerts.metaBaja,
    };
    return {
      event: bundle.event,
      view,
      permission: organizerPermission(bundle.event, who),
      packages: bundle.packages.map((p) => L.redactPackage(view, p)),
      accounts: bundle.accounts.map((a) => L.redactAccountRecord(view, a)),
      guests: bundle.guests,
      summary: {
        ...summary,
        accounts: redacted,
        byId: new Map(redacted.map((c) => [String(c.accountId), c])),
        host: summary.host,
        alerts,
        serviceEstimate: view.adminFields ? summary.serviceEstimate : undefined,
      },
      lines: bundle.lines.map((l) => L.redactLine(view, l, hostId)).filter(Boolean),
      log: [...bundle.log].sort((a, b) => (a.at < b.at ? 1 : -1)).map((e) => L.redactLogEntry(view, e, hostId)),
    };
  },

  /** Resumen calculado (sin filtrar) de un evento: solo para el admin. */
  async getSummary(eventId, { today = L.todayCO() } = {}) {
    const bundle = await loadBundle(eventId);
    return L.computeEvent({ ...bundle, today });
  },

  /** Resúmenes de todos los eventos (portafolio y Cola de trabajo del admin). */
  async getPortfolio({ today = L.todayCO() } = {}) {
    const [events, accounts, guests, lines] = await Promise.all([
      apiService.get(R.events), apiService.get(R.accounts), apiService.get(R.guests), apiService.get(R.ledger),
    ]);
    return events.map((event) => ({ event, summary: L.computeEvent({ event, accounts, guests, lines, today }) }));
  },

  /**
   * Vista del invitado (#/e/:code). Devuelve solo SU cuenta: personas,
   * líneas (sin reparto F-03), metas y cuota sugerida. null si el código
   * no existe.
   */
  async getGuestView(code, { today = L.todayCO() } = {}) {
    const clean = String(code || '').trim().toUpperCase();
    const [account] = await apiService.get(R.accounts, { accessCode: clean });
    if (!account || account.kind === 'anfitrion') return null;
    const bundle = await loadBundle(account.eventId);
    const view = L.visibleFor('invitado', bundle.event.hostVisibility);
    const computed = L.computeAccount({ event: bundle.event, account, lines: bundle.lines, today });
    const host = bundle.accounts.find((a) => a.kind === 'anfitrion');
    const { adminNotes: _a, organizerNotes: _o, ...publicAccount } = account;
    const hostName = host ? host.displayName : bundle.event.hostDisplayName;
    return {
      event: bundle.event,
      account: publicAccount,
      hostName,
      guests: bundle.guests.filter((g) => L.sameId(g.accountId, account.id)),
      packages: bundle.packages.filter((p) => p.status !== 'oculto').map((p) => L.redactPackage(view, p)),
      lines: L.linesOf(bundle.lines, account.id).map((l) => L.redactLine(view, l)),
      computed,
      canSimulatePayment: !isDeployedBundle(),
      // vocabFor reemplaza {anfitrion} («Parte de TechGlobal Solutions»).
      vocab: vocabFor(bundle.event.type, hostName),
    };
  },

  /** Cotización de la cancelación de una persona (no escribe nada). */
  async quoteCancellation(guestId, { today = L.todayCO() } = {}) {
    const guest = await apiService.getById(R.guests, guestId);
    const bundle = await loadBundle(guest.eventId);
    return rule(() => L.cancellationQuote({ event: bundle.event, guest, lines: bundle.lines, hostAccount: hostOf(bundle), today }));
  },

  /** Vista previa de un aporte (no escribe nada). */
  async previewContribution(eventId, { target = {}, mode = 'por_persona', amount }, { today = L.todayCO() } = {}) {
    const bundle = await loadBundle(eventId);
    return rule(() => L.contributionPreview({ ...bundle, target, mode, amount, today }));
  },

  /** Evento activo del organizador: ?e=<id> manda; si no, el último usado. */
  recallCurrentEvent() {
    try {
      return localStorage.getItem(CURRENT_KEY);
    } catch {
      return null;
    }
  },

  rememberCurrentEvent(eventId) {
    try {
      localStorage.setItem(CURRENT_KEY, String(eventId));
    } catch {
      // Navegador sin almacenamiento: no pasa nada, se usa ?e=.
    }
  },

  /**
   * Mensaje de WhatsApp para una cuenta (invitación o recordatorio) con su
   * enlace personal. Sin montos (regla 19). Devuelve { text, href }.
   * El texto guardado trae marcadores y se llena aquí con los datos ACTUALES
   * del evento. Las cuentas demo (o sin celular) abren wa.me sin número.
   */
  messageFor(event, account, kind = 'reminder', origin = '') {
    const base = kind === 'invite' ? event.inviteText : event.reminderText;
    const text = fillMessage(base, { nombre: (account.contactName || account.displayName || '').split(' ')[0], enlace: guestLink(account.accessCode, origin), event });
    const phone = account.demo ? '' : String(account.contactPhone || '').replace(/\D/g, '');
    const target = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    return { text, href: `${target}?text=${encodeURIComponent(text)}` };
  },

  /* ----------------------- Evento y configuración ----------------------- */

  /**
   * Crea un evento con sus paquetes y su cuenta anfitrión (admin).
   * @param {object} data - { event, packages, hostAccountName? } (de buildEventDraft)
   */
  async createEvent({ event, packages, hostAccountName }, actor) {
    const who = resolveActor(actor);
    if (who.role !== 'admin') throw domainError('Solo CS Travel Group crea eventos.', 'FORBIDDEN');
    const errors = L.validateEventSetup({ plan: event.plan, packages, startDate: event.startDate, endDate: event.endDate, cancellationTiers: event.cancellationTiers });
    if (!event.title) errors.unshift('Escribe el título del evento.');
    if (containsAmount(event.inviteText) || containsAmount(event.reminderText)) errors.push('Los textos de invitación y recordatorio no pueden llevar montos.');
    if (errors.length) throw domainError(errors.join(' '), 'VALIDATION');

    const now = nowIso();
    const existing = await apiService.get(R.events);
    let slug = event.slug || slugify(event.title);
    while (existing.some((e) => e.slug === slug)) slug = `${slug}-2`;
    // Los textos se guardan con sus marcadores; messageFor los llena al enviar.
    const tpl = getTemplate(event.type);
    const created = await apiService.post(R.events, {
      ...event,
      slug,
      inviteText: event.inviteText || tpl.inviteText,
      reminderText: event.reminderText || tpl.reminderText,
      status: event.status || 'borrador',
      publishedAt: event.status === 'abierto' ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    for (const [index, pkg] of packages.entries()) {
      await apiService.post(R.packages, {
        eventId: created.id,
        name: pkg.name,
        audience: pkg.audience,
        price: pkg.price,
        thirdPartyCost: pkg.thirdPartyCost || 0,
        serviceFee: pkg.price - (pkg.thirdPartyCost || 0),
        hostCoversType: pkg.hostCoversType || 'none',
        hostCoversValue: pkg.hostCoversValue || 0,
        hostCoversLabel: pkg.hostCoversLabel || '',
        capacity: pkg.capacity ?? null,
        status: pkg.status || 'activo',
        sortOrder: pkg.sortOrder ?? index + 1,
      });
    }
    const allAccounts = await apiService.get(R.accounts);
    const hostName = (hostAccountName || getTemplate(event.type).hostAccountName || '{anfitrion}').replace('{anfitrion}', event.hostDisplayName || 'Anfitrión');
    await apiService.post(R.accounts, {
      eventId: created.id,
      kind: 'anfitrion',
      displayName: hostName,
      groupTag: 'Anfitrión',
      seatsAllowed: 0,
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      accessCode: newAccessCode(allAccounts),
      rsvp: 'confirmada',
      confirmedAt: created.publishedAt,
      confirmedBy: 'admin',
      inviteSentAt: null,
      lastReminderAt: null,
      reminderCount: 0,
      organizerNotes: '',
      adminNotes: '',
      createdAt: now,
    });
    await writeLog(created, who, { action: 'config', detail: `Se creó el evento «${created.title}» (${created.status === 'abierto' ? 'publicado' : 'borrador'})` });
    return created;
  },

  /** Publica un borrador: status 'abierto' y publishedAt (arranca el plan del anfitrión). */
  async publishEvent(eventId, actor) {
    const who = resolveActor(actor);
    const bundle = await loadBundle(eventId);
    assertCan(bundle.event, who, 'admin');
    if (bundle.event.status !== 'borrador') throw domainError('El evento ya está publicado.');
    const at = nowIso();
    const event = await apiService.patch(R.events, eventId, { status: 'abierto', publishedAt: at, updatedAt: at });
    const host = hostOf(bundle);
    await apiService.patch(R.accounts, host.id, { confirmedAt: at });
    await writeLog(event, who, { action: 'config', detail: 'Se publicó el evento; ya se puede confirmar y pagar' });
    return event;
  },

  /** Cambia el estado del evento (abierto, cerrado, en_viaje, finalizado, cancelado). */
  async setEventStatus(eventId, status, actor) {
    const who = resolveActor(actor);
    const event = await apiService.getById(R.events, eventId);
    assertCan(event, who, 'admin');
    const allowed = ['borrador', 'abierto', 'cerrado', 'en_viaje', 'finalizado', 'cancelado'];
    if (!allowed.includes(status)) throw domainError(`Estado no válido: ${status}`);
    const patch = { status, updatedAt: nowIso() };
    if (status === 'abierto' && !event.publishedAt) patch.publishedAt = patch.updatedAt;
    const updated = await apiService.patch(R.events, eventId, patch);
    await writeLog(updated, who, { action: 'config', detail: `El evento pasó a «${status.replace('_', ' ')}»` });
    return updated;
  },

  /**
   * Ajustes del evento (admin). Solo campos de EDITABLE_EVENT_FIELDS; el
   * código de origen no se cambia después de creado. Las metas de todas las
   * cuentas se recalculan solas (se calculan del plan cada vez).
   */
  async updateEvent(eventId, patch, actor) {
    const who = resolveActor(actor);
    const bundle = await loadBundle(eventId);
    assertCan(bundle.event, who, 'admin');
    const clean = {};
    for (const key of EDITABLE_EVENT_FIELDS) if (key in patch) clean[key] = patch[key];
    if ('originCode' in patch && !bundle.event.originCode) clean.originCode = patch.originCode;
    const next = { ...bundle.event, ...clean };
    const errors = L.validateEventSetup({ plan: next.plan, packages: bundle.packages, startDate: next.startDate, endDate: next.endDate, cancellationTiers: next.cancellationTiers });
    if (containsAmount(next.inviteText) || containsAmount(next.reminderText)) errors.push('Los textos no pueden llevar montos.');
    if (errors.length) throw domainError(errors.join(' '), 'VALIDATION');
    const updated = await apiService.patch(R.events, eventId, { ...clean, updatedAt: nowIso() });
    await writeLog(updated, who, { action: 'config', detail: `Se actualizaron los ajustes del evento (${Object.keys(clean).join(', ') || 'sin cambios'})` });
    return updated;
  },

  /** Organizadores del evento con su permiso (admin). */
  async setOrganizers(eventId, organizers, actor) {
    const who = resolveActor(actor);
    const event = await apiService.getById(R.events, eventId);
    assertCan(event, who, 'admin');
    const valid = ['titular', 'colaborador', 'lectura'];
    const clean = organizers.map((o) => ({ userId: Number(o.userId), permission: valid.includes(o.permission) ? o.permission : 'lectura' }));
    const updated = await apiService.patch(R.events, eventId, { organizers: clean, updatedAt: nowIso() });
    await writeLog(updated, who, { action: 'config', detail: `Organizadores actualizados (${clean.length})` });
    return updated;
  },

  /**
   * Edita un paquete (admin). Un cambio de precio solo aplica a las
   * confirmaciones NUEVAS: lo ya cargado en el libro no se toca.
   */
  async updatePackage(packageId, patch, actor) {
    const who = resolveActor(actor);
    const pkg = await apiService.getById(R.packages, packageId);
    const event = await apiService.getById(R.events, pkg.eventId);
    assertCan(event, who, 'admin');
    const clean = {};
    for (const key of EDITABLE_PACKAGE_FIELDS) if (key in patch) clean[key] = patch[key];
    const next = { ...pkg, ...clean };
    const errors = L.validateEventSetup({ plan: event.plan, packages: [next], startDate: event.startDate });
    if (errors.length) throw domainError(errors.join(' '), 'VALIDATION');
    clean.serviceFee = next.price - (next.thirdPartyCost || 0);
    const updated = await apiService.patch(R.packages, packageId, clean);
    await writeLog(event, who, { action: 'config', detail: `Se actualizó el paquete «${updated.name}» (aplica a confirmaciones nuevas)` });
    return updated;
  },

  /* ---------------------------- Invitaciones ---------------------------- */

  /**
   * Crea invitaciones en lote (admin u organizador con permiso de invitar).
   * `rows` = filas de parseInviteList (o equivalentes):
   *   { name, group, contactName, phone, email, seats }
   * En promoción y empresa también crea la persona (sin confirmar).
   */
  async createInvitations(eventId, rows, actor) {
    const who = resolveActor(actor);
    const bundle = await loadBundle(eventId);
    assertCan(bundle.event, who, 'invite');
    const valid = rows.filter((r) => !r.errors || r.errors.length === 0);
    if (valid.length === 0) throw domainError('No hay filas válidas para crear.', 'VALIDATION');
    const type = bundle.event.type;
    const audience = type === 'promocion' ? 'estudiante' : type === 'empresa' ? 'colaborador' : null;
    const pkg = audience ? bundle.packages.find((p) => p.audience === audience && p.status !== 'oculto') : null;
    const allAccounts = await apiService.get(R.accounts);
    const created = [];
    for (const row of valid) {
      const now = nowIso();
      const displayName = type === 'promocion' || type === 'empresa'
        ? [row.name, row.group].filter(Boolean).join(' · ')
        : row.name;
      const account = await apiService.post(R.accounts, {
        eventId: bundle.event.id,
        kind: 'invitacion',
        displayName,
        groupTag: row.group || '',
        seatsAllowed: type === 'empresa' ? 2 : Math.max(1, Number(row.seats) || 1),
        contactName: row.contactName || row.name,
        contactPhone: row.phone || '',
        contactEmail: row.email || '',
        accessCode: newAccessCode([...allAccounts, ...created]),
        rsvp: 'sin_enviar',
        confirmedAt: null,
        confirmedBy: null,
        inviteSentAt: null,
        lastReminderAt: null,
        reminderCount: 0,
        organizerNotes: '',
        adminNotes: '',
        createdAt: now,
      });
      created.push(account);
      if (audience) {
        const parts = String(row.name).trim().split(/\s+/);
        await apiService.post(R.guests, {
          eventId: bundle.event.id,
          accountId: account.id,
          firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0],
          lastName: parts.length > 1 ? parts[parts.length - 1] : '',
          audience,
          packageId: pkg ? pkg.id : null,
          isMinor: type === 'promocion',
          attendance: 'pendiente',
          status: 'activo',
          cancelledAt: null,
          docsOk: getTemplate(type).requiresDocs ? false : null,
          extra: type === 'empresa' && row.group ? { area: row.group } : {},
          createdAt: now,
        });
      }
    }
    await writeLog(bundle.event, who, { action: 'invitacion_creada', detail: `Se crearon ${created.length} ${created.length === 1 ? 'invitación' : 'invitaciones'}` });
    return created;
  },

  /** Marca la invitación como enviada (al volver de WhatsApp o al copiarla). */
  async markInvitationSent(accountId, { channel = 'whatsapp' } = {}, actor) {
    const who = resolveActor(actor);
    const { event, account } = await loadAccount(accountId);
    assertCan(event, who, 'invite');
    const patch = { inviteSentAt: nowIso() };
    if (account.rsvp === 'sin_enviar') patch.rsvp = 'enviada';
    const updated = await apiService.patch(R.accounts, accountId, patch);
    await writeLog(event, who, { accountId: account.id, action: 'invitacion_enviada', channel, detail: `Invitación enviada a ${account.displayName}` });
    return updated;
  },

  /** El invitado abrió su enlace: 'sin_enviar'/'enviada' pasan a 'vista'. */
  async markInvitationViewed(accessCode) {
    const [account] = await apiService.get(R.accounts, { accessCode });
    if (!account || !['sin_enviar', 'enviada'].includes(account.rsvp)) return account || null;
    return apiService.patch(R.accounts, account.id, { rsvp: 'vista' });
  },

  /**
   * Confirma asistencia (reglas 5 y 6).
   * @param {number} accountId
   * @param {Array} persons - [{ id?, firstName, lastName, audience, packageId?, attendance: 'si'|'no', extra? }]
   *   Una persona que ya existe en la cuenta se ACTUALIZA: por su id o, si no
   *   trae id (boda), por nombre y apellido. Solo se crea la que no existe.
   * @param {object} actor - invitado (con su accessCode), organizador o admin.
   * Crea los cargos de las personas que van y la cobertura del anfitrión.
   *
   * Protecciones contra el cobro doble (ver confirmAttendanceNow):
   *   - cupos: las personas que quedan con «sí» (las de la cuenta que no vienen
   *     en `persons` más las de `persons`) no pueden pasar de seatsAllowed;
   *   - el invitado que ya confirmó no agrega personas nuevas: «Ya confirmaste;
   *     para cambios escríbele a CS Travel Group»;
   *   - a una persona con cargos no se le cambia el paquete ni se le quita el
   *     «sí» por aquí (eso es «Cambiar paquete» o «Cancelar persona» del admin);
   *   - reenviar lo mismo no escribe nada (ni libro ni actividad);
   *   - dos llamadas a la vez para la misma cuenta se hacen en fila.
   */
  confirmAttendance(accountId, persons, actor, { today = L.todayCO() } = {}) {
    return withAccountLock(accountId, () => confirmAttendanceNow(accountId, persons, actor, today));
  },

  /** «No podré asistir»: toda la invitación responde que no. */
  declineInvitation(accountId, actor) {
    return withAccountLock(accountId, async () => {
      const who = resolveActor(actor);
      const bundle = await loadAccount(accountId);
      const { event, account } = bundle;
      if (account.kind === 'anfitrion') throw domainError('La cuenta anfitrión no responde invitaciones.');
      if (who.role === 'invitado') assertCan(event, who, 'confirm', account);
      else assertCan(event, who, 'markConfirmed');
      const own = bundle.guests.filter((g) => L.sameId(g.accountId, account.id));
      if (own.some((g) => L.hasLiveCharge(bundle.lines, g))) {
        throw domainError('Esta invitación ya tiene cargos; para cancelar el viaje escríbele a CS Travel Group.');
      }
      if (account.rsvp === 'no_asiste' && own.every((g) => g.attendance === 'no')) return account;
      for (const g of own) if (g.attendance !== 'no') await apiService.patch(R.guests, g.id, { attendance: 'no' });
      const updated = await apiService.patch(R.accounts, account.id, { rsvp: 'no_asiste', confirmedBy: account.confirmedBy || (who.role === 'invitado' ? 'invitado' : who.role === 'admin' ? 'admin' : 'organizador') });
      await writeLog(event, who, { accountId: account.id, action: 'no_asiste', detail: `${account.displayName} respondió que no podrá asistir` });
      return updated;
    });
  },

  /**
   * Registra el envío (o la copia) de un recordatorio (regla 20). Si no han
   * pasado 3 días desde el último, lanza un error con code
   * 'REMINDER_TOO_SOON'; la vista pide confirmación y repite con force.
   */
  async markReminderSent(accountId, { channel = 'whatsapp', force = false } = {}, actor) {
    const who = resolveActor(actor);
    const { event, account } = await loadAccount(accountId);
    assertCan(event, who, 'remind');
    const check = L.reminderCheck(account);
    if (!check.allowed && !force) {
      throw domainError(`Ya se le recordó hace poco. Podrás volver a recordarle en ${check.hoursLeft} horas.`, 'REMINDER_TOO_SOON');
    }
    const updated = await apiService.patch(R.accounts, accountId, {
      lastReminderAt: nowIso(),
      reminderCount: (Number(account.reminderCount) || 0) + 1,
    });
    await writeLog(event, who, { accountId: account.id, action: 'recordatorio', channel, detail: `Recordatorio enviado a ${account.displayName}` });
    return updated;
  },

  /** Notas privadas del organizador sobre una cuenta. */
  async updateOrganizerNotes(accountId, notes, actor) {
    const who = resolveActor(actor);
    const { event } = await loadAccount(accountId);
    assertCan(event, who, 'invite');
    return apiService.patch(R.accounts, accountId, { organizerNotes: String(notes || '').slice(0, 2000) });
  },

  /** Notas internas de CS Travel Group (solo admin). */
  async updateAdminNotes(accountId, notes, actor) {
    const who = resolveActor(actor);
    const { event } = await loadAccount(accountId);
    assertCan(event, who, 'admin');
    return apiService.patch(R.accounts, accountId, { adminNotes: String(notes || '').slice(0, 2000) });
  },

  /** Nuevo código personal (el enlace anterior deja de servir). Admin. */
  async regenerateAccessCode(accountId, actor) {
    const who = resolveActor(actor);
    const { event, account } = await loadAccount(accountId);
    assertCan(event, who, 'admin');
    const all = await apiService.get(R.accounts);
    const updated = await apiService.patch(R.accounts, accountId, { accessCode: newAccessCode(all) });
    await writeLog(event, who, { accountId: account.id, action: 'config', detail: `Se generó un enlace personal nuevo para ${account.displayName}` });
    return updated;
  },

  /** Documentos completos de una persona (true / false / null = no aplica). Admin. */
  async setDocsOk(guestId, value, actor) {
    const who = resolveActor(actor);
    const guest = await apiService.getById(R.guests, guestId);
    const event = await apiService.getById(R.events, guest.eventId);
    assertCan(event, who, 'admin');
    const updated = await apiService.patch(R.guests, guestId, { docsOk: value === null ? null : Boolean(value) });
    await writeLog(event, who, { accountId: guest.accountId, action: 'config', detail: `Documentos de ${L.guestName(guest)}: ${value === null ? 'no aplica' : value ? 'completos' : 'faltan'}` });
    return updated;
  },

  /* ------------------------------- Dinero ------------------------------- */

  /**
   * Aportar (regla 7): solo el organizador titular o el admin. Escribe los
   * pares aporte_anfitrion y devuelve la vista previa que se aplicó.
   */
  async contribute(eventId, { target = {}, mode = 'por_persona', amount, reason = null }, actor, { today = L.todayCO() } = {}) {
    const who = resolveActor(actor);
    const bundle = await loadBundle(eventId);
    assertCan(bundle.event, who, 'contribute');
    const preview = rule(() => L.contributionPreview({ ...bundle, target, mode, amount, today }));
    if (preview.totalApplied <= 0) throw domainError('Ninguna persona puede recibir ese aporte.', 'VALIDATION');
    const drafts = rule(() => L.applyContribution(preview, {
      event: bundle.event, hostAccount: hostOf(bundle), guests: bundle.guests, date: today,
      pairPrefix: pairPrefix(`apt-e${eventId}`), reason,
    }));
    await writeLines(drafts, who);
    const n = preview.recipients.filter((r) => r.applied > 0).length;
    await writeLog(bundle.event, who, {
      accountId: hostOf(bundle).id, action: 'aporte',
      detail: `${hostOf(bundle).displayName} aportó a ${n} ${n === 1 ? 'persona' : 'personas'}`,
      amount: preview.totalApplied,
    });
    return preview;
  },

  /**
   * Registrar pago (admin): transferencia verificada con comprobante
   * (regla 17). Si supera el saldo exige allowCredit. `date` es la fecha del
   * pago real: no puede ser posterior a hoy ni anterior a la creación del
   * evento (VALIDATION).
   */
  async registerPayment(accountId, { amount, date, method = 'transferencia', reference, allowCredit = false }, actor, { today = L.todayCO() } = {}) {
    const who = resolveActor(actor);
    const bundle = await loadAccount(accountId);
    assertCan(bundle.event, who, 'admin');
    if (!reference) throw domainError('Escribe la referencia o el número del comprobante.', 'VALIDATION');
    const effective = date || today;
    assertMoneyDate(effective, bundle.event, today);
    const computed = L.computeAccount({ event: bundle.event, account: bundle.account, lines: bundle.lines, today });
    const line = rule(() => L.paymentDraft({
      event: bundle.event, account: bundle.account, computed, amount, date: effective, method, reference, origin: 'admin', allowCredit,
      description: method === 'transferencia' ? 'Transferencia verificada por CS Travel Group' : 'Pago recibido',
    }));
    const [saved] = await writeLines([line], who);
    await writeLog(bundle.event, who, { accountId: bundle.account.id, action: 'pago', detail: `CS Travel Group registró un pago de ${bundle.account.displayName}`, amount });
    return saved;
  },

  /**
   * «Simular pago aprobado» del demo: pago con origin 'demo'. Nunca existe
   * en el bundle desplegado. El monto debe estar en el rango de la regla 11.
   */
  async simulateDemoPayment(accountId, amount, actor, { today = L.todayCO() } = {}) {
    if (isDeployedBundle()) throw domainError('La simulación de pagos solo existe en el demo.', 'FORBIDDEN');
    const who = resolveActor(actor);
    const bundle = await loadAccount(accountId);
    if (who.role === 'invitado') assertCan(bundle.event, who, 'demoPay', bundle.account);
    else if (who.role !== 'admin') throw domainError('El organizador no registra pagos.', 'FORBIDDEN');
    const computed = L.computeAccount({ event: bundle.event, account: bundle.account, lines: bundle.lines, today });
    const problem = L.validatePaymentAmount(amount, computed.payment);
    if (problem) throw domainError(problem, 'VALIDATION');
    const line = rule(() => L.paymentDraft({
      event: bundle.event, account: bundle.account, computed, amount, date: today, method: 'bold',
      reference: `DEMO-${Date.now().toString(36).toUpperCase()}`, origin: 'demo',
    }));
    const [saved] = await writeLines([line], who);
    await writeLog(bundle.event, who, { accountId: bundle.account.id, action: 'pago', detail: `${bundle.account.displayName} registró un pago en línea (demo)`, amount });
    return saved;
  },

  /**
   * Cancelar a una persona (regla 14, admin): devuelve sus aportes
   * voluntarios, cancela lo vivo y cobra la penalidad del tramo.
   */
  async cancelGuest(guestId, { reason }, actor, { today = L.todayCO() } = {}) {
    const who = resolveActor(actor);
    if (!reason || !String(reason).trim()) throw domainError('Escribe el motivo de la cancelación.', 'VALIDATION');
    const { accountId } = await apiService.getById(R.guests, guestId);
    // En fila por cuenta y con la persona recién leída: un doble clic no cancela dos veces.
    return withAccountLock(accountId, async () => {
      const guest = await apiService.getById(R.guests, guestId);
      const bundle = await loadBundle(guest.eventId);
      assertCan(bundle.event, who, 'admin');
      const quote = rule(() => L.cancellationQuote({ event: bundle.event, guest, lines: bundle.lines, hostAccount: hostOf(bundle), today, reason: String(reason).trim() }));
      await writeLines(quote.lines, who);
      await apiService.patch(R.guests, guestId, { status: 'cancelado', cancelledAt: nowIso() });
      await writeLog(bundle.event, who, {
        accountId: guest.accountId, action: 'cancelacion',
        detail: `Se canceló el viaje de ${L.guestName(guest)} (tramo del ${quote.pct} %)`,
        amount: quote.penaltyTotal,
      });
      return quote;
    });
  },

  /** Reembolso de saldo a favor (regla 15, admin). Misma regla de fecha que registerPayment. */
  async refund(accountId, { amount, method = 'transferencia', reference, reason, date }, actor, { today = L.todayCO() } = {}) {
    const who = resolveActor(actor);
    const bundle = await loadAccount(accountId);
    assertCan(bundle.event, who, 'admin');
    const effective = date || today;
    assertMoneyDate(effective, bundle.event, today);
    const computed = L.computeAccount({ event: bundle.event, account: bundle.account, lines: bundle.lines, today });
    const line = rule(() => L.refundDraft({ event: bundle.event, account: bundle.account, computed, amount, date: effective, method, reference, reason }));
    const [saved] = await writeLines([line], who);
    await writeLog(bundle.event, who, { accountId: bundle.account.id, action: 'reembolso', detail: `Reembolso de saldo a favor a ${bundle.account.displayName}`, amount });
    return saved;
  },

  /**
   * Corregir un movimiento (regla 2, admin): línea inversa con motivo. La
   * corrección conserva el origin de la original; si es un cargo por regla
   * de paquete, corrige también su cobertura (correctionDrafts).
   */
  async correctLine(lineId, { reason }, actor, { today = L.todayCO() } = {}) {
    const who = resolveActor(actor);
    const first = await apiService.getById(R.ledger, lineId);
    return withAccountLock(first.accountId, async () => {
      const original = await apiService.getById(R.ledger, lineId);
      const bundle = await loadBundle(original.eventId);
      assertCan(bundle.event, who, 'admin');
      const drafts = rule(() => L.correctionDrafts({ lines: bundle.lines, lineId, reason, date: today }));
      const saved = await writeLines(drafts, who);
      await writeLog(bundle.event, who, { accountId: original.accountId, action: 'correccion', detail: `Se corrigió un movimiento: ${original.description}`, amount: -original.amount });
      return saved;
    });
  },

  /** Cambio de paquete (regla 16, admin): sin penalidad; metas se recalculan solas. */
  async changePackage(guestId, packageId, actor, { today = L.todayCO(), reason = 'cambio de paquete' } = {}) {
    const who = resolveActor(actor);
    const { accountId } = await apiService.getById(R.guests, guestId);
    return withAccountLock(accountId, async () => {
      const guest = await apiService.getById(R.guests, guestId);
      const bundle = await loadBundle(guest.eventId);
      assertCan(bundle.event, who, 'admin');
      const newPackage = bundle.packages.find((p) => L.sameId(p.id, packageId));
      if (!newPackage) throw domainError('Ese paquete no es de este evento.', 'VALIDATION');
      const drafts = rule(() => L.packageChangeLines({
        event: bundle.event, guest, newPackage, lines: bundle.lines, hostAccount: hostOf(bundle), date: today, reason,
        pairPrefix: pairPrefix(`chg-e${bundle.event.id}`),
      }));
      await writeLines(drafts, who);
      const updated = await apiService.patch(R.guests, guestId, { packageId: newPackage.id, audience: newPackage.audience });
      await writeLog(bundle.event, who, { accountId: guest.accountId, action: 'config', detail: `Cambio de paquete de ${L.guestName(guest)} a «${newPackage.name}»` });
      return { guest: updated, lines: drafts };
    });
  },
};
