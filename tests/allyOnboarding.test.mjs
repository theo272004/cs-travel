import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSignature } from '../src/utils/allyOnboarding.js';

test('la firma en campos sueltos llega al panel como objeto', () => {
  const firmado = withSignature({
    id: 'a', signedAt: '2026-11-06T03:53:19.554Z', signerName: 'Ana Ruiz', signerDoc: '123',
    signerPosition: 'Gerente', agreementVersion: 'v1', agreementHash: 'abc', signerIp: '1.1.1.1',
  });
  assert.deepEqual(firmado.signature, {
    name: 'Ana Ruiz', doc: '123', position: 'Gerente', signedAt: '2026-11-06T03:53:19.554Z',
    agreementVersion: 'v1', agreementHash: 'abc', ip: '1.1.1.1', certificateUrl: '',
  });
});

test('sin firma no inventa una, y la que ya viene no se toca', () => {
  assert.equal(withSignature({ id: 'b', signedAt: '' }).signature, undefined);
  const signature = { name: 'Ya viene' };
  assert.equal(withSignature({ id: 'c', signature, signedAt: 'x', signerName: 'Otro' }).signature, signature);
  assert.equal(withSignature(null), null);
});
