#!/usr/bin/env node
/**
 * record-flow.mjs — graba un RECORRIDO INTERACTIVO (no un barrido de scroll).
 *
 * Mismo motor que `record-page.mjs` (screencast del Chrome DevTools Protocol +
 * ffmpeg respetando los timestamps reales), pero en vez de bajar por la pagina
 * ejecuta una lista de pasos: abrir una URL, escribir en un campo, hacer clic,
 * esperar. Sirve para demostrar un flujo completo: por ejemplo, un pago de
 * principio a fin para la revision de la pasarela.
 *
 * Detalles pensados para que el video se entienda sin narracion:
 *   - Antes de cada clic se dibuja un anillo sobre el elemento (el cursor real
 *     NO sale en el screencast, asi que sin esto los clics serian invisibles).
 *   - Los rotulos (--captions) solo se pintan en paginas PROPIAS. Nunca se
 *     dibuja nada encima de la pasarela: el video debe mostrarla tal cual es.
 *   - Se escribe con retardo por tecla, para que se lea como una persona.
 *
 * Uso:
 *   node scripts/record-flow.mjs --flow pago-publico --codigo CST-DEMO25
 *   node scripts/record-flow.mjs --flow pago-publico --codigo CST-XXXX \
 *        --out docs/video/pago.mp4 --width 1440 --height 900
 *
 * Opciones:
 *   --flow       nombre del recorrido (ver FLOWS abajo). Requerida
 *   --codigo     codigo del cobro para el recorrido de pago
 *   --out        MP4 de salida (por defecto docs/video/<flow>.mp4)
 *   --width      ancho del viewport (1440)
 *   --height     alto del viewport (900)
 *   --fps        fotogramas por segundo del MP4 (30)
 *   --quality    calidad JPEG del screencast, 1-100 (90)
 *   --no-captions  sin rotulos
 *   --headful    abre Chrome visible (para depurar)
 *   --keep       conserva los fotogramas sueltos
 *   --chrome     ruta a Chrome (si no, se autodetecta)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const arg = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const num = (name, fallback) => {
  const v = arg(name);
  return v === undefined || v === true ? fallback : Number(v);
};

const flowName = arg('flow');
const width = num('width', 1440);
const height = num('height', 900);
const fps = num('fps', 30);
const quality = num('quality', 90);
const captionsOn = arg('no-captions') !== true;
const headful = arg('headful') === true;
const keepFrames = arg('keep') === true;
const SITE = 'https://www.cstravelgroup.com';

// ---------- recorridos ----------
// Cada paso: { caption?, goto?, waitFor?, type?, click?, clickText?, wait?, scroll? }
// Pasos de la pasarela (los mismos en todos los recorridos que terminan pagando).
// Sin rotulos ni dibujos encima: la pasarela se muestra tal cual es.
const PASOS_PASARELA = [
  { clickText: 'Pago con tarjeta', wait: 2.5, foreign: true },
  { type: { sel: 'input[name=phone]', text: '3000000000', delay: 60 }, foreign: true },
  { type: { sel: 'input[name=email]', text: 'demo@cstravelgroup.com', delay: 40 }, foreign: true },
  { type: { sel: 'input[name=cardNumber]', text: '4111111111111111', delay: 60 }, foreign: true },
  { type: { sel: 'input[name=cardDate]', text: '1230', delay: 90 }, foreign: true },
  { type: { sel: 'input[name=cardCVC]', text: '123', delay: 90 }, foreign: true },
  { type: { sel: 'input[name=name]', text: 'PRUEBA CS TRAVEL', delay: 45 }, foreign: true },
  { type: { sel: 'input[name=identificationNumber]', text: '1000000000', delay: 50 }, foreign: true },
  { type: { sel: 'input[name=address]', text: 'Carrera 64 91-105, Barranquilla', delay: 30 }, foreign: true },
  { checkboxes: 'bold-checkbox', wait: 1, foreign: true },
  { clickText: 'Pagar', wait: 14, foreign: true },
  { waitForText: 'Completaste el pago', wait: 3, foreign: true },
  { clickText: 'Volver a la tienda', wait: 7, foreign: true, required: false },
];

const FLOWS = {
  /** Pago de un cobro por enlace, sin iniciar sesion, con tarjeta de pruebas. */
  'pago-publico': (opts) => {
    const code = String(opts.codigo || '');
    if (!code) throw new Error('Falta --codigo (el codigo del cobro a pagar).');
    return [
      { goto: `${SITE}/pago`, wait: 2.5, caption: 'El cliente abre el enlace de pago que le enviaron' },
      { caption: 'Escribe el código del cobro', type: { sel: '#code', text: code, delay: 110 }, wait: 0.6 },
      { click: '#find-btn', wait: 3, caption: 'Busca su cobro' },
      { wait: 2.5, caption: 'Ve el concepto y el valor antes de pagar' },
      { click: '[data-method="online"]', wait: 1.2, caption: 'Elige pagar en línea con tarjeta' },
      { click: '#pay-btn', wait: 6, caption: 'Pasa a la pasarela de pagos' },
      // --- desde aqui manda la pasarela: sin rotulos ni dibujos encima ---
      { clickText: 'Pago con tarjeta', wait: 2.5, foreign: true },
      { type: { sel: 'input[name=phone]', text: '3000000000', delay: 60 }, foreign: true },
      { type: { sel: 'input[name=email]', text: 'demo@cstravelgroup.com', delay: 40 }, foreign: true },
      { type: { sel: 'input[name=cardNumber]', text: '4111111111111111', delay: 60 }, foreign: true },
      { type: { sel: 'input[name=cardDate]', text: '1230', delay: 90 }, foreign: true },
      { type: { sel: 'input[name=cardCVC]', text: '123', delay: 90 }, foreign: true },
      { type: { sel: 'input[name=name]', text: 'PRUEBA CS TRAVEL', delay: 45 }, foreign: true },
      { type: { sel: 'input[name=identificationNumber]', text: '1000000000', delay: 50 }, foreign: true },
      { type: { sel: 'input[name=address]', text: 'Carrera 64 91-105, Barranquilla', delay: 30 }, foreign: true },
      { checkboxes: 'bold-checkbox', wait: 1, foreign: true },
      { clickText: 'Pagar', wait: 14, foreign: true },
      { waitForText: 'Completaste el pago', wait: 3, foreign: true },
      // Se usa el boton de la pasarela en vez de navegar a mano: asi se ve el
      // regreso real al sitio y no competimos con su redireccion automatica.
      { clickText: 'Volver a la tienda', wait: 7, foreign: true },
      { caption: 'Vuelve a CS Travel con el pago confirmado', wait: 5 },
    ];
  },

  /**
   * Ciclo completo de una empresa aliada: entra a su portal, pide un viaje,
   * recibe la cotizacion aprobada y la paga. Es el recorrido que ve alguien
   * que revisa la pasarela de punta a punta.
   */
  'ciclo-empresa': (opts) => {
    const email = String(opts.email || 'demo@cstravelgroup.com');
    const hoy = new Date();
    const dia = (n) => {
      const d = new Date(hoy.getTime() + n * 864e5);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    };
    return [
      { goto: `${SITE}/portal/`, wait: 2.5, caption: 'Una empresa aliada entra a su portal' },
      { type: { sel: '#email', text: email, delay: 70 }, wait: 1.2 },
      // La sesion se abre por la API para no escribir la contrasena en el video.
      { login: true, goto: `${SITE}/portal/empresa`, waitFor: '.page-title, .qb-page-hero, .app-shell', wait: 5,
        caption: 'Su panel: retorno, solicitudes y beneficios' },
      { js: "location.hash = '#/company/requests/new'", waitFor: '#request-form', wait: 2.5,
        caption: 'Pide un nuevo viaje' },
      { click: '.nr-check input[value="paquete"]', wait: 0.8 },
      { type: { sel: 'input[name=origin]', text: 'Barranquilla', delay: 70 }, wait: 0.5 },
      { type: { sel: 'input[name=destination]', text: 'Cartagena', delay: 70 }, wait: 0.5 },
      { type: { sel: 'input[name=travelDate]', text: dia(25), delay: 60 }, wait: 0.4 },
      { type: { sel: 'input[name=returnDate]', text: dia(29), delay: 60 }, wait: 0.4 },
      { type: { sel: 'input[name=firstName]', text: 'Laura', delay: 60 }, wait: 0.3 },
      { type: { sel: 'input[name=lastName]', text: 'Mendoza', delay: 60 }, wait: 0.3 },
      { type: { sel: 'input[name=documentNumber]', text: '1000200300', delay: 45 }, wait: 0.3 },
      { type: { sel: 'input[name=nationality]', text: 'Colombiana', delay: 55 }, wait: 0.5 },
      { click: '#request-form button[type=submit]', wait: 5,
        caption: 'Envía su solicitud' },
      { js: "location.hash = '#/company/requests'", wait: 4,
        caption: 'La cotización le queda aprobada al instante' },
      { click: '.data-table tbody tr', wait: 3.5, caption: 'Abre su solicitud y ve el valor a pagar', required: false },
      { clickText: 'Pagar', wait: 6, caption: 'Pulsa pagar', required: false },
      ...PASOS_PASARELA,
      { caption: 'Vuelve a CS Travel con el pago confirmado', wait: 5 },
    ];
  },
};

