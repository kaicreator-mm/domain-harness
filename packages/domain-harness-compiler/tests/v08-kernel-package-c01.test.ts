/**
 * V08-ABI-C01 — selected Kernel Package authority, Effect and Journal CAS
 * (T-C, #1002).
 * =======================================================================
 *
 * Contract tests for the PHYSICAL selected Kernel Domain Package payload
 * `src/qualified-package/payload/kernel-mechanism-v1.mjs`
 * (`v08-kernel-abi/1`, T-A ABI @a835cab). The tests import the module from
 * its exact sealed BYTES (sha256 + data-URL import — the same discipline a
 * qualified-package installer uses), never from a build artifact.
 *
 * Coverage (issue #1002 L3 pack):
 *   - V08-ABI-C01-N1  THE P1-L2-CAS-01 falsifier: two competing trusted
 *                     same-effect terminal completions with DIFFERENT
 *                     outcomes — exactly one wins, the loser fails typed
 *                     (`ADMISSION_EFFECT_JOURNAL_CONFLICT`), and the
 *                     terminal write is a strongly conditional CAS
 *                     (`mustMatchRevision` integer, never undefined /
 *                     unconditional). RED against the #994 source defect
 *                     (`#readEnvelope` returned `doc.value` and dropped
 *                     `doc.revision`); GREEN after the `{value,revision}`
 *                     + conditional-CAS fix.
 *   - V08-ABI-C01-N2  competing same-outcome completions settle idempotently
 *                     to ONE authoritative terminal record.
 *   - V08-ABI-C01-N3  post-settlement conflicting completion is refused
 *                     typed; the durable terminal is never overwritten.
 *   - V08-ABI-C01-N4  wrong-role caller is denied by the business binding
 *                     with ZERO journal rows and ZERO resource dispatches.
 *   - V08-ABI-C01-N5  UNKNOWN: physical Host fault after a successful
 *                     non-idempotent dispatch but before the durable
 *                     terminal → journal `started`; retry is
 *                     `ADMISSION_EFFECT_AMBIGUOUS`; the physical resource
 *                     is dispatched EXACTLY once (no blind non-idempotent
 *                     retry).
 *   - V08-ABI-C01-N6  durably failed effect → retry stays
 *                     `ADMISSION_EFFECT_FAILED`, zero extra dispatches.
 *   - V08-ABI-C01-N7  mandatory unsupported receipt PRE-effect (decision
 *                     schema refusal happens before any journal/resource
 *                     activity); observation failure is OPTIONAL and never
 *                     mutates the authoritative occurrence.
 *   - V08-ABI-C01-N8  poison dynamic effect-binding declarations (hostile
 *                     destination keys, static+dynamic authority conflicts,
 *                     undeclared placeholders, out-of-projection paths,
 *                     missing rule) fail typed at WIRING (trusted load
 *                     boundary) before any instance can exist.
 *   - V08-ABI-C01-N9  post-wiring injected dynamic binding syntax is
 *                     refused typed (ADMISSION_EFFECT_BINDING_UNVALIDATED);
 *                     live mutation of a WIRED declaration is ignored (the
 *                     wiring snapshot is authoritative).
 *   - V08-ABI-C01-N10 durable records pinned to another kernel module
 *                     digest fail typed (typed code unavailability — no
 *                     silent cross-version replay); an active runtime is
 *                     never hot-swapped by a second module identity.
 *   - KPK04/05/06/07/09/14/15 equivalents (golden admission, guard/invariant
 *     denials, UNKNOWN taxonomy, durable file-Host restart recovery,
 *     cross-version pinning, v0.7 differential, per-occurrence dynamic
 *     inputFrom/idempotency snapshot), ported to the physical payload
 *     module. KPK07 is reported as a BOUNDED durable-seam recovery proof —
 *     it is NOT a concurrent terminal CAS proof (that is N1/N2) and NOT a
 *     multi-process proof (T-G).
 *   - #966 alias-isolation vectors for BOTH journal classes
 *     (VolatileAdmissionEffectJournal and KernelDurableEffectJournal),
 *     driven against a NON-cloning doc fixture so journal-layer snapshot
 *     discipline is proven independent of Host cloning behavior.
 *
 * FIXTURE BOUNDARY (honest): the Host primitives below (memory doc store,
 * file doc store, resource dispatcher) are TEST FIXTURES ONLY. The real
 * atomic Host storage primitive is owned by T-E/#1004; multi-process proof
 * is T-G. Nothing here implements production Host storage.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Sealed payload bytes → module identity → data-URL import (physical package
// discipline: the tests execute the exact bytes a sealed package would carry).
// ---------------------------------------------------------------------------

const KERNEL_SOURCE_PATH = '../src/qualified-package/payload/kernel-mechanism-v1.mjs';
const KERNEL_SOURCE = readFileSync(fileURLToPath(new URL(KERNEL_SOURCE_PATH, import.meta.url)), 'utf8');
const KERNEL_SHA256 = createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex');

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function importSource(source: string): Promise<Record<string, any>> {
  return import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
}

const kernel = await importSource(KERNEL_SOURCE);
// A deliberately changed kernel module (KPK-09 equivalent): truthful new
// digest + new module identity, different pinned-record namespace behavior.
const KERNEL_V2_SOURCE = KERNEL_SOURCE.replaceAll('v08-kernel-mechanism@1.0.0', 'v08-kernel-mechanism@1.0.1');
const KERNEL_V2_SHA256 = sha256Hex(KERNEL_V2_SOURCE);
const kernelV2 = await importSource(KERNEL_V2_SOURCE);

// ---------------------------------------------------------------------------
// FIXTURE Host primitives (TEST ONLY — production Host storage is T-E/#1004).
// ---------------------------------------------------------------------------

class FixtureHostStoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FixtureHostStoreError';
    this.code = code;
  }
}

interface PutRecord {
  key: string;
  conditions: Record<string, unknown>;
  resultingRevision: number;
}

interface DocStore {
  get(key: string): Promise<{ value: any; revision: number } | null>;
  put(key: string, value: any, conditions?: Record<string, unknown>): Promise<{ revision: number }>;
  list(prefix: string): Promise<string[]>;
  puts: PutRecord[];
  failNextPutMatching(keySubstring: string, options?: { skip?: number }): void;
}

function makeFault(state: { fault: { keySubstring: string; remainingSkips: number } | null }) {
  return {
    arm(keySubstring: string, skip = 0) {
      state.fault = { keySubstring, remainingSkips: skip };
    },
    consume(key: string): void {
      const fault = state.fault;
      if (fault === null || !key.includes(fault.keySubstring)) return;
      if (fault.remainingSkips > 0) {
        fault.remainingSkips -= 1;
        return;
      }
      state.fault = null;
      throw new FixtureHostStoreError('HOST_FAULT_INJECTED', `host storage physically faulted during write of ${key}`);
    },
  };
}

/** FIXTURE in-memory doc store (deep-cloning; #994 memory-host convention: create → revision 0). */
function memoryDocStore(): DocStore {
  const docs = new Map<string, any>();
  const revisions = new Map<string, number>();
  const state = { fault: null as { keySubstring: string; remainingSkips: number } | null };
  const fault = makeFault(state);
  const puts: PutRecord[] = [];
  const clone = (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  return {
    puts,
    failNextPutMatching(keySubstring, options) {
      fault.arm(keySubstring, options?.skip ?? 0);
    },
    async get(key) {
      if (!docs.has(key)) return null;
      return { value: clone(docs.get(key)), revision: revisions.get(key) as number };
    },
    async put(key, value, conditions = {}) {
      fault.consume(key);
      const exists = docs.has(key);
      if (conditions.mustBeAbsent === true && exists) {
        throw new FixtureHostStoreError('HOST_KEY_EXISTS', `host doc ${key} already exists`);
      }
      if (conditions.mustMatchRevision !== undefined) {
        if (!exists) {
          throw new FixtureHostStoreError('HOST_CAS_CONFLICT', `host doc ${key} does not exist; CAS expected revision ${String(conditions.mustMatchRevision)}`);
        }
        if (revisions.get(key) !== conditions.mustMatchRevision) {
          throw new FixtureHostStoreError('HOST_CAS_CONFLICT', `host doc ${key} revision is ${revisions.get(key)}; CAS expected ${String(conditions.mustMatchRevision)}`);
        }
      }
      const revision = exists ? (revisions.get(key) as number) + 1 : 0;
      docs.set(key, clone(value));
      revisions.set(key, revision);
      puts.push({ key, conditions: { ...conditions }, resultingRevision: revision });
      return { revision };
    },
    async list(prefix) {
      return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

/**
 * FIXTURE pass-through doc store: NO cloning on get/put. Used ONLY by the
 * #966 alias vectors so journal-layer snapshot discipline is observable
 * independent of Host cloning behavior.
 */
function passThroughDocStore(): DocStore {
  const docs = new Map<string, any>();
  const revisions = new Map<string, number>();
  const puts: PutRecord[] = [];
  return {
    puts,
    failNextPutMatching() {
      throw new Error('pass-through fixture does not model physical faults');
    },
    async get(key) {
      if (!docs.has(key)) return null;
      return { value: docs.get(key), revision: revisions.get(key) as number };
    },
    async put(key, value, conditions = {}) {
      const exists = docs.has(key);
      if (conditions.mustBeAbsent === true && exists) {
        throw new FixtureHostStoreError('HOST_KEY_EXISTS', `host doc ${key} already exists`);
      }
      if (conditions.mustMatchRevision !== undefined) {
        if (!exists || revisions.get(key) !== conditions.mustMatchRevision) {
          throw new FixtureHostStoreError('HOST_CAS_CONFLICT', `host doc ${key} failed the conditional write (CAS expected ${String(conditions.mustMatchRevision)})`);
        }
      }
      const revision = exists ? (revisions.get(key) as number) + 1 : 0;
      docs.set(key, value);
      revisions.set(key, revision);
      puts.push({ key, conditions: { ...conditions }, resultingRevision: revision });
      return { revision };
    },
    async list(prefix) {
      return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

/**
 * FIXTURE file-backed durable doc store (KPK-07 restart seam). One JSON file
 * per base64url-encoded key; revisions follow the same create → 0 convention.
 */
function fileDocStore(dir: string): DocStore {
  mkdirSync(dir, { recursive: true });
  const fileFor = (key: string) => path.join(dir, Buffer.from(key, 'utf8').toString('base64url') + '.json');
  const state = { fault: null as { keySubstring: string; remainingSkips: number } | null };
  const fault = makeFault(state);
  const puts: PutRecord[] = [];
  const readDoc = (key: string): { value: any; revision: number } | null => {
    const file = fileFor(key);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as { value: any; revision: number };
  };
  return {
    puts,
    failNextPutMatching(keySubstring, options) {
      fault.arm(keySubstring, options?.skip ?? 0);
    },
    async get(key) {
      return readDoc(key);
    },
    async put(key, value, conditions = {}) {
      fault.consume(key);
      const existing = readDoc(key);
      if (conditions.mustBeAbsent === true && existing !== null) {
        throw new FixtureHostStoreError('HOST_KEY_EXISTS', `host doc ${key} already exists`);
      }
      if (conditions.mustMatchRevision !== undefined) {
        if (existing === null || existing.revision !== conditions.mustMatchRevision) {
          throw new FixtureHostStoreError('HOST_CAS_CONFLICT', `host doc ${key} failed the conditional write (CAS expected ${String(conditions.mustMatchRevision)})`);
        }
      }
      const revision = existing === null ? 0 : existing.revision + 1;
      writeFileSync(fileFor(key), JSON.stringify({ value, revision }), 'utf8');
      puts.push({ key, conditions: { ...conditions }, resultingRevision: revision });
      return { revision };
    },
    async list(prefix) {
      return readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => Buffer.from(name.slice(0, -'.json'.length), 'base64url').toString('utf8'))
        .filter((key) => key.startsWith(prefix))
        .sort();
    },
  };
}

/** FIXTURE resource dispatcher with call accounting and the `ledger` provisioning seam. */
function resourcePort() {
  const calls: { resourceKey: string; operation: string; payload: any }[] = [];
  let failingNext: string | null = null;
  return {
    async call(resourceKey: string, operation: string, payload: any) {
      calls.push({ resourceKey, operation, payload });
      if (failingNext !== null && failingNext === resourceKey) {
        failingNext = null;
        throw new Error(`physical resource ${resourceKey}.${operation} timed out after dispatch (uncertain outcome)`);
      }
      if (resourceKey === 'ledger' && operation === 'reserve') {
        return { reserved: true, effectId: payload.effectId };
      }
      throw new Error(`host resource ${resourceKey}.${operation} is not provisioned`);
    },
    failNextCall(resourceKey: string) {
      failingNext = resourceKey;
    },
    callCount: () => calls.length,
    calls: () => calls.slice(),
  };
}

function fixtureHostPorts() {
  const docs = memoryDocStore();
  const resources = resourcePort();
  const sha256 = { async digestUtf8(value: string) { return sha256Hex(value); } };
  return { docs, resources, sha256, clock: () => NOW };
}

// ---------------------------------------------------------------------------
// FIXTURE Standard-SDK rule interpreter (plain projection, no model calls).
// ---------------------------------------------------------------------------

function isPlainJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return true;
  if (Array.isArray(value)) return value.every(isPlainJson);
  if (typeof value === 'object') {
    return Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(isPlainJson);
  }
  return false;
}

function sdkEndpoint() {
  return {
    packageId: 'std:test@1.0.0',
    interpret(rule: any, input: any, _context: any) {
      if (typeof rule?.ruleId !== 'string' || rule.ruleId.length === 0) {
        throw new Error('sdk rule must carry a non-empty ruleId');
      }
      if (!isPlainJson(input)) {
        throw new Error(`rule ${rule.ruleId}: intent input must be plain JSON`);
      }
      const payload: Record<string, unknown> = {};
      for (const [payloadKey, inputKey] of Object.entries(rule.payloadFromInput as Record<string, string>)) {
        if (Object.prototype.hasOwnProperty.call(input, inputKey)) {
          payload[payloadKey] = input[inputKey];
        }
      }
      return {
        source: 'harness-machine',
        structuredDecision: {
          decision: { outcome: 'decide', data: payload },
          event: { type: rule.eventType, payload },
        },
        provenance: { ruleId: rule.ruleId, sdkModule: 'std:test@1.0.0' },
        freshModelCallCount: 1,
        llmAvoided: false,
        cacheDisposition: { read: 'disabled' },
        telemetry: [],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// FIXTURE business policy — the order-approval v0.7 golden scenario.
// ---------------------------------------------------------------------------

const NOW = '2026-09-21T07:00:00.000Z';
const TARGET = { workflowId: 'order-quote', instanceKey: 'instance:42' };
const MSG_1 = 'msg:1';
const TURN_ID = 'turn:order-quote:instance%3A42:message:msg%3A1';
const EFFECT_ID = `${TURN_ID}/effect/1`;

const CAP_INVARIANT = {
  invariantId: 'inv:cap-100',
  predicate: {
    op: 'not',
    predicate: {
      op: 'gt',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'literal', value: 100 },
    },
  },
};

const GUARD_AMOUNT_OK = {
  guardId: 'guard:amount-ok',
  predicate: {
    op: 'lte',
    left: { source: 'event', path: ['payload', 'amount'] },
    right: { source: 'literal', value: 50 },
  },
};

function definition({ omitReject, dynamic, decisionSource }: { omitReject?: boolean; dynamic?: boolean; decisionSource?: boolean } = {}) {
  const effectIntent: Record<string, unknown> = dynamic
    ? {
        effectType: 'effect:reserve',
        inputFrom: decisionSource
          ? {
              amount: { source: 'event', path: ['payload', 'amount'] },
              requestId: { source: 'decision', path: ['data', 'requestId'] },
            }
          : {
              amount: { source: 'event', path: ['payload', 'amount'] },
              requestId: { source: 'event', path: ['payload', 'requestId'] },
            },
        idempotencyKeyFrom: { template: 'reserve:quote:{requestId}' },
      }
    : {
        effectType: 'effect:reserve',
        input: { reservation: 'quote', amount: 42 },
        idempotencyKey: 'reserve:quote:1',
      };
  return {
    workflowKey: 'order-quote',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_AMOUNT_OK],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'approved',
            guardId: 'guard:amount-ok',
            effectIntents: [effectIntent],
          },
          ...(omitReject ? [] : [{
            transitionKey: 'reject',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'rejected',
          }]),
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
    ],
  };
}

function businessPolicy(options: { schemaInvalid?: boolean } = {}) {
  return {
    packageId: 'biz:order-approval@1.0.0',
    policyId: 'order-approval',
    domainId: 'orders',
    workflowDefinition: definition(),
    strictWorkflowDefinition: definition({ omitReject: true }),
    decisionSchema: {
      isValid(value: any) {
        if (options.schemaInvalid === true) return false;
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
        return typeof value.decision?.outcome === 'string' && typeof value.event?.type === 'string';
      },
    },
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:quote-decision': { ruleId: 'rule:quote-decision', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount' } },
      'rule:quote-decision-request': { ruleId: 'rule:quote-decision-request', eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },
    },
    intentBindings: {
      submitQuoteDecision: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision',
        roles: ['requester'],
      },
      submitQuoteDecisionStrict: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision',
        roles: ['requester'],
        definition: definition({ omitReject: true }),
      },
      submitQuoteDecisionDynamic: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision-request',
        roles: ['requester'],
        definition: definition({ dynamic: true }),
      },
      submitQuoteDecisionDecisionSource: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:quote-decision-request',
        roles: ['requester'],
        definition: definition({ dynamic: true, decisionSource: true }),
      },
    },
    effectBindings: {
      'effect:reserve': {
        semantics: 'non-idempotent',
        handler: async ({ input, effectId, resources }: any) => {
          if (resources === undefined) throw new Error('effect:reserve requires the Host resource port');
          return resources.call('ledger', 'reserve', { ...input, effectId });
        },
      },
    },
  };
}

