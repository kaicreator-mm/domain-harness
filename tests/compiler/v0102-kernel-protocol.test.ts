/**
 * v0.10.2 T01k (#1321) — the K-owned additive read-only protocol of L2
 * section 2 (L2-A, O3): selected-K dynamic proof plus the negative tests
 * 1-4 of that section, as far as they are verifiable at THIS pin.
 * ===========================================================================
 *
 *   dynamic   the REAL selected kernel bytes (pinned blob) load through the
 *             ordinary module system and expose exactly the three additive
 *             read-only exports (kernelDocKeys, k02ScopePrefix,
 *             readEffectAuthorityView) next to the untouched original
 *             surface (createOccurrenceRuntime still satisfies the
 *             activation structural contract).
 *   neg 1     a K variant WITHOUT the three exports keeps the pre-T01k
 *             surface (the K-side half). The gate half — typed refusal with
 *             zero adapter dispatch and the marked attest — lands with T04,
 *             which wires the Host gate to this view; the skipped T04 test
 *             below is the reserved slot (L2 section 2 marks this file
 *             T01k+T04).
 *   neg 2     the port is get-only: `ExternalEffectDocsPort` declares only
 *             `get`, and neither the appended K block (sliced by its marker
 *             comment) nor the Host gate source contains a writer call.
 *   neg 3     no external mirror: the real K runtime runs in the legacy AND
 *             the K02 scoped wiring; every key K writes equals the
 *             kernelDocKeys(scope) builder output (the governance baseline
 *             pin family keeps its own root — existing K behavior), the
 *             k02ScopePrefix output equals the recorded vectors of the Host
 *             derivation (activation.ts:379-388 at the v0.10.2 pin), and
 *             readEffectAuthorityView accepts exactly the documents K wrote
 *             mid-flight and answers the matching refusal code for every
 *             tampered durable field.
 *   neg 4     additive-only: every byte above the T01k marker is the exact
 *             T01 payload (sha256 prefix proof — strictly stronger than
 *             `git diff --numstat` reporting 0 removed lines).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { InMemoryCasStore } from '../../packages/domain-harness/src/host-v8/index.js';
import { v10K02DocumentPrefix } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';

// ---------------------------------------------------------------------------
// The REAL selected kernel, imported by exact current bytes (the pin-test
// discipline: any drift of the payload fails before a single export is read).
// ---------------------------------------------------------------------------
const KERNEL_URL = new URL('../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url);
const KERNEL_SOURCE = readFileSync(KERNEL_URL, 'utf8');
function gitBlobId(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
const KERNEL_BLOB = gitBlobId(readFileSync(KERNEL_URL));
/** The T01k re-pin (L2 section 2: every pin updated in the same PR). */
const T01K_KERNEL_BLOB = '68b77d4711a802bc6a3f6f5e73cbc58e769af32f';
const T01K_KERNEL_SHA256 = 'e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7';
/** The immutable T01 payload this append started from (L2 section 2). */
const T01_KERNEL_BLOB = '72a886ffca85fc90caea954ee9fb5b3df7b4fcfa';
const T01_KERNEL_SHA256 = '66f19f8968cb58cc59808c9c15cfbb193618a150a61ac00a5b5797bec1250630';
// The selected K namespace loads by exact bytes (the pin-test discipline);
// root tests compile as CJS under tsx, so the dynamic import is awaited
// lazily inside each test instead of at the top level.
const kernelModule: Promise<Record<string, any>> = import(`data:text/javascript;base64,${Buffer.from(KERNEL_SOURCE, 'utf8').toString('base64')}`);
let kernelCache: Record<string, any> | null = null;
const loadKernel = async (): Promise<Record<string, any>> => {
  kernelCache ??= await kernelModule;
  return kernelCache;
};

const PROTOCOL_EXPORTS = ['kernelDocKeys', 'k02ScopePrefix', 'readEffectAuthorityView'] as const;
const MARKER_BEGIN = '// T01K_ADDITIVE_PROTOCOL_EXPORTS_BEGIN';
const MARKER_END = '// T01K_ADDITIVE_PROTOCOL_EXPORTS_END';
const GATE_PATH = new URL('../../packages/domain-harness-compiler/src/qualified-package/v10build/external-effect.ts', import.meta.url);

