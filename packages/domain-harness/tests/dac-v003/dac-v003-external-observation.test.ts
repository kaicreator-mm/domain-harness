// Issue #327 / DAC v0.0.3 V3-003 — §8 observation currentness adjudication
// (conformance C69/C70): provider ordering decides stale vs current,
// materially contradictory unorderable observations are CONFLICTING and
// require reconciliation (never last-write-wins, never adapter-receipt
// order), superseded provider-operation channels are STALE for current
// truth while remaining valid historical evidence, duplicates never
// strengthen, and cross-operation/authority inputs fail closed.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjudicateDacV003ObservationCurrentness,
} from '../../src/dac-v003-external/index.js';
import {
  assertErrorCode,
  externalAuthority,
  logicalOperation,
  observation,
  providerOperation,
} from './external-fixture.js';

function currentnessOf(
  result: ReturnType<typeof adjudicateDacV003ObservationCurrentness>,
  identity: string,
): string {
  const entry = result.adjudications.find((a) => a.observation.reference.primaryIdentity === identity);
  if (entry === undefined) throw new Error(`no adjudication for ${identity}`);
  return entry.currentness;
}

test('v3-003 §8: provider sequence orders evidence — older observations are STALE', () => {
  const logical = logicalOperation();
  const older = observation({
    observationIdentity: 'obs-1',
    logicalOperation: logical,
    observedClass: 'PENDING_IN_PROGRESS',
    providerCurrentness: { sequence: '1' },
  });
  const newer = observation({
    observationIdentity: 'obs-2',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
    providerCurrentness: { sequence: '2' },
  });
  const result = adjudicateDacV003ObservationCurrentness({ observations: [older, newer] });
  assert.equal(currentnessOf(result, 'obs-1'), 'STALE');
  assert.equal(currentnessOf(result, 'obs-2'), 'CURRENT');
  assert.equal(result.requiresReconciliation, false);
});

test('v3-003 §8/C69: unresolvable contradictions are CONFLICTING — never last-write-wins', () => {
  const logical = logicalOperation();
  const committed = observation({
    observationIdentity: 'obs-c',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
  });
  const rejected = observation({
    observationIdentity: 'obs-r',
    logicalOperation: logical,
    observedClass: 'KNOWN_FAILED_BEFORE_COMMIT',
  });
  // Arrival order must not matter: both permutations conflict identically.
  for (const permutations of [[committed, rejected], [rejected, committed]]) {
    const result = adjudicateDacV003ObservationCurrentness({ observations: permutations });
    assert.equal(currentnessOf(result, 'obs-c'), 'CONFLICTING');
    assert.equal(currentnessOf(result, 'obs-r'), 'CONFLICTING');
    assert.equal(result.requiresReconciliation, true);
  }
  // Adapter receipt time NEVER orders provider truth: swapping only the
  // adapterReceivedAt fields cannot change the outcome.
  const withAdapterTimes = [
    observation({
      observationIdentity: 'obs-c',
      logicalOperation: logical,
      observedClass: 'AUTHORITATIVE_COMMITTED',
      providerCurrentness: { adapterReceivedAt: '2099-01-01T00:00:00Z' },
    }),
    observation({
      observationIdentity: 'obs-r',
      logicalOperation: logical,
      observedClass: 'KNOWN_FAILED_BEFORE_COMMIT',
      providerCurrentness: { adapterReceivedAt: '2000-01-01T00:00:00Z' },
    }),
  ];
  const result = adjudicateDacV003ObservationCurrentness({ observations: withAdapterTimes });
  assert.equal(currentnessOf(result, 'obs-c'), 'CONFLICTING');
  assert.equal(currentnessOf(result, 'obs-r'), 'CONFLICTING');
});

