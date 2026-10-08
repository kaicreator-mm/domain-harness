import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideKindCompatibility,
  type SupportedKindSet,
} from '../../src/contracts/kind-compatibility.js';
import type { KindRef } from '../../src/contracts/component.js';

test('#573: successful Kind compatibility evidence is fresh and runtime-immutable', () => {
  const required = { kindId: 'workflow.standard', version: '1.0.0' } as {
    kindId: string;
    version: string;
  };
  const supportedEntry = { kindId: 'workflow.standard', version: '1.0.0' } as {
    kindId: string;
    version: string;
  };
  const supported: SupportedKindSet = [supportedEntry as KindRef];

  const result = decideKindCompatibility(required as KindRef, supported);

  assert.deepEqual(result, {
    status: 'SUPPORTED',
    supportedKind: { kindId: 'workflow.standard', version: '1.0.0' },
  });
  assert.notStrictEqual(result.supportedKind, required);
  assert.notStrictEqual(result.supportedKind, supportedEntry);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.supportedKind), true);

  required.version = '9.9.9';
  supportedEntry.version = '8.8.8';

  assert.deepEqual(result.supportedKind, {
    kindId: 'workflow.standard',
    version: '1.0.0',
  });
  assert.throws(
    () => {
      (result.supportedKind as { version: string }).version = '7.7.7';
    },
    TypeError,
  );
  assert.equal(result.supportedKind.version, '1.0.0');
});
