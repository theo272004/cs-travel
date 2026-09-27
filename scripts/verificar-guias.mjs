#!/usr/bin/env node
/**
 * verificar-guias.mjs — revisa que cada guia del portal encuentre sus zonas.
 *
 * Para cada ruta de TOURS (components/Tour.js), entra con el usuario demo del
 * rol que corresponde, abre la pagina a 1280 px y a 375 px, toca el boton
 * «Guía» y comprueba:
 *   - que la guia se abre (tarjeta role="dialog") con su intro;
 *   - que zonas de los pasos NO se encuentran (lo que hay que arreglar);
 *   - que el ultimo paso resalta el boton «Guía»;
 *   - que Escape la cierra y el foco vuelve al boton;
 *   - que no hay errores en la consola ni scroll horizontal.
 * Los pasos marcados `optional` (dependen del estado o del tamano de pantalla)
 * se listan aparte y no cuentan como error.
 *
 * Requiere el prototipo local corriendo (npm run dev + json-server); la sesion
 * se siembra leyendo el usuario demo de /api/users (sin contrasenas).
 * Correrlo antes de cada rebundle hacia cstravelgroup/public/portal-app.
 *
 * Uso:
 *   node scripts/verificar-guias.mjs
 *   node scripts/verificar-guias.mjs --base http://localhost:5173/ --solo admin
 *   node scripts/verificar-guias.mjs --chrome "C:/ruta/chrome.exe"
 *
 * Sale con codigo 1 si algun paso obligatorio no encuentra su zona.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = arg('base', 'http://localhost:5173/');
const ONLY = arg('solo', ''); // admin | company | doctor
const CHROME = arg('chrome', process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => fs.existsSync(p)));
const WIDTHS = [1280, 375];

// Usuarios demo (valores de prueba del proyecto, src/data/db.json).
const USERS = {
  admin: 'admin@cstravel.com',
  company: 'carlos@techglobal.com',
  doctor: 'valentina@clinicadermavital.com',
};

// Ids reales para las rutas con :id (el estado elegido muestra el paso clave).
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/db.json'), 'utf8'));
const byEmail = (email) => db.users.find((u) => u.email === email) || {};
const company = byEmail(USERS.company);
const doctor = byEmail(USERS.doctor);
const pick = (list, test) => (list.find(test) || list[0] || {}).id;
const IDS = {
  '#/admin/requests/:id': pick(db.requests, (r) => r.status === 'solicitud enviada'),
  '#/admin/medical-cases/:id': pick(db.medicalCases, (c) => c.status === 'solicitud enviada'),
  '#/admin/users/:id': pick(db.users, (u) => u.role === 'company'),
  '#/admin/companies/:id': pick(db.companies, (c) => c.id === company.companyId),
  '#/admin/doctors/:id': pick(db.doctors, (d) => d.id === doctor.doctorId),
  '#/company/requests/:id': pick(db.requests, (r) => r.companyId === company.companyId && r.status === 'cotizacion enviada'),
  '#/doctor/cases/:id': pick(db.medicalCases, (c) => c.doctorId === doctor.doctorId && c.status === 'cotizacion enviada'),
};

const ROLE_BY_PREFIX = { admin: 'admin', company: 'company', doctor: 'doctor' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedSession(page, role) {
  await page.goto(`${BASE}#/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(async (email) => {
    const res = await fetch(`/api/users?email=${encodeURIComponent(email)}`);
    const [user] = await res.json();
    delete user.password;
    localStorage.setItem('cs_travel_session', JSON.stringify(user));
    localStorage.setItem('cs_tour_off', '1'); // sin globo de primera vez en las pruebas
  }, USERS[role]);
}

/**
 * checkPage(): revisa la guia de una ruta a un ancho. Devuelve lo encontrado
 * sin sumarlo todavia, para poder repetir el intento.
 */
