/**
 * #1005 D3-K — selected Kernel declarative state-context projection.
 * ===================================================================
 *
 * Contract tests for the PHYSICAL selected Kernel payload (imported from
 * its exact sealed bytes) composed with the PHYSICAL selected Standard SDK
 * `interpret` (also from its exact bytes). Accepted minimal design:
 * #1005@6130149429, unlocked by #1005@6151644929 after FR07-KH2 (#1025).
 *
 * A Business transition may declare a data-only `contextProjection`:
 * sanctioned fields of the admitted event/decision (inside the rule's own
 * authorized payload projection) that K writes into the NEXT committed
 * instance context — inside the SAME state CAS commit that moves the state,
 * after guard/invariant admission and BEFORE any Journal/Effect. Projected
 * lineage fields are write-once: a later stage may only re-project the
 * identical committed value. Business guards then compare each new event to
 * the durably committed lineage (`context` operands).
 *
 *   D3-P1   same lineage review(A,a) → validation(A,V1,a) → release(A,V1,a)
 *           reaches release-qualified; the committed context carries
 *           changeId/reviewedSha/validationId/testedSha across stages.
 *   D3-N1   review(A,a) → validation(B,…) and → validation(A,…,b) deny with
 *           zero State/Journal/Effect.
 *   D3-N2   validation(A,V1,a) → release(B|V2|b) deny with zero residue.
 *   D3-N3   missing / mistyped projected evidence fails typed before any
 *           Journal/Effect; nothing is committed.
 *   D3-N4   write-once K lineage: a guard-less Business cannot relink a
 *           committed changeId (K denies `context-projection-conflict`).
 *   D3-N5   wiring: hostile / unauthorized / reserved projection
 *           declarations fail typed at the trusted load boundary.
 *   D3-N6   post-wiring mutation is ignored; deleting the live property
 *           after wiring keeps the frozen snapshot authoritative; injected
 *           projection syntax on an unwired transition refuses typed.
 *   D3-R1   crash after effect before the state CAS → replay re-drives from
 *           the Journal (no second dispatch) and commits the lineage once.
 *   D3-R2   UNKNOWN (effect dispatched, terminal unknown) → retry is
 *           AMBIGUOUS, exactly one dispatch, no state/lineage commit.
 *   D3-R3   replaying an already-committed stage message is refused with no
 *           extra dispatch and no lineage change.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readPayload(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/qualified-package/payload/${name}`, import.meta.url)), 'utf8');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function importSource(source: string): Promise<Record<string, any>> {
  return import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
}

const KERNEL_SOURCE = readPayload('kernel-mechanism-v1.mjs');
const kernel = await importSource(KERNEL_SOURCE);
const sdk = await importSource(readPayload('standard-sdk-v1.mjs'));

const NOW = '2026-10-14T00:00:00.000Z';
const TARGET = { workflowId: 'domainharness-engineering', instanceKey: 'change:42' };
const INSTANCE_DOC = `v08-kernel:wf-instance:${TARGET.workflowId}:${TARGET.instanceKey}`;
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';

// ---------------------------------------------------------------------------
// FIXTURE Host primitives (TEST ONLY; the physical SQLite proof is the
// domain-harness v08-integration D3 files).
// ---------------------------------------------------------------------------

function memoryHost() {
  const docs = new Map<string, { value: any; revision: number }>();
  const puts: string[] = [];
  const faults: { putKeyIncludes?: string; resourceTerminal?: boolean } = {};
  const clone = (value: any) => JSON.parse(JSON.stringify(value));
  const resourceCalls: any[] = [];
  return {
    puts,
    faults,
    resourceCalls,
    docsMap: docs,
    ports: {
      docs: {
        async get(key: string) {
          const doc = docs.get(key);
          return doc === undefined ? null : { value: clone(doc.value), revision: doc.revision };
        },
        async put(key: string, value: any, conditions: Record<string, unknown> = {}) {
          if (faults.putKeyIncludes !== undefined && key.includes(faults.putKeyIncludes)) {
            faults.putKeyIncludes = undefined;
            throw Object.assign(new Error(`host storage physically faulted during write of ${key}`), { code: 'HOST_FAULT_INJECTED' });
          }
          const existing = docs.get(key);
          if (conditions.mustBeAbsent === true && existing !== undefined) {
            throw Object.assign(new Error(`host doc ${key} exists`), { code: 'HOST_KEY_EXISTS' });
          }
          if (conditions.mustMatchRevision !== undefined && existing?.revision !== conditions.mustMatchRevision) {
            throw Object.assign(new Error(`host doc ${key} CAS conflict`), { code: 'HOST_CAS_CONFLICT' });
          }
          const revision = existing === undefined ? 0 : existing.revision + 1;
          docs.set(key, { value: clone(value), revision });
          puts.push(key);
          return { revision };
        },
        async list(prefix: string) {
          return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort();
        },
      },
      sha256: { async digestUtf8(value: string) { return sha256Hex(value); } },
      resources: {
        async call(resourceKey: string, operation: string, payload: any) {
          resourceCalls.push({ resourceKey, operation, payload });
          return { recorded: true, effectId: payload.effectId };
        },
      },
      clock: () => NOW,
    },
  };
}

// ---------------------------------------------------------------------------
// FIXTURE D3 Business policy: the engineering lifecycle with lineage guards
// over committed context and per-stage contextProjection declarations.
// ---------------------------------------------------------------------------

const ev = (key: string) => ({ source: 'event', path: ['payload', key] });
const ctx = (key: string) => ({ source: 'context', path: [key] });
const lit = (value: unknown) => ({ source: 'literal', value });
const eq = (left: unknown, right: unknown) => ({ op: 'eq', left, right });
const proj = (key: string, type = 'string') => ({ source: 'event', path: ['payload', key], type });

function guards(withLineage: boolean) {
  return [
    {
      guardId: 'guard:review-approved',
      predicate: { op: 'all', predicates: [eq(ev('reviewApproved'), lit(true)), { op: 'exists', operand: ev('changeId') }] },
    },
    {
      guardId: 'guard:validation-passed',
      predicate: { op: 'all', predicates: [
        eq(ev('testsPassed'), lit(true)),
        { op: 'exists', operand: ev('validationId') },
        ...(withLineage ? [eq(ev('changeId'), ctx('changeId')), eq(ev('testedSha'), ctx('reviewedSha'))] : []),
      ] },
    },
    {
      guardId: 'guard:release-qualified',
      predicate: { op: 'all', predicates: [
        eq(ev('releaseApproved'), lit(true)),
        ...(withLineage ? [
          eq(ev('changeId'), ctx('changeId')),
          eq(ev('validationId'), ctx('validationId')),
          eq(ev('testedSha'), ctx('testedSha')),
          eq(ev('qualifiedSha'), ctx('testedSha')),
        ] : []),
      ] },
    },
  ];
}

function evidenceIntent(stage: string) {
  return {
    effectType: 'effect:record-evidence',
    inputFrom: { changeId: ev('changeId') },
    idempotencyKeyFrom: { template: `engineering:${stage}:{changeId}` },
  };
}

function policy(options: { withLineage?: boolean; projections?: Record<string, unknown> } = {}) {
  const withLineage = options.withLineage ?? true;
  const projections: Record<string, unknown> = options.projections ?? {
    review: { changeId: proj('changeId'), reviewedSha: proj('reviewedSha') },
    validate: { changeId: proj('changeId'), validationId: proj('validationId'), testedSha: proj('testedSha') },
    qualify: { qualifiedSha: proj('qualifiedSha') },
  };
  const transition = (transitionKey: string, eventType: string, targetState: string, guardId: string) => ({
    transitionKey,
    trigger: { kind: 'event', eventType },
    targetState,
    guardId,
    effectIntents: [evidenceIntent(transitionKey)],
    ...(projections[transitionKey] === undefined ? {} : { contextProjection: projections[transitionKey] }),
  });
  const review = { stateKey: 'change-proposed', transitions: [transition('review', 'CHANGE_REVIEWED', 'reviewed', 'guard:review-approved')] };
  const validate = { stateKey: 'reviewed', transitions: [transition('validate', 'VALIDATION_PASSED', 'validation-passed', 'guard:validation-passed')] };
  const qualify = { stateKey: 'validation-passed', transitions: [transition('qualify', 'RELEASE_QUALIFIED', 'release-qualified', 'guard:release-qualified')] };
  const stage = (current: any, targetKey: string, final = false) => ({
    workflowKey: 'domainharness-engineering',
    initialState: 'change-proposed',
    initialContext: {},
    guards: guards(withLineage),
    states: [current, { stateKey: targetKey, ...(final ? { kind: 'final' } : {}) }],
  });
  const rule = (ruleId: string, eventType: string, keys: string[]) => ({
    ruleId, eventType, payloadFromInput: Object.fromEntries(keys.map((key) => [key, key])),
  });
  return {
    packageId: 'business-d3-unit@v08.1.0.0',
    policyId: 'd3-unit',
    domainId: 'domainharness-engineering',
    workflowDefinition: stage(review, 'reviewed'),
    decisionSchema: { isValid: (value: any) => typeof value?.decision?.outcome === 'string' && typeof value?.event?.type === 'string' },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'change-proposed',
    initialContext: {},
    rules: {
      'rule:review': rule('rule:review', 'CHANGE_REVIEWED', ['changeId', 'reviewedSha', 'reviewApproved']),
      'rule:validate': rule('rule:validate', 'VALIDATION_PASSED', ['changeId', 'validationId', 'testedSha', 'testsPassed']),
      'rule:qualify': rule('rule:qualify', 'RELEASE_QUALIFIED', ['changeId', 'validationId', 'testedSha', 'qualifiedSha', 'releaseApproved']),
    },
    intentBindings: {
      reviewChange: { trigger: { kind: 'event', eventType: 'CHANGE_REVIEWED' }, ruleId: 'rule:review', definition: stage(review, 'reviewed') },
      recordValidation: { trigger: { kind: 'event', eventType: 'VALIDATION_PASSED' }, ruleId: 'rule:validate', definition: stage(validate, 'validation-passed') },
      qualifyRelease: { trigger: { kind: 'event', eventType: 'RELEASE_QUALIFIED' }, ruleId: 'rule:qualify', definition: stage(qualify, 'release-qualified', true) },
    },
    effectBindings: {
      'effect:record-evidence': {
        semantics: 'non-idempotent',
        handler: async ({ input, effectId, resources }: any) => resources.call('engineering-evidence', 'append', { ...input, effectId }),
      },
    },
  };
}

function runtime(businessPolicy: any, host = memoryHost()) {
  const rt = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: sha256Hex(KERNEL_SOURCE) },
    hostPorts: host.ports,
    sdkEndpoint: { packageId: sdk.MODULE_ID, interpret: sdk.interpret },
    businessEndpoint: businessPolicy,
  });
  return { rt, host };
}

async function opened(businessPolicy = policy()) {
  const built = runtime(businessPolicy);
  await built.rt.openInstance({ target: TARGET, authorityClass: 'PRODUCTION' });
  return built;
}

const REVIEW_A = { changeId: 'A', reviewedSha: 'sha-a', reviewApproved: true };
const VALIDATION_A = { changeId: 'A', validationId: 'V1', testedSha: 'sha-a', testsPassed: true };
const RELEASE_A = { changeId: 'A', validationId: 'V1', testedSha: 'sha-a', qualifiedSha: 'sha-a', releaseApproved: true };

function submit(rt: any, intentType: string, messageId: string, input: Record<string, unknown>) {
  return rt.submitOccurrence({ intentType, messageId, target: TARGET, input });
}

async function committed(host: ReturnType<typeof memoryHost>) {
  const doc = host.docsMap.get(INSTANCE_DOC);
  return { stateKey: doc?.value.state.stateKey, context: doc?.value.state.context, revision: doc?.revision };
}

async function journalCount(host: ReturnType<typeof memoryHost>) {
  return (await host.ports.docs.list(JOURNAL_PREFIX)).length;
}

/** Zero State/Journal/Effect since `before`. */
async function assertUnchanged(host: ReturnType<typeof memoryHost>, before: { state: any; journal: number; calls: number }) {
  assert.deepEqual(await committed(host), before.state, 'state, lineage context and revision are unchanged');
  assert.equal(await journalCount(host), before.journal, 'no Journal record was written');
  assert.equal(host.resourceCalls.length, before.calls, 'no Effect was dispatched');
}

