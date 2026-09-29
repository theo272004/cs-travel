// Re-empaqueta el portal (este repo) dentro del sitio real:
//   cstravelgroup/public/portal-app
// Equivalente a scripts/rebundle-portal.sh, pero sin rutas fijas de otra
// maquina ni ffmpeg: Vite nombra cada imagen por su contenido, asi que si un
// fondo no cambio su .webp ya existe en el bundle anterior y se reutiliza.
// Si aparece un fondo nuevo, el script se detiene y dice cual convertir.
//
// SEGURIDAD (semilla sin contraseñas ni datos demo):
//   localApiAdapter.js importa src/data/db.json como semilla del demo. En el
//   portal REAL los recursos de REAL (realApiAdapter.js: usuarios, empresas,
//   médicos, casos, solicitudes, códigos, referidos, cotizaciones) vienen de
//   Wix y la semilla solo se usaria para recursos que aún no están en Wix.
//   Por eso este build carga db.json SIN las colecciones de REAL (su copia
//   demo nunca se lee alli y solo filtraria nombres y correos de ejemplo), sin
//   los datos demo de Eventos (ver SOLO_DEMO) y sin ningún campo `password`,
//   mediante el plugin semillaSinUsuarios(). Antes de copiar nada, revisa el
//   bundle: si encuentra alguna contraseña demo de db.json, un campo password
//   en los datos o el correo de un usuario demo, se detiene y NO toca
//   cstravelgroup. El build normal del demo (npx vite build, GitHub Pages)
//   no pasa por aquí y conserva el login de demostración.
//
// Uso:
//   node scripts/rebundle-local.mjs [ruta/a/cstravelgroup]
//   node scripts/rebundle-local.mjs --solo-build --out <carpeta>
//        (solo compila el bundle del portal real en <carpeta> y lo revisa;
//         no copia nada a cstravelgroup. Sirve para comprobar el build.)
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const dbPath = path.join(repo, 'src', 'data', 'db.json');

const args = process.argv.slice(2);
const soloBuild = args.includes('--solo-build');
const outIndex = args.indexOf('--out');
const outArg = outIndex >= 0 ? args[outIndex + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && (outIndex < 0 || i !== outIndex + 1));

/**
 * Colecciones que NO viajan al portal real:
 *   - users: los usuarios reales están en Wix y la semilla trae las
 *     contraseñas de prueba del demo.
 *   - Eventos: son datos de demostración. El menú «Eventos» está oculto en el
 *     bundle desplegado hasta que exista su backend; si viajaran, sus alertas
 *     falsas podrían aparecer en la Cola de trabajo del admin real.
 */
const SOLO_DEMO = ['users', 'events', 'eventPackages', 'eventAccounts', 'eventGuests', 'eventLedger', 'eventLog'];

/**
 * Colecciones que en el portal real salen de Wix (el Set REAL de
 * realApiAdapter.js). Se leen del archivo para que no haya dos listas que
 * mantener; si no se encuentran, el build se detiene.
 */
function coleccionesReales() {
  const src = fs.readFileSync(path.join(repo, 'src', 'services', 'realApiAdapter.js'), 'utf8');
  const m = /const REAL = new Set\(\[([^\]]+)\]\)/.exec(src);
  if (!m) throw new Error('No encontré el Set REAL en realApiAdapter.js; no sigo.');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const FUERA_DEL_BUNDLE = [...new Set([...SOLO_DEMO, ...coleccionesReales()])];

/**
 * Plugin de Vite: cuando el bundle pide src/data/db.json, entrega una copia
 * sin las colecciones SOLO_DEMO y sin campos `password` en ninguna colección.
 */
function semillaSinUsuarios() {
  const target = path.normalize(dbPath).toLowerCase();
  return {
    name: 'cs-semilla-sin-usuarios',
    enforce: 'pre',
    load(id) {
      const file = path.normalize(id.split('?')[0]).toLowerCase();
      if (file !== target) return null;
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      for (const name of FUERA_DEL_BUNDLE) delete db[name];
      for (const list of Object.values(db)) {
        if (!Array.isArray(list)) continue;
        for (const record of list) if (record && typeof record === 'object') delete record.password;
      }
      return JSON.stringify(db);
    },
  };
}