test('META: the selected kernel bytes are the re-pinned T01k payload', () => {
  assert.equal(KERNEL_BLOB, T01K_KERNEL_BLOB);
  assert.equal(createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex'), T01K_KERNEL_SHA256);
  assert.notEqual(KERNEL_BLOB, T01_KERNEL_BLOB, 'T01k changed K bytes on purpose (the additive append)');
});

test('dynamic selected-K proof: the three additive read-only protocol exports load with the original surface', async () => {
  const kernel = await loadKernel();
  for (const name of PROTOCOL_EXPORTS) {
    assert.equal(typeof kernel[name], 'function', `${name} is exported by the selected K module instance`);
  }
  // The untouched original contract (activation.ts:1118-1120 at this pin):
  // the structural K check requires exactly createOccurrenceRuntime and
  // PERMITS extra exports — which is why the append is safe.
  assert.equal(typeof kernel.createOccurrenceRuntime, 'function');
  assert.equal(kernel.MODULE_ID, 'v08-kernel-mechanism@1.0.0');
  assert.equal(kernel.ABI_VERSION, 'v08-kernel-abi/1');
  // The builders answer the two wirings the runtime itself chooses between.
  const legacy = kernel.kernelDocKeys(undefined);
  assert.equal(legacy.journalPrefix(), 'v08-kernel:effect-journal:');
  assert.equal(legacy.effectDispatchClaim('e1', 1), 'v08-kernel:effect-dispatch-claim:e1/attempt/1');
  const SCOPE = { deployedAppId: 'dep:t01k', tenantId: 'tenant:t01k', appId: 'app:t01k', businessPackageId: 'pkg:quote:t01k' };
  const scoped = kernel.kernelDocKeys(SCOPE);
  assert.equal(scoped.journalPrefix(), 'v010-k02:dep%3At01k:tenant%3At01k:app%3At01k:pkg%3Aquote%3At01k:effect-journal:');
  // An invalid scope refuses exactly like the scoped grammar itself.
  assert.throws(() => kernel.k02ScopePrefix({}), (error: unknown) => (error as { code?: string }).code === 'K02_SCOPE_INVALID');
});

test('negative 1 (K-side half): a K variant without the protocol exports keeps the pre-T01k surface', async () => {
  const kernel = await loadKernel();
  const variant: Record<string, unknown> = {};
  for (const name of Object.keys(kernel)) {
    if (!(PROTOCOL_EXPORTS as readonly string[]).includes(name)) variant[name] = kernel[name];
  }
  // The pre-T01k export surface: the activation structural kernel check
  // (createOccurrenceRuntime) still holds — a selected K without the
  // protocol is structurally admissible; what it cannot do is serve the
  // Host protocol consumers.
  assert.equal(typeof variant.createOccurrenceRuntime, 'function');
  for (const name of PROTOCOL_EXPORTS) {
    assert.equal(variant[name], undefined, `the variant genuinely lacks ${name}`);
  }
  assert.equal(Object.keys(variant).length, Object.keys(kernel).length - PROTOCOL_EXPORTS.length);
});

test('negative 2: the port is get-only — the appended K block and the Host gate contain no writer call', () => {
  const begin = KERNEL_SOURCE.indexOf(MARKER_BEGIN);
  const end = KERNEL_SOURCE.indexOf(MARKER_END);
  assert.ok(begin >= 0 && end > begin, 'the T01k marker comment delimits the appended block');
  const appended = KERNEL_SOURCE.slice(begin, end + MARKER_END.length);
  for (const forbidden of ['.put(', '.remove(', 'delete']) {
    assert.equal(appended.includes(forbidden), false, `the appended K block must not contain ${JSON.stringify(forbidden)}`);
  }
  const gate = readFileSync(GATE_PATH, 'utf8');
  for (const forbidden of ['.put(', '.remove(', 'delete']) {
    assert.equal(gate.includes(forbidden), false, `the Host gate source must not contain ${JSON.stringify(forbidden)}`);
  }
  // `ExternalEffectDocsPort` itself declares exactly one member: get.
  const portInterface = /export interface ExternalEffectDocsPort \{[^}]*\}/u.exec(gate);
  assert.ok(portInterface !== null, 'the gate declares the ExternalEffectDocsPort interface');
  assert.match(portInterface[0], /get\(/u);
  for (const forbidden of ['put(', 'remove(']) {
    assert.equal(portInterface[0].includes(forbidden), false);
  }
});

test('negative 4: additive-only — the T01 payload is the exact byte prefix of the appended file', () => {
  const marker = KERNEL_SOURCE.indexOf(MARKER_BEGIN);
  assert.ok(marker > 0);
  const prefix = KERNEL_SOURCE.slice(0, marker);
  assert.equal(
    createHash('sha256').update(prefix, 'utf8').digest('hex'),
    T01_KERNEL_SHA256,
    'every byte above the marker is the immutable T01 kernel payload',
  );
  // A byte-identical prefix is strictly stronger than `git diff --numstat`
  // reporting 0 removed lines against the T01 blob: no line was changed,
  // moved or removed anywhere in the pre-marker payload.
});

// ---------------------------------------------------------------------------
// A recording CAS store over the real host-v8 in-memory CAS dialect K's
// hostPorts.docs speaks (mustBeAbsent / mustMatchRevision conditions).
// ---------------------------------------------------------------------------
class RecordingCasStore {
  readonly #base = new InMemoryCasStore();
  readonly writtenKeys = new Set<string>();

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    return await this.#base.get(key);
  }

  async put(key: string, value: unknown, conditions: unknown): Promise<{ revision: number }> {
    const written = await this.#base.put(key, value, conditions as never);
    this.writtenKeys.add(key);
    return written;
  }

  async remove(key: string, conditions: unknown): Promise<void> {
    await this.#base.remove(key, conditions as never);
    this.writtenKeys.delete(key);
  }

  async list(prefix: string): Promise<readonly string[]> {
    return await this.#base.list(prefix);
  }

  /** A detached deep copy of the current documents (tamper-table input). */
  async snapshot(): Promise<Map<string, unknown>> {
    const snap = new Map<string, unknown>();
    for (const key of await this.#base.list('')) {
      const doc = await this.#base.get(key);
      snap.set(key, structuredClone(doc === null ? null : doc.value));
    }
    return snap;
  }
}