async function snapshotOf(host: ReturnType<typeof memoryHost>) {
  return { state: await committed(host), journal: await journalCount(host), calls: host.resourceCalls.length };
}

// ---------------------------------------------------------------------------
// Positive
// ---------------------------------------------------------------------------

test('D3-P1: same lineage review(A,a) → validation(A,V1,a) → release(A,V1,a) commits durable cross-stage lineage', async () => {
  const { rt, host } = await opened();
  const review = await submit(rt, 'reviewChange', 'm:review', REVIEW_A);
  assert.equal(review.status, 'admitted');
  assert.deepEqual(review.admitted.contextProjection, { changeId: 'A', reviewedSha: 'sha-a' });
  assert.deepEqual(await committed(host), { stateKey: 'reviewed', context: { changeId: 'A', reviewedSha: 'sha-a' }, revision: 1 });

  const validation = await submit(rt, 'recordValidation', 'm:validate', VALIDATION_A);
  assert.equal(validation.status, 'admitted');
  assert.deepEqual((await committed(host)).context, { changeId: 'A', reviewedSha: 'sha-a', validationId: 'V1', testedSha: 'sha-a' });

  const release = await submit(rt, 'qualifyRelease', 'm:release', RELEASE_A);
  assert.equal(release.status, 'admitted');
  assert.deepEqual(await committed(host), {
    stateKey: 'release-qualified',
    context: { changeId: 'A', reviewedSha: 'sha-a', validationId: 'V1', testedSha: 'sha-a', qualifiedSha: 'sha-a' },
    revision: 3,
  });
  assert.equal(await journalCount(host), 3);
  assert.equal(host.resourceCalls.length, 3);
});

