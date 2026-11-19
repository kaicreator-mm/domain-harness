/**
 * D3 (#1532) — test-only read-only observation capability fixture.
 *
 * This module is NOT pinned third-party source: it is THIS example's own
 * in-memory stand-in for Tally's selected read-only C observation adapter.
 * The pinned tally-engineering Business package dispatches
 * `tally.observeReadiness` through the Kernel-owned sealed resources port;
 * this fixture answers with the sealed native-pair SHAPE that Business
 * expects, carrying every authority flag as false — no GitHub call, no
 * network, no Claim, no DB row, no user data. The pinned Business then
 * diagnoses the pair and honestly reports NOT_ADMITTED / UNKNOWN.
 *
 * Kernel ABI: v08-capability-abi/1 — MODULE_ID/PACKAGE_KIND/ABI_VERSION/
 * ENDPOINTS identity, sealed OPERATIONS table, BUILD-bound handler export.
 * Declared WITHOUT externalEffect: a read-only observation never mints or
 * consumes a Kernel external Effect permit.
 */

export const MODULE_ID = 'capability-tally-source-observation-fixture@0.11.0-dev.0';
export const PACKAGE_KIND = 'capability';
export const CAPABILITY_ID = 'tally-source-observation';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:tally-source-observation-fixture', kind: 'capability-endpoint' },
];

export const OPERATIONS = [
  {
    operationId: 'tally.observeReadiness',
    effectClass: 'idempotent',
    intentType: 'inspectTaskReadiness',
    resource: { key: 'tally-source-observation', operation: 'tally.observeReadiness' },
    externalEffect: false,
  },
];

const DISPATCHES = [];

/**
 * Sealed read-only handler for tally.observeReadiness: answers one plain-data
 * observation record for the requested source identity. The workItem/
 * claimEvents pair follows the exact source-qualified shape the pinned
 * Business validates (issueRef/sourceSha echoed, authorized/admitted/
 * taskPass all false, claimStatus NOT_VERIFIED, zero claim candidates) —
 * a fixture projection, never a native GitHub or CAS observation.
 */
export function observeReadiness(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('tally.observeReadiness requires one plain-data observation request');
  }
  DISPATCHES.push({ sourceRef: payload.sourceRef ?? null, sourceSha: payload.sourceSha ?? null });
  return {
    status: 'SOURCE_PAIR_OBSERVED',
    claimStatus: 'NOT_VERIFIED',
    workItem: {
      issueRef: payload.sourceRef ?? null,
      sourceSha: payload.sourceSha ?? null,
      authorized: false,
      admitted: false,
      taskPass: false,
      claimStatus: 'NOT_VERIFIED',
      dependencyState: 'CLEAR',
      reason: 'CLAIM_NOT_VERIFIED',
      workflowState: 'state:ready',
    },
    claimEvents: {
      claimStatus: 'NOT_VERIFIED',
      authorized: false,
      admitted: false,
      taskPass: false,
      releasePass: false,
      candidateCount: 0,
      candidates: [],
    },
  };
}

/** Test-only witness: how many read-only observation dispatches happened. */
export function observationDispatchCount() {
  return DISPATCHES.length;
}

export function resetObservationFixture() {
  DISPATCHES.length = 0;
}
