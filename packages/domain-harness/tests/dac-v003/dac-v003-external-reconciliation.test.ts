// Issue #327 / DAC v0.0.3 V3-003 — §9 reconciliation episodes: commit and
// non-commit conclusions require an authoritative basis of matching
// strength (a provider-scope success or bare rejection is NOT enough), a
// provider job never substitutes an authoritative effect record as commit
// proof (C68), conflicting inputs keep truth unresolved, TERMINAL_ABANDONMENT
// is a local stop only, historical observations are never rewritten,
// query/watch/reconcile episodes never mint a new effect attempt, and an
// effectful resume must be explicitly modeled instead of hiding inside the
// episode.
import assert from 'node:assert/strict';
import test from 'node:test';
import { adoptDacV003RegistryReference } from '../../src/dac-v003/index.js';
import {
  reconcileDacV003ExternalOperation,
} from '../../src/dac-v003-external/index.js';
import {
  assertErrorCode,
  attempt,
  effectRecord,
  externalAuthority,
  logicalOperation,
  observation,
  providerOperation,
  v002ObservationEvidence,
  BASELINE,
} from './external-fixture.js';

function request(overrides: Record<string, unknown> = {}): ReturnType<
  typeof reconcileDacV003ExternalOperation
> {
  const logical = logicalOperation();
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    reconciliationIdentity: 'recon-0001',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority: logical.externalAuthority,
    logicalOperation: logical,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputObservations: [],
  };
  return reconcileDacV003ExternalOperation({
    ...defaults,
    ...overrides,
  } as never);
}

test('v3-003 §9/§12: commit conclusion requires an AUTHORITATIVE_COMMITTED basis', () => {
  const logical = logicalOperation();
  const committed = observation({
    observationIdentity: 'obs-commit',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
    providerCurrentness: { sequence: '2' },
  });
  const older = observation({
    observationIdentity: 'obs-older',
    logicalOperation: logical,
    observedClass: 'REJECTED',
    providerCurrentness: { sequence: '1' },
  });
  const episode = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputObservations: [older, committed],
  });
  assert.equal(episode.conclusion.outcomeClass, 'RECONCILED_COMMITTED');
  assert.equal(episode.conclusion.remoteTruth, 'committed');
  assert.ok(episode.conclusion.basis.some((b) => b.primaryIdentity === 'obs-commit'));
  assert.equal(episode.runtimeExecutionAuthority, 'none');
});

test('v3-003 §12: provider-scope success and bare rejection never conclude business commit/non-commit', () => {
  const logical = logicalOperation();
  const providerSuccess = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputObservations: [
      observation({
        observationIdentity: 'obs-succ',
        logicalOperation: logical,
        observedClass: 'EFFECT_SUCCEEDED',
      }),
    ],
  });
  assert.equal(providerSuccess.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(providerSuccess.conclusion.remoteTruth, 'unresolved');

  const rejectedOnly = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputObservations: [
      observation({
        observationIdentity: 'obs-rej',
        logicalOperation: logical,
        observedClass: 'REJECTED',
      }),
    ],
  });
  assert.equal(rejectedOnly.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(rejectedOnly.conclusion.remoteTruth, 'unresolved');
});

test('v3-003 §12: non-commit conclusion requires KNOWN_FAILED_BEFORE_COMMIT evidence', () => {
  const logical = logicalOperation();
  const episode = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputObservations: [
      observation({
        observationIdentity: 'obs-failed',
        logicalOperation: logical,
        observedClass: 'KNOWN_FAILED_BEFORE_COMMIT',
      }),
    ],
  });
  assert.equal(episode.conclusion.outcomeClass, 'RECONCILED_NOT_COMMITTED');
  assert.equal(episode.conclusion.remoteTruth, 'not-committed');
  assert.ok(
    episode.conclusion.notes.some((n) => n.includes('cannot later commit')),
    'the conclusion carries the retry-safety caveat',
  );
});

