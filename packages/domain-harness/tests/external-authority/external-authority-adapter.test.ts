// Issue #309 / A2 I-006 focused conformance + negative tests for the
// external authority / operation / observation / reconciliation evidence and
// correlation adapter (DAC v0.0.2 EXTERNAL_AUTHORITY semantics).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXTERNAL_AUTHORITY_ADAPTER_VERSION,
  EXTERNAL_AUTHORITY_BASELINE,
  EXTERNAL_AUTHORITY_REFERENCE_ROLES,
  EXTERNAL_EVIDENCE_CLASSES,
  EXTERNAL_OBSERVATION_CLASSIFICATIONS,
  EXTERNAL_OBSERVATION_CLAIMS,
  EXTERNAL_RECONCILIATION_RESULTS,
  ExternalAuthorityError,
  adoptExternalAuthorityRef,
  adoptExternalDispatchAttemptEvidence,
  adoptExternalObservationEvidence,
  adoptExternalObservationRef,
  adoptExternalReconciliationOutcome,
  adoptExternalReconciliationRef,
  adoptRuntimeLogicalOperationRef,
  adoptRuntimeLogicalOperationRefFromExecutionContext,
  adoptRuntimeLogicalOperationRefFromJournal,
  adoptProviderOperationRef,
  correlateExternalEffect,
  expectExternalAuthorityRef,
  expectRuntimeLogicalOperationRef,
  getExternalAuthorityFamilyRole,
  isExternalAuthorityFamilyReference,
  isExternalAuthorityRef,
  isExternalDispatchAttemptEvidence,
  isExternalObservationEvidence,
  isExternalObservationRef,
  isExternalReconciliationOutcome,
  isExternalReconciliationRef,
  isProviderOperationRef,
  isRuntimeLogicalOperationRef,
  maxClaimableForExternalObservation,
  observationSupportsCommitClaim,
  observationSupportsNonCommitClaim,
  refuteNonExternalAuthorityIdentity,
  verifyExternalEffectCorrelation,
} from '../../src/external-authority/index.js';
import {
  DAC_REFERENCE_BASELINE,
  adoptRuntimeImplementationRef as adoptDacRuntimeImplementationRef,
  refuteExternalBusinessSoRIdentity,
} from '../../src/dac/index.js';

const BASELINE = { ...DAC_REFERENCE_BASELINE };

function authority(): ReturnType<typeof adoptExternalAuthorityRef> {
  return adoptExternalAuthorityRef({
    baseline: BASELINE,
    authorityId: 'sor://payments-ledger',
    authorityScope: 'tenant-42/payment-intents',
    opaque: { region: 'eu-1' },
  });
}

function runtimeOp(): ReturnType<typeof adoptRuntimeLogicalOperationRef> {
  return adoptRuntimeLogicalOperationRef({
    baseline: BASELINE,
    effectId: 'effect:v2:abc123',
    attempt: 2,
    effectSemantics: 'non-idempotent',
    idempotencyKey: 'effect:v2:abc123',
  });
}

function providerOp(): ReturnType<typeof adoptProviderOperationRef> {
  return adoptProviderOperationRef({
    baseline: BASELINE,
    providerOperationId: 'pi_3Q9F',
    idempotencyKey: 'effect:v2:abc123',
  });
}

function correlation(): ReturnType<typeof correlateExternalEffect> {
  return correlateExternalEffect({
    correlationId: 'corr-1',
    runtimeOperation: runtimeOp(),
    externalAuthority: authority(),
    providerOperation: providerOp(),
  });
}

function observation(
  classification: Parameters<typeof maxClaimableForExternalObservation>[0],
  rawStatement = `external stated: ${classification}`,
): ReturnType<typeof adoptExternalObservationEvidence> {
  return adoptExternalObservationEvidence({
    correlation: correlation(),
    observation: adoptExternalObservationRef({
      baseline: BASELINE,
      observationId: 'obs-1',
    }),
    classification,
    rawStatement,
  });
}

function errorOf(fn: () => unknown): ExternalAuthorityError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ExternalAuthorityError, `expected ExternalAuthorityError, got ${String(error)}`);
    return error;
  }
  throw new Error('expected function to throw ExternalAuthorityError');
}