test('v3-003 §8: provider-scope success materially contradicts rejection, UNKNOWN contradicts nothing', () => {
  const logical = logicalOperation();
  const conflict = adjudicateDacV003ObservationCurrentness({
    observations: [
      observation({ observationIdentity: 'obs-s', logicalOperation: logical, observedClass: 'EFFECT_SUCCEEDED' }),
      observation({ observationIdentity: 'obs-r', logicalOperation: logical, observedClass: 'REJECTED' }),
    ],
  });
  assert.equal(currentnessOf(conflict, 'obs-s'), 'CONFLICTING');
  assert.equal(currentnessOf(conflict, 'obs-r'), 'CONFLICTING');
  const neutral = adjudicateDacV003ObservationCurrentness({
    observations: [
      observation({ observationIdentity: 'obs-u', logicalOperation: logical, observedClass: 'UNKNOWN_AMBIGUOUS' }),
      observation({ observationIdentity: 'obs-k', logicalOperation: logical, observedClass: 'AUTHORITATIVE_COMMITTED' }),
    ],
  });
  assert.equal(currentnessOf(neutral, 'obs-u'), 'CURRENT');
  assert.equal(currentnessOf(neutral, 'obs-k'), 'CURRENT');
  assert.equal(neutral.requiresReconciliation, false);
});

test('v3-003 §8: superseded provider-operation channels are STALE for current truth', () => {
  const logical = logicalOperation();
  const oldChannel = providerOperation({ providerOperationId: 'job-1' });
  const staleObs = observation({
    observationIdentity: 'obs-old',
    logicalOperation: logical,
    observedClass: 'PENDING_IN_PROGRESS',
    providerOperations: [oldChannel],
  });
  const currentObs = observation({
    observationIdentity: 'obs-new',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
  });
  const result = adjudicateDacV003ObservationCurrentness({
    observations: [staleObs, currentObs],
    supersededProviderOperationIds: ['job-1'],
  });
  assert.equal(currentnessOf(result, 'obs-old'), 'STALE');
  assert.equal(currentnessOf(result, 'obs-new'), 'CURRENT');
  // A stale observation stays valid historical evidence: it is adjudicated,
  // never discarded.
  assert.equal(result.adjudications.length, 2);
});

test('v3-003 §8: duplicate delivery does not create stronger truth', () => {
  const logical = logicalOperation();
  const result = adjudicateDacV003ObservationCurrentness({
    observations: [
      observation({ observationIdentity: 'obs-d1', logicalOperation: logical, observedClass: 'PENDING_IN_PROGRESS' }),
      observation({ observationIdentity: 'obs-d2', logicalOperation: logical, observedClass: 'PENDING_IN_PROGRESS' }),
      observation({ observationIdentity: 'obs-d3', logicalOperation: logical, observedClass: 'PENDING_IN_PROGRESS' }),
    ],
  });
  for (const identity of ['obs-d1', 'obs-d2', 'obs-d3']) {
    assert.equal(currentnessOf(result, identity), 'CURRENT');
  }
  assert.equal(result.requiresReconciliation, false);
});

test('v3-003 §8: cross-logical-operation / cross-authority inputs fail closed', () => {
  assertErrorCode(
    () =>
      adjudicateDacV003ObservationCurrentness({
        observations: [
          observation({ observationIdentity: 'obs-a' }),
          observation({
            observationIdentity: 'obs-b',
            logicalOperation: logicalOperation({ logicalOperationIdentity: 'logical-op-0002' }),
          }),
        ],
      }),
    'CORRELATION_CONFLICT',
    'observations of two logical operations cannot be adjudicated together',
  );
  assertErrorCode(
    () =>
      adjudicateDacV003ObservationCurrentness({
        observations: [
          observation({ observationIdentity: 'obs-a' }),
          observation({
            observationIdentity: 'obs-b',
            externalAuthority: externalAuthority({
              authorityId: 'ledger-sor',
              authorityScope: 'ledger/truth',
            }),
          }),
        ],
      }),
    'CORRELATION_CONFLICT',
    'observations of two authorities cannot be adjudicated together',
  );
});