const NOW = '2026-10-24T00:00:00.000Z';
const WORKFLOW_ID = 'quote';
const TARGET = { workflowId: WORKFLOW_ID, instanceKey: 'instance:t01k-1' };
const RUN_SCOPE = { deployedAppId: 'deploy:t01k', tenantId: 'tenant:v0102-t01k', appId: 'app:v0102-t01k', businessPackageId: 'pkg:quote@1.0.0' };

/**
 * The REAL K runtime in ONE wiring (legacy or K02-scoped), over one external
 * effect binding whose trusted adapter call is HELD mid-flight: the kernel
 * has minted the live permit, begun the journal, claimed the fence and
 * grounded the dispatch claim, and the attest with the exact K-issued
 * address context is in the adapter's hands — the precise moment the Host
 * gate (T04) will re-read the authority chain through this view.
 */
async function runHeldEffect(options: { scope?: Record<string, string> }): Promise<{
  store: RecordingCasStore;
  attest: Record<string, any>;
  release: () => void;
  receipt: Promise<Record<string, any>>;
}> {
  const kernel = await loadKernel();
  const store = new RecordingCasStore();
  const storeAttest: { current: Record<string, any> | null } = { current: null };
  let signalAttest: () => void = () => {};
  const attestArrived = new Promise<void>((resolveSignal) => { signalAttest = resolveSignal; });
  let letGo: () => void = () => {};
  const letGoGate = new Promise<void>((resolveGate) => { letGo = resolveGate; });
  const resources = {
    call: async (resourceKey: string, operation: string, payload: unknown, attest?: unknown): Promise<unknown> => {
      assert.equal(resourceKey, 'extjob');
      assert.equal(operation, 'job.submit');
      storeAttest.current = attest as Record<string, any>;
      signalAttest();
      await letGoGate; // held mid-flight until the probe releases the turn
      return { submitted: true };
    },
  };
  const policy = {
    packageId: 'biz:quote-t01k@1.0.0',
    policyId: 'quote-t01k',
    domainId: 'sales',
    workflowDefinition: {
      workflowKey: WORKFLOW_ID,
      initialState: 'review',
      initialContext: {},
      guards: [],
      states: [
        {
          stateKey: 'review',
          transitions: [
            {
              transitionKey: 'approve',
              trigger: { kind: 'event', eventType: 'APPROVED' },
              targetState: 'approved',
              effectIntents: [{ effectType: 'effect:job', input: { requestId: 'R-T01K' }, idempotencyKey: 'job:R-T01K' }],
            },
          ],
        },
        { stateKey: 'approved', kind: 'final' },
      ],
    },
    decisionSchema: { isValid: (value: any) => typeof value?.event?.type === 'string' },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:approve': { ruleId: 'rule:approve', eventType: 'APPROVED', payloadFromInput: {} },
    },
    intentBindings: {
      approve: { trigger: { kind: 'event', eventType: 'APPROVED' }, ruleId: 'rule:approve', roles: ['approver'] },
    },
    effectBindings: {
      'effect:job': {
        semantics: 'non-idempotent',
        resource: { key: 'extjob', operation: 'job.submit' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        handler: async (args: any) => await args.resources.call('extjob', 'job.submit', { requestId: args.input.requestId }),
      },
    },
  };
  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:v0102-t01k', moduleSha256: createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex') },
    ...(options.scope === undefined ? {} : { deploymentScope: options.scope }),
    hostPorts: {
      docs: store,
      resources,
      sha256: { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint: {
      packageId: 'std:v0102-t01k',
      async interpret(declaration: { ruleId: string; eventType: string }) {
        return {
          source: 'harness-machine',
          structuredDecision: { decision: { outcome: 'decide', data: {} }, event: { type: declaration.eventType, payload: {} } },
          provenance: { ruleId: declaration.ruleId },
          llmAvoided: true,
          cacheDisposition: { read: 'disabled' },
          telemetry: [],
        };
      },
    },
    businessEndpoint: policy,
  });
  await runtime.openInstance({ target: TARGET, authorityClass: 'PRODUCTION' });
  const receipt = runtime.submitOccurrence({
    intentType: 'approve',
    messageId: 'msg:t01k-1',
    input: { requestId: 'R-T01K' },
    target: TARGET,
    caller: { role: 'approver', subject: 'u1', tenantId: RUN_SCOPE.tenantId, appId: RUN_SCOPE.appId },
  }) as Promise<Record<string, any>>;
  const deadline = Date.now() + 10_000;
  await Promise.race([attestArrived, new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('the external adapter call (and its kernel-minted attest) never arrived')), Math.max(1, deadline - Date.now()));
  })]);
  return { store, attest: storeAttest.current as Record<string, any>, release: () => { letGo(); }, receipt };
}