function quoteIntent({ amount, messageId = MSG_1, role = 'requester', intentType = 'submitQuoteDecision', requestId, target }: {
  amount: number; messageId?: string; role?: string; intentType?: string; requestId?: string; target?: { workflowId: string; instanceKey: string };
}) {
  const input: Record<string, unknown> = { amount };
  if (requestId !== undefined) input.requestId = requestId;
  return {
    kind: 'v08/tc-intent',
    intentType,
    target: target ?? TARGET,
    messageId,
    input,
    caller: { role },
  };
}

interface RuntimeHandle {
  runtime: Record<string, any>;
  host: ReturnType<typeof fixtureHostPorts>;
  policy: ReturnType<typeof businessPolicy>;
}

function createRuntime(options: {
  moduleSource?: string;
  moduleSha256?: string;
  host?: ReturnType<typeof fixtureHostPorts>;
  policy?: ReturnType<typeof businessPolicy>;
  moduleNamespace?: Record<string, any>;
  observe?: (receipt: any) => void;
} = {}): RuntimeHandle {
  const host = options.host ?? fixtureHostPorts();
  const policy = options.policy ?? businessPolicy();
  const namespace = options.moduleNamespace ?? kernel;
  const runtime = namespace.createOccurrenceRuntime({
    moduleIdentity: {
      packageId: 'kernel:v08-mechanism@1.0.0',
      moduleSha256: options.moduleSha256 ?? sha256Hex(options.moduleSource ?? KERNEL_SOURCE),
    },
    hostPorts: host,
    sdkEndpoint: sdkEndpoint(),
    businessEndpoint: policy,
    observe: options.observe,
  });
  return { runtime, host, policy };
}

