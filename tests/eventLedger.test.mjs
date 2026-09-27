// eventLedger.test.mjs
// =============================================================================
// Pruebas de la contabilidad de Eventos (src/utils/eventLedger.js) con node:test.
//   npm test        (node --test tests/)
//
// 1) Cuentas vitrina de la semilla: se generan con buildEventSeed() (el mismo
//    código que escribe db.json) y se calculan al 26 de septiembre de 2026.
//    Las cifras esperadas salen de la especificación (sección SEMILLA).
// 2) Casos de borde de las reglas: aporte con saldo a favor, reparto 'total'
//    que cuadra al peso, cancelación por tramos, cambio de paquete,
//    correcciones, reembolsos y privacidad.
// 3) src/services/eventService.js con un apiService EN MEMORIA (sección 6):
//    doble confirmación, fechas de pagos, textos de WhatsApp, etc.
//    eventService importa apiService/authService/env, que necesitan el
//    navegador y Vite; un gancho de resolución de Node (registerHooks) los
//    cambia SOLO para eventService.js por módulos de prueba.
// =============================================================================

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as L from '../src/utils/eventLedger.js';
import * as T from '../src/utils/eventTemplates.js';
import { buildEventSeed, SEED_TODAY, EVENT_COLLECTIONS } from '../scripts/semilla-eventos.mjs';

/* ---------------------------------------------------------------------------
 * apiService en memoria para eventService (mismo contrato que
 * localApiAdapter: filtros por igualdad, ids numéricos, copias profundas y
 * una pausa corta en cada llamada para que dos operaciones se crucen).
 * ------------------------------------------------------------------------ */

function createMemoryApi() {
  let db = {};
  const copy = (value) => structuredClone(value);
  const pause = () => new Promise((resolve) => setTimeout(resolve, 1));
  const notFound = (resource, id) => new Error(`Error 404 (Not Found) al consultar /${resource}/${id}`);
  const find = (resource, id) => (db[resource] || []).findIndex((item) => String(item.id) === String(id));
  return {
    reset(data) { db = copy(data); },
    get data() { return db; },
    async get(resource, query = {}) {
      await pause();
      const entries = Object.entries(query);
      const items = (db[resource] || []).filter((item) => entries.every(([k, v]) => String(item[k]) === String(v)));
      return copy(items);
    },
    async getById(resource, id) {
      await pause();
      const index = find(resource, id);
      if (index < 0) throw notFound(resource, id);
      return copy(db[resource][index]);
    },
    async post(resource, data) {
      await pause();
      const items = db[resource] || (db[resource] = []);
      const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
      const record = { ...copy(data), id };
      items.push(record);
      return copy(record);
    },
    async patch(resource, id, data) {
      await pause();
      const index = find(resource, id);
      if (index < 0) throw notFound(resource, id);
      db[resource][index] = { ...db[resource][index], ...copy(data), id: db[resource][index].id };
      return copy(db[resource][index]);
    },
    async put(resource, id, data) {
      await pause();
      const index = find(resource, id);
      if (index < 0) throw notFound(resource, id);
      db[resource][index] = { ...copy(data), id: db[resource][index].id };
      return copy(db[resource][index]);
    },
    async remove(resource, id) {
      await pause();
      const index = find(resource, id);
      if (index < 0) throw notFound(resource, id);
      db[resource].splice(index, 1);
      return null;
    },
  };
}

const memoryApi = createMemoryApi();
globalThis.__eventServiceTest = { api: memoryApi };

const SERVICE_MOCKS = {
  './apiService.js': 'export const apiService = globalThis.__eventServiceTest.api;',
  './authService.js': 'export const authService = { getSession: () => null };',
  '../utils/env.js': 'export function isDeployedBundle() { return false; }',
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL && context.parentURL.endsWith('/src/services/eventService.js') && SERVICE_MOCKS[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(SERVICE_MOCKS[specifier])}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const here = path.dirname(fileURLToPath(import.meta.url));
const TODAY = SEED_TODAY; // '2026-09-26'
const seed = buildEventSeed();

/* ---------------------------------------------------------------------------
 * Ayudantes
 * ------------------------------------------------------------------------ */

const eventById = (id) => seed.events.find((e) => e.id === id);
const accountsOf = (eventId) => seed.eventAccounts.filter((a) => a.eventId === eventId);
const guestsOf = (eventId) => seed.eventGuests.filter((g) => g.eventId === eventId);
const linesOfEvent = (eventId) => seed.eventLedger.filter((l) => l.eventId === eventId);
const accountNamed = (eventId, name) => {
  const account = accountsOf(eventId).find((a) => a.displayName === name);
  assert.ok(account, `No encontré la cuenta «${name}» en el evento ${eventId}`);
  return account;
};
const hostOf = (eventId) => accountsOf(eventId).find((a) => a.kind === 'anfitrion');
const calc = (eventId, name, today = TODAY) => L.computeAccount({
  event: eventById(eventId), account: accountNamed(eventId, name), lines: linesOfEvent(eventId), today,
});
const calcHost = (eventId, today = TODAY) => L.computeAccount({
  event: eventById(eventId), account: hostOf(eventId), lines: linesOfEvent(eventId), today,
});
const summary = (eventId, today = TODAY) => L.computeEvent({
  event: eventById(eventId), accounts: seed.eventAccounts, guests: seed.eventGuests, lines: seed.eventLedger, today,
});
const targets = (c) => c.milestones.map((m) => m.target);

/** Evento mínimo para casos de borde (plan tipo promoción). */
function miniEvent(overrides = {}) {
  return {
    id: 99,
    type: 'promocion',
    hostDisplayName: 'Fondo de prueba',
    startDate: '2026-12-02',
    endDate: '2026-12-06',
    status: 'abierto',
    hostVisibility: 'montos',
    publishedAt: '2026-02-01T15:00:00.000Z',
    plan: {
      reserva: { amount: 300000, dueDays: 7 },
      hitos: [
        { key: 'm30', label: '30 %', date: '2026-06-30', pct: 30 },
        { key: 'm60', label: '60 %', date: '2026-08-31', pct: 60 },
        { key: 'total', label: 'Total', date: '2026-11-01', pct: 100 },
      ],
      minAbono: 100000,
    },
    cancellationTiers: [{ minDays: 90, pct: 0 }, { minDays: 60, pct: 20 }, { minDays: 30, pct: 50 }, { minDays: 0, pct: 100 }],
    ...overrides,
  };
}

/** Libro en memoria: agrega borradores con id incremental. */
function ledger(initial = []) {
  const lines = [...initial];
  return {
    lines,
    add(drafts) {
      for (const d of drafts) lines.push({ ...d, id: lines.length + 1 });
      return lines;
    },
  };
}

/* ---------------------------------------------------------------------------
 * 1. Semilla: determinismo y estructura
 * ------------------------------------------------------------------------ */

describe('semilla determinista', () => {
  test('dos corridas producen exactamente lo mismo', () => {
    assert.deepEqual(buildEventSeed(), buildEventSeed());
  });

  test('el script no usa Math.random ni Date.now', () => {
    const source = fs.readFileSync(path.join(here, '..', 'scripts', 'semilla-eventos.mjs'), 'utf8');
    const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.ok(!/Math\.random\(/.test(code), 'usa Math.random');
    assert.ok(!/Date\.now\(/.test(code), 'usa Date.now');
  });

  test('ids únicos, accessCode EVT-XXXXXX únicos y montos enteros', () => {
    for (const name of EVENT_COLLECTIONS) {
      const ids = seed[name].map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, `ids repetidos en ${name}`);
    }
    const codes = seed.eventAccounts.map((a) => a.accessCode);
    assert.equal(new Set(codes).size, codes.length);
    for (const code of codes) assert.match(code, /^EVT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    for (const line of seed.eventLedger) {
      assert.ok(Number.isInteger(line.amount), `monto no entero en la línea ${line.id}`);
      assert.ok(L.LEDGER_KINDS.includes(line.kind));
    }
  });

  test('las coberturas y los aportes se anulan: VALOR = Σ COBRO de cada evento', () => {
    for (const event of seed.events) {
      const lines = linesOfEvent(event.id);
      const cobertura = lines.filter((l) => l.kind === 'aporte_anfitrion').reduce((s, l) => s + l.amount, 0);
      assert.equal(cobertura, 0, `las coberturas del evento ${event.id} no suman cero`);
      const cobro = lines.filter((l) => L.COBRO.includes(l.kind)).reduce((s, l) => s + l.amount, 0);
      assert.equal(summary(event.id).totals.valor, cobro);
    }
  });

  test('db.json tiene las 6 colecciones y los 3 organizadores (rol event)', () => {
    const db = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'data', 'db.json'), 'utf8'));
    for (const name of EVENT_COLLECTIONS) assert.ok(Array.isArray(db[name]) && db[name].length > 0, `falta ${name} en db.json`);
    for (const email of ['laura@bodalauraandres.co', 'patricia.diaz@promo11.co', 'luisa.ortiz@techglobal.com']) {
      const user = db.users.find((u) => u.email === email);
      assert.ok(user, `falta el usuario ${email}`);
      assert.equal(user.role, 'event');
      assert.equal(user.firstLoginRequired, false);
      assert.ok(user.password, 'el organizador necesita la contraseña de prueba');
    }
    const organizerIds = db.users.filter((u) => u.role === 'event').map((u) => u.id);
    for (const event of db.events) {
      assert.ok(event.organizers.every((o) => organizerIds.includes(o.userId)), `organizador inexistente en el evento ${event.id}`);
    }
  });
});