/** get(key) over a detached snapshot — the view's ONLY port. */
const getOver = (docs: Map<string, unknown>) => async (key: string): Promise<{ value: unknown; revision: number } | null> => {
  if (!docs.has(key)) return null;
  return { value: docs.get(key), revision: 0 };
};

test('negative 3 legacy wiring: every K-written key equals kernelDocKeys(undefined) output; the view accepts exactly what K wrote', { timeout: 30_000 }, async () => {
  const kernel = await loadKernel();
  const held = await runHeldEffect({ scope: undefined });
  const claim = held.attest.effectPermit as {
    effectId: string;
    durableControlTurnId: string;
    businessPackageId: string;
    attempt: number;
    keys: Record<string, string>;
  };
  assert.ok(typeof claim.effectId === 'string' && claim.effectId.length > 0, 'the kernel-minted attest carries the permit claim');
  const keys = kernel.kernelDocKeys(undefined);
  // Mid-flight the full durable authority chain holds: the view answers the
  // read-only authority projection over EXACTLY the documents K wrote.
  const live = await kernel.readEffectAuthorityView({
    get: (key: string) => held.store.get(key),
    attest: held.attest,
    capabilityKey: 'extjob',
    operationId: 'job.submit',
    nowIso: NOW,
  });
  assert.deepEqual(live, { ok: true, effectId: claim.effectId, durableControlTurnId: claim.durableControlTurnId, attempt: 1, awaitPolicy: 'phase' });
  assert.equal(claim.keys.permit, keys.effectPermit(claim.effectId), 'the attest carries the exact legacy permit address');
  assert.equal(claim.keys.journal, keys.journal(claim.effectId));
  assert.equal(claim.keys.fence, keys.admissionFence(TARGET));
  assert.equal(claim.keys.dispatchClaim, keys.effectDispatchClaim(claim.effectId, 1));

  // Let the turn settle, then the same docs answer CONSUMED (the settled
  // permit never dispatches again) — an honest end-state negative.
  held.release();
  const receipt = await held.receipt;
  assert.equal(receipt.status, 'admitted');
  const settled = await kernel.readEffectAuthorityView({
    get: (key: string) => held.store.get(key),
    attest: held.attest,
    capabilityKey: 'extjob',
    operationId: 'job.submit',
    nowIso: NOW,
  });
  assert.equal(settled.ok, false);
  assert.equal((settled as { code: string }).code, 'V10_EFFECT_PERMIT_CONSUMED');

  // Every key K wrote routes through the kernelDocKeys(undefined) builders
  // (the governance baseline pin family keeps its own historical root), and
  // every family of the run was physically written.
  const expected = new Set<string>([
    keys.instance(TARGET),
    keys.admissionFence(TARGET),
    keys.journal(claim.effectId),
    keys.turnDisposition(claim.durableControlTurnId),
    keys.decisionReceipt(claim.durableControlTurnId),
    keys.receiptArchive(claim.durableControlTurnId),
    keys.effectPermit(claim.effectId),
    keys.effectDispatchClaim(claim.effectId, 1),
  ]);
  assert.ok(keys.journalPrefix().length > 0 && claim.keys.journal.startsWith(keys.journalPrefix()), 'the journal list channel prefixes the journal family');
  // The governance pin families keep their own historical roots (outside the
  // doc-key builders; existing K behavior, unchanged by T01k).
  const pins: string[] = [];
  for (const key of held.store.writtenKeys) {
    if (key.startsWith('v08-kernel:governance-pin:') || key.startsWith('v08-kernel:baseline:')) {
      pins.push(key);
      continue;
    }
    assert.ok(expected.has(key), `K wrote ${JSON.stringify(key)} outside the kernelDocKeys(undefined) families`);
  }
  assert.ok(pins.length >= 1, 'the governance pin family keeps its own root');
  // Families a single admitted external-effect turn physically writes. The
  // decision-receipt family is observational-optional (policy-gated) and the
  // receipt-archive family writes at ring eviction — both belong to the
  // builder families but are legitimately absent in a one-turn run.
  const writtenRequired = [
    keys.instance(TARGET),
    keys.admissionFence(TARGET),
    keys.journal(claim.effectId),
    keys.turnDisposition(claim.durableControlTurnId),
    keys.effectPermit(claim.effectId),
    keys.effectDispatchClaim(claim.effectId, 1),
  ];
  for (const key of writtenRequired) {
    assert.ok(held.store.writtenKeys.has(key), `the family of ${JSON.stringify(key)} was physically written`);
  }
});