if (!flowName || !FLOWS[flowName]) {
  console.error(`--flow invalido. Disponibles: ${Object.keys(FLOWS).join(', ')}`);
  process.exit(1);
}
const steps = FLOWS[flowName]({ codigo: arg('codigo'), email: arg('email'), pass: arg('pass') });
const out = path.resolve(String(arg('out', path.join('docs', 'video', `${flowName}.mp4`))));

// ---------- Chrome ----------
function findChrome() {
  const fromArg = arg('chrome');
  if (typeof fromArg === 'string') return fromArg;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium'];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('No encontre Chrome. Pasalo con --chrome "ruta/al/chrome.exe".');
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-flow-'));
const frames = [];

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: !headful,
  protocolTimeout: 240_000,
  defaultViewport: { width, height, deviceScaleFactor: 1 },
  args: ['--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-infobars', `--window-size=${width},${height}`],
});

// ---------- ayudas dentro de la pagina ----------
const OWN_HOST = 'cstravelgroup.com';
const isOwn = (page) => page.url().includes(OWN_HOST);

async function dressPage(page) {
  await page.addStyleTag({
    content: `::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
              html{scrollbar-width:none!important}
              *{caret-color:transparent!important}
              #flow-caption{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);
                z-index:2147483647;background:rgba(6,25,83,.94);color:#fff;font:600 19px/1.4 Inter,Arial,sans-serif;
                padding:13px 26px;border-radius:999px;box-shadow:0 12px 34px rgba(4,18,42,.35);
                opacity:0;transition:opacity .35s ease;pointer-events:none;max-width:82vw;text-align:center}
              #flow-caption.on{opacity:1}
              .flow-ring{position:fixed;z-index:2147483646;border:3px solid #ffd322;border-radius:12px;
                box-shadow:0 0 0 4px rgba(255,211,34,.28);pointer-events:none;transition:opacity .3s ease}`,
  }).catch(() => {});
}