/* ---------------------------------------------------------------------------
 * 2. Evento 1 · Promoción
 * ------------------------------------------------------------------------ */

describe('evento 1 · promoción (cuentas vitrina)', () => {
  test('datos del evento', () => {
    const e = eventById(1);
    assert.equal(e.type, 'promocion');
    assert.equal(e.status, 'cerrado');
    assert.equal(e.hostVisibility, 'montos');
    assert.equal(e.capacity, 34);
    assert.equal(summary(1).daysToStart, 67);
  });

  test('fondo de la promoción: neto 13.280.000, pagado 9.750.000, al día, le faltan 1.538.000 al 15 oct', () => {
    const c = calcHost(1);
    assert.equal(c.displayName, 'Fondo de la promoción 11°');
    assert.equal(c.neto, 13280000);
    assert.equal(c.pagado, 9750000);
    assert.equal(c.saldo, 3530000);
    assert.equal(c.status, 'al_dia');
    assert.equal(c.exigible, 0);
    assert.equal(c.next.date, '2026-10-15');
    assert.equal(c.next.falta, 1538000);
  });

  test('metas de un estudiante: 300.000 / 792.000 / 1.584.000 / 2.244.000 / 2.640.000', () => {
    const c = calc(1, 'Juan Gómez · 11A');
    assert.equal(c.neto, 2640000);
    assert.equal(c.cuesta, 2890000);
    assert.equal(c.cubierto, 250000);
    assert.deepEqual(targets(c), [300000, 792000, 1584000, 2244000, 2640000]);
  });

  test('Juan Gómez: pagó 1.600.000, al día, le faltan 644.000 al 15 oct', () => {
    const c = calc(1, 'Juan Gómez · 11A');
    assert.equal(c.pagado, 1600000);
    assert.equal(c.status, 'al_dia');
    assert.equal(c.exigible, 0);
    assert.equal(c.next.date, '2026-10-15');
    assert.equal(c.next.falta, 644000);
  });

  test('Sofía y Valentina: neto 5.280.000, pagó 3.000.000, atrasado 26 días, exigible 168.000', () => {
    const c = calc(1, 'Sofía y Valentina Pérez · 11B');
    assert.equal(c.neto, 5280000);
    assert.equal(c.pagado, 3000000);
    assert.equal(c.status, 'atrasado');
    assert.equal(c.diasAtraso, 26);
    assert.equal(c.metaAHoy, 3168000);
    assert.equal(c.exigible, 168000);
    assert.equal(c.statusLabel, 'Atrasado · 26 días');
  });

  test('Andrés Martínez: pagó 792.000, atrasado 26 días, exigible 792.000', () => {
    const c = calc(1, 'Andrés Martínez · 11A');
    assert.equal(c.pagado, 792000);
    assert.equal(c.status, 'atrasado');
    assert.equal(c.diasAtraso, 26);
    assert.equal(c.exigible, 792000);
  });

  test('Samuel Ortega: solo la reserva, atrasado 88 días, exigible 1.284.000', () => {
    const c = calc(1, 'Samuel Ortega · 11B');
    assert.equal(c.pagado, 300000);
    assert.equal(c.status, 'atrasado');
    assert.equal(c.diasAtraso, 88);
    assert.equal(c.exigible, 1284000);
    assert.equal(c.payment.suggested, 1284000);
  });

  test('Laura Castillo: pagó exactamente 1.584.000 y está al día', () => {
    const c = calc(1, 'Laura Castillo · 11A');
    assert.equal(c.pagado, 1584000);
    assert.equal(c.exigible, 0);
    assert.equal(c.status, 'al_dia');
  });

  test('Camila Rodríguez: pagó 2.890.000 de contado; el aporte la deja con saldo a favor de 250.000', () => {
    const c = calc(1, 'Camila Rodríguez · 11B');
    assert.equal(c.pagado, 2890000);
    assert.equal(c.neto, 2640000);
    assert.equal(c.saldo, -250000);
    assert.equal(c.aFavor, 250000);
    assert.equal(c.status, 'saldo_a_favor');
  });

  test('Mateo Herrera: cancelación del 20 % (73 días), penalidad 578.000 y saldo a favor 422.000', () => {
    const account = accountNamed(1, 'Mateo Herrera · 11A');
    const lines = linesOfEvent(1).filter((l) => l.accountId === account.id);
    assert.deepEqual(lines.filter((l) => l.kind === 'cancelacion').map((l) => l.amount), [-2890000]);
    assert.deepEqual(lines.filter((l) => l.kind === 'penalidad').map((l) => l.amount), [578000]);
    const c = calc(1, 'Mateo Herrera · 11A');
    assert.equal(c.neto, 578000);
    assert.equal(c.pagado, 1000000);
    assert.equal(c.saldo, -422000);
    assert.equal(c.status, 'saldo_a_favor');
    const guest = guestsOf(1).find((g) => g.accountId === account.id);
    assert.equal(guest.status, 'cancelado');
    // Su aporte volvió al fondo (par inverso con origin 'aporte').
    const hostReturn = linesOfEvent(1).filter((l) => l.accountId === hostOf(1).id && l.guestId === guest.id && l.origin === 'aporte');
    assert.equal(hostReturn.reduce((s, l) => s + l.amount, 0), 0);
    // Aparece en la Cola de trabajo como saldo a favor por reembolsar.
    assert.ok(summary(1).alerts.saldosAFavor.some((a) => a.accountId === account.id && a.aFavor === 422000));
    assert.equal(L.daysBetween('2026-09-20', eventById(1).startDate), 73);
  });

  test('relleno: 30 estudiantes activos (17 al día, 4 atrasados, 2 pagados en el relleno), docentes cubiertos, docsOk 25/5', () => {
    const s = summary(1);
    const students = guestsOf(1).filter((g) => g.audience === 'estudiante' && g.status === 'activo');
    assert.equal(students.length, 30);
    assert.deepEqual(
      students.reduce((o, g) => ({ ...o, [g.docsOk]: (o[g.docsOk] || 0) + 1 }), {}),
      { true: 25, false: 5 },
    );
    const vitrina = new Set(['Juan Gómez · 11A', 'Sofía y Valentina Pérez · 11B', 'Andrés Martínez · 11A', 'Samuel Ortega · 11B', 'Laura Castillo · 11A', 'Camila Rodríguez · 11B', 'Mateo Herrera · 11A']);
    const relleno = s.accounts.filter((c) => c.kind === 'invitacion' && c.groupTag !== 'Docentes' && !vitrina.has(c.displayName));
    assert.equal(relleno.length, 23);
    const count = (st) => relleno.filter((c) => c.status === st).length;
    assert.equal(count('al_dia'), 17);
    assert.equal(count('atrasado'), 4);
    assert.equal(count('pagado'), 2);
    for (const c of relleno.filter((x) => x.status === 'al_dia')) assert.ok(c.pagado >= 1584000 && c.pagado <= 2100000);
    for (const c of relleno.filter((x) => x.status === 'atrasado')) assert.ok(c.pagado >= 1200000 && c.pagado <= 1500000 && c.diasAtraso === 26);
    for (const c of relleno.filter((x) => x.status === 'pagado')) assert.equal(c.pagado, 2640000);
    const docentes = s.accounts.filter((c) => c.groupTag === 'Docentes');
    assert.deepEqual(docentes.map((c) => c.status), ['cubierto', 'cubierto']);
    assert.deepEqual(docentes.map((c) => c.displayName), ['Prof. Ricardo Peña', 'Prof. Ana Lucía Torres']);
  });

  test('totales del evento', () => {
    const s = summary(1);
    assert.equal(s.totals.saldosAFavor, 250000 + 422000);
    assert.equal(s.people.confirmadas, 32);
    assert.equal(s.people.canceladas, 1);
    assert.equal(s.totals.valor, s.accounts.reduce((sum, c) => sum + c.neto, 0));
    assert.equal(s.totals.recaudado, s.accounts.reduce((sum, c) => sum + c.pagado, 0));
    assert.equal(s.totals.vencido, s.accounts.reduce((sum, c) => sum + c.exigible, 0));
    // % de cuentas al día = (al_dia + por_vencer + pagado + cubierto) / invitaciones con cargos.
    assert.equal(s.totals.cuentasConCargos, 32);
    assert.equal(s.totals.cuentasAlDia, 19 + 2 + 2);
    assert.equal(s.nextMilestone.date, '2026-10-15');
  });
});

/* ---------------------------------------------------------------------------
 * 3. Evento 2 · Boda
 * ------------------------------------------------------------------------ */