async function openedRuntime(options?: Parameters<typeof createRuntime>[0]): Promise<RuntimeHandle> {
  const ctx = createRuntime(options);
  await ctx.runtime.openInstance({ target: TARGET, correlationId: 'corr:42' });
  return ctx;
}

function isTypedError(name: string, code: string) {
  return (error: unknown) => {
    const typed = error as { name?: string; code?: string };
    return typed.name === name && typed.code === code;
  };
}

function effectJournal(docs: DocStore, moduleSha256: string): any {
  return new kernel.KernelDurableEffectJournal(docs, moduleSha256, undefined);
}

function startedRecord(): Record<string, unknown> {
  return {
    effectId: EFFECT_ID,
    target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
    durableControlTurnId: TURN_ID,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'started',
    attempt: 1,
    input: { reservation: 'quote', amount: 42 },
    idempotencyKey: 'reserve:quote:1',
    startedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// ABI conformance of the physical payload module (T-A V8_QUALIFIED_ABI).
// ---------------------------------------------------------------------------

test('V08-ABI-C01-EXPORTS: payload bytes carry the exact v08-kernel-abi/1 surface', () => {
  assert.equal(kernel.PACKAGE_KIND, 'kernel');
  assert.equal(kernel.ABI_VERSION, 'v08-kernel-abi/1');
  assert.equal(typeof kernel.MODULE_ID, 'string');
  assert.deepEqual(kernel.ENDPOINTS, [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }]);
  assert.equal(typeof kernel.createOccurrenceRuntime, 'function');
  assert.match(KERNEL_SHA256, /^[0-9a-f]{64}$/);
  assert.notEqual(KERNEL_V2_SHA256, KERNEL_SHA256, 'changed kernel bytes yield a truthful new digest');
});

test('V08-ABI-C01-EXPORTS: the kernel endpoint refuses a Host without the document-store port', () => {
  assert.throws(
    () => kernel.createOccurrenceRuntime({
      moduleIdentity: { packageId: 'kernel:x', moduleSha256: KERNEL_SHA256 },
      hostPorts: {},
      sdkEndpoint: sdkEndpoint(),
      businessEndpoint: businessPolicy(),
    }),
    isTypedError('CentralAdmissionError', 'ADMISSION_EVALUATION_INPUT_INVALID'),
  );
});

// ---------------------------------------------------------------------------
// N1 — THE P1-L2-CAS-01 falsifier (RED against the #994 defect, then GREEN).
// ---------------------------------------------------------------------------

test('V08-ABI-C01-N1: two competing trusted same-effect terminal completions with different outcomes — exactly one wins, loser typed, terminal write is conditional CAS', async () => {
  const docs = memoryDocStore();
  const journal = effectJournal(docs, KERNEL_SHA256);
  await journal.beginEffect(startedRecord());

  const [resultA, resultB] = await Promise.allSettled([
    journal.completeEffect(EFFECT_ID, { status: 'completed', output: { terminal: 'a' }, completedAt: NOW }),
    journal.completeEffect(EFFECT_ID, { status: 'completed', output: { terminal: 'b' }, completedAt: NOW }),
  ]);
  const settled = [resultA, resultB];
  const fulfilled = settled.filter((entry): entry is PromiseFulfilledResult<any> => entry.status === 'fulfilled');
  const rejected = settled.filter((entry): entry is PromiseRejectedResult => entry.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'exactly one competing terminal completion may win');
  assert.equal(rejected.length, 1, 'the losing completion must fail');
  const loser = (rejected[0] as PromiseRejectedResult).reason as { name?: string; code?: string; message?: string };
  assert.equal(loser.name, 'CentralAdmissionError');
  assert.equal(loser.code, 'ADMISSION_EFFECT_JOURNAL_CONFLICT');
  assert.match(loser.message ?? '', /already settled with a conflicting outcome/);

  const winner = fulfilled[0] as PromiseFulfilledResult<any>;
  const stored = await journal.getEffect(EFFECT_ID);
  assert.equal(stored.status, 'completed');
  assert.deepEqual(stored.output, winner.value.output, 'the durable terminal is the winner\'s outcome — never overwritten by the loser');
  assert.deepEqual(await journal.getRecords(), [stored], 'exactly ONE authoritative terminal row exists');

  // Host put contract: every terminal completion write on this doc carried a
  // real integer CAS expectation (never undefined / unconditional). Against
  // the #994 defect the completion puts carry mustMatchRevision === undefined
  // and both writes land — this assertion is the second RED signal.
  const journalPuts = docs.puts.filter((entry) => entry.key === `v08-kernel:effect-journal:${EFFECT_ID}`);
  assert.ok(journalPuts.length >= 2, 'begin + terminal writes are visible on the doc port');
  for (const entry of journalPuts.slice(1)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(entry.conditions, 'mustMatchRevision')
      && Number.isInteger(entry.conditions.mustMatchRevision),
      `terminal write must carry an integer mustMatchRevision, got ${String(entry.conditions.mustMatchRevision)}`,
    );
  }
});

