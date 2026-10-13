/**
 * T-F #1005 — TF-D3 lane: independent Engineering self-dogfood tests.
 * =====================================================================
 *
 * Lane #1005@6113088850 (parallel workstream partition). Business module
 * under test: PR #1012@9f6aaf4163f410081a6fd078d066c19f9a02ab16
 * `examples/v08-domain-apps/business-engineering.mjs` — executed as sealed
 * bytes, never edited by this lane. The shared F01 test, the D2 Approval
 * module and both Business packages are NOT modified here.
 *
 * What this file proves, in-process, on the REAL selected Kernel mechanism
 * module and the REAL Standard SDK interpreter (both imported from their
 * exact sealed file bytes, data-URL discipline like V08-ABI-C01):
 *
 *   D3-P01   the full guarded lifecycle `change-proposed → reviewed →
 *            validation-passed → release-qualified` walks with per-stage
 *            dynamic evidence effects (exact idempotency keys
 *            `engineering:{stage}:{changeId}`, exact per-stage input
 *            provenance), Journal started→completed, state readback and
 *            terminal `release-qualified`/completed.
 *   D3-P01b  a qualified release is terminal — no later occurrence can be
 *            admitted, no second evidence append.
 *   D3-N01   wrong-role callers (including D2's trusted 'requester' role
 *            and the anonymous default) are denied by the Business binding
 *            BEFORE any Journal write or resource dispatch.
 *   D3-N01b  no stage-skipping promotion: from an earlier state no
 *            transition is a candidate; D2 Approval intent types cannot
 *            drive a D3 instance.
 *   D3-N02a  validation SHA exactness: testedSha must equal the COMMITTED
 *            reviewedSha (context lineage); a stale/failed/incomplete
 *            validation never moves the change and denial leaves durable
 *            state untouched (recovery still works).
 *   D3-N02b  release currentness: qualifiedSha must equal the COMMITTED
 *            testedSha of the validated artifact, and the
 *            release-manager attestation fields cannot be dropped.
 *   D3-N02c  revoked evidence violates the hard invariant and is denied
 *            BEFORE guard evaluation and any Journal/resource activity.
 *   D3-N02d  CROSS-SOURCE lineage falsifiers (#1005@6127134676 P1): after
 *            review(DH-1,HEAD) a fully SELF-CONSISTENT envelope for another
 *            change (or another SHA pair) is denied against the durable
 *            committed lineage with zero State/Journal/Effect residue —
 *            under the pre-lineage within-event guards these exact
 *            envelopes ADMITTED.
 *   D3-N02e  the same falsification at release: after validation(DH-1,
 *            VAL-1,HEAD) a release for another change / another
 *            validationId / another SHA pair denies with zero residue; the
 *            genuine same-source release still qualifies afterwards.
 *   D3-N03   the declared evidence effect fails closed without an
 *            authenticated physical Host resource port (typed Journal
 *            'failed', transition never commits, durably-failed retry is
 *            refused without a second dispatch).
 *   D3-N04   per-change stage evidence cannot be double-recorded
 *            (in-process replay containment through the state machine).
 *   D3-N05   UNKNOWN release: a physical Host fault on the effect-journal
 *            terminal write (after the evidence dispatched) leaves the
 *            occurrence UNKNOWN — no state/lineage commit, typed
 *            JOURNAL_CONFLICT; the un-faulted retry re-dispatches exactly
 *            once (idempotent semantics) and commits the lineage.
 *   SHARED-P01  D2 Approval and D3 Engineering occurrences execute the
 *            EXACT same physical K/S modules (identical runtime
 *            attribution) and independently BUILDed roots pin byte-equal
 *            K/S with byte-different Business packages.
 *   SHARED-N01  a substituted Kernel digest cannot install: post-approval
 *            byte substitution refuses to seal (BUILD_SUBJECT_DRIFT), and a
 *            different Kernel module identity cannot replay the durable
 *            evidence records a real D3 runtime wrote (typed journal pin
 *            refusal — no silent cross-version replay).
 *
 * FIXTURE BOUNDARY (honest): the memory doc store, resource dispatcher and
 * clock below are TEST FIXTURES ONLY (same boundary as V08-ABI-C01). Real
 * clean-process Host bootstrap, durable SQLite/Journal evidence trails and
 * authenticated cross-tenant journeys are NOT claimed by this file — they
 * run in the domain-harness workspace v08-integration tests (I01–I04 and
 * the T-F two-real-apps packed E2E). Evidence currentness in this file is
 * REAL committed Kernel lineage (stage-declared contextProjection, Kernel
 * PR #1034): every cross-stage guard reads the durable instance context
 * through `context` operands, not the submitted envelope alone.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { qualifyPackageClosure } from '../src/qualified-package/qualify.js';
import { buildQualifiedPackage, BuildError } from '../src/qualified-package/build.js';
import { issueApprovalProof } from '../src/qualified-package/approval.js';
import * as engineering from '../../../examples/v08-domain-apps/business-engineering.mjs';
import * as approval from '../../../examples/v08-domain-apps/business-approval.mjs';

// ---------------------------------------------------------------------------
// Sealed payload bytes → module identity → data-URL import (the tests
// execute the exact bytes a sealed qualified package would carry).
// ---------------------------------------------------------------------------

const KERNEL_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url)),
  'utf8',
);
const SDK_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url)),
  'utf8',
);

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function importSource(source: string): Promise<Record<string, any>> {
  return import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
}

const KERNEL_SHA256 = sha256Hex(KERNEL_SOURCE);
const SDK_SHA256 = sha256Hex(SDK_SOURCE);
const kernel: Record<string, any> = await importSource(KERNEL_SOURCE);
const sdk: Record<string, any> = await importSource(SDK_SOURCE);
// A genuinely different kernel module (truthful different digest) used only
// as a substitution attacker in SHARED-N01.
const KERNEL_V2_SOURCE = KERNEL_SOURCE.replaceAll('v08-kernel-mechanism@1.0.0', 'v08-kernel-mechanism@1.0.1');
const KERNEL_V2_SHA256 = sha256Hex(KERNEL_V2_SOURCE);

/** The REAL Standard SDK endpoint the kernel runtime is wired to. */
const sdkEndpoint = { packageId: sdk.MODULE_ID as string, interpret: sdk.interpret as any };