describe('evento 2 · boda (cuentas vitrina)', () => {
  test('40 invitaciones: 31 confirmadas (86 personas), 5 no asisten, 2 enviadas y 2 vistas', () => {
    const s = summary(2);
    assert.equal(s.invitations.total, 40);
    assert.deepEqual(s.rsvp, { sin_enviar: 0, enviada: 2, vista: 2, confirmada: 31, no_asiste: 5 });
    assert.equal(s.people.confirmadas, 86);
    assert.equal(eventById(2).hostVisibility, 'solo_estado');
  });

  test('Laura & Andrés: cena 86 × 180.000 + padrinos 2.400.000 = 17.880.000; al día, faltan 3.940.000 al 15 dic', () => {
    const c = calcHost(2);
    const hostLines = linesOfEvent(2).filter((l) => l.accountId === hostOf(2).id);
    const cena = hostLines.filter((l) => l.origin === 'regla_paquete').reduce((s, l) => s + l.amount, 0);
    const padrinos = hostLines.filter((l) => l.origin === 'aporte').reduce((s, l) => s + l.amount, 0);
    assert.equal(cena, 86 * 180000);
    assert.equal(padrinos, 2400000);
    assert.equal(c.neto, 17880000);
    assert.equal(c.pagado, 5000000);
    assert.equal(c.status, 'al_dia');
    assert.equal(c.next.date, '2026-12-15');
    assert.equal(c.next.falta, 3940000);
  });

  test('Familia Pérez Gómez: cuesta 3.380.000, los novios cubren 540.000, le toca 2.840.000; pagó la reserva 568.000', () => {
    const c = calc(2, 'Familia Pérez Gómez');
    assert.equal(accountNamed(2, 'Familia Pérez Gómez').seatsAllowed, 4);
    assert.equal(c.cuesta, 3380000);
    assert.equal(c.cubierto, 540000);
    assert.equal(c.neto, 2840000);
    assert.equal(c.milestones[0].key, 'reserva');
    assert.equal(c.milestones[0].target, 568000);
    assert.equal(c.pagado, 568000);
    assert.equal(c.status, 'al_dia');
  });

  test('Tíos Mendoza: atrasado 15 días (reserva 480.000); los novios solo ven «Atrasado · 15 días»', () => {
    const c = calc(2, 'Tíos Mendoza');
    assert.equal(c.status, 'atrasado');
    assert.equal(c.diasAtraso, 15);
    assert.equal(c.exigible, 480000);
    const view = L.visibleFor('event', eventById(2).hostVisibility, 'titular');
    const seen = L.redactAccount(view, c);
    assert.equal(seen.statusLabel, 'Atrasado · 15 días');
    assert.equal(seen.diasAtraso, 15);
    for (const key of ['saldo', 'exigible', 'neto', 'pagado', 'cuesta', 'payment']) assert.equal(seen[key], undefined, `el organizador no debe ver ${key}`);
    assert.ok(seen.milestones.every((m) => m.target === undefined));
  });

  test('Carolina Vélez: por vencer, reserva de 240.000 el 1 de octubre', () => {
    const c = calc(2, 'Carolina Vélez');
    assert.equal(c.status, 'por_vencer');
    assert.equal(c.next.key, 'reserva');
    assert.equal(c.next.date, '2026-10-01');
    assert.equal(c.next.target, 240000);
    assert.equal(c.payment.suggested, 240000);
  });

  test('Padrinos Salcedo: cubiertos (1.200.000 de aporte por persona)', () => {
    const c = calc(2, 'Padrinos Jorge y Marta Salcedo');
    assert.equal(c.status, 'cubierto');
    assert.equal(c.neto, 0);
    const account = accountNamed(2, 'Padrinos Jorge y Marta Salcedo');
    const aportes = linesOfEvent(2).filter((l) => l.accountId === account.id && l.origin === 'aporte').map((l) => l.amount);
    assert.deepEqual(aportes, [-1200000, -1200000]);
  });

  test('Sebastián Llinás: pagado (1.200.000)', () => {
    const c = calc(2, 'Sebastián Llinás');
    assert.equal(c.status, 'pagado');
    assert.equal(c.pagado, 1200000);
  });

  test('Familia Ospina no asiste (3 cupos) y Familia Restrepo vio la invitación (4 cupos)', () => {
    const ospina = accountNamed(2, 'Familia Ospina');
    const restrepo = accountNamed(2, 'Familia Restrepo');
    assert.equal(ospina.rsvp, 'no_asiste');
    assert.equal(ospina.seatsAllowed, 3);
    assert.equal(restrepo.rsvp, 'vista');
    assert.equal(restrepo.seatsAllowed, 4);
    assert.equal(calc(2, 'Familia Ospina').status, 'sin_cargos');
  });

  test('relleno: 26 invitaciones (77 personas): 16 al día, 4 por vencer y 6 atrasadas', () => {
    const vitrina = new Set(['Familia Pérez Gómez', 'Tíos Mendoza', 'Carolina Vélez', 'Padrinos Jorge y Marta Salcedo', 'Sebastián Llinás']);
    const relleno = summary(2).accounts.filter((c) => c.kind === 'invitacion' && accountNamed(2, c.displayName).rsvp === 'confirmada' && !vitrina.has(c.displayName));
    assert.equal(relleno.length, 26);
    const people = guestsOf(2).filter((g) => relleno.some((c) => c.accountId === g.accountId) && g.attendance === 'si');
    assert.equal(people.length, 77);
    const count = (st) => relleno.filter((c) => c.status === st).length;
    assert.deepEqual([count('al_dia'), count('por_vencer'), count('atrasado')], [16, 4, 6]);
    for (const c of relleno.filter((x) => x.status === 'al_dia')) assert.ok(c.pagado >= c.milestones[0].target, 'al día con la reserva pagada');
  });
});

/* ---------------------------------------------------------------------------
 * 4. Evento 3 · Empresa
 * ------------------------------------------------------------------------ */

describe('evento 3 · empresa (cuentas vitrina)', () => {
  test('datos del evento: TechGlobal, código de origen y sin reserva', () => {
    const e = eventById(3);
    assert.equal(e.companyId, 2);
    assert.equal(e.originCode, 'CST-TECH-02');
    assert.equal(e.plan.reserva, null);
    const guests = guestsOf(3);
    assert.equal(guests.filter((g) => g.audience === 'colaborador').length, 25);
    assert.equal(guests.filter((g) => g.audience === 'acompanante').length, 9);
  });

  test('TechGlobal: 25 × 2.450.000 = 61.250.000; pagó 18.375.000; al día, faltan 24.500.000 al 15 oct', () => {
    const c = calcHost(3);
    assert.equal(c.neto, 61250000);
    assert.equal(c.pagado, 18375000);
    assert.equal(c.status, 'al_dia');
    assert.equal(c.next.date, '2026-10-15');
    assert.equal(c.next.falta, 24500000);
  });

  test('Carlos Ruiz: pagó 630.000 y está al día', () => {
    const c = calc(3, 'Carlos Ruiz · Comercial');
    assert.equal(c.neto, 2100000);
    assert.equal(c.pagado, 630000);
    assert.equal(c.status, 'al_dia');
  });

  test('Diana Morales: sin pagos, atrasado 11 días (630.000)', () => {
    const c = calc(3, 'Diana Morales · Comercial');
    assert.equal(c.status, 'atrasado');
    assert.equal(c.diasAtraso, 11);
    assert.equal(c.exigible, 630000);
  });

  test('Felipe Andrade: cubierto; Natalia Rey: pagado (2.100.000)', () => {
    assert.equal(calc(3, 'Felipe Andrade · Operaciones').status, 'cubierto');
    const n = calc(3, 'Natalia Rey · Mercadeo');
    assert.equal(n.status, 'pagado');
    assert.equal(n.pagado, 2100000);
  });

  test('relleno: 21 colaboradores; 6 con acompañante (4 al día, 1 atrasado, 1 pagado) y 15 cubiertos', () => {
    const vitrina = new Set(['Carlos Ruiz · Comercial', 'Diana Morales · Comercial', 'Felipe Andrade · Operaciones', 'Natalia Rey · Mercadeo']);
    const relleno = summary(3).accounts.filter((c) => c.kind === 'invitacion' && !vitrina.has(c.displayName));
    assert.equal(relleno.length, 21);
    const withCompanion = relleno.filter((c) => guestsOf(3).some((g) => g.accountId === c.accountId && g.audience === 'acompanante'));
    assert.equal(withCompanion.length, 6);
    const count = (list, st) => list.filter((c) => c.status === st).length;
    assert.deepEqual([count(withCompanion, 'al_dia'), count(withCompanion, 'atrasado'), count(withCompanion, 'pagado')], [4, 1, 1]);
    assert.equal(count(relleno, 'cubierto'), 15);
  });

  test('semáforo por persona: el colaborador cubierto 100 % muestra «cubierto» aunque su cuenta deba lo del acompañante', () => {
    const account = accountNamed(3, 'Diana Morales · Comercial');
    const c = calc(3, 'Diana Morales · Comercial');
    const [colaboradora, acompanante] = guestsOf(3).filter((g) => g.accountId === account.id);
    const lines = linesOfEvent(3);
    assert.deepEqual(L.personSemaphore(colaboradora, c, lines), { asistencia: 'si', pago: 'cubierto', documentos: 'completo' });
    assert.deepEqual(L.personSemaphore(acompanante, c, lines), { asistencia: 'si', pago: 'atrasado', documentos: 'faltan' });
  });
});

/* ---------------------------------------------------------------------------
 * 5. Reglas: casos de borde
 * ------------------------------------------------------------------------ */

