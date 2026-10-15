/**
 * #1062 — the shared NON-message durable control turn seam of the selected
 * Kernel payload (timer / callback / child-terminal sources).
 * =====================================================================
 *
 * Contract tests for the PHYSICAL kernel payload bytes (data-URL import,
 * installer discipline) covering the K-local seam boundaries that are
 * cheaper to falsify here than through the Host gateway:
 *
 *   - occurrenceTurnOf: a trusted-seam turnSource replaces the hard-coded
 *     message source at EVERY in-payload turn-id derivation site; the ids
 *     are deterministic and source-distinct (timer/callback/child-terminal);
 *   - strictTurnSource: exact shape — extra fields, missing fields,
 *     non-positive ordinals, bad terminalKind, kind 'message'/unknown all
 *     fail typed ADMISSION_INVALID_TURN_SOURCE BEFORE any
 *     State/Journal/Effect activity. [#1006 HF16] a WELL-FORMED recovery
 *     source is shape-admitted at this seam (the Host coordinator's durable
 *     CAS-authorized recovery-action record is the authorization
 *     credential; malformed recovery shapes still refuse typed here);
 *   - turn disposition: a replay of the SAME non-message source replays the
 *     stored receipt (idempotentReplay, zero new state revision, zero new
 *     effect execution); the SAME source under a DIFFERENT intentType
 *     refuses typed ADMISSION_TURN_DISPOSITION_CONFLICT before admission;
 *   - the honest UNKNOWN window: a disposition create that fails after the
 *     authoritative state CAS is reported not_recorded (the ACK stays
 *     admitted), and a replay of that turn CANNOT double the terminal
 *     State/Effect (terminal state → no-candidate denial; the effect
 *     journal is untouched) — atomicity is never claimed.
 *
 * The physical Host/SQLite/gateway journey (HF18/HF32 frozen P/N) lives in
 * packages/domain-harness/tests/v08-integration/.
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
const SDK_SOURCE = readPayload('standard-sdk-v1.mjs');
const kernel = await importSource(KERNEL_SOURCE);
const sdk = await importSource(SDK_SOURCE);

const NOW = '2026-10-15T00:00:00.000Z';
const WORKFLOW_KEY = 'turn-seam';
const TARGET = { workflowId: WORKFLOW_KEY, instanceKey: 'unit:1' };

function component(value: string): string {
  return encodeURIComponent(value);
}

// ---------------------------------------------------------------------------
// FIXTURE Host primitives (TEST ONLY — the physical SQLite proof is the
// domain-harness v08-integration HF18/HF32 file).
// ---------------------------------------------------------------------------

interface MemoryDocs {
  get(key: string): Promise<{ value: any; revision: number } | null>;
  put(key: string, value: any, conditions?: Record<string, unknown>): Promise<{ revision: number }>;
  list(prefix: string): Promise<readonly string[]>;
  /** Test injection: fail the NEXT put whose key matches the prefix once. */
  failNextPutOn(prefix: string): void;
}

