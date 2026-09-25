#!/usr/bin/env node
/**
 * record-page.mjs — recorrido grabado (scroll-through) de cualquier página.
 *
 * Chrome headless controlado por Puppeteer; los fotogramas salen del screencast
 * del Chrome DevTools Protocol (Page.startScreencast), no de capturas una por
 * una: es el compositor del navegador entregando cada fotograma según lo pinta.
 * Luego ffmpeg los monta en MP4 respetando los timestamps reales.
 *
 * Sin cursor, sin barra de scroll, sin notificaciones, sin caídas de fotogramas,
 * y con un tamaño exacto y repetible.
 *
 * Uso:
 *   node scripts/record-page.mjs --url https://www.cstravelgroup.com/
 *   node scripts/record-page.mjs --url http://localhost:5173/ --out docs/video/tool.mp4 \
 *        --width 1920 --height 1080 --duration 24 --fps 60 --wait 3
 *
 * Opciones:
 *   --url        página a grabar (requerida)
 *   --out        MP4 de salida (por defecto docs/video/<host><ruta>.mp4)
 *   --width      ancho del viewport CSS (1920)
 *   --height     alto del viewport CSS (1080)
 *   --scale      deviceScaleFactor (1). 2 = retina, pesa y va más lento
 *   --fps        fotogramas por segundo del MP4 (60)
 *   --duration   segundos del barrido de scroll (20)
 *   --hold-start segundos quieto arriba antes de bajar (2)
 *   --hold-end   segundos quieto abajo al terminar (2)
 *   --wait       segundos extra de espera tras cargar, para fuentes/animaciones (2.5)
 *   --quality    calidad JPEG del screencast, 1-100 (95)
 *   --ramp       fraccion del barrido usada para acelerar y frenar, 0-0.49 (0.15).
 *                0 = velocidad constante seca; 0.49 = easing suave de punta a punta
 *   --click      selector CSS a clicar antes de grabar (p.ej. banner de cookies)
 *   --hide       selectores CSS a ocultar, separados por coma
 *   --headful    abre Chrome con ventana visible (para depurar)
 *   --keep       conserva los fotogramas sueltos en el directorio temporal
 *   --chrome     ruta al ejecutable de Chrome (si no, se autodetecta)
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

const url = arg('url');
if (!url) {
  console.error('Falta --url. Ejemplo: node scripts/record-page.mjs --url https://www.cstravelgroup.com/');
  process.exit(1);
}

const width = num('width', 1920);
const height = num('height', 1080);
const scale = num('scale', 1);
const fps = num('fps', 60);
const duration = num('duration', 20);
const holdStart = num('hold-start', 2);
const holdEnd = num('hold-end', 2);
const waitExtra = num('wait', 2.5);
const quality = num('quality', 95);
const ramp = num('ramp', 0.15);
const clickSelector = arg('click');
const hideSelectors = String(arg('hide', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const headful = arg('headful') === true;
const keepFrames = arg('keep') === true;

const defaultOut = (() => {
  const u = new URL(url);
  const slug = (u.hostname + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return path.join('docs', 'video', `${slug || 'page'}.mp4`);
})();
const out = path.resolve(String(arg('out', defaultOut)));

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
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('No encontre Chrome. Pasalo con --chrome "ruta/al/chrome.exe" o CHROME_PATH.');
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- grabacion ----------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-page-'));
const frames = []; // { file, ts }

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: !headful,
  defaultViewport: { width, height, deviceScaleFactor: scale },
  args: [
    '--hide-scrollbars',
    '--disable-infobars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    `--window-size=${width},${height}`,
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });

  console.log(`-> cargando ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 }).catch((e) => {
    console.warn(`   (networkidle2 no llego: ${e.message}) — sigo con lo cargado`);
  });

  if (clickSelector && typeof clickSelector === 'string') {
    const el = await page.$(clickSelector);
    if (el) {
      await el.click().catch(() => {});
      console.log(`-> clic en ${clickSelector}`);
    } else {
      console.warn(`   no encontre ${clickSelector}, sigo`);
    }
    await sleep(600);
  }

  if (hideSelectors.length) {
    await page.addStyleTag({ content: `${hideSelectors.join(',')} { display: none !important; }` });
  }

  // sin barras de scroll ni caret, y con las fuentes ya listas.
  // scroll-behavior:auto es imprescindible: con "smooth" (lo lleva esta landing y
  // muchas otras) cada scrollTo reinicia la animacion suave del navegador, el
  // barrido por fotograma se queda clavado y la pagina salta de golpe al soltar.
  await page.addStyleTag({
    content: `::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
              html{scrollbar-width:none!important}
              html,body,*{scroll-behavior:auto!important}
              *{caret-color:transparent!important}`,
  });
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});

  // precarga: bajo rapido y vuelvo arriba para disparar lazy-loading e imagenes
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.9);
    const max = document.documentElement.scrollHeight;
    for (let y = 0; y < max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await sleep(waitExtra * 1000);

  // screencast por CDP
  const client = await page.createCDPSession();
  let n = 0;
  client.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    const file = path.join(tmpDir, `f${String(n++).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, ts: (metadata && metadata.timestamp) || Date.now() / 1000 });
    try {
      await client.send('Page.screencastFrameAck', { sessionId });
    } catch {}
  });

  console.log('-> grabando');
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality,
    maxWidth: width * scale,
    maxHeight: height * scale,
    everyNthFrame: 1,
  });

  await sleep(holdStart * 1000);

  // barrido de scroll con easing (easeInOutCubic), en el hilo de render de la pagina.
  // La altura se remide en cada fotograma: hay paginas que crecen al bajar
  // (lazy-loading, pin-spacers de ScrollTrigger) y con un maximo fijo se cortaria.
  const swept = await page.evaluate(async (secs, ramp) => {
    // Velocidad constante con rampas suaves al arrancar y al frenar.
    // Un easing tipo easeInOutCubic sobre todo el barrido se arrastra al
    // principio y llega al final antes de tiempo; con rampas cortas el grueso
    // del recorrido va a ritmo uniforme, que es lo que se lee bien en video.
    const r = Math.min(0.49, Math.max(0, ramp));
    const total = 1 - r;
    const ease = (t) => {
      if (total <= 0) return t;
      let a;
      if (t < r) { const u = t / r; a = r * (u * u * u - (u ** 4) / 2); }
      else if (t <= 1 - r) { a = r / 2 + (t - r); }
      else { const u = (1 - t) / r; a = total - r * (u * u * u - (u ** 4) / 2); }
      return Math.min(1, Math.max(0, a / total));
    };
    const t0 = performance.now();
    let last = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const p = Math.min(1, (now - t0) / (secs * 1000));
        last = Math.round(max * ease(p));
        window.scrollTo({ top: last, behavior: 'instant' });
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return { objetivo: last, real: Math.round(window.scrollY) };
  }, duration, ramp);

  // si el scroll real no siguio al objetivo, el video no sirve: avisar en vez de callar
  if (swept.objetivo > 0 && Math.abs(swept.real - swept.objetivo) > 50) {
    console.warn(`   aviso: el scroll quedo en ${swept.real}px de ${swept.objetivo}px esperados; ` +
                 'la pagina puede estar controlando el scroll por su cuenta');
  }

  await sleep(holdEnd * 1000);
  await client.send('Page.stopScreencast');
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
// lista de concat con la duracion real de cada fotograma (timestamps del compositor)
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

const ffArgs = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'concat', '-safe', '0', '-i', listFile,
  '-vf', `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  out,
];
console.log('-> montando MP4 con ffmpeg');
const code = await new Promise((resolve) => {
  const p = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('error', (e) => {
    console.error(`ffmpeg no arranco: ${e.message}`);
    resolve(1);
  });
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
console.log(`OK ${out}  —  ${secs}s, ${fps} fps, ${width}x${height}@${scale}x, ${mb} MB`);