test('v3-003 §8 (review P1-1): opaque provider tokens never order truth — v9 vs v10 conflicts', () => {
  const logical = logicalOperation();
  const result = adjudicateDacV003ObservationCurrentness({
    observations: [
      observation({
        observationIdentity: 'obs-v9',
        logicalOperation: logical,
        observedClass: 'KNOWN_FAILED_BEFORE_COMMIT',
        providerCurrentness: { version: 'v9' },
      }),
      observation({
        observationIdentity: 'obs-v10',
        logicalOperation: logical,
        observedClass: 'AUTHORITATIVE_COMMITTED',
        providerCurrentness: { version: 'v10' },
      }),
    ],
  });
  // Lexicographic intuition would call v10 the winner: the surface MUST NOT
  // invent that ordering — opaque tokens are unorderable, so the materially
  // contradictory pair is CONFLICTING (§8, conformance C69).
  assert.equal(currentnessOf(result, 'obs-v9'), 'CONFLICTING');
  assert.equal(currentnessOf(result, 'obs-v10'), 'CONFLICTING');
  assert.equal(result.requiresReconciliation, true);
});

test('v3-003 §8 (review P1-1): sequence and version metadata never order against each other', () => {
  const logical = logicalOperation();
  const result = adjudicateDacV003ObservationCurrentness({
    observations: [
      observation({
        observationIdentity: 'obs-seq2',
        logicalOperation: logical,
        observedClass: 'AUTHORITATIVE_COMMITTED',
        providerCurrentness: { sequence: '2' },
      }),
      observation({
        observationIdentity: 'obs-ver3',
        logicalOperation: logical,
        observedClass: 'KNOWN_FAILED_BEFORE_COMMIT',
        providerCurrentness: { version: '3' },
      }),
    ],
  });
  // No evidenced relation exists between a sequence and a version: the
  // contradictory pair stays CONFLICTING instead of a cross-kind winner.
  assert.equal(currentnessOf(result, 'obs-seq2'), 'CONFLICTING');
  assert.equal(currentnessOf(result, 'obs-ver3'), 'CONFLICTING');
  assert.equal(result.requiresReconciliation, true);
});

test('v3-003 §8 (review P1-1): same-kind integer ordering still applies within one kind', () => {
  const logical = logicalOperation();
  const result = adjudicateDacV003ObservationCurrentness({
    observations: [
      observation({
        observationIdentity: 'obs-seq1',
        logicalOperation: logical,
        observedClass: 'REJECTED',
        providerCurrentness: { sequence: '1' },
      }),
      observation({
        observationIdentity: 'obs-seq2',
        logicalOperation: logical,
        observedClass: 'AUTHORITATIVE_COMMITTED',
        providerCurrentness: { sequence: '2' },
      }),
      observation({
        observationIdentity: 'obs-ver1',
        logicalOperation: logical,
        observedClass: 'PENDING_IN_PROGRESS',
        providerCurrentness: { version: '1' },
      }),
    ],
  });
  // The sequence-1 observation is stale against sequence-2 (same kind,
  // evidenced integer ordering); the version-1 observation is the newest of
  // its own kind and stays a current candidate.
  assert.equal(currentnessOf(result, 'obs-seq1'), 'STALE');
  assert.equal(currentnessOf(result, 'obs-seq2'), 'CURRENT');
  assert.equal(currentnessOf(result, 'obs-ver1'), 'CURRENT');
  assert.equal(result.requiresReconciliation, false);
});

test('v3-003 §8: equal provider sequence with contradictory classes conflicts', () => {
  const logical = logicalOperation();
  const result = adjudicateDacV003ObservationCurrentness({
    observations: [
      observation({
        observationIdentity: 'obs-e1',
        logicalOperation: logical,
        observedClass: 'AUTHORITATIVE_COMMITTED',
        providerCurrentness: { sequence: '5' },
      }),
      observation({
        observationIdentity: 'obs-e2',
        logicalOperation: logical,
        observedClass: 'RECONCILED_NOT_COMMITTED',
        providerCurrentness: { sequence: '5' },
      }),
    ],
  });
  assert.equal(currentnessOf(result, 'obs-e1'), 'CONFLICTING');
  assert.equal(currentnessOf(result, 'obs-e2'), 'CONFLICTING');
  assert.equal(result.requiresReconciliation, true);
});