// ---------------------------------------------------------------------------
// FIXTURE Host primitives (TEST ONLY — production Host storage/auth is
// T-E/#1004 and the protected wiring is #1013).
// ---------------------------------------------------------------------------

class FixtureHostStoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FixtureHostStoreError';
    this.code = code;
  }
}

interface DocStore {
  get(key: string): Promise<{ value: any; revision: number } | null>;
  put(key: string, value: any, conditions?: Record<string, unknown>): Promise<{ revision: number }>;
  list(prefix: string): Promise<string[]>;
}

function memoryDocStore(): DocStore {
  const docs = new Map<string, any>();
  const revisions = new Map<string, number>();
  const clone = (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  return {
    async get(key) {
      if (!docs.has(key)) return null;
      return { value: clone(docs.get(key)), revision: revisions.get(key) as number };
    },
    async put(key, value, conditions = {}) {
      const exists = docs.has(key);
      if (conditions.mustBeAbsent === true && exists) {
        throw new FixtureHostStoreError('HOST_KEY_EXISTS', `host doc ${key} already exists`);
      }
      if (conditions.mustMatchRevision !== undefined) {
        if (!exists || revisions.get(key) !== conditions.mustMatchRevision) {
          throw new FixtureHostStoreError('HOST_CAS_CONFLICT', `host doc ${key} CAS conflict`);
        }
      }
      const revision = exists ? (revisions.get(key) as number) + 1 : 0;
      docs.set(key, clone(value));
      revisions.set(key, revision);
      return { revision };
    },
    async list(prefix) {
      return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

interface ResourceCall {
  resourceKey: string;
  operation: string;
  payload: any;
}

/** FIXTURE resource port provisioning BOTH apps' physical resources. */
function resourcePort() {
  const calls: ResourceCall[] = [];
  return {
    calls: () => calls.slice(),
    callCount: () => calls.length,
    async call(resourceKey: string, operation: string, payload: any) {
      calls.push({ resourceKey, operation, payload });
      if (resourceKey === 'engineering-evidence' && operation === 'append') {
        return { appended: true, effectId: payload.effectId, idempotencyKey: payload.idempotencyKey };
      }
      if (resourceKey === 'ledger' && operation === 'reserve') {
        return { reserved: true, effectId: payload.effectId };
      }
      throw new Error(`host resource ${resourceKey}.${operation} is not provisioned`);
    },
  };
}

const NOW = '2026-10-12T08:00:00.000Z';

function fixtureHostPorts(options: { resources?: boolean } = {}) {
  const docs = memoryDocStore();
  const resources = resourcePort();
  const sha256 = { async digestUtf8(value: string) { return sha256Hex(value); } };
  return {
    docs,
    ...(options.resources === false ? {} : { resources }),
    sha256,
    clock: () => NOW,
  };
}

type FixtureHost = ReturnType<typeof fixtureHostPorts>;

// ---------------------------------------------------------------------------
// D3 Engineering runtime on the REAL K mechanism + REAL S interpreter.
// ---------------------------------------------------------------------------

const ENG_TARGET = { workflowId: 'domainharness-engineering', instanceKey: 'change:DH-1' };
const HEAD_SHA = 'sha256:9f6aaf4163f410081a6fd078d066c19f9a02ab16';
const STALE_SHA = 'sha256:0000000000000000000000000000000000000000';

function engineeringRuntime(host: FixtureHost = fixtureHostPorts()) {
  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: KERNEL_SHA256 },
    hostPorts: host,
    sdkEndpoint,
    businessEndpoint: engineering.getPolicy(),
  });
  return { runtime, host };
}

async function openedEngineering(host?: FixtureHost) {
  const ctx = engineeringRuntime(host);
  await ctx.runtime.openInstance({ target: ENG_TARGET, correlationId: 'corr:change:DH-1' });
  return ctx;
}

let messageSeq = 0;
function submit(
  runtime: any,
  intentType: string,
  input: Record<string, unknown>,
  role: string,
  target: { workflowId: string; instanceKey: string } = ENG_TARGET,
  messageId?: string,
) {
  messageSeq += 1;
  return runtime.submitOccurrence({
    kind: 'v08/tf-d3-intent',
    intentType,
    target,
    messageId: messageId ?? `msg:d3:${messageSeq}`,
    input,
    caller: { role },
  });
}

function reviewInput(overrides: Record<string, unknown> = {}) {
  return { changeId: 'DH-1', reviewId: 'REV-1', reviewedSha: HEAD_SHA, reviewApproved: true, revoked: false, ...overrides };
}
function validationInput(overrides: Record<string, unknown> = {}) {
  return {
    changeId: 'DH-1', validationId: 'VAL-1', reviewedSha: HEAD_SHA, testedSha: HEAD_SHA,
    testsPassed: true, revoked: false, ...overrides,
  };
}
function releaseInput(overrides: Record<string, unknown> = {}) {
  return {
    changeId: 'DH-1', validationId: 'VAL-1', testedSha: HEAD_SHA, qualifiedSha: HEAD_SHA,
    releaseApproved: true, revoked: false, ...overrides,
  };
}
function without(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...input };
  delete copy[key];
  return copy;
}

function isTypedError(name: string, code: string) {
  return (error: unknown) => {
    const typed = error as { name?: string; code?: string };
    return typed?.name === name && typed?.code === code;
  };
}

/** Walk the three authorized stages; returns the three admitted receipts. */
async function walkFullLifecycle(runtime: any) {
  const review = await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  const validation = await submit(runtime, 'recordValidation', validationInput(), 'validator');
  const release = await submit(runtime, 'qualifyRelease', releaseInput(), 'release-manager');
  return { review, validation, release };
}

// ===========================================================================
// D3-P01 — the real staged Engineering lifecycle on the real K/S modules.
// ===========================================================================