async function caption(page, text) {
  if (!captionsOn || !text || !isOwn(page)) return;
  await page.evaluate((t) => {
    let el = document.getElementById('flow-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'flow-caption';
      document.body.appendChild(el);
    }
    el.textContent = t;
    requestAnimationFrame(() => el.classList.add('on'));
  }, text).catch(() => {});
}

/** Anillo sobre el elemento antes de tocarlo (el cursor no sale en el screencast). */
async function ring(page, box) {
  if (!box || !isOwn(page)) return;
  await page.evaluate((b) => {
    const r = document.createElement('div');
    r.className = 'flow-ring';
    r.style.left = `${b.x - 6}px`;
    r.style.top = `${b.y - 6}px`;
    r.style.width = `${b.width + 12}px`;
    r.style.height = `${b.height + 12}px`;
    document.body.appendChild(r);
    setTimeout(() => { r.style.opacity = '0'; setTimeout(() => r.remove(), 320); }, 700);
  }, box).catch(() => {});
}

async function clickSel(page, sel) {
  const el = await page.waitForSelector(sel, { visible: true, timeout: 20_000 });
  const box = await el.boundingBox();
  await ring(page, box);
  await sleep(650);
  await el.click();
}

async function clickByText(page, text) {
  const handle = await page.evaluateHandle((t) => {
    const all = [...document.querySelectorAll('button, bold-button, a, [role=button]')];
    return all.find((e) => e.textContent.trim().startsWith(t) && e.getBoundingClientRect().height > 10) || null;
  }, text);
  const el = handle.asElement();
  if (!el) throw new Error(`No encontre un boton que empiece por "${text}"`);
  await el.scrollIntoView().catch(() => {});
  await sleep(400);
  await el.click();
}

async function typeInto(page, { sel, text, delay = 60 }) {
  const el = await page.waitForSelector(sel, { visible: true, timeout: 20_000 });
  const box = await el.boundingBox();
  await ring(page, box);
  await sleep(350);
  await el.click();
  await page.type(sel, text, { delay });
}

/** Casillas de la pasarela: son componentes propios, se pulsan por el borde. */
async function checkAll(page, sel) {
  const boxes = await page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + 12, y: r.y + r.height / 2 };
  }), sel);
  for (const b of boxes) {
    await page.mouse.click(b.x, b.y);
    await sleep(500);
  }
}

