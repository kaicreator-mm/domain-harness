// Issue #329 / DAC v0.0.3 V3-005 — C62–C70 executable conformance closure:
// the External Operation group over the merged #327 V3-003 surface (with the
// #309 v0.0.2 evidence consumed read-only where applicable) —
// dispatch/acceptance ceilings, ambiguity preservation, safe-retry identity
// rules, idempotency equivalence, role substitution refutations,
// currentness adjudication, and evidence-backed reconciliation.
//
// Additive conformance evidence only: no product surface is edited here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjudicateDacV003ObservationCurrentness,
  evaluateDacV003SafeRetry,
  isDacV003IdempotencyGuaranteeProven,
  reconcileDacV003ExternalOperation,
  refuteDacV003AttemptAsLogicalOperation,
  refuteDacV003LocalCauseAsRemoteTruth,
  refuteDacV003ProviderOperationAsAuthoritativeEffectRecord,
  assertDacV003AttemptIdentitiesDistinct,
  assertDacV003IdempotencyReuseForLogicalEffect,
  assertDacV003LogicalOperationContinuity,
  maxJustifiedMeaningForAttemptEvidence,
} from '../../src/dac-v003-external/index.js';
import {
  attempt,
  assertErrorCode,
  BASELINE,
  effectRecord,
  externalAuthority,
  logicalOperation,
  observation,
  providerOperation,
  provenIdempotency,
} from '../dac-v003/external-fixture.js';

function reconcile(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof reconcileDacV003ExternalOperation> {
  const logical = logicalOperation();
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    reconciliationIdentity: 'recon-c6x',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority: logical.externalAuthority,
    logicalOperation: logical,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
  };
  return reconcileDacV003ExternalOperation({ ...defaults, ...overrides } as never);
}

test('C62: request dispatch is never authoritative commit — dispatch-only evidence keeps remote truth unresolved', () => {
  const logical = logicalOperation();
  assert.equal(
    maxJustifiedMeaningForAttemptEvidence('dispatch-attempted'),
    'dispatch-occurred-only',
  );
  const episode = reconcile({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputObservations: [
      observation({
        observationIdentity: 'obs-dispatch-only',
        logicalOperation: logical,
        observedClass: 'REQUEST_DISPATCHED',
      }),
    ],
  });
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(episode.conclusion.remoteTruth, 'unresolved');
});

test('C63: provider acceptance and provider-scope success are never Business SoR commit', () => {
  const logical = logicalOperation();
  for (const acceptedClass of [
    'ACCEPTED_FOR_PROCESSING',
    'PENDING_IN_PROGRESS',
    'EFFECT_SUCCEEDED',
  ] as const) {
    const episode = reconcile({
      logicalOperation: logical,
      externalAuthority: logical.externalAuthority,
      inputObservations: [
        observation({
          observationIdentity: `obs-${acceptedClass}`,
          logicalOperation: logical,
          observedClass: acceptedClass,
        }),
      ],
    });
    assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
    assert.equal(episode.conclusion.remoteTruth, 'unresolved');
  }
  // Only an AUTHORITATIVE_COMMITTED observation concludes commit.
  const committed = reconcile({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputObservations: [
      observation({
        observationIdentity: 'obs-commit',
        logicalOperation: logical,
        observedClass: 'AUTHORITATIVE_COMMITTED',
      }),
    ],
  });
  assert.equal(committed.conclusion.outcomeClass, 'RECONCILED_COMMITTED');
  assert.equal(committed.conclusion.remoteTruth, 'committed');
});

