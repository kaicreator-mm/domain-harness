// Issue #305 / A2 I-002 focused conformance + negative tests for the DAC
// cross-layer reference adapter core. Public-import only (src barrel is the
// package's own composition surface under test via public-v3 parity in the
// v3-assembly surface suite).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_REFERENCE_ADAPTER_VERSION,
  DAC_REFERENCE_BASELINE,
  DAC_REFERENCE_ROLES,
  DacReferenceError,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeActivationRef,
  adoptRuntimeBindingRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
  expectApplicationSelectionRef,
  expectCompatibilityTargetRef,
  expectPromotionDecisionRef,
  expectRuntimeActivationRef,
  expectRuntimeBindingRef,
  expectRuntimeContractRef,
  expectRuntimeImplementationRef,
  getDacReferenceRole,
  isApplicationSelectionRef,
  isCompatibilityTargetRef,
  isDacReference,
  isPromotionDecisionRef,
  isRuntimeActivationRef,
  isRuntimeBindingRef,
  isRuntimeContractRef,
  isRuntimeImplementationRef,
  isSelectedDomainDataRef,
  refuteExternalBusinessSoRIdentity,
  verifyDacReferenceIdentity,
} from '../../src/dac/index.js';

const baseline = { ...DAC_REFERENCE_BASELINE };

const validInput = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  baseline,
  semanticIdentity: 'domain:billing:invoice-rules',
  authorityScope: 'dac://app-composition/acme',
  revisionIdentity: 'rev-000042',
  contentDigest: 'sha256:9f2c…exact',
  ...overrides,
});

function assertDacErrorCode(fn: () => void, code: string, label: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacReferenceError, `${label}: expected DacReferenceError`);
  assert.equal((caught as DacReferenceError).code, code, `${label}: code ${code}`);
}

test('dac refs: nominal adoption validates and preserves exact provenance for every role', () => {
  const promotion = adoptPromotionDecisionRef(validInput() as never);
  const selection = adoptApplicationSelectionRef(validInput() as never);
  const selected = adoptSelectedDomainDataRef(validInput() as never);
  const contract = adoptRuntimeContractRef(validInput() as never);
  const implementation = adoptRuntimeImplementationRef(validInput() as never);
  const target = adoptCompatibilityTargetRef(validInput() as never);
  const binding = adoptRuntimeBindingRef(validInput() as never);
  const activation = adoptRuntimeActivationRef(validInput() as never);

  for (const ref of [promotion, selection, selected, contract, implementation, target, binding, activation]) {
    assert.equal(ref.adapter, DAC_REFERENCE_ADAPTER_VERSION);
    assert.deepEqual(ref.baseline, DAC_REFERENCE_BASELINE);
    assert.equal(ref.semanticIdentity, 'domain:billing:invoice-rules');
    assert.equal(ref.authorityScope, 'dac://app-composition/acme');
    assert.equal(ref.revisionIdentity, 'rev-000042');
    assert.equal(ref.contentDigest, 'sha256:9f2c…exact');
    assert.ok(Object.isFrozen(ref));
    assert.ok(Object.isFrozen(ref.opaque));
    assert.ok(isDacReference(ref));
  }

  assert.equal(promotion.role, 'promotion-decision');
  assert.equal(selection.role, 'application-selection');
  assert.equal(selected.role, 'selected-domain-data');
  assert.equal(contract.role, 'runtime-contract');
  assert.equal(implementation.role, 'runtime-implementation');
  assert.equal(target.role, 'compatibility-target');
  assert.equal(binding.role, 'runtime-binding');
  assert.equal(activation.role, 'runtime-activation');

  // Role guards are positive on the matching role.
  assert.ok(isPromotionDecisionRef(promotion));
  assert.ok(isApplicationSelectionRef(selection));
  assert.ok(isSelectedDomainDataRef(selected));
  assert.ok(isRuntimeContractRef(contract));
  assert.ok(isRuntimeImplementationRef(implementation));
  assert.ok(isCompatibilityTargetRef(target));
  assert.ok(isRuntimeBindingRef(binding));
  assert.ok(isRuntimeActivationRef(activation));

  // Exact roles enumeration matches the frozen eight.
  assert.deepEqual(
    [...DAC_REFERENCE_ROLES].sort(),
    [
      'application-selection',
      'compatibility-target',
      'promotion-decision',
      'runtime-activation',
      'runtime-binding',
      'runtime-contract',
      'runtime-implementation',
      'selected-domain-data',
    ].sort(),
  );
});