// ---------------------------------------------------------------------------
// Cross-stage lineage negatives
// ---------------------------------------------------------------------------

test('D3-N1: review(A,a) → validation(B,…) and → validation(A,…,b) deny with zero State/Journal/Effect', async () => {
  const { rt, host } = await opened();
  await submit(rt, 'reviewChange', 'm:review', REVIEW_A);
  const before = await snapshotOf(host);
  for (const [messageId, input] of [
    ['m:validate-B', { ...VALIDATION_A, changeId: 'B' }],
    ['m:validate-b', { ...VALIDATION_A, testedSha: 'sha-b' }],
  ] as const) {
    const receipt = await submit(rt, 'recordValidation', messageId, input);
    assert.equal(receipt.status, 'denied', messageId);
    assert.equal(receipt.denial.reason, 'guard', messageId);
    await assertUnchanged(host, before);
  }
});

test('D3-N2: validation(A,V1,a) → release(B | V2 | b) deny with zero State/Journal/Effect', async () => {
  const { rt, host } = await opened();
  await submit(rt, 'reviewChange', 'm:review', REVIEW_A);
  await submit(rt, 'recordValidation', 'm:validate', VALIDATION_A);
  const before = await snapshotOf(host);
  for (const [messageId, input] of [
    ['m:release-B', { ...RELEASE_A, changeId: 'B' }],
    ['m:release-V2', { ...RELEASE_A, validationId: 'V2' }],
    ['m:release-b', { ...RELEASE_A, testedSha: 'sha-b', qualifiedSha: 'sha-b' }],
  ] as const) {
    const receipt = await submit(rt, 'qualifyRelease', messageId, input);
    assert.equal(receipt.status, 'denied', messageId);
    await assertUnchanged(host, before);
  }
  // The genuine same-lineage release still qualifies afterwards.
  assert.equal((await submit(rt, 'qualifyRelease', 'm:release', RELEASE_A)).status, 'admitted');
});