describe('reglas de fechas y montos', () => {
  test('hoy en Colombia (UTC−5) e ISO a fecha', () => {
    assert.equal(L.todayCO(new Date('2026-09-27T03:00:00Z')), '2026-09-26');
    assert.equal(L.todayCO(new Date('2026-09-27T05:00:00Z')), '2026-09-27');
    assert.equal(L.isoToDateCO('2026-09-01T02:00:00.000Z'), '2026-08-31');
    assert.equal(L.isoToDateCO('2026-09-01'), '2026-09-01');
    assert.equal(L.daysBetween('2026-06-30', '2026-09-26'), 88);
    assert.equal(L.addDays('2026-12-28', 7), '2027-01-04');
  });

  test('ceil1000 y round1000 sin errores de coma flotante', () => {
    assert.equal(L.ceil1000(792000), 792000);
    assert.equal(L.ceil1000((2640000 * 30) / 100), 792000);
    assert.equal(L.ceil1000(567001), 568000);
    assert.equal(L.round1000(1234499), 1234000);
    assert.equal(L.round1000(1234500), 1235000);
  });

  test('una meta vence al terminar su día (hoy > fecha)', () => {
    const event = miniEvent();
    const account = { id: 1, kind: 'invitacion', confirmedAt: '2026-02-10T15:00:00.000Z' };
    const lines = [{ accountId: 1, kind: 'cargo', amount: 1000000, date: '2026-02-10' }];
    const on = L.computeAccount({ event, account, lines, today: '2026-08-31' });
    const after = L.computeAccount({ event, account, lines, today: '2026-09-01' });
    assert.equal(on.milestones.find((m) => m.key === 'm60').vencida, false);
    assert.equal(after.milestones.find((m) => m.key === 'm60').vencida, true);
    assert.equal(after.metaAHoy, 600000);
  });

  test('la fecha de un hito nunca es anterior a la reserva (max(fecha, R))', () => {
    const event = miniEvent();
    const account = { id: 1, kind: 'invitacion', confirmedAt: '2026-08-28T15:00:00.000Z' };
    const lines = [{ accountId: 1, kind: 'cargo', amount: 1000000, date: '2026-08-28' }];
    const c = L.computeAccount({ event, account, lines, today: '2026-09-01' });
    assert.deepEqual(c.milestones.map((m) => m.date), ['2026-09-04', '2026-09-04', '2026-09-04', '2026-11-01']);
    assert.equal(c.exigible, 0);
    assert.equal(c.status, 'por_vencer');
  });
});

describe('reglas 5 y 6: cargos al confirmar y coberturas', () => {
  const event = miniEvent({ id: 7 });
  const host = { id: 100, kind: 'anfitrion', displayName: 'Los novios' };
  const packages = [
    { id: 1, name: 'Adulto', price: 1380000, thirdPartyCost: 1230000, serviceFee: 150000, hostCoversType: 'fixed', hostCoversValue: 180000, hostCoversLabel: 'La cena' },
    { id: 2, name: 'Niño', price: 620000, thirdPartyCost: 560000, serviceFee: 60000, hostCoversType: 'pct', hostCoversValue: 33, hostCoversLabel: 'Una parte' },
  ];

  test('cobertura por tipo: none, pct 100, pct parcial (round1000) y fixed (tope en el precio)', () => {
    assert.equal(L.hostCoverageFor({ price: 1000000, hostCoversType: 'none' }), 0);
    assert.equal(L.hostCoverageFor({ price: 1000000, hostCoversType: 'pct', hostCoversValue: 100 }), 1000000);
    assert.equal(L.hostCoverageFor({ price: 620000, hostCoversType: 'pct', hostCoversValue: 33 }), 205000);
    assert.equal(L.hostCoverageFor({ price: 150000, hostCoversType: 'fixed', hostCoversValue: 180000 }), 150000);
  });

  test('la persona que no asiste no genera cargo; los pares cuadran; no se cobra dos veces', () => {
    const guests = [
      { id: 1, accountId: 5, firstName: 'Ana', lastName: 'Ruiz', packageId: 1, attendance: 'si', status: 'activo' },
      { id: 2, accountId: 5, firstName: 'Tomás', lastName: 'Ruiz', packageId: 2, attendance: 'si', status: 'activo' },
      { id: 3, accountId: 5, firstName: 'Luis', lastName: 'Ruiz', packageId: 1, attendance: 'no', status: 'activo' },
    ];
    const drafts = L.chargesOnConfirm({ event, guests, packages, hostAccount: host, date: '2026-09-01' });
    assert.equal(drafts.filter((d) => d.kind === 'cargo').length, 2);
    assert.equal(drafts.filter((d) => d.guestId === 3).length, 0);
    const pairs = drafts.filter((d) => d.kind === 'aporte_anfitrion');
    assert.equal(pairs.reduce((s, d) => s + d.amount, 0), 0);
    assert.deepEqual(pairs.filter((d) => d.accountId === host.id).map((d) => d.amount), [180000, 205000]);
    const charge = drafts.find((d) => d.kind === 'cargo' && d.guestId === 1);
    assert.equal(charge.thirdPartyPart, 1230000);
    assert.equal(charge.servicePart, 150000);
    // Confirmar otra vez con el libro ya cargado no genera nada nuevo.
    const again = L.chargesOnConfirm({ event, guests, packages, hostAccount: host, date: '2026-09-02', lines: drafts });
    assert.equal(again.length, 0);
    assert.equal(L.rsvpFromAttendance(guests), 'confirmada');
    assert.equal(L.rsvpFromAttendance(guests.map((g) => ({ ...g, attendance: 'no' }))), 'no_asiste');
  });

  test('sin paquete asignado, no se confirma', () => {
    assert.throws(() => L.chargesOnConfirm({ event, guests: [{ id: 9, accountId: 5, attendance: 'si', packageId: null }], packages, hostAccount: host, date: '2026-09-01' }), /paquete/);
  });
});

describe('regla 7: aportar', () => {
  test('reparto «total» por mayor residuo cuadra al peso', () => {
    assert.deepEqual(L.splitTotal(1000000, 3), [334000, 333000, 333000]);
    const parts = L.splitTotal(7751000, 31);
    assert.equal(parts.reduce((s, x) => s + x, 0), 7751000);
    assert.equal(parts.filter((x) => x === 251000).length, 1);
    assert.throws(() => L.splitTotal(1000500, 3), /múltiplo de 1.000/);
  });

  test('aporte en modo total sobre la promoción: suma exacta, primeros por id reciben el sobrante', () => {
    const event = eventById(1);
    const preview = L.contributionPreview({
      event, accounts: accountsOf(1), guests: guestsOf(1), lines: linesOfEvent(1),
      target: { groupTag: '11A' }, mode: 'total', amount: 1001000, today: TODAY,
    });
    assert.ok(preview.count > 0);
    assert.equal(preview.totalApplied, 1001000);
    assert.equal(preview.hostNetoDespues - preview.hostNetoAntes, 1001000);
    const ids = preview.recipients.map((r) => r.guestId);
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
    assert.ok(preview.recipients[0].applied >= preview.recipients[preview.recipients.length - 1].applied);
    // El docente (cuenta 'Docentes') y Mateo (cancelado) no reciben.
    assert.ok(preview.recipients.every((r) => guestsOf(1).find((g) => g.id === r.guestId).status === 'activo'));
  });

  test('aporte que deja saldo a favor: la vista previa lo avisa y la cuenta queda en saldo_a_favor', () => {
    const event = miniEvent({ id: 5 });
    const host = { id: 1, eventId: 5, kind: 'anfitrion', displayName: 'Fondo' };
    const paid = { id: 2, eventId: 5, kind: 'invitacion', displayName: 'Pagó todo', confirmedAt: '2026-02-10T15:00:00.000Z' };
    const owes = { id: 3, eventId: 5, kind: 'invitacion', displayName: 'Debe', confirmedAt: '2026-02-10T15:00:00.000Z' };
    const guests = [
      { id: 1, eventId: 5, accountId: 2, firstName: 'A', lastName: 'Uno', attendance: 'si', status: 'activo' },
      { id: 2, eventId: 5, accountId: 3, firstName: 'B', lastName: 'Dos', attendance: 'si', status: 'activo' },
    ];
    const book = ledger([
      { id: 1, eventId: 5, accountId: 2, guestId: 1, kind: 'cargo', amount: 1000000, date: '2026-02-10' },
      { id: 2, eventId: 5, accountId: 3, guestId: 2, kind: 'cargo', amount: 1000000, date: '2026-02-10' },
      { id: 3, eventId: 5, accountId: 2, guestId: null, kind: 'pago', amount: -1000000, date: '2026-02-11' },
    ]);
    const accounts = [host, paid, owes];
    const preview = L.contributionPreview({ event, accounts, guests, lines: book.lines, mode: 'por_persona', amount: 200000, today: '2026-09-01' });
    assert.equal(preview.totalApplied, 400000);
    assert.deepEqual(preview.accountsWithCredit.map((a) => a.accountId), [2]);
    assert.equal(preview.accountsWithCredit[0].aFavorDespues, 200000);
    book.add(L.applyContribution(preview, { event, hostAccount: host, guests, date: '2026-09-01' }));
    const c = L.computeAccount({ event, account: paid, lines: book.lines, today: '2026-09-01' });
    assert.equal(c.status, 'saldo_a_favor');
    assert.equal(c.saldo, -200000);
    assert.equal(L.computeAccount({ event, account: host, lines: book.lines, today: '2026-09-01' }).neto, 400000);
  });

  test('tope: una cuenta no recibe más que su NETO; el exceso no se aplica', () => {
    const event = miniEvent({ id: 6 });
    const host = { id: 1, kind: 'anfitrion', displayName: 'Empresa' };
    const acc = { id: 2, kind: 'invitacion', displayName: 'Barata', confirmedAt: '2026-02-10T15:00:00.000Z' };
    const guests = [{ id: 1, accountId: 2, attendance: 'si', status: 'activo', firstName: 'C', lastName: 'Tres' }];
    const lines = [{ id: 1, accountId: 2, guestId: 1, kind: 'cargo', amount: 150000, date: '2026-02-10' }];
    const preview = L.contributionPreview({ event, accounts: [host, acc], guests, lines, mode: 'por_persona', amount: 200000, today: '2026-09-01' });
    assert.equal(preview.totalApplied, 150000);
    assert.equal(preview.totalExcess, 50000);
    assert.equal(preview.recipients[0].excess, 50000);
  });
});

