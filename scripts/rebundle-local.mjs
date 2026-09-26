// Re-empaqueta el portal (este repo) dentro del sitio real:
//   cstravelgroup/public/portal-app
// Equivalente a scripts/rebundle-portal.sh, pero sin rutas fijas de otra
// maquina ni ffmpeg: Vite nombra cada imagen por su contenido, asi que si un
// fondo no cambio su .webp ya existe en el bundle anterior y se reutiliza.
// Si aparece un fondo nuevo, el script se detiene y dice cual convertir.
//
// Uso: node scripts/rebundle-local.mjs [ruta/a/cstravelgroup]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const site = path.resolve(process.argv[2] || path.join(repo, '..', 'cstravelgroup'));
const destino = path.join(site, 'public', 'portal-app');
if (!fs.existsSync(destino)) throw new Error(`No encuentro ${destino}`);

console.log('1) build con base /portal-app/');
execSync('npx vite build --base=/portal-app/', { cwd: repo, stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });

const dist = path.join(repo, 'dist');
const nuevos = path.join(dist, 'assets');
const viejos = path.join(destino, 'assets');

console.log('2) fondos PNG -> WebP ya existentes');
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

console.log('3) reemplazar portal-app');
fs.rmSync(destino, { recursive: true, force: true });
fs.cpSync(dist, destino, { recursive: true });
console.log('listo:', destino);
