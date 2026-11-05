// Copia las reglas de Eventos al servidor, para que existan una sola vez.
//   node scripts/sync-events-server.mjs [ruta/a/cstravelgroup]
// Escribe tambien las huellas: tests/eve-*.test.ts del servidor falla si alguien
// edita alla una copia sin pasar por aqui.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.resolve(process.argv[2] || path.join(repo, '..', 'cstravelgroup'));
const destino = path.join(site, 'src', 'lib', 'events');

const ARCHIVOS = ['utils/eventLedger.js', 'utils/eventTemplates.js', 'services/eventService.js'];
const huellas = {};
for (const rel of ARCHIVOS) {
  const texto = fs.readFileSync(path.join(repo, 'src', rel), 'utf8').replace(/\r\n/g, '\n');
  fs.mkdirSync(path.dirname(path.join(destino, rel)), { recursive: true });
  fs.writeFileSync(path.join(destino, rel), texto);
  huellas[rel] = crypto.createHash('sha256').update(texto).digest('hex');
}
fs.writeFileSync(path.join(destino, 'huellas.json'), `${JSON.stringify(huellas, null, 2)}\n`);
console.log('copiado a', destino);
