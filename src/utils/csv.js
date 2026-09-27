/**
 * csv.js
 * =============================================================================
 * PROPOSITO:
 *   Una sola forma de armar y descargar los CSV del portal (aliados, contratos
 *   firmados, cierre contable...). Antes cada vista escapaba a su manera y
 *   ninguna protegia contra la INYECCION DE FORMULAS.
 *
 * QUE RESUELVE:
 *   1) Comillas y separador: una celda con ; , " o saltos de linea va entre
 *      comillas y las comillas internas se duplican (RFC 4180).
 *   2) Inyeccion de formulas (CSV injection): Excel, LibreOffice y Google
 *      Sheets EJECUTAN como formula una celda que empieza por = + - @, tabulador
 *      o retorno de carro. Varios campos llegan de formularios publicos
 *      (empresa, cargo, notas, concepto del cobro), asi que alguien podria
 *      escribir =HYPERLINK(...) o un comando DDE y el admin lo dispararia al
 *      abrir el archivo. Esas celdas se neutralizan anteponiendo un apostrofo
 *      ('), la medida que recomienda OWASP. Los numeros puros (-12000, +57,
 *      1.250,50) no son formulas y se dejan tal cual para no romper sumas.
 *   3) BOM UTF-8 al inicio para que Excel respete las tildes y la eñe.
 *   4) Separador ';' por defecto: es el que espera Excel en español (es-CO).
 *
 * USO:
 *   downloadCsv('aliados-2026-09-26.csv', [
 *     ['Empresa', (a) => a.company],
 *     ['Correo', (a) => a.email],
 *   ], filas);
 *
 *   // CSV que ya viene armado (p. ej. del servidor): se vuelve a sanear.
 *   downloadCsvText('cierre.csv', textoDelServidor);
 * =============================================================================
 */

import { isDateOnly, localDayISO, parseLocalDate } from './formatDate.js';

const BOM = '﻿';

/**
 * Caracteres que convierten una celda en formula al abrirla en una hoja:
 * = + - @, tabulador, retorno y salto de linea, y sus variantes de ancho
 * completo (U+FF1D U+FF0B U+FF0D U+FF20), que algunas hojas convierten a las
 * normales al evaluar.
 */
const FORMULA_START = /^[=+\-@\t\r\n＝＋－＠]/;

/** Numero "puro": signo opcional, digitos, puntos y comas. No es formula. */
const PLAIN_NUMBER = /^[-+]?\d[\d.,]*$/;

/**
 * neutralizeFormula()
 * Antepone un apostrofo a los textos que una hoja de calculo interpretaria
 * como formula. Mira tambien despues de los espacios y saltos de linea
 * iniciales, porque algunas hojas los recortan antes de evaluar (p. ej. una
 * celda entre comillas "\n=HYPERLINK(...)" de un CSV del servidor, que
 * sanitizeCsvText no aplana).
 * @param {string} text
 * @returns {string}
 */
export function neutralizeFormula(text) {
  const s = String(text ?? '');
  if (!s) return s;
  // \s cubre espacio, NBSP, espacio ideografico, tabulador y saltos de linea.
  const trimmed = s.replace(/^\s+/, '');
  if (!FORMULA_START.test(s) && !FORMULA_START.test(trimmed)) return s;
  if (PLAIN_NUMBER.test(s.trim())) return s;
  // Un signo suelto («-» como "sin dato») no tiene operandos: no es formula.
  if (/^\s*[-+]\s*$/.test(s)) return s;
  return "'" + s;
}

/**
 * csvCell()
 * Convierte un valor en una celda segura.
 * @param {*} value      - Texto, numero, booleano, fecha, null...
 * @param {object} [opts]
 * @param {string} [opts.separator=';']
 * @param {boolean} [opts.flatten=true] - Reemplaza saltos de linea por espacio
 *   (una fila del archivo = una fila de la tabla, mas facil de filtrar).
 * @returns {string}
 */