test('I-006: adapter/baseline identity binds one authority with the DAC adapter baseline', () => {
  assert.equal(EXTERNAL_AUTHORITY_ADAPTER_VERSION, 'external-authority-adapter/1');
  // The I-002 adapter and this adapter bind the SAME DAC baseline triple —
  // no parallel identity authority is forked between them.
  assert.deepEqual(EXTERNAL_AUTHORITY_BASELINE, DAC_REFERENCE_BASELINE);
});

test('I-006: adoption fails closed on any other baseline', () => {
  for (const mutated of [
    { ...BASELINE, contract: 'other-contract' },
    { ...BASELINE, version: 'v0.0.3' },
    { ...BASELINE, baselineCommit: 'deadbeef' },
  ]) {
    const error = errorOf(() =>
      adoptExternalAuthorityRef({
        baseline: mutated,
        authorityId: 'a',
        authorityScope: 's',
      }),
    );
    assert.equal(error.code, 'UNSUPPORTED_BASELINE');
  }
});

test('I-006: each role adopts, nominalizes and round-trips opaquely', () => {
  const ref = authority();
  assert.ok(isExternalAuthorityRef(ref));
  assert.equal(getExternalAuthorityFamilyRole(ref), 'external-authority');
  assert.equal(ref.authorityId, 'sor://payments-ledger');
  assert.deepEqual(ref.opaque, { region: 'eu-1' });
  assert.ok(Object.isFrozen(ref));

  const op = runtimeOp();
  assert.ok(isRuntimeLogicalOperationRef(op));
  assert.equal(op.effectId, 'effect:v2:abc123');
  assert.equal(op.attempt, 2);
  assert.equal(op.effectSemantics, 'non-idempotent');

  const provider = providerOp();
  assert.ok(isProviderOperationRef(provider));
  assert.equal(provider.providerOperationId, 'pi_3Q9F');

  const obs = adoptExternalObservationRef({ baseline: BASELINE, observationId: 'obs-9' });
  assert.ok(isExternalObservationRef(obs));

  const recon = adoptExternalReconciliationRef({
    baseline: BASELINE,
    reconciliationId: 'recon-1',
  });
  assert.ok(isExternalReconciliationRef(recon));
  assert.ok(isExternalAuthorityFamilyReference(recon));
});

test('I-006: reference input validation fails closed', () => {
  assert.equal(errorOf(() => adoptExternalAuthorityRef({ baseline: BASELINE, authorityId: '  ', authorityScope: 's' })).code, 'INVALID_REFERENCE');
  assert.equal(errorOf(() => adoptExternalAuthorityRef({ baseline: BASELINE, authorityId: 'a', authorityScope: '' })).code, 'INVALID_REFERENCE');
  assert.equal(errorOf(() => adoptRuntimeLogicalOperationRef({ baseline: BASELINE, effectId: '' })).code, 'INVALID_REFERENCE');
  assert.equal(errorOf(() => adoptRuntimeLogicalOperationRef({ baseline: BASELINE, effectId: 'e', attempt: 0 })).code, 'INVALID_REFERENCE');
  assert.equal(errorOf(() => adoptRuntimeLogicalOperationRef({ baseline: BASELINE, effectId: 'e', attempt: 1.5 })).code, 'INVALID_REFERENCE');
  assert.equal(
    errorOf(() => adoptRuntimeLogicalOperationRef({ baseline: BASELINE, effectId: 'e', effectSemantics: 'sometimes' as never })).code,
    'INVALID_REFERENCE',
  );
  // provider-operation is adopted only WHERE AVAILABLE: all identity slots absent fails.
  assert.equal(errorOf(() => adoptProviderOperationRef({ baseline: BASELINE })).code, 'INVALID_REFERENCE');
  assert.equal(errorOf(() => adoptExternalObservationRef({ baseline: BASELINE, observationId: ' ' })).code, 'INVALID_REFERENCE');
  assert.equal(errorOf(() => adoptExternalReconciliationRef({ baseline: BASELINE, reconciliationId: '' })).code, 'INVALID_REFERENCE');
  assert.equal(
    errorOf(() => adoptExternalAuthorityRef({ baseline: BASELINE, authorityId: 'a', authorityScope: 's', opaque: 'nope' as never })).code,
    'INVALID_REFERENCE',
  );
});