test('dac refs: mandatory role inequalities — no guard accepts a foreign role', () => {
  const promotion = adoptPromotionDecisionRef(validInput() as never);
  const selection = adoptApplicationSelectionRef(validInput() as never);
  const target = adoptCompatibilityTargetRef(validInput() as never);
  const binding = adoptRuntimeBindingRef(validInput() as never);
  const activation = adoptRuntimeActivationRef(validInput() as never);
  const contract = adoptRuntimeContractRef(validInput() as never);
  const implementation = adoptRuntimeImplementationRef(validInput() as never);

  // PromotionDecisionRef != ApplicationSelectionRef
  assert.ok(!isApplicationSelectionRef(promotion));
  assert.ok(!isPromotionDecisionRef(selection));
  assert.throws(() => expectApplicationSelectionRef(promotion), DacReferenceError);
  assert.throws(() => expectPromotionDecisionRef(selection), DacReferenceError);

  // ApplicationSelectionRef != CompatibilityValidation (target)
  assert.ok(!isApplicationSelectionRef(target));
  assert.ok(!isCompatibilityTargetRef(selection));
  assert.throws(() => expectApplicationSelectionRef(target), DacReferenceError);
  assert.throws(() => expectCompatibilityTargetRef(selection), DacReferenceError);

  // ApplicationSelectionRef != RuntimeBindingRef
  assert.ok(!isApplicationSelectionRef(binding));
  assert.ok(!isRuntimeBindingRef(selection));
  assert.throws(() => expectApplicationSelectionRef(binding), DacReferenceError);
  assert.throws(() => expectRuntimeBindingRef(selection), DacReferenceError);

  // RuntimeBindingRef != RuntimeActivationRef
  assert.ok(!isRuntimeBindingRef(activation));
  assert.ok(!isRuntimeActivationRef(binding));
  assert.throws(() => expectRuntimeBindingRef(activation), DacReferenceError);
  assert.throws(() => expectRuntimeActivationRef(binding), DacReferenceError);

  // RuntimeContractRef != RuntimeImplementationRef
  assert.ok(!isRuntimeContractRef(implementation));
  assert.ok(!isRuntimeImplementationRef(contract));
  assert.throws(() => expectRuntimeContractRef(implementation), DacReferenceError);
  assert.throws(() => expectRuntimeImplementationRef(contract), DacReferenceError);
});

test('dac refs: identity expectations are exact and fail closed on mismatch or absence', () => {
  const selected = adoptSelectedDomainDataRef(validInput() as never);
  verifyDacReferenceIdentity(selected, {
    semanticIdentity: 'domain:billing:invoice-rules',
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: 'rev-000042',
    contentDigest: 'sha256:9f2c…exact',
  });

  assertDacErrorCode(
    () => verifyDacReferenceIdentity(selected, { revisionIdentity: 'rev-000043' }),
    'IDENTITY_MISMATCH',
    'revision mismatch',
  );
  assertDacErrorCode(
    () => verifyDacReferenceIdentity(selected, { contentDigest: 'sha256:other' }),
    'IDENTITY_MISMATCH',
    'digest mismatch',
  );
  assertDacErrorCode(
    () => verifyDacReferenceIdentity(selected, { semanticIdentity: 'domain:billing:other' }),
    'IDENTITY_MISMATCH',
    'semantic identity mismatch',
  );
  assertDacErrorCode(
    () => verifyDacReferenceIdentity(selected, { authorityScope: 'dac://other-authority/x' }),
    'IDENTITY_MISMATCH',
    'authority scope mismatch',
  );

  // Expected field absent from the reference (here: a role without a digest)
  // is a mismatch, never a pass.
  const contract = adoptRuntimeContractRef(
    validInput({ contentDigest: undefined }) as never,
  );
  assertDacErrorCode(
    () => verifyDacReferenceIdentity(contract, { contentDigest: 'sha256:anything' }),
    'IDENTITY_MISMATCH',
    'absent digest',
  );
});

test('dac refs: unsupported DAC baseline fails closed, never guessed', () => {
  for (const bad of [
    { contract: 'domain-application-contract', version: 'v0.0.1', baselineCommit: DAC_REFERENCE_BASELINE.baselineCommit },
    { contract: 'domain-application-contract', version: 'v0.0.2', baselineCommit: '0000000000000000000000000000000000000000' },
    { contract: 'some-other-contract', version: 'v0.0.2', baselineCommit: DAC_REFERENCE_BASELINE.baselineCommit },
  ]) {
    assertDacErrorCode(
      () => adoptSelectedDomainDataRef(validInput({ baseline: bad }) as never),
      'UNSUPPORTED_DAC_BASELINE',
      'baseline mismatch',
    );
  }
  assertDacErrorCode(
    () => adoptSelectedDomainDataRef(validInput({ baseline: null }) as never),
    'UNSUPPORTED_DAC_BASELINE',
    'null baseline',
  );
});