// ---------- grabacion ----------
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.on('framenavigated', async (f) => {
    if (f === page.mainFrame()) await dressPage(page);
  });

  // Primera carga antes de grabar, para no filmar la pantalla en blanco.
  const first = steps.find((s) => s.goto);
  if (first) {
    await page.goto(first.goto, { waitUntil: 'networkidle2', timeout: 90_000 }).catch(() => {});
    await dressPage(page);
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await sleep(1200);
  }

  const client = await page.createCDPSession();
  let n = 0;
  // Cerrar el screencast puede tardar; dejamos de guardar fotogramas en cuanto
  // termina el recorrido, si no el video arrastra minutos de pantalla quieta.
  let capturando = true;
  client.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    if (!capturando) {
      try { await client.send('Page.screencastFrameAck', { sessionId }); } catch {}
      return;
    }
    const file = path.join(tmpDir, `f${String(n++).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, ts: (metadata && metadata.timestamp) || Date.now() / 1000 });
    try { await client.send('Page.screencastFrameAck', { sessionId }); } catch {}
  });

  console.log('-> grabando');
  await client.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  await sleep(1500);

  let firstGotoDone = false;
  for (const [i, step] of steps.entries()) {
    const label = step.caption || step.click || step.clickText || (step.type && step.type.sel) || step.goto || 'paso';
    const t0 = Date.now();
    console.log(`   ${i + 1}/${steps.length} ${String(label).slice(0, 60)}`);
    try {
      if (step.caption && !step.login) await caption(page, step.caption);
      if (step.login) {
        // Inicia sesion contra la API y traslada la cookie al navegador: asi el
        // video no muestra ninguna contrasena escribiendose.
        const res = await fetch(`${SITE}/api/auth-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: arg('email') || 'demo@cstravelgroup.com', password: arg('pass') || '' }),
        });
        const cookieHeader = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith('portal_session='));
        if (!cookieHeader) throw new Error('No se pudo iniciar sesion para la grabacion');
        const value = cookieHeader.split(';')[0].split('=').slice(1).join('=');
        // Punto y dominio raiz: el sitio responde con y sin "www".
        await page.setCookie({ name: 'portal_session', value, domain: '.cstravelgroup.com', path: '/', httpOnly: true, secure: true });
      }
      if (step.goto) {
        if (firstGotoDone || page.url() !== step.goto) {
          await page.goto(step.goto, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
          await dressPage(page);
          if (step.caption) await caption(page, step.caption);
        }
        firstGotoDone = true;
        if (step.caption && step.login) await caption(page, step.caption);
      }
      if (step.js) await page.evaluate((code) => { eval(code); }, step.js);
      if (step.waitFor) await page.waitForSelector(step.waitFor, { visible: true, timeout: 30_000 });
      if (step.waitForText) {
        await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 45_000 }, step.waitForText).catch(() => {});
      }
      if (step.type) await typeInto(page, step.type);
      if (step.click) await clickSel(page, step.click);
      if (step.clickText) await clickByText(page, step.clickText);
      if (step.checkboxes) await checkAll(page, step.checkboxes);
      if (step.scroll) await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), step.scroll);
      await sleep((step.wait ?? 1.2) * 1000);
      console.log(`      (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.warn(`   ! paso ${i + 1} fallo: ${e.message}`);
      if (step.required !== false) throw e;
    }
  }

  await sleep(1500);
  capturando = false;
  // Cerrar el screencast puede expirar si la ultima navegacion dejo la sesion
  // ocupada; los fotogramas ya estan en disco, asi que no es motivo de fallo.
  await client.send('Page.stopScreencast').catch((e) => console.warn(`   (stopScreencast: ${e.message})`));
  await sleep(300);
} finally {
  await browser.close();
}

if (frames.length < 2) {
  console.error('No llegaron fotogramas del screencast.');
  process.exit(1);
}
console.log(`-> ${frames.length} fotogramas capturados`);

// ---------- montaje ----------
const listFile = path.join(tmpDir, 'frames.txt');
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const d = i < frames.length - 1 ? Math.max(1 / 240, frames[i + 1].ts - frames[i].ts) : 1 / fps;
  lines.push(`file '${frames[i].file.replace(/\\/g, '/')}'`);
  lines.push(`duration ${d.toFixed(6)}`);
}
lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
fs.writeFileSync(listFile, lines.join('\n'));
fs.mkdirSync(path.dirname(out), { recursive: true });

const code = await new Promise((resolve) => {
  const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('error', (e) => { console.error(`ffmpeg no arranco: ${e.message}`); resolve(1); });
  p.on('close', resolve);
});
if (code !== 0) {
  console.error(`ffmpeg fallo (codigo ${code}). Fotogramas en ${tmpDir}`);
  process.exit(code);
}
if (keepFrames) console.log(`fotogramas en ${tmpDir}`);
else fs.rmSync(tmpDir, { recursive: true, force: true });

const mb = (fs.statSync(out).size / 1e6).toFixed(1);
const secs = (frames[frames.length - 1].ts - frames[0].ts).toFixed(1);
console.log(`OK ${out}  —  ${secs}s, ${fps} fps, ${width}x${height}, ${mb} MB`);
