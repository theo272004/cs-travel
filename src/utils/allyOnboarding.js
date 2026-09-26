/**
 * allyOnboarding.js
 * =============================================================================
 * PROPOSITO:
 *   Todo lo que comparten el registro (RegisterView), el aliado
 *   (CompanyPartnerView) y el admin (AdminAlliesView) sobre el ALTA de un
 *   aliado:
 *     - los estados del proceso, en UNA sola lista (antes cada vista tenia la
 *       suya y el tablero del admin no conocia los estados del flujo
 *       automatico: las empresas en revision no aparecian en ninguna columna),
 *     - los documentos que se piden segun el tipo de persona,
 *     - la validacion de archivos y la conversion de fotos a PDF (todo el
 *       expediente se guarda en PDF),
 *     - las llamadas al servidor (portal real) o al almacen del demo.
 *
 * FLUJO:
 *   registrado -> (sube documentos + firma) -> en_evaluacion -> activo
 *                                  ^                |
 *                                  +-- correccion <-+    (o rechazado)
 *   Si el expediente no se envia en ACCESS_DAYS dias, el acceso temporal vence
 *   (vencido). Rechazados y vencidos pueden volver a registrarse.
 *
 * CONTRATO CON EL SERVIDOR: docs/PLAN-ALTA-ALIADOS.md. El runtime de Wix solo
 * enruta GET y POST, por eso no hay PUT/PATCH/DELETE.
 * =============================================================================
 */

import { isDeployedBundle } from './env.js';

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

/**
 * label: como lo ve el equipo de CS Travel. allyLabel: como lo ve el aliado.
 * step: paso del recorrido del aliado (Registro, Expediente, Revision, Activo).
 */
export const ALLY_STATUS = {
  registrado: { label: 'Completando expediente', allyLabel: 'Completa tu expediente', badge: 'badge--amber', step: 1 },
  en_evaluacion: { label: 'Por revisar', allyLabel: 'En revisión', badge: 'badge--blue', step: 2 },
  correccion: { label: 'Corrección pedida', allyLabel: 'Corrige tu expediente', badge: 'badge--violet', step: 1 },
  activo: { label: 'Activo', allyLabel: 'Convenio activo', badge: 'badge--green', step: 3 },
  rechazado: { label: 'Rechazado', allyLabel: 'Convenio no activo', badge: 'badge--red', step: -1 },
  vencido: { label: 'Acceso vencido', allyLabel: 'Tu acceso temporal venció', badge: 'badge--gray', step: -1 },
  // Flujo anterior (gestion manual). Se conservan para las solicitudes viejas.
  pendiente: { label: 'Pendiente', allyLabel: 'En revisión', badge: 'badge--amber', step: 1, legacy: true },
  contactado: { label: 'Contactado', allyLabel: 'En conversación', badge: 'badge--blue', step: 1, legacy: true },
  aprobado: { label: 'Aprobado', allyLabel: 'Aprobado', badge: 'badge--teal', step: 2, legacy: true },
  contrato_enviado: { label: 'Contrato enviado', allyLabel: 'Contrato por firmar', badge: 'badge--violet', step: 1, legacy: true },
  firmado: { label: 'Firmado', allyLabel: 'Acuerdo firmado', badge: 'badge--teal', step: 2, legacy: true },
};

/** Estados del flujo actual, en el orden en que avanza un aliado. */
export const FLOW_STATES = ['registrado', 'en_evaluacion', 'correccion', 'activo', 'rechazado', 'vencido'];
export const LEGACY_STATES = Object.keys(ALLY_STATUS).filter((s) => ALLY_STATUS[s].legacy);

/** Con estos estados el usuario es TEMPORAL: solo entra a su expediente. */
export const PENDING_STATES = ['registrado', 'en_evaluacion', 'correccion'];

/** El expediente se puede editar (subir, reemplazar) solo en estos estados. */
export const EDITABLE_STATES = ['registrado', 'correccion'];

/**
 * Usuario TEMPORAL: empresa cuyo expediente todavia no esta aprobado. La
 * sesion del portal real trae `allyStatus` (ver docs/PLAN-ALTA-ALIADOS.md).
 */
export const isTemporaryAlly = (session) => session?.role === 'company' && PENDING_STATES.includes(session.allyStatus);