test('I-006: runtime logical operation adoption from EXISTING durable-effect shapes', () => {
  // FromJournal: the existing v2 durable effect journal record (identity fields only).
  const fromJournal = adoptRuntimeLogicalOperationRefFromJournal(BASELINE, {
    effectId: 'effect:v2:journal',
    attempt: 3,
    effectSemantics: 'idempotent',
  });
  assert.equal(fromJournal.effectId, 'effect:v2:journal');
  assert.equal(fromJournal.attempt, 3);
  assert.equal(fromJournal.effectSemantics, 'idempotent');
  assert.equal(fromJournal.idempotencyKey, undefined);

  // FromExecutionContext: the existing executor context carries the runtime's
  // derived idempotency key for this logical effect.
  const fromContext = adoptRuntimeLogicalOperationRefFromExecutionContext(BASELINE, {
    effectId: 'effect:v2:ctx',
    attempt: 1,
    idempotencyKey: 'effect:v2:ctx',
  });
  assert.equal(fromContext.effectId, 'effect:v2:ctx');
  assert.equal(fromContext.idempotencyKey, 'effect:v2:ctx');
  assert.equal(fromContext.effectSemantics, undefined);
  assert.ok(isRuntimeLogicalOperationRef(fromContext));
});

test('I-006: mandatory identity distinctions — roles never interchange', () => {
  const refs = {
    authority: authority(),
    runtimeOperation: runtimeOp(),
    providerOperation: providerOp(),
    observation: adoptExternalObservationRef({ baseline: BASELINE, observationId: 'o' }),
    reconciliation: adoptExternalReconciliationRef({ baseline: BASELINE, reconciliationId: 'r' }),
  } as const;
  const guards = {
    authority: isExternalAuthorityRef,
    runtimeOperation: isRuntimeLogicalOperationRef,
    providerOperation: isProviderOperationRef,
    observation: isExternalObservationRef,
    reconciliation: isExternalReconciliationRef,
  } as const;

  for (const [name, ref] of Object.entries(refs)) {
    for (const [guardName, guard] of Object.entries(guards)) {
      if (guardName === name) {
        assert.ok(guard(ref), `${guardName} accepts its own role`);
      } else {
        assert.ok(!guard(ref), `${guardName} must reject role ${name}`);
      }
    }
  }

  // expect* throws ROLE_MISMATCH across roles.
  assert.throws(() => expectRuntimeLogicalOperationRef(refs.authority), /ROLE_MISMATCH/);
  assert.throws(() => expectExternalAuthorityRef(refs.providerOperation), /ROLE_MISMATCH/);

  // A structurally identical forged object never passes (private registry).
  const forged: Record<string, unknown> = { ...refs.authority };
  assert.ok(!isExternalAuthorityRef(forged));
  assert.throws(() => expectExternalAuthorityRef(forged), /ROLE_MISMATCH/);
});

test('I-006: runtime logical operation identity stays distinct from provider operation identity', () => {
  const op = runtimeOp();
  const provider = providerOp();
  // Even when both carry the same idempotency key (the shared correlation
  // seam), the identities are nominal and never interchangeable.
  assert.equal(op.idempotencyKey, provider.idempotencyKey);
  assert.ok(!isProviderOperationRef(op));
  assert.ok(!isRuntimeLogicalOperationRef(provider));
});

test('I-006: cross-family separation from the DAC lifecycle/technical refs', () => {
  const dacRef = adoptDacRuntimeImplementationRef({
    baseline: DAC_REFERENCE_BASELINE,
    semanticIdentity: 'runtime-impl-x',
    authorityScope: 'dh-local',
  });
  // A DAC reference is not in this family's registry and fails every guard.
  assert.ok(!isExternalAuthorityFamilyReference(dacRef));
  assert.ok(!isExternalAuthorityRef(dacRef));
  assert.throws(() => expectExternalAuthorityRef(dacRef), /ROLE_MISMATCH/);
  // And the DAC adapter's own refutation stays refusal-only for our refs
  // (it refutes DAC refs masquerading as external identity; ours are none).
  refuteExternalBusinessSoRIdentity(authority());

  // Conversely: no non-authority reference of this family substitutes
  // external Business SoR authority identity.
  assert.throws(() => refuteNonExternalAuthorityIdentity(runtimeOp()), /IDENTITY_MISMATCH/);
  assert.throws(() => refuteNonExternalAuthorityIdentity(providerOp()), /IDENTITY_MISMATCH/);
  assert.throws(() => refuteNonExternalAuthorityIdentity(
    adoptExternalObservationRef({ baseline: BASELINE, observationId: 'o' }),
  ), /IDENTITY_MISMATCH/);
  assert.throws(() => refuteNonExternalAuthorityIdentity(
    adoptExternalReconciliationRef({ baseline: BASELINE, reconciliationId: 'r' }),
  ), /IDENTITY_MISMATCH/);
  // The external authority ref itself and foreign objects pass through.
  refuteNonExternalAuthorityIdentity(authority());
  refuteNonExternalAuthorityIdentity({ arbitrary: true });
  refuteNonExternalAuthorityIdentity(dacRef);
});

