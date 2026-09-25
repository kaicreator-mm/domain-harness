// Issue #327 / DAC v0.0.3 V3-003 — the External Operation Outcome /
// Observation namespace (§11/§12): namespace separation from the
// Reference/Compatibility disposition namespace (UNKNOWN_AMBIGUOUS !=
// INCOMPATIBLE), the §5 attempt evidence-class meaning ceilings, and the
// total ceiling-preserving #309 (v0.0.2) classification map plus genuine
// upstream-evidence anchoring (C62/C63/C64 negatives included).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_ATTEMPT_EVIDENCE_CLASSES,
  DAC_V003_EXTERNAL_OUTCOME_CLASSES,
  DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION,
  DacV003ExternalError,
  adoptDacV003ObservationFromV002Evidence,
  dacV003ExternalOutcome,
  isDacV003ExternalOutcome,
  maxJustifiedMeaningForAttemptEvidence,
  refuteDacV003LocalCauseAsRemoteTruth,
} from '../../src/dac-v003-external/index.js';
import { EXTERNAL_OBSERVATION_CLASSIFICATIONS } from '../../src/external-authority/index.js';
import { dacV003ReferenceDisposition } from '../../src/dac-v003/index.js';
import {
  assertErrorCode,
  externalAuthority,
  logicalOperation,
  v002ObservationEvidence,
  BASELINE,
} from './external-fixture.js';

test('v3-003 outcome namespace: construction and closed vocabulary', () => {
  const outcome = dacV003ExternalOutcome('UNKNOWN_AMBIGUOUS');
  assert.equal(outcome.namespace, 'dac-v003/external-operation-outcome');
  assert.ok(isDacV003ExternalOutcome(outcome));
  assert.ok(Object.isFrozen(outcome));
  assert.equal(DAC_V003_EXTERNAL_OUTCOME_CLASSES.length, 13);
  assertErrorCode(
    () => dacV003ExternalOutcome('INCOMPATIBLE' as never),
    'INVALID_EXTERNAL_BINDING',
    'a compatibility disposition token is not an external-operation outcome',
  );
});

test('v3-003 §11 anti-conflation: ExternalOperation.UNKNOWN_AMBIGUOUS != Compatibility.INCOMPATIBLE (both directions)', () => {
  const unknown = dacV003ExternalOutcome('UNKNOWN_AMBIGUOUS');
  const incompatible = dacV003ReferenceDisposition('INCOMPATIBLE');
  // A compatibility disposition value is not an external-operation outcome.
  assert.equal(isDacV003ExternalOutcome(incompatible), false);
  assert.equal(isDacV003ExternalOutcome({ namespace: incompatible.namespace, value: 'INCOMPATIBLE' }), false);
  // An external-operation outcome is not a reference disposition: the V3-001
  // namespace guard rejects it by namespace tag.
  const namespaceGuard = (v: unknown): boolean => {
    const candidate = v as { namespace?: unknown; value?: unknown };
    return (
      candidate.namespace === 'dac-v003/reference-compatibility-disposition' &&
      typeof candidate.value === 'string'
    );
  };
  assert.equal(namespaceGuard(unknown), false);
  assert.equal(
    (unknown as unknown as { value: string }).value,
    'UNKNOWN_AMBIGUOUS',
    'UNKNOWN/AMBIGUOUS stays an external-operation outcome class, never a compatibility disposition',
  );
});

test('v3-003 §5 attempt evidence ceilings: dispatch/ambiguous never carry remote truth', () => {
  assert.deepEqual([...DAC_V003_ATTEMPT_EVIDENCE_CLASSES], [
    'not-dispatched',
    'dispatch-attempted',
    'definitively-rejected-known-pre-commit-failed',
    'dispatch-outcome-ambiguous',
  ]);
  assert.equal(
    maxJustifiedMeaningForAttemptEvidence('dispatch-attempted'),
    'dispatch-occurred-only',
    'request dispatched proves neither provider receipt nor acceptance nor commit (C62)',
  );
  assert.equal(
    maxJustifiedMeaningForAttemptEvidence('dispatch-outcome-ambiguous'),
    'ambiguous-preserve-unresolved',
    'timeout/unknown stays ambiguous, never known non-commit (C64)',
  );
  assert.equal(
    maxJustifiedMeaningForAttemptEvidence('definitively-rejected-known-pre-commit-failed'),
    'known-pre-commit-failure-for-this-attempt-only',
    'a known pre-commit failure covers THIS attempt only, never other attempts',
  );
  assert.equal(
    maxJustifiedMeaningForAttemptEvidence('not-dispatched'),
    'no-remote-truth-for-any-attempt',
  );
});