export const allyStatus = (s) => ALLY_STATUS[s] || { label: s || '-', allyLabel: s || '-', badge: 'badge--gray', step: 0 };

/** Dias que dura el acceso temporal para completar el expediente. */
export const ACCESS_DAYS = 30;

// ---------------------------------------------------------------------------
// Requisitos
// ---------------------------------------------------------------------------

export const PERSON_TYPES = {
  juridica: { label: 'Persona jurídica', hint: 'S.A.S., S.A., Ltda., fundación, cooperativa…' },
  natural: { label: 'Persona natural', hint: 'Comerciante con matrícula mercantil a su nombre.' },
};

/**
 * Documentos del expediente.
 *   images: cuantas fotos se aceptan en lugar del PDF (se unen en un PDF).
 *   maxAgeDays: vigencia exigida. No la impone una ley para un convenio entre
 *     privados; es la practica habitual de verificacion (bancos, licitaciones)
 *     y la unica forma de saber que la representacion legal y la cuenta siguen
 *     vigentes hoy. La confirma quien revisa.
 */
export const DOCUMENTS = [
  {
    type: 'cedula',
    title: { juridica: 'Cédula del representante legal', natural: 'Tu cédula de ciudadanía' },
    hint: 'Las dos caras. Sube el PDF o dos fotos (frente y reverso): las unimos en un solo PDF.',
    images: 2,
    for: ['juridica', 'natural'],
  },
  {
    type: 'rut',
    title: { juridica: 'RUT de la empresa', natural: 'Tu RUT' },
    hint: 'Descárgalo actualizado del portal de la DIAN.',
    for: ['juridica', 'natural'],
  },
  {
    type: 'camara',
    title: { juridica: 'Certificado de existencia y representación legal' },
    hint: 'Lo expide la Cámara de Comercio.',
    maxAgeDays: 30,
    for: ['juridica'],
  },
  {
    type: 'matricula',
    title: { natural: 'Certificado de matrícula mercantil' },
    hint: 'Lo expide la Cámara de Comercio (registro mercantil de persona natural).',
    maxAgeDays: 30,
    for: ['natural'],
  },
  {
    type: 'banco',
    title: { juridica: 'Certificación bancaria de la empresa', natural: 'Tu certificación bancaria' },
    hint: 'Es la cuenta donde recibirás tu retorno. Debe estar a nombre del titular del convenio.',
    maxAgeDays: 30,
    for: ['juridica', 'natural'],
  },
];

export const normalizePersonType = (t) => (t === 'natural' ? 'natural' : 'juridica');

export function requiredDocs(personType) {
  const pt = normalizePersonType(personType);
  return DOCUMENTS.filter((d) => d.for.includes(pt)).map((d) => ({ ...d, title: d.title[pt] }));
}

export function docTitle(type, personType) {
  const d = DOCUMENTS.find((x) => x.type === type);
  if (!d) return type;
  return d.title[normalizePersonType(personType)] || Object.values(d.title)[0];
}

/** Lo que quien revisa confirma en cada documento antes de aprobarlo. */
export function reviewChecks(type) {
  const doc = DOCUMENTS.find((d) => d.type === type);
  const checks = ['Se lee completo y no está recortado', 'Corresponde al aliado registrado (nombre o razón social y NIT)'];
  if (type === 'cedula') checks.push('Es la persona que firmó el acuerdo');
  if (type === 'camara') checks.push('Quien firmó el acuerdo figura como representante legal');
  if (type === 'banco') checks.push('La cuenta está a nombre del titular del convenio');
  if (doc?.maxAgeDays) checks.push(`Expedido hace ${doc.maxAgeDays} días o menos`);
  return checks;
}

/**
 * Estado de cada documento del aliado, en el orden de los requisitos.
 * documents: [{ type, status: 'cargado'|'aprobado'|'rechazado', fileName, size, uploadedAt, reviewNote }]
 */
export function docSlots(ally) {
  const byType = Object.fromEntries((ally?.documents || []).map((d) => [d.type, d]));
  return requiredDocs(ally?.personType).map((req) => ({ ...req, file: byType[req.type] || null }));
}