test('D3-N3: missing or mistyped projected evidence fails typed before any Journal/Effect', async () => {
  const { rt, host } = await opened();
  const before = await snapshotOf(host);
  // reviewedSha is absent from the intent: the selected S refuses the Rule
  // projection first (fail-closed before K ever admits).
  await assert.rejects(
    submit(rt, 'reviewChange', 'm:review-missing', { changeId: 'A', reviewApproved: true }),
    (error: { code?: string }) => error.code === 'SDK_PROJECTION_MISSING',
  );
  await assertUnchanged(host, before);
  // reviewedSha is declared type string; a number is not lineage evidence.
  await assert.rejects(
    submit(rt, 'reviewChange', 'm:review-mistyped', { ...REVIEW_A, reviewedSha: 42 }),
    (error: { code?: string }) => error.code === 'ADMISSION_CONTEXT_PROJECTION_UNRESOLVED',
  );
  await assertUnchanged(host, before);
});

test('D3-N4: write-once K lineage — even without lineage guards a committed changeId cannot be relinked', async () => {
  const { rt, host } = await opened(policy({ withLineage: false }));
  await submit(rt, 'reviewChange', 'm:review', REVIEW_A);
  const before = await snapshotOf(host);
  const receipt = await submit(rt, 'recordValidation', 'm:validate-B', { ...VALIDATION_A, changeId: 'B' });
  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'context-projection-conflict');
  assert.equal(receipt.denial.contextField, 'changeId');
  await assertUnchanged(host, before);
  // Re-projecting the identical committed value is not a conflict.
  assert.equal((await submit(rt, 'recordValidation', 'm:validate', VALIDATION_A)).status, 'admitted');
});

