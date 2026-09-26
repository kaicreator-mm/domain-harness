// Issue #355 / A41-001 — successor request-vs-result role separation
// primitives (C89/C108/C155; CROSS_LAYER_REFERENCES §3.1/§6;
// LIFECYCLE_REFERENCE_REPAIRS §5). A request identity is never a
// decision/result identity; aliasing within a seam chain fails closed; an
// advisory target hint can never occupy the binding explicit target slot;
// minting a request records identity only — never acceptance, evaluation or
// a decision.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS,
  DacV0041ReferenceError,
  adoptDacV0041RegistryReference,
  isCompatibilityValidationRequestRef,
  isDacV0041Reference,
  isRuntimeBindingRequestRef,
  mintCompatibilityValidationRequestRef,
  mintRuntimeBindingRequestRef,
  verifyDacV0041RequestResultSeparation,
} from '../../src/dac-v0041/index.js';

function requestInput(primaryIdentity: string) {
  return {
    baseline: { ...DAC_V0041_BASELINE },
    authorityScope: 'domain-harness://successor/foundation-check',
    primaryIdentity,
    requesterIdentity: 'requester-1',
    providerIdentity: 'provider-1',
    requestedCapabilityKind: 'domain-harness.compatibility-validation/1',
  };
}

function registryRef(role: 'compatibility-validation' | 'compatibility-result' | 'runtime-binding' | 'runtime-host-binding' | 'runtime-activation' | 'manifest', primaryIdentity: string) {
  return adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role,
    authorityScope: 'domain-harness://successor/foundation-check',
    primaryIdentity,
  });
}

function expectAliasError(run: () => unknown, label: string): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof DacV0041ReferenceError,
    `${label}: expected DacV0041ReferenceError, got ${String(caught)}`,
  );
  assert.equal((caught as DacV0041ReferenceError).code, 'REQUEST_RESULT_ALIAS', `${label}: code`);
}

test('a41-001 separation: the frozen §6 anti-alias chains are exact', () => {
  assert.deepEqual(
    DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS.map((chain) => [...chain]),
    [
      ['authority-designation-request', 'authority-designation'],
      ['domain-authoring-request', 'domain-authoring-result', 'authored-candidate'],
      ['application-identity-establishment-request', 'application-identity-establishment', 'application-semantic'],
      ['promotion-request', 'promotion-decision'],
      ['application-selection-request', 'application-selection'],
      ['manifest-issuance-request', 'manifest'],
      ['compatibility-validation-request', 'compatibility-validation', 'compatibility-result'],
      ['runtime-binding-request', 'runtime-binding', 'runtime-host-binding'],
      ['runtime-activation-request', 'runtime-activation'],
      ['conformance-request', 'conformance-verdict'],
    ],
  );
});

test('a41-001 separation C89: compatibility request identity aliasing any validation/result view is rejected', () => {
  const request = mintCompatibilityValidationRequestRef(
    requestInput('compatibility-request-1'),
  );
  assert.ok(isCompatibilityValidationRequestRef(request));
  assert.ok(isDacV0041Reference(request));

  const sameValidation = registryRef('compatibility-validation', 'compatibility-request-1');
  const sameResult = registryRef('compatibility-result', 'compatibility-request-1');
  expectAliasError(
    () => verifyDacV0041RequestResultSeparation(request, [sameValidation]),
    'request aliases validation view',
  );
  expectAliasError(
    () => verifyDacV0041RequestResultSeparation(request, [sameResult]),
    'request aliases result view',
  );

  // Distinct identities in the same chain pass.
  const distinctValidation = registryRef('compatibility-validation', 'compatibility-validation-1');
  const distinctResult = registryRef('compatibility-result', 'compatibility-result-1');
  verifyDacV0041RequestResultSeparation(request, [distinctValidation, distinctResult]);
});

test('a41-001 separation C108: runtime binding request identity aliasing binding/host-binding is rejected', () => {
  const request = mintRuntimeBindingRequestRef(requestInput('binding-request-1'));
  assert.ok(isRuntimeBindingRequestRef(request));
  expectAliasError(
    () =>
      verifyDacV0041RequestResultSeparation(request, [
        registryRef('runtime-binding', 'binding-request-1'),
      ]),
    'binding request aliases runtime binding result',
  );
  expectAliasError(
    () =>
      verifyDacV0041RequestResultSeparation(request, [
        registryRef('runtime-host-binding', 'binding-request-1'),
      ]),
    'binding request aliases host binding',
  );

  verifyDacV0041RequestResultSeparation(request, [
    registryRef('runtime-binding', 'binding-result-1'),
    registryRef('runtime-host-binding', 'host-binding-1'),
  ]);
});

test('a41-001 separation: identities shared across DIFFERENT seam chains are not false positives', () => {
  const request = mintCompatibilityValidationRequestRef(requestInput('shared-id-1'));
  // 'shared-id-1' on an out-of-chain role and on another chain's roles does
  // not violate THIS seam's request/result separation (the owning seam of
  // those roles enforces its own chain).
  const outOfChain = registryRef('manifest', 'shared-id-1');
  const otherChainRole = registryRef('runtime-activation', 'shared-id-1');
  verifyDacV0041RequestResultSeparation(request, [outOfChain, otherChainRole]);
});