test('V08-ABI-C01-N2: competing same-outcome completions settle idempotently to ONE authoritative terminal', async () => {
  const docs = memoryDocStore();
  const journal = effectJournal(docs, KERNEL_SHA256);
  await journal.beginEffect(startedRecord());

  const outcome = { status: 'completed', output: { terminal: 'same' }, completedAt: NOW };
  const [first, second] = await Promise.all([
    journal.completeEffect(EFFECT_ID, outcome),
    journal.completeEffect(EFFECT_ID, outcome),
  ]);
  assert.deepEqual(first, second, 'both callers observe the SAME authoritative terminal record');
  const journalRows = await journal.getRecords();
  assert.equal(journalRows.length, 1);
  assert.equal(journalRows[0].status, 'completed');
  assert.deepEqual(journalRows[0].output, { terminal: 'same' });
});

test('V08-ABI-C01-N3: a conflicting completion after settlement is refused typed; the terminal is never overwritten', async () => {
  const docs = memoryDocStore();
  const journal = effectJournal(docs, KERNEL_SHA256);
  await journal.beginEffect(startedRecord());
  await journal.completeEffect(EFFECT_ID, { status: 'completed', output: { terminal: 'original' }, completedAt: NOW });

  await assert.rejects(
    () => journal.completeEffect(EFFECT_ID, { status: 'completed', output: { terminal: 'mutant' }, completedAt: NOW }),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  await assert.rejects(
    () => journal.completeEffect(EFFECT_ID, { status: 'failed', error: { message: 'mutant' }, completedAt: NOW }),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  const stored = await journal.getEffect(EFFECT_ID);
  assert.equal(stored.status, 'completed');
  assert.deepEqual(stored.output, { terminal: 'original' }, 'the authoritative terminal survived both conflicting attempts');
  assert.equal((await journal.getRecords()).length, 1);
});

// ---------------------------------------------------------------------------
// N4 — wrong-role caller: denied before any journal/resource activity.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-N4: wrong-role caller is denied by the business binding with zero journal/resource activity', async () => {
  const { runtime, host } = await openedRuntime();
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 42, role: 'auditor' }));
  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'business-caller-role');
  assert.equal(receipt.denial.callerRole, 'auditor');
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.getJournalRecords()).length, 0);
  const snapshot = await runtime.getSnapshot(TARGET);
  assert.equal(snapshot.state.stateKey, 'review', 'state untouched by the denied occurrence');
});