test('D3-N3b: a K-resolved projection whose source field is absent on the admitted event fails typed pre-effect', async () => {
  // An SDK endpoint whose (schema-valid) event omits the projected payload
  // field: K itself must refuse, independent of S projection discipline.
  const businessPolicy = policy({ withLineage: false });
  const host = memoryHost();
  const rt = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256: sha256Hex(KERNEL_SOURCE) },
    hostPorts: host.ports,
    sdkEndpoint: {
      packageId: 'sparse-sdk',
      interpret: () => ({
        source: 'harness-machine',
        llmAvoided: true,
        structuredDecision: { decision: { outcome: 'decide', data: {} }, event: { type: 'CHANGE_REVIEWED', payload: { changeId: 'A', reviewApproved: true } } },
        cacheDisposition: { read: 'disabled' },
        telemetry: [],
      }),
    },
    businessEndpoint: businessPolicy,
  });
  await rt.openInstance({ target: TARGET, authorityClass: 'PRODUCTION' });
  const before = await snapshotOf(host);
  await assert.rejects(
    submit(rt, 'reviewChange', 'm:review-sparse', REVIEW_A),
    (error: { code?: string }) => error.code === 'ADMISSION_CONTEXT_PROJECTION_UNRESOLVED',
  );
  await assertUnchanged(host, before);
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

test('D3-N5: hostile / unauthorized / reserved projection declarations fail typed at wiring', () => {
  const bad: Record<string, unknown>[] = [
    { review: 'changeId' },
    { review: {} },
    { review: { __proto__x: proj('changeId'), 'bad key': proj('changeId') } },
    { review: { callerRole: proj('changeId') } },
    { review: { changeId: { source: 'context', path: ['changeId'] } } },
    { review: { changeId: { source: 'event', path: ['payload', 'validationId'] } } },
    { review: { changeId: { source: 'event', path: ['payload'] } } },
    { review: { changeId: { source: 'event', path: ['payload', 'changeId'], type: 'date' } } },
    { review: { changeId: { source: 'event', path: ['payload', 'changeId'], extra: true } } },
  ];
  for (const projections of bad) {
    const host = memoryHost();
    assert.throws(
      () => runtime(policy({ projections }), host),
      (error: { code?: string }) => error.code === 'ADMISSION_CONTEXT_PROJECTION_INVALID',
      JSON.stringify(projections),
    );
    assert.equal(host.puts.length, 0, 'no instance or journal exists');
  }
  // Decision-shape projections inside the authorized key set are accepted.
  assert.doesNotThrow(() => runtime(policy({ projections: { review: { changeId: { source: 'decision', path: ['data', 'changeId'] } } } })));
});

test('D3-N6: post-wiring mutation and property deletion are ignored; injected projection on an unwired transition refuses typed', async () => {
  const businessPolicy = policy();
  const { rt, host } = await opened(businessPolicy);
  const reviewTransition = (businessPolicy.intentBindings.reviewChange.definition as any).states[0].transitions[0];
  reviewTransition.contextProjection.reviewedSha = proj('reviewApproved', 'boolean');
  reviewTransition.contextProjection.injected = proj('changeId');
  await submit(rt, 'reviewChange', 'm:review', REVIEW_A);
  assert.deepEqual((await committed(host)).context, { changeId: 'A', reviewedSha: 'sha-a' }, 'the wiring snapshot is authoritative');

  // [#1005 D3-K R2 — review #5508191410 P1] A live property deleted after
  // wiring must not bypass the wiring-time frozen projection: the pinned
  // lineage still commits by the same state CAS.
  const deleted = policy();
  const wired = await opened(deleted);
  const deletedTransition = (deleted.intentBindings.reviewChange.definition as any).states[0].transitions[0];
  delete deletedTransition.contextProjection;
  const deletedReceipt = await submit(wired.rt, 'reviewChange', 'm:review', REVIEW_A);
  assert.equal(deletedReceipt.status, 'admitted');
  assert.deepEqual(deletedReceipt.admitted.contextProjection, { changeId: 'A', reviewedSha: 'sha-a' }, 'the frozen snapshot is resolved despite the deleted live property');
  assert.deepEqual(await committed(wired.host), { stateKey: 'reviewed', context: { changeId: 'A', reviewedSha: 'sha-a' }, revision: 1 }, 'the pinned changeId/reviewedSha lineage commits');
  assert.equal(await journalCount(wired.host), 1);
  assert.equal(wired.host.resourceCalls.length, 1);

  const unwired = policy({ projections: {} });
  const second = await opened(unwired);
  (unwired.intentBindings.reviewChange.definition as any).states[0].transitions[0].contextProjection = { changeId: proj('changeId') };
  const before = await snapshotOf(second.host);
  await assert.rejects(
    submit(second.rt, 'reviewChange', 'm:review', REVIEW_A),
    (error: { code?: string }) => error.code === 'ADMISSION_CONTEXT_PROJECTION_UNVALIDATED',
  );
  await assertUnchanged(second.host, before);
});