test('a41-001 separation: a request role reference never passes as another chain position', () => {
  const request = mintRuntimeBindingRequestRef(requestInput('binding-request-2'));
  assert.equal(isRuntimeBindingRequestRef(request), true);
  assert.equal(isCompatibilityValidationRequestRef(request), false);
  // A registry-adopted reference with a request-role name is rejected: the
  // two foundation request roles are reserved to their dedicated nominal
  // constructors, so no generic adoption path can mint a request-shaped
  // carrier that bypasses the request-envelope minimums.
  let caught: unknown;
  try {
    adoptDacV0041RegistryReference({
      baseline: { ...DAC_V0041_BASELINE },
      role: 'runtime-binding-request',
      authorityScope: 'domain-harness://successor/foundation-check',
      primaryIdentity: 'forged-request-1',
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'ROLE_MISMATCH');
});

test('a41-001 separation: advisory target hints can never occupy the binding explicit target slot', () => {
  const exactTarget = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target',
    authorityScope: 'domain-harness://successor/foundation-check',
    primaryIdentity: 'exact-target-1',
    semanticIdentity: 'exact-target-semantic-1',
    revisionIdentity: 'exact-target-rev-1',
  });

  const request = mintCompatibilityValidationRequestRef({
    ...requestInput('compatibility-request-2'),
    bindingTargetRef: exactTarget,
    advisoryTargetHints: ['latest', 'env:prod', 'preferred-target-x'],
  });
  assert.equal(request.bindingTargetRef?.primaryIdentity, 'exact-target-1');
  assert.deepEqual([...request.advisoryTargetHints], ['latest', 'env:prod', 'preferred-target-x']);

  // A non-compatibility-target ref in the binding slot fails closed — an
  // advisory value or wrong-role ref can never satisfy the slot (§4.1/§4.2).
  const notATarget = registryRef('manifest', 'manifest-1');
  let caught: unknown;
  try {
    mintCompatibilityValidationRequestRef({
      ...requestInput('compatibility-request-3'),
      bindingTargetRef: notATarget,
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'ADVISORY_HINT_NOT_BINDING_TARGET');
});

test('a41-001 separation: minting a request records identity only — never a decision or acceptance', () => {
  const exactTarget = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target',
    authorityScope: 'domain-harness://successor/foundation-check',
    primaryIdentity: 'exact-target-2',
  });
  const descriptor = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'provider-capability-descriptor',
    authorityScope: 'domain-harness://successor/foundation-check',
    primaryIdentity: 'descriptor-1',
  });
  const request = mintRuntimeBindingRequestRef({
    ...requestInput('binding-request-3'),
    semanticIdentity: 'binding-request-semantic-3',
    revisionIdentity: 'binding-request-rev-3',
    contentDigest: 'binding-request-digest-3',
    contractProfileIdentity: 'domain-harness@v0.0.4.1-profile/node-1',
    locatorHints: ['registry://binding-requests'],
    descriptorRef: descriptor,
    predecessorOrigin: DAC_V0041_PREDECESSOR_BASELINES[0],
    bindingTargetRef: exactTarget,
    advisoryTargetHints: ['preferred-provider-x'],
  });
  const keys = Object.keys(request).sort();
  // No decision/result/outcome/acceptance vocabulary exists on a minted
  // request reference: C158's accepted/pending vocabulary is never even
  // representable here, and no field can occupy a result position.
  for (const forbidden of [
    'decision',
    'decisionIdentity',
    'resultIdentity',
    'outcome',
    'invocationOutcome',
    'accepted',
    'approved',
    'validationRef',
    'resultRef',
  ]) {
    assert.equal(keys.includes(forbidden), false, `request must not carry "${forbidden}"`);
  }
  // The full envelope when every optional slot is supplied — and nothing
  // beyond the frozen slot vocabulary.
  assert.deepEqual(keys, [
    'adapter',
    'advisoryTargetHints',
    'authorityScope',
    'baseline',
    'bindingTargetRef',
    'contentDigest',
    'contractProfileIdentity',
    'descriptorRef',
    'locatorHints',
    'materialInputRefs',
    'opaque',
    'predecessorOrigin',
    'primaryIdentity',
    'providerIdentity',
    'requestedCapabilityKind',
    'requesterIdentity',
    'revisionIdentity',
    'role',
    'semanticIdentity',
  ]);
});

test('a41-001 separation: forged carriers fail closed in the separation verifier', () => {
  const request = mintCompatibilityValidationRequestRef(requestInput('compatibility-request-4'));
  const forged = {
    ...request,
    role: 'compatibility-result',
  };
  let caught: unknown;
  try {
    verifyDacV0041RequestResultSeparation(request, [forged as never]);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'INVALID_REFERENCE');
});

test('a41-001 separation: mutable alias tokens are rejected as identities', () => {
  let caught: unknown;
  try {
    mintRuntimeBindingRequestRef(requestInput('latest'));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'MUTABLE_ALIAS_REJECTED');
  // Advisory hints MAY be mutable aliases — they are discovery-only.
  const request = mintRuntimeBindingRequestRef({
    ...requestInput('binding-request-4'),
    advisoryTargetHints: ['latest'],
  });
  assert.deepEqual([...request.advisoryTargetHints], ['latest']);
});
