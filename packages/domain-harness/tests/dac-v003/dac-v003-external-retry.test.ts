// Issue #327 / DAC v0.0.3 V3-003 — the §11 safe retry / replay decision
// matrix and §7 idempotency obligations as executable invariants
// (conformance C64–C67): retry keeps the same LogicalOperationRef and mints
// a new AttemptRef only under evidence-backed conditions; a possibly
// duplicating retry without proof is not authorized; safe replay requires a
// PROVEN idempotency issuer/scope/effect equivalence; local abandonment
// never becomes non-commit proof; a changed intent requires a new logical
// operation instead of a retry.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DacV003ExternalError,
  assertDacV003IdempotencyReuseForLogicalEffect,
  evaluateDacV003SafeRetry,
  isDacV003IdempotencyGuaranteeProven,
} from '../../src/dac-v003-external/index.js';
import { adoptDacV003RegistryReference } from '../../src/dac-v003/index.js';
import {
  assertErrorCode,
  attempt,
  effectRecord,
  logicalOperation,
  provenIdempotency,
  BASELINE,
} from './external-fixture.js';

const SEMANTIC = 'charge-order';

test('v3-003 §11 row 1: proven known non-commit permits same-operation new attempt', () => {
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logicalOperation(),
    priorAttempts: [attempt({ evidenceClass: 'definitively-rejected-known-pre-commit-failed' })],
    intendedCommandSemanticIdentity: SEMANTIC,
  });
  assert.equal(decision.decision, 'PERMITTED_SAME_OPERATION_NEW_ATTEMPT');
  assert.equal(decision.justification, 'known-non-commit-cannot-later-commit');
  assert.equal(decision.identityDirective, 'same-logical-operation-new-attempt');
  assert.equal(decision.remoteTruthUnresolved, false);
  assert.ok(
    decision.reasons.some((r) => r.includes('does not imply commit')),
    'the permission carries no commit claim',
  );
  assert.equal(decision.runtimeExecutionAuthority, 'none');
});

test('v3-003 §11 zero-crossing: trustworthy not-dispatched evidence is not a duplicating retry', () => {
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logicalOperation(),
    priorAttempts: [attempt({ evidenceClass: 'not-dispatched', attemptIdentity: 'attempt-n1' })],
    intendedCommandSemanticIdentity: SEMANTIC,
  });
  assert.equal(decision.decision, 'PERMITTED_SAME_OPERATION_NEW_ATTEMPT');
  assert.equal(decision.justification, 'no-prior-dispatch-crossing');
  assert.equal(decision.identityDirective, 'same-logical-operation-new-attempt');
});

test('v3-003 §11 row 2: proven idempotency authorizes replay — metadata alone does not (§7.4)', () => {
  const logical = logicalOperation();
  const unresolved = [
    attempt({ evidenceClass: 'dispatch-outcome-ambiguous', attemptIdentity: 'attempt-u1' }),
  ];
  const proven = provenIdempotency();
  assert.ok(isDacV003IdempotencyGuaranteeProven(proven));
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logical,
    priorAttempts: unresolved,
    idempotencyIdentity: proven,
    intendedCommandSemanticIdentity: SEMANTIC,
  });
  assert.equal(decision.decision, 'PERMITTED_IDEMPOTENT_REPLAY');
  assert.equal(
    decision.identityDirective,
    'same-logical-operation-same-idempotency-new-attempt',
  );
  assert.equal(decision.remoteTruthUnresolved, true);
  assert.ok(
    decision.reasons.some((r) => r.includes('does not grant commit truth')),
    'replay safety never grants commit truth',
  );

  // The same key without provider/integration dedup evidence is correlation
  // metadata only and cannot authorize the replay.
  const unproven = provenIdempotency({
    guaranteeEvidenceRefs: [],
    equivalenceRule: {
      kind: 'semantic',
      establishedFromEvidence: false,
    },
  });
  assert.equal(isDacV003IdempotencyGuaranteeProven(unproven), false);
  const denied = evaluateDacV003SafeRetry({
    logicalOperation: logical,
    priorAttempts: unresolved,
    idempotencyIdentity: unproven,
    intendedCommandSemanticIdentity: SEMANTIC,
  });
  assert.equal(denied.decision, 'NOT_AUTHORIZED_AMBIGUITY_PRESERVED');
  assert.ok(
    denied.reasons.some((r) => r.includes('correlation metadata only')),
    'the denial names the unproven idempotency basis',
  );
});

