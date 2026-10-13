/**
 * #1003 / PR #1018 — WEB-ORACLE-1 FR02 / FR07 sentinels rebound to the
 * CURRENT selected K/S/Host physical path (this file is its OWN clean
 * process: the Host bootstrap is one-shot).
 *
 * Path under test (no direct SDK/Kernel call anywhere in this file):
 *   compiler BUILD (static qualification → external issuer approval → seal)
 *   → approved sealed root → bootstrapTrustedHost(REAL SQLite file,
 *     physical scripted ModelPort) → Host kernel gateway registerApp
 *   → authenticated gateway.send → selected K per-instance lane
 *   → FR02: S interpret(rule.payloadExpression) → K central admission
 *   → FR07: K bounded continuation → S invokeStep (ONE physical ModelPort
 *     turn) → K query authorization against the SEALED harness policy →
 *     K-owned read over the real SQLite instance document → observation /
 *     K-attested dependency → next turn … → final → K central admission
 *   → durable Effect Journal → physical ledger resource → state CAS.
 *
 * The SQLite store is wrapped by a thin delegating counter (it still passes
 * the bootstrap true-CAS probe) that only COUNTS reads and can hold a
 * barrier on / tamper with ONE specific document read. Every count asserted
 * here is a physical observation: ModelPort invocations recorded by the port
 * itself, Host document reads, ledger resource dispatches, Journal documents
 * and committed instance state.
 *
 * Sentinels converted (historic v0.7 oracle @86110c6 — see
 * docs/validation/v08-fr02-fr07-oracle-map.md for the exact pins and every
 * documented adaptation):
 *   V08-FR02-P-F01  V08-FR02-N-F02  V08-FR02-N-F03
 *   V08-FR07-P-F01  V08-FR07-N-F02  V08-FR07-N-F03  V08-FR07-N-F04
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
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
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-tf-fr02-fr07-selected';
const TENANT = 't1';
const FR02_APP = 'tf-fr02-expression';
const FR07_APP = 'tf-fr07-harness';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const MEASURED = (count: number) => ({ status: 'measured', count, scope: 'bound-model-port-invocations' });

// v0.7 FR02 oracle (portable-expression.test.ts @86110c6, blob c9cf11e3).
const LEGACY_CLOCK = '2026-09-17T02:00:00.123Z';
const LEGACY_FR02_EXPECTED = Object.freeze({ value: 42, now: LEGACY_CLOCK, millis: 1789610400123 });
const SHIFTED_CLOCK = '2027-01-02T03:04:05.678Z';

// ---------------------------------------------------------------------------
// Local sealed closure (compiler BUILD API; same approach as helpers.ts
// sealRealApp, which is not edited by this PR).
// ---------------------------------------------------------------------------

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);

function firstEndpointId(endpoints: unknown): string {
  const first = (endpoints as { endpointId?: unknown }[])[0];
  if (typeof first?.endpointId !== 'string' || first.endpointId.length === 0) {
    throw new Error('fixture: package declares no first endpoint');
  }
  return first.endpointId;
}

async function sealSelectedApp(fixtureFile: string, appId: string): Promise<SealedQualifiedPackageRoot> {
  const businessModule = await import(new URL(fixtureFile, fixtureDir).href) as Record<string, unknown>;
  const kernelMeta = await import(new URL('kernel-mechanism-v1.mjs', payloadDir).href) as Record<string, unknown>;
  const sdkMeta = await import(new URL('standard-sdk-v1.mjs', payloadDir).href) as Record<string, unknown>;
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL(fixtureFile, fixtureDir), 'utf8'),
  ]);
  const kernelId = kernelMeta.MODULE_ID as string;
  const sdkId = sdkMeta.MODULE_ID as string;
  const businessId = businessModule.MODULE_ID as string;
  const businessEndpointId = firstEndpointId(businessModule.ENDPOINTS);
  const intentTypes = businessModule.INTENT_TYPES as string[];
  const submission = {
    rootPackageId: `app:v08:${appId}`,
    packages: [
      {
        packageId: kernelId, kind: 'kernel' as const, abiVersion: kernelMeta.ABI_VERSION as string,
        modulePath: 'modules/kernel.mjs', moduleSource: kernelSource,
        endpoints: kernelMeta.ENDPOINTS as { endpointId: string; kind: string }[],
      },
      {
        packageId: sdkId, kind: 'standard-sdk' as const, abiVersion: sdkMeta.ABI_VERSION as string,
        modulePath: 'modules/standard.mjs', moduleSource: sdkSource,
        endpoints: sdkMeta.ENDPOINTS as { endpointId: string; kind: string }[],
      },
      {
        packageId: businessId, kind: 'business' as const, abiVersion: businessModule.ABI_VERSION as string,
        modulePath: 'modules/business.mjs', moduleSource: businessSource,
        endpoints: businessModule.ENDPOINTS as { endpointId: string; kind: string }[],
        intentTypes,
      },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernelId, endpointId: firstEndpointId(kernelMeta.ENDPOINTS) },
      { role: 'standard-sdk' as const, packageId: sdkId, endpointId: firstEndpointId(sdkMeta.ENDPOINTS) },
      { role: 'business' as const, packageId: businessId, endpointId: businessEndpointId },
      ...intentTypes.map((intentType) => ({
        role: 'intent' as const, intentType, packageId: businessId, endpointId: businessEndpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-12T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-tf-1018-selected',
  });
}

// ---------------------------------------------------------------------------
// Physical store wrapper: REAL SQLite underneath; counts reads; optional
// one-shot barrier or tamper on the Nth read of one exact key.
// ---------------------------------------------------------------------------

interface ReadHook {
  key: string;
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

/** The exact v0.7 oracle final (business-harness-machine.test.ts finalResponse()). */
function finalResponse(outcome = 'QUOTE', eventType = 'QUOTE_REQUESTED'): unknown {
  return {
    kind: 'final',
    result: {
      decision: { outcome, data: { reasonCode: 'catalog-match' } },
      event: { type: eventType, payload: { sku: 'P-1' } },
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

const sqlitePath = sqliteTempPath('tf1018sel');
let handle: TrustedHostHandle;
let store: ReturnType<typeof wrapStore>;
let gateway: KernelGateway;
const ledgerCalls: { operation: string; payload: Record<string, unknown> }[] = [];

function credentialsFor(appId: string) {
  return {
    operator: mintCredential({ tenantId: TENANT, appId, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: `g-op-${appId}` }),
    requester: mintCredential({ tenantId: TENANT, appId, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: `g-req-${appId}` }),
  };
}
const fr02C = credentialsFor(FR02_APP);
const fr07C = credentialsFor(FR07_APP);
const fr07OtherRequesterC = mintCredential({ tenantId: TENANT, appId: FR07_APP, subject: 'req-2', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req-2' });

test.before(async () => {
  store = wrapStore(await openSqliteCasStore({ path: sqlitePath }));
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { store },
    modelPort,
  });
  handle.host.resources.provision('ledger', (operation: string, payload: unknown) => {
    ledgerCalls.push({ operation, payload: payload as Record<string, unknown> });
    return { recorded: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: FR02_APP, packageRoot: await sealSelectedApp('tf-fr02-fr07-expression.mjs', FR02_APP), genesisRoles: ['platform-operator'] });
  await gateway.registerApp({ appId: FR07_APP, packageRoot: await sealSelectedApp('tf-fr02-fr07-harness.mjs', FR07_APP), genesisRoles: ['platform-operator'] });
});

test.after(async () => {
  await handle.host.close();
  await store.close();
  await rm(sqlitePath, { force: true });
});

function target(appId: string, instanceKey: string) {
  return { tenantId: TENANT, appId, instanceKey };
}

function instanceDocKey(appId: string, instanceKey: string): string {
  return `v08-kernel:wf-instance:${appId}:${TENANT}:${appId}:${instanceKey}`;
}

async function journalCountFor(appId: string, instanceKey: string): Promise<number> {
  let count = 0;
  for (const key of await handle.host.docs.list(JOURNAL_PREFIX)) {
    const record = ((await handle.host.docs.get(key))?.value as { record?: { target?: { instanceKey?: string } } }).record;
    if (record?.target?.instanceKey === `${TENANT}:${appId}:${instanceKey}`) count += 1;
  }
  return count;
}

async function stateOf(appId: string, credential: HostCredential, instanceKey: string): Promise<string> {
  const snapshot = await gateway.queryInstance(credential, target(appId, instanceKey)) as { state: { stateKey: string } };
  return snapshot.state.stateKey;
}

/** Zero State/Journal/Effect for a refused/terminated occurrence. */
async function assertNoAuthorityResidue(appId: string, instanceKey: string, ledgerBefore: number): Promise<void> {
  const credential = appId === FR02_APP ? fr02C.requester : fr07C.requester;
  const initial = appId === FR02_APP ? 'review' : 'evaluating';
  assert.equal(await stateOf(appId, credential, instanceKey), initial, `${instanceKey}: no state transition was committed`);
  assert.equal(await journalCountFor(appId, instanceKey), 0, `${instanceKey}: no effect-journal document exists`);
  assert.equal(ledgerCalls.length, ledgerBefore, `${instanceKey}: no physical effect was dispatched`);
}

// ---------------------------------------------------------------------------
// FR02 — selected S payloadExpression through K on real SQLite
// ---------------------------------------------------------------------------

function sendFr02(instanceKey: string, intentType: string, input: Record<string, unknown>, messageId = `m-${instanceKey}`) {
  return gateway.send(fr02C.requester, {
    intentType,
    messageId,
    input,
    target: target(FR02_APP, instanceKey),
  }) as Promise<Record<string, any>>;
}

async function fr02Genesis(instanceKey: string): Promise<void> {
  await gateway.activateGenesis(fr02C.operator, { appId: FR02_APP, instanceKey });
}

/**
 * Strip the per-instance identity (instance key and the per-instance
 * Governance pin binding digest) so two replays compare byte-for-byte.
 */
function normalizedAdmission(receipt: Record<string, any>, instanceKey: string): string {
  const { governanceBindingDigest, ...rest } = receipt.admitted as Record<string, unknown>;
  assert.match(String(governanceBindingDigest), /^[0-9a-f]{64}$/);
  return JSON.stringify(rest).split(instanceKey).join('<instance>');
}

async function assertFr02Admitted(instanceKey: string, receipt: Record<string, any>, eventType: string, ledgerBefore: number): Promise<void> {
  assert.equal(receipt.status, 'admitted', `${instanceKey}: ${JSON.stringify(receipt.denial ?? null)}`);
  assert.equal(receipt.admitted.transitionKey, `evaluate:${eventType}`);
  assert.equal(receipt.admitted.targetState, 'evaluated');
  assert.equal(await stateOf(FR02_APP, fr02C.requester, instanceKey), 'evaluated');
  assert.equal(await journalCountFor(FR02_APP, instanceKey), 1);
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'the admitted transition effect dispatched physically once');
  assert.equal(ledgerCalls.at(-1)?.payload.record, `fr02:${eventType}`);
}

test('V08-FR02-P-F01: exact v0.7 {value:42,now,millis} admitted through sealed S payloadExpression + K guard on real SQLite; logical-time replay is byte-identical', async () => {
  const modelCallsBefore = invocations.length;

  // (1) v0.7 exact observable. The K guard guard:fr02-legacy-exact admits
  // only value=42 / now=LEGACY_CLOCK / millis=1789610400123 and the sealed
  // Business schema admits only exactly the keys {value, now, millis}.
  await fr02Genesis('legacy-a');
  let ledgerBefore = ledgerCalls.length;
  const first = await sendFr02('legacy-a', 'evaluateLegacy', { input: { value: 21 } }, 'm-fr02-legacy');
  await assertFr02Admitted('legacy-a', first, 'FR02_LEGACY', ledgerBefore);
  assert.deepEqual(first.admitted.resolver, {
    source: 'harness-machine',
    llmAvoided: true,
    modelCallEvidence: MEASURED(0),
    cacheRead: 'disabled',
    telemetryEventCount: 0,
  }, 'a model-free Standard Rule: zero calls through the bound ModelPort');
  assert.deepEqual(LEGACY_FR02_EXPECTED, { value: 42, now: LEGACY_CLOCK, millis: Date.parse(LEGACY_CLOCK) });

  // (2) Differential: the guard really observes the computed payload —
  // value 22 ⇒ 44 ≠ 42 is denied by the SAME guard with zero residue.
  await fr02Genesis('legacy-differential');
  ledgerBefore = ledgerCalls.length;
  const differential = await sendFr02('legacy-differential', 'evaluateLegacy', { input: { value: 22 } });
  assert.equal(differential.status, 'denied');
  assert.equal(differential.denial.reason, 'guard');
  assert.equal(differential.denial.guardId, 'guard:fr02-legacy-exact');
  await assertNoAuthorityResidue(FR02_APP, 'legacy-differential', ledgerBefore);

  // (3) Determinism / replay: the same sealed logical time and input on a
  // second instance yields a byte-identical admission (identity stripped).
  await fr02Genesis('legacy-b');
  ledgerBefore = ledgerCalls.length;
  const replay = await sendFr02('legacy-b', 'evaluateLegacy', { input: { value: 21 } }, 'm-fr02-legacy');
  await assertFr02Admitted('legacy-b', replay, 'FR02_LEGACY', ledgerBefore);
  assert.equal(normalizedAdmission(replay, 'legacy-b'), normalizedAdmission(first, 'legacy-a'));

  // (4) $now/$millis come from the SEALED declaration logicalTime, never the
  // ambient Host clock: a sibling rule sealed at SHIFTED_CLOCK admits only
  // through its own exact guard (value 42, now/millis = SHIFTED_CLOCK).
  await fr02Genesis('shifted');
  ledgerBefore = ledgerCalls.length;
  const shifted = await sendFr02('shifted', 'evaluateShifted', { input: { value: 21 } });
  await assertFr02Admitted('shifted', shifted, 'FR02_SHIFTED', ledgerBefore);
  assert.notEqual(new Date().toISOString().slice(0, 10), LEGACY_CLOCK.slice(0, 10));
  assert.notEqual(new Date().toISOString().slice(0, 10), SHIFTED_CLOCK.slice(0, 10));

  assert.equal(invocations.length, modelCallsBefore, 'FR02 never reaches the physical ModelPort');
});

test('V08-FR02-N-F02: $eval / $random / clock-argument policy denials fail closed typed through K; zero State/Journal/Effect', async () => {
  const cases: [string, RegExp][] = [
    ['evaluateEval', /\$eval is forbidden/],
    ['evaluateEvalVariable', /\$eval is forbidden/],
    ['evaluateRandom', /\$random is forbidden/],
    ['evaluateNowArgument', /arguments are not supported/],
    ['evaluateMillisArgument', /arguments are not supported/],
  ];
  const modelCallsBefore = invocations.length;
  for (const [intentType, message] of cases) {
    const key = `deny-${intentType}`;
    await fr02Genesis(key);
    const ledgerBefore = ledgerCalls.length;
    await assert.rejects(
      sendFr02(key, intentType, { input: { value: 21 } }),
      (error: { code?: string; message?: string }) => error.code === 'SDK_EXPRESSION_FORBIDDEN' && message.test(String(error.message)),
      intentType,
    );
    await assertNoAuthorityResidue(FR02_APP, key, ledgerBefore);
  }
  assert.equal(invocations.length, modelCallsBefore);
});

test('V08-FR02-N-F03: UTF-8 byte limits and the deterministic step budget (v0.7 timeoutMs adaptation) fail closed through K; exact limits admit', async () => {
  const text = { input: { text: '缅甸' } };
  // Input: 23 UTF-16 code units / 27 UTF-8 bytes. A code-unit limit of 26
  // would pass; the byte limit refuses it; 27 bytes admits.
  await fr02Genesis('bytes-in-over');
  let ledgerBefore = ledgerCalls.length;
  await assert.rejects(
    sendFr02('bytes-in-over', 'evaluateInputBytesOver', text),
    (error: { code?: string; message?: string }) => error.code === 'SDK_EXPRESSION_BOUNDS' && /maxInputBytes/.test(String(error.message)),
  );
  await assertNoAuthorityResidue(FR02_APP, 'bytes-in-over', ledgerBefore);
  await fr02Genesis('bytes-in-exact');
  ledgerBefore = ledgerCalls.length;
  await assertFr02Admitted('bytes-in-exact', await sendFr02('bytes-in-exact', 'evaluateInputBytesExact', text), 'FR02_BYTES', ledgerBefore);

  // Output: {"t":"缅甸"} is 10 code units / 14 UTF-8 bytes.
  await fr02Genesis('bytes-out-over');
  ledgerBefore = ledgerCalls.length;
  await assert.rejects(
    sendFr02('bytes-out-over', 'evaluateOutputBytesOver', text),
    (error: { code?: string; message?: string }) => error.code === 'SDK_EXPRESSION_BOUNDS' && /maxOutputBytes/.test(String(error.message)),
  );
  await assertNoAuthorityResidue(FR02_APP, 'bytes-out-over', ledgerBefore);
  await fr02Genesis('bytes-out-exact');
  ledgerBefore = ledgerCalls.length;
  await assertFr02Admitted('bytes-out-exact', await sendFr02('bytes-out-exact', 'evaluateOutputBytesExact', text), 'FR02_BYTES', ledgerBefore);

  // Step budget: timeoutMs=1 (512 deterministic steps) cannot evaluate the
  // 1000-element structure — refused typed, identically on every replay
  // (no wall-clock dependence); timeoutMs=2 admits the same source.
  for (const key of ['budget-over-1', 'budget-over-2']) {
    await fr02Genesis(key);
    ledgerBefore = ledgerCalls.length;
    await assert.rejects(
      sendFr02(key, 'evaluateBudgetOver', { input: {} }),
      (error: { code?: string; message?: string }) => error.code === 'SDK_EXPRESSION_TIMEOUT' && /timeoutMs=1/.test(String(error.message)),
      key,
    );
    await assertNoAuthorityResidue(FR02_APP, key, ledgerBefore);
  }
  await fr02Genesis('budget-fits');
  ledgerBefore = ledgerCalls.length;
  await assertFr02Admitted('budget-fits', await sendFr02('budget-fits', 'evaluateBudgetFits', { input: {} }), 'FR02_BUDGET', ledgerBefore);
});

// ---------------------------------------------------------------------------
// FR07 — K-owned bounded continuation with a physical ModelPort
// ---------------------------------------------------------------------------

async function fr07Genesis(instanceKey: string): Promise<void> {
  await gateway.activateGenesis(fr07C.operator, { appId: FR07_APP, instanceKey });
}

function sendFr07(instanceKey: string, scenario: string, extra: Record<string, unknown> = {}, intentType = 'requestQuote') {
  return gateway.send(fr07C.requester, {
    intentType,
    messageId: `m-${scenario}`,
    input: { scenario, requestId: 'rfq-42', sku: 'P-1', ...extra },
    target: target(FR07_APP, instanceKey),
  }) as Promise<Record<string, any>>;
}

// K advertises the sealed READ descriptors in canonical (sorted) order.
const ADVERTISED = ['catalog.badRead', 'catalog.flakyRead', 'catalog.lookup'];

test('V08-FR07-P-F01: two physical model turns around a K-authorized read ⇒ QUOTE / QUOTE_REQUESTED admitted; ModelPort count == measured(2); caller counts ignored', async () => {
  const key = 'p-f01';
  await fr07Genesis(key);
  scripts.set('p-f01', (turn) => (turn.step === 1 ? query('catalog.lookup', { fields: ['available', 'sku'] }) : finalResponse()));
  const ledgerBefore = ledgerCalls.length;
  const readsBefore = store.readsOf(instanceDocKey(FR07_APP, key));

  const receipt = await sendFr07(key, 'p-f01', {
    // Caller/model-shaped accounting is user data and never reaches evidence.
    freshModelCallCount: 99,
    modelCallEvidence: { status: 'measured', count: 99, scope: 'bound-model-port-invocations' },
  });

  assert.equal(receipt.status, 'admitted');
  const turns = invocationsFor('p-f01');
  assert.equal(turns.length, 2, 'exactly two PHYSICAL ModelPort invocations (v0.7: model.requests.length === 2)');
  assert.ok(turns.every((turn) => turn.operation === 'quote.harness' && turn.signalPresent));
  const [first, second] = turns;
  assert.deepEqual(first?.input.capabilities, ADVERTISED, 'only READ capabilities are advertised; customer.charge never is');
  assert.equal(first?.input.step, 1);
  assert.equal(first?.input.maxSteps, 4);
  assert.deepEqual(first?.input.observations, []);
  assert.deepEqual(second?.input.observations, [
    { step: 1, capabilityId: 'catalog.lookup', ok: true, output: { available: true, sku: 'P-1' } },
  ], 'turn #2 sees exactly the K-built observation of the K-owned read');
  assert.equal(store.readsOf(instanceDocKey(FR07_APP, key)) - readsBefore, 4, 'lane-start read + ONE K query read + two commit-CAS reads');

  const resolver = receipt.admitted.resolver;
  assert.deepEqual(resolver.modelCallEvidence, MEASURED(2), 'K aggregate of trusted per-step evidence == physical count, never the caller 99');
  assert.equal(resolver.modelCallEvidence.count, turns.length);
  assert.equal('freshModelCallCount' in resolver, false);
  assert.equal(resolver.source, 'host-model-port');
  assert.equal(resolver.llmAvoided, false);
  assert.equal(resolver.continuation.steps, 2);
  assert.equal(resolver.continuation.queries, 1);
  assert.deepEqual(resolver.continuation.dependencies, [
    { capabilityId: 'catalog.lookup', source: 'instance-context', workflowInstanceId: `${FR07_APP}:${TENANT}:${FR07_APP}:${key}`, stateRevision: 0 },
  ], 'query provenance is K-attested once (v0.7 observedDependencies catalog:P-1 adaptation)');

  assert.equal(receipt.admitted.transitionKey, 'quote');
  assert.equal(receipt.admitted.targetState, 'quoted');
  assert.equal(await stateOf(FR07_APP, fr07C.requester, key), 'quoted');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'the admitted QUOTE_REQUESTED transition effect dispatched once');
  assert.equal(await journalCountFor(FR07_APP, key), 1);
});

test('V08-FR07-N-F02: unknown capability ⇒ UNKNOWN_CAPABILITY and mutation capability ⇒ MUTATION_CAPABILITY_FORBIDDEN, both before any read; zero authority', async () => {
  // Unknown capability (v0.7: executions === 0).
  const unknown = 'n-f02-unknown';
  await fr07Genesis(unknown);
  scripts.set(unknown, () => query('catalog.unknownRead'));
  let ledgerBefore = ledgerCalls.length;
  let readsBefore = store.readsOf(instanceDocKey(FR07_APP, unknown));
  const unknownReceipt = await sendFr07(unknown, unknown);
  assert.equal(unknownReceipt.status, 'terminated');
  assert.equal(unknownReceipt.terminal.code, 'UNKNOWN_CAPABILITY');
  assert.equal(unknownReceipt.terminal.capabilityId, 'catalog.unknownRead');
  assert.equal(invocationsFor(unknown).length, 1, 'no second model turn');
  assert.equal(store.readsOf(instanceDocKey(FR07_APP, unknown)) - readsBefore, 1, 'only the lane-start read; the K query executor never ran');
  assert.deepEqual(unknownReceipt.resolver.modelCallEvidence, MEASURED(1));
  await assertNoAuthorityResidue(FR07_APP, unknown, ledgerBefore);

  // Mutation capability: hidden from the model and refused if requested
  // anyway (v0.7: requests[0].queries === [], mutations === 0).
  const mutation = 'n-f02-mutation';
  await fr07Genesis(mutation);
  scripts.set(mutation, () => query('customer.charge', { amount: 100 }));
  ledgerBefore = ledgerCalls.length;
  readsBefore = store.readsOf(instanceDocKey(FR07_APP, mutation));
  const mutationReceipt = await sendFr07(mutation, mutation);
  assert.equal(mutationReceipt.status, 'terminated');
  assert.equal(mutationReceipt.terminal.code, 'MUTATION_CAPABILITY_FORBIDDEN');
  assert.equal(invocationsFor(mutation).length, 1);
  assert.equal(invocationsFor(mutation)[0]?.input.capabilities.includes('customer.charge'), false);
  assert.equal(store.readsOf(instanceDocKey(FR07_APP, mutation)) - readsBefore, 1);
  await assertNoAuthorityResidue(FR07_APP, mutation, ledgerBefore);
});

test('V08-FR07-N-F03: maxSteps exhaustion (incl. recovery turns) and authenticated cancellation during an active model turn / K read', async () => {
  // (a) maxSteps=1: turn #1 and its allowed read complete, no turn #2
  // (v0.7: model.requests.length === 1, queryExecutions === 1).
  const oneStep = 'n-f03-one-step';
  await fr07Genesis(oneStep);
  scripts.set(oneStep, (turn) => (turn.step === 1 ? query('catalog.lookup') : finalResponse()));
  let ledgerBefore = ledgerCalls.length;
  const readsBefore = store.readsOf(instanceDocKey(FR07_APP, oneStep));
  const exhausted = await sendFr07(oneStep, oneStep, {}, 'requestQuoteOneStep');
  assert.equal(exhausted.status, 'terminated');
  assert.equal(exhausted.terminal.code, 'MAX_STEPS_EXHAUSTED');
  assert.equal(invocationsFor(oneStep).length, 1, 'no second model call');
  assert.equal(store.readsOf(instanceDocKey(FR07_APP, oneStep)) - readsBefore, 2, 'the allowed read of turn #1 executed exactly once');
  assert.equal(exhausted.resolver.continuation.queries, 1);
  await assertNoAuthorityResidue(FR07_APP, oneStep, ledgerBefore);

  // (b) maxSteps=4 with a model that keeps "recovering" from ordinary read
  // failures: recovery turns consume the same absolute budget.
  const recovery = 'n-f03-recovery';
  await fr07Genesis(recovery);
  scripts.set(recovery, () => query('catalog.flakyRead'));
  ledgerBefore = ledgerCalls.length;
  const recoveryExhausted = await sendFr07(recovery, recovery);
  assert.equal(recoveryExhausted.status, 'terminated');
  assert.equal(recoveryExhausted.terminal.code, 'MAX_STEPS_EXHAUSTED');
  assert.equal(invocationsFor(recovery).length, 4, 'no hidden retries beyond the sealed maxSteps');
  assert.deepEqual(recoveryExhausted.resolver.modelCallEvidence, MEASURED(4));
  await assertNoAuthorityResidue(FR07_APP, recovery, ledgerBefore);

  // (c) Cancel during an ACTIVE model turn via the authenticated gateway:
  // the physical port observes the request-scoped abort (v0.7: aborted).
  const cancelModel = 'n-f03-cancel-model';
  await fr07Genesis(cancelModel);
  const entered = deferred();
  scripts.set(cancelModel, (_turn, signal, record) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      record.observedAbort = true;
      reject(new Error('aborted by the request-scoped signal'));
    }, { once: true });
    entered.resolve();
  }));
  ledgerBefore = ledgerCalls.length;
  const pendingModel = sendFr07(cancelModel, cancelModel);
  await entered.promise;
  // An unauthenticated or foreign principal cannot cancel it.
  await assert.rejects(gateway.cancel({ forged: true } as unknown as HostCredential, { target: target(FR07_APP, cancelModel), messageId: `m-${cancelModel}` }));
  assert.deepEqual(await gateway.cancel(fr07OtherRequesterC, { target: target(FR07_APP, cancelModel), messageId: `m-${cancelModel}` }), { status: 'not-in-flight' });
  assert.deepEqual(await gateway.cancel(fr07C.requester, { target: target(FR07_APP, cancelModel), messageId: `m-${cancelModel}` }), { status: 'cancel-requested' });
  const cancelledModel = await pendingModel;
  assert.equal(cancelledModel.status, 'terminated');
  assert.equal(cancelledModel.terminal.code, 'CANCELLED');
  assert.equal(cancelledModel.terminal.inFlightTurnDiscarded, true);
  assert.equal(invocationsFor(cancelModel).length, 1);
  assert.equal(invocationsFor(cancelModel)[0]?.observedAbort, true, 'the physical model invocation observed the cancellation');
  await assertNoAuthorityResidue(FR07_APP, cancelModel, ledgerBefore);

  // (d) Cancel during the ACTIVE K read (v0.7 "active query leaf"): the late
  // read is discarded, model turn #2 never happens, and the read never
  // becomes mutation authority.
  const cancelRead = 'n-f03-cancel-read';
  await fr07Genesis(cancelRead);
  scripts.set(cancelRead, (turn) => (turn.step === 1 ? query('catalog.lookup') : finalResponse()));
  const reached = deferred();
  const release = deferred();
  store.arm({ key: instanceDocKey(FR07_APP, cancelRead), onRead: 2, barrier: { reached: reached.resolve, release: release.promise } });
  ledgerBefore = ledgerCalls.length;
  const pendingRead = sendFr07(cancelRead, cancelRead);
  await reached.promise;
  assert.deepEqual(await gateway.cancel(fr07C.requester, { target: target(FR07_APP, cancelRead), messageId: `m-${cancelRead}` }), { status: 'cancel-requested' });
  release.resolve();
  const cancelledRead = await pendingRead;
  assert.equal(cancelledRead.status, 'terminated');
  assert.equal(cancelledRead.terminal.code, 'CANCELLED');
  assert.equal(cancelledRead.terminal.lateReadDiscarded, true);
  assert.equal(invocationsFor(cancelRead).length, 1, 'model turn #2 = 0');
  await assertNoAuthorityResidue(FR07_APP, cancelRead, ledgerBefore);
});

