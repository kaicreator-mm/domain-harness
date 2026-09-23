// Issue #311 / A2 I-008 FINAL matrix — I-006 / #309 external-authority layer.
// Executes the deferred external halves: dispatch/timeout can never fabricate
// external commit or non-commit (C11/C12/N13/N14), ambiguous non-idempotent
// effects are never blindly retried into a claim (C13/N15), reconciliation
// identity is exact and claim ceilings are frozen (N13), and no Runtime-side
// identity substitutes external Business SoR identity (N16).
//
// Test/doc-only: no product semantics changed, no DAC v0.0.3 V3 scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTERNAL_AUTHORITY_BASELINE,
  ExternalAuthorityError,
  type ExternalObservationClassification,
  adoptExternalAuthorityRef,
  adoptExternalDispatchAttemptEvidence,
  adoptExternalObservationEvidence,
  adoptExternalObservationRef,
  adoptExternalReconciliationOutcome,
  adoptExternalReconciliationRef,
  adoptProviderOperationRef,
  adoptRuntimeLogicalOperationRef,
  correlateExternalEffect,
  maxClaimableForExternalObservation,
  observationSupportsCommitClaim,
  observationSupportsNonCommitClaim,
  refuteNonExternalAuthorityIdentity,
  verifyExternalEffectCorrelation,
} from '../../src/external-authority/index.js';
import {
  DacReferenceError,
  adoptPromotionDecisionRef,
  refuteExternalBusinessSoRIdentity,
} from '../../src/dac/index.js';
import { FINAL_BASELINE, assertErrorInstance, catchSync } from './final-matrix-fixtures.js';

const XA_BASELINE = { ...EXTERNAL_AUTHORITY_BASELINE };

function runtimeOperation(overrides: Record<string, unknown> = {}) {
  return adoptRuntimeLogicalOperationRef({
    baseline: XA_BASELINE,
    effectId: 'effect-0001',
    attempt: 1,
    effectSemantics: 'non-idempotent',
    idempotencyKey: 'idem-key-0001',
    ...overrides,
  });
}

function externalAuthority() {
  return adoptExternalAuthorityRef({
    baseline: XA_BASELINE,
    authorityId: 'sor://acme/erp',
    authorityScope: 'invoice-posting',
  });
}

function providerOperation(overrides: Record<string, unknown> = {}) {
  return adoptProviderOperationRef({
    baseline: XA_BASELINE,
    providerOperationId: 'prov-op-0001',
    idempotencyKey: 'idem-key-0001',
    ...overrides,
  });
}

function correlation(overrides: Record<string, unknown> = {}) {
  return correlateExternalEffect({
    correlationId: 'corr-0001',
    runtimeOperation: runtimeOperation(),
    externalAuthority: externalAuthority(),
    providerOperation: providerOperation(),
    ...overrides,
  });
}

function observation(
  classification: ExternalObservationClassification,
  overrides: Record<string, unknown> = {},
) {
  return adoptExternalObservationEvidence({
    correlation: correlation(),
    observation: adoptExternalObservationRef({
      baseline: XA_BASELINE,
      observationId: 'obs-0001',
    }),
    classification,
    rawStatement: `"${classification}" per provider API 2026-09-24`,
    ...overrides,
  });
}

function reconciliation() {
  return adoptExternalReconciliationRef({
    baseline: XA_BASELINE,
    reconciliationId: 'recon-0001',
  });
}

// -------------------------- C11 / N13 (dispatch is never commit evidence)

test('final C11/N13 external half: dispatch/attempt evidence proves dispatch only — never commit, never non-commit', () => {
  const dispatch = adoptExternalDispatchAttemptEvidence({
    correlation: correlation(),
    attempt: 1,
    dispatchedAt: '2026-09-24T00:00:00.000Z',
  });
  assert.equal(dispatch.evidenceClass, 'dispatch-attempt');
  assert.equal(dispatch.proves, 'dispatch-attempt-only');
  assert.equal(dispatch.executionAuthority, 'none');

  // Dispatch evidence is structurally barred from a reconciliation basis:
  // only adopted external-observation evidence may establish remote truth.
  assertErrorInstance(
    catchSync(() =>
      adoptExternalReconciliationOutcome({
        correlation: correlation(),
        reconciliation: reconciliation(),
        result: 'RECONCILED_COMMITTED',
        basis: [dispatch as never],
      }),
    ),
    ExternalAuthorityError,
    'EVIDENCE_CONFLICT',
    'dispatch evidence as commit basis',
  );
  assertErrorInstance(
    catchSync(() =>
      adoptExternalReconciliationOutcome({
        correlation: correlation(),
        reconciliation: reconciliation(),
        result: 'RECONCILED_NOT_COMMITTED',
        basis: [dispatch as never],
      }),
    ),
    ExternalAuthorityError,
    'EVIDENCE_CONFLICT',
    'dispatch evidence as non-commit basis',
  );
});