test('C64: timeout/crash after possible dispatch stays UNKNOWN_AMBIGUOUS and never becomes known non-commit', () => {
  assert.equal(
    maxJustifiedMeaningForAttemptEvidence('dispatch-outcome-ambiguous'),
    'ambiguous-preserve-unresolved',
  );
  // Local timeout/cancel/interrupt material can never be remote truth.
  assertErrorCode(
    () =>
      refuteDacV003LocalCauseAsRemoteTruth({
        cause: 'local-timeout',
        claimedRemoteTruth: 'RECONCILED_NOT_COMMITTED',
      }),
    'LOCAL_CAUSE_FORBIDDEN',
    'local timeout claimed as non-commit',
  );
  assertErrorCode(
    () =>
      refuteDacV003LocalCauseAsRemoteTruth({
        cause: 'local-cancel',
        claimedRemoteTruth: 'non-commit',
      }),
    'LOCAL_CAUSE_FORBIDDEN',
    'local cancellation claimed as non-commit',
  );
  // A reconciliation with only ambiguous/timeout-shaped evidence preserves
  // the unknown — TERMINAL_ABANDONMENT stays a local stop with remote truth
  // unresolved instead of a non-commit conclusion.
  const ambiguous = reconcile({
    logicalOperation: logicalOperation(),
    inputAttempts: [
      attempt({ evidenceClass: 'dispatch-outcome-ambiguous', attemptIdentity: 'att-c64' }),
    ],
    explicitLocalAbandonment: true,
  });
  assert.equal(ambiguous.conclusion.outcomeClass, 'TERMINAL_ABANDONMENT');
  assert.equal(ambiguous.conclusion.remoteTruth, 'unresolved');
});

test('C65: a duplicating retry after an unresolved attempt is not authorized without proven non-commit/idempotency', () => {
  const logical = logicalOperation();
  const unresolved = [
    attempt({ evidenceClass: 'dispatch-outcome-ambiguous', attemptIdentity: 'att-u1' }),
  ];
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logical,
    priorAttempts: unresolved,
    intendedCommandSemanticIdentity: 'charge-order',
  });
  assert.equal(decision.decision, 'NOT_AUTHORIZED_AMBIGUITY_PRESERVED');
  assert.equal(decision.identityDirective, 'no-new-attempt');
  assert.equal(decision.remoteTruthUnresolved, true);
  assert.equal(decision.justification, 'possible-prior-dispatch-no-proof');
  assert.equal(decision.runtimeExecutionAuthority, 'none');
  // An unproven locally-recorded idempotency key authorizes nothing.
  const metadataOnlyKey = provenIdempotency({
    guaranteeEvidenceRefs: [],
    equivalenceRule: { kind: 'semantic', establishedFromEvidence: false },
  });
  assert.equal(isDacV003IdempotencyGuaranteeProven(metadataOnlyKey), false);
  const withUnprovenKey = evaluateDacV003SafeRetry({
    logicalOperation: logical,
    priorAttempts: unresolved,
    idempotencyIdentity: metadataOnlyKey as never,
    intendedCommandSemanticIdentity: 'charge-order',
  });
  assert.equal(withUnprovenKey.decision, 'NOT_AUTHORIZED_AMBIGUITY_PRESERVED');
  // The proven guarantee DOES authorize replay under equivalence (positive
  // control — the denial above is evidence-driven, not a blanket refusal).
  const proven = provenIdempotency();
  assert.equal(isDacV003IdempotencyGuaranteeProven(proven), true);
  const withProvenKey = evaluateDacV003SafeRetry({
    logicalOperation: logical,
    priorAttempts: unresolved,
    idempotencyIdentity: proven,
    intendedCommandSemanticIdentity: 'charge-order',
  });
  assert.equal(withProvenKey.decision, 'PERMITTED_IDEMPOTENT_REPLAY');
});

test('C66: an idempotency identity reused for a semantically different effect fails closed', () => {
  const idem = provenIdempotency();
  const logical = logicalOperation();
  // Same key, different intended logical-effect semantics.
  assertErrorCode(
    () =>
      assertDacV003IdempotencyReuseForLogicalEffect(idem, logical, 'refund-order'),
    'IDEMPOTENCY_REUSE_FORBIDDEN',
    'same key for charge-order reused on refund-order',
  );
  // Same key, different issuing authority scope.
  const foreignScopeAuthority = externalAuthority({
    authorityId: 'other-sor',
    authorityScope: 'other/truth',
  });
  const foreignLogical = logicalOperation({
    externalAuthority: foreignScopeAuthority,
  });
  assertErrorCode(
    () =>
      assertDacV003IdempotencyReuseForLogicalEffect(idem, foreignLogical, 'charge-order'),
    'IDEMPOTENCY_REUSE_FORBIDDEN',
    'same key under a different authority scope',
  );
  // The bound semantic identity continues to be accepted.
  assert.doesNotThrow(() =>
    assertDacV003IdempotencyReuseForLogicalEffect(idem, logical, 'charge-order'),
  );
});