test('V08-TF-D3-P01: full guarded lifecycle change-proposed→reviewed→validation-passed→release-qualified with per-stage dynamic evidence', async () => {
  const { runtime, host } = await openedEngineering();

  const opened = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(opened.state.stateKey, 'change-proposed');
  assert.equal(opened.lifecycle, 'active');
  assert.equal(opened.stateRevision, 0);

  const { review, validation, release } = await walkFullLifecycle(runtime);

  // --- review stage ---
  assert.equal(review.status, 'admitted');
  assert.equal(review.admitted.transitionKey, 'review');
  assert.equal(review.admitted.targetState, 'reviewed');
  assert.equal(review.instance.state.stateKey, 'reviewed');
  assert.equal(review.instance.lifecycle, 'active');
  assert.equal(review.instance.stateRevision, 1);
  assert.deepEqual(review.admitted.effects.map((effect: any) => effect.disposition), ['executed']);
  assert.equal(review.admitted.effects[0].effectType, 'effect:record-engineering-evidence');
  assert.equal(review.admitted.effects[0].idempotencyKey, 'engineering:review:DH-1');

  // --- validation stage ---
  assert.equal(validation.status, 'admitted');
  assert.equal(validation.admitted.transitionKey, 'validate');
  assert.equal(validation.admitted.targetState, 'validation-passed');
  assert.equal(validation.instance.state.stateKey, 'validation-passed');
  assert.equal(validation.instance.stateRevision, 2);
  assert.equal(validation.admitted.effects[0].idempotencyKey, 'engineering:validation:DH-1');

  // --- release stage ---
  assert.equal(release.status, 'admitted');
  assert.equal(release.admitted.transitionKey, 'qualify');
  assert.equal(release.admitted.targetState, 'release-qualified');
  assert.equal(release.instance.state.stateKey, 'release-qualified');
  assert.equal(release.instance.lifecycle, 'completed');
  assert.equal(release.instance.stateRevision, 3);
  assert.equal(release.admitted.effects[0].idempotencyKey, 'engineering:release:DH-1');

  // --- durable cross-stage lineage (Kernel #1034 contextProjection) ---
  // Each admitted stage receipt carries the projection K resolved from THIS
  // event, and the committed instance context accumulates the full lineage
  // changeId → reviewedSha → validationId/testedSha → qualifiedSha through
  // the same CAS writes that moved the state.
  assert.deepEqual(review.admitted.contextProjection, { changeId: 'DH-1', reviewedSha: HEAD_SHA });
  assert.deepEqual(validation.admitted.contextProjection, { changeId: 'DH-1', validationId: 'VAL-1', testedSha: HEAD_SHA });
  assert.deepEqual(release.admitted.contextProjection, { qualifiedSha: HEAD_SHA });
  const afterReview = await runtime.getSnapshot(ENG_TARGET);
  assert.deepEqual((afterReview as any).state.context, {
    changeId: 'DH-1', reviewedSha: HEAD_SHA, validationId: 'VAL-1', testedSha: HEAD_SHA, qualifiedSha: HEAD_SHA,
  });

  // Every occurrence receipt attributes itself to the same physical kernel.
  for (const receipt of [review, validation, release]) {
    assert.deepEqual(receipt.attribution.kernel, {
      packageId: kernel.MODULE_ID, moduleSha256: KERNEL_SHA256, generation: kernel.KERNEL_GENERATION,
    });
    assert.equal(receipt.attribution.business.packageId, engineering.MODULE_ID);
  }

  // Physical resource port: exactly one durable evidence append per stage,
  // carrying exactly the declared dynamic per-stage input projection.
  const calls = host.resources.calls();
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.resourceKey, 'engineering-evidence');
    assert.equal(call.operation, 'append');
  }
  assert.deepEqual(calls[0].payload.input, {
    changeId: 'DH-1', reviewId: 'REV-1', reviewApproved: true, reviewedSha: HEAD_SHA,
  });
  assert.equal(calls[0].payload.idempotencyKey, 'engineering:review:DH-1');
  assert.deepEqual(calls[1].payload.input, {
    changeId: 'DH-1', validationId: 'VAL-1', testedSha: HEAD_SHA, testsPassed: true,
  });
  assert.equal(calls[1].payload.idempotencyKey, 'engineering:validation:DH-1');
  assert.deepEqual(calls[2].payload.input, {
    changeId: 'DH-1', validationId: 'VAL-1', testedSha: HEAD_SHA, qualifiedSha: HEAD_SHA,
    releaseApproved: true,
  });
  assert.equal(calls[2].payload.idempotencyKey, 'engineering:release:DH-1');
  // Three distinct effect identities and durable control turns.
  assert.equal(new Set(calls.map((call) => call.payload.effectId)).size, 3);

  // Journal readback: three completed durable evidence records.
  const records = await runtime.getJournalRecords();
  assert.equal(records.length, 3);
  for (const record of records) {
    assert.equal(record.status, 'completed');
    assert.equal(record.effectType, 'effect:record-engineering-evidence');
    assert.equal(record.effectSemantics, 'idempotent');
  }
  assert.deepEqual(records.map((record: any) => record.idempotencyKey), [
    'engineering:review:DH-1', 'engineering:validation:DH-1', 'engineering:release:DH-1',
  ]);
  assert.equal(new Set(records.map((record: any) => record.effectId)).size, 3);
  assert.equal(new Set(records.map((record: any) => record.durableControlTurnId)).size, 3);

  // State readback after the walk: qualification really is durable.
  const final = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(final.state.stateKey, 'release-qualified');
  assert.equal(final.lifecycle, 'completed');
  assert.equal(final.stateRevision, 3);
  assert.equal(final.packageId, engineering.MODULE_ID);
});

test('V08-TF-D3-P01b: release-qualified is terminal — cross-stage intents reject typed and no second evidence append happens', async () => {
  const { runtime, host } = await openedEngineering();
  const { release } = await walkFullLifecycle(runtime);
  assert.equal(release.status, 'admitted');

  for (const [intentType, input, role] of [
    ['reviewChange', reviewInput(), 'reviewer'],
    ['recordValidation', validationInput(), 'validator'],
    ['qualifyRelease', releaseInput(), 'release-manager'],
  ] as const) {
    if (intentType === 'qualifyRelease') {
      // The final state is declared in this intent's own stage definition.
      const receipt = await submit(runtime, intentType, input, role);
      assert.equal(receipt.status, 'denied');
      assert.equal(receipt.denial.reason, 'no-candidate-transition');
    } else {
      // Each sibling intent's sealed stage definition omits release-qualified.
      await assert.rejects(
        submit(runtime, intentType, input, role),
        isTypedError('CentralAdmissionError', 'ADMISSION_UNKNOWN_STATE'),
      );
    }
  }
  assert.equal((await runtime.getJournalRecords()).length, 3);
  assert.equal(host.resources.callCount(), 3);
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'release-qualified');
  assert.equal(snapshot.stateRevision, 3);
});

// ===========================================================================
// D3-N01 — Business-owned role authorization, fail-closed before any
// Journal write or physical resource dispatch.
// ===========================================================================