test('dac refs: mutable alias/latest/current/head cannot substitute exact selection', () => {
  for (const alias of ['latest', 'CURRENT', ' head ', 'Main', 'default', 'stable', 'tip', 'master']) {
    assertDacErrorCode(
      () => adoptSelectedDomainDataRef(validInput({ revisionIdentity: alias }) as never),
      'MUTABLE_ALIAS_REJECTED',
      `alias ${alias}`,
    );
    assertDacErrorCode(
      () => adoptApplicationSelectionRef(validInput({ revisionIdentity: alias }) as never),
      'MUTABLE_ALIAS_REJECTED',
      `alias ${alias} on selection`,
    );
  }
  // An exact revision id that merely contains an alias word is not heuristically rejected.
  const ok = adoptSelectedDomainDataRef(validInput({ revisionIdentity: 'rev-head-of-state-001' }) as never);
  assert.equal(ok.revisionIdentity, 'rev-head-of-state-001');
});

test('dac refs: no implicit default selection — selected role requires full exact identity', () => {
  assertDacErrorCode(
    () => adoptSelectedDomainDataRef(validInput({ revisionIdentity: undefined }) as never),
    'INVALID_REFERENCE',
    'missing revision',
  );
  assertDacErrorCode(
    () => adoptSelectedDomainDataRef(validInput({ contentDigest: undefined }) as never),
    'INVALID_REFERENCE',
    'missing digest',
  );
  assertDacErrorCode(
    () => adoptSelectedDomainDataRef(validInput({ semanticIdentity: '' }) as never),
    'INVALID_REFERENCE',
    'empty semantic identity',
  );
  assertDacErrorCode(
    () => adoptSelectedDomainDataRef(validInput({ authorityScope: '   ' }) as never),
    'INVALID_REFERENCE',
    'blank authority scope',
  );
  assertDacErrorCode(
    () => adoptPromotionDecisionRef(null as never),
    'INVALID_REFERENCE',
    'null input',
  );
});

test('dac refs: unknown/provisional fields are preserved opaquely and verbatim, never guessed', () => {
  const provisional = {
    wireFieldSet: 'PROVISIONAL-per-dac-v0.0.2',
    locator_hint: 'https://registry.example/acme/invoice-rules',
    taggedUnionChoice: { kind: 'b', why: 'unknown' },
  };
  const selected = adoptSelectedDomainDataRef(validInput({ opaque: provisional }) as never);
  assert.deepEqual(selected.opaque, provisional);
  // Round-trip through re-adoption preserves them again.
  const again = adoptSelectedDomainDataRef({
    baseline,
    semanticIdentity: selected.semanticIdentity,
    authorityScope: selected.authorityScope,
    revisionIdentity: selected.revisionIdentity,
    contentDigest: selected.contentDigest,
    opaque: selected.opaque,
  });
  assert.deepEqual(again.opaque, provisional);
  assert.equal((selected.opaque as Record<string, unknown>).locator_hint, provisional.locator_hint);
  // Opaque must be a plain object.
  assertDacErrorCode(
    () => adoptSelectedDomainDataRef(validInput({ opaque: ['not-an-object'] }) as never),
    'INVALID_REFERENCE',
    'array opaque',
  );
});

test('dac refs: forged/foreign objects never pass as adopted references', () => {
  const forged = {
    adapter: DAC_REFERENCE_ADAPTER_VERSION,
    role: 'application-selection',
    baseline: { ...DAC_REFERENCE_BASELINE },
    semanticIdentity: 'domain:x',
    authorityScope: 'dac://x',
  };
  // A forged object is rejected by every guard — only references minted by
  // an adopt*Ref constructor are recognized (private adoption registry).
  assert.ok(!isDacReference(forged));
  assert.ok(!isApplicationSelectionRef(forged));
  assert.throws(() => expectApplicationSelectionRef(forged), DacReferenceError);
  // Mutating a role discriminant is impossible on adopted refs (frozen):
  const selected = adoptSelectedDomainDataRef(validInput() as never);
  assert.throws(() => {
    (selected as unknown as { role: string }).role = 'application-selection';
  }, TypeError);
  assert.equal(getDacReferenceRole(selected), 'selected-domain-data');
  assert.equal(getDacReferenceRole({}), undefined);
  assert.equal(getDacReferenceRole(null), undefined);
});

test('dac refs: Runtime implementation identity can never become external Business SoR identity', () => {
  const implementation = adoptRuntimeImplementationRef(validInput() as never);
  const contract = adoptRuntimeContractRef(validInput() as never);
  const selection = adoptApplicationSelectionRef(validInput() as never);
  for (const ref of [implementation, contract, selection]) {
    assertDacErrorCode(
      () => refuteExternalBusinessSoRIdentity(ref),
      'EXTERNAL_IDENTITY_FORBIDDEN',
      'runtime identity as external SoR',
    );
  }
  // Non-references pass through untouched (the guard only refuses the
  // forbidden substitution; it never fabricates an external identity).
  refuteExternalBusinessSoRIdentity({ externalRecordId: 'sor://erp/invoice/42' });
  refuteExternalBusinessSoRIdentity(undefined);
});