test('C67: attempt identity stays distinct from the logical operation identity and from sibling attempts', () => {
  const logical = logicalOperation();
  // An attempt whose identity equals the logical operation identity fails.
  assertErrorCode(
    () =>
      attempt({
        logicalOperation: logical,
        attemptIdentity: logical.reference.primaryIdentity,
      }),
    'IDENTITY_MISMATCH',
    'attempt identity collapses into logical operation identity',
  );
  // A replayed attempt identity over the same operation fails.
  const first = attempt({ attemptIdentity: 'attempt-0001' });
  const second = attempt({ attemptIdentity: 'attempt-0001' });
  assertErrorCode(
    () => assertDacV003AttemptIdentitiesDistinct([first, second]),
    'IDENTITY_MISMATCH',
    'same attempt identity reused for a new attempt',
  );
  // The AttemptRef cannot substitute the LogicalOperationRef.
  assertErrorCode(
    () => refuteDacV003AttemptAsLogicalOperation(first),
    'ROLE_MISMATCH',
    'attempt ref as logical operation',
  );
  // Distinct attempts of the same logical operation are exactly the rule.
  const retry = attempt({ attemptIdentity: 'attempt-0002' });
  assert.doesNotThrow(() => assertDacV003AttemptIdentitiesDistinct([first, retry]));
  assert.equal(retry.logicalOperation.reference.primaryIdentity, 'logical-op-0001');
});

test('C68: a provider job identity never substitutes the authoritative effect/business record', () => {
  const job = providerOperation();
  assertErrorCode(
    () => refuteDacV003ProviderOperationAsAuthoritativeEffectRecord(job),
    'ROLE_MISMATCH',
    'provider job as authoritative effect record',
  );
  // The genuine effect record is not a provider job (negative control).
  const record = effectRecord();
  assert.doesNotThrow(() =>
    refuteDacV003ProviderOperationAsAuthoritativeEffectRecord(record),
  );
  // An observation identifying only a provider job and no effect record
  // cannot serve as commit proof by itself in reconciliation: only
  // AUTHORITATIVE_COMMITTED with record evidence concludes commit.
  const logical = logicalOperation();
  const jobOnly = reconcile({
    logicalOperation: logical,
    inputProviderOperations: [job],
    inputObservations: [
      observation({
        observationIdentity: 'obs-job-only',
        logicalOperation: logical,
        observedClass: 'EFFECT_SUCCEEDED',
        providerOperations: [job],
      }),
    ],
  });
  assert.equal(jobOnly.conclusion.outcomeClass, 'STILL_UNKNOWN');
});

test('C69: stale/conflicting observations never mutate current truth by last-write-wins', () => {
  const logical = logicalOperation();
  const committed = observation({
    observationIdentity: 'obs-commit-newer',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
    providerCurrentness: { sequence: '2' },
  });
  const rejected = observation({
    observationIdentity: 'obs-rejected-older',
    logicalOperation: logical,
    observedClass: 'REJECTED',
    providerCurrentness: { sequence: '1' },
  });
  // Ordering is by provider currentness semantics, not arrival order.
  const newestLast = adjudicateDacV003ObservationCurrentness({
    observations: [rejected, committed],
  });
  const newestFirst = adjudicateDacV003ObservationCurrentness({
    observations: [committed, rejected],
  });
  for (const result of [newestLast, newestFirst]) {
    const byId = new Map(result.adjudications.map((a) => [a.observation.reference.primaryIdentity, a.currentness]));
    assert.equal(
      byId.get('obs-commit-newer'),
      'CURRENT',
    );
    assert.equal(
      byId.get('obs-rejected-older'),
      'STALE',
    );
    assert.equal(result.requiresReconciliation, false);
  }
  // Genuinely conflicting current observations require reconciliation —
  // neither arrival order picks a winner.
  const conflictingA = observation({
    observationIdentity: 'obs-conflict-a',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
    providerCurrentness: { sequence: '5' },
  });
  const conflictingB = observation({
    observationIdentity: 'obs-conflict-b',
    logicalOperation: logical,
    observedClass: 'KNOWN_FAILED_BEFORE_COMMIT',
    providerCurrentness: { sequence: '5' },
  });
  for (const order of [
    [conflictingA, conflictingB],
    [conflictingB, conflictingA],
  ] as const) {
    const result = adjudicateDacV003ObservationCurrentness({ observations: [...order] });
    assert.equal(
      result.adjudications.filter((a) => a.currentness === 'CONFLICTING').length,
      2,
    );
    assert.equal(result.requiresReconciliation, true);
  }
  // A reconciliation over unresolved conflict keeps truth unknown and never
  // last-write-wins.
  const episode = reconcile({
    logicalOperation: logical,
    inputObservations: [conflictingA, conflictingB],
  });
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(episode.conclusion.unresolvedConflictPresent, true);
});