export function expedienteProgress(ally) {
  const slots = docSlots(ally);
  const uploaded = slots.filter((s) => s.file && s.file.status !== 'rechazado').length;
  const approved = slots.filter((s) => s.file?.status === 'aprobado').length;
  const rejected = slots.filter((s) => s.file?.status === 'rechazado').length;
  return { total: slots.length, uploaded, approved, rejected, complete: uploaded === slots.length };
}

/** Dias que le quedan al acceso temporal (null si no aplica). */
export function daysLeft(ally) {
  if (!ally?.accessExpiresAt || !EDITABLE_STATES.includes(ally.status)) return null;
  return Math.max(0, Math.ceil((Date.parse(ally.accessExpiresAt) - Date.now()) / 86400000));
}

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------

export const MAX_PDF_MB = 10;
const MAX_IMAGE_MB = 20;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f) => IMAGE_TYPES.includes(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
export const formatSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Un PDF de verdad empieza con %PDF- (algunos traen basura antes: se tolera). */
async function looksLikePdf(file) {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  return String.fromCharCode(...head).includes('%PDF-');
}

/**
 * Valida lo que eligio el aliado para un documento y lo deja en PDF.
 * @returns {Promise<{ blob: Blob, name: string, size: number }>}
 */
export async function prepareFile(doc, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) throw new Error('Elige un archivo.');

  if (files.length === 1 && isPdf(files[0])) {
    const f = files[0];
    if (f.size > MAX_PDF_MB * 1048576) throw new Error(`El PDF pesa ${formatSize(f.size)}. El máximo es ${MAX_PDF_MB} MB.`);
    if (!(await looksLikePdf(f))) throw new Error('Ese archivo no es un PDF válido. Vuelve a descargarlo o expórtalo como PDF.');
    return { blob: f, name: f.name, size: f.size };
  }

  if (files.some(isPdf)) throw new Error('Sube un solo PDF, sin mezclarlo con fotos.');
  if (!doc.images) throw new Error('Este documento se recibe solo en PDF.');
  if (!files.every(isImage)) throw new Error('Solo se aceptan PDF o fotos (JPG, PNG, HEIC).');
  if (files.length > doc.images) throw new Error(`Máximo ${doc.images} fotos: frente y reverso.`);
  const big = files.find((f) => f.size > MAX_IMAGE_MB * 1048576);
  if (big) throw new Error(`La foto ${big.name} pesa demasiado (máximo ${MAX_IMAGE_MB} MB).`);

  const blob = await imagesToPdf(files);
  if (blob.size > MAX_PDF_MB * 1048576) throw new Error('Las fotos quedaron muy pesadas. Tómalas de nuevo con menos resolución.');
  return { blob, name: `${doc.type}.pdf`, size: blob.size };
}