export function csvCell(value, { separator = ';', flatten = true } = {}) {
  if (value === null || value === undefined) return '';
  // Los numeros reales nunca son formula: se escriben tal cual.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();

  let s = String(value);
  if (flatten) s = s.replace(/\r\n|\r|\n/g, ' ');
  s = neutralizeFormula(s);

  const mustQuote = s.includes('"') || s.includes(separator) || /[\r\n]/.test(s)
    || s.includes(',') || s.includes(';') || /^\s|\s$/.test(s);
  return mustQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * toCsv()
 * @param {Array<[string, (row:any)=>any]>} columns - [titulo, lector] por columna.
 * @param {Array<any>} rows
 * @param {object} [opts]
 * @param {string} [opts.separator=';']
 * @param {boolean} [opts.bom=true]
 * @returns {string} Texto CSV con fin de linea \r\n (el que prefiere Excel).
 */
export function toCsv(columns, rows, { separator = ';', bom = true } = {}) {
  const opts = { separator };
  const lines = [
    columns.map(([title]) => csvCell(title, opts)).join(separator),
    ...(rows || []).map((row) => columns.map(([, get]) => {
      let value;
      try { value = get(row); } catch { value = ''; }
      return csvCell(value, opts);
    }).join(separator)),
  ];
  return (bom ? BOM : '') + lines.join('\r\n') + '\r\n';
}

/**
 * parseCsv()
 * Lector minimo de CSV (comillas, comillas dobles, saltos dentro de comillas).
 * Sirve para volver a sanear un CSV armado en otro lado.
 * @param {string} text
 * @param {string} [separator=';']
 * @returns {string[][]}
 */
export function parseCsv(text, separator = ';') {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = false; }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === separator) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row);
      row = []; cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * sanitizeCsvText()
 * Re-escribe un CSV ya armado con las mismas reglas de toCsv (comillas,
 * formulas neutralizadas, BOM). Conserva el orden de filas y columnas.
 * @param {string} text
 * @param {string} [separator=';']
 * @returns {string}
 */
export function sanitizeCsvText(text, separator = ';') {
  const rows = parseCsv(text, separator);
  const opts = { separator, flatten: false };
  return BOM + rows.map((r) => r.map((v) => csvCell(v, opts)).join(separator)).join('\r\n') + '\r\n';
}

/** Descarga un texto como archivo, sin pasar por el servidor. */
function saveText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * downloadCsv()
 * Arma el CSV con toCsv() y lo descarga.
 * @param {string} filename
 * @param {Array<[string, (row:any)=>any]>} columns
 * @param {Array<any>} rows
 * @param {object} [opts] - Igual que toCsv().
 * @returns {string} El texto generado (util para pruebas).
 */
export function downloadCsv(filename, columns, rows, opts = {}) {
  const text = toCsv(columns, rows, opts);
  saveText(filename, text);
  return text;
}

/**
 * downloadCsvText()
 * Descarga un CSV que ya viene armado (del servidor), saneandolo antes.
 * @param {string} filename
 * @param {string} text
 * @param {string} [separator=';']
 * @returns {string}
 */
export function downloadCsvText(filename, text, separator = ';') {
  const clean = sanitizeCsvText(text, separator);
  saveText(filename, clean);
  return clean;
}

/** Fecha local de hoy como 'YYYY-MM-DD' para el nombre del archivo. */
export function csvDateStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * csvDateTime()
 * Fecha para una celda, en la hora LOCAL de quien exporta:
 *   - "2026-09-27T04:16:43Z" -> "2026-09-26 23:16" en Bogotá (el ISO en UTC
 *     mostraba en Excel el día siguiente a partir de las 7 p. m.).
 *   - "2026-07-15" (sin hora) -> "2026-07-15" tal cual.
 * @param {string|number|Date} value
 * @returns {string} "" si no hay fecha o no es válida.
 */
export function csvDateTime(value) {
  if (value === null || value === undefined || value === '') return '';
  if (isDateOnly(value)) return localDayISO(value);
  const date = parseLocalDate(value);
  if (!date) return String(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${localDayISO(date)} ${p(date.getHours())}:${p(date.getMinutes())}`;
}