// ----------------- C12 / N14 (local timeout/abandonment fabrication bars)

test('final C12/N14 external half: a local timeout/crash/abandonment can never fabricate commit or non-commit', () => {
  // Local cause fields are rejected on every evidence class at the boundary.
  for (const localCause of [
    { timedOut: true },
    { timeoutMs: 5000 },
    { aborted: true },
    { cause: 'socket-timeout' },
    { error: new Error('ETIMEDOUT') },
    { abandonment: 'local-stop' },
    { localOutcome: 'gave-up' },
  ] as const) {
    assertErrorInstance(
      catchSync(() =>
        adoptExternalDispatchAttemptEvidence({
          correlation: correlation(),
          attempt: 1,
          ...localCause,
        } as never),
      ),
      ExternalAuthorityError,
      'LOCAL_CAUSE_FORBIDDEN',
      `dispatch evidence with ${Object.keys(localCause)[0]}`,
    );
    assertErrorInstance(
      catchSync(() =>
        adoptExternalObservationEvidence({
          correlation: correlation(),
          classification: 'unknown-ambiguous',
          rawStatement: 'provider read timed out locally',
          ...localCause,
        } as never),
      ),
      ExternalAuthorityError,
      'LOCAL_CAUSE_FORBIDDEN',
      `observation evidence with ${Object.keys(localCause)[0]}`,
    );
    assertErrorInstance(
      catchSync(() =>
        adoptExternalReconciliationOutcome({
          correlation: correlation(),
          reconciliation: reconciliation(),
          result: 'RECONCILED_NOT_COMMITTED',
          ...localCause,
        } as never),
      ),
      ExternalAuthorityError,
      'LOCAL_CAUSE_FORBIDDEN',
      `reconciliation outcome with ${Object.keys(localCause)[0]}`,
    );
  }

  // Without an authoritative non-commit observation, NOT_COMMITTED cannot be
  // adopted — the timeout-shaped "we gave up" story has no path to it.
  assertErrorInstance(
    catchSync(() =>
      adoptExternalReconciliationOutcome({
        correlation: correlation(),
        reconciliation: reconciliation(),
        result: 'RECONCILED_NOT_COMMITTED',
        basis: [],
      }),
    ),
    ExternalAuthorityError,
    'EVIDENCE_CONFLICT',
    'not-committed without non-commit basis',
  );

  // TERMINAL_ABANDONMENT is a local stop only: remote truth stays unresolved.
  const abandoned = adoptExternalReconciliationOutcome({
    correlation: correlation(),
    reconciliation: reconciliation(),
    result: 'TERMINAL_ABANDONMENT',
    basis: [],
  });
  assert.equal(abandoned.remoteTruth, 'unresolved');
  assert.equal(abandoned.executionAuthority, 'none');
});

// ------------------------ C13 / N15 (blind ambiguous retry, claim ceilings)

test('final C13/N15 external half: unknown-ambiguous non-idempotent truth is never collapsed into a claim or blindly retried', () => {
  // Claim ceilings are frozen for the ambiguity/staleness family.
  assert.equal(maxClaimableForExternalObservation('unknown-ambiguous'), 'no-claim');
  assert.equal(maxClaimableForExternalObservation('stale'), 'no-claim');
  assert.equal(maxClaimableForExternalObservation('conflicting'), 'no-claim');
  const unknown = observation('unknown-ambiguous');
  assert.equal(unknown.claim, 'no-claim');
  assert.ok(!observationSupportsCommitClaim(unknown));
  assert.ok(!observationSupportsNonCommitClaim(unknown));

  // A caller cannot strengthen the claim: claim is derived, never supplied.
  assertErrorInstance(
    catchSync(() =>
      adoptExternalObservationEvidence({
        correlation: correlation(),
        classification: 'unknown-ambiguous',
        rawStatement: 'provider returned a garbled body',
        claim: 'commit-observed-within-authority-scope',
      } as never),
    ),
    ExternalAuthorityError,
    'INVALID_EVIDENCE',
    'caller-supplied claim rejected',
  );

  // STILL_UNKNOWN keeps remote truth unresolved even with ambiguous material
  // in the basis; a decisive basis demands the matching RECONCILED_* result.
  const stillUnknown = adoptExternalReconciliationOutcome({
    correlation: correlation(),
    reconciliation: reconciliation(),
    result: 'STILL_UNKNOWN',
    basis: [unknown],
  });
  assert.equal(stillUnknown.remoteTruth, 'unresolved');
  assertErrorInstance(
    catchSync(() =>
      adoptExternalReconciliationOutcome({
        correlation: correlation(),
        reconciliation: reconciliation(),
        result: 'STILL_UNKNOWN',
        basis: [observation('commit-observed')],
      }),
    ),
    ExternalAuthorityError,
    'EVIDENCE_CONFLICT',
    'decisive commit basis with STILL_UNKNOWN',
  );

  // Provider-scope effect success is NOT Business SoR commit.
  const providerSuccess = observation('effect-succeeded-provider-scope');
  assert.ok(!observationSupportsCommitClaim(providerSuccess));
  assertErrorInstance(
    catchSync(() =>
      adoptExternalReconciliationOutcome({
        correlation: correlation(),
        reconciliation: reconciliation(),
        result: 'RECONCILED_COMMITTED',
        basis: [providerSuccess],
      }),
    ),
    ExternalAuthorityError,
    'EVIDENCE_CONFLICT',
    'provider-scope success cannot establish business commit',
  );

  // The genuine commit path requires a commit-observed basis exactly.
  const committed = adoptExternalReconciliationOutcome({
    correlation: correlation(),
    reconciliation: reconciliation(),
    result: 'RECONCILED_COMMITTED',
    basis: [observation('commit-observed')],
  });
  assert.equal(committed.remoteTruth, 'committed');
  assert.equal(
    committed.executionAuthority,
    'none',
    'no evidence object acquires Runtime execution authority',
  );
});