// ---------------------------------------------------------------------------
// N5/N6 — UNKNOWN taxonomy: no blind non-idempotent retry.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-N5: crash after Effect before durable terminal → started row, retry is AMBIGUOUS, exactly one dispatch', async () => {
  const { runtime, host } = await openedRuntime();
  // The physical resource SUCCEEDS, then the Host storage faults at exactly
  // the journal completion write (skip=1: the begin write lands, the
  // completion write faults): outcome genuinely unknown.
  host.docs.failNextPutMatching('v08-kernel:effect-journal', { skip: 1 });

  await assert.rejects(
    () => runtime.submitOccurrence(quoteIntent({ amount: 42 })),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  assert.equal(host.resources.callCount(), 1, 'physical dispatch happened exactly once');
  const journal = await runtime.getJournalRecords();
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'started', 'begun but never committed — uncertain durable outcome (UNKNOWN)');

  await assert.rejects(
    () => runtime.submitOccurrence(quoteIntent({ amount: 42 })),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_AMBIGUOUS'),
  );
  assert.equal(host.resources.callCount(), 1, 'the uncertain non-idempotent effect is never re-executed');
  assert.equal((await runtime.getJournalRecords()).length, 1);
  const snapshot = await runtime.getSnapshot(TARGET);
  assert.equal(snapshot.state.stateKey, 'review', 'no state commit for an uncertain outcome');
});

test('V08-ABI-C01-N6: durably failed effect → retry forbidden (operator recovery owns retry)', async () => {
  const { runtime, host } = await openedRuntime();
  host.resources.failNextCall('ledger');

  await assert.rejects(
    () => runtime.submitOccurrence(quoteIntent({ amount: 42 })),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_FAILED'),
  );
  assert.equal(host.resources.callCount(), 1);
  const journal = await runtime.getJournalRecords();
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'failed');

  await assert.rejects(
    () => runtime.submitOccurrence(quoteIntent({ amount: 42 })),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_FAILED'),
  );
  assert.equal(host.resources.callCount(), 1, 'no blind retry of a durably failed effect');
  assert.equal((await runtime.getJournalRecords()).length, 1);
});

// ---------------------------------------------------------------------------
// N7 — mandatory unsupported receipt pre-effect; optional observation failure.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-N7a: decision-schema refusal is MANDATORY pre-effect — typed denial before any journal/resource activity', async () => {
  const { runtime, host } = await openedRuntime({ policy: businessPolicy({ schemaInvalid: true }) });
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 42 }));
  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'schema');
  assert.equal(receipt.denial.durableControlTurnId, TURN_ID);
  assert.equal(host.resources.callCount(), 0, 'no dispatch before the supported receipt');
  assert.equal((await runtime.getJournalRecords()).length, 0, 'no journal row before the supported receipt');
});

test('V08-ABI-C01-N7b: observation failure is OPTIONAL — a throwing observer never mutates the authoritative occurrence', async () => {
  const observed: any[] = [];
  const { runtime, host } = await openedRuntime({
    observe: (receipt) => {
      observed.push(receipt);
      throw new Error('observer is broken on purpose');
    },
  });
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 42 }));
  assert.equal(receipt.status, 'admitted', 'the occurrence completed despite the observer failure');
  assert.equal(host.resources.callCount(), 1);
  assert.equal((await runtime.getJournalRecords())[0].status, 'completed');
  assert.equal(observed.length, 1, 'the observer was invoked with the receipt');
  const snapshot = await runtime.getSnapshot(TARGET);
  assert.equal(snapshot.state.stateKey, 'approved');
});

// ---------------------------------------------------------------------------
// N8 — poison dynamic effect-binding declarations fail at WIRING.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-N8: poison dynamic binding declarations fail typed at wiring, before any instance', () => {
  const poisonCases: Record<string, (policy: ReturnType<typeof businessPolicy>) => void>[] = [
    { label: 'prototype-sensitive destination key', poison: (policy) => {
        const intent = (policy.intentBindings.submitQuoteDecisionDynamic.definition as any).states[0].transitions[0].effectIntents[0] as any;
        intent.inputFrom = { constructor: { source: 'event', path: ['payload', 'amount'] } };
      } },
    { label: 'static input + inputFrom authority conflict', poison: (policy) => {
        const intent = (policy.intentBindings.submitQuoteDecisionDynamic.definition as any).states[0].transitions[0].effectIntents[0] as any;
        intent.input = { reservation: 'quote' };
      } },
    { label: 'template placeholder outside inputFrom', poison: (policy) => {
        const intent = (policy.intentBindings.submitQuoteDecisionDynamic.definition as any).states[0].transitions[0].effectIntents[0] as any;
        intent.idempotencyKeyFrom = { template: 'reserve:quote:{oops}' };
      } },
    { label: 'path outside the rule-authorized projection', poison: (policy) => {
        const intent = (policy.intentBindings.submitQuoteDecisionDynamic.definition as any).states[0].transitions[0].effectIntents[0] as any;
        intent.inputFrom.amount = { source: 'event', path: ['payload', 'hack'] };
      } },
  ];
  for (const { label, poison } of poisonCases) {
    const policy = businessPolicy();
    poison(policy);
    assert.throws(
      () => createRuntime({ policy }),
      isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_BINDING_INVALID'),
      `poison case must fail at wiring: ${label}`,
    );
  }
});

// ---------------------------------------------------------------------------
// N9 — snapshot authority: live mutation ignored; injected syntax refused.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-N9a: live post-wiring mutation of a WIRED dynamic declaration is IGNORED (snapshot authoritative)', async () => {
  const policy = businessPolicy();
  const { runtime } = createRuntime({ policy });
  const intent = (policy.intentBindings.submitQuoteDecisionDynamic.definition as any).states[0].transitions[0].effectIntents[0] as any;
  intent.inputFrom.amount = { source: 'event', path: ['payload', 'amount'] };
  intent.inputFrom.requestId = { source: 'event', path: ['payload', 'hijacked'] };
  await runtime.openInstance({ target: TARGET, correlationId: 'corr:42' });
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 30, messageId: 'msg:d1', intentType: 'submitQuoteDecisionDynamic', requestId: 'R1' }));
  assert.equal(receipt.status, 'admitted');
  const journal = await runtime.getJournalRecords();
  assert.deepEqual(journal[0].input, { amount: 30, requestId: 'R1' }, 'the ORIGINAL authorized snapshot still binds the occurrence');
});

test('V08-ABI-C01-N9b: post-wiring INJECTED dynamic binding syntax is refused typed before any journal write', async () => {
  const policy = businessPolicy();
  const { runtime, host } = createRuntime({ policy });
  const transition = (policy.intentBindings.submitQuoteDecisionStrict.definition as any).states[0].transitions[0] as any;
  transition.effectIntents = [{
    effectType: 'effect:reserve',
    inputFrom: { amount: { source: 'event', path: ['payload', 'amount'] } },
  }];
  await runtime.openInstance({ target: TARGET, correlationId: 'corr:42' });
  await assert.rejects(
    () => runtime.submitOccurrence(quoteIntent({ amount: 30, messageId: 'msg:inj', intentType: 'submitQuoteDecisionStrict' })),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_BINDING_UNVALIDATED'),
  );
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.getJournalRecords()).length, 0);
});