describe('regla 14: cancelación por tramos', () => {
  test('tramos de la promoción en sus bordes', () => {
    const tiers = eventById(1).cancellationTiers;
    const pct = (days) => L.cancellationTier(tiers, days).pct;
    assert.deepEqual([pct(120), pct(90), pct(89), pct(60), pct(59), pct(30), pct(29), pct(0), pct(-3)], [0, 0, 20, 20, 50, 50, 100, 100, 100]);
  });

  test('docente cubierto por regla: la penalidad le toca al anfitrión (tramo del 50 %)', () => {
    const event = eventById(1);
    const account = accountNamed(1, 'Prof. Ricardo Peña');
    const guest = guestsOf(1).find((g) => g.accountId === account.id);
    const quote = L.cancellationQuote({ event, guest, lines: linesOfEvent(1), hostAccount: hostOf(1), today: '2026-10-20', reason: 'Prueba' });
    assert.equal(quote.days, 43);
    assert.equal(quote.pct, 50);
    assert.equal(quote.returned, 0);
    assert.deepEqual(quote.perAccount.map((a) => [a.isHost, a.cancelacion, a.penalidad]), [[true, -2890000, 1445000]]);
    const lines = [...linesOfEvent(1), ...quote.lines.map((l, i) => ({ ...l, id: 10000 + i }))];
    const host = L.computeAccount({ event, account: hostOf(1), lines, today: '2026-10-20' });
    assert.equal(host.neto, 13280000 - 2890000 + 1445000);
    const teacher = L.computeAccount({ event, account, lines, today: '2026-10-20' });
    assert.equal(teacher.neto, 0);
  });

  test('estudiante con aporte: el aporte vuelve al fondo y la penalidad es sobre el paquete completo', () => {
    const event = eventById(1);
    const account = accountNamed(1, 'Juan Gómez · 11A');
    const guest = guestsOf(1).find((g) => g.accountId === account.id);
    const quote = L.cancellationQuote({ event, guest, lines: linesOfEvent(1), hostAccount: hostOf(1), today: TODAY });
    assert.equal(quote.pct, 20);
    assert.equal(quote.returned, 250000);
    assert.equal(quote.penaltyTotal, 578000);
    const lines = [...linesOfEvent(1), ...quote.lines.map((l, i) => ({ ...l, id: 20000 + i }))];
    const c = L.computeAccount({ event, account, lines, today: TODAY });
    assert.equal(c.neto, 578000);
    assert.equal(c.saldo, 578000 - 1600000);
    assert.throws(() => L.cancellationQuote({ event, guest: { ...guest, status: 'cancelado' }, lines, hostAccount: hostOf(1), today: TODAY }), /ya está cancelado/);
  });
});

describe('regla 16: cambio de paquete', () => {
  test('adulto → niño en la boda: cancela sin penalidad, cobra el nuevo y las metas se recalculan', () => {
    const event = eventById(2);
    const account = accountNamed(2, 'Familia Pérez Gómez');
    const guest = guestsOf(2).find((g) => g.accountId === account.id && g.audience === 'adulto');
    const nino = seed.eventPackages.find((p) => p.eventId === 2 && p.audience === 'nino');
    const before = calc(2, 'Familia Pérez Gómez');
    const drafts = L.packageChangeLines({ event, guest, newPackage: nino, lines: linesOfEvent(2), hostAccount: hostOf(2), date: TODAY });
    assert.ok(!drafts.some((d) => d.kind === 'penalidad'));
    assert.deepEqual(drafts.filter((d) => d.kind === 'cancelacion').map((d) => [d.accountId === account.id, d.amount, d.reason]), [
      [true, -1200000, 'cambio de paquete'],
      [false, -180000, 'cambio de paquete'],
    ]);
    const lines = [...linesOfEvent(2), ...drafts.map((l, i) => ({ ...l, id: 30000 + i }))];
    const after = L.computeAccount({ event, account, lines, today: TODAY });
    assert.equal(after.neto, before.neto - 1200000 + (620000 - 180000));
    assert.equal(after.milestones[0].target, L.ceil1000(after.neto * 0.2));
    const hostAfter = L.computeAccount({ event, account: hostOf(2), lines, today: TODAY });
    assert.equal(hostAfter.neto, calcHost(2).neto);
    assert.throws(() => L.packageChangeLines({ event, guest: { ...guest, packageId: nino.id }, newPackage: nino, lines, hostAccount: hostOf(2), date: TODAY }), /ya tiene/);
  });

  test('el cambio conserva los aportes voluntarios', () => {
    const event = eventById(1);
    const account = accountNamed(1, 'Juan Gómez · 11A');
    const guest = guestsOf(1).find((g) => g.accountId === account.id);
    const pricier = { id: 99, eventId: 1, name: 'Estudiante · habitación sencilla', price: 3190000, thirdPartyCost: 2790000, serviceFee: 400000, hostCoversType: 'none', hostCoversValue: 0 };
    const drafts = L.packageChangeLines({ event, guest, newPackage: pricier, lines: linesOfEvent(1), hostAccount: hostOf(1), date: TODAY });
    const lines = [...linesOfEvent(1), ...drafts.map((l, i) => ({ ...l, id: 40000 + i }))];
    const c = L.computeAccount({ event, account, lines, today: TODAY });
    assert.equal(c.neto, 3190000 - 250000);
    assert.equal(c.cubierto, 250000);
  });
});