test('V08-TF-D3-N01: wrong-role callers are denied by the Business binding before any journal or resource activity', async () => {
  const { runtime, host } = await openedEngineering();

  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['reviewChange', reviewInput(), 'validator'],
    ['reviewChange', reviewInput(), 'release-manager'],
    ['reviewChange', reviewInput(), 'requester'],
    ['recordValidation', validationInput(), 'reviewer'],
    ['recordValidation', validationInput(), 'release-manager'],
    ['recordValidation', validationInput(), 'requester'],
    ['qualifyRelease', releaseInput(), 'reviewer'],
    ['qualifyRelease', releaseInput(), 'validator'],
    ['qualifyRelease', releaseInput(), 'requester'],
  ];
  for (const [intentType, input, role] of cases) {
    const receipt = await submit(runtime, intentType, input, role);
    assert.equal(receipt.status, 'denied', `${role} must not admit ${intentType}`);
    assert.equal(receipt.denial.reason, 'business-caller-role');
    assert.equal(receipt.denial.deniedBy, engineering.MODULE_ID);
    assert.equal(receipt.denial.intentType, intentType);
    assert.equal(receipt.denial.callerRole, role);
  }

  // A caller that presents no principal at all is equally unauthorized.
  messageSeq += 1;
  const anonymous = await runtime.submitOccurrence({
    kind: 'v08/tf-d3-intent',
    intentType: 'qualifyRelease',
    target: ENG_TARGET,
    messageId: `msg:d3:${messageSeq}`,
    input: releaseInput(),
  });
  assert.equal(anonymous.status, 'denied');
  assert.equal(anonymous.denial.reason, 'business-caller-role');
  assert.equal(anonymous.denial.callerRole, 'anonymous');

  // Zero journal rows, zero resource dispatches, state untouched.
  assert.equal((await runtime.getJournalRecords()).length, 0);
  assert.equal(host.resources.callCount(), 0);
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'change-proposed');
  assert.equal(snapshot.stateRevision, 0);
});

test('V08-TF-D3-N01b: unqualified promotion — out-of-stage intents reject typed and D2 intents cannot drive D3', async () => {
  const { runtime, host } = await openedEngineering();

  // Each intent carries a sealed single-stage workflow definition. A submission
  // from an undeclared sibling state fails typed before any effect or journal.
  await assert.rejects(
    submit(runtime, 'recordValidation', validationInput(), 'validator'),
    isTypedError('CentralAdmissionError', 'ADMISSION_UNKNOWN_STATE'),
  );

  // Release before any review, even from the legitimate release-manager.
  await assert.rejects(
    submit(runtime, 'qualifyRelease', releaseInput(), 'release-manager'),
    isTypedError('CentralAdmissionError', 'ADMISSION_UNKNOWN_STATE'),
  );

  // A real review, then release while validation is still skipped.
  const review = await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  assert.equal(review.status, 'admitted');
  await assert.rejects(
    submit(runtime, 'qualifyRelease', releaseInput(), 'release-manager'),
    isTypedError('CentralAdmissionError', 'ADMISSION_UNKNOWN_STATE'),
  );

  // D2 Approval intent types have no binding in the D3 business policy.
  await assert.rejects(
    submit(runtime, 'submitQuoteDecisionDynamic', { amount: 30, requestId: 'APX-R1' }, 'requester'),
    isTypedError('CentralAdmissionError', 'ADMISSION_EVALUATION_INPUT_INVALID'),
  );

  assert.equal((await runtime.getJournalRecords()).length, 1);
  assert.equal(host.resources.callCount(), 1);
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'reviewed');
  assert.equal(snapshot.stateRevision, 1);
});

// ===========================================================================
// D3-N02a — validation SHA exactness / evidence currentness (per-occurrence).
// ===========================================================================

test('V08-TF-D3-N02a: stale validation SHA is refused — testedSha must equal reviewedSha, denial is final and state-preserving', async () => {
  const { runtime, host } = await openedEngineering();
  const review = await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  assert.equal(review.status, 'admitted');

  // Stale: the validation ran against an older commit than the reviewed change.
  const stale = await submit(runtime, 'recordValidation', validationInput({ testedSha: STALE_SHA }), 'validator');
  assert.equal(stale.status, 'denied');
  assert.equal(stale.denial.reason, 'guard');
  assert.equal(stale.denial.guardId, 'guard:validation-passed');
  assert.equal(stale.denial.transitionKey, 'validate');

  // A failed test run can never pass validation.
  const failed = await submit(runtime, 'recordValidation', validationInput({ testsPassed: false }), 'validator');
  assert.equal(failed.status, 'denied');
  assert.equal(failed.denial.reason, 'guard');
  assert.equal(failed.denial.guardId, 'guard:validation-passed');

  // An unattested validation record (validationId/changeId missing) is
  // refused even EARLIER than the guard — by the Standard SDK's own input
  // projection, typed and fail-closed, before any Kernel guard, journal or
  // resource activity. (The guard's exists-clauses are defense-in-depth
  // behind S.)
  await assert.rejects(
    submit(runtime, 'recordValidation', without(validationInput(), 'validationId'), 'validator'),
    isTypedError('StandardSdkError', 'SDK_PROJECTION_MISSING'),
  );
  await assert.rejects(
    submit(runtime, 'recordValidation', without(validationInput(), 'changeId'), 'validator'),
    isTypedError('StandardSdkError', 'SDK_PROJECTION_MISSING'),
  );

  // Guard denials wrote no journal row, dispatched no resource, and left the
  // durable state exactly where it was.
  assert.equal((await runtime.getJournalRecords()).length, 1);
  assert.equal(host.resources.callCount(), 1);
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'reviewed');
  assert.equal(snapshot.stateRevision, 1);

  // Recovery: a CURRENT validation still proceeds after the denials — no
  // hidden state corruption from the refused occurrences.
  const recovery = await submit(runtime, 'recordValidation', validationInput(), 'validator');
  assert.equal(recovery.status, 'admitted');
  assert.equal(recovery.admitted.targetState, 'validation-passed');
});