test('v3-003 local causes can never become remote truth (C64 + §10 cancel/rollback)', () => {
  for (const cause of ['local-timeout', 'local-cancel', 'local-interrupt', 'local-abandonment'] as const) {
    for (const claimed of ['non-commit', 'rollback', 'RECONCILED_NOT_COMMITTED'] as const) {
      assert.throws(
        () => refuteDacV003LocalCauseAsRemoteTruth({ cause, claimedRemoteTruth: claimed }),
        (error: unknown) =>
          error instanceof DacV003ExternalError && error.code === 'LOCAL_CAUSE_FORBIDDEN',
        `${cause} -> ${claimed} is never derivable`,
      );
    }
  }
  assertErrorCode(
    () => refuteDacV003LocalCauseAsRemoteTruth({ cause: 'remote-said-so', claimedRemoteTruth: 'not-committed' } as never),
    'INVALID_EXTERNAL_BINDING',
    'unknown local cause kind fails closed',
  );
});

test('v3-003 #309 map: total and ceiling-preserving (C62/C63/C75)', () => {
  assert.deepEqual(
    [...EXTERNAL_OBSERVATION_CLASSIFICATIONS].sort(),
    Object.keys(DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION).sort(),
    'the v0.0.2 classification vocabulary maps totally onto v0.0.3',
  );
  // Provider effect success is NOT business commit — the strongest negative.
  assert.equal(
    DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION['effect-succeeded-provider-scope'],
    'EFFECT_SUCCEEDED',
  );
  assert.notEqual(
    DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION['effect-succeeded-provider-scope'],
    'AUTHORITATIVE_COMMITTED',
  );
  assert.equal(
    DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION['commit-observed'],
    'AUTHORITATIVE_COMMITTED',
  );
  assert.equal(
    DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION['unknown-ambiguous'],
    'UNKNOWN_AMBIGUOUS',
  );
  assert.equal(
    DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION['accepted-pending'],
    'ACCEPTED_FOR_PROCESSING',
    'provider acceptance stays provider acceptance (C63)',
  );
});

test('v3-003 #309 anchoring: genuine v0.0.2 evidence adopts without strengthening', () => {
  const logical = logicalOperation();
  const authority = externalAuthority();
  const evidence = v002ObservationEvidence('effect-succeeded-provider-scope');
  const adopted = adoptDacV003ObservationFromV002Evidence(evidence, {
    baseline: BASELINE,
    observationIdentity: 'obs-from-309',
    externalAuthority: authority,
    logicalOperation: logical,
    producer: 'payment-adapter/callback',
  });
  assert.equal(adopted.observedClass, 'EFFECT_SUCCEEDED');
  assert.equal(adopted.producer, 'payment-adapter/callback');
  assert.equal(adopted.rawStatement, 'provider statement (effect-succeeded-provider-scope)');
  assert.equal(
    (adopted.reference.opaque as { upstreamV002EvidenceClaim: string })
      .upstreamV002EvidenceClaim,
    'provider-effect-success-observed',
    'the v0.0.2 derived claim is preserved verbatim',
  );
  // Commit-observed maps to the v0.0.3 authoritative commit class.
  const committed = adoptDacV003ObservationFromV002Evidence(
    v002ObservationEvidence('commit-observed'),
    {
      baseline: BASELINE,
      observationIdentity: 'obs-from-309-commit',
      externalAuthority: authority,
      logicalOperation: logical,
      producer: 'payment-adapter/callback',
    },
  );
  assert.equal(committed.observedClass, 'AUTHORITATIVE_COMMITTED');
});

test('v3-003 #309 anchoring: forged evidence and correlation drift fail closed', () => {
  const logical = logicalOperation();
  const authority = externalAuthority();
  assertErrorCode(
    () =>
      adoptDacV003ObservationFromV002Evidence(
        { evidenceClass: 'external-observation', classification: 'commit-observed' },
        {
          baseline: BASELINE,
          observationIdentity: 'obs-forged',
          externalAuthority: authority,
          logicalOperation: logical,
          producer: 'attacker',
        },
      ),
    'INVALID_UPSTREAM_EVIDENCE',
    'a forged #309-shaped object is rejected',
  );
  assertErrorCode(
    () =>
      adoptDacV003ObservationFromV002Evidence(
        v002ObservationEvidence('commit-observed', { effectId: 'other-effect' }),
        {
          baseline: BASELINE,
          observationIdentity: 'obs-drift',
          externalAuthority: authority,
          logicalOperation: logical,
          producer: 'payment-adapter',
        },
      ),
    'CORRELATION_CONFLICT',
    'evidence correlated to a different runtime effect is rejected',
  );
  assertErrorCode(
    () =>
      adoptDacV003ObservationFromV002Evidence(
        v002ObservationEvidence('commit-observed', { authorityId: 'other-sor' }),
        {
          baseline: BASELINE,
          observationIdentity: 'obs-drift',
          externalAuthority: authority,
          logicalOperation: logical,
          producer: 'payment-adapter',
        },
      ),
    'CORRELATION_CONFLICT',
    'evidence correlated to a different authority is rejected',
  );
});