test('v3-003 §8/§9/C68: a provider job never substitutes the authoritative effect record', () => {
  const logical = logicalOperation();
  const link = adoptDacV003RegistryReference('evidence', {
    baseline: BASELINE,
    authorityScope: 'payment-sor/link-evidence',
    primaryIdentity: 'link-0001',
    logicalOperationIdentity: 'logical-op-0001',
  });
  // An effect record WITH linking evidence to this logical operation is a
  // valid commit basis.
  const withLink = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputEffectRecords: [effectRecord({ effectRecordIdentity: 'rec-1', linkingEvidence: [link] })],
  });
  assert.equal(withLink.conclusion.outcomeClass, 'RECONCILED_COMMITTED');
  // An effect record WITHOUT linking evidence cannot prove anything here…
  const withoutLink = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputEffectRecords: [effectRecord({ effectRecordIdentity: 'rec-2' })],
  });
  assert.equal(withoutLink.conclusion.outcomeClass, 'STILL_UNKNOWN');
  // …and a provider operation is not even an acceptable record substitute.
  const job = providerOperation({ providerOperationId: 'job-9' });
  assertErrorCode(
    () =>
      request({
        logicalOperation: logical,
        externalAuthority: logical.externalAuthority,
        inputEffectRecords: [job as never],
      }),
    'ROLE_MISMATCH',
    'a provider job can never be presented as an authoritative effect record (C68)',
  );
});

test('v3-003 §9/C69: conflicting current observations keep truth unresolved', () => {
  const logical = logicalOperation();
  const episode = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputObservations: [
      observation({
        observationIdentity: 'obs-c1',
        logicalOperation: logical,
        observedClass: 'AUTHORITATIVE_COMMITTED',
      }),
      observation({
        observationIdentity: 'obs-c2',
        logicalOperation: logical,
        observedClass: 'RECONCILED_NOT_COMMITTED',
      }),
    ],
  });
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(episode.conclusion.remoteTruth, 'unresolved');
  assert.equal(episode.conclusion.unresolvedConflictPresent, true);
  assert.ok(
    episode.conclusion.notes.some((n) => n.includes('CONFLICTING')),
    'the unresolved conflict is recorded, not resolved by a winner',
  );
});

test('v3-003 §12: TERMINAL_ABANDONMENT is a local stop only — never remote non-commit', () => {
  const episode = request({ explicitLocalAbandonment: true });
  assert.equal(episode.conclusion.outcomeClass, 'TERMINAL_ABANDONMENT');
  assert.equal(episode.conclusion.remoteTruth, 'unresolved');
  assert.ok(
    episode.conclusion.notes.some((n) => n.includes('LOCAL STOP ONLY')),
    'terminal abandonment is never a non-commit proof',
  );
});

test('v3-003 §9: historical observations are immutable inputs — reconciliation never rewrites them', () => {
  const logical = logicalOperation();
  const original = observation({
    observationIdentity: 'obs-hist',
    logicalOperation: logical,
    observedClass: 'UNKNOWN_AMBIGUOUS',
  });
  const snapshot = JSON.stringify({
    id: original.reference.primaryIdentity,
    class: original.observedClass,
    frozen: Object.isFrozen(original),
  });
  request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    inputObservations: [original],
    inputAttempts: [attempt({ logicalOperation: logical, evidenceClass: 'dispatch-attempted' })],
  });
  assert.equal(
    JSON.stringify({
      id: original.reference.primaryIdentity,
      class: original.observedClass,
      frozen: Object.isFrozen(original),
    }),
    snapshot,
    'the observation record is untouched by the reconciliation episode',
  );
  assert.ok(Object.isFrozen(original));
});