test('V08-FR07-N-F04: ordinary query failure ⇒ structured observation + bounded recovery admits; invalid query output ⇒ QUERY_OUTPUT_INVALID', async () => {
  // (a) Ordinary failure becomes an observation; a later bounded model turn
  // recovers and only then enters K admission (v0.7: requests.length 2).
  const recovers = 'n-f04-recovers';
  await fr07Genesis(recovers);
  scripts.set(recovers, (turn) => (turn.observations.length === 0 ? query('catalog.flakyRead') : finalResponse()));
  let ledgerBefore = ledgerCalls.length;
  const recovered = await sendFr07(recovers, recovers);
  assert.equal(recovered.status, 'admitted');
  const turns = invocationsFor(recovers);
  assert.equal(turns.length, 2);
  assert.deepEqual(turns[1]?.input.observations, [
    { step: 1, capabilityId: 'catalog.flakyRead', ok: false, error: { code: 'QUERY_SOURCE_MISSING' } },
  ]);
  assert.deepEqual(recovered.admitted.resolver.modelCallEvidence, MEASURED(2));
  assert.deepEqual(recovered.admitted.resolver.continuation.dependencies, [], 'a failed read attests no dependency');
  assert.equal(await stateOf(FR07_APP, fr07C.requester, recovers), 'quoted');
  assert.equal(ledgerCalls.length - ledgerBefore, 1);

  // (b) Read output violating its sealed output contract is terminal.
  const badSchema = 'n-f04-bad-schema';
  await fr07Genesis(badSchema);
  scripts.set(badSchema, (turn) => (turn.step === 1 ? query('catalog.badRead') : finalResponse()));
  ledgerBefore = ledgerCalls.length;
  const invalid = await sendFr07(badSchema, badSchema);
  assert.equal(invalid.status, 'terminated');
  assert.equal(invalid.terminal.code, 'QUERY_OUTPUT_INVALID');
  assert.equal(invalid.terminal.capabilityId, 'catalog.badRead');
  assert.equal(invocationsFor(badSchema).length, 1, 'no second model turn');
  await assertNoAuthorityResidue(FR07_APP, badSchema, ledgerBefore);

  // (c) Unversioned read material (v0.7: `{value: undefined}` must not become
  // an unversioned observation): the storage read loses its version.
  const unversioned = 'n-f04-unversioned';
  await fr07Genesis(unversioned);
  scripts.set(unversioned, (turn) => (turn.step === 1 ? query('catalog.lookup') : finalResponse()));
  store.arm({
    key: instanceDocKey(FR07_APP, unversioned),
    onRead: 2,
    tamper: (result) => {
      const value = { ...(result.value as Record<string, unknown>) };
      delete value.stateRevision;
      return { ...result, value };
    },
  });
  ledgerBefore = ledgerCalls.length;
  const unversionedReceipt = await sendFr07(unversioned, unversioned);
  assert.equal(unversionedReceipt.status, 'terminated');
  assert.equal(unversionedReceipt.terminal.code, 'QUERY_OUTPUT_INVALID');
  assert.equal(invocationsFor(unversioned).length, 1);
  await assertNoAuthorityResidue(FR07_APP, unversioned, ledgerBefore);
});