test('V08-TF-D3-N02b: release currentness — qualifiedSha must equal testedSha and the attestation cannot be dropped', async () => {
  const { runtime, host } = await openedEngineering();
  await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  const validation = await submit(runtime, 'recordValidation', validationInput(), 'validator');
  assert.equal(validation.status, 'admitted');
  assert.equal(validation.admitted.targetState, 'validation-passed');

  // Stale qualified SHA: release attested against something other than the
  // exact SHA the validation tested.
  const stale = await submit(runtime, 'qualifyRelease', releaseInput({ qualifiedSha: STALE_SHA }), 'release-manager');
  assert.equal(stale.status, 'denied');
  assert.equal(stale.denial.reason, 'guard');
  assert.equal(stale.denial.guardId, 'guard:release-qualified');
  assert.equal(stale.denial.transitionKey, 'qualify');

  // No release approval — refused by the same guard.
  const unapproved = await submit(runtime, 'qualifyRelease', releaseInput({ releaseApproved: false }), 'release-manager');
  assert.equal(unapproved.status, 'denied');
  assert.equal(unapproved.denial.reason, 'guard');
  // Missing attestation fields are refused by the Standard SDK projection
  // (typed, fail-closed, before any guard/journal/resource activity).
  await assert.rejects(
    submit(runtime, 'qualifyRelease', without(releaseInput(), 'validationId'), 'release-manager'),
    isTypedError('StandardSdkError', 'SDK_PROJECTION_MISSING'),
  );
  await assert.rejects(
    submit(runtime, 'qualifyRelease', without(releaseInput(), 'changeId'), 'release-manager'),
    isTypedError('StandardSdkError', 'SDK_PROJECTION_MISSING'),
  );

  assert.equal((await runtime.getJournalRecords()).length, 2);
  assert.equal(host.resources.callCount(), 2);
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'validation-passed');
  assert.equal(snapshot.stateRevision, 2);

  // Recovery: the current, exact release attestation proceeds.
  const recovery = await submit(runtime, 'qualifyRelease', releaseInput(), 'release-manager');
  assert.equal(recovery.status, 'admitted');
  assert.equal(recovery.admitted.targetState, 'release-qualified');
  assert.equal(recovery.instance.lifecycle, 'completed');
});

// ===========================================================================
// D3-N02d — CROSS-SOURCE lineage falsifiers (#1005@6127134676 P1).
// A self-consistent envelope for a DIFFERENT change (or a different SHA
// pair) previously ADMITTED because the guards compared the event only
// with itself. Now the validation guard binds changeId/testedSha to the
// lineage K committed at review, so every cross-source submission denies
// with zero State/Journal/Effect residue.
// ===========================================================================

test('V08-TF-D3-N02d: cross-change validation — self-consistent envelopes for another change/SHA pair deny against committed lineage', async () => {
  const { runtime, host } = await openedEngineering();
  const review = await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  assert.equal(review.status, 'admitted');
  assert.deepEqual((await runtime.getSnapshot(ENG_TARGET) as any).state.context, { changeId: 'DH-1', reviewedSha: HEAD_SHA });

  // Attack 1 — a FULLY self-consistent envelope for a different change
  // DH-2 (its own reviewedSha equals its own testedSha). This exact
  // envelope was admitted by the pre-lineage within-event guard.
  const crossChange = await submit(
    runtime, 'recordValidation',
    validationInput({ changeId: 'DH-2', reviewedSha: STALE_SHA, testedSha: STALE_SHA }),
    'validator', ENG_TARGET, 'msg:d3:n02d-cross-change',
  );
  assert.equal(crossChange.status, 'denied');
  assert.equal(crossChange.denial.reason, 'guard');
  assert.equal(crossChange.denial.guardId, 'guard:validation-passed');
  assert.equal(crossChange.denial.transitionKey, 'validate');

  // Attack 2 — same changeId, but a forged different SHA pair (again
  // internally consistent within the submitted envelope).
  const crossSha = await submit(
    runtime, 'recordValidation',
    validationInput({ reviewedSha: STALE_SHA, testedSha: STALE_SHA }),
    'validator', ENG_TARGET, 'msg:d3:n02d-cross-sha',
  );
  assert.equal(crossSha.status, 'denied');
  assert.equal(crossSha.denial.reason, 'guard');
  assert.equal(crossSha.denial.guardId, 'guard:validation-passed');

  // Zero residue: no journal row, no effect dispatch, identical durable
  // state AND lineage context at the same revision.
  assert.equal((await runtime.getJournalRecords()).length, 1);
  assert.equal(host.resources.callCount(), 1);
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'reviewed');
  assert.equal(snapshot.stateRevision, 1);
  assert.deepEqual((snapshot as any).state.context, { changeId: 'DH-1', reviewedSha: HEAD_SHA });

  // The genuine same-source validation still proceeds afterwards.
  const recovery = await submit(runtime, 'recordValidation', validationInput(), 'validator');
  assert.equal(recovery.status, 'admitted');
  assert.deepEqual(recovery.admitted.contextProjection, { changeId: 'DH-1', validationId: 'VAL-1', testedSha: HEAD_SHA });
  assert.deepEqual((await runtime.getSnapshot(ENG_TARGET) as any).state.context, {
    changeId: 'DH-1', reviewedSha: HEAD_SHA, validationId: 'VAL-1', testedSha: HEAD_SHA,
  });
});

test('V08-TF-D3-N02e: cross-source release — another change/validationId/SHA pair denies; the genuine release qualifies afterwards', async () => {
  const { runtime, host } = await openedEngineering();
  await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  const validation = await submit(runtime, 'recordValidation', validationInput(), 'validator');
  assert.equal(validation.status, 'admitted');
  const committedLineage = { changeId: 'DH-1', reviewedSha: HEAD_SHA, validationId: 'VAL-1', testedSha: HEAD_SHA };

  for (const [messageId, overrides] of [
    // Another change's release — internally consistent, cross-source.
    ['msg:d3:n02e-cross-change', { changeId: 'DH-2' }],
    // A re-used envelope for a DIFFERENT validation run.
    ['msg:d3:n02e-cross-validation', { validationId: 'VAL-2' }],
    // A forged SHA pair different from the committed testedSha.
    ['msg:d3:n02e-cross-sha', { testedSha: STALE_SHA, qualifiedSha: STALE_SHA }],
  ] as const) {
    const receipt = await submit(runtime, 'qualifyRelease', releaseInput(overrides), 'release-manager', ENG_TARGET, messageId);
    assert.equal(receipt.status, 'denied', messageId);
    assert.equal(receipt.denial.reason, 'guard', messageId);
    assert.equal(receipt.denial.guardId, 'guard:release-qualified', messageId);
    assert.equal(receipt.denial.transitionKey, 'qualify', messageId);
  }

  // Zero State/Journal/Effect residue across all three cross-source attempts.
  assert.equal((await runtime.getJournalRecords()).length, 2);
  assert.equal(host.resources.callCount(), 2);
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'validation-passed');
  assert.equal(snapshot.stateRevision, 2);
  assert.deepEqual((snapshot as any).state.context, committedLineage);

  // The genuine same-source release qualifies and pins qualifiedSha.
  const release = await submit(runtime, 'qualifyRelease', releaseInput(), 'release-manager');
  assert.equal(release.status, 'admitted');
  assert.deepEqual(release.admitted.contextProjection, { qualifiedSha: HEAD_SHA });
  const final = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(final.state.stateKey, 'release-qualified');
  assert.equal(final.stateRevision, 3);
  assert.deepEqual((final as any).state.context, { ...committedLineage, qualifiedSha: HEAD_SHA });
});