test('v3-003 §9: query/watch/reconcile episodes never create a new effect attempt', () => {
  for (const actionSemantics of [
    'query-status-observation',
    'watch-continuation-observation',
    'reconcile-local-vs-external-truth',
    'local-abandon',
  ] as const) {
    const episode = request({ actionSemantics });
    assert.equal(episode.actionSemantics, actionSemantics);
    assert.deepEqual(episode.inputAttempts, []);
    // There is no attempt-minting channel on the episode at all.
    assert.equal((episode as unknown as Record<string, unknown>).newAttempt, undefined);
    assert.equal((episode as unknown as Record<string, unknown>).mintAttempt, undefined);
  }
  // The effectful action semantics are not reconciliation actions at all.
  assertErrorCode(
    () => request({ actionSemantics: 'retry-same-logical-effect' }),
    'INVALID_ACTION_SEMANTICS',
    'a retry cannot hide inside a reconciliation episode',
  );
  assertErrorCode(
    () => request({ actionSemantics: 'new-independent-operation' }),
    'INVALID_ACTION_SEMANTICS',
    'a new operation cannot hide inside a reconciliation episode',
  );
});

test('v3-003 §9: an effectful resume must be explicitly modeled', () => {
  const logical = logicalOperation();
  assertErrorCode(
    () =>
      request({
        logicalOperation: logical,
        externalAuthority: logical.externalAuthority,
        actionSemantics: 'resume-existing-provider-operation',
        effectfulResume: true,
      }),
    'EFFECTFUL_ACTION_REQUIRES_EXPLICIT_MODELING',
    'an effectful resume without an explicitly modeled new attempt fails closed',
  );
  const modeledAttempt = attempt({
    logicalOperation: logical,
    attemptIdentity: 'attempt-modeled',
    evidenceClass: 'dispatch-attempted',
  });
  const episode = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    actionSemantics: 'resume-existing-provider-operation',
    effectfulResume: true,
    effectfulModeling: { attempt: modeledAttempt },
  });
  assert.equal(episode.actionSemantics, 'resume-existing-provider-operation');
  // The modeling is recorded as evidence, not hidden.
  assert.equal(episode.runtimeExecutionAuthority, 'none');
});

test('v3-003 §9: exact-operation/exact-authority binding fails closed on drift', () => {
  const otherAuthority = externalAuthority({
    authorityId: 'ledger-sor',
    authorityScope: 'ledger/truth',
  });
  assertErrorCode(
    () =>
      request({
        externalAuthority: otherAuthority,
      }),
    'CORRELATION_CONFLICT',
    'a reconciliation episode cannot bind a logical operation of another authority',
  );
  assertErrorCode(
    () =>
      request({
        inputObservations: [
          observation({
            observationIdentity: 'obs-other',
            logicalOperation: logicalOperation({ logicalOperationIdentity: 'logical-op-0002' }),
          }),
        ],
      }),
    'CORRELATION_CONFLICT',
    'observations of another logical operation are rejected',
  );
  assertErrorCode(
    () =>
      request({
        inputAttempts: [
          attempt({
            attemptIdentity: 'attempt-other-op',
            logicalOperation: logicalOperation({ logicalOperationIdentity: 'logical-op-0002' }),
          }),
        ],
      }),
    'CORRELATION_CONFLICT',
    'attempts of another logical operation are rejected',
  );
});

test('v3-003 #309 consumption: genuine upstream evidence drives the conclusion', () => {
  const logical = logicalOperation();
  // A genuine #309 reconciliation-outcome-style basis is not directly usable
  // as an observation; the observation evidence is:
  const upstream = v002ObservationEvidence('commit-observed');
  const episode = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    upstreamV002Evidence: [upstream],
  });
  assert.equal(episode.conclusion.outcomeClass, 'RECONCILED_COMMITTED');
  assert.ok(
    episode.conclusion.notes.some((n) => n.includes('#309 upstream evidence basis')),
  );
  assertErrorCode(
    () =>
      request({
        upstreamV002Evidence: [{ evidenceClass: 'external-observation' }],
      }),
    'INVALID_UPSTREAM_EVIDENCE',
    'a forged #309 record is rejected as upstream evidence',
  );
  // Provider-scope success from #309 does NOT conclude business commit.
  const providerScope = request({
    logicalOperation: logical,
    externalAuthority: logical.externalAuthority,
    upstreamV002Evidence: [v002ObservationEvidence('effect-succeeded-provider-scope')],
  });
  assert.equal(providerScope.conclusion.outcomeClass, 'STILL_UNKNOWN');
});