// ---------------------------------------------------------------------------
// N10 / KPK-09 — cross-version pin: typed code unavailability, no silent replay.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-N10: journal records pinned to another kernel module digest fail typed under this module', async () => {
  const docs = memoryDocStore();
  const journalV1 = effectJournal(docs, KERNEL_SHA256);
  await journalV1.beginEffect(startedRecord());

  const journalV2 = effectJournal(docs, KERNEL_V2_SHA256);
  await assert.rejects(
    () => journalV2.beginEffect(startedRecord()),
    (error: any) => error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT' && /unavailable under the loaded kernel module/.test(error.message),
  );
  await assert.rejects(
    () => journalV2.completeEffect(EFFECT_ID, { status: 'completed', output: { terminal: 'v2' }, completedAt: NOW }),
    (error: any) => error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT' && /unavailable under the loaded kernel module/.test(error.message),
  );
  const stored = await journalV1.getEffect(EFFECT_ID);
  assert.equal(stored.status, 'started', 'the v1 record is untouched by the refused v2 access');
});

test('V08-ABI-C01-N10b: an active runtime is never hot-swapped — a second module identity over the same docs fails the pin typed', async () => {
  const host = fixtureHostPorts();
  const first = createRuntime({ host });
  await first.runtime.openInstance({ target: TARGET, correlationId: 'corr:42' });

  const second = createRuntime({ host, moduleSha256: KERNEL_V2_SHA256, moduleNamespace: kernelV2 });
  await assert.rejects(
    () => second.runtime.submitOccurrence(quoteIntent({ amount: 42 })),
    (error: any) => error.code === 'GOVERNANCE_EXECUTION_PIN_CONFLICT' && /unavailable under the loaded kernel module/.test(error.message),
  );
  assert.equal(host.resources.callCount(), 0, 'the pinned occurrence never dispatched under the wrong kernel module');
});

// ---------------------------------------------------------------------------
// KPK-04 equivalent — golden positive (exact v0.7-semantics values).
// ---------------------------------------------------------------------------

test('V08-ABI-C01-P1 (KPK04): authorized approval transition produces the exact v0.7-semantics golden values', async () => {
  const { runtime, host } = await openedRuntime();
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 42 }));

  assert.equal(receipt.status, 'admitted');
  const admitted = receipt.admitted;
  assert.equal(admitted.durableControlTurnId, TURN_ID);
  assert.equal(admitted.transitionKey, 'approve');
  assert.equal(admitted.targetState, 'approved');
  assert.deepEqual(admitted.resolver, {
    source: 'harness-machine',
    llmAvoided: false,
    freshModelCallCount: 1,
    cacheRead: 'disabled',
    telemetryEventCount: 0,
  });
  assert.equal(host.resources.callCount(), 1);
  const journal = await runtime.getJournalRecords();
  assert.equal(journal.length, 1);
  // v0.7 golden journal row (byte-equal to the v0.7@86110c6 outputs verified
  // by the KPK-14 live differential at #994@b9ea4d1).
  assert.deepEqual(journal[0], {
    effectId: EFFECT_ID,
    target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
    durableControlTurnId: TURN_ID,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'completed',
    attempt: 1,
    input: { reservation: 'quote', amount: 42 },
    idempotencyKey: 'reserve:quote:1',
    startedAt: NOW,
    output: { reserved: true, effectId: EFFECT_ID },
    completedAt: NOW,
  });
  assert.equal(receipt.instance.stateRevision, 1);
  assert.equal(receipt.instance.state.stateKey, 'approved');
  assert.equal(receipt.instance.lifecycle, 'completed');
  assert.equal(receipt.attribution.kernel.moduleSha256, KERNEL_SHA256);
  assert.equal(receipt.attribution.business.policyId, 'order-approval');

  // Instance commit discipline: the state commit is itself a conditional CAS
  // write keyed by the snapshot revision (create → 0, commit expects 0).
  const instancePuts = host.docs.puts.filter((entry) => entry.key === `v08-kernel:wf-instance:order-quote:instance:42`);
  assert.ok(instancePuts.length >= 2);
  const commitPut = instancePuts[1];
  assert.equal(commitPut.conditions.mustMatchRevision, 0, 'the instance state commit is a revision-keyed conditional write');
  assert.equal(commitPut.resultingRevision, 1);
});

// ---------------------------------------------------------------------------
// KPK-05 equivalent — hard-invariant / guard / fallback denials.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-P2 (KPK05): hard-invariant denial (amount 150) — zero effects, state untouched', async () => {
  const { runtime, host } = await openedRuntime();
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 150, messageId: 'msg:150' }));
  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'hard-invariant');
  assert.equal(receipt.denial.invariantId, 'inv:cap-100');
  assert.equal(receipt.denial.durableControlTurnId, 'turn:order-quote:instance%3A42:message:msg%3A150');
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.getJournalRecords()).length, 0);
});

test('V08-ABI-C01-P2b (KPK05): guard denial on the strict definition (amount 75, no fallback transition)', async () => {
  const { runtime, host } = await openedRuntime();
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 75, messageId: 'msg:75', intentType: 'submitQuoteDecisionStrict' }));
  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'guard');
  assert.equal(receipt.denial.transitionKey, 'approve');
  assert.equal(receipt.denial.guardId, 'guard:amount-ok');
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.getJournalRecords()).length, 0);
});

test('V08-ABI-C01-P2c (KPK05): guard rejection routes to the business-declared fallback transition (amount 75)', async () => {
  const { runtime, host } = await openedRuntime();
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 75, messageId: 'msg:75f' }));
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.transitionKey, 'reject');
  assert.equal(receipt.admitted.targetState, 'rejected');
  assert.equal(host.resources.callCount(), 0, 'the fallback transition declares no effects');
  assert.equal((await runtime.getJournalRecords()).length, 0);
  assert.equal(receipt.instance.state.stateKey, 'rejected');
});

// ---------------------------------------------------------------------------
// KPK-07 equivalent — durable file-Host restart recovery (BOUNDED proof).
// ---------------------------------------------------------------------------

