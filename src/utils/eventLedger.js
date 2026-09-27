/**
 * eventLedger.js
 * =============================================================================
 * PROPÓSITO:
 *   Contabilidad del panel de EVENTOS (bodas, promociones de colegio, viajes de
 *   incentivo de empresa). Todo lo de este archivo son funciones PURAS: reciben
 *   datos y devuelven cifras o BORRADORES de líneas del libro. No leen ni
 *   escriben nada; quien guarda es src/services/eventService.js.
 *
 * MODELO (reglas 1-21 de la especificación de Eventos):
 *   - Cada invitación es una CUENTA (eventAccounts) que paga por una o más
 *     PERSONAS (eventGuests): quién viaja no es lo mismo que quién paga.
 *     Hay UNA cuenta kind 'anfitrion' por evento (novios, fondo, empresa).
 *   - Todo el dinero vive en un LIBRO (eventLedger) de líneas con signo:
 *        amount > 0  -> la cuenta debe MÁS
 *        amount < 0  -> la cuenta debe MENOS
 *     Las líneas solo se AGREGAN. Nunca se editan ni se borran: un error se
 *     corrige con otra línea del mismo kind, signo contrario, correctsId y
 *     reason (regla 2).
 *   - Las cinco cifras de una cuenta (cuesta, cubierto, neto, pagado, saldo),
 *     sus metas, lo exigible, los días de atraso y su estado se CALCULAN del
 *     libro cada vez. No hay totales guardados ni cuotas guardadas.
 *
 * CONVENCIONES:
 *   - Montos: pesos colombianos ENTEROS (COP). Nada de decimales.
 *   - Fechas de negocio: texto 'YYYY-MM-DD'. Se comparan como texto (el orden
 *     alfabético coincide con el cronológico).
 *   - 'Hoy' siempre se puede inyectar (parámetro `today`) para probar. Por
 *     defecto es la fecha local de Colombia (UTC−5, sin horario de verano).
 *   - Los timestamps (confirmedAt, publishedAt, createdAt) son ISO y se pasan
 *     a fecha de Colombia con isoToDateCO().
 *   - Los ids se comparan como texto (sameId) porque json-server y el
 *     adaptador local pueden devolver números o cadenas.
 *
 * GRUPOS DE KINDS (regla 3):
 *   COBRO     = cargo, descuento, cancelacion, penalidad
 *   COBERTURA = aporte_anfitrion
 *   CAJA      = pago, reembolso, reverso_pago
 * =============================================================================
 */

/* ---------------------------------------------------------------------------
 * 1. Constantes
 * ------------------------------------------------------------------------ */

export const COBRO = Object.freeze(['cargo', 'descuento', 'cancelacion', 'penalidad']);
export const COBERTURA = Object.freeze(['aporte_anfitrion']);
export const CAJA = Object.freeze(['pago', 'reembolso', 'reverso_pago']);
export const LEDGER_KINDS = Object.freeze([...COBRO, ...COBERTURA, ...CAJA]);

/** Métodos de pago o reembolso admitidos en el libro. */
export const PAYMENT_METHODS = Object.freeze(['bold', 'wompi', 'transferencia']);

/** Días antes de una meta en los que la cuenta pasa a 'por_vencer' (regla 10). */
export const DUE_SOON_DAYS = 7;

/** Tope de recordatorios: uno por cuenta cada 3 días (regla 20). */
export const REMINDER_GAP_HOURS = 72;

/** Última meta: al menos 15 días antes del viaje (validación del asistente). */
export const LAST_MILESTONE_MIN_DAYS = 15;

/**
 * Estados de una cuenta (regla 10) con su texto y la clase de StatusBadge
 * (main.css:2182-2188). El orden de este objeto es el orden de evaluación.
 */
export const ACCOUNT_STATUS = Object.freeze({
  sin_cargos: { label: 'Sin cargos', badge: 'badge--gray' },
  saldo_a_favor: { label: 'Saldo a favor', badge: 'badge--blue' },
  cubierto: { label: 'Cubierto', badge: 'badge--violet' },
  pagado: { label: 'Pagado', badge: 'badge--teal' },
  atrasado: { label: 'Atrasado', badge: 'badge--red' },
  por_vencer: { label: 'Por vencer', badge: 'badge--amber' },
  al_dia: { label: 'Al día', badge: 'badge--green' },
});

/** Estados que cuentan como "al día" para el % del evento (regla 13). */
export const UP_TO_DATE_STATUSES = Object.freeze(['al_dia', 'por_vencer', 'pagado', 'cubierto']);

/* ---------------------------------------------------------------------------
 * 2. Utilidades de fechas y montos (regla 1)
 * ------------------------------------------------------------------------ */