describe('dinero: pagos, reembolsos y correcciones (reglas 2, 11, 15 y 17)', () => {
  test('cuota sugerida y rango de «otro valor»', () => {
    const juan = calc(1, 'Juan Gómez · 11A');
    assert.equal(juan.payment.suggested, 644000);
    assert.equal(juan.payment.min, 100000);
    assert.equal(juan.payment.max, 1040000);
    assert.equal(L.validatePaymentAmount(50000, juan.payment), 'El abono mínimo es de $ 100.000.');
    assert.equal(L.validatePaymentAmount(1040001, juan.payment), 'El valor no puede ser mayor al saldo ($ 1.040.000).');
    assert.equal(L.validatePaymentAmount(500000, juan.payment), null);
    assert.equal(calc(1, 'Camila Rodríguez · 11B').payment.canPay, false);
  });

  test('un pago mayor al saldo exige «genera saldo a favor»', () => {
    const event = eventById(3);
    const account = accountNamed(3, 'Carlos Ruiz · Comercial');
    const computed = calc(3, 'Carlos Ruiz · Comercial');
    assert.throws(() => L.paymentDraft({ event, account, computed, amount: 1500000, date: TODAY }), /saldo a favor/);
    const line = L.paymentDraft({ event, account, computed, amount: 1500000, date: TODAY, allowCredit: true, method: 'bold', origin: 'demo' });
    assert.equal(line.kind, 'pago');
    assert.equal(line.amount, -1500000);
    assert.equal(line.origin, 'demo');
    assert.throws(() => L.paymentDraft({ event, account, computed, amount: 100.5, date: TODAY }), /entero/);
  });

  test('reembolso: solo con saldo a favor y hasta ese valor', () => {
    const event = eventById(1);
    const account = accountNamed(1, 'Mateo Herrera · 11A');
    const computed = calc(1, 'Mateo Herrera · 11A');
    assert.throws(() => L.refundDraft({ event, account, computed, amount: 500000, date: TODAY, reference: 'TRF-1', reason: 'Cancelación' }), /entre/);
    assert.throws(() => L.refundDraft({ event, account, computed, amount: 422000, date: TODAY, reference: '', reason: 'x' }), /comprobante/);
    const line = L.refundDraft({ event, account, computed, amount: 422000, date: TODAY, reference: 'TRF-1', reason: 'Cancelación' });
    const lines = [...linesOfEvent(1), { ...line, id: 50000 }];
    const after = L.computeAccount({ event, account, lines, today: TODAY });
    assert.equal(after.saldo, 0);
    assert.equal(after.status, 'pagado');
    const noCredit = calc(1, 'Juan Gómez · 11A');
    assert.throws(() => L.refundDraft({ event, account, computed: noCredit, amount: 1, date: TODAY, reference: 'x', reason: 'x' }), /saldo a favor/);
  });

  test('corrección: mismo kind, signo contrario, con motivo; corrige el par completo y una sola vez', () => {
    const lines = linesOfEvent(2);
    const aporte = lines.find((l) => l.origin === 'aporte' && l.amount < 0);
    assert.throws(() => L.correctionDrafts({ lines, lineId: aporte.id, reason: '  ', date: TODAY }), /motivo/);
    const drafts = L.correctionDrafts({ lines, lineId: aporte.id, reason: 'Se aplicó a la cuenta equivocada', date: TODAY });
    assert.equal(drafts.length, 2);
    assert.ok(drafts.every((d) => d.kind === 'aporte_anfitrion' && d.correctsId != null && d.reason));
    assert.equal(drafts.reduce((s, d) => s + d.amount, 0), 0);
    const book = [...lines, ...drafts.map((d, i) => ({ ...d, id: 60000 + i }))];
    assert.throws(() => L.correctionDrafts({ lines: book, lineId: aporte.id, reason: 'otra vez', date: TODAY }), /ya fue corregido/);
    assert.throws(() => L.correctionDrafts({ lines: book, lineId: 60000, reason: 'x', date: TODAY }), /corrección/);
    const salcedo = accountNamed(2, 'Padrinos Jorge y Marta Salcedo');
    const after = L.computeAccount({ event: eventById(2), account: salcedo, lines: book, today: TODAY });
    assert.equal(after.neto, 1200000);
    // Confirmaron el 20 jul: la reserva (20 % = 240.000) venció el 30 jul y ahora sí la deben.
    assert.equal(after.status, 'atrasado');
    assert.equal(after.exigible, 240000);
    assert.equal(after.diasAtraso, 58);
    // La corrección conserva el origin de lo corregido (aquí 'aporte').
    assert.ok(drafts.every((d) => d.origin === 'aporte'));
  });

  /** Juan Gómez con su aporte de 250.000 ya corregido (libro en memoria). */
  function juanWithCorrectedAporte() {
    const event = eventById(1);
    const account = accountNamed(1, 'Juan Gómez · 11A');
    const guest = guestsOf(1).find((g) => g.accountId === account.id);
    const book = ledger(linesOfEvent(1));
    const aporte = book.lines.find((l) => l.accountId === account.id && l.kind === 'aporte_anfitrion' && l.origin === 'aporte');
    const drafts = L.correctionDrafts({ lines: book.lines, lineId: aporte.id, reason: 'Aporte aplicado por error', date: TODAY });
    drafts.forEach((d, i) => book.lines.push({ ...d, id: 70000 + i }));
    return { event, account, guest, book };
  }
  const netoOf = (event, account, lines) => L.computeAccount({ event, account, lines, today: TODAY }).neto;
  const valorOf = (eventId, lines) => L.computeEvent({ event: eventById(eventId), accounts: seed.eventAccounts, guests: seed.eventGuests, lines, today: TODAY }).totals.valor;

  test('corregir un aporte y luego cancelar: el aporte no se devuelve otra vez', () => {
    const { event, account, guest, book } = juanWithCorrectedAporte();
    assert.equal(netoOf(event, hostOf(1), book.lines), 13030000);
    const quote = L.cancellationQuote({ event, guest, lines: book.lines, hostAccount: hostOf(1), today: TODAY, reason: 'Prueba' });
    assert.equal(quote.returned, 0);
    assert.equal(quote.penaltyTotal, 578000);
    const lines = [...book.lines, ...quote.lines.map((l, i) => ({ ...l, id: 71000 + i }))];
    assert.equal(netoOf(event, hostOf(1), lines), 13030000);
    assert.equal(netoOf(event, account, lines), 578000);
  });

  test('corregir un aporte y luego cambiar de paquete: NETO 2.890.000 y el VALOR del evento no cambia', () => {
    const { event, account, guest, book } = juanWithCorrectedAporte();
    const valorAntes = valorOf(1, linesOfEvent(1));
    const otro = { id: 99, eventId: 1, name: 'Otro', price: 2890000, thirdPartyCost: 2540000, serviceFee: 350000, hostCoversType: 'none', hostCoversValue: 0 };
    const drafts = L.packageChangeLines({ event, guest, newPackage: otro, lines: book.lines, hostAccount: hostOf(1), date: TODAY });
    const lines = [...book.lines, ...drafts.map((l, i) => ({ ...l, id: 72000 + i }))];
    assert.equal(netoOf(event, account, lines), 2890000);
    assert.equal(valorOf(1, lines), valorAntes);
  });

  test('corregir el cargo de un paquete con cobertura corrige también la cobertura (mismo chargeGroup)', () => {
    const event = eventById(2);
    const account = accountNamed(2, 'Sebastián Llinás');
    const lines = linesOfEvent(2);
    const cargo = lines.find((l) => l.accountId === account.id && l.kind === 'cargo');
    assert.ok(cargo.chargeGroup, 'el cargo por regla lleva chargeGroup');
    const group = lines.filter((l) => l.chargeGroup === cargo.chargeGroup);
    assert.deepEqual(group.map((l) => [l.kind, l.amount]), [['cargo', 1380000], ['aporte_anfitrion', -180000], ['aporte_anfitrion', 180000]]);
    const drafts = L.correctionDrafts({ lines, lineId: cargo.id, reason: 'Confirmó por error', date: TODAY });
    assert.equal(drafts.length, 3);
    assert.ok(drafts.every((d) => d.origin === 'regla_paquete' && d.correctsId != null));
    const book = [...lines, ...drafts.map((d, i) => ({ ...d, id: 73000 + i }))];
    const c = L.computeAccount({ event, account, lines: book, today: TODAY });
    assert.equal(c.neto, 0);
    assert.equal(c.saldo, -1200000);
    assert.equal(c.aFavor, 1200000);
    assert.equal(netoOf(event, hostOf(2), book), calcHost(2).neto - 180000);
    // Corregir SOLO la cobertura deja el cargo vivo.
    const cover = lines.find((l) => l.accountId === account.id && l.kind === 'aporte_anfitrion');
    const onlyCover = L.correctionDrafts({ lines, lineId: cover.id, reason: 'Los novios no cubren a Sebastián', date: TODAY });
    assert.deepEqual(onlyCover.map((d) => d.kind), ['aporte_anfitrion', 'aporte_anfitrion']);
    const book2 = [...lines, ...onlyCover.map((d, i) => ({ ...d, id: 74000 + i }))];
    assert.equal(L.computeAccount({ event, account, lines: book2, today: TODAY }).neto, 1380000);
  });

  test('no se corrige lo que una cancelación ya anuló o devolvió', () => {
    const account = accountNamed(1, 'Mateo Herrera · 11A');
    const lines = linesOfEvent(1);
    const cargo = lines.find((l) => l.accountId === account.id && l.kind === 'cargo');
    const aporte = lines.find((l) => l.accountId === account.id && l.origin === 'aporte' && l.amount < 0);
    assert.throws(() => L.correctionDrafts({ lines, lineId: cargo.id, reason: 'x', date: TODAY }), /anulado por una cancelación/);
    assert.throws(() => L.correctionDrafts({ lines, lineId: aporte.id, reason: 'x', date: TODAY }), /ya se devolvió/);
  });

  test('conciliación: un pago de pasarela duplicado y corregido vuelve a cuadrar', () => {
    const base = { eventId: 1, accountId: 5, kind: 'pago', date: '2026-09-01', origin: 'pasarela', method: 'bold', reference: 'ord-1' };
    const lines = [{ ...base, id: 1, amount: -500000 }, { ...base, id: 2, amount: -500000 }];
    const orders = [{ id: 'ord-1', amount: 500000 }];
    const before = L.reconcile(lines, orders);
    assert.equal(before.ok, false);
    assert.deepEqual(before.diffs, [{ orderId: 'ord-1', lineas: 2 }]);
    const [fix] = L.correctionDrafts({ lines, lineId: 2, reason: 'Pago duplicado por la pasarela', date: '2026-09-02' });
    assert.equal(fix.origin, 'pasarela');
    const after = L.reconcile([...lines, { ...fix, id: 3 }], orders);
    assert.equal(after.ok, true);
    assert.equal(after.ledgerTotal, 500000);
  });

  test('fecha de un pago o reembolso: la del movimiento real, nunca futura ni antes del evento', () => {
    const event = { createdAt: '2026-01-26T15:00:00.000Z' };
    assert.match(L.moneyDateProblem('2026-09-27', { today: TODAY, event }), /posterior a hoy/);
    assert.match(L.moneyDateProblem('2030-01-01', { today: TODAY, event }), /posterior a hoy/);
    assert.match(L.moneyDateProblem('2026-01-10', { today: TODAY, event }), /anterior a la creación del evento \(26\/01\/2026\)/);
    assert.match(L.moneyDateProblem('2026-02-30', { today: TODAY, event }), /fecha válida/);
    assert.equal(L.moneyDateProblem('2026-09-26', { today: TODAY, event }), null);
  });
});

describe('metas del evento (Plan de pagos y alerta de meta baja)', () => {
  test('boda: la próxima meta es la del plan (15 dic), no la reserva de una cuenta; sin alerta', () => {
    const s = summary(2);
    assert.deepEqual(s.milestones.map((m) => [m.key, m.date]), [['mitad', '2026-12-15'], ['total', '2027-02-15']]);
    assert.equal(s.nextMilestone.date, '2026-12-15');
    assert.equal(s.nextMilestone.daysLeft, 80);
    assert.equal(s.alerts.metaBaja, null);
    // «falta» no cuenta lo vencido: eso ya está en «Vencido hoy».
    assert.equal(s.nextMilestone.faltaTotal - s.nextMilestone.falta, s.totals.vencido);
    assert.ok(s.nextMilestone.cuentas > 0 && s.nextMilestone.cuentas <= s.accounts.length);
  });

  test('promoción y empresa: próxima meta el 15 oct; las metas vencidas quedan marcadas', () => {
    const promo = summary(1);
    assert.equal(promo.nextMilestone.date, '2026-10-15');
    assert.deepEqual(promo.milestones.map((m) => m.vencida), [true, true, false, false]);
    for (const row of promo.milestones) assert.ok(row.recaudado <= row.meta);
    assert.equal(promo.alerts.metaBaja, null);
    assert.equal(summary(3).nextMilestone.date, '2026-10-15');
  });

  test('alerta de meta baja: faltan 7 días o menos y el recaudo va por debajo del 80 %', () => {
    const s = summary(1, '2026-10-10');
    assert.equal(s.nextMilestone.date, '2026-10-15');
    assert.equal(s.nextMilestone.daysLeft, 5);
    assert.ok(s.nextMilestone.pct < 0.8);
    assert.equal(s.alerts.metaBaja, s.nextMilestone);
  });
});