test('V08-ABI-C01-P3 (KPK07, bounded): durable restart recovers journal/pin/instance; crash-before-commit replay costs zero extra dispatches', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'v08-tc-kpk07-'));
  try {
    const host1 = { docs: fileDocStore(dir), resources: resourcePort(), sha256: { async digestUtf8(value: string) { return sha256Hex(value); } }, clock: () => NOW };
    const runtime1 = createRuntime({ host: host1 as unknown as ReturnType<typeof fixtureHostPorts> }).runtime;
    await runtime1.openInstance({ target: TARGET, correlationId: 'corr:42' });
    const receipt1 = await runtime1.submitOccurrence(quoteIntent({ amount: 42 }));
    assert.equal(receipt1.status, 'admitted');
    assert.equal(host1.resources.callCount(), 1);

    // "Restart": a brand-new Host primitive stack over the SAME durable
    // directory and a brand-new module instantiation.
    const host2 = { docs: fileDocStore(dir), resources: resourcePort(), sha256: { async digestUtf8(value: string) { return sha256Hex(value); } }, clock: () => NOW };
    const runtime2 = createRuntime({ host: host2 as unknown as ReturnType<typeof fixtureHostPorts> }).runtime;
    const snapshot = await runtime2.getSnapshot(TARGET);
    assert.equal(snapshot.state.stateKey, 'approved');
    assert.equal(snapshot.stateRevision, 1);
    const journal = await runtime2.getJournalRecords();
    assert.equal(journal.length, 1);
    assert.equal(journal[0].status, 'completed');
    assert.equal(journal[0].effectId, EFFECT_ID);

    // Duplicate message on the restarted runtime: denied no-candidate BEFORE
    // any effect work; journal row and resource count untouched.
    const replay = await runtime2.submitOccurrence(quoteIntent({ amount: 42 }));
    assert.equal(replay.status, 'denied');
    assert.equal(replay.denial.reason, 'no-candidate-transition');
    assert.equal(host2.resources.callCount(), 0);

    // Crash-before-commit on a fresh instance: the journal survives, the
    // retry REPLAYS the completed effect with zero extra dispatches.
    const target2 = { workflowId: 'order-quote', instanceKey: 'instance:43' };
    const host3 = { docs: fileDocStore(dir), resources: resourcePort(), sha256: { async digestUtf8(value: string) { return sha256Hex(value); } }, clock: () => NOW };
    const runtime3 = createRuntime({ host: host3 as unknown as ReturnType<typeof fixtureHostPorts> }).runtime;
    await runtime3.openInstance({ target: target2, correlationId: 'corr:43' });
    host3.docs.failNextPutMatching('v08-kernel:wf-instance:order-quote:instance:43');
    await assert.rejects(
      () => runtime3.submitOccurrence(quoteIntent({ amount: 42, messageId: 'msg:43', target: target2 })),
      (error: any) => error.code === 'HOST_FAULT_INJECTED',
    );
    assert.equal(host3.resources.callCount(), 1);
    const retry3 = await runtime3.submitOccurrence(quoteIntent({ amount: 42, messageId: 'msg:43', target: target2 }));
    assert.equal(retry3.status, 'admitted');
    assert.equal(retry3.admitted.effects[0].disposition, 'replayed');
    assert.equal(host3.resources.callCount(), 1, 'durable journal replay: zero extra dispatches across restart');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// KPK-14 equivalent — journal differential + golden constants.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-P4 (KPK14): the v0.7 Volatile journal and the kernel durable journal agree byte-for-byte over an identical operation sequence', async () => {
  const docs = memoryDocStore();
  const volatileJournal = new kernel.VolatileAdmissionEffectJournal();
  const durableJournal = effectJournal(docs, KERNEL_SHA256);

  const recordA = startedRecord();
  const recordB = { ...startedRecord(), effectId: `${TURN_ID}/effect/2`, operationOrdinal: 2 };

  for (const journal of [volatileJournal, durableJournal]) {
    await journal.beginEffect(recordA);
    const rebegin = await journal.beginEffect({ ...recordA });
    assert.equal(rebegin.disposition, 'existing');
    await journal.completeEffect(recordA.effectId as string, { status: 'completed', output: { reserved: true, effectId: EFFECT_ID }, completedAt: NOW });
    await journal.beginEffect(recordB);
    await journal.completeEffect(recordB.effectId as string, { status: 'failed', error: { message: 'dispatch timed out' }, completedAt: NOW });
    await assert.rejects(
      () => journal.completeEffect(recordA.effectId as string, { status: 'completed', output: { mutated: true }, completedAt: NOW }),
      isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_JOURNAL_CONFLICT'),
    );
  }
  assert.deepEqual(await durableJournal.getRecords(), await volatileJournal.getRecords(), 'the durable adapter preserves the exact v0.7 record semantics');
  assert.equal((await volatileJournal.getRecords()).length, 2);
});

// ---------------------------------------------------------------------------
// KPK-15 equivalents — per-occurrence dynamic inputFrom / idempotency snapshot.
// ---------------------------------------------------------------------------

test('V08-ABI-C01-P5 (KPK15a): two dynamic occurrences produce DISTINCT per-occurrence port inputs, journal inputs and idempotency keys', async () => {
  const { runtime, host } = await openedRuntime();
  const target1 = { workflowId: 'order-quote', instanceKey: 'instance:d1' };
  const target2 = { workflowId: 'order-quote', instanceKey: 'instance:d2' };
  await runtime.openInstance({ target: target1, correlationId: 'corr:d1' });
  await runtime.openInstance({ target: target2, correlationId: 'corr:d2' });
  const receipt1 = await runtime.submitOccurrence(quoteIntent({ amount: 30, messageId: 'msg:d1', intentType: 'submitQuoteDecisionDynamic', requestId: 'R1', target: target1 }));
  assert.equal(receipt1.status, 'admitted');
  const receipt2 = await runtime.submitOccurrence(quoteIntent({ amount: 40, messageId: 'msg:d2', intentType: 'submitQuoteDecisionDynamic', requestId: 'R2', target: target2 }));
  assert.equal(receipt2.status, 'admitted');

  assert.equal(host.resources.callCount(), 2);
  const dispatches = host.resources.calls();
  assert.deepEqual(dispatches[0].payload, { amount: 30, requestId: 'R1', effectId: dispatches[0].payload.effectId });
  assert.deepEqual(dispatches[1].payload, { amount: 40, requestId: 'R2', effectId: dispatches[1].payload.effectId });

  const journal = await runtime.getJournalRecords();
  assert.equal(journal.length, 2);
  assert.deepEqual(journal[0].input, { amount: 30, requestId: 'R1' });
  assert.deepEqual(journal[1].input, { amount: 40, requestId: 'R2' });
  assert.equal(journal[0].idempotencyKey, 'reserve:quote:R1');
  assert.equal(journal[1].idempotencyKey, 'reserve:quote:R2');
  assert.equal(receipt1.admitted.effects[0].idempotencyKey, 'reserve:quote:R1');
  assert.equal(receipt2.admitted.effects[0].idempotencyKey, 'reserve:quote:R2');
});

test('V08-ABI-C01-P5b (KPK15l): a decision-source inputFrom field resolves from the typed decision projection', async () => {
  const { runtime } = await openedRuntime();
  const receipt = await runtime.submitOccurrence(quoteIntent({ amount: 30, messageId: 'msg:ds1', intentType: 'submitQuoteDecisionDecisionSource', requestId: 'R3' }));
  assert.equal(receipt.status, 'admitted');
  const journal = await runtime.getJournalRecords();
  assert.equal(journal[0].idempotencyKey, 'reserve:quote:R3', 'the decision projection supplies the template field');
  assert.deepEqual(journal[0].input, { amount: 30, requestId: 'R3' });
});