async function checkPage(browser, route, hash, role, width) {
  const out = { problems: [], notes: [], checked: false, line: '' };
  const tag = `${route} @${width}`;
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.setViewport({ width, height: width < 600 ? 812 : 900, isMobile: width < 600, hasTouch: width < 600 });
    await seedSession(page, role);
    await page.goto(`${BASE}${hash}`, { waitUntil: 'networkidle0' });
    try {
      await page.waitForSelector('.navbar__guide', { visible: true, timeout: 12000 });
    } catch {
      out.problems.push(`${tag}: no hay botón «Guía» en la barra (¿la página no cargó?)`);
      out.line = `MAL ${tag}`;
      return out;
    }
    await sleep(900);

    // Si la vista redirige (ej. una ruta vieja), el hash cambia.
    const landed = await page.evaluate(() => window.location.hash.split('?')[0]);
    if (landed !== hash) {
      out.notes.push(`${tag}: la página redirige a ${landed || '(sin hash)'} (no se revisa)`);
      return out;
    }

    const audit = await page.evaluate((r) => window.__csGuide.auditGuide(r), route);
    out.checked = true;
    for (const step of audit.steps) {
      if (step.found) continue;
      if (step.optional) out.notes.push(`${tag}: opcional sin zona · «${step.title}» (${step.zone})${typeof step.optional === 'string' ? ` · ${step.optional}` : ''}`);
      else out.problems.push(`${tag}: NO se encontró · «${step.title}» (${step.zone})`);
    }

    // Abrir con el boton, ir al final, cerrar con Escape.
    await page.click('.navbar__guide');
    await sleep(500);
    const opened = await page.evaluate(() => ({
      dialog: Boolean(document.querySelector('.cs-guide__card[role="dialog"]')),
      intro: document.querySelector('.cs-guide')?.dataset.mode === 'intro',
      dots: document.querySelectorAll('.cs-guide__dot').length,
    }));
    if (!opened.dialog || !opened.intro) out.problems.push(`${tag}: la guía no abrió en su intro`);
    await page.keyboard.press('End');
    await sleep(900);
    const last = await page.evaluate(() => {
      const spot = document.querySelector('.cs-guide__spot')?.getBoundingClientRect();
      const btn = document.querySelector('.navbar__guide')?.getBoundingClientRect();
      if (!spot || !btn) return false;
      const cx = btn.left + btn.width / 2;
      const cy = btn.top + btn.height / 2;
      return cx > spot.left && cx < spot.right && cy > spot.top && cy < spot.bottom;
    });
    if (!last) out.problems.push(`${tag}: el último paso no resalta el botón «Guía»`);
    await page.keyboard.press('Escape');
    await sleep(350);
    const closed = await page.evaluate(() => ({
      gone: !document.querySelector('.cs-guide'),
      focus: document.activeElement?.classList.contains('navbar__guide'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    if (!closed.gone) out.problems.push(`${tag}: Escape no cerró la guía`);
    if (!closed.focus) out.problems.push(`${tag}: al cerrar, el foco no volvió al botón «Guía»`);
    if (closed.overflow > 1) out.problems.push(`${tag}: scroll horizontal de ${closed.overflow}px`);
    out.line = `${opened.dialog ? 'ok ' : 'MAL'} ${tag.padEnd(40)} ${Math.max(0, opened.dots - 1)} pasos`;
    return out;
  } finally {
    errors.forEach((e) => out.problems.push(`${tag}: error en consola · ${e}`));
    await page.close();
  }
}

if (!CHROME) {
  console.error('No se encontró Chrome. Pásalo con --chrome <ruta> o CHROME_PATH.');
  process.exit(2);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const problems = [];
const notes = [];
let checked = 0;

try {
  // Rutas de TOURS: las expone Tour.js en desarrollo (window.__csGuide), con lo
  // que otros modulos registraron mediante registerTours().
  const probe = await browser.newPage();
  await seedSession(probe, 'admin');
  await probe.goto(`${BASE}#/admin/dashboard`, { waitUntil: 'networkidle0' });
  await probe.waitForFunction(() => window.__csGuide, { timeout: 12000 }).catch(() => {});
  const routes = await probe.evaluate(() => Object.keys(window.__csGuide?.TOURS || {}));
  await probe.close();
  if (!routes.length) throw new Error('No se leyeron las guías: ¿el prototipo corre en modo desarrollo en ' + BASE + '?');

  for (const route of routes) {
    const role = ROLE_BY_PREFIX[route.split('/')[1]];
    if (!role || (ONLY && ONLY !== role)) continue;
    let hash = route;
    if (route.includes(':id')) {
      const id = IDS[route];
      if (!id) { notes.push(`${route}: sin id de prueba en db.json`); continue; }
      hash = route.replace(':id', id);
    }

    for (const width of WIDTHS) {
      // Si algo falla se repite una vez: descarta las recargas completas que
      // hace Vite cuando alguien guarda un archivo mientras corre la prueba.
      let result = await checkPage(browser, route, hash, role, width);
      if (result.problems.length) result = await checkPage(browser, route, hash, role, width);
      if (result.line) console.log(result.line);
      if (result.checked) checked += 1;
      problems.push(...result.problems);
      notes.push(...result.notes);
    }
  }
} finally {
  await browser.close();
}

console.log(`\nPáginas revisadas: ${checked}`);
if (notes.length) {
  console.log('\nNotas (no son errores):');
  notes.forEach((n) => console.log(`  - ${n}`));
}
if (!checked) problems.push('No se revisó ninguna página: ¿está corriendo el prototipo en ' + BASE + '?');
if (problems.length) {
  console.log('\nPROBLEMAS:');
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
console.log('\nSin problemas: todas las zonas obligatorias se encuentran.');