describe('regla 19: quién ve qué', () => {
  test('permisos por rol, privacidad y permiso del organizador', () => {
    const admin = L.visibleFor('admin', 'solo_estado');
    const bodaOrg = L.visibleFor('event', 'solo_estado', 'titular');
    const promoOrg = L.visibleFor('event', 'montos', 'colaborador');
    const guest = L.visibleFor('invitado');
    assert.equal(admin.amounts, true);
    assert.equal(admin.adminFields, true);
    assert.equal(bodaOrg.amounts, false);
    assert.equal(bodaOrg.hostAccount, true);
    assert.equal(bodaOrg.can.contribute, true);
    assert.equal(promoOrg.amounts, true);
    assert.equal(promoOrg.can.contribute, false);
    assert.equal(promoOrg.can.invite, true);
    assert.equal(L.visibleFor('event', 'montos', 'lectura').can.invite, false);
    assert.equal(guest.ownAccountOnly, true);
    assert.equal(bodaOrg.can.registerMoney, false);
  });

  test('el organizador ve completa su cuenta anfitrión y nunca los costos de terceros ni el servicio', () => {
    const view = L.visibleFor('event', 'solo_estado', 'titular');
    const host = L.redactAccount(view, calcHost(2));
    assert.equal(host.neto, 17880000);
    const pkg = seed.eventPackages.find((p) => p.eventId === 2);
    const seen = L.redactPackage(view, pkg);
    assert.equal(seen.thirdPartyCost, undefined);
    assert.equal(seen.serviceFee, undefined);
    assert.equal(seen.price, 1380000);
    assert.equal(L.redactPackage(L.visibleFor('admin'), pkg).thirdPartyCost, 1230000);
    const charge = linesOfEvent(2).find((l) => l.kind === 'cargo');
    assert.equal(L.redactLine(view, charge, hostOf(2).id), null);
    const promoLine = L.redactLine(L.visibleFor('event', 'montos'), linesOfEvent(1).find((l) => l.kind === 'cargo'), hostOf(1).id);
    assert.equal(promoLine.thirdPartyPart, undefined);
    assert.equal(promoLine.amount, 2890000);
    const record = L.redactAccountRecord(view, accountNamed(1, 'Mateo Herrera · 11A'));
    assert.equal(record.adminNotes, undefined);
  });

  test('la actividad reciente no lleva montos en el texto y oculta el campo amount si no hay permiso', () => {
    for (const entry of seed.eventLog) assert.ok(!T.containsAmount(entry.detail), `monto en el log: ${entry.detail}`);
    const entry = seed.eventLog.find((e) => e.eventId === 2 && e.amount && e.accountId !== hostOf(2).id);
    if (entry) assert.equal(L.redactLogEntry(L.visibleFor('event', 'solo_estado'), entry, hostOf(2).id).amount, undefined);
    const hostEntry = seed.eventLog.find((e) => e.eventId === 2 && e.accountId === hostOf(2).id && e.amount);
    assert.equal(L.redactLogEntry(L.visibleFor('event', 'solo_estado'), hostEntry, hostOf(2).id).amount, 5000000);
  });
});

describe('regla 20 y plantillas', () => {
  test('tope de recordatorios: 1 cada 3 días', () => {
    const account = { lastReminderAt: '2026-09-24T15:20:00.000Z' };
    const early = L.reminderCheck(account, new Date('2026-09-26T15:20:00.000Z'));
    assert.equal(early.allowed, false);
    assert.equal(early.hoursLeft, 24);
    assert.equal(L.reminderCheck(account, new Date('2026-09-27T15:20:00.000Z')).allowed, true);
    assert.equal(L.reminderCheck({}, new Date()).allowed, true);
  });

  test('los textos de las plantillas y de la semilla no llevan montos; el del grupo no lleva nombres', () => {
    for (const type of T.EVENT_TYPES) {
      const tpl = T.getTemplate(type);
      for (const text of [tpl.inviteText, tpl.reminderText, tpl.groupText]) assert.equal(T.containsAmount(text), false, text);
      assert.ok(!tpl.groupText.includes('{nombre}'));
      assert.ok(tpl.inviteText.includes('{nombre}') && tpl.inviteText.includes('{enlace}'));
    }
    for (const event of seed.events) {
      assert.equal(T.containsAmount(event.inviteText), false);
      assert.equal(T.containsAmount(event.reminderText), false);
      // Se guardan con marcadores y se llenan al enviar con los datos del evento.
      assert.ok(event.reminderText.includes('{evento}') && event.inviteText.includes('{fechas}'));
      const msg = T.fillMessage(event.reminderText, { nombre: 'Marta', enlace: T.guestLink('EVT-ABC234', 'https://demo'), event });
      assert.ok(msg.includes('Marta') && msg.includes('#/e/EVT-ABC234') && msg.includes(event.title));
      assert.ok(!/\{[a-z]+\}/.test(msg));
    }
    assert.equal(T.containsAmount('Te faltan $ 240.000'), true);
    assert.equal(T.containsAmount('del 2 al 6 de diciembre de 2026'), false);
  });

  test('plan de la plantilla y validaciones del asistente', () => {
    const { event, packages } = T.buildEventDraft('empresa', { startDate: '2026-11-20', title: 'Prueba' });
    assert.equal(event.hostVisibility, 'montos');
    assert.equal(packages[0].serviceFee, 300000);
    assert.deepEqual(event.plan.hitos.map((h) => h.pct), [30, 70, 100]);
    assert.deepEqual(L.validateEventSetup({ plan: event.plan, packages, startDate: '2026-11-20', cancellationTiers: event.cancellationTiers }), []);
    const errors = L.validateEventSetup({
      plan: { hitos: [{ pct: 60, date: '2026-10-01' }, { pct: 40, date: '2026-10-10' }, { pct: 90, date: '2026-11-10' }] },
      packages: [{ name: 'Malo', price: 100000, thirdPartyCost: 150000 }],
      startDate: '2026-11-20',
    });
    assert.ok(errors.includes('Los porcentajes de las metas deben ir en aumento.'));
    assert.ok(errors.includes('La última meta debe ser el 100 %.'));
    assert.ok(errors.includes('La última meta debe ser al menos 15 días antes del viaje.'));
    assert.ok(errors.includes('El precio de «Malo» no puede ser menor que el costo de terceros.'));
    const monthly = L.generateMonthlyHitos({ n: 4, until: '2026-10-31' });
    assert.deepEqual(monthly.map((h) => [h.date, h.pct]), [['2026-07-31', 25], ['2026-08-31', 50], ['2026-09-30', 75], ['2026-10-31', 100]]);
  });

  test('pegar una lista: celular +57, correo y duplicados', () => {
    const rows = T.parseInviteList('boda', 'Familia Pérez\t4\t300 555 0101\nTíos Mendoza;2;+57 301-555-0102\nFamilia Pérez, 2, 3105550103\nSin celular, 2, 12345');
    assert.equal(rows[0].phone, '+573005550101');
    assert.equal(rows[0].seats, 4);
    assert.equal(rows[1].phone, '+573015550102');
    assert.ok(rows[2].errors.some((e) => e.startsWith('Repetida')));
    assert.ok(rows[3].errors.length > 0);
    const promo = T.parseInviteList('promocion', 'Juan Gómez\t11A\tMarta Ruiz\t3005550101');
    assert.deepEqual([promo[0].name, promo[0].group, promo[0].contactName, promo[0].phone], ['Juan Gómez', '11A', 'Marta Ruiz', '+573005550101']);
    const empresa = T.parseInviteList('empresa', 'Carlos Ruiz, carlos@techglobal.com, Comercial');
    assert.deepEqual([empresa[0].email, empresa[0].group, empresa[0].errors], ['carlos@techglobal.com', 'Comercial', []]);
  });
});

/* ---------------------------------------------------------------------------
 * 6. eventService con un apiService en memoria
 * ------------------------------------------------------------------------ */