// ------------------------------------------- N13 (exact correlation identity)

test('final N13 external half: reconciliation identity is exact — idempotency conflicts and expectation mismatches fail closed', () => {
  // The same logical effect never rebinds to a different idempotency identity.
  assertErrorInstance(
    catchSync(() =>
      correlateExternalEffect({
        correlationId: 'corr-0001',
        runtimeOperation: runtimeOperation({ idempotencyKey: 'idem-key-0001' }),
        externalAuthority: externalAuthority(),
        providerOperation: providerOperation({ idempotencyKey: 'idem-key-DIFFERENT' }),
      }),
    ),
    ExternalAuthorityError,
    'CORRELATION_CONFLICT',
    'idempotency key drift',
  );

  // Exact verification: a supplied expectation against a missing or different
  // correlation field is a mismatch, never a pass.
  const corr = correlation();
  verifyExternalEffectCorrelation(corr, { effectId: 'effect-0001' });
  assertErrorInstance(
    catchSync(() => verifyExternalEffectCorrelation(corr, { effectId: 'effect-0002' })),
    ExternalAuthorityError,
    'IDENTITY_MISMATCH',
    'effectId expectation mismatch',
  );
  assertErrorInstance(
    catchSync(() =>
      verifyExternalEffectCorrelation(corr, { providerOperationId: 'prov-op-0002' }),
    ),
    ExternalAuthorityError,
    'IDENTITY_MISMATCH',
    'providerOperationId expectation mismatch',
  );

  // A forged (structurally identical) correlation is not a correlation.
  const forged = { ...corr };
  assertErrorInstance(
    catchSync(() =>
      adoptExternalDispatchAttemptEvidence({ correlation: forged as never, attempt: 1 }),
    ),
    ExternalAuthorityError,
    'ROLE_MISMATCH',
    'forged correlation clone',
  );
});

// ------------------------------------------------------- N16 (identity walls)

test('final N16 external half: no Runtime-side identity substitutes external Business SoR identity', () => {
  // Provider-operation / runtime-logical identities of this family are barred.
  assertErrorInstance(
    catchSync(() => refuteNonExternalAuthorityIdentity(providerOperation())),
    ExternalAuthorityError,
    'IDENTITY_MISMATCH',
    'provider operation refuted as authority identity',
  );
  assertErrorInstance(
    catchSync(() => refuteNonExternalAuthorityIdentity(runtimeOperation())),
    ExternalAuthorityError,
    'IDENTITY_MISMATCH',
    'runtime-logical operation refuted as authority identity',
  );

  // DAC lifecycle refs are barred by the DAC-side refute (families disjoint).
  const dacRef = adoptPromotionDecisionRef({
    baseline: FINAL_BASELINE,
    semanticIdentity: 'domain:billing:invoice-rules',
    authorityScope: 'dac://governance/promotion',
    revisionIdentity: 'rev-000042',
    contentDigest: 'fixture-sha256:body',
  });
  assertErrorInstance(
    catchSync(() => refuteExternalBusinessSoRIdentity(dacRef)),
    DacReferenceError,
    'EXTERNAL_IDENTITY_FORBIDDEN',
    'dac lifecycle ref refuted as SoR identity',
  );
  // And from the external side, the same DAC ref is simply not an adopted
  // external-authority reference.
  assertErrorInstance(
    catchSync(() =>
      correlateExternalEffect({
        correlationId: 'corr-0001',
        runtimeOperation: runtimeOperation(),
        externalAuthority: dacRef as never,
      }),
    ),
    ExternalAuthorityError,
    'ROLE_MISMATCH',
    'DAC promotion decision as external authority',
  );
});