/** Carga una foto respetando la orientacion de la camara. */
async function loadImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error(`No pudimos leer la foto ${file.name}. Si es HEIC, tómala en JPG o conviértela a PDF.`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Reduce la imagen (lado mayor <= 1800 px) y la devuelve como JPEG. */
async function toJpeg(source) {
  const w0 = source.width;
  const h0 = source.height;
  const scale = Math.min(1, 1800 / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * scale);
  canvas.height = Math.round(h0 * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // los PNG con transparencia saldrian en negro
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

export async function imagesToPdf(files) {
  const images = [];
  for (const f of files) images.push(await toJpeg(await loadImage(f)));
  return buildPdf(images);
}

/**
 * PDF minimo de una pagina A4 con las imagenes JPEG apiladas (como la
 * fotocopia de la cedula por ambas caras en una sola hoja). Sin librerias:
 * el JPEG va tal cual con el filtro DCTDecode.
 */
export function buildPdf(images) {
  const W = 595.28;
  const H = 841.89;
  const M = 36;
  const GAP = 18;
  const n = images.length;
  const slotH = (H - 2 * M - GAP * (n - 1)) / n;
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (num, body) => {
    offsets[num] = length;
    push(`${num} 0 obj\n${body}\nendobj\n`);
  };

  const content = images.map((img, i) => {
    const s = Math.min((W - 2 * M) / img.width, slotH / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    const x = (W - dw) / 2;
    const top = H - M - i * (slotH + GAP); // la primera imagen va arriba
    const y = top - slotH + (slotH - dh) / 2;
    return `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${i} Do Q`;
  }).join('\n');

  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const xobjects = images.map((_, i) => `/Im${i} ${5 + i} 0 R`).join(' ');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << ${xobjects} >> >> /Contents 4 0 R >>`);
  obj(4, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
  images.forEach((img, i) => {
    offsets[5 + i] = length;
    push(`${5 + i} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
    push(img.bytes);
    push('\nendstream\nendobj\n');
  });

  const count = 5 + n;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(`${table}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

/** Huella SHA-256 del texto del acuerdo: prueba de QUE version se firmo. */
export async function sha256(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Demo (GitHub Pages / local): el expediente vive en este navegador
// ---------------------------------------------------------------------------
// Metadatos en localStorage; los PDF en IndexedDB (localStorage no aguanta
// archivos de varios MB). Asi el demo recorre el flujo completo: la empresa
// sube y firma, el admin revisa en el mismo navegador y la empresa ve el
// resultado.

export const DEMO_EXPEDIENTE_KEY = 'cs_travel_demo_expediente';
export const DEMO_EXPEDIENTE_ID = 'demo-expediente';

function newDemoExpediente() {
  const now = new Date();
  return {
    id: DEMO_EXPEDIENTE_ID,
    company: 'Empresa Demo S.A.S.',
    nit: '901555777-2',
    contactName: 'Camila Torres',
    position: 'Gerente general',
    phone: '+57 300 555 0404',
    email: 'camila@empresademo.co',
    employees: '11-50',
    channel: 'colaboradores',
    personType: 'juridica',
    origin: '',
    status: 'registrado',
    memberId: 'demo',
    documents: [],
    signature: null,
    tags: [],
    owner: '',
    notes: [],
    history: [{ at: now.toISOString(), by: 'registro', from: '', to: 'registrado' }],
    createdAt: now.toISOString(),
    accessExpiresAt: new Date(now.getTime() + ACCESS_DAYS * 86400000).toISOString(),
  };
}

export function demoExpediente() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_EXPEDIENTE_KEY) || 'null');
    if (saved && saved.id === DEMO_EXPEDIENTE_ID) return saved;
  } catch { /* se recrea abajo */ }
  return saveDemoExpediente(newDemoExpediente());
}

export function saveDemoExpediente(ally) {
  try { localStorage.setItem(DEMO_EXPEDIENTE_KEY, JSON.stringify(ally)); } catch { /* sin almacenamiento */ }
  return ally;
}

export async function resetDemoExpediente() {
  try { localStorage.removeItem(DEMO_EXPEDIENTE_KEY); } catch { /* nada */ }
  await idb('clear');
  return demoExpediente();
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cs-travel-demo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(op, key, value) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', op === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('files');
      const req = op === 'get' ? store.get(key) : op === 'put' ? store.put(value, key) : store.clear();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** PDF de ejemplo para el demo: una hoja con el nombre del documento. */
export async function samplePdf(title, company) {
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a2d66';
  ctx.fillRect(0, 0, canvas.width, 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px Inter, Arial, sans-serif';
  ctx.fillText(title, 70, 95);
  ctx.fillStyle = '#111d4d';
  ctx.font = '34px Inter, Arial, sans-serif';
  ctx.fillText(company, 70, 250);
  ctx.fillStyle = '#c9d2e0';
  for (let y = 330; y < 1500; y += 58) ctx.fillRect(70, y, 900 + ((y * 37) % 200), 18);
  ctx.save();
  ctx.translate(620, 900);
  ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = 'rgba(192, 57, 43, 0.22)';
  ctx.font = 'bold 120px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EJEMPLO', 0, 0);
  ctx.restore();
  return buildPdf([await toJpeg(canvas)]);
}

// ---------------------------------------------------------------------------
// Servidor (portal real) o demo
// ---------------------------------------------------------------------------

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function withStatus(ally, to, by) {
  return { ...ally, status: to, updatedAt: new Date().toISOString(), history: [...(ally.history || []), { at: new Date().toISOString(), by, from: ally.status, to }] };
}

/** Lado del ALIADO: su propio expediente. */
export const expedienteApi = {
  /** Sube (o reemplaza) un documento. Devuelve el aliado actualizado. */
  async upload(type, file) {
    if (isDeployedBundle()) {
      const form = new FormData();
      form.append('type', type);
      form.append('file', file.blob, file.name);
      const res = await fetch('/api/aliados/documento', { method: 'POST', credentials: 'same-origin', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `No se pudo subir el archivo (error ${res.status}).`);
      return data.ally;
    }
    const ally = demoExpediente();
    if (!EDITABLE_STATES.includes(ally.status)) throw new Error('Tu expediente ya está en revisión.');
    await idb('put', type, file.blob);
    const entry = { type, status: 'cargado', fileName: file.name, size: file.size, uploadedAt: new Date().toISOString(), reviewNote: '' };
    const documents = [...(ally.documents || []).filter((d) => d.type !== type), entry];
    return saveDemoExpediente({ ...ally, documents });
  },

  /** URL para ver un documento propio (el servidor valida que sea suyo). */
  async fileUrl(type) {
    if (isDeployedBundle()) return `/api/aliados/documento?type=${encodeURIComponent(type)}`;
    const blob = await idb('get', type);
    return blob ? URL.createObjectURL(blob) : '';
  },

  /** Firma el acuerdo y envia el expediente completo a revision. */
  async submit(signature) {
    if (isDeployedBundle()) return (await postJson('/api/aliados/firma', signature)).ally;
    const ally = demoExpediente();
    if (!expedienteProgress(ally).complete) throw new Error('Faltan documentos por subir.');
    const now = new Date().toISOString();
    const signed = {
      ...ally,
      signature: { name: signature.name, doc: signature.doc, position: signature.position, signedAt: now, agreementVersion: signature.agreementVersion, agreementHash: signature.agreementHash },
      submittedAt: now,
    };
    return saveDemoExpediente(withStatus(signed, 'en_evaluacion', 'aliado'));
  },

  /** Reenvia el expediente despues de reemplazar lo que se pidio corregir. */
  async resubmit() {
    if (isDeployedBundle()) return (await postJson('/api/aliados/reenviar', {})).ally;
    const ally = demoExpediente();
    if (!expedienteProgress(ally).complete) throw new Error('Reemplaza los documentos marcados antes de reenviar.');
    return saveDemoExpediente(withStatus({ ...ally, submittedAt: new Date().toISOString() }, 'en_evaluacion', 'aliado'));
  },
};

/** Lado del ADMIN: ver y dictaminar el expediente de un aliado. */
export const reviewApi = {
  /** URL del PDF de un aliado. Solo el admin puede abrirla (lo valida el servidor). */
  async fileUrl(ally, type) {
    if (isDeployedBundle()) return `/api/aliados/admin/documento?id=${encodeURIComponent(ally.id)}&type=${encodeURIComponent(type)}`;
    if (ally.id === DEMO_EXPEDIENTE_ID) {
      const blob = await idb('get', type);
      if (blob) return URL.createObjectURL(blob);
    }
    return URL.createObjectURL(await samplePdf(docTitle(type, ally.personType), ally.company));
  },

  /**
   * Acciones del admin sobre el expediente, simuladas en el demo. En el portal
   * real van a /api/aliados/admin como el resto de acciones de la bandeja.
   */
  demo(ally, action, extra) {
    const now = new Date().toISOString();
    let next = ally;
    if (action === 'review') {
      const documents = (ally.documents || []).map((d) => (d.type === extra.type
        ? { ...d, status: extra.decision, reviewNote: extra.decision === 'rechazado' ? extra.note : '', checks: extra.checks || [], reviewedAt: now, reviewedBy: 'demo' }
        : d));
      next = { ...ally, documents };
    } else if (action === 'request-correction') {
      next = withStatus({ ...ally, correctionNote: extra.note || '' }, 'correccion', 'demo');
    } else if (action === 'reject') {
      next = withStatus({ ...ally, rejectReason: extra.reason || '' }, 'rechazado', 'demo');
    } else if (action === 'activate') {
      next = withStatus({ ...ally, partnerCode: extra.code, partnerTarget: extra.target }, 'activo', 'demo');
    }
    if (ally.id === DEMO_EXPEDIENTE_ID) saveDemoExpediente(next);
    return next;
  },
};
