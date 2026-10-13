/**
 * #1003 FR07-KH2 — the REAL production H→K→S bounded model continuation
 * (this file is its OWN clean process: the Host bootstrap is one-shot).
 *
 * Path under test (no direct SDK/Kernel call anywhere):
 *   bootstrapTrustedHost(real SQLite file, physical ModelPort)
 *   → public one-arg DomainHarness.load (via the Host kernel gateway)
 *   → authenticated gateway.send → K per-instance lane
 *   → K-owned continuation loop → S `invokeStep` (ONE physical ModelPort
 *     turn) → K query authorization against the SEALED harness policy →
 *     K-owned read-only instance-context read over the real SQLite doc →
 *     observation + K-attested dependency → next turn … → final
 *   → existing K central admission → durable Journal/Effect → state CAS.
 *
 * The physical store is a REAL SQLite CAS file. A thin delegating wrapper
 * (it still passes the bootstrap true-CAS probe) only COUNTS reads and lets
 * a test hold a barrier on / tamper with ONE specific document read — the
 * fault-injection seam for cancellation-during-read and invalid read
 * output. Every count asserted here is a physical observation: ModelPort
 * invocations recorded by the port itself, Host document reads, ledger
 * resource dispatches, Journal documents and committed instance state.
 *
 * Matrix (#1003@6122627750 §3 + review #1003@6130723310 B2/B3/B4):
 *   FR07-P1 two-turn query→final, measured(2), caller count ignored
 *   FR07-P2 ordinary read failure → observation → bounded recovery
 *   FR07-P3 K-attested dependency, deduplicated, model cannot pre-claim
 *   FR07-N1 unknown capability   FR07-N2 mutation capability forbidden
 *   FR07-N3 maxSteps=1 exhaustion + max-3 exhaustion incl. recovery turns
 *   FR07-N4 cancel during model (observed + late result discarded)
 *   FR07-N5 cancel during read (late read discarded, no turn #2)
 *   FR07-N4b final-ready → admission race closed by the K latch
 *   FR07-N6 invalid read output (schema / missing-version / accessor / cyclic)
 *   FR07-N7 authority-carrying / non-allowlisted finals fail closed
 *   B2 one-turn I04 path ⇒ measured(1); B3 cancel authentication/scope
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  openSqliteCasStore,
  type CasDocumentStore,
  type CasGetResult,
  type CasPutConditions,
  type HostCredential,
  type KernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-fr07-kh2';
const APP = 'continuation-quote';
const MODEL_APP = 'model-quote';
const TENANT = 't1';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const MEASURED = (count: number) => ({ status: 'measured', count, scope: 'bound-model-port-invocations' });

// ---------------------------------------------------------------------------
// Physical store wrapper: REAL SQLite underneath; counts reads; optional
// one-shot barrier or tamper on the Nth read of one exact key.
// ---------------------------------------------------------------------------

interface ReadHook {
  key: string;
  /** Fire on this 1-based read ordinal of `key` (counted from arming). */
  onRead: number;
  seen: number;
  barrier?: { reached: () => void; release: Promise<void> };
  tamper?: (result: CasGetResult) => unknown;
}