test('C70: preserved exact operation/attempt/provider/observation identities reconcile to authoritative committed truth', () => {
  const logical = logicalOperation();
  const job = providerOperation({ providerOperationId: 'provider-job-77' });
  const record = effectRecord({ effectRecordIdentity: 'record-0001' });
  const commit = observation({
    observationIdentity: 'obs-commit-final',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
    providerCurrentness: { sequence: '9' },
    providerOperations: [job],
    effectRecords: [record],
  });
  const firstAttempt = attempt({
    logicalOperation: logical,
    attemptIdentity: 'attempt-0001',
    evidenceClass: 'dispatch-outcome-ambiguous',
    providerOperation: job,
  });
  const episode = reconcile({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    actionSemantics: 'reconcile-local-vs-external-truth',
    inputAttempts: [firstAttempt],
    inputProviderOperations: [job],
    inputObservations: [commit],
    inputEffectRecords: [record],
  });
  assert.equal(episode.conclusion.outcomeClass, 'RECONCILED_COMMITTED');
  assert.equal(episode.conclusion.remoteTruth, 'committed');
  // The conclusion preserves the exact evidence basis identities.
  const basisIds = episode.conclusion.basis.map(
    (b) => b.primaryIdentity,
  );
  assert.ok(basisIds.includes('obs-commit-final'));
  // Historical inputs are never rewritten: the ambiguous first attempt is
  // still carried verbatim as immutable historical evidence.
  assert.ok(
    episode.inputAttempts.some(
      (a) =>
        a.reference.primaryIdentity === 'attempt-0001' &&
        a.evidenceClass === 'dispatch-outcome-ambiguous',
    ),
  );
  assert.equal(episode.runtimeExecutionAuthority, 'none');
  // And the newer conclusion does not rewrite the older ambiguity: the
  // observation itself stays immutable historical evidence.
  assert.equal(commit.observedClass, 'AUTHORITATIVE_COMMITTED');
});

test('C62–C70 support: query/watch/reconcile semantics never create a new effect attempt', () => {
  // The observational action-semantics vocabulary excludes effectful
  // actions; presenting one fails closed with the explicit-modeling rule.
  assertErrorCode(
    () =>
      reconcile({
        logicalOperation: logicalOperation(),
        actionSemantics: 'retry-same-logical-effect',
      }),
    'INVALID_ACTION_SEMANTICS',
    'effectful retry hidden as reconciliation action semantics',
  );
  // Continuity: a materially changed command/authority/target requires a NEW
  // logical operation — the same operation cannot silently mutate.
  const prior = logicalOperation();
  assertErrorCode(
    () =>
      assertDacV003LogicalOperationContinuity(prior, {
        externalAuthority: prior.externalAuthority,
        operationSemanticIdentity: 'refund-order',
        semanticTargetRefs: prior.semanticTargetRefs,
      }),
    'IDENTITY_MISMATCH',
    'changed effect semantics on the same logical operation',
  );
  assert.doesNotThrow(() =>
    assertDacV003LogicalOperationContinuity(prior, {
      externalAuthority: prior.externalAuthority,
      operationSemanticIdentity: prior.operationSemanticIdentity,
      semanticTargetRefs: prior.semanticTargetRefs,
    }),
  );
});