test('I-006: correlation requires adopted refs and enforces idempotency consistency', () => {
  const corr = correlation();
  assert.equal(corr.correlationId, 'corr-1');
  assert.equal(corr.runtimeOperation.effectId, 'effect:v2:abc123');
  assert.equal(corr.externalAuthority.authorityId, 'sor://payments-ledger');
  assert.ok(Object.isFrozen(corr));

  // Foreign objects never correlate.
  assert.throws(
    () => correlateExternalEffect({
      correlationId: 'x',
      runtimeOperation: { role: 'runtime-logical-operation' } as never,
      externalAuthority: authority(),
    }),
    /ROLE_MISMATCH/,
  );

  // Idempotency key disagreement between runtime side and provider side fails.
  const conflict = errorOf(() =>
    correlateExternalEffect({
      correlationId: 'x',
      runtimeOperation: runtimeOp(),
      externalAuthority: authority(),
      providerOperation: adoptProviderOperationRef({
        baseline: BASELINE,
        providerOperationId: 'pi_other',
        idempotencyKey: 'a-different-key',
      }),
    }),
  );
  assert.equal(conflict.code, 'CORRELATION_CONFLICT');

  // Provider operation is optional (where available).
  const noProvider = correlateExternalEffect({
    correlationId: 'corr-2',
    runtimeOperation: runtimeOp(),
    externalAuthority: authority(),
  });
  assert.equal(noProvider.providerOperation, undefined);

  assert.equal(errorOf(() => correlateExternalEffect({
    correlationId: ' ',
    runtimeOperation: runtimeOp(),
    externalAuthority: authority(),
  } as never)).code, 'INVALID_REFERENCE');
});

test('I-006: exact correlation verification is fail-closed', () => {
  const corr = correlation();
  verifyExternalEffectCorrelation(corr, {
    correlationId: 'corr-1',
    effectId: 'effect:v2:abc123',
    authorityId: 'sor://payments-ledger',
    authorityScope: 'tenant-42/payment-intents',
    providerOperationId: 'pi_3Q9F',
  });
  // Every supplied expectation must match exactly; absent-vs-expected is a mismatch.
  for (const expectation of [
    { correlationId: 'corr-2' },
    { effectId: 'effect:v2:other' },
    { authorityId: 'sor://other' },
    { authorityScope: 'other-scope' },
    { providerOperationId: 'pi_other' },
  ]) {
    const error = errorOf(() => verifyExternalEffectCorrelation(corr, expectation));
    assert.equal(error.code, 'IDENTITY_MISMATCH');
  }
  // Expecting a providerOperationId on a correlation without one is a mismatch.
  const error = errorOf(() =>
    verifyExternalEffectCorrelation(
      correlateExternalEffect({
        correlationId: 'corr-2',
        runtimeOperation: runtimeOp(),
        externalAuthority: authority(),
      }),
      { providerOperationId: 'pi_3Q9F' },
    ),
  );
  assert.equal(error.code, 'IDENTITY_MISMATCH');
});

test('I-006: dispatch/attempt evidence proves dispatch only', () => {
  const evidence = adoptExternalDispatchAttemptEvidence({
    correlation: correlation(),
    attempt: 2,
    dispatchedAt: '2026-09-23T00:00:00.000Z',
  });
  assert.ok(isExternalDispatchAttemptEvidence(evidence));
  assert.equal(evidence.evidenceClass, 'dispatch-attempt');
  assert.equal(evidence.proves, 'dispatch-attempt-only');
  assert.equal(evidence.executionAuthority, 'none');
  assert.ok(Object.isFrozen(evidence));
  // Dispatch evidence is never observation evidence.
  assert.ok(!isExternalObservationEvidence(evidence));
  assert.ok(!isExternalReconciliationOutcome(evidence));

  assert.equal(
    errorOf(() => adoptExternalDispatchAttemptEvidence({ correlation: correlation(), attempt: 0 })).code,
    'INVALID_EVIDENCE',
  );
  assert.throws(
    () => adoptExternalDispatchAttemptEvidence({
      correlation: { correlationId: 'forged' } as never,
      attempt: 1,
    }),
    /ROLE_MISMATCH/,
  );
});