test('v3-003 §11 row 4: possible prior dispatch without proof is not authorized (C64/C65)', () => {
  for (const evidenceClass of ['dispatch-attempted', 'dispatch-outcome-ambiguous'] as const) {
    const decision = evaluateDacV003SafeRetry({
      logicalOperation: logicalOperation(),
      priorAttempts: [attempt({ evidenceClass, attemptIdentity: `attempt-${evidenceClass}` })],
      intendedCommandSemanticIdentity: SEMANTIC,
    });
    assert.equal(decision.decision, 'NOT_AUTHORIZED_AMBIGUITY_PRESERVED');
    assert.equal(decision.justification, 'possible-prior-dispatch-no-proof');
    assert.equal(decision.identityDirective, 'no-new-attempt');
    assert.equal(decision.remoteTruthUnresolved, true);
    assert.ok(
      decision.reasons.some((r) => r.includes('query/watch/reconcile/policy/human')),
      'the denial routes to observation/reconciliation before another effect attempt',
    );
  }
});

test('v3-003 §11 row 5: later failure + earlier unresolved requires reconciliation', () => {
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logicalOperation(),
    priorAttempts: [
      attempt({ evidenceClass: 'dispatch-outcome-ambiguous', attemptIdentity: 'attempt-early' }),
      attempt({ evidenceClass: 'definitively-rejected-known-pre-commit-failed', attemptIdentity: 'attempt-late' }),
    ],
    intendedCommandSemanticIdentity: SEMANTIC,
  });
  assert.equal(decision.decision, 'RECONCILIATION_REQUIRED');
  assert.equal(decision.justification, 'later-attempt-failed-earlier-unresolved');
  assert.equal(decision.identityDirective, 'no-new-attempt');
  assert.equal(decision.remoteTruthUnresolved, true);
});

test('v3-003 §11 row 3: intentional duplicate is a NEW logical operation', () => {
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logicalOperation(),
    priorAttempts: [attempt({ evidenceClass: 'dispatch-outcome-ambiguous' })],
    intendedCommandSemanticIdentity: SEMANTIC,
    explicitIntentionalDuplicate: true,
  });
  assert.equal(decision.decision, 'PERMITTED_NEW_INDEPENDENT_OPERATION');
  assert.equal(decision.identityDirective, 'new-logical-operation');
  assert.ok(
    decision.reasons.some((r) => r.includes('NEW LogicalOperationRef')),
    'each operation carries its own external truth',
  );
});

test('v3-003 §11 row 6: local abandonment never becomes non-commit proof and never authorizes', () => {
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logicalOperation(),
    priorAttempts: [attempt({ evidenceClass: 'dispatch-outcome-ambiguous' })],
    intendedCommandSemanticIdentity: SEMANTIC,
    priorLocalAbandonmentOnly: true,
  });
  assert.equal(decision.decision, 'NOT_AUTHORIZED_AMBIGUITY_PRESERVED');
  assert.equal(decision.remoteTruthUnresolved, true);
  assert.ok(
    decision.reasons.some((r) => r.includes('never proof of remote non-commit')),
    'the abandonment note stays a note',
  );
});

test('v3-003 C66: idempotency reuse for a semantically different effect fails closed', () => {
  const logical = logicalOperation();
  const idem = provenIdempotency();
  assertDacV003IdempotencyReuseForLogicalEffect(idem, logical, SEMANTIC);
  assertErrorCode(
    () => assertDacV003IdempotencyReuseForLogicalEffect(idem, logical, 'refund-order'),
    'IDEMPOTENCY_REUSE_FORBIDDEN',
    'the same key cannot be replayed for a changed command semantics',
  );
  // One logical operation bound to one idempotency identity: a different key
  // or issuer for the same operation is a contract violation.
  const bound = logicalOperation({
    idempotencyIdentity: provenIdempotency({ idempotencyKey: 'idem-key-A' }),
  });
  assertErrorCode(
    () =>
      assertDacV003IdempotencyReuseForLogicalEffect(
        provenIdempotency({ idempotencyKey: 'idem-key-B' }),
        bound,
        SEMANTIC,
      ),
    'IDEMPOTENCY_REUSE_FORBIDDEN',
    'a different key cannot serve the bound logical operation',
  );
  assertErrorCode(
    () =>
      assertDacV003IdempotencyReuseForLogicalEffect(
        provenIdempotency({ issuer: 'other-issuer' }),
        bound,
        SEMANTIC,
      ),
    'IDEMPOTENCY_REUSE_FORBIDDEN',
    'an issuer divergence is a contract violation',
  );
  // Same key + same issuer but a divergent promised deduplication scope is
  // equally a contract violation (review P2-2): the scope is part of the
  // replay-safety identity.
  assertErrorCode(
    () =>
      assertDacV003IdempotencyReuseForLogicalEffect(
        provenIdempotency({ promisedDeduplicationScope: 'payments/truth:other-scope' }),
        bound,
        SEMANTIC,
      ),
    'IDEMPOTENCY_REUSE_FORBIDDEN',
    'a promised deduplication scope divergence is a contract violation',
  );
});