/** Colombia está en UTC−5 todo el año (no tiene horario de verano). */
const CO_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de hoy en Colombia, 'YYYY-MM-DD'. `now` se puede inyectar. */
export function todayCO(now = new Date()) {
  return new Date(new Date(now).getTime() - CO_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Convierte un ISO (o una fecha ya en 'YYYY-MM-DD') a la fecha de Colombia.
 * Devuelve null si el valor está vacío o no es una fecha.
 */
export function isoToDateCO(value) {
  if (!value) return null;
  const text = String(value);
  if (DATE_RE.test(text)) return text;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return null;
  return new Date(ms - CO_OFFSET_MS).toISOString().slice(0, 10);
}

/** Número de día (entero) de una fecha 'YYYY-MM-DD', para restar fechas. */
function dayNumber(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Suma n días (puede ser negativo) a una fecha 'YYYY-MM-DD'. */
export function addDays(date, n) {
  return new Date((dayNumber(date) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** Días que van de `from` a `to` (to − from). Positivo si `to` es posterior. */
export function daysBetween(from, to) {
  return dayNumber(to) - dayNumber(from);
}

/** La más tardía de dos fechas 'YYYY-MM-DD'. */
export function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/** Último día del mes de una fecha: '2026-02-10' -> '2026-02-28'. */
export function endOfMonth(date) {
  const [y, m] = String(date).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Redondea HACIA ARRIBA al múltiplo de 1.000 (regla 1). El −1e-9 evita que un
 * error de coma flotante (p. ej. 792000.0000001) suba un escalón de más.
 */
export function ceil1000(x) {
  return Math.ceil(x / 1000 - 1e-9) * 1000;
}

/** Redondea al múltiplo de 1.000 más cercano (regla 1). */
export function round1000(x) {
  return Math.round(x / 1000) * 1000;
}

/** Compara ids sin importar si vienen como número o texto. */
export function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/** Lanza un error si el monto no es un entero de pesos. */
function assertInt(value, what = 'El monto') {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} debe ser un número entero de pesos.`);
  }
}

/**
 * Monto legible para los mensajes de error: 1234567 -> '$ 1.234.567'.
 * (No usamos formatCurrency.js porque arrastra settingsService y este
 * archivo debe poder correr en Node para las pruebas.)
 */
export function pesos(value) {
  const n = Math.round(Number(value) || 0);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '−' : ''}$ ${digits}`;
}

/** Nombre completo de una persona del evento. */
export function guestName(guest) {
  return [guest?.firstName, guest?.lastName].filter(Boolean).join(' ').trim() || 'Invitado';
}

/* ---------------------------------------------------------------------------
 * 3. Borradores de líneas del libro
 * ------------------------------------------------------------------------ */

/**
 * Crea el borrador de una línea con TODOS los campos del esquema. Las
 * funciones de este archivo devuelven borradores sin id, createdBy ni
 * createdAt; eventService (o la semilla) los sella al guardarlos.
 *
 * Campos que unen líneas:
 *   pairId      - las DOS líneas de una cobertura o de un aporte (invitado y
 *                 anfitrión). Se corrigen siempre juntas.
 *   chargeGroup - un cargo por regla de paquete y el par de cobertura que
 *                 nació con él. Corregir el CARGO corrige todo el grupo (si
 *                 no, el anfitrión seguiría cubriendo a alguien sin cargo);
 *                 corregir solo la cobertura deja el cargo vivo.
 *   correctsId  - la línea que esta corrige (regla 2).
 */
export function lineDraft(fields) {
  const line = {
    eventId: null,
    accountId: null,
    guestId: null,
    kind: null,
    amount: 0,
    date: null,
    description: '',
    origin: 'admin',
    pairId: null,
    chargeGroup: null,
    correctsId: null,
    reason: null,
    method: null,
    reference: null,
    thirdPartyPart: null,
    servicePart: null,
    ...fields,
  };
  if (!LEDGER_KINDS.includes(line.kind)) throw new Error(`Tipo de movimiento desconocido: ${line.kind}`);
  assertInt(line.amount);
  if (!line.date || !DATE_RE.test(line.date)) throw new Error('Cada movimiento necesita una fecha YYYY-MM-DD.');
  return line;
}

/** Suma los amount de las líneas cuyo kind está en `kinds`. */
function sumKinds(lines, kinds) {
  let total = 0;
  for (const line of lines) if (kinds.includes(line.kind)) total += Number(line.amount) || 0;
  return total;
}

/** Líneas de una cuenta concreta. */
export function linesOf(lines, accountId) {
  return (lines || []).filter((line) => sameId(line.accountId, accountId));
}

/** Mapa id -> línea, para seguir correctsId. */
function indexById(lines) {
  return new Map((lines || []).filter((l) => l.id != null).map((l) => [String(l.id), l]));
}

/**
 * ¿Es un aporte VOLUNTARIO del anfitrión (regla 7) o la corrección de uno?
 * Las correcciones conservan el origin de la línea que corrigen, pero las
 * hechas antes de esa regla quedaron con origin 'admin': por eso también se
 * mira a qué línea apunta correctsId.
 */
export function isVoluntaryLine(line, byId = null) {
  if (line.kind !== 'aporte_anfitrion') return false;
  if (line.origin === 'aporte') return true;
  if (line.correctsId != null && byId) {
    const original = byId.get(String(line.correctsId));
    return Boolean(original && original.origin === 'aporte');
  }
  return false;
}

/** Ids (como texto) de las líneas que ya tienen una corrección. */
function correctedIds(lines) {
  return new Set((lines || []).filter((l) => l.correctsId != null).map((l) => String(l.correctsId)));
}

/**
 * ¿La línea `a` se escribió después que `b`? Con ids numéricos (json-server y
 * el adaptador local) manda el id; si no, la fecha y luego createdAt.
 */
function isLater(a, b) {
  const ia = Number(a.id);
  const ib = Number(b.id);
  if (Number.isFinite(ia) && Number.isFinite(ib) && a.id != null && b.id != null) return ia > ib;
  if (a.date !== b.date) return String(a.date) > String(b.date);
  return String(a.createdAt || '') > String(b.createdAt || '');
}

/* ---------------------------------------------------------------------------
 * 4. Cifras de una cuenta (regla 4)
 * ------------------------------------------------------------------------ */

/**
 * Las cinco cifras de una cuenta a partir de SUS líneas.
 *   cuesta   = Σ COBRO
 *   cubierto = −Σ COBERTURA   (en la cuenta anfitrión sale negativo: es lo que CUBRE)
 *   neto     = Σ COBRO + Σ COBERTURA   ('lo que te toca')
 *   pagado   = −Σ CAJA        (pagos − reembolsos − reversos)
 *   saldo    = neto − pagado  (>0 'te falta', <0 'saldo a favor')
 */
export function accountFigures(accountLines) {
  const lines = accountLines || [];
  const cuesta = sumKinds(lines, COBRO);
  const cobertura = sumKinds(lines, COBERTURA);
  const caja = sumKinds(lines, CAJA);
  const neto = cuesta + cobertura;
  // "0 - x" en vez de "-x" para no devolver −0 cuando no hay líneas.
  const pagado = 0 - caja;
  return {
    cuesta,
    cubierto: 0 - cobertura,
    neto,
    pagado,
    saldo: neto - pagado,
    hasCargos: lines.some((l) => COBRO.includes(l.kind) || COBERTURA.includes(l.kind)),
    hasPagos: lines.some((l) => CAJA.includes(l.kind)),
  };
}

/* ---------------------------------------------------------------------------
 * 5. Plan por metas acumuladas (reglas 8 y 9)
 * ------------------------------------------------------------------------ */

/**
 * Fecha desde la que corre el plan de una cuenta:
 *   - cuenta anfitrión: events.publishedAt (regla 8);
 *   - invitación: su confirmedAt;
 *   - respaldo (datos incompletos): la primera línea de la cuenta.
 */
export function planBaseDate(event, account, accountLines = []) {
  const fromLines = () => {
    const dates = accountLines.map((l) => l.date).filter(Boolean).sort();
    return dates[0] || null;
  };
  if (account?.kind === 'anfitrion') {
    return isoToDateCO(event?.publishedAt) || isoToDateCO(account.confirmedAt) || isoToDateCO(event?.createdAt) || fromLines();
  }
  return isoToDateCO(account?.confirmedAt) || fromLines();
}

/**
 * Hitos del plan del evento ya normalizados: [{ key, label, date, pct }].
 * Son los de plan.hitos (con key y label por defecto); si el plan no tiene
 * hitos, uno solo «Pago total» LAST_MILESTONE_MIN_DAYS días antes del viaje.
 * Lo usan las metas de cada cuenta y las metas del evento, para que las dos
 * hablen de las mismas fechas.
 */
export function planHitos(event) {
  const plan = event?.plan || {};
  const hitos = Array.isArray(plan.hitos) ? plan.hitos.filter((h) => h && h.date) : [];
  if (hitos.length === 0) {
    if (!event?.startDate) return [];
    return [{ key: 'total', label: 'Pago total', date: addDays(event.startDate, -LAST_MILESTONE_MIN_DAYS), pct: 100 }];
  }
  return hitos.map((hito, index) => ({
    key: hito.key || `hito${index + 1}`,
    label: hito.label || `Meta ${index + 1}`,
    date: hito.date,
    pct: Number(hito.pct ?? 100),
  }));
}

/**
 * Metas de una cuenta (regla 8). Cada meta es ACUMULADA: «al 31 de agosto
 * deberías llevar X en total».
 *   - R = fecha base + (plan.reserva.dueDays ?? 7).
 *   - Reserva (si existe): min(NETO, amount) o ceil1000(NETO × pct/100); vence en R.
 *   - Hito i: fecha = max(fecha del hito, R); meta = ceil1000(NETO × pct/100).
 *   - El último hito vale NETO exacto y ninguna meta baja de la anterior.
 * Como dependen del NETO de HOY, se recalculan solas con cada aporte,
 * cancelación o cambio de paquete.
 *
 * @returns {Array<{key,label,date,pct,target}>} ordenadas por fecha.
 */
export function milestonesFor({ event, account, neto, lines = [] }) {
  const plan = event?.plan || {};
  const base = planBaseDate(event, account, lines);
  if (!base) return [];
  const R = addDays(base, Number(plan.reserva?.dueDays ?? 7));
  const total = Math.max(0, Number(neto) || 0);
  const out = [];
  let prev = 0;

  const reserva = plan.reserva;
  if (reserva && (reserva.amount > 0 || reserva.pct > 0)) {
    const raw = reserva.pct > 0 ? ceil1000((total * reserva.pct) / 100) : Math.min(total, reserva.amount);
    const target = Math.min(raw, total);
    out.push({ key: 'reserva', label: 'Reserva', date: R, pct: reserva.pct > 0 ? reserva.pct : null, target });
    prev = target;
  }

  // Plan sin hitos: planHitos() pone uno solo LAST_MILESTONE_MIN_DAYS días antes del viaje.
  const hitos = planHitos(event);
  hitos.forEach((hito, index) => {
    const isLast = index === hitos.length - 1;
    const raw = isLast ? total : ceil1000((total * Number(hito.pct || 0)) / 100);
    const target = Math.min(Math.max(raw, prev), total);
    out.push({ key: hito.key, label: hito.label, date: maxDate(hito.date, R), pct: hito.pct, target });
    prev = target;
  });
  return out;
}

/**
 * Cruza las metas con lo pagado y la fecha de hoy (regla 9).
 *   - Una meta vence al terminar su día: está vencida si hoy > fecha.
 *   - EXIGIBLE = max(0, meta del último hito vencido − PAGADO).
 *   - Días de atraso = hoy − fecha del PRIMER hito vencido cuya meta > PAGADO.
 *   - Próxima meta = la primera NO vencida cuya meta todavía es > PAGADO.
 */
export function milestoneTimeline(milestones, pagado, today) {
  const rows = milestones.map((m) => {
    const vencida = today > m.date;
    const cumplida = pagado >= m.target;
    return {
      ...m,
      vencida,
      cumplida,
      state: cumplida ? 'cumplida' : vencida ? 'vencida' : 'pendiente',
      falta: Math.max(0, m.target - pagado),
      daysLeft: daysBetween(today, m.date),
    };
  });
  const due = rows.filter((m) => m.vencida);
  const lastDue = due[due.length - 1] || null;
  const firstUnmetDue = due.find((m) => m.target > pagado) || null;
  const next = rows.find((m) => !m.vencida && m.target > pagado) || null;
  const metaAHoy = lastDue ? lastDue.target : 0;
  return {
    milestones: rows,
    metaAHoy,
    exigible: Math.max(0, metaAHoy - pagado),
    diasAtraso: firstUnmetDue ? daysBetween(firstUnmetDue.date, today) : 0,
    oldestUnmet: firstUnmetDue,
    next,
  };
}

/* ---------------------------------------------------------------------------
 * 6. Estado de la cuenta (regla 10) y cuota sugerida (regla 11)
 * ------------------------------------------------------------------------ */

/**
 * Estado de una cuenta ya calculada. Gana el primero que se cumpla:
 * sin_cargos, saldo_a_favor, cubierto, pagado, atrasado, por_vencer, al_dia.
 */
export function accountStatus(c) {
  if (!c.hasCargos && !c.hasPagos) return 'sin_cargos';
  if (c.saldo < 0) return 'saldo_a_favor';
  if (c.neto <= 0 && c.saldo === 0) return 'cubierto';
  if (c.saldo === 0) return 'pagado';
  if (c.exigible > 0) return 'atrasado';
  if (c.next && c.next.daysLeft <= DUE_SOON_DAYS) return 'por_vencer';
  return 'al_dia';
}

/** Texto corto del estado: «Atrasado · 15 días», «Al día»... */
export function statusText(c) {
  const meta = ACCOUNT_STATUS[c.status] || { label: c.status };
  if (c.status === 'atrasado') {
    return `${meta.label} · ${c.diasAtraso} ${c.diasAtraso === 1 ? 'día' : 'días'}`;
  }
  return meta.label;
}

/**
 * Cuánto pagar (regla 11).
 *   - Sugerida: EXIGIBLE si es > 0; si no, meta del próximo hito − PAGADO;
 *     si no hay próximo hito, el SALDO.
 *   - «Otro valor»: entre min(plan.minAbono, SALDO) y SALDO.
 * El monto lo fija la app o el servidor; nunca un campo libre sin validar.
 */
export function suggestedPayment(c, plan = {}) {
  if (!(c.saldo > 0)) {
    return { suggested: 0, min: 0, max: 0, dueDate: null, canPay: false };
  }
  let suggested;
  let dueDate = null;
  if (c.exigible > 0) {
    suggested = c.exigible;
    dueDate = c.oldestUnmet ? c.oldestUnmet.date : null;
  } else if (c.next) {
    suggested = c.next.target - c.pagado;
    dueDate = c.next.date;
  } else {
    suggested = c.saldo;
  }
  suggested = Math.min(Math.max(suggested, 0), c.saldo);
  const min = Math.min(Math.max(Number(plan.minAbono) || 0, 1), c.saldo);
  return { suggested, min, max: c.saldo, dueDate, canPay: true };
}

/** Valida un monto de «Otro valor» contra el rango de suggestedPayment. */
export function validatePaymentAmount(amount, range) {
  if (!Number.isInteger(amount) || amount <= 0) return 'Escribe un valor en pesos, sin decimales.';
  if (amount < range.min) return `El abono mínimo es de ${pesos(range.min)}.`;
  if (amount > range.max) return `El valor no puede ser mayor al saldo (${pesos(range.max)}).`;
  return null;
}

/* ---------------------------------------------------------------------------
 * 7. computeAccount: todo lo de UNA cuenta
 * ------------------------------------------------------------------------ */

/**
 * Calcula una cuenta completa: cifras, metas, exigible, atraso, estado y
 * cuota sugerida.
 *
 * @param {object} args
 * @param {object} args.event   - evento (plan, publishedAt...).
 * @param {object} args.account - cuenta (kind, confirmedAt...).
 * @param {Array}  args.lines   - líneas del libro (de la cuenta o de todo el evento).
 * @param {string} [args.today] - 'YYYY-MM-DD'; por defecto hoy en Colombia.
 */
export function computeAccount({ event, account, lines = [], today = todayCO() }) {
  const own = linesOf(lines, account.id);
  const figures = accountFigures(own);
  const milestones = figures.hasCargos ? milestonesFor({ event, account, neto: figures.neto, lines: own }) : [];
  const timeline = milestoneTimeline(milestones, figures.pagado, today);
  const computed = {
    accountId: account.id,
    kind: account.kind,
    displayName: account.displayName,
    groupTag: account.groupTag || '',
    ...figures,
    ...timeline,
    aFavor: Math.max(0, -figures.saldo),
    porPagar: Math.max(0, figures.saldo),
  };
  computed.status = accountStatus(computed);
  computed.statusLabel = statusText(computed);
  computed.badge = (ACCOUNT_STATUS[computed.status] || {}).badge || 'badge--gray';
  computed.payment = suggestedPayment(computed, event?.plan);
  return computed;
}

/* ---------------------------------------------------------------------------
 * 8. Semáforo por persona (regla 12)
 * ------------------------------------------------------------------------ */

/**
 * Semáforo de una persona: asistencia, pago y documentos.
 *   - pago: el estado de la cuenta que la cubre; si su cargo está 100 %
 *     cubierto por el anfitrión, 'cubierto'.
 *   - documentos: docsOk true = 'completo', false = 'faltan', null = 'no_aplica'.
 */
export function personSemaphore(guest, accountComputed, lines = []) {
  const asistencia = guest.status === 'cancelado' ? 'cancelado'
    : guest.attendance === 'si' ? 'si'
      : guest.attendance === 'no' ? 'no' : 'pendiente';
  let pago = accountComputed ? accountComputed.status : 'sin_cargos';
  if (guest.status !== 'cancelado') {
    const own = lines.filter((l) => sameId(l.guestId, guest.id) && sameId(l.accountId, guest.accountId));
    const charged = own.filter((l) => l.kind === 'cargo' || l.kind === 'cancelacion').reduce((s, l) => s + l.amount, 0);
    const covered = -own.filter((l) => l.kind === 'aporte_anfitrion').reduce((s, l) => s + l.amount, 0);
    if (charged > 0 && covered >= charged) pago = 'cubierto';
  }
  const documentos = guest.docsOk === true ? 'completo' : guest.docsOk === false ? 'faltan' : 'no_aplica';
  return { asistencia, pago, documentos };
}

/* ---------------------------------------------------------------------------
 * 9. Cargos al confirmar (reglas 5 y 6)
 * ------------------------------------------------------------------------ */

/**
 * Valor que cubre el anfitrión de un paquete (regla 6).
 *   none -> 0 · pct 100 -> price · pct < 100 -> round1000(price × pct/100)
 *   fixed -> min(valor, price)
 */
export function hostCoverageFor(pkg) {
  const price = Number(pkg?.price) || 0;
  const value = Number(pkg?.hostCoversValue) || 0;
  switch (pkg?.hostCoversType) {
    case 'pct':
      if (value >= 100) return price;
      if (value <= 0) return 0;
      return Math.min(price, round1000((price * value) / 100));
    case 'fixed':
      return Math.max(0, Math.min(value, price));
    default:
      return 0;
  }
}

/**
 * Suma "viva" de una persona en una cuenta: cargos y coberturas no anulados.
 * Con skipVoluntary deja fuera los aportes voluntarios y sus correcciones
 * (`byId` permite reconocer las correcciones viejas con origin 'admin').
 */
function liveAmount(lines, guestId, accountId, { skipVoluntary = false, byId = null } = {}) {
  let total = 0;
  for (const l of lines) {
    if (!sameId(l.guestId, guestId) || !sameId(l.accountId, accountId)) continue;
    if (skipVoluntary && isVoluntaryLine(l, byId)) continue;
    if (['cargo', 'aporte_anfitrion', 'descuento', 'cancelacion'].includes(l.kind)) total += l.amount;
  }
  return total;
}

/** ¿La persona ya tiene un cargo vivo (no cancelado) en su cuenta? */
export function hasLiveCharge(lines, guest) {
  let total = 0;
  for (const l of lines || []) {
    if (sameId(l.guestId, guest.id) && sameId(l.accountId, guest.accountId) && (l.kind === 'cargo' || l.kind === 'cancelacion')) {
      total += l.amount;
    }
  }
  return total > 0;
}

/**
 * Par de líneas de cobertura por regla de paquete (regla 6):
 * −C en la cuenta de la persona y +C en la cuenta anfitrión, mismo pairId.
 * `chargeGroup` las une con el cargo que las originó.
 */
function coverageLines({ event, guest, pkg, hostAccount, date, pairId, chargeGroup = null }) {
  const C = hostCoverageFor(pkg);
  if (C <= 0) return [];
  if (!hostAccount) throw new Error('El evento no tiene cuenta anfitrión para registrar la cobertura.');
  const hostName = hostAccount.displayName || event.hostDisplayName || 'el anfitrión';
  const label = pkg.hostCoversLabel || 'Parte del paquete';
  const name = guestName(guest);
  return [
    lineDraft({
      eventId: event.id, accountId: guest.accountId, guestId: guest.id, kind: 'aporte_anfitrion', amount: -C, date,
      description: `Cubierto por ${hostName}: ${label}`, origin: 'regla_paquete', pairId, chargeGroup,
    }),
    lineDraft({
      eventId: event.id, accountId: hostAccount.id, guestId: guest.id, kind: 'aporte_anfitrion', amount: C, date,
      description: `${label} · ${name}`, origin: 'regla_paquete', pairId, chargeGroup,
    }),
  ];
}

/** Cargo de un paquete a una persona (regla 5). */
function chargeLine({ event, guest, pkg, date, chargeGroup = null }) {
  const price = Number(pkg.price);
  assertInt(price, 'El precio del paquete');
  const third = Number(pkg.thirdPartyCost) || 0;
  return lineDraft({
    eventId: event.id, accountId: guest.accountId, guestId: guest.id, kind: 'cargo', amount: price, date,
    description: `Paquete ${pkg.name} · ${guestName(guest)}`, origin: 'regla_paquete', chargeGroup,
    thirdPartyPart: third, servicePart: pkg.serviceFee != null ? Number(pkg.serviceFee) : price - third,
  });
}

/**
 * Cargo + cobertura de una persona con el mismo grupo (`${prefix}-${guestId}`,
 * que también es el pairId de la cobertura).
 */
function chargeWithCoverage({ event, guest, pkg, hostAccount, date, prefix }) {
  const group = `${prefix}-${guest.id}`;
  return [
    chargeLine({ event, guest, pkg, date, chargeGroup: group }),
    ...coverageLines({ event, guest, pkg, hostAccount, date, pairId: group, chargeGroup: group }),
  ];
}

/**
 * Líneas que se crean cuando una invitación confirma (reglas 5 y 6).
 * Por cada persona activa con attendance 'si' y paquete: un cargo +price y,
 * si el anfitrión cubre algo de ese paquete, el par aporte_anfitrion (el
 * cargo y el par comparten chargeGroup).
 * Las personas con attendance 'no' no generan cargo. Si una persona ya tiene
 * un cargo vivo, se salta (así confirmar dos veces no cobra doble).
 *
 * @param {object} args
 * @param {Array}  args.guests     - personas de la cuenta (con id, accountId, packageId, attendance).
 * @param {Array}  args.packages   - paquetes del evento.
 * @param {object} args.hostAccount- cuenta anfitrión (necesaria si hay cobertura).
 * @param {string} args.date       - fecha efectiva 'YYYY-MM-DD'.
 * @param {string} [args.pairPrefix] - prefijo para los pairId (debe ser único por operación).
 * @param {Array}  [args.lines]    - libro actual, para no cobrar dos veces.
 */
export function chargesOnConfirm({ event, guests, packages, hostAccount, date, pairPrefix = 'cov', lines = [] }) {
  const out = [];
  for (const guest of guests) {
    if (guest.status === 'cancelado' || guest.attendance !== 'si') continue;
    if (hasLiveCharge(lines, guest)) continue;
    const pkg = packages.find((p) => sameId(p.id, guest.packageId));
    if (!pkg) throw new Error(`${guestName(guest)} no tiene un paquete asignado.`);
    out.push(...chargeWithCoverage({ event, guest, pkg, hostAccount, date, prefix: pairPrefix }));
  }
  return out;
}

/** rsvp que resulta de las respuestas de las personas (regla 5). */
export function rsvpFromAttendance(guests) {
  const active = guests.filter((g) => g.status !== 'cancelado');
  if (active.length > 0 && active.every((g) => g.attendance === 'no')) return 'no_asiste';
  return 'confirmada';
}

/* ---------------------------------------------------------------------------
 * 10. Aportar (regla 7)
 * ------------------------------------------------------------------------ */

/**
 * Personas que recibirían un aporte: activas, confirmadas y de cuentas
 * invitación (nunca la cuenta anfitrión). `target` elige a quién:
 *   {}                      -> todas las confirmadas
 *   { groupTag: '11A' }     -> un grupo
 *   { accountIds: [..] }    -> cuentas elegidas
 *   { guestIds: [..] }      -> personas elegidas
 */
export function contributionRecipients({ accounts, guests, target = {} }) {
  const invitations = new Map(accounts.filter((a) => a.kind !== 'anfitrion').map((a) => [String(a.id), a]));
  return guests
    .filter((g) => g.status !== 'cancelado' && g.attendance === 'si' && invitations.has(String(g.accountId)))
    .filter((g) => {
      const account = invitations.get(String(g.accountId));
      if (target.guestIds && !target.guestIds.some((id) => sameId(id, g.id))) return false;
      if (target.accountIds && !target.accountIds.some((id) => sameId(id, g.accountId))) return false;
      if (target.groupTag && account.groupTag !== target.groupTag) return false;
      return true;
    })
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * Reparte un total T (múltiplo de 1.000) entre N personas por mayor residuo:
 * base = floor(T/N/1000)×1000 y los r miles que sobran van de a 1.000 a las
 * primeras r personas (por id). La suma cuadra al peso.
 */
export function splitTotal(total, n) {
  assertInt(total, 'El total');
  if (total % 1000 !== 0) throw new Error('El total a repartir debe ser múltiplo de 1.000.');
  if (n <= 0) return [];
  const base = Math.floor(total / n / 1000) * 1000;
  const r = (total - base * n) / 1000;
  return Array.from({ length: n }, (_, i) => base + (i < r ? 1000 : 0));
}

/**
 * Vista previa de un aporte del anfitrión (regla 7). No escribe nada.
 *   mode 'por_persona': `amount` para cada persona.
 *   mode 'total':       `amount` repartido con splitTotal.
 * Tope: una cuenta no recibe más que su NETO actual; el exceso no se aplica
 * y queda en `totalExcess` / `recipients[].excess` para mostrarlo.
 * También avisa qué cuentas quedarían con saldo a favor (ya habían pagado).
 */
export function contributionPreview({ event, accounts, guests, lines, target = {}, mode = 'por_persona', amount, today = todayCO() }) {
  assertInt(amount, 'El valor del aporte');
  if (amount <= 0) throw new Error('El aporte debe ser mayor que cero.');
  const recipients = contributionRecipients({ accounts, guests, target });
  const planned = mode === 'total' ? splitTotal(amount, recipients.length) : recipients.map(() => amount);

  const byAccount = new Map();
  const accountById = new Map(accounts.map((a) => [String(a.id), a]));
  const rows = recipients.map((guest, i) => {
    const key = String(guest.accountId);
    if (!byAccount.has(key)) {
      const computed = computeAccount({ event, account: accountById.get(key), lines, today });
      byAccount.set(key, { computed, room: Math.max(0, computed.neto), applied: 0 });
    }
    const slot = byAccount.get(key);
    const applied = Math.min(planned[i], slot.room);
    slot.room -= applied;
    slot.applied += applied;
    return { guestId: guest.id, accountId: guest.accountId, name: guestName(guest), planned: planned[i], applied, excess: planned[i] - applied };
  });

  const accountRows = [...byAccount.entries()].map(([key, slot]) => {
    const c = slot.computed;
    const saldoDespues = c.saldo - slot.applied;
    return {
      accountId: accountById.get(key).id,
      displayName: c.displayName,
      applied: slot.applied,
      netoAntes: c.neto,
      netoDespues: c.neto - slot.applied,
      pagado: c.pagado,
      saldoAntes: c.saldo,
      saldoDespues,
      quedaAFavor: saldoDespues < 0,
      aFavorDespues: Math.max(0, -saldoDespues),
    };
  });

  const host = accounts.find((a) => a.kind === 'anfitrion');
  const hostNeto = host ? computeAccount({ event, account: host, lines, today }).neto : 0;
  const totalApplied = rows.reduce((s, r) => s + r.applied, 0);
  return {
    mode,
    amount,
    recipients: rows,
    count: rows.length,
    perPerson: mode === 'por_persona' ? amount : (planned[0] || 0),
    totalPlanned: planned.reduce((s, x) => s + x, 0),
    totalApplied,
    totalExcess: rows.reduce((s, r) => s + r.excess, 0),
    accounts: accountRows,
    accountsWithCredit: accountRows.filter((r) => r.quedaAFavor),
    hostAccountId: host ? host.id : null,
    hostNetoAntes: hostNeto,
    hostNetoDespues: hostNeto + totalApplied,
  };
}

/**
 * Convierte una vista previa en líneas (regla 7): por cada persona con
 * applied > 0, −X en su cuenta y +X en la cuenta anfitrión, origin 'aporte'.
 */
export function applyContribution(preview, { event, hostAccount, guests, date, pairPrefix = 'apt', reason = null }) {
  if (!hostAccount) throw new Error('El evento no tiene cuenta anfitrión.');
  const hostName = hostAccount.displayName || event.hostDisplayName || 'el anfitrión';
  const out = [];
  for (const r of preview.recipients) {
    if (r.applied <= 0) continue;
    const guest = guests.find((g) => sameId(g.id, r.guestId));
    const pairId = `${pairPrefix}-${r.guestId}`;
    out.push(lineDraft({
      eventId: event.id, accountId: r.accountId, guestId: r.guestId, kind: 'aporte_anfitrion', amount: -r.applied, date,
      description: `Aporte · ${hostName}`, origin: 'aporte', pairId, reason,
    }));
    out.push(lineDraft({
      eventId: event.id, accountId: hostAccount.id, guestId: r.guestId, kind: 'aporte_anfitrion', amount: r.applied, date,
      description: `Aporte a ${guestName(guest)}`, origin: 'aporte', pairId, reason,
    }));
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * 11. Cancelación de una persona (regla 14) y cambio de paquete (regla 16)
 * ------------------------------------------------------------------------ */

/**
 * Tramo de cancelación: el primero (de mayor a menor minDays) con días ≥ minDays.
 * Si ya pasó la salida (días negativos), aplica el último tramo.
 */
export function cancellationTier(tiers = [], days) {
  const sorted = [...tiers].sort((a, b) => b.minDays - a.minDays);
  const tier = sorted.find((t) => days >= t.minDays) || sorted[sorted.length - 1] || { minDays: 0, pct: 100 };
  return { pct: Number(tier.pct) || 0, tier };
}

/**
 * Cotiza (y arma las líneas de) la cancelación de UNA persona (regla 14).
 *   Paso 1: sus aportes voluntarios (origin 'aporte', con sus correcciones)
 *           que sigan vivos vuelven al anfitrión con el par inverso: su parte
 *           del fondo vuelve al fondo. Un aporte ya corregido suma 0 y no se
 *           devuelve dos veces.
 *   Paso 2: en cada cuenta a donde la persona tiene líneas, s_a = lo vivo de
 *           cargo + aporte_anfitrion + descuento (+ cancelaciones previas).
 *           Si s_a > 0: cancelacion −s_a y penalidad +ceil1000(s_a × pct/100).
 *           Así, si el anfitrión cubría el paquete por regla, la penalidad de
 *           esa parte le toca al anfitrión.
 * `today` fija el tramo (días = startDate − hoy); `date` es la fecha efectiva.
 */
export function cancellationQuote({ event, guest, lines, hostAccount, today = todayCO(), date = today, reason = '' }) {
  if (guest.status === 'cancelado') throw new Error(`El viaje de ${guestName(guest)} ya está cancelado.`);
  const days = daysBetween(today, event.startDate);
  const { pct, tier } = cancellationTier(event.cancellationTiers, days);
  const name = guestName(guest);
  const why = reason || 'Cancelación';
  const hostId = hostAccount ? hostAccount.id : null;
  const drafts = [];

  // Paso 1: devolver los aportes voluntarios al anfitrión.
  const byId = indexById(lines);
  const own = lines.filter((l) => sameId(l.guestId, guest.id));
  const voluntary = new Map();
  for (const l of own) {
    if (!isVoluntaryLine(l, byId) || sameId(l.accountId, hostId)) continue;
    voluntary.set(String(l.accountId), (voluntary.get(String(l.accountId)) || 0) + l.amount);
  }
  let returned = 0;
  for (const [accountKey, sum] of voluntary) {
    if (sum >= 0) continue;
    const X = -sum;
    returned += X;
    const accountId = own.find((l) => String(l.accountId) === accountKey).accountId;
    const pairId = `cxl-${guest.id}-${accountKey}-${date}`;
    drafts.push(lineDraft({
      eventId: event.id, accountId, guestId: guest.id, kind: 'aporte_anfitrion', amount: X, date,
      description: `Aporte devuelto por cancelación · ${name}`, origin: 'aporte', pairId, reason: why,
    }));
    drafts.push(lineDraft({
      eventId: event.id, accountId: hostId, guestId: guest.id, kind: 'aporte_anfitrion', amount: -X, date,
      description: `Aporte devuelto por cancelación · ${name}`, origin: 'aporte', pairId, reason: why,
    }));
  }

  // Paso 2: cancelar lo vivo en cada cuenta y cobrar la penalidad del tramo.
  const after = [...own, ...drafts];
  const accountOrder = [];
  for (const l of after) if (!accountOrder.some((id) => sameId(id, l.accountId))) accountOrder.push(l.accountId);
  const perAccount = [];
  for (const accountId of accountOrder) {
    const s = liveAmount(after, guest.id, accountId);
    if (s <= 0) continue;
    const penalty = pct > 0 ? ceil1000((s * pct) / 100) : 0;
    drafts.push(lineDraft({
      eventId: event.id, accountId, guestId: guest.id, kind: 'cancelacion', amount: -s, date,
      description: `Cancelación · ${name}`, origin: 'admin', reason: why,
    }));
    if (penalty > 0) {
      drafts.push(lineDraft({
        eventId: event.id, accountId, guestId: guest.id, kind: 'penalidad', amount: penalty, date,
        description: `Penalidad por cancelación (${pct} %) · ${name}`, origin: 'admin', reason: why,
      }));
    }
    perAccount.push({ accountId, isHost: sameId(accountId, hostId), s, cancelacion: -s, penalidad: penalty });
  }

  return {
    days,
    pct,
    tier,
    returned,
    perAccount,
    penaltyTotal: perAccount.reduce((sum, a) => sum + a.penalidad, 0),
    lines: drafts,
  };
}

/**
 * Cambio de paquete (regla 16): cancelacion −s_a SIN penalidad (reason
 * 'cambio de paquete') más el cargo nuevo con su cobertura (regla 6).
 * Los aportes VOLUNTARIOS de la persona se conservan (no entran en s_a);
 * si el paquete nuevo es más barato, la cuenta puede quedar con saldo a favor.
 */
export function packageChangeLines({ event, guest, newPackage, lines, hostAccount, date, reason = 'cambio de paquete', pairPrefix = 'chg' }) {
  if (guest.status === 'cancelado') throw new Error('No se cambia el paquete de una persona cancelada.');
  if (sameId(guest.packageId, newPackage.id)) throw new Error('La persona ya tiene ese paquete.');
  const name = guestName(guest);
  const byId = indexById(lines);
  const own = lines.filter((l) => sameId(l.guestId, guest.id));
  const accountOrder = [];
  for (const l of own) if (!accountOrder.some((id) => sameId(id, l.accountId))) accountOrder.push(l.accountId);
  const drafts = [];
  for (const accountId of accountOrder) {
    const s = liveAmount(own, guest.id, accountId, { skipVoluntary: true, byId });
    if (s <= 0) continue;
    drafts.push(lineDraft({
      eventId: event.id, accountId, guestId: guest.id, kind: 'cancelacion', amount: -s, date,
      description: `Cambio de paquete · ${name}`, origin: 'admin', reason,
    }));
  }
  if (guest.attendance === 'si') {
    const moved = { ...guest, packageId: newPackage.id };
    drafts.push(...chargeWithCoverage({ event, guest: moved, pkg: newPackage, hostAccount, date, prefix: pairPrefix }));
  }
  return drafts;
}

/* ---------------------------------------------------------------------------
 * 12. Dinero: pagos, reembolsos, reversos y correcciones (reglas 2, 15 y 17)
 * ------------------------------------------------------------------------ */

/**
 * Revisa la fecha efectiva de un pago o un reembolso: es la del movimiento
 * REAL, así que no puede ser posterior a hoy ni anterior a la creación del
 * evento. Devuelve el texto del error o null si está bien.
 */
export function moneyDateProblem(date, { today = todayCO(), event = null } = {}) {
  if (!date || !DATE_RE.test(String(date)) || addDays(date, 0) !== date) {
    return 'Escribe una fecha válida (AAAA-MM-DD).';
  }
  if (date > today) return 'La fecha no puede ser posterior a hoy: usa la fecha real del movimiento.';
  const created = isoToDateCO(event?.createdAt);
  if (created && date < created) {
    const [y, m, d] = created.split('-');
    return `La fecha no puede ser anterior a la creación del evento (${d}/${m}/${y}).`;
  }
  return null;
}

/**
 * Línea de pago (regla 17): pago −monto. El organizador NUNCA registra
 * dinero; esto lo usan el admin (transferencia verificada), la simulación
 * del demo (origin 'demo') y, en producción, el webhook ('pasarela').
 * Si el monto supera el saldo, exige allowCredit (genera saldo a favor).
 */
export function paymentDraft({ event, account, computed, amount, date, method = 'transferencia', reference = null, origin = 'admin', allowCredit = false, description }) {
  assertInt(amount, 'El pago');
  if (amount <= 0) throw new Error('El pago debe ser mayor que cero.');
  if (!PAYMENT_METHODS.includes(method)) throw new Error(`Método de pago no válido: ${method}`);
  if (!allowCredit && amount > Math.max(0, computed.saldo)) {
    throw new Error('El pago supera el saldo. Márcalo como «genera saldo a favor» si es correcto.');
  }
  return lineDraft({
    eventId: event.id, accountId: account.id, kind: 'pago', amount: -amount, date,
    description: description || (origin === 'demo' ? 'Pago aprobado (simulación del demo)' : 'Pago recibido'),
    origin, method, reference,
  });
}

/**
 * Reembolso (regla 15): solo si SALDO < 0 y por máximo −SALDO. Lleva
 * método, referencia del comprobante y motivo.
 */
export function refundDraft({ event, account, computed, amount, date, method = 'transferencia', reference, reason }) {
  assertInt(amount, 'El reembolso');
  if (!(computed.saldo < 0)) throw new Error('La cuenta no tiene saldo a favor.');
  if (amount <= 0 || amount > -computed.saldo) throw new Error(`El reembolso debe estar entre $ 1 y ${pesos(-computed.saldo)}.`);
  if (!PAYMENT_METHODS.includes(method)) throw new Error(`Método no válido: ${method}`);
  if (!reference) throw new Error('El reembolso necesita la referencia del comprobante.');
  if (!reason) throw new Error('El reembolso necesita un motivo.');
  return lineDraft({
    eventId: event.id, accountId: account.id, kind: 'reembolso', amount, date,
    description: 'Reembolso de saldo a favor', origin: 'admin', method, reference, reason,
  });
}

/**
 * Reverso de pasarela (producción, regla 15): reverso_pago +monto. La cuenta
 * vuelve a deber. Se deja aquí para que el servidor use la misma regla.
 */
export function paymentReversalDraft({ paymentLine, date, reason = 'Reverso de la pasarela' }) {
  if (paymentLine.kind !== 'pago') throw new Error('Solo se reversa una línea de pago.');
  return lineDraft({
    eventId: paymentLine.eventId, accountId: paymentLine.accountId, kind: 'reverso_pago', amount: -paymentLine.amount, date,
    description: 'Reverso del pago', origin: 'pasarela', method: paymentLine.method, reference: paymentLine.reference,
    correctsId: paymentLine.id ?? null, reason,
  });
}

/**
 * Corrección de un movimiento (regla 2): una línea del MISMO kind y signo
 * contrario, con correctsId y reason obligatorio.
 *   - Si la línea es parte de un par (cobertura o aporte), se corrige también
 *     su pareja para que el evento siga cuadrando.
 *   - Si es un CARGO por regla de paquete, se corrige con su cobertura
 *     (mismo chargeGroup): si no, el anfitrión seguiría cubriendo a una
 *     persona sin cargo. Corregir solo la cobertura deja el cargo vivo.
 *   - La corrección CONSERVA el origin de la línea corregida ('aporte',
 *     'pasarela'...): así cancellationQuote, el cambio de paquete y reconcile
 *     la reconocen. El autor queda en createdBy y la marca de corrección es
 *     correctsId.
 * No se corrige dos veces ni se corrige una corrección. Tampoco se corrige
 * un cargo, una cobertura o un aporte que una cancelación (o un cambio de
 * paquete) ya anuló o devolvió: habría que corregir primero esa cancelación.
 */
export function correctionDrafts({ lines, lineId, reason, date }) {
  if (!reason || !String(reason).trim()) throw new Error('La corrección necesita un motivo.');
  const original = lines.find((l) => sameId(l.id, lineId));
  if (!original) throw new Error('No encuentro el movimiento a corregir.');
  if (original.correctsId != null) throw new Error('Ese movimiento ya es una corrección; corrige el original.');
  const corrected = correctedIds(lines);
  if (corrected.has(String(original.id))) throw new Error('Ese movimiento ya fue corregido.');
  const byId = indexById(lines);

  // Qué se corrige: la línea, su pareja y, si es un cargo, su cobertura.
  const targets = [original];
  const include = (l) => {
    if (targets.some((t) => sameId(t.id, l.id))) return;
    if (l.correctsId != null || corrected.has(String(l.id))) return; // ya corregida: se salta
    targets.push(l);
  };
  if (original.pairId) for (const l of lines) if (l.pairId === original.pairId) include(l);
  if (original.kind === 'cargo' && original.chargeGroup) {
    for (const l of lines) if (l.chargeGroup === original.chargeGroup) include(l);
  }

  // Cargos y coberturas por regla: nada de corregir lo que una cancelación
  // o un cambio de paquete (líneas 'cancelacion' posteriores) ya anuló.
  for (const t of targets) {
    const byRule = t.kind === 'cargo' || t.kind === 'descuento' || (t.kind === 'aporte_anfitrion' && !isVoluntaryLine(t, byId));
    if (!byRule || t.guestId == null) continue;
    const cancelledLater = lines.some((l) => l.kind === 'cancelacion' && l.correctsId == null && !corrected.has(String(l.id))
      && sameId(l.guestId, t.guestId) && sameId(l.accountId, t.accountId) && isLater(l, t));
    if (cancelledLater) {
      throw new Error('Ese movimiento ya quedó anulado por una cancelación o un cambio de paquete. Si hubo un error, corrige primero esa cancelación.');
    }
  }

  // Aportes voluntarios: la suma de la persona en cada cuenta no puede
  // cambiar de lado (un aporte ya devuelto por una cancelación no se
  // devuelve otra vez con una corrección).
  for (const t of targets) {
    if (!isVoluntaryLine(t, byId)) continue;
    const same = lines.filter((l) => isVoluntaryLine(l, byId) && sameId(l.guestId, t.guestId) && sameId(l.accountId, t.accountId));
    const first = same.reduce((a, b) => (isLater(a, b) ? b : a), same[0]);
    const side = Math.sign(first.amount);
    const now = same.reduce((s, l) => s + l.amount, 0);
    const delta = targets.filter((x) => sameId(x.guestId, t.guestId) && sameId(x.accountId, t.accountId)).reduce((s, x) => s - x.amount, 0);
    const after = now + delta;
    if ((side < 0 && after > 0) || (side > 0 && after < 0)) {
      throw new Error('Ese aporte ya se devolvió (por una cancelación o una corrección); no se puede corregir otra vez.');
    }
  }

  return targets.map((t) => lineDraft({
    eventId: t.eventId, accountId: t.accountId, guestId: t.guestId, kind: t.kind, amount: -t.amount, date,
    description: `Corrección: ${t.description}`, origin: t.origin || 'admin',
    pairId: t.pairId ? `${t.pairId}-corr` : null,
    chargeGroup: t.chargeGroup ? `${t.chargeGroup}-corr` : null,
    correctsId: t.id, reason: String(reason).trim(),
    method: t.method, reference: t.reference,
    thirdPartyPart: t.thirdPartyPart != null ? -t.thirdPartyPart : null,
    servicePart: t.servicePart != null ? -t.servicePart : null,
  }));
}

/* ---------------------------------------------------------------------------
 * 13. Totales del evento (regla 13) y F-03 (regla 18)
 * ------------------------------------------------------------------------ */

/**
 * Servicio CS Travel estimado del evento (regla 18): Σ servicePart de los
 * cargos (y descuentos) de personas ACTIVAS. Solo admin.
 */
export function serviceEstimate(lines, guests) {
  const active = new Set(guests.filter((g) => g.status !== 'cancelado').map((g) => String(g.id)));
  return lines
    .filter((l) => (l.kind === 'cargo' || l.kind === 'descuento') && l.servicePart != null && active.has(String(l.guestId)))
    .reduce((s, l) => s + l.servicePart, 0);
}

/**
 * % de servicio con el que se reparte cada pago de una cuenta al exportar
 * (regla 18): Σ servicePart activos ÷ Σ price de esos cargos. En la cuenta
 * anfitrión se usan las personas que cubre (por el guestId de sus líneas).
 */
export function servicePctFor(account, lines, guests) {
  const active = new Set(guests.filter((g) => g.status !== 'cancelado').map((g) => String(g.id)));
  let personIds;
  if (account.kind === 'anfitrion') {
    personIds = new Set(linesOf(lines, account.id).filter((l) => l.kind === 'aporte_anfitrion' && l.amount > 0).map((l) => String(l.guestId)));
  } else {
    personIds = new Set(guests.filter((g) => sameId(g.accountId, account.id)).map((g) => String(g.id)));
  }
  let service = 0;
  let price = 0;
  for (const l of lines) {
    if (!(l.kind === 'cargo' || l.kind === 'descuento') || !personIds.has(String(l.guestId)) || !active.has(String(l.guestId))) continue;
    price += l.amount;
    service += l.servicePart || 0;
  }
  return price > 0 ? service / price : 0;
}

/** Filas del libro para la contadora, con el reparto F-03 de cada pago. */
export function f03Rows({ lines, accounts, guests }) {
  const pctByAccount = new Map(accounts.map((a) => [String(a.id), servicePctFor(a, lines, guests)]));
  return lines.map((l) => {
    let thirdPartyPart = l.thirdPartyPart;
    let servicePart = l.servicePart;
    if (CAJA.includes(l.kind)) {
      const money = -l.amount;
      servicePart = Math.round(money * (pctByAccount.get(String(l.accountId)) || 0));
      thirdPartyPart = money - servicePart;
    }
    return { ...l, thirdPartyPart, servicePart, isPenalty: l.kind === 'penalidad' };
  });
}

/** Cuántas personas hay por respuesta (para el gráfico de Asistencia). */
function peopleCounts(accounts, guests) {
  const counts = { confirmadas: 0, noAsisten: 0, sinResponder: 0, canceladas: 0 };
  for (const account of accounts) {
    if (account.kind === 'anfitrion') continue;
    const own = guests.filter((g) => sameId(g.accountId, account.id));
    if (account.rsvp === 'confirmada') {
      for (const g of own) {
        if (g.status === 'cancelado') counts.canceladas += 1;
        else if (g.attendance === 'si') counts.confirmadas += 1;
        else if (g.attendance === 'no') counts.noAsisten += 1;
        else counts.sinResponder += 1;
      }
    } else if (account.rsvp === 'no_asiste') {
      counts.noAsisten += own.length || Number(account.seatsAllowed) || 0;
    } else {
      counts.sinResponder += own.length || Number(account.seatsAllowed) || 0;
    }
  }
  return counts;
}

/**
 * Meta de una cuenta a una fecha dada: la del último hito con fecha ≤ date.
 */
function targetAt(milestones, date) {
  let target = 0;
  for (const m of milestones) if (m.date <= date) target = m.target;
  return target;
}

/**
 * Metas del EVENTO: una fila por hito del plan (planHitos), con las fechas
 * de la tabla «Plan de pagos». La meta de cada cuenta en ese hito es la de
 * su propio plan (milestonesFor, mismo key), así que se recalcula sola.
 *   meta      = Σ meta de las cuentas en ese hito
 *   recaudado = Σ min(meta de la cuenta, lo que había pagado a esa fecha;
 *               si la fecha no ha llegado, lo pagado hasta hoy)
 *   falta     = Σ max(0, meta − PAGADO de hoy) · cuentas = cuántas no llegan
 * Las reservas NO son metas del evento: cada cuenta tiene la suya según el
 * día en que confirmó.
 */
export function eventMilestones({ event, computedList, lines = [], today = todayCO() }) {
  const hitos = planHitos(event);
  if (hitos.length === 0) return [];
  // Pagos de cada cuenta por fecha, para «recaudado a esa fecha».
  const payments = new Map();
  for (const l of lines) {
    if (!CAJA.includes(l.kind)) continue;
    const key = String(l.accountId);
    if (!payments.has(key)) payments.set(key, []);
    payments.get(key).push(l);
  }
  const paidBy = (accountId, date) => 0 - (payments.get(String(accountId)) || [])
    .filter((l) => l.date <= date).reduce((s, l) => s + l.amount, 0);

  return hitos.map((hito) => {
    const cut = hito.date < today ? hito.date : today;
    const row = { key: hito.key, label: hito.label, date: hito.date, pct: hito.pct, vencida: today > hito.date, daysLeft: daysBetween(today, hito.date), meta: 0, recaudado: 0, falta: 0, cuentas: 0 };
    for (const c of computedList) {
      const m = (c.milestones || []).find((x) => x.key === hito.key);
      const target = m ? m.target : 0;
      if (target <= 0) continue;
      row.meta += target;
      row.recaudado += Math.max(0, Math.min(target, paidBy(c.accountId, cut)));
      const gap = Math.max(0, target - c.pagado);
      if (gap > 0) {
        row.falta += gap;
        row.cuentas += 1;
      }
    }
    row.pctRecaudado = row.meta > 0 ? row.recaudado / row.meta : 1;
    return row;
  });
}

/**
 * Próxima meta del evento (Inicio: «Próxima meta · 15 oct · faltan $X en N
 * cuentas», y alerta «meta en 7 días con recaudo menor al 80 %»): el primer
 * hito del plan que todavía no vence.
 * Se mide SOLO lo que no está vencido. Para cada cuenta:
 *   tramo     = meta del hito − meta que ya venció (metaAHoy)
 *   avance    = lo pagado por encima de metaAHoy, hasta el tramo
 *   pendiente = tramo − avance
 * Lo vencido ya sale en «Vencido hoy» y en los estados «Atrasado»; contarlo
 * aquí otra vez haría saltar la alerta de meta baja por cuentas atrasadas.
 *   falta = Σ pendiente · cuentas = con pendiente > 0 · pct = Σ avance ÷ Σ tramo
 *   faltaTotal = falta + lo vencido de esas cuentas (por si la vista lo quiere).
 */
function nextEventMilestone(rows, computedList, today) {
  const row = rows.find((r) => !r.vencida);
  if (!row) return null;
  let tramo = 0;
  let avance = 0;
  let falta = 0;
  let cuentas = 0;
  let faltaTotal = 0;
  for (const c of computedList) {
    const m = (c.milestones || []).find((x) => x.key === row.key);
    const target = m ? m.target : 0;
    if (target <= 0) continue;
    const base = Math.min(c.metaAHoy || 0, target);
    const t = target - base;
    const a = Math.min(t, Math.max(0, c.pagado - base));
    tramo += t;
    avance += a;
    if (t - a > 0) {
      falta += t - a;
      cuentas += 1;
    }
    faltaTotal += Math.max(0, target - c.pagado);
  }
  return {
    key: row.key,
    label: row.label,
    date: row.date,
    daysLeft: daysBetween(today, row.date),
    falta,
    cuentas,
    meta: tramo,
    cubierto: avance,
    pct: tramo > 0 ? avance / tramo : 1,
    faltaTotal,
  };
}

/**
 * Serie mensual de recaudo real frente a la meta (acumulados), desde el mes
 * de publicación hasta el mes de hoy o del viaje (el más tardío).
 */
export function collectionSeries({ event, computedList, lines, today = todayCO() }) {
  const start = (isoToDateCO(event.publishedAt) || isoToDateCO(event.createdAt) || today).slice(0, 7);
  const lastLine = (lines || []).map((l) => l.date).filter(Boolean).sort().pop() || today;
  const end = [today, event.startDate || today, lastLine].sort().pop().slice(0, 7);
  const months = [];
  let [y, m] = start.split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= end && months.length < 60) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  let acumulado = 0;
  return months.map((month) => {
    const pagadoMes = 0 - (lines || []).filter((l) => CAJA.includes(l.kind) && String(l.date).startsWith(month)).reduce((s, l) => s + l.amount, 0);
    acumulado += pagadoMes;
    const last = endOfMonth(`${month}-01`);
    const metaAcum = computedList.reduce((s, c) => s + targetAt(c.milestones, last), 0);
    return { month, pagadoMes, pagadoAcum: acumulado, metaAcum, futuro: `${month}-01` > today };
  });
}

/**
 * Etapa del evento para el stepper: invitaciones -> confirmaciones -> pagos ->
 * viaje -> cierre.
 */
export function eventStage(event, accounts = [], today = todayCO()) {
  if (['finalizado', 'cancelado'].includes(event.status)) return 'cierre';
  if (event.endDate && today > event.endDate) return 'cierre';
  if (event.status === 'en_viaje' || (event.startDate && today >= event.startDate)) return 'viaje';
  const invitations = accounts.filter((a) => a.kind !== 'anfitrion');
  if (event.status === 'borrador' || invitations.length === 0) return 'invitaciones';
  const pending = invitations.filter((a) => ['sin_enviar', 'enviada', 'vista'].includes(a.rsvp));
  if (invitations.every((a) => a.rsvp === 'sin_enviar')) return 'invitaciones';
  const deadlinePassed = event.rsvpDeadline && today > event.rsvpDeadline;
  if (event.status === 'cerrado' || pending.length === 0 || deadlinePassed) return 'pagos';
  return 'confirmaciones';
}

/**
 * computeEvent: todas las cuentas del evento calculadas y los totales.
 *   VALOR        = Σ NETO de todas las cuentas (los aportes se anulan entre cuentas)
 *   RECAUDADO    = Σ PAGADO
 *   POR RECAUDAR = Σ max(0, SALDO)
 *   VENCIDO      = Σ EXIGIBLE
 *   SALDOS A FAVOR = Σ max(0, −SALDO)
 *   META A HOY   = Σ meta del último hito vencido de cada cuenta
 *   % AL DÍA     = invitaciones en al_dia/por_vencer/pagado/cubierto ÷
 *                  invitaciones con cargos (la cuenta anfitrión no cuenta)
 * Además: `milestones` (tabla «Plan de pagos», eventMilestones) y
 * `nextMilestone` (primer hito del plan sin vencer, sin contar lo vencido).
 * alerts.metaBaja: la próxima meta vence en 7 días o menos y su recaudo va
 * por debajo del 80 %.
 */
export function computeEvent({ event, accounts = [], guests = [], lines = [], today = todayCO() }) {
  const eventLines = lines.filter((l) => l.eventId == null || sameId(l.eventId, event.id));
  const eventAccounts = accounts.filter((a) => a.eventId == null || sameId(a.eventId, event.id));
  const eventGuests = guests.filter((g) => g.eventId == null || sameId(g.eventId, event.id));
  const computedList = eventAccounts.map((account) => computeAccount({ event, account, lines: eventLines, today }));
  const byId = new Map(computedList.map((c) => [String(c.accountId), c]));
  const host = computedList.find((c) => c.kind === 'anfitrion') || null;
  const invitations = computedList.filter((c) => c.kind !== 'anfitrion');

  const totals = {
    valor: 0, recaudado: 0, porRecaudar: 0, vencido: 0, saldosAFavor: 0, metaAHoy: 0,
  };
  for (const c of computedList) {
    totals.valor += c.neto;
    totals.recaudado += c.pagado;
    totals.porRecaudar += Math.max(0, c.saldo);
    totals.vencido += c.exigible;
    totals.saldosAFavor += Math.max(0, -c.saldo);
    totals.metaAHoy += c.metaAHoy;
  }
  const withCharges = invitations.filter((c) => c.status !== 'sin_cargos');
  const upToDate = withCharges.filter((c) => UP_TO_DATE_STATUSES.includes(c.status));
  totals.cuentasConCargos = withCharges.length;
  totals.cuentasAlDia = upToDate.length;
  totals.pctAlDia = withCharges.length ? upToDate.length / withCharges.length : 1;
  totals.pctRecaudado = totals.valor > 0 ? totals.recaudado / totals.valor : 0;

  const byStatus = Object.fromEntries(Object.keys(ACCOUNT_STATUS).map((k) => [k, 0]));
  for (const c of invitations) byStatus[c.status] += 1;

  const rsvp = { sin_enviar: 0, enviada: 0, vista: 0, confirmada: 0, no_asiste: 0 };
  for (const a of eventAccounts) if (a.kind !== 'anfitrion' && rsvp[a.rsvp] != null) rsvp[a.rsvp] += 1;
  const totalInvitations = eventAccounts.filter((a) => a.kind !== 'anfitrion').length;

  const planRows = eventMilestones({ event, computedList, lines: eventLines, today });
  const next = nextEventMilestone(planRows, computedList, today);
  const alerts = {
    saldosAFavor: invitations.filter((c) => c.saldo < 0).map((c) => ({ accountId: c.accountId, displayName: c.displayName, aFavor: -c.saldo })),
    atrasadas30: invitations.filter((c) => c.status === 'atrasado' && c.diasAtraso > 30).map((c) => ({ accountId: c.accountId, displayName: c.displayName, diasAtraso: c.diasAtraso, exigible: c.exigible })),
    metaBaja: next && next.daysLeft <= DUE_SOON_DAYS && next.pct < 0.8 ? next : null,
  };
  if (host && host.saldo < 0) alerts.saldosAFavor.push({ accountId: host.accountId, displayName: host.displayName, aFavor: -host.saldo });

  return {
    eventId: event.id,
    today,
    daysToStart: event.startDate ? daysBetween(today, event.startDate) : null,
    stage: eventStage(event, eventAccounts, today),
    totals,
    accounts: computedList,
    byId,
    host,
    byStatus,
    rsvp,
    invitations: { total: totalInvitations, respondidas: rsvp.confirmada + rsvp.no_asiste },
    people: { ...peopleCounts(eventAccounts, eventGuests), cupo: Number(event.capacity) || 0 },
    milestones: planRows,
    nextMilestone: next,
    alerts,
    serviceEstimate: serviceEstimate(eventLines, eventGuests),
    series: collectionSeries({ event, computedList, lines: eventLines, today }),
  };
}

/* ---------------------------------------------------------------------------
 * 14. Quién ve qué (regla 19)
 * ------------------------------------------------------------------------ */

/**
 * Permisos de lectura según el rol.
 *   - 'admin': todo.
 *   - 'event' (organizador): totales y su cuenta anfitrión completa; de las
 *     demás cuentas, estado y días de atraso; montos solo si
 *     hostVisibility === 'montos'. Nunca costos de terceros, servicio ni
 *     notas del admin.
 *   - 'invitado': solo su propia cuenta.
 * `permission` (titular/colaborador/lectura) decide qué ACCIONES puede hacer
 * el organizador.
 */
export function visibleFor(role, hostVisibility = 'solo_estado', permission = 'lectura') {
  if (role === 'admin') {
    return {
      role, totals: true, hostAccount: true, otherAccounts: true, amounts: true, adminFields: true,
      adminNotes: true, organizerNotes: true, ownAccountOnly: false,
      can: { contribute: true, payHost: true, invite: true, remind: true, markConfirmed: true, registerMoney: true },
    };
  }
  if (role === 'event') {
    const amounts = hostVisibility === 'montos';
    return {
      role, totals: true, hostAccount: true, otherAccounts: true, amounts, adminFields: false,
      adminNotes: false, organizerNotes: true, ownAccountOnly: false,
      can: {
        contribute: permission === 'titular',
        payHost: permission === 'titular',
        invite: permission === 'titular' || permission === 'colaborador',
        remind: permission === 'titular' || permission === 'colaborador',
        markConfirmed: permission === 'titular' || permission === 'colaborador',
        registerMoney: false,
      },
    };
  }
  return {
    role: 'invitado', totals: false, hostAccount: false, otherAccounts: false, amounts: true, adminFields: false,
    adminNotes: false, organizerNotes: false, ownAccountOnly: true,
    can: { contribute: false, payHost: false, invite: false, remind: false, markConfirmed: false, registerMoney: false },
  };
}

const MONEY_KEYS = ['cuesta', 'cubierto', 'neto', 'pagado', 'saldo', 'aFavor', 'porPagar', 'exigible', 'metaAHoy', 'payment'];

/**
 * Deja de una cuenta calculada solo lo que `view` (de visibleFor) puede ver.
 * La cuenta anfitrión siempre se ve completa para el organizador.
 */
export function redactAccount(view, computed) {
  if (view.role === 'admin') return computed;
  if (computed.kind === 'anfitrion' && view.hostAccount) return computed;
  if (view.amounts) return computed;
  const out = { ...computed, amountsHidden: true };
  for (const key of MONEY_KEYS) delete out[key];
  out.milestones = (computed.milestones || []).map((m) => ({ key: m.key, label: m.label, date: m.date, state: m.state, vencida: m.vencida }));
  out.next = computed.next ? { key: computed.next.key, label: computed.next.label, date: computed.next.date, daysLeft: computed.next.daysLeft } : null;
  out.oldestUnmet = computed.oldestUnmet ? { date: computed.oldestUnmet.date } : null;
  return out;
}

/** Quita de un paquete lo que solo ve el admin (F-03). */
export function redactPackage(view, pkg) {
  if (view.adminFields) return pkg;
  const { thirdPartyCost: _t, serviceFee: _s, ...rest } = pkg;
  return rest;
}

/** Quita de una línea el reparto F-03 y, si no hay montos, la línea entera. */
export function redactLine(view, line, hostAccountId = null) {
  if (view.adminFields) return line;
  const { thirdPartyPart: _t, servicePart: _s, ...rest } = line;
  if (!view.amounts && !sameId(line.accountId, hostAccountId)) return null;
  return rest;
}

/** Quita de una cuenta (registro, no calculada) las notas que no le tocan. */
export function redactAccountRecord(view, account) {
  const out = { ...account };
  if (!view.adminNotes) delete out.adminNotes;
  if (!view.organizerNotes) delete out.organizerNotes;
  return out;
}

/** Actividad reciente: sin monto cuando el rol no ve montos de esa cuenta. */
export function redactLogEntry(view, entry, hostAccountId = null) {
  if (view.amounts || sameId(entry.accountId, hostAccountId)) return entry;
  const { amount: _a, ...rest } = entry;
  return rest;
}

/* ---------------------------------------------------------------------------
 * 15. Recordatorios (regla 20)
 * ------------------------------------------------------------------------ */

/**
 * ¿Se puede mandar otro recordatorio a esta cuenta? Tope: 1 cada 3 días
 * según lastReminderAt. Antes de ese plazo la vista debe pedir confirmación.
 */
export function reminderCheck(account, now = new Date()) {
  const last = account?.lastReminderAt ? Date.parse(account.lastReminderAt) : NaN;
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(last)) return { allowed: true, lastAt: null, nextAt: null, hoursLeft: 0 };
  const nextMs = last + REMINDER_GAP_HOURS * 60 * 60 * 1000;
  return {
    allowed: nowMs >= nextMs,
    lastAt: account.lastReminderAt,
    nextAt: new Date(nextMs).toISOString(),
    hoursLeft: Math.max(0, Math.ceil((nextMs - nowMs) / (60 * 60 * 1000))),
  };
}

/* ---------------------------------------------------------------------------
 * 16. Plan y validaciones del asistente
 * ------------------------------------------------------------------------ */

/**
 * Genera N metas mensuales hasta `until` (inclusive), con % acumulado parejo
 * y la última en 100. Las fechas quedan en el mismo día del mes de `until`
 * (o el último día del mes si ese día no existe).
 */
export function generateMonthlyHitos({ n, until }) {
  const count = Math.max(1, Math.floor(n));
  const [y, m, d] = until.split('-').map(Number);
  const hitos = [];
  for (let i = 0; i < count; i += 1) {
    const back = count - 1 - i;
    let month = m - back;
    let year = y;
    while (month < 1) { month += 12; year -= 1; }
    const last = Number(endOfMonth(`${year}-${String(month).padStart(2, '0')}-01`).slice(8));
    const date = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
    const pct = i === count - 1 ? 100 : Math.round(((i + 1) * 100) / count);
    hitos.push({ key: `hito${i + 1}`, label: `Pago ${i + 1} de ${count}`, date, pct });
  }
  return hitos;
}

/**
 * Validaciones del asistente de evento (se muestran con shakeError):
 *   - los % de las metas van en aumento y el último es 100;
 *   - las fechas de las metas van en aumento;
 *   - la última meta es al menos 15 días antes del viaje;
 *   - el precio de cada paquete es ≥ al costo de terceros;
 *   - los tramos de cancelación tienen días distintos y % entre 0 y 100.
 * @returns {string[]} lista de errores en español (vacía si todo está bien).
 */
export function validateEventSetup({ plan = {}, packages = [], startDate, endDate, cancellationTiers = [] }) {
  const errors = [];
  const hitos = plan.hitos || [];
  if (hitos.length === 0) errors.push('Agrega al menos una meta de pago.');
  for (let i = 1; i < hitos.length; i += 1) {
    if (!(Number(hitos[i].pct) > Number(hitos[i - 1].pct))) errors.push('Los porcentajes de las metas deben ir en aumento.');
    if (!(hitos[i].date > hitos[i - 1].date)) errors.push('Las fechas de las metas deben ir en orden.');
  }
  if (hitos.length && Number(hitos[hitos.length - 1].pct) !== 100) errors.push('La última meta debe ser el 100 %.');
  if (hitos.length && startDate && daysBetween(hitos[hitos.length - 1].date, startDate) < LAST_MILESTONE_MIN_DAYS) {
    errors.push(`La última meta debe ser al menos ${LAST_MILESTONE_MIN_DAYS} días antes del viaje.`);
  }
  if (startDate && endDate && endDate < startDate) errors.push('La fecha de regreso no puede ser antes de la salida.');
  if (plan.reserva) {
    if (plan.reserva.pct != null && (plan.reserva.pct <= 0 || plan.reserva.pct >= 100)) errors.push('El % de la reserva debe estar entre 1 y 99.');
    if (plan.reserva.amount != null && !(Number.isInteger(plan.reserva.amount) && plan.reserva.amount > 0)) errors.push('La reserva debe ser un valor entero mayor que cero.');
  }
  if (plan.minAbono != null && !(Number.isInteger(plan.minAbono) && plan.minAbono >= 0)) errors.push('El abono mínimo debe ser un valor entero.');
  if (packages.length === 0) errors.push('Agrega al menos un paquete.');
  for (const pkg of packages) {
    if (!Number.isInteger(pkg.price) || pkg.price <= 0) errors.push(`El precio de «${pkg.name}» debe ser un valor entero mayor que cero.`);
    else if (Number(pkg.thirdPartyCost) > pkg.price) errors.push(`El precio de «${pkg.name}» no puede ser menor que el costo de terceros.`);
    if (pkg.hostCoversType === 'pct' && (pkg.hostCoversValue < 0 || pkg.hostCoversValue > 100)) errors.push(`La cobertura de «${pkg.name}» debe estar entre 0 y 100 %.`);
  }
  const days = cancellationTiers.map((t) => t.minDays);
  if (new Set(days).size !== days.length) errors.push('Cada tramo de cancelación debe tener días distintos.');
  if (cancellationTiers.some((t) => t.pct < 0 || t.pct > 100)) errors.push('El % de cada tramo debe estar entre 0 y 100.');
  return [...new Set(errors)];
}

/* ---------------------------------------------------------------------------
 * 17. Conciliación (regla 21, producción)
 * ------------------------------------------------------------------------ */

/**
 * Σ(pago) − Σ(reverso_pago) del libro debe ser igual a la suma de las
 * PaymentOrders pagadas del evento, y cada orden pagada tiene UNA línea pago
 * VIVA (id 'pay:<orderId>' o reference = orderId). Las correcciones conservan
 * el origin 'pasarela', así que entran en la suma; una línea pago corregida
 * deja de contar como la línea de su orden.
 */
export function reconcile(lines, paidOrders = []) {
  const corrected = correctedIds(lines);
  const pagos = lines.filter((l) => l.kind === 'pago' && l.origin === 'pasarela');
  const reversos = lines.filter((l) => l.kind === 'reverso_pago');
  const ledgerTotal = -pagos.reduce((s, l) => s + l.amount, 0) - reversos.reduce((s, l) => s + l.amount, 0);
  const ordersTotal = paidOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const livePagos = pagos.filter((l) => l.correctsId == null && !corrected.has(String(l.id)));
  const diffs = [];
  for (const order of paidOrders) {
    const matches = livePagos.filter((l) => String(l.id) === `pay:${order.id}` || String(l.reference) === String(order.id));
    if (matches.length !== 1) diffs.push({ orderId: order.id, lineas: matches.length });
  }
  return { ok: ledgerTotal === ordersTotal && diffs.length === 0, ledgerTotal, ordersTotal, diffs };
}