test('I-006: local timeout/abandonment/cancel can never become external evidence', () => {
  // Any attempt to smuggle a local execution cause into external evidence
  // fails loudly with LOCAL_CAUSE_FORBIDDEN.
  for (const smuggled of [
    { cause: new Error('socket hang up') },
    { error: 'ETIMEDOUT' },
    { signal: 'aborted' },
    { timedOut: true },
    { aborted: true },
    { abandonReason: 'gave up' },
  ]) {
    const dispatchError = errorOf(() =>
      adoptExternalDispatchAttemptEvidence({
        correlation: correlation(),
        attempt: 1,
        ...smuggled,
      } as never),
    );
    assert.equal(dispatchError.code, 'LOCAL_CAUSE_FORBIDDEN');

    const observationError = errorOf(() =>
      adoptExternalObservationEvidence({
        correlation: correlation(),
        classification: 'unknown-ambiguous',
        rawStatement: 'external stated nothing',
        ...smuggled,
      } as never),
    );
    assert.equal(observationError.code, 'LOCAL_CAUSE_FORBIDDEN');

    const reconciliationError = errorOf(() =>
      adoptExternalReconciliationOutcome({
        correlation: correlation(),
        reconciliation: adoptExternalReconciliationRef({ baseline: BASELINE, reconciliationId: 'r' }),
        result: 'TERMINAL_ABANDONMENT',
        ...smuggled,
      } as never),
    );
    assert.equal(reconciliationError.code, 'LOCAL_CAUSE_FORBIDDEN');
  }
});

test('I-006: observation claim is a derived ceiling and can never be strengthened', () => {
  const claimed = observation('accepted-pending');
  assert.equal(claimed.claim, 'external-acceptance-observed');

  // Caller-supplied claim is rejected outright.
  assert.equal(
    errorOf(() =>
      adoptExternalObservationEvidence({
        correlation: correlation(),
        classification: 'dispatch-acknowledged',
        rawStatement: 'wire accepted',
        claim: 'commit-observed-within-authority-scope',
      } as never),
    ).code,
    'INVALID_EVIDENCE',
  );

  // Closed vocabulary enforcement.
  assert.equal(
    errorOf(() =>
      adoptExternalObservationEvidence({
        correlation: correlation(),
        classification: 'definitely-failed' as never,
        rawStatement: 'x',
      }),
    ).code,
    'INVALID_EVIDENCE',
  );
  assert.equal(
    errorOf(() =>
      adoptExternalObservationEvidence({
        correlation: correlation(),
        classification: 'unknown-ambiguous',
        rawStatement: '  ',
      }),
    ).code,
    'INVALID_EVIDENCE',
  );
  // The raw statement is preserved verbatim for audit.
  assert.equal(observation('stale', 'provider said: old sequence').rawStatement, 'provider said: old sequence');
});

test('I-006: claim ceiling table matches the DAC §4 authority matrix', () => {
  const expected: Readonly<Record<string, string>> = {
    'dispatch-acknowledged': 'dispatch-attempt-only',
    'accepted-pending': 'external-acceptance-observed',
    'in-progress': 'external-progress-observed',
    rejected: 'non-commit-known-for-attempt',
    'known-failed-before-commit': 'non-commit-known-for-attempt',
    'effect-succeeded-provider-scope': 'provider-effect-success-observed',
    'commit-observed': 'commit-observed-within-authority-scope',
    'unknown-ambiguous': 'no-claim',
    stale: 'no-claim',
    conflicting: 'no-claim',
  };
  for (const classification of EXTERNAL_OBSERVATION_CLASSIFICATIONS) {
    assert.equal(maxClaimableForExternalObservation(classification), expected[classification]);
    assert.equal(observation(classification).claim, expected[classification]);
  }
  // Unknown never collapses into a failure or success claim; stale/conflicting
  // observations claim nothing.
  for (const weak of ['unknown-ambiguous', 'stale', 'conflicting'] as const) {
    assert.equal(maxClaimableForExternalObservation(weak), 'no-claim');
  }
  assert.equal(
    errorOf(() => maxClaimableForExternalObservation('nonsense' as never)).code,
    'INVALID_EVIDENCE',
  );
});