test('negative 3 K02 scoped wiring: every K-written key equals kernelDocKeys(scope) output; k02ScopePrefix equals the recorded vectors', { timeout: 30_000 }, async () => {
  const kernel = await loadKernel();
  const held = await runHeldEffect({ scope: RUN_SCOPE });
  const claim = held.attest.effectPermit as {
    effectId: string;
    durableControlTurnId: string;
    businessPackageId: string;
    keys: Record<string, string>;
  };
  const keys = kernel.kernelDocKeys(RUN_SCOPE);
  const live = await kernel.readEffectAuthorityView({
    get: (key: string) => held.store.get(key),
    attest: held.attest,
    capabilityKey: 'extjob',
    operationId: 'job.submit',
    nowIso: NOW,
  });
  assert.equal(live.ok, true, 'the scoped wiring answers the same read-only authority view');
  assert.equal(claim.keys.permit, keys.effectPermit(claim.effectId), 'the attest carries the exact scoped permit address');
  assert.equal(claim.keys.permit.startsWith(kernel.k02ScopePrefix(RUN_SCOPE)), true);

  held.release();
  const receipt = await held.receipt;
  assert.equal(receipt.status, 'admitted');

  const expected = new Set<string>([
    keys.instance(TARGET),
    keys.admissionFence(TARGET),
    keys.journal(claim.effectId),
    keys.turnDisposition(claim.durableControlTurnId),
    keys.decisionReceipt(claim.durableControlTurnId),
    keys.receiptArchive(claim.durableControlTurnId),
    keys.effectPermit(claim.effectId),
    keys.effectDispatchClaim(claim.effectId, 1),
  ]);
  const prefix = kernel.k02ScopePrefix(RUN_SCOPE);
  // The governance pin families keep their legacy roots even in scoped wiring
  // (outside the doc-key builders; existing K behavior, unchanged by T01k).
  const pins: string[] = [];
  for (const key of held.store.writtenKeys) {
    if (key.startsWith('v08-kernel:governance-pin:') || key.startsWith('v08-kernel:baseline:')) {
      pins.push(key);
      continue;
    }
    assert.ok(key.startsWith(prefix), `every scoped K key starts with k02ScopePrefix: ${JSON.stringify(key)}`);
    assert.ok(expected.has(key), `K wrote ${JSON.stringify(key)} outside the kernelDocKeys(scope) families`);
  }
  assert.ok(pins.length >= 1, 'the governance pin family keeps its legacy root in scoped wiring');
  const writtenRequired = [
    keys.instance(TARGET),
    keys.admissionFence(TARGET),
    keys.journal(claim.effectId),
    keys.turnDisposition(claim.durableControlTurnId),
    keys.effectPermit(claim.effectId),
    keys.effectDispatchClaim(claim.effectId, 1),
  ];
  for (const key of writtenRequired) {
    assert.ok(held.store.writtenKeys.has(key), `the scoped family of ${JSON.stringify(key)} was physically written`);
  }

  // The recorded vectors of the Host derivation at the v0.10.2 pin
  // (activation.ts:379-388) — byte-for-byte, separators escaped.
  const vectors: ReadonlyArray<readonly [Record<string, string>, string]> = [
    [{ deployedAppId: 'dep:loy', tenantId: 'tenant:x', appId: 'app:y', businessPackageId: 'pkg:quote@1' }, 'v010-k02:dep%3Aloy:tenant%3Ax:app%3Ay:pkg%3Aquote@1:'],
    [{ deployedAppId: 'a%b', tenantId: 't:1', appId: 'app:z', businessPackageId: 'pkg:colon:value' }, 'v010-k02:a%25b:t%3A1:app%3Az:pkg%3Acolon%3Avalue:'],
    [RUN_SCOPE, 'v010-k02:deploy%3At01k:tenant%3Av0102-t01k:app%3Av0102-t01k:pkg%3Aquote@1.0.0:'],
  ];
  for (const [scope, vector] of vectors) {
    assert.equal(kernel.k02ScopePrefix(scope), vector, 'the recorded K02 vector');
    assert.equal(v10K02DocumentPrefix(scope as never), vector, 'the Host derivation at HEAD answers the same vector');
  }
});