// ===========================================================================
// D3-N02c — revoked evidence violates the hard invariant BEFORE guards and
// any Journal/resource activity.
// ===========================================================================

test('V08-TF-D3-N02c: revoked evidence is denied by the hard invariant before guard evaluation and any journal activity', async () => {
  const { runtime, host } = await openedEngineering();

  // Revoked review evidence cannot be admitted even with a perfect guard payload.
  const revokedReview = await submit(runtime, 'reviewChange', reviewInput({ revoked: true }), 'reviewer');
  assert.equal(revokedReview.status, 'denied');
  assert.equal(revokedReview.denial.reason, 'hard-invariant');
  assert.equal(revokedReview.denial.invariantId, 'inv:no-revoked-evidence');

  // Priority proof: an event failing BOTH the invariant and the guard is
  // denied by the invariant, so no revoked payload can sneak past a guard
  // evaluation ordering change.
  const both = await submit(runtime, 'reviewChange', reviewInput({ revoked: true, reviewApproved: false }), 'reviewer');
  assert.equal(both.status, 'denied');
  assert.equal(both.denial.reason, 'hard-invariant');
  assert.equal(both.denial.invariantId, 'inv:no-revoked-evidence');

  // The same hard refusal holds at the validation and release states.
  await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  const revokedValidation = await submit(runtime, 'recordValidation', validationInput({ revoked: true }), 'validator');
  assert.equal(revokedValidation.status, 'denied');
  assert.equal(revokedValidation.denial.reason, 'hard-invariant');
  await submit(runtime, 'recordValidation', validationInput(), 'validator');
  const revokedRelease = await submit(runtime, 'qualifyRelease', releaseInput({ revoked: true }), 'release-manager');
  assert.equal(revokedRelease.status, 'denied');
  assert.equal(revokedRelease.denial.reason, 'hard-invariant');
  assert.equal(revokedRelease.denial.invariantId, 'inv:no-revoked-evidence');

  // No revoked evidence ever reached the journal or the physical port.
  const records = await runtime.getJournalRecords();
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.notEqual((record as any).input.revoked, true);
  }
  for (const call of host.resources.calls()) {
    assert.notEqual((call.payload.input as any).revoked, true);
  }
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'validation-passed');
  assert.equal(snapshot.stateRevision, 2);
});

// ===========================================================================
// D3-N03 — the declared evidence effect fails closed without an
// authenticated physical Host resource port.
// ===========================================================================

test('V08-TF-D3-N03: without a physical Host resource port the evidence effect fails closed, typed, and the transition never commits', async () => {
  const host = fixtureHostPorts({ resources: false });
  const { runtime } = await openedEngineering(host);

  // The Business effect handler demands the authenticated physical port; the
  // kernel journals the failure and fails the occurrence typed.
  await assert.rejects(
    submit(runtime, 'reviewChange', reviewInput(), 'reviewer', ENG_TARGET, 'msg:d3:n03-first'),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string; message?: string };
      return typed?.name === 'CentralAdmissionError'
        && typed?.code === 'ADMISSION_EFFECT_FAILED'
        && /authenticated physical Host resource port/.test(String(typed?.message));
    },
  );

  // The journal holds exactly one durably FAILED record — honest evidence
  // that no release-quality evidence was produced.
  const records = await runtime.getJournalRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'failed');
  assert.equal(records[0].effectType, 'effect:record-engineering-evidence');

  // The transition never committed: the change is still proposed.
  const snapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(snapshot.state.stateKey, 'change-proposed');
  assert.equal(snapshot.stateRevision, 0);

  // A blind retry of the SAME durable effect is refused without a second
  // dispatch attempt (operator recovery owns the retry).
  await assert.rejects(
    submit(runtime, 'reviewChange', reviewInput(), 'reviewer', ENG_TARGET, 'msg:d3:n03-first'),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string; message?: string };
      return typed?.name === 'CentralAdmissionError'
        && typed?.code === 'ADMISSION_EFFECT_FAILED'
        && /durably failed/.test(String(typed?.message));
    },
  );
  assert.equal((await runtime.getJournalRecords()).length, 1);
});

// ===========================================================================
// D3-N04 — per-change stage evidence cannot be double-recorded in-process.
// ===========================================================================

test('V08-TF-D3-N04: replaying an already-recorded stage occurrence appends no second evidence', async () => {
  const { runtime, host } = await openedEngineering();
  const review = await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  assert.equal(review.status, 'admitted');

  // Same review occurrence again (fresh message id, identical payload): the
  // state machine has already left change-proposed, so the replay is denied
  // and the evidence effect never re-dispatches.
  const replay = await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  assert.equal(replay.status, 'denied');
  assert.equal(replay.denial.reason, 'no-candidate-transition');

  assert.equal((await runtime.getJournalRecords()).length, 1);
  assert.equal(host.resources.callCount(), 1);
  assert.equal(host.resources.calls()[0].payload.idempotencyKey, 'engineering:review:DH-1');
});

// ===========================================================================
// D3-N05 — UNKNOWN: a physical Host fault on the effect-journal TERMINAL
// write (after the release evidence dispatched) leaves the occurrence
// UNKNOWN. No state or lineage commit happens; the typed refusal is
// JOURNAL_CONFLICT (ambiguous). Because the engineering evidence effect
// is IDEMPOTENT, the un-faulted retry re-dispatches exactly once and then
// commits — the K-level AMBIGUOUS-for-non-idempotent proof is Kernel
// contract D3-R2 (#1034); here we prove the app-level discipline.
// ===========================================================================