// ---------------------------------------------------------------------------
// Replay / UNKNOWN — the projection rides the existing CAS + Journal boundary
// ---------------------------------------------------------------------------

test('D3-R1: crash after the effect, before the state CAS → replay re-drives from the Journal and commits the lineage once', async () => {
  const { rt, host } = await opened();
  host.faults.putKeyIncludes = 'wf-instance';
  await assert.rejects(submit(rt, 'reviewChange', 'm:review', REVIEW_A));
  assert.deepEqual(await committed(host), { stateKey: 'change-proposed', context: {}, revision: 0 }, 'nothing committed by the crashed turn');
  assert.equal(host.resourceCalls.length, 1);

  const replay = await submit(rt, 'reviewChange', 'm:review', REVIEW_A);
  assert.equal(replay.status, 'admitted');
  assert.equal(host.resourceCalls.length, 1, 'the journaled effect is not dispatched twice');
  assert.deepEqual(await committed(host), { stateKey: 'reviewed', context: { changeId: 'A', reviewedSha: 'sha-a' }, revision: 1 });
});

test('D3-R2: UNKNOWN effect terminal → retry is AMBIGUOUS, exactly one dispatch, no state/lineage commit', async () => {
  const { rt, host } = await opened();
  await submit(rt, 'reviewChange', 'm:review', REVIEW_A);
  await submit(rt, 'recordValidation', 'm:validate', VALIDATION_A);
  const callsBefore = host.resourceCalls.length;
  const stateBefore = await committed(host);
  // Fault the journal TERMINAL write: the begin succeeds, the effect dispatches, completion faults.
  let journalWrites = 0;
  const originalPut = host.ports.docs.put;
  host.ports.docs.put = async (key: string, value: any, conditions?: Record<string, unknown>) => {
    if (key.startsWith(JOURNAL_PREFIX)) {
      journalWrites += 1;
      if (journalWrites === 2) throw Object.assign(new Error('host fault after dispatch'), { code: 'HOST_FAULT_INJECTED' });
    }
    return originalPut(key, value, conditions);
  };
  await assert.rejects(submit(rt, 'qualifyRelease', 'm:release', RELEASE_A));
  host.ports.docs.put = originalPut;
  await assert.rejects(
    submit(rt, 'qualifyRelease', 'm:release', RELEASE_A),
    (error: { code?: string }) => error.code === 'ADMISSION_EFFECT_AMBIGUOUS',
  );
  assert.equal(host.resourceCalls.length - callsBefore, 1, 'exactly one physical dispatch');
  assert.deepEqual(await committed(host), stateBefore, 'no state or lineage commit under UNKNOWN');
});

test('D3-R3: replaying an already-committed stage message replays its ACK with no extra dispatch and no lineage change', async () => {
  const { rt, host } = await opened();
  await submit(rt, 'reviewChange', 'm:review', REVIEW_A);
  const before = await snapshotOf(host);
  // [v0.8.1 R01] the durable message-turn disposition answers the re-send:
  // the forged payload under the committed messageId is never admitted.
  const replay = await submit(rt, 'reviewChange', 'm:review', { ...REVIEW_A, reviewedSha: 'sha-forged' });
  assert.equal(replay.status, 'admitted');
  assert.equal(replay.idempotentReplay, true);
  await assertUnchanged(host, before);
});