test('V08-ABI-C01-P5c (KPK15f): an injected unsafe idempotency key fails typed BEFORE any journal write', async () => {
  const { runtime, host } = await openedRuntime();
  await runtime.openInstance({ target: { workflowId: 'order-quote', instanceKey: 'instance:unsafe' }, correlationId: 'corr:unsafe' });
  await assert.rejects(
    () => runtime.submitOccurrence({
      kind: 'v08/tc-intent',
      intentType: 'submitQuoteDecisionDynamic',
      target: { workflowId: 'order-quote', instanceKey: 'instance:unsafe' },
      messageId: 'msg:unsafe',
      input: { amount: 30, requestId: 'bad id!' },
      caller: { role: 'requester' },
    }),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_IDEMPOTENCY_KEY_INVALID'),
  );
  assert.equal(host.resources.callCount(), 0);
  assert.equal((await runtime.getJournalRecords()).length, 0);
});

test('V08-ABI-C01-P5d (KPK15g): crash-before-commit re-drive — identical payload replays; MUTATED payload is a typed journal conflict', async () => {
  const targetB = { workflowId: 'order-quote', instanceKey: 'instance:div-a' };
  const { runtime, host } = createRuntime({});
  await runtime.openInstance({ target: targetB, correlationId: 'corr:da' });
  host.docs.failNextPutMatching('v08-kernel:wf-instance:order-quote:instance:div-a');
  await assert.rejects(
    () => runtime.submitOccurrence(quoteIntent({ amount: 30, messageId: 'msg:da1', intentType: 'submitQuoteDecisionDynamic', requestId: 'APX-G1', target: targetB })),
    (error: any) => error.code === 'HOST_FAULT_INJECTED',
  );
  assert.equal(host.resources.callCount(), 1);

  const retried = await runtime.submitOccurrence(quoteIntent({ amount: 30, messageId: 'msg:da1', intentType: 'submitQuoteDecisionDynamic', requestId: 'APX-G1', target: targetB }));
  assert.equal(retried.status, 'admitted');
  assert.equal(retried.admitted.effects[0].disposition, 'replayed');
  assert.equal(retried.admitted.effects[0].idempotencyKey, 'reserve:quote:APX-G1');
  assert.equal(host.resources.callCount(), 1, 'zero double dispatch on identical re-drive');

  // MUTATED re-drive (same messageId, different amount): the resolved input
  // is part of the durable effect identity — typed journal conflict.
  const targetC = { workflowId: 'order-quote', instanceKey: 'instance:div-b' };
  await runtime.openInstance({ target: targetC, correlationId: 'corr:db' });
  host.docs.failNextPutMatching('v08-kernel:wf-instance:order-quote:instance:div-b');
  await assert.rejects(
    () => runtime.submitOccurrence(quoteIntent({ amount: 30, messageId: 'msg:db1', intentType: 'submitQuoteDecisionDynamic', requestId: 'APX-G2', target: targetC })),
    (error: any) => error.code === 'HOST_FAULT_INJECTED',
  );
  await assert.rejects(
    () => runtime.submitOccurrence(quoteIntent({ amount: 31, messageId: 'msg:db1', intentType: 'submitQuoteDecisionDynamic', requestId: 'APX-G2', target: targetC })),
    isTypedError('CentralAdmissionError', 'ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  assert.equal(host.resources.callCount(), 2, 'dynamic keys do not open a double-dispatch route');
});

// ---------------------------------------------------------------------------
// #966 alias isolation — journal-layer snapshot discipline on a NON-cloning
// doc fixture (proves the fix independent of Host cloning behavior).
// ---------------------------------------------------------------------------

test('#966 volatile journal: caller input/return aliases can never contaminate committed state', async () => {
  const journal = new kernel.VolatileAdmissionEffectJournal();
  const record = startedRecord();
  await journal.beginEffect(record);

  // (1) mutate the caller record AFTER a successful begin.
  (record.input as any).amount = 999;
  (record as any).status = 'tampered';
  const storedAfterBegin = await journal.getEffect(EFFECT_ID);
  assert.equal(storedAfterBegin.status, 'started', 'stored identity survives caller mutation');
  assert.deepEqual(storedAfterBegin.input, { reservation: 'quote', amount: 42 });

  // (2) mutate values returned by getEffect / beginEffect-existing.
  storedAfterBegin.input.amount = 777;
  storedAfterBegin.status = 'mutated';
  const rebegin = await journal.beginEffect(startedRecord());
  assert.equal(rebegin.disposition, 'existing');
  rebegin.record.input.amount = 555;

  // (3) complete; mutate the caller outcome object and the returned record.
  const outcome = { status: 'completed', output: { reserved: true, effectId: EFFECT_ID }, completedAt: NOW };
  const completed = await journal.completeEffect(EFFECT_ID, outcome);
  (outcome.output as any).reserved = false;
  completed.output.reserved = false;
  completed.status = 'tampered';

  // (4) mutate a row returned by getRecords.
  const rows = await journal.getRecords();
  rows[0].input.amount = 1;

  const final = await journal.getEffect(EFFECT_ID);
  assert.deepEqual(final, {
    effectId: EFFECT_ID,
    target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
    durableControlTurnId: TURN_ID,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'completed',
    attempt: 1,
    input: { reservation: 'quote', amount: 42 },
    idempotencyKey: 'reserve:quote:1',
    startedAt: NOW,
    output: { reserved: true, effectId: EFFECT_ID },
    completedAt: NOW,
  }, 'the committed canonical result is preserved against every alias route');
});

test('#966 kernel durable journal: committed records are isolated from caller aliases even over a NON-cloning doc fixture', async () => {
  const docs = passThroughDocStore();
  const journal = effectJournal(docs, KERNEL_SHA256);
  const record = startedRecord();
  await journal.beginEffect(record);

  // Store-side alias route: mutate the caller record after begin.
  (record.input as any).amount = 999;
  (record as any).status = 'tampered';
  const storedAfterBegin = await journal.getEffect(EFFECT_ID);
  assert.equal(storedAfterBegin.status, 'started');
  assert.deepEqual(storedAfterBegin.input, { reservation: 'quote', amount: 42 }, 'beginEffect stored a snapshot, not the caller reference');

  // Return-side alias route: the settled record cannot be mutated through
  // the completion result.
  const outcome = { status: 'completed', output: { reserved: true, effectId: EFFECT_ID }, completedAt: NOW };
  const completed = await journal.completeEffect(EFFECT_ID, outcome);
  (outcome.output as any).reserved = false;
  completed.output.reserved = false;
  const final = await journal.getEffect(EFFECT_ID);
  assert.equal(final.status, 'completed');
  assert.deepEqual(final.output, { reserved: true, effectId: EFFECT_ID }, 'the committed outcome is snapshot-isolated');

  // getRecords rows are snapshots too.
  const rows = await journal.getRecords();
  rows[0].input.amount = 1;
  const again = await journal.getEffect(EFFECT_ID);
  assert.deepEqual(again.input, { reservation: 'quote', amount: 42 });
});
