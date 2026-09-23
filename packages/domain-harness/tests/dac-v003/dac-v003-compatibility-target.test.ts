// Issue #325 / DAC v0.0.3 V3-002 — the repaired required-target disposition
// rule inside real compatibility validation (CROSS_LAYER_REFERENCES §8;
// APPLICATION_MANIFEST §7.2/§15; conformance C43/C44):
//
//   missing required CompatibilityTargetRef          => FAIL_CLOSED
//   explicit target exists but unsupported            => INCOMPATIBLE
//
// The upstream #306 verdict's own v0.0.2 target never substitutes for the
// explicit v0.0.3 declaration, and disposition precedence follows §10/§15:
// structural absence dominates compatibility constraint failures.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DacV003CompatibilityError,
  adoptDacV003CompatibilityTargetRef,
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import {
  DAC_V003_BASELINE,
  DacV003ReferenceError,
} from '../../src/dac-v003/index.js';
import {
  V003_TARGET_PROFILE,
  buildCompatibleRequest,
} from './compatibility-fixture.js';

test('v3-002 target rule: missing explicit target => FAIL_CLOSED even though the #306 verdict carries its own v0.0.2 target (C43)', async () => {
  const request = await buildCompatibleRequest({ compatibilityTarget: undefined });
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'FAIL_CLOSED');
  assert.equal(validation.subject.targetProfile, undefined);
  assert.ok(
    validation.findings.some((f) => f.includes('missing required compatibility target')),
    'finding names the missing explicit target',
  );
});

test('v3-002 target rule: explicit target unsupported by the validator environment => INCOMPATIBLE (C44)', async () => {
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({ supportedTargetProfiles: ['domain-harness@other-profile'] }),
  );
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
  assert.equal(validation.subject.targetProfile, V003_TARGET_PROFILE);
  assert.ok(
    validation.findings.some((f) => f.includes('is declared but unsupported')),
  );
});

test('v3-002 target rule: an environment supporting nothing makes any explicit target INCOMPATIBLE, not FAIL_CLOSED', async () => {
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({ supportedTargetProfiles: [] }),
  );
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
});

test('v3-002 target rule: supported explicit target with full closure => COMPATIBLE', async () => {
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({ supportedTargetProfiles: [V003_TARGET_PROFILE] }),
  );
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.equal(validation.subject.targetProfile, V003_TARGET_PROFILE);
});

test('v3-002 target rule: structural absence dominates — missing target plus unsatisfied requirements stays FAIL_CLOSED', async () => {
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      compatibilityTarget: undefined,
      satisfactionEvidence: [],
    }),
  );
  assert.equal(validation.disposition.value, 'FAIL_CLOSED');
  assert.ok(validation.findings.some((f) => f.includes('missing required compatibility target')));
  assert.ok(validation.findings.some((f) => f.includes('is unsatisfied')));
});

test('v3-002 target rule: unsupported target plus unsatisfied requirements stays INCOMPATIBLE (explicit subject stays evaluable)', async () => {
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      supportedTargetProfiles: [],
      satisfactionEvidence: [],
    }),
  );
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
});

test('v3-002 target adoption enforces P5: no ambient "current" target', async () => {
  const baseline = { ...DAC_V003_BASELINE };
  let caught: unknown;
  try {
    adoptDacV003CompatibilityTargetRef({
      baseline,
      authorityScope: 'domain-harness://runtime/compatibility',
      primaryIdentity: 'compat-target/floating',
      // no contractProfileIdentity / revisionIdentity: not P5-exact
    } as never);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003CompatibilityError);
  assert.equal((caught as DacV003CompatibilityError).code, 'INVALID_COMPATIBILITY_REQUEST');

  // A mutable alias can never become a target revision identity.
  let aliasCaught: unknown;
  try {
    adoptDacV003CompatibilityTargetRef({
      baseline,
      authorityScope: 'domain-harness://runtime/compatibility',
      primaryIdentity: 'compat-target/alias',
      contractProfileIdentity: 'domain-harness',
      revisionIdentity: 'latest',
    });
  } catch (error) {
    aliasCaught = error;
  }
  assert.ok(aliasCaught instanceof DacV003ReferenceError);
  assert.equal((aliasCaught as DacV003ReferenceError).code, 'MUTABLE_ALIAS_REJECTED');

  // Wrong freeze baseline is rejected before anything else.
  let baselineCaught: unknown;
  try {
    adoptDacV003CompatibilityTargetRef({
      baseline: {
        contract: 'domain-application-contract',
        version: 'v0.0.3',
        semanticFreezeCommit: '0000000000000000000000000000000000000000',
        semanticFreezeTree: '0000000000000000000000000000000000000000',
      },
      authorityScope: 'domain-harness://runtime/compatibility',
      primaryIdentity: 'compat-target/wrong-baseline',
      contractProfileIdentity: 'domain-harness',
      revisionIdentity: 'r1',
    });
  } catch (error) {
    baselineCaught = error;
  }
  assert.ok(baselineCaught instanceof DacV003ReferenceError);
  assert.equal((baselineCaught as DacV003ReferenceError).code, 'UNSUPPORTED_DAC_BASELINE');
});

test('v3-002 malformed supported-profile declarations fail closed as invalid requests', async () => {
  let caught: unknown;
  try {
    await validateDacV003Compatibility(
      await buildCompatibleRequest({ supportedTargetProfiles: [''] as never }),
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003CompatibilityError);
  assert.equal((caught as DacV003CompatibilityError).code, 'INVALID_COMPATIBILITY_REQUEST');
});