/** Todos los archivos de una carpeta (recursivo). */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/**
 * Revisa que el bundle no lleve contraseñas demo. Nunca imprime las
 * contraseñas: solo dice en qué archivo aparecen.
 */
function revisarSinContrasenas(distDir) {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const secretos = [...new Set((db.users || []).map((u) => u.password).filter((p) => typeof p === 'string' && p.length >= 6))];
  const correos = [...new Set((db.users || []).map((u) => u.email).filter(Boolean))];
  const hallazgos = new Set();
  for (const file of walk(distDir).filter((f) => /\.(js|mjs|html|css|json|map|txt)$/.test(f))) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(distDir, file);
    if (secretos.some((s) => text.includes(s))) hallazgos.add(`${rel} (contraseña demo)`);
    if (correos.some((c) => text.includes(c))) hallazgos.add(`${rel} (correo de usuario demo)`);
    if (rel.endsWith('.map')) hallazgos.add(`${rel} (mapa de fuente)`);
    if (/\bpassword\s*:\s*["'`]/.test(text) || /"password"\s*:\s*"/.test(text)) hallazgos.add(`${rel} (campo password)`);
  }
  if (hallazgos.size) {
    throw new Error(`El bundle del portal real lleva datos demo en: ${[...hallazgos].join(', ')}. No se copió nada.`);
  }
  console.log(`   sin contraseñas demo (${secretos.length} revisadas), sin correos demo (${correos.length}) y sin mapas de fuente`);
}

/** Build del portal real (base /portal-app/) con la semilla sin usuarios. */
async function buildPortalReal(outDir) {
  await build({
    root: repo,
    base: '/portal-app/',
    logLevel: 'warn',
    plugins: [semillaSinUsuarios()],
    build: { outDir, emptyOutDir: true },
  });
}

if (soloBuild) {
  const outDir = path.resolve(outArg || path.join(repo, 'dist-portal-real'));
  console.log(`1) build del portal real (base /portal-app/, semilla sin usuarios) en ${outDir}`);
  await buildPortalReal(outDir);
  console.log('2) revisar que no haya contraseñas');
  revisarSinContrasenas(outDir);
  console.log('listo (solo build, no se copió nada a cstravelgroup)');
  process.exit(0);
}

const site = path.resolve(positional[0] || path.join(repo, '..', 'cstravelgroup'));
const destino = path.join(site, 'public', 'portal-app');
if (!fs.existsSync(destino)) throw new Error(`No encuentro ${destino}`);

console.log('1) build con base /portal-app/ (semilla sin usuarios ni contraseñas)');
const dist = path.join(repo, 'dist');
await buildPortalReal(dist);

console.log('2) revisar que no haya contraseñas demo en el bundle');
revisarSinContrasenas(dist);

const nuevos = path.join(dist, 'assets');
const viejos = path.join(destino, 'assets');

console.log('3) fondos PNG -> WebP ya existentes');
const pngs = fs.readdirSync(nuevos).filter((f) => f.endsWith('.png') && !f.startsWith('logo-cs'));
const faltan = [];
for (const png of pngs) {
  const webp = png.replace(/\.png$/, '.webp');
  const previo = path.join(viejos, webp);
  if (!fs.existsSync(previo)) { faltan.push(png); continue; }
  fs.copyFileSync(previo, path.join(nuevos, webp));
  fs.rmSync(path.join(nuevos, png));
  for (const f of fs.readdirSync(nuevos).filter((x) => /\.(js|css)$/.test(x))) {
    const ruta = path.join(nuevos, f);
    fs.writeFileSync(ruta, fs.readFileSync(ruta, 'utf8').split(png).join(webp));
  }
  console.log(`   ${png} -> ${webp}`);
}
if (faltan.length) {
  throw new Error(`Fondos nuevos sin WebP (convertirlos a mano y repetir): ${faltan.join(', ')}`);
}

console.log('4) reemplazar portal-app');
fs.rmSync(destino, { recursive: true, force: true });
fs.cpSync(dist, destino, { recursive: true });
console.log('listo:', destino);
