/** v0.9 N07 public error contract P/N — pure, no Host/Kernel/SQLite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DomainHarnessV9Error,
  V9_PUBLIC_ERROR_CODES,
  publicInstalledReferenceFailure,
} from '../src/public-v9/errors.js';

test('V09-N07-E01: public D04 taxonomy is closed and has six stable distinct codes', () => {
  assert.deepEqual(Object.keys(V9_PUBLIC_ERROR_CODES).sort(), [
    'CALLER_SCOPE_DENIED', 'EFFECT_UNKNOWN', 'LIFECYCLE_FAILED',
    'OPERATION_NOT_BOUND', 'PACKAGE_NOT_AUTHORIZED', 'UNSUPPORTED_RUNTIME_ABI',
  ]);
  assert.equal(Object.isFrozen(V9_PUBLIC_ERROR_CODES), true);
  for (const code of Object.values(V9_PUBLIC_ERROR_CODES)) {
    const error = new DomainHarnessV9Error(code);
    assert.equal(error.name, 'DomainHarnessV9Error');
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    assert.ok(error instanceof Error);
    assert.equal(Object.hasOwn(error, 'cause'), false);
  }
});

test('V09-N07-E02: every installed-ref denial is one indistinguishable public family', () => {
  const protectedFailures = [
    'INSTALL_HANDLE_UNKNOWN', 'APPROVAL_REVOKED',
    'APPROVAL_STORE_UNAVAILABLE', 'PACKAGE_BYTES_MISMATCH',
    'ISSUER_WITHDRAWN', 'FOREIGN_AUDIENCE', 'ROOT_NOT_INSTALLED',
  ];
  const results = protectedFailures.map(reason => publicInstalledReferenceFailure(reason));
  for (const error of results) {
    assert.equal(error.code, 'PACKAGE_NOT_AUTHORIZED');
    assert.equal(error.message, 'Package is not installed or authorized.');
    assert.equal(error.name, 'DomainHarnessV9Error');
    for (const value of protectedFailures) {
      assert.equal(error.message.includes(value), false);
    }
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.deepEqual(Object.keys(error), ['name', 'code']);
  }
});

test('V09-N07-E03: never inspect arbitrary protected error input', () => {
  let readCount = 0;
  const sensitive = new Proxy({ token: 'secret-issuer-material' }, {
    get() { readCount++; throw new Error('protected getter must not run'); },
    ownKeys() { readCount++; throw new Error('protected keys must not be listed'); },
    getOwnPropertyDescriptor() { readCount++; throw new Error('protected descriptor must not be read'); },
  });
  const error = publicInstalledReferenceFailure(sensitive);
  assert.equal(readCount, 0);
  assert.equal(error.code, V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED);
  assert.equal(JSON.stringify(error).includes('secret'), false);
  assert.equal(error.stack?.includes('secret-issuer-material') ?? false, false);
});

test('V09-N07-E04: failure mapper does not perform installation or grant execution', () => {
  const returned = publicInstalledReferenceFailure();
  assert.ok(returned instanceof Error);
  assert.equal(typeof (returned as unknown as Record<string, unknown>).load, 'undefined');
  assert.equal(typeof (returned as unknown as Record<string, unknown>).install, 'undefined');
  assert.equal(typeof (returned as unknown as Record<string, unknown>).permit, 'undefined');
});
