/**
 * partnerQr.js
 * =============================================================================
 * Enlace corto y QR del aliado (A-05/A-06). Lo usan la bandeja del admin y el
 * expediente del aliado, para que ambos generen exactamente la misma pieza.
 *
 * La libreria de QR se carga bajo demanda desde cdnjs: solo pesa cuando alguien
 * abre un aliado activo.
 * =============================================================================
 */

const SITE = 'https://www.cstravelgroup.com';

export const partnerLink = (code) => `${SITE}/${code}`;

// QR: la libreria se carga bajo demanda desde cdnjs (solo al abrir un aliado activo).
let qrLib = null;
function loadQrLib() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (qrLib) return qrLib;
  qrLib = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => resolve(window.QRCode);
    script.onerror = () => { qrLib = null; reject(new Error('No se pudo cargar el generador de QR.')); };
    document.head.appendChild(script);
  });
  return qrLib;
}

/** Dibuja el QR en alta resolucion (para imprimir) y lo muestra reducido. */
export async function drawPartnerQr(host, code) {
  const QR = await loadQrLib();
  const tmp = document.createElement('div');
  new QR(tmp, { text: partnerLink(code), width: 1000, height: 1000, correctLevel: QR.CorrectLevel.H });
  const qrCanvas = tmp.querySelector('canvas');
  // Lienzo final: margen blanco + la direccion escrita debajo, listo para piezas impresas.
  const pad = 80;
  const out = document.createElement('canvas');
  out.width = 1000 + pad * 2;
  out.height = 1000 + pad * 2 + 110;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(qrCanvas, pad, pad);
  ctx.fillStyle = '#0a2540';
  ctx.font = '700 58px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`cstravelgroup.com/${code}`, out.width / 2, 1000 + pad + 95);
  out.className = 'ally-qr__canvas';
  host.innerHTML = '';
  host.appendChild(out);
  return out;
}

/** Descarga un canvas como PNG. */
export function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