test('negative 3 tamper table: each tampered durable field answers its matching refusal code', { timeout: 30_000 }, async () => {
  const kernel = await loadKernel();
  const held = await runHeldEffect({ scope: undefined });
  const claim = held.attest.effectPermit as {
    effectId: string;
    durableControlTurnId: string;
    businessPackageId: string;
    keys: Record<string, string>;
  };
  const docs = await held.store.snapshot();
  const base = {
    get: getOver(docs),
    attest: held.attest,
    capabilityKey: 'extjob',
    operationId: 'job.submit',
    nowIso: NOW,
  };
  const view = async (overrides: Partial<typeof base> = {}) =>
    await kernel.readEffectAuthorityView({ ...base, ...overrides } as never) as { ok: boolean; code?: string; message?: string };
  // The untouched originals of every tampered document (restore after each case).
  const originalPermit = docs.get(claim.keys.permit);
  const originalJournal = docs.get(claim.keys.journal);
  const originalFence = docs.get(claim.keys.fence);
  const originalClaim = docs.get(claim.keys.dispatchClaim);
  const permit = () => docs.get(claim.keys.permit) as Record<string, any>;
  const journal = () => (docs.get(claim.keys.journal) as { record: Record<string, any> }).record;
  const fence = () => docs.get(claim.keys.fence) as Record<string, any>;
  const dispatchClaim = () => docs.get(claim.keys.dispatchClaim) as Record<string, any>;

  // The untouched mid-flight state is the one positive answer.
  assert.equal((await view()).ok, true);

  // No permit document at its kernel-issued address.
  docs.delete(claim.keys.permit);
  assert.equal((await view()).code, 'V10_EFFECT_PERMIT_UNKNOWN');
  docs.set(claim.keys.permit, originalPermit);

  // A settled (consumed) permit.
  docs.set(claim.keys.permit, { ...permit(), state: 'consumed' });
  assert.equal((await view()).code, 'V10_EFFECT_PERMIT_CONSUMED');
  docs.set(claim.keys.permit, originalPermit);

  // A foreign turn.
  docs.set(claim.keys.permit, { ...permit(), durableControlTurnId: 'turn:foreign' });
  assert.equal((await view()).code, 'V10_EFFECT_PERMIT_SCOPE');
  docs.set(claim.keys.permit, originalPermit);

  // A foreign business identity.
  docs.set(claim.keys.permit, { ...permit(), businessPackageId: 'business-foreign@1' });
  assert.equal((await view()).code, 'V10_EFFECT_PERMIT_SCOPE');
  docs.set(claim.keys.permit, originalPermit);

  // A foreign capability.
  assert.equal((await view({ capabilityKey: 'extnotify' })).code, 'V10_EFFECT_PERMIT_SCOPE');

  // An unauthorized operation.
  assert.equal((await view({ operationId: 'job.cancel' })).code, 'V10_EFFECT_PERMIT_SCOPE');

  // An expired permit.
  assert.equal((await view({ nowIso: '2030-01-01T00:00:00.000Z' })).code, 'V10_EFFECT_PERMIT_EXPIRED');

  // A journal record that is not an in-flight started record.
  docs.set(claim.keys.journal, { record: { ...journal(), status: 'completed' } });
  assert.equal((await view()).code, 'V10_EFFECT_PERMIT_JOURNAL');
  docs.set(claim.keys.journal, originalJournal);

  // An admission fence held by another turn.
  docs.set(claim.keys.fence, { ...fence(), turnId: 'turn:other' });
  assert.equal((await view()).code, 'V10_EFFECT_PERMIT_FENCE');
  docs.set(claim.keys.fence, originalFence);

  // A dispatch claim that does not match this effect/turn/attempt.
  docs.set(claim.keys.dispatchClaim, { ...dispatchClaim(), attempt: 2 });
  assert.equal((await view()).code, 'V10_EFFECT_DISPATCH_CLAIM_INVALID');
  docs.set(claim.keys.dispatchClaim, originalClaim);

  // A claim that carries no K-issued permit at all.
  assert.equal((await view({ attest: {} })).code, 'V10_EFFECT_PERMIT_REQUIRED');
  assert.equal((await view({
    attest: { effectPermit: { ...claim, keys: { ...claim.keys, fence: '' } } },
  })).code, 'V10_EFFECT_PERMIT_REQUIRED');

  // The refusal messages ride today's texts (the code strings of the gate).
  const refused = await view({ attest: {} });
  assert.match(refused.message ?? '', /dispatches only under a live K-issued effect permit/u);

  held.release();
  await held.receipt;
});

test('negative 1 (T04 slot): the gate refuses a without-exports K variant with zero adapter dispatch and a marked attest', { skip: 'T04 wires the Host gate to readEffectAuthorityView (L2 section 2); this refusal half lands in that task on this shared file' }, async () => {
  // Reserved: build the app over the without-exports variant of negative 1's
  // K-side test, dispatch an external effect and assert the typed refusal
  // (V10_EFFECT_PERMIT_REQUIRED), adapter dispatch count === 0 and the
  // preHandlerRefusal mark on the attest.
});
