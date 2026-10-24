import test from 'node:test';
import assert from 'node:assert/strict';
// Acquire contracts through the same module channel the legacy shims use:
// the bare ESM package import (A2 static re-export form). A shim that
// redeclared a class would still produce a fresh class object that is
// reference-unequal to the package instance compared here.
import {
  V10Error,
  V10BuildError,
  QualifiedPackageError,
  IdentityContractError,
  V10_BUILD_FORMAT,
  V10_SELECTED_ROLE_ABI,
  canonicalJson,
  sha256Canonical,
  isPlainRecord,
  canonicalJsonStringify,
} from '@kaicreator/domain-harness-contracts';
import { V10Error as OldError, V10BuildError as OldBuildError } from '../../domain-harness-compiler/src/qualified-package/v10build/errors.js';
import { QualifiedPackageError as OldQualifiedError } from '../../domain-harness/src/public-v8/contracts.js';
import { IdentityContractError as OldIdentityError } from '../../domain-harness/src/contracts/identity.js';
test('T00: moved runtime error classes have a single identity through legacy shims', () => {
  assert.strictEqual(OldError, V10Error);
  assert.strictEqual(OldBuildError, V10BuildError);
  assert.strictEqual(OldQualifiedError, QualifiedPackageError);
  assert.strictEqual(OldIdentityError, IdentityContractError);
});
test('T00: canonical ABI/digest/guards/snapshot preserve exact known vectors', () => {
  assert.equal(V10_BUILD_FORMAT, 'dh.v10.build/1');
  assert.equal(V10_SELECTED_ROLE_ABI['kernel-primary'], 'v08-kernel-abi/1');
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(sha256Canonical({ b: 2, a: 1 }), sha256Canonical({ a: 1, b: 2 }));
  assert.equal(isPlainRecord(Object.create(null)), true);
  assert.equal(isPlainRecord([]), false);
  assert.equal(canonicalJsonStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
});