test('v3-003 §4 rule 2 (evaluator side): changed intent requires a new logical operation', () => {
  const logical = logicalOperation();
  assertErrorCode(
    () =>
      evaluateDacV003SafeRetry({
        logicalOperation: logical,
        priorAttempts: [attempt({ evidenceClass: 'definitively-rejected-known-pre-commit-failed' })],
        intendedCommandSemanticIdentity: 'refund-order',
      }),
    'IDENTITY_MISMATCH',
    'retrying a changed command semantics under the old logical operation fails closed',
  );
  assertErrorCode(
    () =>
      evaluateDacV003SafeRetry({
        logicalOperation: logical,
        priorAttempts: [attempt({ evidenceClass: 'not-dispatched' })],
        intendedCommandSemanticIdentity: SEMANTIC,
        intendedSemanticTargetIdentities: ['order-999'],
      }),
    'IDENTITY_MISMATCH',
    'a changed semantic target creates a new logical operation',
  );
  // Prior attempts of a DIFFERENT logical operation fail closed.
  assertErrorCode(
    () =>
      evaluateDacV003SafeRetry({
        logicalOperation: logical,
        priorAttempts: [
          attempt({
            logicalOperation: logicalOperation({ logicalOperationIdentity: 'logical-op-other' }),
          }),
        ],
        intendedCommandSemanticIdentity: SEMANTIC,
      }),
    'CORRELATION_CONFLICT',
    'safe-retry evaluation requires attempts of the same logical operation',
  );
  // Duplicate attempt identities in the evidence fail closed (C67).
  const a = attempt({ evidenceClass: 'not-dispatched' });
  assertErrorCode(
    () =>
      evaluateDacV003SafeRetry({
        logicalOperation: logical,
        priorAttempts: [a, a],
        intendedCommandSemanticIdentity: SEMANTIC,
      }),
    'IDENTITY_MISMATCH',
    'duplicate attempt identities are non-conforming replay evidence',
  );
});

test('v3-003 capability declarations are not safe-retry evidence (§10)', () => {
  // The request type has no capability field; a declaration smuggled into the
  // idempotency slot fails closed before any decision is minted.
  const declaration = { capabilityFamily: 'safe-same-operation-retry', issuer: 'adapter' };
  assert.throws(
    () =>
      evaluateDacV003SafeRetry({
        logicalOperation: logicalOperation(),
        priorAttempts: [attempt({ evidenceClass: 'dispatch-outcome-ambiguous' })],
        idempotencyIdentity: declaration as never,
        intendedCommandSemanticIdentity: SEMANTIC,
      }),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'ROLE_MISMATCH',
    'a forged idempotency object never reaches the decision',
  );
  assert.equal(isDacV003IdempotencyGuaranteeProven(declaration as never), false);
});

test('v3-003 effect-record linking evidence participates only through reconciliation', () => {
  // Sanity: effect records adopt cleanly with linking evidence envelopes and
  // are not consumed by the safe-retry matrix at all (truth derivation is
  // reconciliation-owned).
  const link = adoptDacV003RegistryReference('evidence', {
    baseline: BASELINE,
    authorityScope: 'payment-sor/link-evidence',
    primaryIdentity: 'link-0001',
    logicalOperationIdentity: 'logical-op-0001',
  });
  const record = effectRecord({ linkingEvidence: [link] });
  assert.equal(record.linkingEvidence.length, 1);
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logicalOperation(),
    priorAttempts: [attempt({ evidenceClass: 'dispatch-outcome-ambiguous' })],
    intendedCommandSemanticIdentity: SEMANTIC,
  });
  assert.equal(decision.decision, 'NOT_AUTHORIZED_AMBIGUITY_PRESERVED');
});