test('V08-TF-D3-N05: UNKNOWN release — journal terminal fault commits nothing; idempotent retry re-dispatches once and then qualifies', async () => {
  const { runtime, host } = await openedEngineering();
  await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  await submit(runtime, 'recordValidation', validationInput(), 'validator');
  const before = {
    snapshot: await runtime.getSnapshot(ENG_TARGET),
    journal: (await runtime.getJournalRecords()).length,
    calls: host.resources.callCount(),
  };
  assert.equal(before.journal, 2);
  assert.equal(before.calls, 2);

  // Fault the SECOND journal write of THIS stage's evidence effect: the
  // 'started' record commits, the evidence dispatches, the terminal
  // 'completed' record faults — the occurrence ends UNKNOWN.
  const originalPut = host.docs.put.bind(host.docs);
  let journalPuts = 0;
  host.docs.put = async (key: string, value: any, conditions?: Record<string, unknown>) => {
    if (key.startsWith('v08-kernel:effect-journal:')) {
      journalPuts += 1;
      if (journalPuts === 2) {
        throw Object.assign(new Error('host fault after release evidence dispatch'), { code: 'HOST_FAULT_INJECTED' });
      }
    }
    return originalPut(key, value, conditions);
  };
  await assert.rejects(
    submit(runtime, 'qualifyRelease', releaseInput(), 'release-manager', ENG_TARGET, 'msg:d3:n05-release'),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string; message?: string };
      return typed?.name === 'CentralAdmissionError'
        && typed?.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT'
        && /ambiguous/.test(String(typed?.message));
    },
  );
  host.docs.put = originalPut;

  // The evidence dispatched exactly once so far; the state and lineage are
  // NOT committed — the instance is still at validation-passed.
  assert.equal(host.resources.callCount(), before.calls + 1);
  const unknownSnapshot = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(unknownSnapshot.state.stateKey, 'validation-passed');
  assert.equal(unknownSnapshot.stateRevision, (before.snapshot as any).stateRevision);
  assert.deepEqual((unknownSnapshot as any).state.context, (before.snapshot as any).state.context);

  // Un-faulted retry of the SAME message: idempotent semantics re-dispatch
  // the evidence exactly once more, the terminal record commits, and the
  // transition (with its qualifiedSha lineage) finally lands.
  const retry = await submit(runtime, 'qualifyRelease', releaseInput(), 'release-manager', ENG_TARGET, 'msg:d3:n05-release');
  assert.equal(retry.status, 'admitted');
  assert.equal(retry.admitted.effects[0].disposition, 'executed');
  assert.equal(host.resources.callCount(), before.calls + 2, 'exactly one re-dispatch under UNKNOWN recovery');

  const records = await runtime.getJournalRecords();
  assert.equal(records.length, 3, 'the started record was completed, not duplicated');
  for (const record of records) {
    assert.equal((record as any).status, 'completed');
  }
  const final = await runtime.getSnapshot(ENG_TARGET);
  assert.equal(final.state.stateKey, 'release-qualified');
  assert.equal(final.stateRevision, 3);
  assert.deepEqual((final as any).state.context, {
    changeId: 'DH-1', reviewedSha: HEAD_SHA, validationId: 'VAL-1', testedSha: HEAD_SHA, qualifiedSha: HEAD_SHA,
  });
});

// ===========================================================================
// SHARED-P01 — D2 Approval and D3 Engineering share the EXACT same physical
// K/S modules (runtime-level and independent BUILD-level proof).
// ===========================================================================

test('V08-TF-D3-SHARED-P01: D2 Approval and D3 Engineering occurrences execute the exact same physical K/S modules', async () => {
  // D3 side: one real admitted review occurrence.
  const engineeringCtx = await openedEngineering();
  const engReview = await submit(engineeringCtx.runtime, 'reviewChange', reviewInput(), 'reviewer');
  assert.equal(engReview.status, 'admitted');

  // D2 side: one real admitted approval occurrence (the #994 golden
  // scenario — requester decides {amount:30, requestId:'APX-R1'}).
  const APPROVAL_TARGET = { workflowId: 'order-quote', instanceKey: 'instance:APX-R1' };
  const d2Host = fixtureHostPorts();
  const d2 = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: KERNEL_SHA256 },
    hostPorts: d2Host,
    sdkEndpoint,
    businessEndpoint: approval.getPolicy(),
  });
  await d2.openInstance({ target: APPROVAL_TARGET, correlationId: 'corr:APX-R1' });
  const quote = await d2.submitOccurrence({
    kind: 'v08/tf-d3-intent',
    intentType: 'submitQuoteDecisionDynamic',
    target: APPROVAL_TARGET,
    messageId: 'msg:d2:1',
    input: { amount: 30, requestId: 'APX-R1' },
    caller: { role: 'requester' },
  });
  assert.equal(quote.status, 'admitted');
  assert.equal(quote.admitted.targetState, 'approved');
  assert.equal(quote.admitted.effects[0].idempotencyKey, 'reserve:quote:APX-R1');
  assert.equal(d2Host.resources.calls()[0].resourceKey, 'ledger');

  // SAME exact kernel identity and SDK endpoint on every occurrence of BOTH
  // genuinely distinct Business apps.
  assert.deepEqual(engReview.attribution.kernel, quote.attribution.kernel);
  assert.deepEqual(engReview.attribution.kernel, {
    packageId: kernel.MODULE_ID, moduleSha256: KERNEL_SHA256, generation: kernel.KERNEL_GENERATION,
  });
  assert.deepEqual(engReview.attribution.sdk, quote.attribution.sdk);
  assert.notEqual(engReview.attribution.business.packageId, quote.attribution.business.packageId);
  assert.equal(engineeringCtx.runtime.moduleSha256, d2.moduleSha256);
  assert.equal(engineeringCtx.runtime.moduleId, d2.moduleId);
  assert.equal(engineeringCtx.runtime.businessPackageId, engineering.MODULE_ID);
  assert.equal(d2.businessPackageId, approval.MODULE_ID);
});

// ---------------------------------------------------------------------------
// Independent BUILD qualification (own external issuer act, physically
// re-read file bytes — no reuse of the F01 issuer or fixtures).
// ---------------------------------------------------------------------------