test('I-006: provider-scope effect success is not Business SoR commit', () => {
  const providerSuccess = observation('effect-succeeded-provider-scope', 'provider: succeeded');
  assert.ok(!observationSupportsCommitClaim(providerSuccess));
  assert.ok(!observationSupportsNonCommitClaim(providerSuccess));
  assert.equal(providerSuccess.claim, 'provider-effect-success-observed');

  const sorCommit = observation('commit-observed', 'SoR: committed');
  assert.ok(observationSupportsCommitClaim(sorCommit));
  assert.ok(!observationSupportsNonCommitClaim(sorCommit));

  for (const nonCommit of ['rejected', 'known-failed-before-commit'] as const) {
    assert.ok(observationSupportsNonCommitClaim(observation(nonCommit)));
  }
  // Weak/unknown observations support neither.
  for (const weak of ['dispatch-acknowledged', 'accepted-pending', 'in-progress', 'unknown-ambiguous'] as const) {
    const evidence = observation(weak);
    assert.ok(!observationSupportsCommitClaim(evidence));
    assert.ok(!observationSupportsNonCommitClaim(evidence));
  }
});

test('I-006: reconciliation results require a basis that actually supports them', () => {
  const recon = adoptExternalReconciliationRef({ baseline: BASELINE, reconciliationId: 'recon-1' });
  const corr = correlation();

  // RECONCILED_COMMITTED requires commit-observed; provider-scope success is not enough.
  const committed = adoptExternalReconciliationOutcome({
    correlation: corr,
    reconciliation: recon,
    result: 'RECONCILED_COMMITTED',
    basis: [observation('commit-observed', 'SoR: committed')],
  });
  assert.equal(committed.remoteTruth, 'committed');
  assert.equal(committed.executionAuthority, 'none');

  const providerSuccessOnly = errorOf(() =>
    adoptExternalReconciliationOutcome({
      correlation: corr,
      reconciliation: recon,
      result: 'RECONCILED_COMMITTED',
      basis: [observation('effect-succeeded-provider-scope')],
    }),
  );
  assert.equal(providerSuccessOnly.code, 'EVIDENCE_CONFLICT');

  // RECONCILED_NOT_COMMITTED requires authoritative rejection/pre-commit failure.
  const notCommitted = adoptExternalReconciliationOutcome({
    correlation: corr,
    reconciliation: recon,
    result: 'RECONCILED_NOT_COMMITTED',
    basis: [observation('rejected', 'SoR: rejected before commit')],
  });
  assert.equal(notCommitted.remoteTruth, 'not-committed');

  // unknown-ambiguous observations never establish non-commit.
  const unknownBasis = errorOf(() =>
    adoptExternalReconciliationOutcome({
      correlation: corr,
      reconciliation: recon,
      result: 'RECONCILED_NOT_COMMITTED',
      basis: [observation('unknown-ambiguous')],
    }),
  );
  assert.equal(unknownBasis.code, 'EVIDENCE_CONFLICT');

  // No basis at all never establishes commit/non-commit.
  assert.equal(
    errorOf(() => adoptExternalReconciliationOutcome({ correlation: corr, reconciliation: recon, result: 'RECONCILED_COMMITTED' })).code,
    'EVIDENCE_CONFLICT',
  );
  assert.equal(
    errorOf(() => adoptExternalReconciliationOutcome({ correlation: corr, reconciliation: recon, result: 'RECONCILED_NOT_COMMITTED' })).code,
    'EVIDENCE_CONFLICT',
  );

  // Dispatch-attempt evidence and foreign objects are never a basis.
  const dispatchAsBasis = errorOf(() =>
    adoptExternalReconciliationOutcome({
      correlation: corr,
      reconciliation: recon,
      result: 'RECONCILED_COMMITTED',
      basis: [adoptExternalDispatchAttemptEvidence({ correlation: corr, attempt: 1 }) as never],
    }),
  );
  assert.equal(dispatchAsBasis.code, 'EVIDENCE_CONFLICT');
  const forgedAsBasis = errorOf(() =>
    adoptExternalReconciliationOutcome({
      correlation: corr,
      reconciliation: recon,
      result: 'RECONCILED_NOT_COMMITTED',
      basis: [{ evidenceClass: 'external-observation', classification: 'rejected' } as never],
    }),
  );
  assert.equal(forgedAsBasis.code, 'EVIDENCE_CONFLICT');
});

