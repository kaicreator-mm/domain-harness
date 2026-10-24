import test from 'node:test';
import assert from 'node:assert/strict';
// Acquire contracts through the same module channel the legacy shims use
// (createRequire over the resolved package entry). Under tsx the ESM-import
// cache and the require(esm) cache are distinct, so a bare `import` here
// would compare against a second instance and defeat the single-identity
// assertion. The assertion stays real: a shim that redeclared a class would
// produce a fresh class object that is reference-unequal to this one.
import { createRequire } from 'node:module';
const requireFromHere = createRequire(import.meta.url);
const contracts = requireFromHere(import.meta.resolve('@kaicreator/domain-harness-contracts')) as typeof import('../src/index.js');
import { V10Error as OldError, V10BuildError as OldBuildError } from '../../domain-harness-compiler/src/qualified-package/v10build/errors.js';
import { QualifiedPackageError as OldQualifiedError } from '../../domain-harness/src/public-v8/contracts.js';
import { IdentityContractError as OldIdentityError } from '../../domain-harness/src/contracts/identity.js';
test('T00: moved runtime error classes have a single identity through legacy shims', () => {
  assert.strictEqual(OldError, contracts.V10Error);
  assert.strictEqual(OldBuildError, contracts.V10BuildError);
  assert.strictEqual(OldQualifiedError, contracts.QualifiedPackageError);
  assert.strictEqual(OldIdentityError, contracts.IdentityContractError);
});
test('T00: canonical ABI/digest/guards/snapshot preserve exact known vectors', () => {
  assert.equal(contracts.V10_BUILD_FORMAT, 'dh.v10.build/1');
  assert.equal(contracts.V10_SELECTED_ROLE_ABI['kernel-primary'], 'v08-kernel-abi/1');
  assert.equal(contracts.canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(contracts.sha256Canonical({ b: 2, a: 1 }), contracts.sha256Canonical({ a: 1, b: 2 }));
  assert.equal(contracts.isPlainRecord(Object.create(null)), true);
  assert.equal(contracts.isPlainRecord([]), false);
  assert.equal(contracts.canonicalJsonStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
});