const pinnedSources = {
  kernel: new URL('../src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url),
  sdk: new URL('../src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url),
  approval: new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url),
  engineering: new URL('../../../examples/v08-domain-apps/business-engineering.mjs', import.meta.url),
};
const ISSUER = 'issuer:d3-lane-independent';
const SECRET = 'd3-lane-independent-external-issuer-proof-only';

async function sealedApp(kind: 'approval' | 'engineering') {
  const [kBytes, sBytes, bBytes] = await Promise.all([
    readFile(pinnedSources.kernel, 'utf8'),
    readFile(pinnedSources.sdk, 'utf8'),
    readFile(pinnedSources[kind], 'utf8'),
  ]);
  const business = kind === 'approval' ? approval : engineering;
  const appId = kind === 'approval' ? 'order-approval' : 'domainharness-engineering';
  const submission = {
    rootPackageId: `app:v08:${appId}`,
    packages: [
      {
        packageId: kernel.MODULE_ID, kind: 'kernel', abiVersion: kernel.ABI_VERSION,
        modulePath: 'modules/kernel.mjs', moduleSource: kBytes,
        endpoints: kernel.ENDPOINTS,
      },
      {
        packageId: sdk.MODULE_ID, kind: 'standard-sdk', abiVersion: sdk.ABI_VERSION,
        modulePath: 'modules/standard.mjs', moduleSource: sBytes,
        endpoints: sdk.ENDPOINTS,
      },
      {
        packageId: business.MODULE_ID, kind: 'business', abiVersion: business.ABI_VERSION,
        modulePath: 'modules/business.mjs', moduleSource: bBytes,
        endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES,
      },
    ],
    bindings: [
      { role: 'kernel', packageId: kernel.MODULE_ID, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk', packageId: sdk.MODULE_ID, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business', packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0].endpointId },
      ...business.INTENT_TYPES.map((intentType: string) => ({
        role: 'intent', intentType,
        packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const sources = new Map(submission.packages.map((item) => [item.modulePath, item.moduleSource]));
  const approvalProof = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: ISSUER, issuerSecret: SECRET,
    issuedAt: '2026-10-12T00:00:00.000Z',
  });
  const root = buildQualifiedPackage({
    unsigned,
    approval: approvalProof,
    trustedIssuers: new Map([[ISSUER, SECRET]]),
    moduleSources: sources,
    baseCommit: 'pr-1012@9f6aaf4',
  });
  return { root, unsigned, sources };
}

test('V08-TF-D3-SHARED-P01b: independently BUILDed D2/D3 roots pin byte-identical K/S and byte-different Business', async () => {
  const a = await sealedApp('approval');
  const e = await sealedApp('engineering');
  assert.equal(a.root.formatVersion, 'dhpkg/v8-qualified-root/1');
  assert.equal(e.root.formatVersion, 'dhpkg/v8-qualified-root/1');

  const byKind = (root: typeof a.root, kindValue: string) =>
    root.packages.find((pkg: any) => pkg.kind === kindValue)!;
  for (const kindValue of ['kernel', 'standard-sdk']) {
    const left = byKind(a.root, kindValue);
    const right = byKind(e.root, kindValue);
    assert.equal(left.moduleSha256, right.moduleSha256);
    assert.equal(left.moduleSource, right.moduleSource);
    assert.equal(left.packageId, right.packageId);
  }
  // The pinned K/S digests are the digests of the exact physical files whose
  // modules executed in the runtime tests above.
  assert.equal(byKind(e.root, 'kernel').moduleSha256, KERNEL_SHA256);
  assert.equal(byKind(e.root, 'standard-sdk').moduleSha256, SDK_SHA256);
  // The Business packages — and therefore the whole closure — differ.
  assert.notEqual(byKind(a.root, 'business').moduleSha256, byKind(e.root, 'business').moduleSha256);
  assert.notEqual(a.root.build.closureDigest, e.root.build.closureDigest);
  assert.notEqual(a.root.rootPackageId, e.root.rootPackageId);
  assert.equal(Object.isFrozen(a.root), true);
  assert.equal(Object.isFrozen(e.root), true);
});

// ===========================================================================
// SHARED-N01 — a substituted Kernel digest cannot install and cannot replay
// durable D3 evidence records.
// ===========================================================================

test('V08-TF-D3-SHARED-N01: a substituted Kernel digest refuses to seal and cannot replay durable D3 evidence', async () => {
  // (a) BUILD path: post-approval Kernel byte substitution cannot seal.
  const app = await sealedApp('engineering');
  const substituted = new Map(app.sources);
  substituted.set('modules/kernel.mjs', KERNEL_V2_SOURCE);
  assert.throws(
    () => buildQualifiedPackage({
      unsigned: app.unsigned,
      approval: (app.root as any).approval,
      trustedIssuers: new Map([[ISSUER, SECRET]]),
      moduleSources: substituted,
    }),
    (error: unknown) => error instanceof BuildError && error.code === 'BUILD_SUBJECT_DRIFT',
  );

  // (b) Runtime path: a DIFFERENT kernel module identity cannot replay the
  // durable evidence records a real D3 runtime already wrote — the journal
  // pins them to the exact kernel digest and refuses typed.
  const { runtime, host } = await openedEngineering();
  const review = await submit(runtime, 'reviewChange', reviewInput(), 'reviewer');
  assert.equal(review.status, 'admitted');
  const original = (await runtime.getJournalRecords())[0] as any;
  const foreignJournal = new kernel.KernelDurableEffectJournal(host.docs, KERNEL_V2_SHA256, undefined);
  const replayRecord = {
    effectId: original.effectId,
    target: original.target,
    durableControlTurnId: original.durableControlTurnId,
    operationOrdinal: original.operationOrdinal,
    effectType: original.effectType,
    effectSemantics: original.effectSemantics,
    status: 'started',
    attempt: 1,
    input: original.input,
    idempotencyKey: original.idempotencyKey,
    startedAt: original.startedAt,
  };
  await assert.rejects(
    foreignJournal.beginEffect(replayRecord),
    (error: unknown) => {
      const typed = error as { name?: string; code?: string; message?: string };
      return typed?.name === 'CentralAdmissionError'
        && typed?.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT'
        && /no silent cross-version replay/.test(String(typed?.message));
    },
  );
  // The honest kernel identity still reads its own completed record untouched.
  const honestJournal = new kernel.KernelDurableEffectJournal(host.docs, KERNEL_SHA256, undefined);
  assert.equal((await honestJournal.getEffect(original.effectId))?.status, 'completed');
});