test('I-006: unresolved truth stays unresolved (unknown/abandonment semantics)', () => {
  const recon = adoptExternalReconciliationRef({ baseline: BASELINE, reconciliationId: 'recon-2' });
  const corr = correlation();

  const stillUnknown = adoptExternalReconciliationOutcome({
    correlation: corr,
    reconciliation: recon,
    result: 'STILL_UNKNOWN',
    basis: [observation('unknown-ambiguous', 'provider status unrecognized')],
  });
  assert.equal(stillUnknown.remoteTruth, 'unresolved');
  assert.ok(isExternalReconciliationOutcome(stillUnknown));

  const abandoned = adoptExternalReconciliationOutcome({
    correlation: corr,
    reconciliation: recon,
    result: 'TERMINAL_ABANDONMENT',
  });
  // Terminal abandonment is a local stop only — remote truth stays unresolved.
  assert.equal(abandoned.remoteTruth, 'unresolved');

  // A decisive basis contradicts unresolved results: demand the reconciled form.
  for (const result of ['STILL_UNKNOWN', 'TERMINAL_ABANDONMENT'] as const) {
    const decisive = errorOf(() =>
      adoptExternalReconciliationOutcome({
        correlation: corr,
        reconciliation: recon,
        result,
        basis: [observation('commit-observed')],
      }),
    );
    assert.equal(decisive.code, 'EVIDENCE_CONFLICT');
  }

  // Closed result vocabulary.
  assert.equal(
    errorOf(() => adoptExternalReconciliationOutcome({
      correlation: corr,
      reconciliation: recon,
      result: 'FAILED' as never,
    })).code,
    'INVALID_EVIDENCE',
  );
  // Non-idempotent ambiguity preserved informationally through the runtime ref.
  assert.equal(runtimeOp().effectSemantics, 'non-idempotent');
});

test('I-006: evidence classes are nominal and never interchangeable', () => {
  const dispatch = adoptExternalDispatchAttemptEvidence({ correlation: correlation(), attempt: 1 });
  const obs = observation('commit-observed');
  const outcome = adoptExternalReconciliationOutcome({
    correlation: correlation(),
    reconciliation: adoptExternalReconciliationRef({ baseline: BASELINE, reconciliationId: 'r' }),
    result: 'RECONCILED_COMMITTED',
    basis: [observation('commit-observed')],
  });
  const guards = {
    dispatch: isExternalDispatchAttemptEvidence,
    observation: isExternalObservationEvidence,
    outcome: isExternalReconciliationOutcome,
  };
  const instances = { dispatch, observation: obs, outcome } as const;
  for (const [name, guard] of Object.entries(guards)) {
    for (const [instanceName, instance] of Object.entries(instances)) {
      if (name === instanceName) assert.ok(guard(instance));
      else assert.ok(!guard(instance), `${name} guard must reject ${instanceName}`);
    }
  }
  // Forged evidence never passes.
  assert.ok(!isExternalObservationEvidence({ ...obs }));
  // Vocabulary tuples stay closed and documented.
  assert.deepEqual(EXTERNAL_EVIDENCE_CLASSES, ['dispatch-attempt', 'external-observation', 'reconciliation-outcome']);
  assert.deepEqual(EXTERNAL_AUTHORITY_REFERENCE_ROLES, [
    'external-authority',
    'runtime-logical-operation',
    'provider-operation',
    'external-observation',
    'external-reconciliation',
  ]);
  assert.ok(EXTERNAL_OBSERVATION_CLAIMS.includes('no-claim'));
  assert.ok(EXTERNAL_RECONCILIATION_RESULTS.includes('STILL_UNKNOWN'));
});

test('I-006: every evidence record is marked executionAuthority none', () => {
  const dispatch = adoptExternalDispatchAttemptEvidence({ correlation: correlation(), attempt: 1 });
  const obs = observation('in-progress');
  const outcome = adoptExternalReconciliationOutcome({
    correlation: correlation(),
    reconciliation: adoptExternalReconciliationRef({ baseline: BASELINE, reconciliationId: 'r' }),
    result: 'STILL_UNKNOWN',
  });
  assert.equal(dispatch.executionAuthority, 'none');
  assert.equal(obs.executionAuthority, 'none');
  assert.equal(outcome.executionAuthority, 'none');
});
