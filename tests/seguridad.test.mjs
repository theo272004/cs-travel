// seguridad.test.mjs
// =============================================================================
// Pruebas de las piezas de seguridad del portal (docs/SEGURIDAD-PORTAL.md):
//   - escapeHtml(): lo que se pinta con innerHTML.
//   - safeUrl() / safeHashRoute(): direcciones que vienen de datos.
//   - payHref(): el enlace de pago no deja pasar montos ni cadenas raras.
//   - que ninguna plantilla HTML de src/ pinte un dato sin escapar (barrido
//     del codigo con el analizador de Rollup).
//   npm test
// =============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml } from '../src/utils/escapeHtml.js';
import { safeUrl, safeHashRoute } from '../src/utils/safeUrl.js';

describe('escapeHtml', () => {
  test('neutraliza etiquetas y comillas', () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(escapeHtml("' & \""), '&#039; &amp; &quot;');
  });
  test('null y undefined quedan vacios; numeros como texto', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(42), '42');
  });
});

describe('safeUrl', () => {
  test('deja pasar las direcciones que usa el portal', () => {
    for (const ok of [
      'https://www.cstravelgroup.com/pagar?reference=A1',
      'http://localhost:5173/',
      'mailto:hola@cstravelgroup.com',
      'tel:+573001234567',
      'blob:https://www.cstravelgroup.com/1234-5678',
      '#/admin/dashboard',
      '/api/aliados/documento?type=rut',
      './assets/logo.png',
      'archivo.pdf',
    ]) {
      assert.equal(safeUrl(ok), ok, ok);
    }
  });

  test('bloquea javascript:, data:, vbscript: y variantes con espacios', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      '\u0001javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:image/svg+xml;base64,PHN2Zz4=',
      '//evil.example.com/x',
      'file:///C:/Windows',
    ]) {
      assert.equal(safeUrl(bad), '', JSON.stringify(bad));
    }
  });

  test('imagenes data: solo si se piden y solo de mapa de bits', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    assert.equal(safeUrl(png), '');
    assert.equal(safeUrl(png, { images: true }), png);
    assert.equal(safeUrl('data:image/svg+xml;base64,PHN2Zz4=', { images: true }), '');
  });

  test('usa el valor de reemplazo cuando la direccion no sirve', () => {
    assert.equal(safeUrl('javascript:alert(1)', { fallback: '#' }), '#');
    assert.equal(safeUrl('', { fallback: '#' }), '#');
  });
});

describe('safeHashRoute', () => {
  test('solo rutas internas #/...', () => {
    assert.equal(safeHashRoute('#/admin/companies/5'), '#/admin/companies/5');
    assert.equal(safeHashRoute('https://evil.example.com'), '#/');
    assert.equal(safeHashRoute('javascript:alert(1)'), '#/');
    assert.equal(safeHashRoute('#/x" onmouseover="y'), '#/');
    assert.equal(safeHashRoute(null, '#/login'), '#/login');
  });
});

describe('payHref (enlace de pago)', async () => {
  const { payHref, payTargetAttrs } = await import('../src/utils/payLink.js');
  const setPath = (pathname) => { globalThis.window = { location: { pathname } }; };

  test('demo: monto entero positivo; nada de montos negativos, NaN o texto', () => {
    setPath('/');
    assert.equal(payHref({ reference: 'case:7', concept: 'Cotización', amount: 1500000.4 }),
      '#/doctor/dashboard/pagos?reference=case%3A7&concept=Cotizaci%C3%B3n&amount=1500000');
    assert.equal(payHref({ reference: 'case:7', amount: -5 }), '#/doctor/dashboard/pagos?reference=case%3A7');
    assert.equal(payHref({ reference: 'case:7', amount: 'abc' }), '#/doctor/dashboard/pagos?reference=case%3A7');
    assert.equal(payTargetAttrs(), '');
  });

  test('portal real: nunca lleva el monto y abre con noopener noreferrer', () => {
    setPath('/portal-app/index.html');
    const href = payHref({ reference: 'request:9', concept: 'Viaje', amount: 99 });
    assert.equal(href, 'https://www.cstravelgroup.com/pagar?reference=request%3A9&concept=Viaje');
    assert.ok(!href.includes('amount'));
    assert.equal(payTargetAttrs(), ' target="_blank" rel="noopener noreferrer"');
  });

  test('referencia y concepto: se codifican, sin controles y con largo maximo', () => {
    setPath('/');
    const href = payHref({ reference: 'a&b=c#d\n', concept: 'x'.repeat(500) });
    assert.ok(href.startsWith('#/doctor/dashboard/pagos?reference=a%26b%3Dc%23d&concept='));
    assert.equal(new URLSearchParams(href.split('?')[1]).get('concept').length, 120);
    delete globalThis.window;
  });
});