describe('eventService (apiService en memoria)', () => {
  const ADMIN = { id: 1, role: 'admin' };
  const LAURA = { id: 6, role: 'event' }; // organizadora titular de la boda
  const opts = { today: TODAY };
  let service;

  before(async () => {
    ({ eventService: service } = await import('../src/services/eventService.js'));
  });
  beforeEach(() => memoryApi.reset(buildEventSeed()));

  const db = () => memoryApi.data;
  const account = (name) => db().eventAccounts.find((a) => a.displayName === name);
  const invitee = (acc) => ({ id: null, role: 'invitado', accessCode: acc.accessCode });
  const peopleOf = (acc) => db().eventGuests.filter((g) => g.accountId === acc.id);
  const linesOfAccount = (acc) => db().eventLedger.filter((l) => l.accountId === acc.id);
  const computed = (acc) => L.computeAccount({
    event: db().events.find((e) => e.id === acc.eventId), account: acc, lines: db().eventLedger, today: TODAY,
  });
  const family = [
    { firstName: 'Beatriz', lastName: 'Restrepo', audience: 'adulto', attendance: 'si' },
    { firstName: 'Julio', lastName: 'Restrepo', audience: 'adulto', attendance: 'si' },
    { firstName: 'Ana', lastName: 'Restrepo', audience: 'nino', attendance: 'si' },
  ];
  /** Espera un error de dominio con su code y un texto. */
  async function rejects(promise, code, pattern) {
    await assert.rejects(promise, (error) => {
      assert.equal(error.code, code, error.message);
      assert.match(error.message, pattern);
      return true;
    });
  }

  test('confirmar dos veces (reenvío del formulario) no cobra doble', async () => {
    const acc = account('Familia Restrepo');
    const first = await service.confirmAttendance(acc.id, family, invitee(acc), opts);
    assert.equal(first.lines.length, 9); // 3 cargos + 3 pares de cobertura
    // El mismo formulario otra vez: no escribe nada.
    const again = await service.confirmAttendance(acc.id, family, invitee(acc), opts);
    assert.equal(again.unchanged, true);
    // Mismos nombres sin id, con otras mayúsculas y tildes: son las mismas
    // personas (se actualiza cómo se escriben, sin cargos nuevos).
    const resend = family.map((p) => ({ ...p, firstName: p.firstName.toUpperCase().replace('BEATRIZ', 'Beatríz') }));
    const variant = await service.confirmAttendance(acc.id, resend, invitee(acc), opts);
    assert.equal(variant.lines.length, 0);
    assert.equal(peopleOf(acc).length, 3);
    assert.equal(peopleOf(acc).filter((g) => g.attendance === 'si').length, 3);
    assert.equal(linesOfAccount(acc).length, 6);
    assert.equal(computed(account('Familia Restrepo')).neto, 2840000);
    assert.equal(db().eventLog.filter((e) => e.accountId === acc.id && e.action === 'confirmo').length, 1);
  });

  test('doble clic: dos confirmaciones a la vez quedan en fila y no duplican', async () => {
    const acc = account('Familia Restrepo');
    const results = await Promise.all([
      service.confirmAttendance(acc.id, family, invitee(acc), opts),
      service.confirmAttendance(acc.id, family, invitee(acc), opts),
    ]);
    assert.deepEqual(results.map((r) => r.unchanged), [false, true]);
    assert.equal(peopleOf(acc).length, 3);
    assert.equal(db().eventLedger.filter((l) => l.eventId === 2).length, linesOfEvent(2).length + 9);
    assert.equal(computed(account('Familia Restrepo')).neto, 2840000);
  });

  test('«confirmó por teléfono» después de que el invitado ya confirmó no duplica', async () => {
    const acc = account('Familia Restrepo');
    await service.confirmAttendance(acc.id, family, invitee(acc), opts);
    const phone = await service.confirmAttendance(acc.id, family, LAURA, opts);
    assert.equal(phone.unchanged, true);
    assert.equal(peopleOf(acc).length, 3);
    assert.equal(computed(account('Familia Restrepo')).neto, 2840000);
  });

  test('el invitado que ya confirmó no agrega personas; nadie pasa los cupos', async () => {
    const acc = account('Familia Restrepo'); // 4 cupos
    await service.confirmAttendance(acc.id, family, invitee(acc), opts);
    const extra = { firstName: 'Tomás', lastName: 'Restrepo', audience: 'nino', attendance: 'si' };
    await rejects(service.confirmAttendance(acc.id, [...family, extra], invitee(acc), opts), 'EVENT_RULE', /Ya confirmaste; para cambios escríbele a CS Travel/);
    // El admin sí puede agregar, pero no pasarse: 3 existentes + 2 nuevas = 5 > 4.
    const two = [extra, { firstName: 'Lucía', lastName: 'Restrepo', audience: 'nino', attendance: 'si' }];
    await rejects(service.confirmAttendance(acc.id, two, ADMIN, opts), 'VALIDATION', /4 cupos y quedarían 5/);
    // En la primera confirmación también: «Andrés y Sofía Quintero» tiene 2 cupos.
    const quintero = account('Andrés y Sofía Quintero');
    const three = [
      { firstName: 'Andrés', lastName: 'Quintero', attendance: 'si' },
      { firstName: 'Sofía', lastName: 'Quintero', attendance: 'si' },
      { firstName: 'Pedro', lastName: 'Quintero', attendance: 'si' },
    ];
    await rejects(service.confirmAttendance(quintero.id, three, invitee(quintero), opts), 'VALIDATION', /2 cupos/);
    assert.equal(peopleOf(quintero).length, 0, 'un error no deja personas a medias');
    // Con el admin, una cuarta persona sí cabe.
    const added = await service.confirmAttendance(acc.id, [extra], ADMIN, opts);
    assert.equal(added.lines.length, 3);
    assert.equal(peopleOf(acc).filter((g) => g.attendance === 'si').length, 4);
  });

  test('a una persona con cargos no se le cambia el paquete ni se le quita el «sí» desde la confirmación', async () => {
    const acc = account('Familia Pérez Gómez');
    const tomas = peopleOf(acc).find((g) => g.firstName === 'Tomás');
    const adulto = db().eventPackages.find((p) => p.eventId === 2 && p.audience === 'adulto');
    await rejects(service.confirmAttendance(acc.id, [{ id: tomas.id, firstName: 'Tomás', lastName: 'Pérez', packageId: adulto.id, attendance: 'si' }], ADMIN, opts), 'EVENT_RULE', /cambiar su paquete/);
    await rejects(service.confirmAttendance(acc.id, [{ id: tomas.id, firstName: 'Tomás', lastName: 'Pérez', attendance: 'no' }], ADMIN, opts), 'EVENT_RULE', /cancelar su viaje/);
    const otra = account('Carolina Vélez');
    const intruso = peopleOf(otra)[0];
    await rejects(service.confirmAttendance(acc.id, [{ id: intruso.id, firstName: 'X', attendance: 'si' }], ADMIN, opts), 'VALIDATION', /no pertenece/);
  });

  test('cancelar dos veces a la vez (doble clic) cobra una sola penalidad', async () => {
    const acc = account('Juan Gómez · 11A');
    const juan = peopleOf(acc)[0];
    const results = await Promise.allSettled([
      service.cancelGuest(juan.id, { reason: 'Prueba' }, ADMIN, opts),
      service.cancelGuest(juan.id, { reason: 'Prueba' }, ADMIN, opts),
    ]);
    assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected']);
    assert.match(results[1].reason.message, /El viaje de Juan Gómez ya está cancelado/);
    assert.equal(linesOfAccount(acc).filter((l) => l.kind === 'penalidad').length, 1);
  });

  test('corregir un aporte (servicio) y luego cancelar: el fondo queda en 13.030.000 y la penalidad en 578.000', async () => {
    const acc = account('Juan Gómez · 11A');
    const aporte = linesOfAccount(acc).find((l) => l.origin === 'aporte');
    const saved = await service.correctLine(aporte.id, { reason: 'Aporte aplicado por error' }, ADMIN, opts);
    assert.ok(saved.every((l) => l.origin === 'aporte' && l.createdBy === '1'));
    const quote = await service.cancelGuest(peopleOf(acc)[0].id, { reason: 'Retiro' }, ADMIN, opts);
    assert.equal(quote.returned, 0);
    assert.equal(quote.penaltyTotal, 578000);
    assert.equal(computed(account('Fondo de la promoción 11°')).neto, 13030000);
  });

  test('registrar pago y reembolso: la fecha no puede ser futura ni anterior al evento', async () => {
    const diana = account('Diana Morales · Comercial');
    await rejects(service.registerPayment(diana.id, { amount: 100000, date: '2030-01-01', reference: 'TRF-1' }, ADMIN, opts), 'VALIDATION', /posterior a hoy/);
    await rejects(service.registerPayment(diana.id, { amount: 100000, date: '2026-07-01', reference: 'TRF-1' }, ADMIN, opts), 'VALIDATION', /anterior a la creación/);
    const ok = await service.registerPayment(diana.id, { amount: 100000, date: '2026-09-25', reference: 'TRF-1' }, ADMIN, opts);
    assert.equal(ok.date, '2026-09-25');
    const mateo = account('Mateo Herrera · 11A');
    await rejects(service.refund(mateo.id, { amount: 100000, reference: 'TRF-2', reason: 'Cancelación', date: '2026-10-01' }, ADMIN, opts), 'VALIDATION', /posterior a hoy/);
    const refund = await service.refund(mateo.id, { amount: 422000, reference: 'TRF-2', reason: 'Cancelación' }, ADMIN, opts);
    assert.equal(refund.date, TODAY);
  });

  test('vista del invitado: el vocabulario ya trae el nombre del anfitrión', async () => {
    const carlos = account('Carlos Ruiz · Comercial');
    const view = await service.getGuestView(carlos.accessCode, opts);
    assert.equal(view.vocab.anfitrionCard, 'Parte de TechGlobal Solutions');
    assert.equal(view.hostName, 'TechGlobal Solutions');
  });

  test('WhatsApp: el texto sale con los datos actuales del evento y las cuentas demo no llevan número', async () => {
    await service.updateEvent(2, { title: 'Nos casamos en Barú', destination: 'Isla Barú' }, ADMIN);
    const event = db().events.find((e) => e.id === 2);
    const mendoza = account('Tíos Mendoza');
    assert.equal(mendoza.demo, true);
    assert.match(mendoza.contactPhone, /^\+57399555\d{4}$/);
    const invite = service.messageFor(event, mendoza, 'invite', 'https://demo.example');
    assert.ok(invite.text.includes('Isla Barú') && !invite.text.includes('Cartagena'));
    assert.ok(invite.href.startsWith('https://wa.me/?text='));
    const reminder = service.messageFor(event, mendoza, 'reminder');
    assert.ok(reminder.text.includes('«Nos casamos en Barú»'));
    assert.equal(T.containsAmount(reminder.text), false);
    // Una cuenta real (creada por el organizador) sí abre el chat de su celular.
    const real = { ...mendoza, demo: undefined, contactPhone: '+573001112233' };
    assert.ok(service.messageFor(event, real).href.startsWith('https://wa.me/573001112233?text='));
  });
});