function memoryDocs(): MemoryDocs {
  const docs = new Map<string, { value: any; revision: number }>();
  let failPrefix: string | undefined;
  return {
    failNextPutOn(prefix: string): void {
      failPrefix = prefix;
    },
    async get(key: string) {
      const doc = docs.get(key);
      return doc === undefined ? null : { value: JSON.parse(JSON.stringify(doc.value)), revision: doc.revision };
    },
    async put(key: string, value: any, conditions: Record<string, unknown> = {}) {
      if (failPrefix !== undefined && key.startsWith(failPrefix)) {
        failPrefix = undefined;
        throw Object.assign(new Error(`injected store failure for ${key}`), { code: 'HOST_STORE_INJECTED_FAILURE' });
      }
      const existing = docs.get(key);
      if (conditions.mustBeAbsent === true && existing !== undefined) {
        throw Object.assign(new Error(`host doc ${key} exists`), { code: 'HOST_KEY_EXISTS' });
      }
      if (conditions.mustMatchRevision !== undefined && existing?.revision !== conditions.mustMatchRevision) {
        throw Object.assign(new Error(`host doc ${key} CAS conflict`), { code: 'HOST_CAS_CONFLICT' });
      }
      const revision = existing === undefined ? 0 : existing.revision + 1;
      docs.set(key, { value: JSON.parse(JSON.stringify(value)), revision });
      return { revision };
    },
    async list(prefix: string) {
      return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

function hostPorts(docs: MemoryDocs = memoryDocs()) {
  const resourceCalls: unknown[] = [];
  return {
    docs,
    resourceCalls,
    sha256: { digestUtf8(value: string) { return sha256Hex(value); } },
    resources: {
      async call(_resourceKey: string, _operation: string, payload: unknown) {
        resourceCalls.push(payload);
        return { reserved: true };
      },
    },
    clock: () => NOW,
  };
}

function sdkEndpoint(): { packageId: string; interpret: (declaration: unknown, input: unknown, context: unknown) => unknown } {
  return { packageId: sdk.MODULE_ID as string, interpret: (declaration, input, context) => sdk.interpret(declaration, input, context) };
}

const definition = {
  workflowKey: WORKFLOW_KEY,
  initialState: 'review',
  initialContext: {},
  guards: [{ guardId: 'guard:ok', predicate: { op: 'constant', value: true } }],
  states: [
    {
      stateKey: 'review',
      transitions: [
        { transitionKey: 'wait', trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' }, targetState: 'waiting', guardId: 'guard:ok', effectIntents: [] },
      ],
    },
    {
      stateKey: 'waiting',
      transitions: [
        {
          transitionKey: 'resume',
          trigger: { kind: 'event', eventType: 'RESUME_EVENT' },
          targetState: 'resumed',
          guardId: 'guard:ok',
          effectIntents: [{ effectType: 'effect:reserve', input: { reservation: 'seam' }, idempotencyKey: 'reserve:seam:1' }],
        },
      ],
    },
    { stateKey: 'resumed', kind: 'final' },
  ],
};

function businessPolicy() {
  return {
    packageId: 'business-turn-seam@v08.1.0.0',
    policyId: 'turn-seam',
    domainId: 'orders',
    workflowDefinition: definition,
    decisionSchema: { isValid: (value: any) => typeof value?.decision?.outcome === 'string' && typeof value?.event?.type === 'string' },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:wait': { ruleId: 'rule:wait', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
      'rule:resume': { ruleId: 'rule:resume', eventType: 'RESUME_EVENT', payloadFromInput: { amount: 'amount' } },
    },
    intentBindings: {
      submitWait: { trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' }, ruleId: 'rule:wait', roles: ['requester'] },
      submitResume: { trigger: { kind: 'event', eventType: 'RESUME_EVENT' }, ruleId: 'rule:resume', roles: ['requester'] },
      submitResumeAlt: { trigger: { kind: 'event', eventType: 'RESUME_EVENT' }, ruleId: 'rule:resume', roles: ['requester'] },
    },
    effectBindings: {
      'effect:reserve': {
        semantics: 'idempotent',
        resource: { key: 'ledger', operation: 'reserve' },
        handler: async ({ input, resources }: any) => resources.call('ledger', 'reserve', { ...input }),
      },
    },
  };
}

function runtime(policy: any, ports: ReturnType<typeof hostPorts>) {
  return kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID as string, moduleSha256: sha256Hex(KERNEL_SOURCE) },
    hostPorts: ports,
    sdkEndpoint: sdkEndpoint(),
    businessEndpoint: policy,
  });
}

async function freshInstance(rt: any): Promise<void> {
  await rt.openInstance({ target: TARGET });
}

async function submitWait(rt: any, messageId: string): Promise<any> {
  return rt.submitOccurrence({
    target: TARGET,
    intentType: 'submitWait',
    messageId,
    input: { amount: 5 },
    caller: { role: 'requester' },
  });
}

function callbackRequest(intentType: string, turnSource: unknown, messageId: string, input: unknown = { amount: 7 }): any {
  return {
    target: TARGET,
    intentType,
    messageId,
    input,
    caller: { role: 'requester' },
    turnSource,
  };
}

const CALLBACK_SOURCE = { kind: 'callback', externalCorrelationId: 'corr-1', callbackOrdinal: 1 };
const TIMER_SOURCE = { kind: 'timer', timerId: 'timer-1', fireOrdinal: 1 };
const CHILD_SOURCE = { kind: 'child-terminal', parentActorId: 'parent-1', childActorId: 'child-1', invocationOrdinal: 3, terminalKind: 'done' };

function expectedTurnId(source: unknown): string {
  const base = `turn:${component(WORKFLOW_KEY)}:${component(TARGET.instanceKey)}`;
  const s = source as any;
  switch (s.kind) {
    case 'message': return `${base}:message:${component(s.sourceMessageId)}`;
    case 'callback': return `${base}:callback:${component(s.externalCorrelationId)}:${s.callbackOrdinal}`;
    case 'timer': return `${base}:timer:${component(s.timerId)}:${s.fireOrdinal}`;
    case 'child-terminal': return `${base}:child:${component(s.parentActorId)}:${component(s.childActorId)}:${s.invocationOrdinal}:${s.terminalKind}`;
    default: throw new Error(`unexpected source ${JSON.stringify(source)}`);
  }
}

async function assertTyped(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code, `expected ${code}, got: ${String((error as Error)?.message ?? error)}`);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Deterministic non-message turn identity through the real admission path
// ---------------------------------------------------------------------------

test('turn-source P: callback/timer/child-terminal sources admit turns with deterministic distinct ids', async () => {
  const ports = hostPorts();
  const rt = runtime(businessPolicy(), ports);
  await freshInstance(rt);
  await submitWait(rt, 'm-wait-1');

  const callback = await rt.submitOccurrence(callbackRequest('submitResume', CALLBACK_SOURCE, 'ctrl:callback:corr-1:1'));
  assert.equal(callback.status, 'admitted');
  assert.equal(callback.admitted.durableControlTurnId, expectedTurnId(CALLBACK_SOURCE));
  assert.equal(callback.instance.state.stateKey, 'resumed');
  assert.equal(callback.turnDisposition.status, 'recorded');
  assert.equal(ports.resourceCalls.length, 1, 'exactly one effect execution for the callback turn');
});

test('turn-source P: the same source replayed is an idempotent replay with zero new state/effect', async () => {
  const ports = hostPorts();
  const rt = runtime(businessPolicy(), ports);
  await freshInstance(rt);
  await submitWait(rt, 'm-wait-2');

  const first = await rt.submitOccurrence(callbackRequest('submitResume', CALLBACK_SOURCE, 'ctrl:callback:corr-1:1'));
  assert.equal(first.status, 'admitted');
  const revisionAfterFirst = first.instance.stateRevision;

  const replay = await rt.submitOccurrence(callbackRequest('submitResume', CALLBACK_SOURCE, 'ctrl:callback:corr-1:1'));
  assert.equal(replay.status, 'admitted');
  assert.equal((replay as { idempotentReplay?: boolean }).idempotentReplay, true);
  assert.equal(replay.instance.stateRevision, revisionAfterFirst, 'a replay commits no new state revision');
  assert.equal(ports.resourceCalls.length, 1, 'a replay executes no second effect');
  assert.equal(rt.counters.turnDispositionReplays, 1);
});

test('turn-source P: timer and child-terminal ids are deterministic and mutually distinct', async () => {
  assert.equal(kernel.deriveDurableControlTurnId(TARGET, TIMER_SOURCE), expectedTurnId(TIMER_SOURCE));
  assert.equal(kernel.deriveDurableControlTurnId(TARGET, CHILD_SOURCE), expectedTurnId(CHILD_SOURCE));
  const ids = new Set([
    kernel.deriveDurableControlTurnId(TARGET, TIMER_SOURCE),
    kernel.deriveDurableControlTurnId(TARGET, CHILD_SOURCE),
    kernel.deriveDurableControlTurnId(TARGET, { ...CHILD_SOURCE, terminalKind: 'error' }),
    kernel.deriveDurableControlTurnId(TARGET, CALLBACK_SOURCE),
    kernel.deriveDurableControlTurnId(TARGET, { kind: 'message', sourceMessageId: 'x' }),
  ]);
  assert.equal(ids.size, 5, 'distinct sources never collide');
});

// ---------------------------------------------------------------------------
// Strict shape refusal (before any admission activity)
// ---------------------------------------------------------------------------

test('turn-source N: malformed turn sources refuse typed before any mutation', async () => {
  const ports = hostPorts();
  const rt = runtime(businessPolicy(), ports);
  await freshInstance(rt);
  await submitWait(rt, 'm-wait-n1');
  const before = await rt.getSnapshot(TARGET);

  const bad = [
    { kind: 'callback', externalCorrelationId: 'c', callbackOrdinal: 1, extra: 1 },
    { kind: 'callback', externalCorrelationId: 'c' },
    { kind: 'callback', externalCorrelationId: 'c', callbackOrdinal: 0 },
    { kind: 'timer', timerId: 't', fireOrdinal: -1 },
    { kind: 'child-terminal', parentActorId: 'p', childActorId: 'c', invocationOrdinal: 1, terminalKind: 'crash' },
    { kind: 'message', sourceMessageId: 'm' },
    // [#1006 HF16] malformed recovery shapes still refuse typed; the
    // well-formed source is shape-admitted (its Host-side authorization is
    // the durable CAS record, asserted in the physical recovery suite).
    { kind: 'recovery', durableRecoveryActionId: 'r' },
    { kind: 'recovery', durableRecoveryActionId: 'r', resumeOrdinal: 0 },
    { kind: 'recovery', durableRecoveryActionId: 'r', resumeOrdinal: 1, extra: true },
    { kind: 'quantum' },
    'not-a-record',
  ];
  for (const [index, source] of bad.entries()) {
    await assertTyped(
      rt.submitOccurrence(callbackRequest('submitResume', source, `ctrl-bad-${index}`)),
      'ADMISSION_INVALID_TURN_SOURCE',
    );
  }
  const after = await rt.getSnapshot(TARGET);
  assert.equal(after.stateRevision, before.stateRevision, 'zero state mutation across every refusal');
  assert.equal(ports.resourceCalls.length, 0, 'zero effect execution across every refusal');
});

test('turn-source N: message turns are untouched (no turnSource, no disposition)', async () => {
  const ports = hostPorts();
  const rt = runtime(businessPolicy(), ports);
  await freshInstance(rt);
  const wait = await submitWait(rt, 'm-msg-1');
  assert.equal(wait.status, 'admitted');
  assert.equal(wait.admitted.durableControlTurnId, expectedTurnId({ kind: 'message', sourceMessageId: 'm-msg-1' }));
  assert.equal(wait.turnDisposition, undefined, 'message turns carry no turn disposition');
  const keys = await ports.docs.list('v08-kernel:turn-disposition:');
  assert.equal(keys.length, 0);
});

// ---------------------------------------------------------------------------
// One source is exactly one turn (intent collision) + the honest UNKNOWN
// window after a failed disposition create
// ---------------------------------------------------------------------------

test('turn-source N: the same source under a different intentType refuses typed before admission', async () => {
  const ports = hostPorts();
  const rt = runtime(businessPolicy(), ports);
  await freshInstance(rt);
  await submitWait(rt, 'm-wait-c1');

  const first = await rt.submitOccurrence(callbackRequest('submitResume', CALLBACK_SOURCE, 'ctrl:callback:corr-1:1'));
  assert.equal(first.status, 'admitted');
  const revision = first.instance.stateRevision;

  await assertTyped(
    rt.submitOccurrence(callbackRequest('submitResumeAlt', CALLBACK_SOURCE, 'ctrl:callback:corr-1:alt')),
    'ADMISSION_TURN_DISPOSITION_CONFLICT',
  );
  const after = await rt.getSnapshot(TARGET);
  assert.equal(after.stateRevision, revision, 'the colliding submission mutated nothing');
  assert.equal(ports.resourceCalls.length, 1);
});

test('turn-source N: honest UNKNOWN window — failed disposition create never doubles terminal state/effect', async () => {
  const ports = hostPorts();
  const rt = runtime(businessPolicy(), ports);
  await freshInstance(rt);
  await submitWait(rt, 'm-wait-u1');

  // Crash simulation: the disposition create (AFTER the authoritative state
  // CAS) fails once. The ACK stays admitted and reports not_recorded.
  ports.docs.failNextPutOn('v08-kernel:turn-disposition:');
  const first = await rt.submitOccurrence(callbackRequest('submitResume', CALLBACK_SOURCE, 'ctrl:callback:corr-1:1'));
  assert.equal(first.status, 'admitted');
  assert.equal(first.instance.state.stateKey, 'resumed');
  assert.equal(first.turnDisposition.status, 'not_recorded', 'the lost disposition is reported honestly');
  const revision = first.instance.stateRevision;
  assert.equal(ports.resourceCalls.length, 1);

  // [#1066 R1 P1-B] The healed replay finds no disposition record (the
  // UNKNOWN window) but the SAME-CAS admission history INSIDE the committed
  // instance document answers the once-only guarantee at the protocol
  // level: the re-submitted turn is recognized as already admitted with
  // ZERO new State/Journal/Effect activity — never again left to the
  // business state machine's refusal to mask the window.
  const replay = await rt.submitOccurrence(callbackRequest('submitResume', CALLBACK_SOURCE, 'ctrl:callback:corr-1:1'));
  assert.equal(replay.status, 'admitted', 'the replay is answered from the committed admission history');
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.turnAdmission.turnId, expectedTurnId(CALLBACK_SOURCE));
  const after = await rt.getSnapshot(TARGET);
  assert.equal(after.stateRevision, revision, 'terminal state is not doubled');
  assert.equal(after.state.stateKey, 'resumed');
  assert.equal(ports.resourceCalls.length, 1, 'no duplicate effect execution');

  // The replay heals the lost disposition observation: a THIRD delivery
  // now replays from the healed record itself.
  const third = await rt.submitOccurrence(callbackRequest('submitResume', CALLBACK_SOURCE, 'ctrl:callback:corr-1:1'));
  assert.equal(third.status, 'admitted');
  assert.equal(third.idempotentReplay, true);
  assert.equal((await rt.getSnapshot(TARGET)).stateRevision, revision, 'still not doubled');
  assert.equal(ports.resourceCalls.length, 1, 'still no duplicate effect execution');
});