function wrapStore(inner: CasDocumentStore): CasDocumentStore & {
  readsOf(key: string): number;
  arm(hook: Omit<ReadHook, 'seen'>): void;
} {
  const reads = new Map<string, number>();
  let hook: ReadHook | undefined;
  return {
    async get(key: string): Promise<CasGetResult | null> {
      reads.set(key, (reads.get(key) ?? 0) + 1);
      const result = await inner.get(key);
      const active = hook;
      if (active !== undefined && active.key === key) {
        active.seen += 1;
        if (active.seen === active.onRead) {
          hook = undefined;
          if (active.barrier !== undefined) {
            active.barrier.reached();
            await active.barrier.release;
          }
          if (active.tamper !== undefined && result !== null) {
            return active.tamper(result) as CasGetResult;
          }
        }
      }
      return result;
    },
    put: (key: string, value: unknown, conditions: CasPutConditions) => inner.put(key, value, conditions),
    remove: (key: string, conditions: CasPutConditions) => inner.remove(key, conditions),
    list: (prefix: string) => inner.list(prefix),
    close: () => inner.close(),
    readsOf: (key: string) => reads.get(key) ?? 0,
    arm(next) {
      hook = { ...next, seen: 0 };
    },
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// Physical ModelPort: scripted per scenario; records EVERY invocation.
// ---------------------------------------------------------------------------

interface Invocation {
  operation: string;
  input: Record<string, any>;
  signalPresent: boolean;
  observedAbort: boolean;
}

type Script = (turn: Record<string, any>, signal: AbortSignal | undefined, record: Invocation) => unknown;

const scripts = new Map<string, Script>();
const invocations: Invocation[] = [];

function finalQuote(amount: number, requestId: string, outcome = 'approve-quote', type = 'QUOTE_DECIDED'): unknown {
  return {
    kind: 'final',
    result: {
      decision: { outcome, data: { amount, requestId } },
      event: { type, payload: { amount, requestId } },
    },
  };
}

function query(capabilityId: string, input: unknown = {}): unknown {
  return { kind: 'query', call: { capabilityId, input } };
}

const modelPort = {
  invoke: async (request: { operation: string; input: unknown; signal?: AbortSignal }) => {
    const input = JSON.parse(JSON.stringify(request.input)) as Record<string, any>;
    const record: Invocation = {
      operation: request.operation,
      input,
      signalPresent: request.signal !== undefined,
      observedAbort: false,
    };
    invocations.push(record);
    if (request.operation === 'quote.advise') {
      // I04 one-turn model-decision app (unchanged #1013 fixture).
      return {
        decision: { outcome: 'model-proposed' },
        event: { type: 'MODEL_QUOTE_DECIDED', payload: { amount: 30, requestId: 'MP-1' } },
      };
    }
    const scenario = String(input.request?.scenario);
    const script = scripts.get(scenario);
    if (script === undefined) throw new Error(`no model script for scenario ${scenario}`);
    return script(input, request.signal, record);
  },
};

function invocationsFor(scenario: string): Invocation[] {
  return invocations.filter((entry) => entry.input.request?.scenario === scenario);
}

// ---------------------------------------------------------------------------
// One Host for the whole file (one-shot bootstrap per process).
// ---------------------------------------------------------------------------

const sqlitePath = sqliteTempPath('fr07kh2');
let handle: TrustedHostHandle;
let store: ReturnType<typeof wrapStore>;
let gateway: KernelGateway;
const ledgerCalls: unknown[] = [];
const operatorC = mintCredential({ tenantId: TENANT, appId: APP, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
const requesterC = mintCredential({ tenantId: TENANT, appId: APP, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
const otherRequesterC = mintCredential({ tenantId: TENANT, appId: APP, subject: 'req-2', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req-2' });
const otherTenantC = mintCredential({ tenantId: 't2', appId: APP, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req-t2' });
const modelOperatorC = mintCredential({ tenantId: TENANT, appId: MODEL_APP, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-mop' });
const modelRequesterC = mintCredential({ tenantId: TENANT, appId: MODEL_APP, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-mreq' });

test.before(async () => {
  store = wrapStore(await openSqliteCasStore({ path: sqlitePath }));
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { store },
    modelPort,
  });
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP, packageRoot: await sealRealApp('continuation'), genesisRoles: ['platform-operator'] });
  await gateway.registerApp({ appId: MODEL_APP, packageRoot: await sealRealApp('model'), genesisRoles: ['platform-operator'] });
});

test.after(async () => {
  await handle.host.close();
  await store.close();
  await rm(sqlitePath, { force: true });
});

function target(instanceKey: string, appId = APP) {
  return { tenantId: TENANT, appId, instanceKey };
}

function instanceDocKey(instanceKey: string): string {
  return `v08-kernel:wf-instance:${APP}:${TENANT}:${APP}:${instanceKey}`;
}

function pinDocKey(instanceKey: string): string {
  return `v08-kernel:governance-pin:${APP}:${TENANT}:${APP}:${instanceKey}`;
}

async function genesis(instanceKey: string): Promise<void> {
  await gateway.activateGenesis(operatorC, { appId: APP, instanceKey });
}

function send(instanceKey: string, scenario: string, extra: Record<string, unknown> = {}, intentType = 'submitContinuationQuote', credential: HostCredential = requesterC) {
  return gateway.send(credential, {
    intentType,
    messageId: `m-${scenario}`,
    input: { scenario, amount: 30, ...extra },
    target: target(instanceKey),
  }) as Promise<Record<string, any>>;
}

async function journalCountFor(instanceKey: string): Promise<number> {
  let count = 0;
  for (const key of await handle.host.docs.list(JOURNAL_PREFIX)) {
    const record = ((await handle.host.docs.get(key))?.value as { record?: { target?: { instanceKey?: string } } }).record;
    if (record?.target?.instanceKey === `${TENANT}:${APP}:${instanceKey}`) count += 1;
  }
  return count;
}

async function stateOf(instanceKey: string): Promise<string> {
  const snapshot = await gateway.queryInstance(requesterC, target(instanceKey)) as { state: { stateKey: string } };
  return snapshot.state.stateKey;
}

/** Zero State/Journal/Effect for a refused/terminated occurrence. */
async function assertNoAuthorityResidue(instanceKey: string, ledgerBefore: number): Promise<void> {
  assert.equal(await stateOf(instanceKey), 'review', 'no state transition was committed');
  assert.equal(await journalCountFor(instanceKey), 0, 'no effect-journal document exists for the instance');
  assert.equal(ledgerCalls.length, ledgerBefore, 'no physical effect was dispatched');
}

// ---------------------------------------------------------------------------
// Positives
// ---------------------------------------------------------------------------

test('FR07-P1: two physical turns around an allowlisted K read; measured(2); caller-supplied counts ignored', async () => {
  const key = 'p1';
  await genesis(key);
  scripts.set('p1', (turn) => (turn.step === 1 ? query('quote.readCustomer') : finalQuote(30, 'P1')));
  const ledgerBefore = ledgerCalls.length;
  const readsBefore = store.readsOf(instanceDocKey(key));

  const receipt = await send(key, 'p1', {
    // Caller/model-supplied accounting is user data: it can never reach the
    // admitted evidence.
    freshModelCallCount: 99,
    modelCallEvidence: { status: 'measured', count: 99, scope: 'bound-model-port-invocations' },
  });

  assert.equal(receipt.status, 'admitted');
  const turns = invocationsFor('p1');
  assert.equal(turns.length, 2, 'exactly two PHYSICAL ModelPort invocations');
  assert.ok(turns.every((turn) => turn.operation === 'quote.continue' && turn.signalPresent), 'every turn carried the request-scoped cancellation signal');
  const [first, second] = turns;
  assert.deepEqual(first?.input.capabilities, ['quote.readCustomer', 'quote.readHistory'], 'only READ capabilities are advertised; the mutation descriptor never is');
  assert.equal(first?.input.step, 1);
  assert.equal(first?.input.maxSteps, 3);
  assert.deepEqual(first?.input.observations, []);
  assert.deepEqual(second?.input.observations, [
    { step: 1, capabilityId: 'quote.readCustomer', ok: true, output: { creditLimit: 40, tier: 'gold' } },
  ], 'turn #2 sees exactly the K-built observation of the K-owned read');
  assert.equal(store.readsOf(instanceDocKey(key)) - readsBefore, 4, 'lane-start read + ONE K query read + the two commit-CAS reads (current + committed verification)');

  const resolver = receipt.admitted.resolver;
  assert.deepEqual(resolver.modelCallEvidence, MEASURED(2), 'K aggregate of trusted per-step evidence — never the caller numbers');
  assert.equal('freshModelCallCount' in resolver, false, 'the legacy numeric handoff is gone from the selected path');
  assert.equal(resolver.source, 'host-model-port');
  assert.equal(resolver.llmAvoided, false);
  assert.deepEqual(resolver.continuation.steps, 2);
  assert.deepEqual(resolver.continuation.queries, 1);
  assert.deepEqual(resolver.continuation.dependencies, [
    { capabilityId: 'quote.readCustomer', source: 'instance-context', workflowInstanceId: `${APP}:${TENANT}:${APP}:${key}`, stateRevision: 0 },
  ]);

  assert.equal(await stateOf(key), 'approved');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'the admitted transition effect dispatched physically once');
  assert.equal(await journalCountFor(key), 1);
});

test('FR07-P2: an ordinary read failure is an observation; one bounded recovery turn then admits', async () => {
  const key = 'p2';
  await genesis(key);
  scripts.set('p2', (turn) => (turn.step === 1 ? query('quote.readHistory') : finalQuote(25, 'P2')));
  const receipt = await send(key, 'p2');
  assert.equal(receipt.status, 'admitted');
  const turns = invocationsFor('p2');
  assert.equal(turns.length, 2);
  assert.deepEqual(turns[1]?.input.observations, [
    { step: 1, capabilityId: 'quote.readHistory', ok: false, error: { code: 'QUERY_SOURCE_MISSING' } },
  ]);
  assert.deepEqual(receipt.admitted.resolver.modelCallEvidence, MEASURED(2));
  assert.deepEqual(receipt.admitted.resolver.continuation.dependencies, [], 'a failed read attests no dependency');
  assert.equal(await stateOf(key), 'approved');
});

test('FR07-P3: a repeated read attests ONE K dependency; the model cannot pre-claim provenance', async () => {
  const key = 'p3';
  await genesis(key);
  scripts.set('p3', (turn) => (turn.step <= 2 ? query('quote.readCustomer', { fields: ['tier'] }) : finalQuote(20, 'P3')));
  const receipt = await send(key, 'p3');
  assert.equal(receipt.status, 'admitted');
  assert.equal(invocationsFor('p3').length, 3);
  assert.deepEqual(invocationsFor('p3')[2]?.input.observations.map((entry: { output: unknown }) => entry.output), [{ tier: 'gold' }, { tier: 'gold' }]);
  const continuation = receipt.admitted.resolver.continuation;
  assert.equal(continuation.queries, 2);
  assert.equal(continuation.dependencies.length, 1, 'deduplicated K-attested dependency');
  assert.deepEqual(receipt.admitted.resolver.modelCallEvidence, MEASURED(3));

  // A model final that tries to carry provenance/dependencies is not canonical.
  const keyClaim = 'p3-claim';
  await genesis(keyClaim);
  scripts.set('p3-claim', () => ({ ...(finalQuote(20, 'P3C') as object), dependencies: [{ capabilityId: 'quote.readCustomer' }] }));
  const ledgerBefore = ledgerCalls.length;
  await assert.rejects(send(keyClaim, 'p3-claim'), (error: { code?: string }) => error.code === 'SDK_MODEL_OUTPUT_INVALID');
  await assertNoAuthorityResidue(keyClaim, ledgerBefore);
});

test('B2: the unchanged one-turn I04 model path admits with exactly measured(1)', async () => {
  await gateway.activateGenesis(modelOperatorC, { appId: MODEL_APP, instanceKey: 'one-turn' });
  const before = invocations.filter((entry) => entry.operation === 'quote.advise').length;
  const receipt = await gateway.send(modelRequesterC, {
    intentType: 'submitModelQuoteDecision',
    messageId: 'm-one-turn',
    input: { amount: 30, requestId: 'MP-1', freshModelCallCount: 7 },
    target: target('one-turn', MODEL_APP),
  }) as Record<string, any>;
  assert.equal(receipt.status, 'admitted');
  assert.equal(invocations.filter((entry) => entry.operation === 'quote.advise').length - before, 1);
  assert.deepEqual(receipt.admitted.resolver.modelCallEvidence, MEASURED(1));
  assert.equal('freshModelCallCount' in receipt.admitted.resolver, false);
  assert.equal('continuation' in receipt.admitted.resolver, false, 'the one-turn path is not a continuation');
});

// ---------------------------------------------------------------------------
// Query authorization negatives
// ---------------------------------------------------------------------------

test('FR07-N1: unknown capability ⇒ typed UNKNOWN_CAPABILITY; zero query execution, zero turn #2', async () => {
  const key = 'n1';
  await genesis(key);
  scripts.set('n1', () => query('quote.deleteEverything'));
  const ledgerBefore = ledgerCalls.length;
  const readsBefore = store.readsOf(instanceDocKey(key));
  const receipt = await send(key, 'n1');
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'UNKNOWN_CAPABILITY');
  assert.equal(invocationsFor('n1').length, 1);
  assert.equal(store.readsOf(instanceDocKey(key)) - readsBefore, 1, 'only the lane-start read; the query executor never ran');
  assert.deepEqual(receipt.resolver.modelCallEvidence, MEASURED(1), 'the completed physical turn is still truthfully accounted');
  await assertNoAuthorityResidue(key, ledgerBefore);
});

test('FR07-N2: a declared mutation capability is never advertised and is refused if requested anyway', async () => {
  const key = 'n2';
  await genesis(key);
  scripts.set('n2', () => query('quote.reserveFunds', { amount: 1 }));
  const ledgerBefore = ledgerCalls.length;
  const readsBefore = store.readsOf(instanceDocKey(key));
  const receipt = await send(key, 'n2');
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'MUTATION_CAPABILITY_FORBIDDEN');
  assert.equal(invocationsFor('n2').length, 1);
  assert.equal(invocationsFor('n2')[0]?.input.capabilities.includes('quote.reserveFunds'), false);
  assert.equal(store.readsOf(instanceDocKey(key)) - readsBefore, 1);
  await assertNoAuthorityResidue(key, ledgerBefore);
});

test('FR07-N3: maxSteps=1 permits turn #1 and its read but no turn #2; max-3 exhausts incl. recovery turns', async () => {
  const key = 'n3';
  await genesis(key);
  scripts.set('n3', () => query('quote.readCustomer'));
  const ledgerBefore = ledgerCalls.length;
  const readsBefore = store.readsOf(instanceDocKey(key));
  const receipt = await send(key, 'n3', {}, 'submitContinuationQuoteOneStep');
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'MAX_STEPS_EXHAUSTED');
  assert.equal(invocationsFor('n3').length, 1, 'no second model call');
  assert.equal(store.readsOf(instanceDocKey(key)) - readsBefore, 2, 'the allowed read of turn #1 completed');
  await assertNoAuthorityResidue(key, ledgerBefore);

  const keyRecovery = 'n3-recovery';
  await genesis(keyRecovery);
  scripts.set('n3-recovery', () => query('quote.readHistory'));
  const exhausted = await send(keyRecovery, 'n3-recovery');
  assert.equal(exhausted.status, 'terminated');
  assert.equal(exhausted.terminal.code, 'MAX_STEPS_EXHAUSTED');
  assert.equal(invocationsFor('n3-recovery').length, 3, 'recovery turns consume the same absolute budget; no hidden retries');
  assert.deepEqual(exhausted.resolver.modelCallEvidence, MEASURED(3));
  await assertNoAuthorityResidue(keyRecovery, ledgerBefore);
});

// ---------------------------------------------------------------------------
// Cancellation (B3)
// ---------------------------------------------------------------------------

test('FR07-N4: cancel during an active model turn ⇒ the physical port observes it; CANCELLED; zero authority', async () => {
  const key = 'n4';
  await genesis(key);
  const entered = deferred();
  scripts.set('n4', (_turn, signal, record) => new Promise((_resolve, reject) => {
    entered.resolve();
    signal?.addEventListener('abort', () => {
      record.observedAbort = true;
      reject(new Error('aborted by the request-scoped signal'));
    }, { once: true });
  }));
  const ledgerBefore = ledgerCalls.length;
  const pending = send(key, 'n4');
  await entered.promise;
  assert.deepEqual(await gateway.cancel(requesterC, { target: target(key), messageId: 'm-n4' }), { status: 'cancel-requested' });
  const receipt = await pending;
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'CANCELLED');
  assert.equal(invocationsFor('n4').length, 1);
  assert.equal(invocationsFor('n4')[0]?.observedAbort, true, 'the physical model invocation observed the cancellation');
  await assertNoAuthorityResidue(key, ledgerBefore);
  assert.deepEqual(await gateway.cancel(requesterC, { target: target(key), messageId: 'm-n4' }), { status: 'not-in-flight' });
});

test('FR07-N4: a late final that ignores the signal is discarded by the K latch', async () => {
  const key = 'n4-late';
  await genesis(key);
  const entered = deferred();
  const release = deferred();
  scripts.set('n4-late', async () => {
    entered.resolve();
    await release.promise;
    return finalQuote(30, 'LATE');
  });
  const ledgerBefore = ledgerCalls.length;
  const pending = send(key, 'n4-late');
  await entered.promise;
  await gateway.cancel(requesterC, { target: target(key), messageId: 'm-n4-late' });
  release.resolve();
  const receipt = await pending;
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'CANCELLED');
  await assertNoAuthorityResidue(key, ledgerBefore);
});

test('FR07-N5: cancel during the K read ⇒ late read discarded; model turn #2 never happens', async () => {
  const key = 'n5';
  await genesis(key);
  scripts.set('n5', (turn) => (turn.step === 1 ? query('quote.readCustomer') : finalQuote(30, 'N5')));
  const reached = deferred();
  const release = deferred();
  // Read #1 = lane start; read #2 = THE K query read (held at the barrier).
  store.arm({ key: instanceDocKey(key), onRead: 2, barrier: { reached: reached.resolve, release: release.promise } });
  const ledgerBefore = ledgerCalls.length;
  const pending = send(key, 'n5');
  await reached.promise;
  assert.deepEqual(await gateway.cancel(requesterC, { target: target(key), messageId: 'm-n5' }), { status: 'cancel-requested' });
  release.resolve();
  const receipt = await pending;
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'CANCELLED');
  assert.equal(invocationsFor('n5').length, 1, 'model turn #2 = 0');
  await assertNoAuthorityResidue(key, ledgerBefore);
});

test('FR07-N4b: cancel after the final model result is ready but before admission ⇒ CANCELLED, zero admission', async () => {
  const key = 'n4b';
  await genesis(key);
  const cancelResults: unknown[] = [];
  scripts.set('n4b', async () => {
    // The model's final result is READY; the authenticated cancel completes
    // before that result is delivered to K, so K resumes with a valid final
    // envelope and must stop at the pre-admission latch.
    const ready = finalQuote(30, 'N4B');
    cancelResults.push(await gateway.cancel(requesterC, { target: target(key), messageId: 'm-n4b' }));
    return ready;
  });
  const ledgerBefore = ledgerCalls.length;
  const pinReadsBefore = store.readsOf(pinDocKey(key));
  const receipt = await send(key, 'n4b');
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'CANCELLED');
  assert.deepEqual(cancelResults, [{ status: 'cancel-requested' }]);
  assert.equal(invocationsFor('n4b').length, 1);
  assert.equal(store.readsOf(pinDocKey(key)) - pinReadsBefore, 0, 'central admission never started (no governance pin read)');
  await assertNoAuthorityResidue(key, ledgerBefore);
});

test('B3 latch: a cancel that arrives once K admission has begun cannot half-cancel the authoritative occurrence', async () => {
  const key = 'latched';
  await genesis(key);
  scripts.set('latched', () => finalQuote(30, 'LATCHED'));
  const reached = deferred();
  const release = deferred();
  // The first admission read is the governance pin; hold it there.
  store.arm({ key: pinDocKey(key), onRead: 1, barrier: { reached: reached.resolve, release: release.promise } });
  const ledgerBefore = ledgerCalls.length;
  const pending = send(key, 'latched');
  await reached.promise;
  await gateway.cancel(requesterC, { target: target(key), messageId: 'm-latched' });
  release.resolve();
  const receipt = await pending;
  assert.equal(receipt.status, 'admitted', 'the K latch closed before admission; admission is atomic');
  assert.equal(await stateOf(key), 'approved');
  assert.equal(ledgerCalls.length - ledgerBefore, 1);
  assert.equal(await journalCountFor(key), 1);
});

test('B3: cancellation is H-authenticated and scoped to the submitting principal', async () => {
  const key = 'n4-authz';
  await genesis(key);
  const entered = deferred();
  const release = deferred();
  scripts.set('n4-authz', async () => {
    entered.resolve();
    await release.promise;
    return finalQuote(30, 'AUTHZ');
  });
  const pending = send(key, 'n4-authz');
  await entered.promise;
  await assert.rejects(
    gateway.cancel(otherRequesterC, { target: target(key), messageId: 'm-n4-authz' }),
    (error: { code?: string }) => error.code === 'HOST_CANCEL_DENIED',
  );
  await assert.rejects(
    gateway.cancel(otherTenantC, { target: target(key), messageId: 'm-n4-authz' }),
    (error: { code?: string }) => typeof error.code === 'string' && error.code.startsWith('HOST_'),
  );
  await assert.rejects(
    gateway.cancel({ forged: true } as unknown as HostCredential, { target: target(key), messageId: 'm-n4-authz' }),
  );
  release.resolve();
  const receipt = await pending;
  assert.equal(receipt.status, 'admitted', 'no refused cancel attempt affected the occurrence');
});

// ---------------------------------------------------------------------------
// Read output and final-envelope negatives
// ---------------------------------------------------------------------------

test('FR07-N6: a read output violating its sealed contract ⇒ QUERY_OUTPUT_INVALID; no turn #2', async () => {
  const key = 'n6-schema';
  await genesis(key);
  scripts.set('n6-schema', () => query('quote.readCustomer'));
  const ledgerBefore = ledgerCalls.length;
  const receipt = await send(key, 'n6-schema', {}, 'submitContinuationQuoteBadSchema');
  assert.equal(receipt.status, 'terminated');
  assert.equal(receipt.terminal.code, 'QUERY_OUTPUT_INVALID');
  assert.equal(invocationsFor('n6-schema').length, 1);
  await assertNoAuthorityResidue(key, ledgerBefore);
});

test('FR07-N6: missing-version / accessor / cyclic read material from storage ⇒ QUERY_OUTPUT_INVALID', async () => {
  const tampers: Record<string, (result: CasGetResult) => unknown> = {
    'n6-version': (result) => {
      const value = { ...(result.value as Record<string, unknown>) };
      delete value.stateRevision;
      return { ...result, value };
    },
    'n6-accessor': (result) => {
      const value = result.value as { state: { context: Record<string, unknown> } };
      const context = { ...value.state.context };
      Object.defineProperty(context, 'customerTier', { get: () => 'platinum', enumerable: true });
      return { ...result, value: { ...value, state: { ...value.state, context } } };
    },
    'n6-cyclic': (result) => {
      const value = result.value as { state: { context: Record<string, unknown> } };
      const context: Record<string, unknown> = { ...value.state.context };
      context.self = context;
      return { ...result, value: { ...value, state: { ...value.state, context } } };
    },
  };
  for (const [scenario, tamper] of Object.entries(tampers)) {
    await genesis(scenario);
    scripts.set(scenario, () => query('quote.readCustomer'));
    store.arm({ key: instanceDocKey(scenario), onRead: 2, tamper });
    const ledgerBefore = ledgerCalls.length;
    const receipt = await send(scenario, scenario);
    assert.equal(receipt.status, 'terminated', scenario);
    assert.equal(receipt.terminal.code, 'QUERY_OUTPUT_INVALID', scenario);
    assert.equal(invocationsFor(scenario).length, 1, `${scenario}: no second model turn`);
    await assertNoAuthorityResidue(scenario, ledgerBefore);
  }
});

test('FR07-N7: authority-carrying or non-allowlisted finals fail closed before any K state/effect', async () => {
  const cases: Record<string, { reply: unknown; expect: string; thrown: boolean }> = {
    'n7-nextstate': { reply: { ...(finalQuote(30, 'N7') as object), nextState: 'approved' }, expect: 'SDK_MODEL_AUTHORITY_REFUSED', thrown: true },
    'n7-governance': { reply: { ...(finalQuote(30, 'N7') as object), governanceBaseline: 'x' }, expect: 'SDK_MODEL_AUTHORITY_REFUSED', thrown: true },
    'n7-nested': {
      reply: { kind: 'final', result: { decision: { outcome: 'approve-quote', data: {}, transition: 'approve' }, event: { type: 'QUOTE_DECIDED', payload: { amount: 1 } } } },
      expect: 'SDK_MODEL_OUTPUT_INVALID',
      thrown: true,
    },
    'n7-outcome': { reply: finalQuote(30, 'N7', 'force-approve'), expect: 'FINAL_OUTCOME_NOT_ALLOWED', thrown: false },
    'n7-event': { reply: finalQuote(30, 'N7', 'approve-quote', 'QUOTE_FORCED'), expect: 'FINAL_EVENT_NOT_ALLOWED', thrown: false },
  };
  for (const [scenario, spec] of Object.entries(cases)) {
    await genesis(scenario);
    scripts.set(scenario, () => spec.reply);
    const ledgerBefore = ledgerCalls.length;
    if (spec.thrown) {
      await assert.rejects(send(scenario, scenario), (error: { code?: string }) => error.code === spec.expect, scenario);
    } else {
      const receipt = await send(scenario, scenario);
      assert.equal(receipt.status, 'terminated', scenario);
      assert.equal(receipt.terminal.code, spec.expect, scenario);
    }
    await assertNoAuthorityResidue(scenario, ledgerBefore);
  }
});
